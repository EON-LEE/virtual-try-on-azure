"""Render existing local experiments and unexecuted candidates without network calls."""

import argparse
import base64
import hashlib
import html
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

import comparison


ROOT = Path(__file__).resolve().parent
STYLE = comparison.STYLE + """
header{position:sticky;top:0;z-index:5;background:white;padding:8px;border-bottom:1px solid #ccd2d9}
header p{margin:4px 0;font-size:13px} select{font:inherit;margin:4px;padding:5px}
thead th{top:95px}.info td{width:auto;padding:10px;background:#edf1f6}
.placeholder{height:650px;display:flex;align-items:center;justify-content:center;flex-direction:column;
background:#f4f5f6;padding:16px;box-sizing:border-box;gap:16px}
.placeholder p{max-width:370px}.status{font-weight:bold}.meta{font-size:13px}
details{margin:6px 0}pre{white-space:pre-wrap;font:13px system-ui;max-width:1800px}
a{color:#1769aa} [hidden]{display:none!important}
"""
SCRIPT = comparison.SCRIPT + """
document.querySelector("#filter").addEventListener("change",event=>{
 document.querySelectorAll("tbody").forEach(group=>{
  group.hidden=event.target.value!=="all"&&!group.dataset.tags.split(" ").includes(event.target.value);
 });
});
"""


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def image_cell(path, alt, caption=""):
    with Image.open(path) as image:
        mime = Image.MIME[image.format]
        dimensions = f"{image.width}×{image.height}"
    source = base64.b64encode(path.read_bytes()).decode("ascii")
    return (f'<td><div class="case">{html.escape(caption)} {dimensions}</div>'
            f'<img alt="{html.escape(alt, quote=True)}" '
            f'src="data:{mime};base64,{source}"></td>')


def empty_cell(message, link=None, product=None):
    content = f'<span class="status">{html.escape(message)}</span>'
    if product:
        content += f'<p>{html.escape(product)}</p>'
    if link:
        if not link.startswith("https://"):
            raise ValueError("Product links must be HTTPS.")
        content += f'<a href="{html.escape(link, quote=True)}" target="_blank" rel="noopener">공식 상품 보기</a>'
    return f'<td><div class="placeholder">{content}</div></td>'


def result_cell(record, folder, case_id, model):
    if record["status"] == "succeeded":
        path = folder / "output.png"
        if hashlib.sha256(path.read_bytes()).hexdigest() != record["output_sha256"]:
            raise ValueError("Stored output does not match its result hash.")
        return image_cell(path, f"{case_id} {model}",
                          f'{model} · {record["elapsed_seconds"]:.1f}s · 보존 통과 미입증')
    if record["status"] == "failed":
        label = {401: "401 권한 오류", 429: "429 호출 제한"}.get(
            record.get("http_status"), "생성 실패")
    elif record["status"] == "submitted":
        label = "완료 미확인 · 재시도 없음"
    else:
        raise ValueError("Unrecognized persisted result status.")
    return empty_cell(label)


def existing_cases(local):
    specs = [
        ("initial", local, "approved-smoke-config.json", "approved-smoke-runs"),
        ("second", local, "approved-smoke-config.json", "approved-second-smoke-runs"),
        ("viton", local / "viton-hd-approved-batch", "stripe-two-calls-config.json", "runs"),
        ("viton", local / "viton-hd-approved-batch", "additional-six-config.json", "runs"),
        ("hard", local / "viton-hd-hardcase-review", "hardcase-config.json", "runs"),
    ]
    batches = []
    for label, base, config_name, runs_name in specs:
        config = load(base / config_name)
        records = {}
        for path in sorted((base / runs_name).glob("*/result.json")):
            record = load(path)
            key = (record["case_id"], record["model_id"])
            if key in records:
                raise ValueError("Duplicate case/model result in batch.")
            records[key] = (record, path.parent)
        for case in config["cases"]:
            selected = {}
            for model in ("sunburst", "mai"):
                selected[model] = records[(case["id"], model)]
            batches.append((label, base, case, selected))
    return batches


