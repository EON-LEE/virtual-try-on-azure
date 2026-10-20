"""Acquire new pinned VITON-HD candidates for offline visual selection only."""

import concurrent.futures
import json
import argparse
from pathlib import Path
from urllib.request import urlopen

from PIL import Image, ImageDraw

import harness as h


REVISION = "fbec00f2f68cacbcdd7e1dee047405e7319226c6"
BASE = f"https://huggingface.co/datasets/TryOnVirtual/VITON-HD-TEST/resolve/{REVISION}"
FOLDER = h.ROOT / "local" / "dataset-return"


def get(path):
    with urlopen(f"{BASE}/{path}", timeout=60) as response:
        return response.read()


def main(extra_cloth=False):
    FOLDER.mkdir(parents=True, exist_ok=True)
    directory = "cloth" if extra_cloth else "openpose_json"
    url = f"https://huggingface.co/api/datasets/TryOnVirtual/VITON-HD-TEST/tree/{REVISION}/{directory}?limit=1000"
    files = json.load(urlopen(url, timeout=60))
    excluded = {"00006_00", "00151_00", "00287_00", "00311_00", "00075_00", "00611_00", "00683_00"}
    # Exclude every old original byte hash as well as known old dataset IDs.
    inventory = h.read_json(h.ROOT / "local" / "disposal-2026-10-15.json")
    old_hashes = {f["sha256"] for f in inventory["files"]}
    ids = [Path(f["path"]).stem.replace("_keypoints", "") for f in files
           if f["type"] == "file"]
    ids = ids if extra_cloth else ids[:180]
    ids = [i for i in ids if i not in excluded]

    def pose(identifier):
        data = json.loads(get(f"openpose_json/{identifier}_keypoints.json"))
        people = data.get("people", [])
        if not people:
            return None
        points = people[0].get("pose_keypoints_2d", [])
        if len(points) < 54:
            return None
        xy = [points[i:i + 3] for i in range(0, len(points), 3)]
        if any(xy[i][2] < .15 for i in (2, 4, 5, 7)):
            return None
        shoulder = abs(xy[2][0] - xy[5][0]) or 1
        crossed = (xy[4][0] - xy[7][0]) / shoulder
        raised = (max(xy[2][1], xy[5][1]) - min(xy[4][1], xy[7][1])) / shoulder
        return identifier, max(crossed, raised), crossed, raised

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        ranked = [] if extra_cloth else [r for r in pool.map(pose, ids) if r]
    ranked.sort(key=lambda r: r[1], reverse=True)
    chosen = [r[0] for r in ranked[:48]]
    if not extra_cloth:
        h.write_json(FOLDER / "pose-ranking.json", ranked)
    cloth_ids = [i for i in ids if i not in chosen][:96 if extra_cloth else 72]
    sources = [("image", i) for i in chosen] + [("cloth", i) for i in cloth_ids]

    def acquire(item):
        kind, identifier = item
        data = get(f"{kind}/{identifier}.jpg")
        if h.digest(data) in old_hashes:
            return None
        path = FOLDER / "candidates" / kind / f"{identifier}.jpg"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return kind, identifier

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        obtained = [r for r in pool.map(acquire, sources) if r]
    for kind in ("image", "cloth"):
        rows = [i for k, i in obtained if k == kind]
        for offset in range(0, len(rows), 24):
            subset = rows[offset:offset + 24]
            canvas = Image.new("RGB", (1200, ((len(subset) + 5) // 6) * 285), "white")
            draw = ImageDraw.Draw(canvas)
            for n, identifier in enumerate(subset):
                with Image.open(FOLDER / "candidates" / kind / f"{identifier}.jpg") as image:
                    image.thumbnail((195, 260))
                    x, y = (n % 6) * 200, (n // 6) * 285
                    canvas.paste(image, (x, y + 20))
                    draw.text((x + 4, y + 3), identifier, fill="black")
            canvas.save(FOLDER / f"{kind}-{'extra-' if extra_cloth else ''}sheet-{offset}.jpg")
    print(json.dumps({"persons": sum(k == "image" for k, _ in obtained),
                      "garments": sum(k == "cloth" for k, _ in obtained)}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--extra-cloth", action="store_true")
    main(parser.parse_args().extra_cloth)
