# VITON-HD four-case Azure baseline

## Scope and outcome

The user approved eight private, non-commercial Azure image-edit attempts:
two on the already approved stripe pair, plus one Sunburst and one MAI basic
request for each of three additional cross-pairs. Both approvals accepted an
unknown monetary ceiling. The pair/case scopes had separate, hash-bound
approval files and ledgers. They are exhausted: **8 attempts, 5 PNG outputs,
3 failures, 0 retries**. The prior four attempts remain separate; lifetime
total is **12 attempts and 7 outputs**. No further image calls are authorized.

Every request used the same `upper-body-v1` prompt and baseline model options.
For a given case, both adapters used the same normalized PNG bytes, with person
first and garment second. Inputs were 768 × 1024; EXIF/color handling and
metadata removal did not crop, resize, or square-pad them. No exact target-
wearing ground truth exists for these cross-pairs, so assessments below compare
only the input person and garment, not ground-truth similarity. No physical-fit
or size conclusion is possible.

The additions cover a multicolor banded graphic, a yellow floral repeat, and
a legible text/illustration print. A clear check/plaid garment was **not**
included in these three cases; check-pattern fidelity remains untested.

## Attempt ledger

| Case | Sunburst | MAI-Image-2.6 basic |
| --- | --- | --- |
| `vitonhd-stripe` | PNG, 29.806 s, 1086 × 1448 | HTTP 401 `PermissionDenied`, 1.191 s; no output |
| `vitonhd-graphic-stripe` | HTTP 401 `PermissionDenied`, 1.966 s; no output | PNG, 23.503 s, 880 × 1184 |
| `vitonhd-floral` | PNG, 20.720 s, 1086 × 1448 | PNG, 24.055 s, 880 × 1184 |
| `vitonhd-lettered-print` | HTTP 429 `RateLimitReached`, 1.314 s; no output | PNG, 25.054 s, 880 × 1184 |

All eight starts were sequential. The same-model start-to-start intervals were
47.988 s, 39.442 s, and 54.485 s for Sunburst, and 24.121 s, 53.344 s, and
38.493 s for MAI. A deliberate 3-second pause followed each attempt. The 429
therefore did not occur during concurrent calls or a rapid same-model burst.
The retained error is only the sanitized HTTP status/code; no `Retry-After` or
provider detail was retained. Capacity 1 and the observed deployment quota
are not request-rate guarantees, so the cause cannot be narrowed to quota,
capacity, or a transient service-side throttle without another API request.
No retry was made.

## Visual review

This is a human visual assessment of the five returned PNGs, not biometric
identity verification or an independently validated metric. Scores follow
the repository's 0–3 rubric; a result is accepted only if every applicable
dimension is at least 2 and no severe distortion is present.

| Case / model | Face, body, pose, hands, background | Color, pattern, lettering, cut | Verdict |
| --- | --- | --- | --- |
| Stripe / Sunburst | Face and hair remain recognizable; broad body contour, slight torso angle, visible hands, and plain background are mostly preserved, with some re-rendering. | Navy/white horizontal direction and spacing and yellow neckline/cuff trim transfer closely. Minor fold/stripe-flow and hem deviations; no logo in reference. | **Accepted for this visual pilot only** |
| Graphic-stripe / MAI | General face, silhouette, pose, visible hands, and plain background remain similar; details are re-rendered. | White shirt and multicolor banded circle transfer. The output invents a visible **“BOSS” wordmark** absent from the reference. | **Rejected:** false logo/text |
| Floral / Sunburst | Face, head direction, broad silhouette, arms/hands, and background remain broadly similar. | Yellow ground and floral motif are recognizable, but the distinct collar/front placket are replaced by a changed neckline; pattern placement is re-rendered. | **Rejected:** cut/placket mismatch |
| Floral / MAI | Face, body, arm/hand placement, and plain background remain broadly similar. | Yellow and floral motif remain recognizable, but the collar/placket are missing and repeat placement changes. | **Rejected:** cut/placket mismatch |
| Lettered-print / MAI | Face/hair, broad pose, torso, hands, and background look similar but are not identical. | Beige color, short sleeves, red illustration, and **“HAPPY WEEKEND”** remain legible and close in placement; fine strokes and scale differ. | **Accepted for this visual pilot only** |

