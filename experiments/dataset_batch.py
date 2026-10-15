"""Freeze and run the specifically approved replacement VTO dataset batch."""

import argparse
import base64
import html
import json
import os
import subprocess
import statistics
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import harness as h
from PIL import Image, ImageDraw


FOLDER = h.ROOT / "local" / "dataset-return"
SPEC = h.ROOT / "dataset-return-cases.json"
APPROVAL = FOLDER / "approval.json"
SUBSCRIPTION = "b0af194e-77a5-4471-bb43-67e78295b5c8"
TENANT = "2573db8c-dfe5-4805-9e28-a0859692e705"


def freeze():
    if APPROVAL.exists():
        raise h.ExperimentError("Frozen approval already exists; never overwrite consumed scope.")
    spec = h.read_json(SPEC)
    config = h.read_json(h.ROOT / "local" / "viton-hd-hardcase-review" / "hardcase-config.json")
    config["cases"] = []
    inventory = h.read_json(h.ROOT / "local" / "disposal-2026-10-15.json")
    old_hashes = {item["sha256"] for item in inventory["files"]}
    manifest = {**spec, "frozen_utc": datetime.now(timezone.utc).isoformat(), "cases": []}
    for case in spec["cases"]:
        entry = dict(case)
        for role, directory, field in (("person", "image", "person_id"), ("garment", "cloth", "garment_id")):
            relative = f"candidates/{directory}/{case[field]}.jpg"
            source = FOLDER / relative
            raw_hash = h.digest(source.read_bytes())
            normalized, dimensions = h.normalize_image(source)
            if raw_hash in old_hashes or h.digest(normalized) in old_hashes:
                raise h.ExperimentError("Previously disposed photo cannot enter the new batch.")
            entry[role] = {"path": relative, "sha256": raw_hash,
                           "normalized_png_sha256": h.digest(normalized), "dimensions": dimensions,
                           "source_url": f"https://huggingface.co/datasets/TryOnVirtual/VITON-HD-TEST/resolve/{spec['revision']}/{directory}/{case[field]}.jpg"}
        config["cases"].append({
            "id": case["id"], "person": entry["person"]["path"], "garment": entry["garment"]["path"],
            "rights_reviewed": True, "category": "upper-body", "tags": case["tags"]})
        manifest["cases"].append(entry)
    plan, _ = h.build_plan(config, FOLDER)
    approval = {
        "approved": True, "scope_sha256": plan["scope_sha256"],
        "approval_reference": spec["approval_reference"],
        "account_subscription_verified": True, "deployment_api_verified": True,
        "expires_utc": (datetime.now(timezone.utc) + timedelta(hours=12)).isoformat(),
        "max_requests": 24, "max_cost": None, "currency": "USD",
        "cost_mode": "explicit_unknown_cost", "unknown_cost_accepted": True,
        "cost_risk_acknowledgment": "User accepts unknown amount ceiling; no monetary cap guaranteed.",
        "request_limits": {f"{m['id']}:{c['id']}": 1 for c in config["cases"] for m in config["models"]},
        "lifetime_prior_attempts": 16, "lifetime_attempt_cap": 40,
        "minimum_model_interval_seconds": 90, "rights_use_scope": spec["use_scope"],
        "scope_change": "2026 current-season Korean brand restriction lifted; fresh VTO dataset IDs only. Same previously unused 24 attempts."}
    h.check_approval(approval, plan)
    for name, value in (("config.json", config), ("manifest.json", manifest), ("plan.json", plan)):
        h.write_json(FOLDER / name, value)
    h.write_json(APPROVAL, approval)
    state = h.read_json(h.ROOT / "restart-state.json")
    state.update(status="registered_dataset_return_scope", live_execution_allowed=True,
                 scope_change=approval["scope_change"],
                 registered_scope={"scope_sha256": plan["scope_sha256"],
                                   "approval_path": str(APPROVAL.relative_to(h.ROOT)),
                                   "approval_file_sha256": h.digest(APPROVAL.read_bytes()),
                                   "manifest_sha256": h.digest((FOLDER / "manifest.json").read_bytes())})
    h.write_json(h.ROOT / "restart-state.json", state)
    render()
    print("Frozen 12 new unpaired dataset cases; 24 maximum attempts.", flush=True)


