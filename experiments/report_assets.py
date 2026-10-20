"""Offline report assets: read once, verify pinned bytes, then encode previews."""

import base64
import hashlib
import io
import json
from pathlib import Path

from PIL import Image


def verified_bytes(path, expected_hash):
    data = Path(path).read_bytes()
    if hashlib.sha256(data).hexdigest() != expected_hash:
        raise ValueError("Report image hash mismatch with frozen input/result record.")
    return data


def image_uri(data, crop=None):
    with Image.open(io.BytesIO(data)) as original:
        mime = Image.MIME[original.format]
        if crop:
            region = original.crop(tuple(round(value * (original.width if index % 2 == 0 else original.height))
                                         for index, value in enumerate(crop)))
            buffer = io.BytesIO()
            region.save(buffer, format="PNG")
            data, mime = buffer.getvalue(), "image/png"
    return f"data:{mime};base64," + base64.b64encode(data).decode("ascii")


def result_records(runs):
    records, seen = [], set()
    for path in sorted(Path(runs).glob("*/result.json")):
        record = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(record, dict) or any(
                not isinstance(record.get(key), str) or not record[key].strip()
                for key in ("case_id", "model_id")):
            raise ValueError("Result requires a model/case identity; reconcile incomplete records before continuing.")
        key = (record["case_id"], record["model_id"])
        if key in seen:
            raise ValueError("Duplicate model/case result; select one exact batch.")
        seen.add(key)
        records.append(record | {"folder": str(path.parent)})
    return records