**2 of 5 generated images pass the pilot rubric.** “Accepted” means only that
this single visual review met the stated threshold; it does not establish
identity preservation, exact garment reproduction, general reliability, or
production readiness. The 401/429 cells have no output and were not visually
scored. The comparison grid displays all four rows and all four columns,
including explicit failure cells, without cropping or stretching:

- `local\viton-hd-approved-batch\comparison-grid.jpg`
- `local\viton-hd-approved-batch\comparison.html` (self-contained; no remote assets)

The original photos, outputs, preview, approvals, ledgers, and run records are
local-only and ignored by Git. The committed case manifest contains provenance,
rights limits, row identifiers, and input hashes, not photographs.

## Usage, dimensions, and conditional list-price estimates

| Model | Attempts | Success usage per output | Successful output size | Median latency (all attempts) | Estimate per successful output |
| --- | ---: | --- | --- | ---: | ---: |
| Sunburst | 4 (2 success, 2 failed) | 246 text input + 1,536 image input + 386 image output tokens | 1086 × 1448 | 11.343 s | $0.025098 |
| MAI basic | 4 (3 success, 1 failed) | 440 text input + 1,536 image input + 1,017 output tokens | 880 × 1184 | 23.779 s | $0.053134 |

The estimates apply the previously verified Azure Retail Prices API rates
(USD per 1M tokens: text input $5, image input $8, Sunburst image output $30,
MAI image output $38). They are **conditional meter/list-rate estimates**, not
charges. The five successful outputs total an estimated **$0.209598**.
The three failures returned no usage object; they are **not** assumed free.
Actual billed cost for this run and cumulative billed cost remain unknown;
no invoice or delayed charge was reconciled, and the accepted unknown-cost
ceiling means there was no monetary hard cap.

All output pixel dimensions differ from the 768 × 1024 inputs. Sunburst's
1086 × 1448 output retains the same 0.75 aspect ratio; MAI's 880 × 1184 output
is approximately 0.743 versus the input's 0.75. The grid uses proportional
contain-fit display only. This is not native-resolution preservation or a
matched-resolution model comparison.

## Read-only diagnosis of failures

The runner checked the explicitly scoped subscription, tenant, admin account,
token audience, and token expiry before each attempt; it acquired an Entra
token per request and did not use an API key. After the run, a read-only
check confirmed the current token principal matches the expected
resource-scoped Cognitive Services OpenAI User assignment on Sunburst and
Cognitive Services User assignment on MAI. Both deployments still report
their exact model/version, GlobalStandard capacity 1, and Succeeded state.
No account, role, deployment, hosting, or local-auth setting changed during
this batch.

The two 401s do not establish a general role or endpoint failure: the same
configured identity/deployment combination also returned successful PNGs
later in the sequential batch. Sanitized run records do not contain token
identifiers or raw error bodies, so they cannot distinguish transient
service behavior from request-specific authorization handling. Establishing
the exact cause would require additional data-plane investigation; no such
probe or image retry is authorized.

For the 429, there was no concurrency and Sunburst calls were 39–54 seconds
apart. `RateLimitReached` establishes that the request was throttled, but the
retained response lacks provider diagnostics and deployment capacity/quota
does not specify a per-minute request allowance. Its specific quota/rate
cause remains unknown. The attempt consumed its approved slot.

## Rights and attribution

The selected inputs are from VITON-HD mirror revision
`fbec00f2f68cacbcdd7e1dee047405e7319226c6`. The upstream declares CC BY-NC 4.0;
this experiment follows that narrower non-commercial condition, cites Choi
et al., CVPR 2021, and records the changes. The mirror's broader CC BY 4.0
claim is not relied upon. Individual releases, recorded ages, all underlying
photographer/catalog/subject rights, and byte-equivalence with the upstream
archive remain unverified. The reviewed source terms did not state an explicit
third-party-processing prohibition; this does not establish blanket rights.
The user approved Azure transfer and these exact private non-commercial
requests, not public image/output distribution, endorsement, or commercial use.
