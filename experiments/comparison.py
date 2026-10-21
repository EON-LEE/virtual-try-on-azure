"""Build a private, self-contained comparison grid from persisted run results."""

import argparse
import html
import io
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from report_assets import image_uri, result_records, verified_bytes


STYLE = """
body{font:15px system-ui,sans-serif;margin:8px;color:#18212b}
table{border-collapse:collapse;width:2040px;min-width:2040px;table-layout:fixed}
th,td{width:510px;border:1px solid #ccd2d9;padding:6px;vertical-align:top}
thead th{position:sticky;top:0;background:#edf1f6;z-index:2;text-align:left}
.case{font-size:12px;color:#526070;margin-bottom:4px}
td img{display:block;width:100%;height:650px;object-fit:contain;background:#f4f5f6;cursor:zoom-in}
td img:focus-visible{outline:3px solid #1769aa}
dialog{position:fixed;inset:0;width:100vw;height:100vh;max-width:none;max-height:none;
box-sizing:border-box;padding:58px 16px 14px;border:0;background:#080c12}
dialog::backdrop{background:#080c12}
dialog img{width:100%;height:100%;object-fit:contain}
dialog button{position:absolute;right:18px;top:12px;font:inherit;padding:8px 14px}
"""
SCRIPT = """
const dialog=document.querySelector("dialog"),zoom=document.querySelector("#zoom");
document.querySelectorAll("td img").forEach(image=>{
 image.tabIndex=0;image.setAttribute("role","button");
 image.addEventListener("click",()=>{zoom.src=image.src;zoom.alt=image.alt;dialog.showModal()});
 image.addEventListener("keydown",event=>{
  if(event.key==="Enter"||event.key===" "){event.preventDefault();image.click()}
 });
});
document.querySelector("#close").onclick=()=>dialog.close();
"""


def generate(root):
    root = Path(root)
    cases = json.loads((root / "selected-inputs.json").read_text(encoding="utf-8"))["cases"]
    results = {}
    for record in result_records(root / "runs"):
        key = (record["case_id"], record["model_id"])
        results[key] = (record, Path(record["folder"]))
    headers = ("Person", "Garment", "Sunburst", "MAI")
    sheet = Image.new("RGB", (2000, 54 + 700 * len(cases)), "white")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=20)
    for column, name in enumerate(headers):
        draw.text((column * 500 + 12, 15), name, font=font, fill="black")
    rows = []
    for row_index, (case_id, case) in enumerate(cases.items()):
        cells = []
        paths = [(root / case[role]["local_path"], "", None) for role in ("person", "garment")]
        for model in ("sunburst", "mai"):
            result = results.get((case_id, model))
            if result is None:
                paths.append((None, "결과 없음", None))
                continue
            record, folder = result
            if record["status"] != "succeeded":
                status = record.get("http_status")
                label = {401: "401 권한 오류", 429: "429 호출 제한"}.get(status, "생성 실패")
                paths.append((None, label, None))
                continue
            output = folder / "output.png"
            if not isinstance(record.get("output_sha256"), str):
                raise ValueError("Successful output requires its persisted hash.")
            paths.append((output, f'{record["elapsed_seconds"]:.1f}s', record["output_sha256"]))
        for column, (path, label, expected_hash) in enumerate(paths):
            x, y = column * 500, 54 + row_index * 700
            draw.rectangle((x, y, x + 499, y + 699), outline="#ccd2d9")
            draw.text((x + 12, y + 8), case_id, font=font, fill="black")
            caption = html.escape(case_id + (" / " + label if label else ""))
            alt = html.escape(f"{case_id}, {headers[column]}", quote=True)
            if path is None:
                cells.append(f'<td><div class="case">{caption}</div>{html.escape(label)}</td>')
                # The JPEG labels remain ASCII so the bundled default font is portable.
                draw.text((x + 12, y + 50), "No output", font=font, fill="black")
            else:
                data = verified_bytes(path, expected_hash) if expected_hash is not None else path.read_bytes()
                with Image.open(io.BytesIO(data)) as image:
                    preview = image.convert("RGB")
                    preview.thumbnail((484, 650), Image.Resampling.LANCZOS)
                sheet.paste(preview, (x + (500 - preview.width) // 2,
                                      y + 40 + (650 - preview.height) // 2))
                cells.append(f'<td><div class="case">{caption}</div>'
                             f'<img alt="{alt}" src="{image_uri(data)}"></td>')
        rows.append("<tr>" + "".join(cells) + "</tr>")
    page = ('<!doctype html><html lang="ko"><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>Try-on comparison</title><style>{STYLE}</style>'
            '<table><thead><tr>' + "".join(f'<th scope="col">{name}</th>' for name in headers)
            + '</tr></thead><tbody>' + "".join(rows) + '</tbody></table>'
            '<dialog aria-label="확대 이미지"><button id="close" type="button">닫기</button>'
            '<img id="zoom" alt=""></dialog>'
            f'<script>{SCRIPT}</script></html>')
    (root / "hardcase-grid.html").write_text(page, encoding="utf-8")
    sheet.save(root / "hardcase-grid.jpg", quality=94)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    generate(parser.parse_args().root)
