# Two-case pose, logo, and material preservation experiment

## Actual execution

On 2026-10-14, the separate four-request approval was exhausted:
**4 attempts, 4 HTTP 200 PNG outputs, 0 retries**. Persisted results and
output SHA256 hashes were checked after the connection interruption; no
request is unresolved and no request was resubmitted. Lifetime total:
**16 attempts, 11 outputs, 5 failures**. No further inference is authorized.

The exact scope digest is
`eed35a7c4d84afded6fbf2e260d72ad114c7cd8d7bb09870c499972f409687f6`.
All calls used unchanged `upper-body-v1`, identical normalized inputs per
case, person first, garment second, and the existing Sunburst and unsuffixed
MAI-Image-2.6 deployments. Inputs were not cropped/resized (768 x 1024).
Fresh Cognitive Services tokens were retrieved privately before each request,
with current account/subscription, tenant, login, audience, and expiry checks.
No key fallback, shared login/default change, deployment, RBAC, or hosting change.

| Case | Sunburst | MAI-Image-2.6 |
| --- | --- | --- |
| Crossed arms / Champion | 42.707 s; 1086 x 1448 | 23.356 s; 880 x 1184 |
| Raised arm / lace | 37.315 s; 1086 x 1448 | 25.135 s; 880 x 1184 |

Starts were serial. Same-model intervals were **195.176 seconds** for
Sunburst and **192.309 seconds** for MAI, exceeding the approved 90 seconds.
All four succeeded without 401/429. This is not proof that spacing fixed the
earlier failures; the earlier 401 root cause and exact cause of the throttled
request remain unknown. Later catalog RPM allocations are not guarantees of
sustained throughput. Safe status/date/request-ID metadata is retained locally.

## Input coverage and rights

The crossed-arm person (`image/00287_00.jpg`) grips the opposite forearms over
the torso; the target (`cloth/00075_00.jpg`) is a white short-sleeve Champion
tee. The raised-arm person (`image/00311_00.jpg`) places a hand in their hair;
the target (`cloth/00611_00.jpg`) is a burgundy long-sleeve top with a patterned
lace yoke, scalloped high neck, and fine semi-sheer body texture. These are
actual catalog photographs, not synthetic people, and are cross-paired with
no exact target-wearing ground truth. Neither is a seated/side-view test.
The first tests brand lettering and arm occlusion, not a dense repeated print;
the second tests fine lace repetition/material, not a brand logo.
Checks/plaid, buttons, complex outdoor backgrounds, and multiple body types
remain untested. A front/raised arm is not claimed to cover all hard poses.

The pinned VITON-HD mirror and original/normalized hashes are recorded in
`sample-candidates.json`. Follow the narrower upstream CC BY-NC 4.0 terms,
not the mirror's broader CC BY claim: Choi et al., *VITON-HD*, CVPR 2021.
Changes: EXIF orientation/color normalization, metadata removal, cross-pairing,
Azure editing, and private comparison layouts. Individual releases, verified
ages, underlying subject/photographer/catalog rights, and upstream byte
equivalence remain unverified. No explicit third-party-processing ban was
found in reviewed terms. User approval covers only these exact private
non-commercial Azure research calls, not commercial use or public publication.

## Strict visual assessment

Assessment is visual, not biometric identity verification, textile measurement,
physical fit/size prediction, or a validated production score. Similar-looking
people and attractive images are not sufficient. Pattern identity is assessed
through folds/perspective, not pixel equality to a flat shirt. All four outputs
remain **not accepted under the user's strict unchanged-pose/detail requirement**;
recognizable branding/material does not establish exact preservation.

