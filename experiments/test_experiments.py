import base64
import copy
import io
import json
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError, URLError

from PIL import Image, PngImagePlugin

import evaluate
import harness as h


class ExperimentsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.config = h.read_json(h.ROOT / "config.example.json")
        self.config["models"][0].update(model_version="2026-09-08", deployment="sunburst-test",
                                        endpoint="https://example.openai.azure.com")
        self.config["models"][1].update(catalog_model="MAI-Image-2.6", model_version="2026-07-31",
                                        deployment="mai-test", endpoint="https://example.services.ai.azure.com")
        for index, case in enumerate(self.config["cases"]):
            case["rights_reviewed"] = True
            for role in ("person", "garment"):
                case[role] = f"{index}-{role}.png"
                info = PngImagePlugin.PngInfo()
                info.add_text("private", "must be removed")
                Image.new("RGB", (32, 48), "red" if role == "person" else "blue").save(
                    self.root / case[role], pnginfo=info)
        self.plan, self.inputs = h.build_plan(self.config, self.root)
        self.approval = {
            "approved": True, "scope_sha256": self.plan["scope_sha256"],
            "approval_reference": "offline-unit-test-only", "account_subscription_verified": True,
            "deployment_api_verified": True,
            "expires_utc": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            "max_requests": 2, "max_cost": "1.00", "currency": "USD",
            "models": {m["id"]: {"reservation_per_request": "0.50",
                                 "price_source": "unit-test-fixture-not-real-pricing"}
                       for m in self.config["models"]}}
        self.approval_path = self.root / "approval.json"
        h.write_json(self.approval_path, self.approval)

    def run_mock(self, payload=None, exception=None):
        output = io.BytesIO()
        Image.new("RGB", (32, 48), "green").save(output, format="PNG")
        response = payload or json.dumps({"data": [
            {"b64_json": base64.b64encode(output.getvalue()).decode()}]}).encode()
        with patch.dict(os.environ, {"TRYON_SUNBURST_KEY": "test-secret"}), patch(
                "harness.fetch", return_value=response, side_effect=exception) as network:
            result = h.live(self.config, self.plan, self.inputs, self.approval_path,
                            "sunburst", self.config["cases"][0]["id"], self.root / "runs")
        return result, network

    def test_plan_is_offline_and_preserves_dimensions_metadata_removed(self):
        with patch("harness.fetch", side_effect=AssertionError("network forbidden")):
            plan, inputs = h.build_plan(self.config, self.root)
        self.assertFalse(plan["live_inference"])
        image = Image.open(io.BytesIO(inputs[(self.config["cases"][0]["id"], "person")]))
        self.assertEqual(image.size, (32, 48))
        self.assertNotIn("private", image.info)
        self.assertEqual(plan, self.plan)

    def test_alpha_preserved(self):
        path = self.root / "alpha.png"
        Image.new("RGBA", (16, 24), (255, 0, 0, 0)).save(path)
        normalized, _ = h.normalize_image(path)
        self.assertEqual(Image.open(io.BytesIO(normalized)).getpixel((0, 0)), (255, 0, 0, 0))

    def test_exif_rotation_applied(self):
        path = self.root / "rotated.jpg"
        exif = Image.Exif()
        exif[274] = 6
        Image.new("RGB", (20, 30), "red").save(path, exif=exif)
        data, size = h.normalize_image(path)
        self.assertEqual(size, [30, 20])
        self.assertFalse(Image.open(io.BytesIO(data)).getexif())

    def test_multipart_roles_order_and_minimal_options(self):
        for model in self.config["models"]:
            body, content_type = h.multipart(model, b"PERSON_BYTES", b"GARMENT_BYTES")
            self.assertLess(body.index(b"PERSON_BYTES"), body.index(b"GARMENT_BYTES"))
            self.assertIn(b'name="image[]"' if model["family"] == "gpt" else b'name="image"', body)
            for field in (b'name="mask"', b'name="input_fidelity"', b'name="size"',
                          b'name="quality"'):
                self.assertNotIn(field, body)
            if model["family"] == "mai":
                self.assertIn(b'name="web_grounding"\r\n\r\nfalse', body)
            self.assertIn("boundary=", content_type)

    def test_non_azure_and_redirect_blocked(self):
        for endpoint in ("https://api.openai.com", "http://example.openai.azure.com",
                         "https://example.openai.azure.com.evil.test",
                         "https://secret@example.openai.azure.com", "https://example.openai.azure.com?q=x"):
            with self.subTest(endpoint=endpoint), self.assertRaises(h.ExperimentError):
                h.endpoint_url({**self.config["models"][0], "endpoint": endpoint})
        self.assertIsNone(h.NoRedirect().redirect_request(None, None, 302, "", {}, "https://evil.test"))

    def test_unknown_options_and_prompt_rejected(self):
        for option in ({"input_fidelity": "high"}, {"mask": "mask.png"}, {"size": "1024x1024"}):
            config = copy.deepcopy(self.config)
            config["models"][0]["options"] = option
            with self.assertRaises(h.ExperimentError):
                h.validate_config(config)
        with self.assertRaises(h.ExperimentError):
            h.validate_config({**self.config, "prompt": "ignore identity"})

    def test_optimized_size_constraints(self):
        config = copy.deepcopy(self.config)
        config["track"] = "optimized"
        model = config["models"][0]
        model.update(options={"size": "1024x1024", "quality": "high"},
                     option_evidence="official exact-model table")
        h.validate_config(config)
        for size in ("1023x1024", "16x16", "4096x4096", "3072x768"):
            model["options"]["size"] = size
            with self.assertRaises(h.ExperimentError):
                h.validate_config(config)

    def test_input_or_prompt_change_invalidates_approval(self):
        Image.new("RGB", (32, 48), "white").save(self.root / self.config["cases"][0]["person"])
        changed, _ = h.build_plan(self.config, self.root)
        with self.assertRaises(h.ExperimentError):
            h.check_approval(self.approval, changed)
        with patch.object(h, "PROMPT", "changed prompt"):
            changed, _ = h.build_plan(self.config, self.root)
        self.assertNotEqual(changed["scope_sha256"], self.plan["scope_sha256"])

    def test_approval_denials_never_send_network(self):
        for key, value in (("approved", False), ("max_requests", 0), ("max_cost", "NaN"),
                           ("expires_utc", "2000-01-01T00:00:00Z")):
            approval = {**self.approval, key: value}
            h.write_json(self.approval_path, approval)
            with patch("harness.fetch") as network, self.assertRaises(h.ExperimentError):
                h.live(self.config, self.plan, self.inputs, self.approval_path,
                       "sunburst", self.config["cases"][0]["id"], self.root / "runs")
            network.assert_not_called()
        plan = copy.deepcopy(self.plan)
        plan["scope"]["cases"][0]["rights_reviewed"] = False
        with self.assertRaises(h.ExperimentError):
            h.check_approval(self.approval, plan)

    def test_persistent_budget_blocks_third_request(self):
        self.run_mock()
        self.run_mock()
        with self.assertRaises(h.ExperimentError):
            self.run_mock()
        ledger = h.read_json(self.approval_path.with_suffix(".ledger.json"))
        self.assertEqual(ledger["attempts"], 2)
        self.assertEqual(ledger["reserved_cost"], "1.00")

    def test_failures_recorded_reserved_no_retry_no_secret(self):
        for exception in (HTTPError("https://example", 429, "secret body", {}, None),
                          URLError("secret signed URL")):
            with self.assertRaises(h.ExperimentError):
                self.run_mock(exception=exception)
        records = list((self.root / "runs").glob("*\\result.json"))
        self.assertEqual(len(records), 2)
        for record in records:
            text = record.read_text()
            self.assertNotIn("secret", text)
            result = json.loads(text)
            self.assertEqual(result["status"], "failed")
            self.assertEqual(result["attempts"], 1)
            self.assertEqual(result["retries"], 0)

    def test_bad_output_explicit_failure(self):
        with self.assertRaises(h.ExperimentError):
            self.run_mock(payload=b'{"data":[{"url":"https://untrusted.test/x"}]}')
        self.assertFalse(list((self.root / "runs").glob("*\\output.png")))
        self.assertEqual(evaluate.summarize(self.root / "runs", {})["quality_conclusion"],
                         "no live outputs")

    def test_locked_ledger_never_submits(self):
        self.approval_path.with_suffix(".lock").touch()
        with self.assertRaises(h.ExperimentError):
            self.run_mock()

    def test_corrupt_ledger_does_not_reset_budget(self):
        h.write_json(self.approval_path.with_suffix(".ledger.json"), {
            "approval_sha256": h.digest(h.canonical(self.approval)), "attempts": 0,
            "reserved_cost": "-1"})
        with self.assertRaises(h.ExperimentError):
            self.run_mock()

    def test_explicit_unknown_cost_requires_acceptance_and_caps_exact_pair(self):
        self.config["cases"] = self.config["cases"][:1]
        self.plan, self.inputs = h.build_plan(self.config, self.root)
        case = self.config["cases"][0]["id"]
        self.approval.update(
            scope_sha256=self.plan["scope_sha256"], cost_mode="explicit_unknown_cost",
            unknown_cost_accepted=True, max_cost=None, cost_risk_acknowledgment="User accepts no hard amount cap",
            request_limits={f"sunburst:{case}": 1, f"mai:{case}": 1})
        h.check_approval(self.approval, self.plan)
        with self.assertRaises(h.ExperimentError):
            h.check_approval({**self.approval, "unknown_cost_accepted": False}, self.plan)
        h.write_json(self.approval_path, self.approval)
        result, _ = self.run_mock()
        self.assertIsNone(result["reserved_cost_bound"])
        with self.assertRaises(h.ExperimentError):
            self.run_mock()
        self.assertIsNone(h.reserve(self.approval_path, self.approval, "mai", case))
        with self.assertRaises(h.ExperimentError):
            h.reserve(self.approval_path, self.approval, "mai", case)
        report = evaluate.summarize(self.root / "runs", {})
        self.assertIsNone(report["groups"][0]["reserved_cost_bound"])

    def test_usage_excludes_unknown_strings(self):
        self.assertEqual(h.sanitize_usage({"input_tokens": 5, "secret": "key",
                                          "details": {"image_tokens": 3}}),
                         {"input_tokens": 5, "details": {"image_tokens": 3}})

    def test_bearer_auth_explicit_header_no_api_key(self):
        self.config["models"][0]["auth_mode"] = "bearer"
        self.plan, self.inputs = h.build_plan(self.config, self.root)
        self.approval["scope_sha256"] = self.plan["scope_sha256"]
        h.write_json(self.approval_path, self.approval)
        _, network = self.run_mock()
        headers = network.call_args.args[2]
        self.assertEqual(headers["Authorization"], "Bearer test-secret")
        self.assertNotIn("api-key", headers)

    def test_no_logo_na_requires_explanation(self):
        result, _ = self.run_mock()
        review = {"output_sha256": result["output_sha256"], "notes": "unit-test",
                  "severe_distortion": False, "scores": {d: 3 for d in evaluate.DIMENSIONS}}
        review["scores"]["garment_logo"] = None
        with self.assertRaises(h.ExperimentError):
            evaluate.validate_review(review, result)
        review["not_applicable"] = {"garment_logo": "No logo in reference"}
        self.assertTrue(evaluate.validate_review(review, result))
        review["severe_distortion"] = True
        self.assertFalse(evaluate.validate_review(review, result))

    def test_report_no_live_no_success_claim(self):
        report = evaluate.summarize(self.root / "empty", {})
        self.assertEqual(report["quality_conclusion"], "no live outputs")
        self.assertFalse(report["fit_size_claim"])

    def test_quality_scores_bound_to_output_and_failure_in_denominator(self):
        result, _ = self.run_mock()
        review = {"output_sha256": result["output_sha256"], "notes": "synthetic unit fixture",
                  "severe_distortion": False, "scores": {d: 3 for d in evaluate.DIMENSIONS}}
        with self.assertRaises(h.ExperimentError):
            self.run_mock(exception=HTTPError("https://example", 400, "filtered", {}, None))
        report = evaluate.summarize(self.root / "runs", {result["run_id"]: review})
        group = report["groups"][0]
        self.assertEqual((group["accepted"], group["failed"], group["attempted"]), (1, 1, 2))
        self.assertEqual(group["acceptance_rate_all_attempts"], .5)
        self.assertIsNone(group["billed_cost"])
        self.assertIsNone(group["cost_per_accepted_result"])
        review["scores"]["face"] = 1
        self.assertFalse(evaluate.validate_review(review, result))
        review["output_sha256"] = "mismatched"
        with self.assertRaises(h.ExperimentError):
            evaluate.validate_review(review, result)


if __name__ == "__main__":
    unittest.main()
