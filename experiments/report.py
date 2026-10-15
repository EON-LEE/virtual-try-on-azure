"""Render the image-free restart report without reading historical image artifacts."""

import argparse
import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent


def generate(output, state_path=ROOT / "restart-state.json"):
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
            + html.escape(candidate["product"]) + '</a></td><td>'
            + html.escape(candidate["date_evidence"]) + '<br>'
            + html.escape(candidate["season"]) + '</td><td>'
            + html.escape(candidate["rights"]) + '</td></tr>')
    page = (
        '<!doctype html><html lang="ko"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; '
        'img-src \'none\'; connect-src \'none\'; style-src \'unsafe-inline\'">'
        '<title>Virtual try-on · 신규 시작</title><style>'
        'body{font:16px system-ui;margin:24px;max-width:1400px;color:#18212b}'
        'h1{font-size:24px}.notice{padding:20px;background:#edf1f6}'
        'table{border-collapse:collapse;width:100%}td,th{padding:12px;border:1px solid #ccd2d9;text-align:left}'
        'a{color:#1769aa}details{margin-top:16px}pre{white-space:pre-wrap}</style></head><body>'
        '<h1>새 사진으로 다시 시작합니다</h1>'
        '<div class="notice"><b>기존 이미지와 이미지 내장 보고서는 폐기했습니다.</b>'
        '<p>현재 입력 사진 0장 · 새 승인 호출 사용 0/24회 · 새 전송/추론 중지</p>'
        '<p>2026년 현재 시즌 한국 브랜드 상품사진과 완전히 새로운 실제 성인 인물사진을 준비합니다.'
        ' 기존 Met/VITON 인물·의상과 이전 생성 결과는 다시 표시하지 않습니다.</p></div>'
        '<h2>새 입력 준비 상태</h2>'
        '<p>브랜드 사진 사용권리, 상품별 시즌 근거, 새 인물사진이 아직 확보되지 않았습니다.'
        ' 아래는 공식 상품 링크 후보이며, 입력 확정·사진 사용권리 확인·진행 확인 전에는 전송하지 않습니다.</p>'
        '<table><thead><tr><th>브랜드/상품번호</th><th>공식 상품</th><th>시점 근거와 한계</th>'
        '<th>사진 사용조건</th></tr></thead><tbody>' + ''.join(rows) + '</tbody></table>'
        '<p><b>새 인물 사진: 미확보.</b> 동의한 성인의 새 팔 교차·팔 올림·몸통 앞 손·'
        '몸통 3/4·앉은 자세 사진이 필요합니다. 최근 업로드 날짜를 촬영 날짜로 사용하지 않습니다.</p>'
        '<details><summary>폐기·승인 상태</summary><p>'
        f'정확히 열거한 기존 파일 {state["disposal"]["removed_exact_files"]}개 폐기. '
        f'기존 JSON 기록 {state["disposal"]["preserved_preexisting_json_files"]}개 보존. '
        '과거 16회 호출은 이미 소진됐으며 폐기로 되돌려지지 않습니다.</p><pre>'
        + html.escape(json.dumps(state["conditions"], ensure_ascii=False, indent=2))
        + '</pre></details></body></html>')
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(page, encoding="utf-8")
    return {"output": str(output.resolve()), "images": 0,
            "new_attempts_consumed": state["new_approval_attempts_consumed"]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "local" / "report" / "index.html")
    args = parser.parse_args()
    print(json.dumps(generate(args.output), ensure_ascii=False))
