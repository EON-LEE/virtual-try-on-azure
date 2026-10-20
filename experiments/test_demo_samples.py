import json
import unittest
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SAMPLES = ROOT / "public" / "samples"


class DemoSamplesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads(
            (ROOT / "samples" / "manifest.json").read_text(encoding="utf-8")
        )
        cls.items = cls.manifest["items"]

    def test_inventory(self):
        self.assertEqual(
            Counter(item["category"] for item in self.items),
            {"person": 6, "upper": 8},
        )
        self.assertEqual(len({item["id"] for item in self.items}), 14)
        self.assertEqual(len({item["sha256"] for item in self.items}), 14)
        self.assertEqual(list(SAMPLES.glob("*.jpg")), [])
        self.assertFalse((SAMPLES / "manifest.json").exists())

    def test_private_paths_and_hash_metadata(self):
        excluded = json.loads(
            (ROOT / "samples" / "excluded-hashes.json").read_text(encoding="utf-8")
        )["sha256"]
        for item in self.items:
            with self.subTest(item=item["id"]):
                self.assertEqual(item["filename"], item["id"] + ".jpg")
                self.assertEqual(item["src"], "/api/samples/" + item["filename"])
                self.assertRegex(item["sha256"], r"^[0-9a-f]{64}$")
                self.assertNotIn(item["sha256"], excluded)
                self.assertGreater(item["bytes"], 0)
                self.assertLessEqual(item["bytes"], 10 * 1024 * 1024)
                for dimension in ("width", "height"):
                    self.assertGreater(item["dimensions"][dimension], 0)
                    self.assertLessEqual(item["dimensions"][dimension], 4096)

    def test_notices_and_provenance(self):
        self.assertTrue((SAMPLES / "NOTICES.txt").is_file())
        for item in self.items:
            with self.subTest(item=item["id"]):
                for key in (
                    "sourceUrl", "downloadUrl", "author", "license",
                    "licenseUrl", "changes", "attribution", "sha256",
                ):
                    self.assertTrue(item[key], key)
                for key in ("sourceUrl", "downloadUrl", "licenseUrl"):
                    self.assertTrue(item[key].startswith("https://"))
                self.assertIn("BY-NC", item["license"])
                self.assertEqual(
                    item["licenseUrl"], "https://creativecommons.org/licenses/by-nc/4.0/"
                )
                self.assertIn(item["mirrorRevision"], item["downloadUrl"])
                self.assertFalse(item["mirrorBytesVerifiedAgainstOfficialArchive"])
                self.assertTrue(item["rightsUncertainty"])

    def test_person_mode_limits(self):
        people = {
            item["id"]: item for item in self.items if item["category"] == "person"
        }
        self.assertEqual(len(people), 6)
        self.assertTrue(all(item["supportsModes"] == ["upper"] for item in people.values()))


if __name__ == "__main__":
    unittest.main()
