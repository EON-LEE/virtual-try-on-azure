"""Offline-first, explicitly approved Azure image-edit experiment runner."""

import argparse
import base64
import hashlib
import io
import json
import os
import re
import time
import uuid
import warnings
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from urllib import error, parse, request

from PIL import Image, ImageCms, ImageOps

ROOT = Path(__file__).resolve().parent
PROMPT = (ROOT / "prompt.txt").read_text(encoding="utf-8").strip()
MAX_IMAGE_BYTES = 20 * 1024 * 1024
MAX_RESPONSE_BYTES = 80 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 25_000_000
warnings.simplefilter("error", Image.DecompressionBombWarning)
SAFE_ID = re.compile(r"[a-z0-9][a-z0-9-]{0,63}\Z")


class ExperimentError(Exception):
    pass


def digest(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path, value):
    path = Path(path)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def safe_id(value):
    if not isinstance(value, str) or not SAFE_ID.fullmatch(value):
        raise ExperimentError("Identifiers must be short lowercase slugs.")
    return value


def normalize_image(path):
    path = Path(path)
    if path.stat().st_size > MAX_IMAGE_BYTES:
        raise ExperimentError("Input image exceeds the local 20 MiB limit.")
    with Image.open(path) as original:
        if original.format not in {"PNG", "JPEG"}:
            raise ExperimentError("Only JPEG and PNG inputs are allowed.")
        if getattr(original, "n_frames", 1) != 1:
            raise ExperimentError("Animated inputs are not allowed.")
        if original.width * original.height > Image.MAX_IMAGE_PIXELS:
            raise ExperimentError("Input pixel count exceeds the local limit.")
        oriented = ImageOps.exif_transpose(original)
        mode = "RGBA" if "A" in oriented.getbands() or "transparency" in oriented.info else "RGB"
        pixels = oriented.convert(mode)
        if original.info.get("icc_profile"):
            try:
                pixels = ImageCms.profileToProfile(
                    pixels, ImageCms.ImageCmsProfile(io.BytesIO(original.info["icc_profile"])),
                    ImageCms.createProfile("sRGB"), outputMode=mode)
            except ImageCms.PyCMSError as exc:
                raise ExperimentError("Input color profile cannot be converted to sRGB.") from exc
        # New pixel-only image drops EXIF, comments, thumbnails, and text chunks.
        clean = Image.new(mode, oriented.size)
        clean.paste(pixels)
        output = io.BytesIO()
        clean.save(output, format="PNG")
        data = output.getvalue()
        if len(data) > MAX_IMAGE_BYTES:
            raise ExperimentError("Normalized input exceeds the local 20 MiB limit.")
        return data, list(clean.size)


def endpoint_url(model):
    endpoint = model["endpoint"]
    parsed = parse.urlsplit(endpoint)
    suffix = ".openai.azure.com" if model["family"] == "gpt" else ".services.ai.azure.com"
    if (parsed.scheme != "https" or not parsed.hostname
            or not re.fullmatch(r"[a-z0-9-]+" + re.escape(suffix), parsed.hostname)
            or parsed.port not in {None, 443}
            or parsed.username or parsed.password or parsed.query or parsed.fragment
            or parsed.path not in {"", "/"}):
        raise ExperimentError("Endpoint must be a public Azure resource HTTPS origin.")
    deployment = model["deployment"]
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", deployment):
        raise ExperimentError("Invalid deployment name.")
    if model["family"] == "gpt":
        version = model["api_version"]
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}(?:-preview)?", version):
            raise ExperimentError("Explicit dated GPT API version required.")
        return endpoint.rstrip("/") + (
            f"/openai/deployments/{deployment}/images/edits?api-version={version}")
    return endpoint.rstrip("/") + "/mai/v1/images/edits"


