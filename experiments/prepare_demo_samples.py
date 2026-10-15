"""Package reviewed, licensed photographs; never calls an inference endpoint."""

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageOps


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def prepare(review, output):
    candidates = json.loads((review / "candidates.json").read_text(encoding="utf-8"))
    more = json.loads((review / "more.json").read_text(encoding="utf-8"))
    shorts = json.loads((review / "shorts-source.json").read_text(encoding="utf-8"))
    thumbnails = json.loads(
        (review / "thumbnail-sources.json").read_text(encoding="utf-8")
    )["query"]["pages"]
    thumb_info = {
        page["title"]: page["imageinfo"][0] for page in thumbnails.values()
    }
    burst = "https://www.shopify.com/stock-photos/"
    burst_license = burst + "licenses/shopify-some-rights-reserved"
    cc0 = burst + "licenses/creative-commons"
    records = [
        dict(
            id="person-street", category="person", label="전신 · 거리 걷기",
            file="urban-fashion-modeled-on-the-street.jpg",
            author="Samantha Hurley", license="Burst Some Rights Reserved",
            licenseUrl=burst_license, supportsModes=["upper", "lower", "full"],
            notes="전신과 신발이 보임. 팔은 몸 옆, 보행 자세. 원경 배경 포함.",
        ),
        dict(
            id="person-tracks", category="person", label="전신 · 다리 교차",
            file="fashionable-man-walks-by-train-tracks.jpg",
            author="Brodie", license="CC0 1.0 (Burst terms also apply)",
            licenseUrl=cc0, supportsModes=["upper", "lower", "full"],
            notes="전신과 신발이 보임. 고개를 돌리고 손을 주머니에 넣은 자세.",
        ),
        dict(
            id="person-seated", category="person", label="상반신 · 앉아서 손 올리기",
            file="fashion-portrait.jpg",
            author="Shopify Photos", license="Burst Some Rights Reserved",
            licenseUrl=burst_license, supportsModes=["upper"],
            notes="관자놀이 옆 손과 몸통 앞 팔 가림. 무릎 아래와 신발은 프레임 밖.",
        ),
        dict(
            id="upper-solid", category="upper", label="무지 · 회색 티셔츠",
            file="grey-t-shirt.jpg",
            author="Shopify Partners", license="Burst Some Rights Reserved",
            licenseUrl=burst_license, notes="옷걸이에 걸린 전체 상의. 단색·목선·소매 비교.",
        ),
        dict(
            id="upper-ambigram", category="upper", label="문자 · 올리브 티셔츠",
            file="chosen-042.jpg", commons=candidates[42],
            notes="전체 상의와 IDEAL 앰비그램. 글자·위치·목선 비교.",
        ),
        dict(
            id="upper-polo", category="upper", label="카라 · 흰색 폴로",
            file="chosen-054.jpg", commons=candidates[54],
            notes="전체 상의. 카라·단추·소매 배색·작은 가슴 표식 비교.",
        ),
        dict(
            id="upper-stripe", category="upper", label="스트라이프 · 접힌 셔츠",
            file="more-033.jpg", commons=more[33],
            notes="접힌 상품 사진. 배색·줄무늬·카라·단추는 보이나 전체 소매와 기장은 미확인.",
        ),
        dict(
            id="lower-jeans", category="lower", label="데님 · 긴 청바지",
            file="chosen-004.jpg", commons=candidates[4],
            author="Oktaeder (German Wikipedia); transferred by Juanmak",
            licenseUrl="https://commons.wikimedia.org/wiki/Template:PD-user-w",
            declaration="File-page wikitext: {{PD-user-w|de|wikipedia|Oktaeder}}",
            notes="바닥에 놓인 전체 앞면. 데님 색·포켓·허리·바지통 비교. 원본 해상도가 낮음.",
        ),
        dict(
            id="lower-skirt", category="lower", label="배색 · 스웨트 스커트",
            file="more-025.jpg", commons=more[25],
            notes="스커트 앞에 묶은 소매가 일부를 가림. 빨간 테두리·KK 문자·단추 비교.",
        ),
        dict(
            id="lower-shorts", category="lower", label="문자·그림 · 데님 반바지",
            file="custom-shorts.jpg",
            commons=dict(
                title="File:Customised cut-off denim shorts with peace symbols and slogans, American, 1990s.jpg",
                info=shorts,
            ),
            notes="전체 앞면에 다색 문자·그림. 330px 공개 썸네일이므로 작은 문자/OCR 정밀 검증에는 부적합.",
        ),
    ]
    output.mkdir(parents=True, exist_ok=True)
    items = []
    for record in records:
        source_file = review / record["file"]
        item = {
            key: value for key, value in record.items()
            if key not in {"file", "commons", "declaration"}
        }
        if "commons" in record:
            info = record["commons"]["info"]
            ext = info["extmetadata"]
            item.update(
                source=info["descriptionurl"],
                sourceUrl=info["descriptionurl"],
                originalUrl=info["url"],
                downloadUrl=(
                    thumb_info[record["commons"]["title"]]["thumburl"]
                    if record["commons"]["title"] in thumb_info
                    else info["thumburl"] if record["id"] == "lower-shorts"
                    else info["url"]
                ),
                author=record.get("author", ext["Artist"]["value"]),
                license=ext["LicenseShortName"]["value"],
                licenseUrl=record.get(
                    "licenseUrl", ext.get("LicenseUrl", {}).get("value")
                ),
            )
            if record["id"] == "lower-jeans":
                item["licenseEvidence"] = record["declaration"]
        else:
            slug = Path(record["file"]).stem
            item.update(
                source=burst + "photos/" + slug,
                sourceUrl=burst + "photos/" + slug,
                downloadUrl=(
                    "https://burst.shopifycdn.com/photos/" + slug
                    + ".jpg?width=925&format=pjpg&exif=0&iptc=0"
                ),
                termsUrl=burst + "legal/terms",
            )
        destination = output / (item["id"] + ".jpg")
        with Image.open(source_file) as source:
            original_size = list(source.size)
            image = ImageOps.exif_transpose(source).convert("RGB")
            image.thumbnail((1280, 1280), Image.Resampling.LANCZOS)
            image.save(destination, quality=92, subsampling=0)
            dimensions = dict(width=image.width, height=image.height)
        item.update(
            src="/samples/" + destination.name,
            sourceDimensions=dict(zip(("width", "height"), original_size)),
            dimensions=dimensions,
            sourceSha256=sha256(source_file),
            sha256=sha256(destination),
            bytes=destination.stat().st_size,
            changes="EXIF orientation applied; max edge 1280px without upscaling; JPEG re-encoded; metadata removed. No crop or color correction.",
            attribution=f'{item["author"]} — {item["sourceUrl"]} — {item["license"]} ({item["licenseUrl"]}). Resized/re-encoded; metadata removed.',
            noticesUrl="/samples/NOTICES.txt",
            inferenceTested=False,
        )
        if item["category"] == "person":
            item["releaseEvidence"] = (
                "Adult stock-photo selection based on source description/category and visual review. "
                "Burst terms 5.5 require uploader permission for identifiable people; "
                "individual release/identity/age records not independently inspected. "
                "Neutral, fully clothed demo only; no endorsement or sensitive/harmful portrayal."
            )
        items.append(item)
    manifest = dict(
        schemaVersion=1,
        preparedAt=datetime.now(timezone.utc).isoformat(),
        purpose="Selectable real-photo demo inputs; not generated outputs or measured try-on quality evidence.",
        noticesUrl="/samples/NOTICES.txt",
        items=items,
    )
    (output / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--review-dir", required=True, type=Path)
    parser.add_argument("--output", default=Path("public") / "samples", type=Path)
    args = parser.parse_args()
    prepare(args.review_dir, args.output)