def az(arguments):
    result = subprocess.run(
        ["wsl", "-d", "Ubuntu", "--", "az", *arguments, "--subscription", SUBSCRIPTION,
         "--only-show-errors", "-o", "json"], capture_output=True, text=True, timeout=90)
    if result.returncode:
        raise h.ExperimentError("Scoped Azure identity/token read failed; diagnostic output withheld.")
    return json.loads(result.stdout)


def fresh_token():
    account = az(["account", "show"])
    if account["id"] != SUBSCRIPTION or account["tenantId"] != TENANT or (
            account["user"]["name"].lower() != "admin@m365cpi74210306.onmicrosoft.com"):
        raise h.ExperimentError("Cached Azure identity changed; no login/default change attempted.")
    token = az(["account", "get-access-token", "--resource", "https://cognitiveservices.azure.com"])
    segment = token["accessToken"].split(".")[1]
    claims = json.loads(base64.urlsafe_b64decode(segment + "=" * (-len(segment) % 4)))
    if (claims["tid"] != TENANT or not claims.get("oid")
            or claims.get("aud", "").rstrip("/") != "https://cognitiveservices.azure.com"
            or claims.get("upn", claims.get("unique_name", "")).lower() != account["user"]["name"].lower()
            or claims["exp"] < time.time() + 120):
        raise h.ExperimentError("Fresh token identity/audience/expiry mismatch.")
    return token["accessToken"]


def records():
    return [h.read_json(p) | {"folder": str(p.parent)} for p in sorted((FOLDER / "runs").glob("*/result.json"))]