def validate_config(config):
    if set(config) - {"schema_version", "track", "models", "cases"}:
        raise ExperimentError("Unknown configuration fields; no user-supplied prompts allowed.")
    if config.get("schema_version") != 1 or config.get("track") not in {"baseline", "optimized"}:
        raise ExperimentError("Schema 1 and explicit baseline/optimized track required.")
    if not config.get("models") or not config.get("cases"):
        raise ExperimentError("At least one model and case required.")
    for collection in ("models", "cases"):
        ids = [safe_id(item["id"]) for item in config[collection]]
        if len(ids) != len(set(ids)):
            raise ExperimentError("Duplicate identifiers.")
    for model in config["models"]:
        if set(model) - {"id", "family", "catalog_model", "model_version", "deployment",
                         "endpoint", "api_version", "api_key_env", "options", "option_evidence"}:
            raise ExperimentError("Unknown model fields; credentials belong only in the environment.")
        if model["family"] not in {"gpt", "mai"}:
            raise ExperimentError("Only GPT Sunburst and MAI Azure adapters allowed.")
        if model["family"] == "gpt" and model["catalog_model"] != "gpt-image-2.5-sunburst":
            raise ExperimentError("GPT comparison requires the selected Sunburst model.")
        if model["family"] == "mai" and model["catalog_model"] != "MAI-Image-2.6":
            raise ExperimentError("MAI comparison requires the selected MAI-Image-2.6 basic variant.")
        if not model.get("model_version") or not model.get("api_key_env"):
            raise ExperimentError("Model version and explicit credential environment required.")
        endpoint_url(model)
        options = model.get("options", {})
        if config["track"] == "baseline" and options:
            raise ExperimentError("Baseline sends no model-specific options.")
        allowed = {"size", "quality"} if model["family"] == "gpt" else {"auto_aspect_ratio"}
        if not isinstance(options, dict) or set(options) - allowed:
            raise ExperimentError("Unverified options, masks, or fidelity are not allowed.")
        if options and not model.get("option_evidence"):
            raise ExperimentError("Optimized options require exact-model documentation evidence.")
        if "auto_aspect_ratio" in options and type(options["auto_aspect_ratio"]) is not bool:
            raise ExperimentError("MAI auto_aspect_ratio must be an explicit boolean.")
        if "quality" in options and options["quality"] not in {
                "low", "medium", "high", "xhigh", "max", "auto"}:
            raise ExperimentError("Unsupported Sunburst quality.")
        if "size" in options:
            match = re.fullmatch(r"(\d+)x(\d+)", options["size"])
            if not match:
                raise ExperimentError("Size must be WIDTHxHEIGHT.")
            w, h = map(int, match.groups())
            if (not w or not h or w % 16 or h % 16 or max(w, h) > 3840
                    or not 655360 <= w * h <= 8294400 or max(w, h) / min(w, h) > 3):
                raise ExperimentError("Size is outside documented Sunburst constraints.")
    for case in config["cases"]:
        if set(case) - {"id", "person", "garment", "rights_reviewed", "category", "tags"}:
            raise ExperimentError("Unknown case fields.")
        if case.get("category") != "upper-body" or not isinstance(case.get("tags"), list):
            raise ExperimentError("This prompt supports upper-body cases with explicit tags only.")


def build_plan(config, base):
    validate_config(config)
    inputs = {}
    cases = []
    for case in config["cases"]:
        images = []
        for role in ("person", "garment"):
            data, dimensions = normalize_image(base / case[role])
            inputs[(case["id"], role)] = data
            images.append({"role": role, "sha256": digest(data), "dimensions": dimensions})
        cases.append({"id": case["id"], "images": images, "tags": case["tags"],
                      "category": case["category"],
                      "rights_reviewed": case.get("rights_reviewed") is True})
    scope = {"schema_version": 1, "track": config["track"],
             "prompt_version": "upper-body-v1", "prompt_sha256": digest(PROMPT.encode()),
             "models": config["models"], "cases": cases}
    return {"scope_sha256": digest(canonical(scope)), "scope": scope,
            "live_inference": False, "quality_conclusion": "not evaluated"}, inputs


