"""Summarize all live attempts and hash-bound human reviews, never invent scores."""

import argparse
import math
import statistics
from decimal import Decimal
from pathlib import Path

from harness import ExperimentError, digest, read_json, write_json

DIMENSIONS = (
    "face", "body", "pose", "hands", "background",
    "garment_color", "garment_pattern", "garment_logo", "garment_cut", "artifacts")
OPTIONAL = {"hands", "garment_pattern", "garment_logo"}


def validate_review(review, result):
    if review.get("output_sha256") != result["output_sha256"]:
        raise ExperimentError("Review does not match the actual output bytes.")
    scores = review.get("scores", {})
    if set(scores) != set(DIMENSIONS) or not review.get("notes"):
        raise ExperimentError("Review requires every rubric dimension and visual evidence notes.")
    if type(review.get("severe_distortion")) is not bool:
        raise ExperimentError("Review requires an explicit severe-distortion decision.")
    for dimension, score in scores.items():
        if score is None:
            if dimension not in OPTIONAL or not review.get("not_applicable", {}).get(dimension):
                raise ExperimentError("N/A requires a permitted dimension and explanation.")
        elif type(score) is not int or not 0 <= score <= 3:
            raise ExperimentError("Scores must be integers 0-3, never booleans.")
    return not review["severe_distortion"] and all(
        score is None or score >= 2 for score in scores.values())


def summarize(root, reviews):
    runs = sorted(Path(root).glob("*\\result.json"))
    groups = {}
    seen = set()
    for path in runs:
        result = read_json(path)
        run_id = result["run_id"]
        if run_id in seen:
            raise ExperimentError("Duplicate run ID in report input.")
        seen.add(run_id)
        if result.get("live_inference") is not True or result.get("attempts") != 1:
            raise ExperimentError("Reports accept only actual submitted live attempts.")
        if result.get("status") not in {"submitted", "failed", "succeeded"}:
            raise ExperimentError("Unknown live attempt status.")
        if result["status"] != "succeeded" and run_id in reviews:
            raise ExperimentError("Failed or incomplete attempts cannot have output quality reviews.")
        key = (result["model_id"], result["track"], result["scope_sha256"], result["currency"])
        group = groups.setdefault(key, {
            "model_id": key[0], "track": key[1], "scope_sha256": key[2], "currency": key[3],
            "attempted": 0, "succeeded": 0, "failed": 0, "incomplete": 0,
            "accepted": 0, "rejected": 0, "unreviewed": 0, "retries": 0,
            "dimension_scores": {d: [] for d in DIMENSIONS},
            "latencies": [], "reserved_cost_bound": Decimal(0), "runs": []})
        group["attempted"] += 1
        group["retries"] += result["retries"]
        bound = result["reserved_cost_bound"]
        if bound is None:
            group["reserved_cost_bound"] = None
        elif group["reserved_cost_bound"] is not None:
            group["reserved_cost_bound"] += Decimal(bound)
        if "elapsed_seconds" in result:
            elapsed = result["elapsed_seconds"]
            if type(elapsed) not in {int, float} or not math.isfinite(elapsed) or elapsed < 0:
                raise ExperimentError("Invalid elapsed duration.")
            group["latencies"].append(elapsed)
        verdict = result["status"]
        if result["status"] == "succeeded":
            group["succeeded"] += 1
            output = path.parent / "output.png"
            if not output.is_file() or digest(output.read_bytes()) != result["output_sha256"]:
                raise ExperimentError("Successful run lacks its matching output.")
            review = reviews.get(run_id)
            if review is None:
                group["unreviewed"] += 1
                verdict = "unreviewed"
            else:
                accepted = validate_review(review, result)
                verdict = "accepted" if accepted else "rejected"
                group[verdict] += 1
                for dimension, score in review["scores"].items():
                    if score is not None:
                        group["dimension_scores"][dimension].append(score)
        elif result["status"] == "failed":
            group["failed"] += 1
        else:
            group["incomplete"] += 1
        group["runs"].append({"run_id": run_id, "case_id": result["case_id"], "verdict": verdict,
                              "output_dimensions": result.get("output_dimensions"),
                              "error_kind": result.get("error_kind"),
                              "http_status": result.get("http_status")})
    if set(reviews) - seen:
        raise ExperimentError("Review file contains runs absent from the report.")
    for group in groups.values():
        durations = sorted(group.pop("latencies"))
        group["latency_seconds"] = {
            "samples": len(durations), "median": statistics.median(durations) if durations else None,
            "p95_nearest_rank": durations[math.ceil(len(durations) * .95) - 1] if durations else None}
        if group["reserved_cost_bound"] is not None:
            group["reserved_cost_bound"] = str(group["reserved_cost_bound"])
        group["billed_cost"] = None
        group["cost_per_accepted_result"] = None
        group["acceptance_rate_all_attempts"] = group["accepted"] / group["attempted"]
        group["dimension_scores"] = {
            d: {"reviewed_applicable": len(scores), "mean": statistics.mean(scores) if scores else None}
            for d, scores in group["dimension_scores"].items()}
    conclusion = "no live outputs"
    if any(group["succeeded"] for group in groups.values()):
        conclusion = "human pilot only"
    return {"schema_version": 1, "groups": list(groups.values()),
            "quality_conclusion": conclusion,
            "billing_note": "Reserved bounds are not charges. Reconcile Azure billing separately.",
            "fit_size_claim": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runs", type=Path, required=True)
    parser.add_argument("--reviews", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        report = summarize(args.runs, read_json(args.reviews))
        args.output.parent.mkdir(parents=True, exist_ok=True)
        write_json(args.output, report)
        print(f"Report written; {len(report['groups'])} model/track/scope groups.")
    except (ExperimentError, OSError, ValueError, KeyError, TypeError) as exc:
        message = str(exc) if isinstance(exc, ExperimentError) else type(exc).__name__
        parser.exit(1, f"Evaluation stopped: {message}\n")


if __name__ == "__main__":
    main()
