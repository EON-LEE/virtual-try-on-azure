import base64
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

import dataset_batch
import harness as h
from report_assets import image_uri, result_records, verified_bytes


class ReportAssetsTest(unittest.TestCase):
    def test_verified_bytes_read_once_and_reject_changed_image(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "source.png"
            Image.new("RGB", (32, 48), "red").save(path)
            original = path.read_bytes()
            with patch.object(Path, "read_bytes", return_value=original) as read:
                self.assertEqual(verified_bytes(path, h.digest(original)), original)
                read.assert_called_once()
            with self.assertRaisesRegex(ValueError, "hash"):
                verified_bytes(path, "wrong")

    def test_uri_keeps_original_bytes_and_crop_dimensions(self):
        buffer = io.BytesIO()
        Image.new("RGB", (32, 48), "blue").save(buffer, format="JPEG")
        data = buffer.getvalue()
        uri = image_uri(data)
        self.assertTrue(uri.startswith("data:image/jpeg;base64,"))
        self.assertEqual(base64.b64decode(uri.split(",")[1]), data)
        cropped = image_uri(data, (0.25, 0, 0.75, 0.5))
        self.assertTrue(cropped.startswith("data:image/png;base64,"))
        with Image.open(io.BytesIO(base64.b64decode(cropped.split(",")[1]))) as image:
            self.assertEqual(image.size, (16, 24))

    def test_duplicate_results_cannot_be_silently_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            record = {"case_id": "case", "model_id": "mai", "status": "failed"}
            (root / "first").mkdir()
            (root / "second").mkdir()
            h.write_json(root / "first" / "result.json", record)
            self.assertEqual(result_records(root)[0]["folder"], str(root / "first"))
            h.write_json(root / "second" / "result.json", record)
            with self.assertRaisesRegex(ValueError, "Duplicate"):
                result_records(root)
            with patch.object(dataset_batch, "FOLDER", root.parent), patch(
                    "dataset_batch.result_records", side_effect=ValueError("Duplicate model/case")):
                with self.assertRaisesRegex(h.ExperimentError, "Duplicate"):
                    dataset_batch.records()

    def test_incomplete_record_fails_explicitly(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "incomplete").mkdir()
            h.write_json(root / "incomplete" / "result.json", {"status": "submitted", "attempts": 1})
            with self.assertRaisesRegex(ValueError, "reconcile incomplete"):
                result_records(root)

    def test_summary_reuses_one_record_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            h.write_json(root / "plan.json", {"scope_sha256": "test"})
            h.write_json(root / "manifest.json", {"cases": []})
            record = {"case_id": "case", "model_id": "mai", "status": "failed", "attempts": 1,
                      "retries": 0, "elapsed_seconds": 1, "started_utc": "2026-10-01T00:00:00+00:00"}
            with patch.object(dataset_batch, "FOLDER", root), patch.object(h, "ROOT", root), patch(
                    "dataset_batch.records", return_value=[record]) as records, patch("builtins.print"):
                dataset_batch.summarize()
            records.assert_called_once()
            summary = h.read_json(root / "summary.json")
            self.assertEqual(summary["attempts"], 1)
            self.assertEqual(summary["model_measurements"]["mai"]["attempts"], 1)
            self.assertIsNone(summary["actual_billing"])