def multipart(model, person, garment):
    boundary = "tryon-" + uuid.uuid4().hex
    fields = {"model": model["deployment"], "prompt": PROMPT}
    if model["family"] == "gpt":
        fields["n"] = "1"
    else:
        fields["web_grounding"] = "false"
    fields.update(model.get("options", {}))
    chunks = []
    for key, value in fields.items():
        if type(value) is bool:
            value = str(value).lower()
        chunks.append((f"--{boundary}\r\nContent-Disposition: form-data; "
                       f'name="{key}"\r\n\r\n{value}\r\n').encode())
    field = "image[]" if model["family"] == "gpt" else "image"
    for role, data in (("person", person), ("garment", garment)):
        chunks.append((f"--{boundary}\r\nContent-Disposition: form-data; "
                       f'name="{field}"; filename="{role}.png"\r\n'
                       "Content-Type: image/png\r\n\r\n").encode() + data + b"\r\n")
    chunks.append(f"--{boundary}--\r\n".encode())
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch(url, data=None, headers=None, limit=MAX_RESPONSE_BYTES, response_metadata=None):
    opener = request.build_opener(NoRedirect())
    with opener.open(request.Request(url, data=data, headers=headers or {}), timeout=180) as response:
        if response_metadata is not None:
            response_metadata["http_status"] = response.status
            for header in ("x-request-id", "apim-request-id", "x-ms-request-id"):
                value = response.headers.get(header)
                if value and re.fullmatch(r"[A-Za-z0-9._-]{1,256}", value):
                    response_metadata[header] = value
        payload = response.read(limit + 1)
        if len(payload) > limit:
            raise ExperimentError("Response exceeded the local size limit.")
        return payload


def positive_decimal(value):
    try:
        number = Decimal(str(value))
    except InvalidOperation as exc:
        raise ExperimentError("A finite positive cost bound is required.") from exc
    if not number.is_finite() or number <= 0:
        raise ExperimentError("A finite positive cost bound is required.")
    return number


def check_approval(approval, plan):
    if (approval.get("approved") is not True
            or approval.get("account_subscription_verified") is not True
            or approval.get("deployment_api_verified") is not True
            or not approval.get("approval_reference")
            or approval.get("scope_sha256") != plan["scope_sha256"]):
        raise ExperimentError("Explicit user approval and verified exact deployment scope required.")
    expires = datetime.fromisoformat(approval["expires_utc"].replace("Z", "+00:00"))
    if expires.tzinfo is None or expires <= datetime.now(timezone.utc):
        raise ExperimentError("Approval has expired or lacks a time zone.")
    count = approval["max_requests"]
    if type(count) is not int or count <= 0:
        raise ExperimentError("Approval must cap request count.")
    positive_decimal(approval["max_cost"])
    if not re.fullmatch(r"[A-Z]{3}", approval["currency"]):
        raise ExperimentError("Currency must be an explicit three-letter code.")
    for case in plan["scope"]["cases"]:
        if not case["rights_reviewed"]:
            raise ExperimentError("Every case requires copyright and person-use review.")
    for model in plan["scope"]["models"]:
        if any("REQUIRES" in str(v) or "REPLACE" in str(v) for v in model.values()):
            raise ExperimentError("Deployment metadata still contains placeholders.")
        price = approval["models"][model["id"]]
        positive_decimal(price["reservation_per_request"])
        if not price.get("price_source") or "REQUIRES" in price["price_source"]:
            raise ExperimentError("A verified conservative Azure price bound is required.")


