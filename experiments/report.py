"""Render only the restart state and explicitly reviewed new-source previews."""

import argparse
import html
import json
from pathlib import Path
from report_assets import image_uri, verified_bytes


ROOT = Path(__file__).resolve().parent


def generate(output, state_path=ROOT / "restart-state.json", asset_root=ROOT):
    state = json.loads(Path(state_path).read_text(encoding="utf-8"))
    if state["historical_images_disposed"] is not True or state["live_execution_allowed"] is not False:
        raise ValueError("Restart report requires explicit disposed-images and paused-execution state.")
    rows = []
    for candidate in state["new_source_candidates"]:
        if not candidate["url"].startswith("https://"):
            raise ValueError("Source links must be HTTPS.")
        rows.append(
            '<tr><td>' + html.escape(candidate["brand"]) + '<br>'
            + html.escape(candidate["sku"]) + '</td><td><a target="_blank" rel="noopener" href="'
            + html.escape(candidate["url"], quote=True) + '">'
            + html.escape(candidate["product"]) + '</a><br>'
            + html.escape(candidate["material_and_checks"]) + '</td><td>'
            + html.escape(candidate["date_evidence"]) + '<br>'
            + html.escape(candidate["season"]) + '</td><td>'
            + html.escape(candidate["rights"]) + '</td></tr>')
    people = []
    previews = []
    preview_root = (Path(asset_root) / "local" / "new-source-review").resolve()
    for candidate in state["person_source_candidates"]:
        if not candidate["url"].startswith("https://"):
            raise ValueError("Source links must be HTTPS.")
        people.append(
            '<tr><td><a target="_blank" rel="noopener" href="'
            + html.escape(candidate["url"], quote=True) + '">'
            + html.escape(candidate["title"]) + '</a><br>'
            + html.escape(candidate["pose_evidence"]) + '</td><td>'
            + html.escape(candidate["date_evidence"]) + '</td><td>'
            + html.escape(candidate["copyright"]) + '</td><td>'
            + html.escape(candidate["blocker"]) + '</td></tr>')
        if candidate.get("preview_path"):
            source = (Path(asset_root) / candidate["preview_path"]).resolve()
            if not source.is_relative_to(preview_root):
                raise ValueError("Preview must be under local/new-source-review.")
            if source.exists():
                data = verified_bytes(source, candidate["preview_sha256"])
                if not data.startswith(b"\x89PNG\r\n\x1a\n"):
                    raise ValueError("New-source preview must be PNG.")
                uri = image_uri(data)
                previews.append(
                    '<tr><td><button class="zoom" aria-label="새 출처 사진 확대"><img src="'
                    + uri + '" alt="' + html.escape(candidate["title"], quote=True)
                    + '"></button><small>' + html.escape(candidate["title"]) + ' · '
                    + html.escape(candidate["copyright"]) + '<br>'
                    + html.escape(candidate["preview_change_notice"]) + '<br>'
                    + html.escape(candidate["blocker"]) + '</small></td>'
                    '<td>사용권리 확인 전</td><td>미실행</td><td>미실행</td></tr>')
    grid = (
        '<h2>완전히 새로운 출처 사진 · 검토용, 실험 입력 미확정</h2>'
        '<p>출처별 저작자는 사진 아래에 표시했습니다. '
        '<a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">'
        'CC BY-SA 4.0 라이선스</a> · 브라우저 미리보기 크기 조정/스크린샷, AI 편집 없음. '
        '인물의 브랜드 지지·추천을 의미하지 않습니다.</p>'
        '<div class="grid"><table><thead><tr><th>새 인물 출처 검토</th><th>새 브랜드 의상</th>'
        '<th>Sunburst</th><th>MAI</th></tr></thead><tbody>' + ''.join(previews)
        + '</tbody></table></div>') if previews else ''
    page = (
        '<!doctype html><html lang="ko"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; '
        'img-src data:; connect-src \'none\'; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'">'
        '<title>Virtual try-on · 신규 시작</title><style>'
        'body{font:16px system-ui;margin:24px;max-width:1400px;color:#18212b}'
        'h1{font-size:24px}.notice{padding:20px;background:#edf1f6}'
        'table{border-collapse:collapse;width:100%}td,th{padding:12px;border:1px solid #ccd2d9;text-align:left}'
        'a{color:#1769aa}details{margin-top:16px}pre{white-space:pre-wrap}'
        '.grid{overflow-x:auto}.grid table{min-width:1600px;table-layout:fixed}'
        '.grid th,.grid td{width:400px}.grid img{height:600px;width:100%;object-fit:contain}'
        '.zoom{border:0;background:none;width:100%;cursor:zoom-in}small{display:block;font-size:12px}'
        'dialog{max-width:96vw;max-height:96vh}dialog img{max-width:90vw;max-height:85vh;object-fit:contain}'
        '</style></head><body>'
        '<h1>새 사진으로 다시 시작합니다</h1>'
        '<div class="notice"><b>기존 이미지와 이미지 내장 보고서는 폐기했습니다.</b>'
        '<p>확정 입력 사진 0장 · 새 승인 호출 사용 0/24회 · 새 전송/추론 중지</p>'
        '<p>2026년 현재 시즌 한국 브랜드 상품사진과 완전히 새로운 실제 성인 인물사진을 준비합니다.'
        ' 기존 Met/VITON 인물·의상과 이전 생성 결과는 다시 표시하지 않습니다.</p></div>'
        + grid + '<h2>새 입력 준비 상태</h2>'
        '<p>상품별 2026 시즌·제조 근거를 확인했습니다. 브랜드 사진 사용권리와 새 인물사진은 아직 확보되지 않았습니다.'
        ' 아래는 공식 상품 링크 후보이며, 입력 확정·사진 사용권리 확인·진행 확인 전에는 전송하지 않습니다.</p>'
        '<table><thead><tr><th>브랜드/상품번호</th><th>공식 상품</th><th>시점 근거와 한계</th>'
        '<th>사진 사용조건</th></tr></thead><tbody>' + ''.join(rows) + '</tbody></table>'
        '<p><b>사용권리 검토 완료된 새 인물 입력: 미확보.</b> 동의한 성인의 새 팔 교차·팔 올림·몸통 앞 손·'
        '몸통 3/4·앉은 자세 사진이 필요합니다. 최근 업로드 날짜를 촬영 날짜로 사용하지 않습니다.</p>'
        '<details><summary>새 인물사진 원문 후보와 사용 전 확인사항</summary>'
        '<p>새 출처 사진은 브라우저 미리보기로만 검토했습니다. 원본 입력 다운로드·Azure 전송은 없습니다. '
        '저작권 편집 허용과 인물 동의는 별개입니다. 실제 포즈와 검증 한계는 아래에 구분했습니다.</p>'
        '<table><thead><tr><th>원문·포즈 설명</th><th>촬영일 근거</th><th>저작권</th>'
        '<th>제외/보류 이유</th></tr></thead><tbody>' + ''.join(people)
        + '</tbody></table></details>'
        '<details><summary>폐기·승인 상태</summary><p>'
        f'정확히 열거한 기존 파일 {state["disposal"]["removed_exact_files"]}개 폐기. '
        f'기존 JSON 기록 {state["disposal"]["preserved_preexisting_json_files"]}개 보존. '
        '과거 16회 호출은 이미 소진됐으며 폐기로 되돌려지지 않습니다.</p><pre>'
        + html.escape(json.dumps(state["conditions"], ensure_ascii=False, indent=2))
        + '</pre></details><dialog id="viewer"><button id="close">닫기</button>'
        '<div id="full"></div></dialog><script>'
        'const viewer=document.querySelector("#viewer");'
        'document.querySelectorAll(".zoom").forEach(button=>button.addEventListener("click",()=>{'
        'document.querySelector("#full").replaceChildren(button.querySelector("img").cloneNode());'
        'viewer.showModal();}));document.querySelector("#close").onclick=()=>viewer.close();'
        'viewer.addEventListener("click",event=>{if(event.target===viewer)viewer.close();});'
        '</script></body></html>')
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(page, encoding="utf-8")
    return {"output": str(output.resolve()), "images": len(previews),
            "new_attempts_consumed": state["new_approval_attempts_consumed"]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "local" / "report" / "index.html")
    args = parser.parse_args()
    state = json.loads((ROOT / "restart-state.json").read_text(encoding="utf-8"))
    if state.get("registered_scope"):
        from dataset_batch import render
        if args.output.resolve() != (ROOT / "local" / "report" / "index.html").resolve():
            raise ValueError("Registered dataset report uses its fixed private output path.")
        render()
        print("Updated registered dataset report.")
    else:
        print(json.dumps(generate(args.output), ensure_ascii=False))