def sheets():
    manifest = h.read_json(FOLDER / "manifest.json")
    result_map = {(r["case_id"], r["model_id"]): r for r in records()}
    for case in manifest["cases"]:
        paths = [FOLDER / case[role]["path"] for role in ("person", "garment")]
        for model in ("sunburst", "mai"):
            result = result_map.get((case["id"], model))
            paths.append(Path(result["folder"]) / "output.png" if result and result["status"] == "succeeded" else None)
        if not any(paths[2:]):
            continue
        canvas = Image.new("RGB", (2000, 710), "white")
        draw = ImageDraw.Draw(canvas)
        for column, (label, path) in enumerate(zip(("Person", "Garment", "Sunburst", "MAI"), paths)):
            draw.text((column * 500 + 8, 5), label + " " + case["id"], fill="black")
            if path:
                with Image.open(path) as source:
                    image = source.convert("RGB")
                    image.thumbnail((496, 675))
                    canvas.paste(image, (column * 500 + (500 - image.width) // 2, 30))
        canvas.save(FOLDER / f"review-{case['id']}.jpg", quality=95)


def summarize():
    rows = []
    for record in records():
        usage = record.get("usage", {})
        text = usage.get("num_input_text_tokens") if record["model_id"] == "mai" else usage.get("input_tokens_details", {}).get("text_tokens")
        image = usage.get("num_input_image_tokens") if record["model_id"] == "mai" else usage.get("input_tokens_details", {}).get("image_tokens")
        output = usage.get("num_output_tokens") if record["model_id"] == "mai" else usage.get("output_tokens_details", {}).get("image_tokens")
        estimate = ((text * 5 + image * 8 + output * (38 if record["model_id"] == "mai" else 30)) / 1_000_000
                    if all(type(n) is int for n in (text, image, output)) else None)
        rows.append({k: record.get(k) for k in ("case_id", "model_id", "status", "attempts", "retries",
                                              "http_status", "elapsed_seconds", "output_sha256",
                                              "output_dimensions", "response_metadata", "provider_error_code")}
                    | {"text_input_tokens": text, "image_input_tokens": image,
                       "image_output_tokens": output, "conditional_usd_estimate": estimate,
                       "actual_billing": None})
        rows[-1]["http_status"] = record.get("http_status", record.get("response_metadata", {}).get("http_status"))
    summary = {"scope_sha256": h.read_json(FOLDER / "plan.json")["scope_sha256"],
               "frozen_inputs": [{"id": c["id"], "person_id": c["person_id"],
                                  "garment_id": c["garment_id"],
                                  "person": c["person"], "garment": c["garment"]}
                                 for c in h.read_json(FOLDER / "manifest.json")["cases"]],
               "attempts": sum(r["attempts"] for r in rows),
               "successful_outputs": sum(r["status"] == "succeeded" for r in rows),
               "failed_attempts": sum(r["status"] == "failed" for r in rows),
               "submitted_unresolved": sum(r["status"] == "submitted" for r in rows),
               "retries": sum(r["retries"] for r in rows),
               "conditional_usd_estimate_successful_usage_only": round(sum(
                   r["conditional_usd_estimate"] or 0 for r in rows), 6),
               "estimate_source": "Azure Retail Prices API rates verified 2026-10-14, azure-evidence.md. USD/1M text5/image-input8/Sunburst-output30/MAI-output38. Conditional list estimate, not invoice; failed-request costs unknown.",
               "actual_billing": None, "records": rows}
    summary["model_measurements"] = {}
    for model in ("sunburst", "mai"):
        group = [r for r in records() if r["model_id"] == model]
        durations = [r["elapsed_seconds"] for r in group if r.get("elapsed_seconds") is not None]
        starts = sorted(datetime.fromisoformat(r["started_utc"]) for r in group)
        summary["model_measurements"][model] = {
            "attempts": len(group), "latency_min_seconds": min(durations) if durations else None,
            "latency_median_seconds": statistics.median(durations) if durations else None,
            "latency_max_seconds": max(durations) if durations else None,
            "minimum_start_gap_seconds": min((b-a).total_seconds() for a,b in zip(starts,starts[1:])) if len(starts)>1 else None,
            "conditional_usd_estimate": round(sum(r["conditional_usd_estimate"] or 0 for r in rows if r["model_id"] == model),6)}
    quality_path = h.ROOT / "dataset-return-quality.json"
    if quality_path.exists():
        quality = h.read_json(quality_path)
        summary["strict_visual_review_counts"] = {
            verdict: sum(v["verdict"] == verdict for case in quality["reviews"].values() for v in case.values())
            for verdict in ("pass", "fail", "not_established")}
    h.write_json(FOLDER / "summary.json", summary)
    h.write_json(h.ROOT / "dataset-return-results.json", summary)
    print(json.dumps({k: v for k, v in summary.items() if k not in {"records", "frozen_inputs"}}, indent=2))


def close():
    ledger = h.read_json(APPROVAL.with_suffix(".ledger.json"))
    all_records = records()
    if (ledger["attempts"] != 24 or len(all_records) != 24
            or any(r["status"] not in {"succeeded", "failed"} or r.get("completion_uncertain") for r in all_records)
            or APPROVAL.with_suffix(".lock").exists()):
        raise h.ExperimentError("Cannot close until all approved attempts are reconciled.")
    expected = h.read_json(APPROVAL)["request_limits"]
    if ledger["request_counts"] != expected:
        raise h.ExperimentError("Exact model/case allocation does not reconcile.")
    quality = h.read_json(h.ROOT / "dataset-return-quality.json")["reviews"]
    manifest = h.read_json(FOLDER / "manifest.json")
    if set(quality) != {c["id"] for c in manifest["cases"]} or any(
            set(models) != {"sunburst", "mai"} for models in quality.values()):
        raise h.ExperimentError("Every exact case/model requires strict review before closeout.")
    state = h.read_json(h.ROOT / "restart-state.json")
    if h.digest((FOLDER / "manifest.json").read_bytes()) != state["registered_scope"]["manifest_sha256"]:
        raise h.ExperimentError("Frozen manifest changed.")
    state.update(status="dataset_return_completed_allocation_exhausted",
                 live_execution_allowed=False, new_approval_attempts_consumed=24,
                 inflight_requests=0, lifetime_attempts_consumed=40,
                 completed_utc=datetime.now(timezone.utc).isoformat())
    h.write_json(h.ROOT / "restart-state.json", state)
    summarize()
    render()


def run():
    config = h.read_json(FOLDER / "config.json")
    plan, inputs = h.build_plan(config, FOLDER)
    h.require_active_scope(plan["scope_sha256"], APPROVAL)
    if APPROVAL.with_suffix(".lock").exists():
        raise h.ExperimentError("Interrupted request lock exists; do not resume automatically.")
    prior = records()
    if any(r["status"] == "submitted" or r.get("completion_uncertain") for r in prior):
        raise h.ExperimentError("Unknown completion consumes its slot; reconcile before continuing.")
    ledger_path = APPROVAL.with_suffix(".ledger.json")
    if ledger_path.exists() and h.read_json(ledger_path)["attempts"] != sum(r["attempts"] for r in prior):
        raise h.ExperimentError("Ledger/result mismatch: reserved slots cannot be replayed.")
    consecutive_auth = 0
    for case in config["cases"]:
        for model in config["models"]:
            ledger = h.read_json(ledger_path) if ledger_path.exists() else {}
            key = f"{model['id']}:{case['id']}"
            if ledger.get("request_counts", {}).get(key, 0):
                continue
            wait_until = datetime.now(timezone.utc)
            last = ledger.get("last_started_utc_by_model", {}).get(model["id"])
            retry = ledger.get("retry_after_not_before_utc_by_model", {}).get(model["id"])
            if last:
                wait_until = max(wait_until, datetime.fromisoformat(last) + timedelta(seconds=91))
            if retry:
                wait_until = max(wait_until, datetime.fromisoformat(retry))
            time.sleep(max(0, (wait_until - datetime.now(timezone.utc)).total_seconds()))
            os.environ[model["api_key_env"]] = fresh_token()
            try:
                h.live(config, plan, inputs, APPROVAL, model["id"], case["id"], FOLDER / "runs")
            except h.ExperimentError:
                matches = [r for r in records() if r["case_id"] == case["id"] and r["model_id"] == model["id"]]
                if not matches or matches[-1]["attempts"] != 1:
                    raise
            finally:
                os.environ.pop(model["api_key_env"], None)
            record = [r for r in records() if r["case_id"] == case["id"] and r["model_id"] == model["id"]][-1]
            consecutive_auth = consecutive_auth + 1 if record.get("http_status") == 401 else 0
            render()
            print(case["id"], model["id"], record["status"], record.get("http_status", 200),
                  "attempts", h.read_json(ledger_path)["attempts"], flush=True)
            if record.get("completion_uncertain") or record["status"] == "submitted":
                raise h.ExperimentError("Uncertain completion consumes slot; stopping without retry.")
            if consecutive_auth >= 2:
                raise h.ExperimentError("Two consecutive 401 responses; stopping unused slots for diagnosis.")


def render():
    manifest = h.read_json(FOLDER / "manifest.json")
    results = {(r["case_id"], r["model_id"]): r for r in records()}
    review_path = h.ROOT / "dataset-return-quality.json"
    review_document = h.read_json(review_path) if review_path.exists() else {}
    reviews = review_document.get("reviews", {})
    corrections = review_document.get("case_check_corrections", {})
    if set(reviews) - {case["id"] for case in manifest["cases"]}:
        raise h.ExperimentError("Review contains a case outside the frozen dataset manifest.")
    for model_reviews in reviews.values():
        if set(model_reviews) - {"sunburst", "mai"}:
            raise h.ExperimentError("Review has an unexpected model/nested case.")

    def image(path, label, expected_hash):
        data = Path(path).read_bytes()
        if h.digest(data) != expected_hash:
            raise h.ExperimentError("Report image hash does not match frozen input/result record.")
        mime = "png" if data.startswith(b"\x89PNG") else "jpeg"
        return '<button class="zoom"><img alt="' + html.escape(label, quote=True) + '" src="data:image/' + mime + ';base64,' + base64.b64encode(data).decode() + '"></button>'

    rows = []
    for case in manifest["cases"]:
        cells = [image(FOLDER / case[role]["path"], case["id"] + " " + role,
                       case[role]["sha256"]) for role in ("person", "garment")]
        for model in ("sunburst", "mai"):
            result = results.get((case["id"], model))
            if result and result["status"] == "succeeded":
                cells.append(image(Path(result["folder"]) / "output.png", case["id"] + " " + model,
                                   result["output_sha256"])
                             + '<small>' + html.escape(reviews.get(case["id"], {}).get(model, {}).get(
                                 "display", "엄격 보존 평가 대기")) + '</small>')
            elif result and result["status"] == "submitted":
                cells.append("처리 중 · 재호출 없음")
            elif result:
                status = result.get("http_status")
                cells.append("401 권한 오류" if status == 401 else "429 호출 제한" if status == 429 else "생성 실패")
            else:
                cells.append("미실행")
        rows.append('<tbody data-tags="' + html.escape(" ".join(case["tags"]), quote=True) + '"><tr><td colspan="4"><b>'
                    + html.escape(case["id"]) + '</b> · ' + html.escape(case["pose"]) + '<br><small>'
                    + html.escape(corrections.get(case["id"], case["checks"])) + '</small></td></tr><tr>'
                    + ''.join('<td>' + cell + '</td>' for cell in cells) + '</tr></tbody>')
    used = sum(r["attempts"] for r in results.values())
    success = sum(r["status"] == "succeeded" for r in results.values())
    failed = sum(r["status"] == "failed" for r in results.values())
    pending = sum(r["status"] == "submitted" for r in results.values())
    verdict_counts = {v: sum(item["verdict"] == v for case in reviews.values() for item in case.values())
                      for v in ("pass", "fail", "not_established")}
    usage_summary = h.read_json(FOLDER / "summary.json") if (FOLDER / "summary.json").exists() else {}
    if usage_summary.get("attempts") != used:
        usage_summary = {}
    tags = sorted({tag for c in manifest["cases"] for tag in c["tags"]})
    page = ('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
            '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; connect-src \'none\'; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'">'
            '<title>새 VTO 데이터셋 비교</title><style>body{font:15px system-ui;margin:8px}table{border-collapse:collapse;table-layout:fixed;min-width:1600px;width:100%}'
            'td,th{border:1px solid #ccc;padding:6px;width:400px}th{position:sticky;top:0;background:white}'
            'img{height:600px;width:100%;object-fit:contain}.zoom{border:0;background:none;width:100%;cursor:zoom-in}'
            'small{font-size:12px}dialog{max-width:96vw;max-height:96vh}dialog img{height:auto;max-width:90vw;max-height:85vh}'
            '.scroll{overflow:auto}details{margin:16px 0}pre{white-space:pre-wrap}</style>'
            f'<h2>새 VTO 데이터셋 · {used}/24회 · 출력 {success}개 · 실패 {failed}회 · 처리 중 {pending}회</h2>'
            '<p>출력 생성 성공 ≠ 포즈·손·의상 세부 보존 통과. 새 조합만 표시 · 기존 이미지 복원 없음.</p>'
            f'<p>엄격 보존: 확인 통과 {verdict_counts["pass"]}개 · 명확한 실패 {verdict_counts["fail"]}개 · 미확정 {verdict_counts["not_established"]}개</p>'
            '<label>조건 <select id="filter"><option value="">전체</option>'
            + ''.join('<option>' + html.escape(t) + '</option>' for t in tags)
            + '</select></label><div class="scroll"><table><thead><tr><th>원본 인물</th><th>의상</th><th>Sunburst</th><th>MAI 2.6</th></tr></thead>'
            + ''.join(rows) + '</table></div><details><summary>출처·권리·평가 한계·사용량</summary><p>'
            + html.escape(manifest["attribution"] + " · " + manifest["license"] + " · " + manifest["use_scope"])
            + '</p><p><a href="https://github.com/shadow2496/VITON-HD" target="_blank" rel="noopener">VITON-HD 출처/원본 사용조건</a> · '
            '<a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noopener">CC BY-NC 4.0</a>'
            + '</p><p>' + html.escape(manifest["rights_uncertainty"] + " " + manifest["coverage_limit"])
            + '</p><p>모두 unpaired 별도 의상 조합; 정확한 착용 GT 없음. SSIM/LPIPS/FID 품질 증명 없음. 실청구 미확인.</p><pre>'
            + html.escape(json.dumps({k:v for k,v in usage_summary.items() if k in (
                "conditional_usd_estimate_successful_usage_only", "estimate_source", "actual_billing",
                "model_measurements")}, ensure_ascii=False, indent=2))
            + '</pre><p>단일 검토자의 비맹검 육안 평가. 정규화 랜드마크 이동량, OCR 문자 대조, 패턴 주기 수치 측정은 미실시. '
            '측면·앉은 자세와 정밀 규칙 체크는 미검증. 가려진 손·읽기 어려운 원본 문자는 N/A.</p>'
            '<p>학계 검증점: <a href="https://openaccess.thecvf.com/content/CVPR2021/papers/Choi_VITON-HD_High-Resolution_Virtual_Try-On_via_Misalignment-Aware_Normalization_CVPR_2021_paper.pdf" target="_blank" rel="noopener">'
            'VITON-HD §1/§4.3</a>의 정렬·질감 문제와 '
            '<a href="https://openaccess.thecvf.com/content/CVPR2024/papers/Yang_Texture-Preserving_Diffusion_Models_for_High-Fidelity_Virtual_Try-On_CVPR_2024_paper.pdf" target="_blank" rel="noopener">'
            'TPD §4.1/§4.3/§5</a>의 문자·로고 및 어려운 포즈의 손/팔 왜곡을 평가축으로 사용. '
            '이는 Azure 모델의 오류 원인·마스크 지원을 입증하는 근거가 아님.</p><pre>'
            + html.escape(json.dumps(reviews, ensure_ascii=False, indent=2))
            + '</pre><pre>'
            + html.escape(json.dumps([{k:v for k,v in r.items() if k in (
                "case_id","model_id","status","usage","elapsed_seconds","http_status","response_metadata","provider_error_code","completion_uncertain")} for r in results.values()],ensure_ascii=False,indent=2))
            + '</pre></details><dialog id="viewer"><button id="close">닫기</button><div id="full"></div></dialog><script>'
            'const viewer=document.querySelector("#viewer");document.querySelectorAll(".zoom").forEach(b=>b.onclick=()=>{'
            'document.querySelector("#full").replaceChildren(b.querySelector("img").cloneNode());viewer.showModal();});'
            'document.querySelector("#close").onclick=()=>viewer.close();viewer.onclick=e=>{if(e.target===viewer)viewer.close();};'
            'document.querySelector("#filter").onchange=e=>document.querySelectorAll("tbody").forEach(b=>b.hidden=!!e.target.value&&!b.dataset.tags.split(" ").includes(e.target.value));'
            '</script></html>')
    destination = h.ROOT / "local" / "report" / "index.html"
    destination.write_text(page, encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("freeze", "run", "render", "sheets", "summarize", "close"))
    action = parser.parse_args().command
    {"freeze": freeze, "run": run, "render": render, "sheets": sheets,
     "summarize": summarize, "close": close}[action]()