def reserve(approval_path, approval, model_id):
    ledger_path = approval_path.with_suffix(".ledger.json")
    ledger = read_json(ledger_path) if ledger_path.exists() else {
        "approval_sha256": digest(canonical(approval)), "attempts": 0, "reserved_cost": "0"}
    if ledger["approval_sha256"] != digest(canonical(approval)):
        raise ExperimentError("Approval changed; reconcile existing reservations before continuing.")
    if type(ledger["attempts"]) is not int or ledger["attempts"] < 0:
        raise ExperimentError("Invalid budget ledger; reconcile before continuing.")
    try:
        previous_cost = Decimal(ledger["reserved_cost"])
    except InvalidOperation as exc:
        raise ExperimentError("Invalid budget ledger; reconcile before continuing.") from exc
    if not previous_cost.is_finite() or previous_cost < 0:
        raise ExperimentError("Invalid budget ledger; reconcile before continuing.")
    bound = positive_decimal(approval["models"][model_id]["reservation_per_request"])
    total = previous_cost + bound
    if ledger["attempts"] >= approval["max_requests"] or total > Decimal(approval["max_cost"]):
        raise ExperimentError("Approved request or conservative cost ceiling reached.")
    ledger.update(attempts=ledger["attempts"] + 1, reserved_cost=str(total))
    write_json(ledger_path, ledger)
    return str(bound)


