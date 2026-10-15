import hashlib
import json
import unittest
from collections import Counter
from pathlib import Path

from PIL import Image


SAMPLES = Path(__file__).resolve().parents[1] / "public" / "samples"


class DemoSamplesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads(
            (SAMPLES / "manifest.json").read_text(encoding="utf-8")
        )
        cls.items = cls.manifest["items"]

    def test_inventory(self):
        self.assertEqual(
            Counter(item["category"] for item in self.items),
            {"person": 3, "upper": 4, "lower": 3},
        )
        self.assertEqual(len({item["id"] for item in self.items}), 10)
        self.assertEqual(len({item["sourceSha256"] for item in self.items}), 10)
        self.assertEqual(
            {path.name for path in SAMPLES.glob("*.jpg")},
            {item["id"] + ".jpg" for item in self.items},
        )

    def test_images_and_hashes(self):
        for item in self.items:
            with self.subTest(item=item["id"]):
                self.assertEqual(item["src"], "/samples/" + item["id"] + ".jpg")
                path = SAMPLES / (item["id"] + ".jpg")
                self.assertEqual(
                    hashlib.sha256(path.read_bytes()).hexdigest(), item["sha256"]
                )
                self.assertEqual(path.stat().st_size, item["bytes"])
                with Image.open(path) as image:
                    self.assertEqual(
                        image.size,
                        (item["dimensions"]["width"], item["dimensions"]["height"]),
                    )
                    self.assertLessEqual(max(image.size), 1280)
                    self.assertFalse(image.getexif())
                    image.verify()

    def test_notices_and_provenance(self):
        self.assertEqual(self.manifest["noticesUrl"], "/samples/NOTICES.txt")
        self.assertTrue((SAMPLES / "NOTICES.txt").is_file())
        for item in self.items:
            with self.subTest(item=item["id"]):
                for key in (
                    "sourceUrl", "downloadUrl", "author", "license",
                    "licenseUrl", "changes", "attribution", "sourceSha256",
                ):
                    self.assertTrue(item[key], key)
                self.assertFalse(item["inferenceTested"])
                for key in ("sourceUrl", "downloadUrl", "licenseUrl"):
                    self.assertTrue(item[key].startswith("https://"))
                if "BY-SA" in item["license"]:
                    self.assertIn("creativecommons.org/licenses/by-sa/", item["licenseUrl"])

    def test_person_mode_limits(self):
        people = {
            item["id"]: item for item in self.items if item["category"] == "person"
        }
        self.assertEqual(people["person-seated"]["supportsModes"], ["upper"])
        for identifier in ("person-street", "person-tracks"):
            self.assertEqual(
                people[identifier]["supportsModes"], ["upper", "lower", "full"]
            )
        self.assertTrue(all(item["releaseEvidence"] for item in people.values()))


if __name__ == "__main__":
    unittest.main()
