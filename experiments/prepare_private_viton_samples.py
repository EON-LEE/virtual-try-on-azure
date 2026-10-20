"""Prepare an ignored VITON-HD sample handoff, never a public asset bundle."""

import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent
LOCAL = ROOT / "local"
SOURCE = LOCAL / "dataset-return"
OUTPUT = LOCAL / "viton-demo-handoff"
UPSTREAM = "https://github.com/shadow2496/VITON-HD"
LICENSE = "https://creativecommons.org/licenses/by-nc/4.0/"
ATTRIBUTION = (
    "Choi, Seunghwan; Park, Sunghyun; Lee, Minsoo; Choo, Jaegul. "
    "VITON-HD: High-Resolution Virtual Try-On via Misalignment-Aware "
    "Normalization. CVPR 2021. https://arxiv.org/abs/2103.16874"
)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def prepare():
    manifest = json.loads((SOURCE / "manifest.json").read_text(encoding="utf-8"))
    disposal = json.loads(
        (LOCAL / "disposal-2026-10-15.json").read_text(encoding="utf-8")
    )
    excluded = {entry["sha256"] for entry in disposal["files"]}
    selection = {
        "person": [0, 2, 5, 7, 9, 10],
        "upper": [0, 1, 2, 3, 4, 5, 7, 11],
    }
    planned = []
    for category, indices in selection.items():
        for index in indices:
            case = manifest["cases"][index]
            role = "person" if category == "person" else "garment"
            info = case[role]
            identifier = case["person_id" if role == "person" else "garment_id"]
            source = SOURCE / info["path"]
            actual = digest(source)
            if actual != info["sha256"]:
                raise ValueError(f"Input changed: {category} {identifier}")
            if actual in excluded or info["normalized_png_sha256"] in excluded:
                raise ValueError(f"Disposed image rejected: {category} {identifier}")
            with Image.open(source) as image:
                dimensions = {"width": image.width, "height": image.height}
                image.verify()
            filename = f"viton-{category}-{identifier}.jpg"
            planned.append(
                (
                    source,
                    {
                        "id": f"viton-{category}-{identifier}",
                        "category": category,
                        "label": f"VITON-HD {category} {identifier}",
                        "filename": filename,
                        "src": f"/api/samples/{filename}",
                        "source": UPSTREAM,
                        "sourceUrl": UPSTREAM,
                        "downloadUrl": info["source_url"],
                        "mirrorRevision": manifest["revision"],
                        "mirrorBytesVerifiedAgainstOfficialArchive": False,
                        "license": "CC BY-NC 4.0; research purposes only",
                        "licenseUrl": LICENSE,
                        "author": "VITON-HD dataset authors",
                        "attribution": ATTRIBUTION,
                        "changes": "None: exact retained source JPEG bytes copied.",
                        "dimensions": dimensions,
                        "sha256": actual,
                        "bytes": source.stat().st_size,
                        "supportsModes": ["upper"] if role == "person" else None,
                        "notes": case["pose"] if role == "person" else case["checks"],
                        "usageScope": "Noncommercial research demo only; no public bundle prepared.",
                        "rightsUncertainty": manifest["rights_uncertainty"],
                    },
                )
            )
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for source, item in planned:
        shutil.copyfile(source, OUTPUT / item["filename"])
        if digest(OUTPUT / item["filename"]) != item["sha256"]:
            raise ValueError(f"Copy verification failed: {item['id']}")
    result = {
        "schemaVersion": 1,
        "purpose": "Local private sample handoff; not public deployment authorization.",
        "sourceTerms": {
            "url": UPSTREAM,
            "datasetScopeQuote": "research purposes only",
            "licenseQuote": (
                "You can use, redistribute, and adapt the material for "
                "non-commercial purposes, as long as you give appropriate credit "
                "by citing our paper and indicate any changes that you've made."
            ),
            "licenseUrl": LICENSE,
            "notice": (
                "Login alone does not establish a noncommercial research purpose. "
                "Retain citation/license/change notices. No trademark endorsement "
                "or independently verified model releases claimed. Previous private "
                "inference approval is not authorization for unrestricted deployment."
            ),
        },
        "limitations": (
            "Upper-body reference dataset only; selected people are not full-body "
            "lower/full-mode inputs. No lower garments supplied. No inference performed."
        ),
        "disposalCheck": {
            "inventory": "disposal-2026-10-15.json",
            "excludedImageAndArtifactHashes": len(excluded),
            "selectedMatches": 0,
        },
        "items": [item for _, item in planned],
    }
    (OUTPUT / "manifest.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (OUTPUT / "disposed-hashes.json").write_text(
        json.dumps({"sha256": sorted(excluded)}, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Prepared {len(planned)} verified local images in {OUTPUT}")


if __name__ == "__main__":
    prepare()