def live(config, plan, inputs, approval_path, model_id, case_id, output_root):
    approval = read_json(approval_path)
    check_approval(approval, plan)
    model = next((m for m in config["models"] if m["id"] == model_id), None)
    case = next((c for c in config["cases"] if c["id"] == case_id), None)
    if model is None or case is None:
        raise ExperimentError("Unknown model or case.")
    key = os.environ.get(model["api_key_env"])
    if not key:
        raise ExperimentError("Explicit model API key environment is missing; no cached login fallback.")
    body, content_type = multipart(model, inputs[(case_id, "person")], inputs[(case_id, "garment")])
    run_id = uuid.uuid4().hex
    directory = output_root / run_id
    directory.mkdir(parents=True, exist_ok=False)
    record = {"schema_version": 1, "run_id": run_id, "model_id": model_id, "case_id": case_id,
              "scope_sha256": plan["scope_sha256"], "track": config["track"],
              "live_inference": True, "status": "not_submitted", "attempts": 0, "retries": 0,
              "started_utc": datetime.now(timezone.utc).isoformat(),
              "billed_cost": None, "currency": approval["currency"], "output": None}
    lock_path = approval_path.with_suffix(".lock")
    try:
        lock_fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError as exc:
        raise ExperimentError("Approval ledger is locked; inspect interrupted work before reuse.") from exc
    try:
        record["reserved_cost_bound"] = reserve(approval_path, approval, model_id)
        record.update(status="submitted", attempts=1)
        write_json(directory / "result.json", record)
        write_json(directory / "plan.json", plan)
        started = time.perf_counter()
        try:
            response_metadata = {}
            payload = fetch(endpoint_url(model), body,
                            {"api-key": key, "Content-Type": content_type,
                             "x-ms-client-request-id": run_id}, response_metadata=response_metadata)
            record["response_metadata"] = response_metadata
            response = json.loads(payload)
            if "error" in response:
                raise ExperimentError("Azure returned an error; raw response is deliberately not persisted.")
            images = response.get("data", [])
            if len(images) != 1 or not isinstance(images[0].get("b64_json"), str):
                raise ExperimentError("Expected exactly one base64 PNG; no URL download fallback.")
            decoded = base64.b64decode(images[0]["b64_json"], validate=True)
            with Image.open(io.BytesIO(decoded)) as image:
                max_pixels = 8294400 if model["family"] == "gpt" else 2359296
                if image.format != "PNG" or image.width * image.height > max_pixels:
                    raise ExperimentError("Invalid or oversized PNG output.")
                dimensions = list(image.size)
                image.load()
            with Image.open(io.BytesIO(decoded)) as image:
                image.verify()
            (directory / "output.png").write_bytes(decoded)
            record.update(status="succeeded", output="output.png", output_sha256=digest(decoded),
                          output_dimensions=dimensions)
        except error.HTTPError as exc:
            record.update(status="failed", error_kind="http", http_status=exc.code)
        except (error.URLError, TimeoutError, OSError) as exc:
            record.update(status="failed", error_kind=type(exc).__name__,
                          completion_uncertain=True)
        except (ExperimentError, ValueError, KeyError, TypeError,
                Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
            record.update(status="failed", error_kind=type(exc).__name__)
            if isinstance(exc, ExperimentError):
                record["error_detail"] = str(exc)
        finally:
            record["elapsed_seconds"] = round(time.perf_counter() - started, 3)
            write_json(directory / "result.json", record)
    finally:
        os.close(lock_fd)
        lock_path.unlink()
    if record["status"] != "succeeded":
        raise ExperimentError("Live attempt failed. Inspect sanitized result.json; no automatic retry.")
    return record


def acquire(destination):
    manifest = read_json(ROOT / "samples.json")
    destination.mkdir(parents=True, exist_ok=True)
    inventory = []
    for sample in manifest["samples"]:
        object_id = sample["object_id"]
        metadata_url = f"https://collectionapi.metmuseum.org/public/collection/v1/objects/{object_id}"
        metadata = json.loads(fetch(metadata_url, limit=2 * 1024 * 1024))
        url = metadata.get("primaryImage", "")
        parsed = parse.urlsplit(url)
        if (metadata.get("isPublicDomain") is not True or metadata.get("objectID") != object_id
                or parsed.scheme != "https" or parsed.hostname != "images.metmuseum.org"
                or parsed.query or parsed.fragment or parsed.username or parsed.password):
            raise ExperimentError("Sample is not a verified Met Open Access image.")
        source = fetch(url, limit=MAX_IMAGE_BYTES)
        source_path = destination / (safe_id(sample["id"]) + ".jpg")
        normalized_path = destination / (sample["id"] + ".png")
        if source_path.exists() or normalized_path.exists():
            raise ExperimentError("Sample destination already exists; choose a fresh directory.")
        source_path.write_bytes(source)
        normalized, dimensions = normalize_image(source_path)
        normalized_path.write_bytes(normalized)
        inventory.append({**sample, "source_sha256": digest(source),
                          "normalized_sha256": digest(normalized), "dimensions": dimensions,
                          "isPublicDomain": True, "rights_reviewed": False,
                          "downloaded_utc": datetime.now(timezone.utc).isoformat(),
                          "metadata_source": metadata_url, "license": manifest["license"]})
        write_json(destination / "inventory.json", inventory)
    return {"downloaded_samples": len(inventory), "live_inference": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    sample = commands.add_parser("acquire", help="Download public-domain research samples, never inference.")
    sample.add_argument("--destination", type=Path, default=ROOT / "local" / "samples")
    for name in ("plan", "live"):
        cmd = commands.add_parser(name)
        cmd.add_argument("--config", type=Path, required=True)
        if name == "plan":
            cmd.add_argument("--output", type=Path, required=True)
        else:
            cmd.add_argument("--approval", type=Path, required=True)
            cmd.add_argument("--model", required=True)
            cmd.add_argument("--case", required=True)
            cmd.add_argument("--output-root", type=Path, default=ROOT / "local" / "runs")
    args = parser.parse_args()
    try:
        if args.command == "acquire":
            result = acquire(args.destination)
        else:
            config = read_json(args.config)
            plan, inputs = build_plan(config, args.config.resolve().parent)
            if args.command == "plan":
                args.output.parent.mkdir(parents=True, exist_ok=True)
                write_json(args.output, plan)
                result = {"scope_sha256": plan["scope_sha256"], "live_inference": False}
            else:
                result = live(config, plan, inputs, args.approval.resolve(),
                              args.model, args.case, args.output_root)
        print(json.dumps(result))
    except (ExperimentError, OSError, ValueError, KeyError, TypeError,
            Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        # Never print server bodies, credential values, file contents, or signed URLs.
        message = str(exc) if isinstance(exc, ExperimentError) else type(exc).__name__
        parser.exit(1, f"Experiment stopped: {message}\n")


if __name__ == "__main__":
    main()