def candidate_preview(local, cases, output):
    preview = Image.new("RGB", (1000, 700 * len(cases)), "white")
    draw = ImageDraw.Draw(preview)
    font = ImageFont.load_default(size=22)
    for row, case in enumerate(cases):
        y = row * 700
        with Image.open(local / case["person"]) as image:
            image = image.convert("RGB")
            image.thumbnail((480, 640), Image.Resampling.LANCZOS)
            preview.paste(image, ((500 - image.width) // 2, y + 50))
        draw.text((12, y + 12), case["person_id"], font=font, fill="black")
        draw.text((515, y + 30), case["brand"], font=font, fill="black")
        draw.text((515, y + 65), case["sku"], font=font, fill="black")
        draw.text((515, y + 150), "Garment photo: rights pending", font=font, fill="black")
        draw.text((515, y + 195), "NOT RUN - no Azure approval", font=font, fill="black")
        draw.rectangle((0, y, 999, y + 699), outline="#ccd2d9")
    preview.save(output, quality=94)


def generate(local, output, candidates_path):
    local, output = Path(local), Path(output)
    candidates = load(candidates_path)
    rows, attempts, successes, failures = [], 0, 0, 0
    notes = {
        "frontal-shirt": ("역사 사진 · 앉은 정면 · 손 일부 가림", "무늬 없는 셔츠 · 카라/밑단", "손 가림·재단 실패; 현대 사진 근거 아님"),
        "vitonhd-stripe": ("정면/약한 몸통 각도", "가로 줄무늬·노란 트림", "역사적 pilot pass 1개; 현 엄격 기준 통과를 뜻하지 않음"),
        "vitonhd-graphic-stripe": ("한 손 허리 · 약한 각도", "여러 색 밴드 원형 graphic", "MAI가 참조에 없는 BOSS 글자 생성"),
        "vitonhd-floral": ("정면 · 양팔 아래", "노란 꽃무늬·카라/플래킷", "두 모델 카라/플래킷 불일치"),
        "vitonhd-lettered-print": ("정면/약한 3/4 · 팔 아래", "HAPPY WEEKEND 글자·일러스트", "역사적 pilot pass 1개; 현 엄격 기준 미입증"),
        "hardcase-crossed-arms": ("양팔 교차 · 양손 겹침", "Champion 문자/소매 마크", "손/팔 geometry drift; 정확 로고 보존 미입증"),
        "hardcase-raised-arm-lace": ("올린 팔 · 손/머리 접촉", "레이스 반복·투명도·질감", "손/팔 세부와 레이스 반복 재생성"),
    }
    for label, base, case, records in existing_cases(local):
        case_id = case["id"]
        pose, garment, verdict = notes[case_id]
        tags = "executed " + ("crossed" if "crossed" in case_id else
                             "raised" if "raised" in case_id else "other")
        heading = f"{case_id} [{label}] · {pose} · {garment} · {verdict}"
        cells = [image_cell(base / case[role], f"{case_id} {role}") for role in ("person", "garment")]
        details = []
        for model in ("sunburst", "mai"):
            record, folder = records[model]
            if (record.get("attempts") != 1 or record.get("live_inference") is not True
                    or record.get("retries") != 0):
                raise ValueError("Report accepts only actual single live attempts.")
            attempts += 1
            successes += record["status"] == "succeeded"
            failures += record["status"] == "failed"
            cells.append(result_cell(record, folder, case_id, model))
            details.append({key: record.get(key) for key in
                            ("model_id", "status", "elapsed_seconds", "usage", "output_dimensions",
                             "http_status", "provider_error_code", "billed_cost")})
        meta = '<details><summary>측정값</summary><pre>' + html.escape(
            json.dumps(details, ensure_ascii=False, indent=2)) + '</pre></details>'
        rows.append(f'<tbody data-tags="{tags}"><tr class="info"><td colspan="4">'
                    f'<b>{html.escape(heading)}</b>{meta}</td></tr><tr>{"".join(cells)}</tr></tbody>')
    for case in candidates["cases"]:
        person = local / case["person"]
        if hashlib.sha256(person.read_bytes()).hexdigest() != case["person_sha256"]:
            raise ValueError("Candidate person hash mismatch.")
        heading = f'{case["id"]} · {case["brand"]} / {case["company"]} · {case["pose"]} · 미실행'
        info = (f'<p class="meta">{html.escape(case["checks"])}<br>'
                f'소재: {html.escape(case["material"])} · 로고: {html.escape(case["logo"])}</p>')
        rights = candidates["rights"][case["rights_key"]]
        info += '<details><summary>사진 권리·입력 출처</summary><pre>' + html.escape(
            json.dumps({"person_id": case["person_id"], "person_sha256": case["person_sha256"],
                        "person_rights": candidates["person_rights"], "garment_rights": rights,
                        "garment_photo": None, "status": case["status"]}, ensure_ascii=False, indent=2)) + '</pre></details>'
        cells = [image_cell(person, f'{case["id"]} 인물 후보'),
                 empty_cell("상품 사진 권리 확인 전", case["source_url"], case["product"]),
                 empty_cell("미실행 · 승인 전"), empty_cell("미실행 · 승인 전")]
        tag = ("crossed" if "crossed" in case["id"] else
               "raised" if "raised" in case["id"] else "front-hands")
        rows.append(f'<tbody data-tags="candidate {tag}"><tr class="info"><td colspan="4">'
                    f'<b>{html.escape(heading)}</b>{info}</td></tr><tr>{"".join(cells)}</tr></tbody>')
    if attempts != 16 or successes != 11 or failures != 5:
        raise ValueError("Persisted lifetime totals differ from the documented 16/11/5.")
    summary = (f'<header><b>Virtual try-on · 전체 비교</b><p>실제 호출 {attempts}회 · 이미지 '
               f'{successes}장 · 실패 {failures}회 · 재시도 0 · 엄격 보존 통과 입증 0'
               ' · 새 브랜드 후보 6조합 미실행</p><label>보기 <select id="filter">'
               '<option value="all">전체</option><option value="executed">실제 실험</option>'
               '<option value="candidate">새 브랜드 후보</option><option value="crossed">팔 교차</option>'
               '<option value="raised">팔 올림</option><option value="other">기타 포즈</option>'
               '<option value="front-hands">몸통 앞 손</option>'
               '</select></label> 사진 클릭/Enter로 확대 · 가로 스크롤</header>')
    detail_sections = []
    for name in ("hardcase-review.md", "viton-hd-batch-review.md", "second-smoke-review.md",
                 "next-case-research.md", "brand-candidate-review.md"):
        text = (ROOT / name).read_text(encoding="utf-8")
        detail_sections.append(f'<details><summary>{name}</summary><pre>{html.escape(text)}</pre></details>')
    header = ''.join(f'<th scope="col">{h}</th>' for h in ("Person", "Garment", "Sunburst", "MAI"))
    page = ('<!doctype html><html lang="ko"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; '
            'img-src data:; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; connect-src \'none\'">'
            f'<title>Virtual try-on report</title><style>{STYLE}</style></head><body>{summary}'
            f'<table><thead><tr>{header}</tr></thead>{"".join(rows)}</table>'
            + ''.join(detail_sections)
            + '<dialog aria-label="확대 이미지"><button id="close" type="button">닫기</button>'
            f'<img id="zoom" alt=""></dialog><script>{SCRIPT}</script></body></html>')
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(page, encoding="utf-8")
    candidate_preview(local, candidates["cases"], output.parent / "candidate-input-preview.jpg")
    return {"attempts": attempts, "outputs": successes, "failures": failures,
            "existing_case_rows": 8, "candidate_rows": len(candidates["cases"]),
            "output": str(output.resolve())}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--local", type=Path, default=ROOT / "local")
    parser.add_argument("--output", type=Path, default=ROOT / "local" / "report" / "index.html")
    parser.add_argument("--candidates", type=Path, default=ROOT / "brand-cases.json")
    args = parser.parse_args()
    print(json.dumps(generate(args.local, args.output, args.candidates), ensure_ascii=False))