| Case / model | Face, body, pose, hands, occlusion, background | Garment pattern, texture, logo, construction and drape | Strict verdict |
| --- | --- | --- | --- |
| Crossed arms / Sunburst | Face/hair recognizable but re-rendered. Crossed-arm topology remains; the foreground forearm is lower and more horizontal, the grip/elbow relationship and waist/jeans framing change. Exposed forearms are synthesized where the input had long sleeves; those hidden surfaces cannot be verified. Plain background persists, not pixel-identically. | Champion spelling and red/blue chest mark are legible, with a sleeve mark in the expected region. Fine letter shapes/mark geometry are re-rendered rather than a verified exact logo transfer. White jersey-like texture and short sleeves are plausible. Hem is tucked/hidden instead of preserving the reference's visible free hem. No repetitive all-over pattern; N/A. | **Fail:** arm/hand geometry drift; exact logo/material fidelity unproven. |
| Crossed arms / MAI | Broad crossed pose remains, but the lower grip and forearm/elbow geometry shift; original fingers are not identical. Face/hair and background are similar with reconstruction. A loose free hem hides the original jeans waist, so clothing volume must not be mistaken for body preservation. Newly exposed arm skin is unverified. | Champion text and red/blue symbol remain recognizable with sleeve branding; strokes, size and placement vary. Free hem/short sleeves remain closer to the reference than Sunburst. Fabric surface is smoother/re-created; exact weave cannot be established from the reference. No all-over repeat; N/A. | **Fail:** hand/arm drift; recognizable lettering is not exact brand reproduction. |
| Raised arm / Sunburst | Raised hand at hair and hanging arm remain, but wrist/elbow angles, finger/hair contact, head framing, and lower hand shape shift. Shoulder/waist apparent shape and garment drape change. Face remains recognizable, not unchanged. Plain background retains its general appearance. | Burgundy color, long sleeves and scalloped high neck transfer. Floral lace/openwork survives as a recognizable family, but repeat geometry, spacing, neckline detail and transparent openings are regenerated. Fine body texture is visible but not demonstrated identical; sleeve/hem folds look plausible. Brand letters/buttons N/A: absent from reference. | **Fail:** pose/hand drift and fine lace identity not preserved exactly. |
| Raised arm / MAI | Broad hand-at-hair pose retained; raised wrist/hand contact and hanging fingers are reconstructed. Original sleeveless arm contours become covered and cannot be directly compared. Face/body remain recognizable, with crop/detail drift and a plain similar background. | Burgundy/high-neck/long-sleeve cut and curved lace yoke transfer. Floral motifs and transparency are detailed but repeats/openwork differ from the flat reference; body surface is smoother, with changed folds/hem tilt. Natural-looking drape does not prove fabric physics. Logo/buttons N/A. | **Fail:** hand-detail drift and regenerated lace/material. |

The logo tee is encouraging for recognizable lettering; the lace top is
encouraging for the garment category/material appearance. Neither proves the
user's exact preservation requirement. Hidden labels, hidden original skin,
and unseen construction cannot be scored as verified.

## Measured usage and conditional costs

| Case / model | Text input | Image input | Image output | Conditional USD estimate |
| --- | ---: | ---: | ---: | ---: |
| Crossed arms / Sunburst | 246 | 1536 | 1544 | 0.059838 |
| Raised arm / Sunburst | 246 | 1536 | 386 | 0.025098 |
| Crossed arms / MAI | 440 | 1536 | 1017 | 0.053134 |
| Raised arm / MAI | 440 | 1536 | 1017 | 0.053134 |

Using previously verified official Azure Retail Prices API list meters
(USD/1M: text input 5, image input 8, Sunburst output 30, MAI output 38),
the four successful requests total **USD 0.191204 estimated**, not billed.
Sunburst's first image consumed four times the second's output tokens despite
equal pixel dimensions; do not assume a fixed per-image fee. MAI fields are
`num_input_text_tokens`, `num_input_image_tokens`, and `num_output_tokens`;
Sunburst uses nested input/output token details. Real billing, discounts,
failed-request charges, and cumulative billed cost are **unreconciled/unknown**.
The approval accepted an unknown monetary ceiling, not a spending hard cap.

Neither model preserved native resolution: Sunburst keeps the 0.75 aspect,
MAI produces about 0.743 vs 0.75. The grid contains full images without
cropping/stretching; display scaling is not model resolution preservation.

## Private artifacts and next-model evidence

`local\viton-hd-hardcase-review\hardcase-grid.html` is the two-row, four-column
large-image grid with full original assets, horizontal scrolling and keyboard/
click enlargement. `hardcase-grid.jpg` is its uncropped image contact sheet.
Images, approvals, ledgers and results remain ignored; no external upload.
Regenerate offline with:

```powershell
python .\experiments\comparison.py --root .\experiments\local\viton-hd-hardcase-review
```

The 2026-10-14 read-only East US catalog and official MAI guide list
**MAI-Image-2.5-Pro (2026-06-19)**, described as the highest-quality **2.5**
series tier with object/character consistency and material/spatial reasoning.
It is older than deployed **MAI-Image-2.6 (2026-07-31)**; no evidence establishes
that Pro is better for this try-on requirement. No 2.6-Pro or Ultra was found.
"Base" is not an official model name; "basic" meant the unsuffixed model here.
Flash is a speed/cost variant, not a proven higher-quality tier.

Official edit support and up to five references do not guarantee pose/logo/
texture retention. No exact Pro mask/input-fidelity control was documented.
Pro is Preview; region/quota and official meter evidence are in
`azure-evidence.md`. Pro was **not deployed/called**; changing model or trying
stronger prompts/masks requires exact support verification and new approval.
The current baseline prompt was never changed mid-batch.
