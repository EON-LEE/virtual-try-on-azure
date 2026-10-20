# Second approved smoke: outputs exist, preservation gate not met

Observed 2026-10-14. The user separately authorized **two new calls** after
the scoped RBAC remedy, no automatic retries, accepting an unknown amount
ceiling. Same Met 286070 person / Met 84219 plain cotton shirt, normalized PNG
bytes, baseline options, and fixed `upper-body-v1` prompt. Use remains private
technical research, not commercial/promotional publication.

RBAC was allowed time to propagate, followed by an additional 30-second wait.
Fresh cognitive-services tokens were obtained per model; audience, subscription
tenant, and current admin matching were checked internally. No identity/default,
permission, local-auth, hosting, or deployment change was made in this run.
Both resources still use Entra authentication, without API-key fallback.

## What actually happened

| Metric | Sunburst | MAI-Image-2.6 basic |
| --- | --- | --- |
| HTTP outcome | 200, valid decoded PNG | 200, valid decoded PNG |
| UTC submission | 2026-10-14 05:14:58 | 2026-10-14 05:15:31 |
| KST submission | 14:14:58 | 14:15:31 |
| Request+decode+save seconds | 32.414 | 29.378 |
| Output dimensions | 1120 x 1405 | 912 x 1152 |
| Text input tokens reported | 246 | 0 |
| Image input tokens reported | 2938 | 14159 |
| Image output tokens reported | 408 | 1026 |
| Automatic retries | 0 | 0 |
| Actual billed cost | Unknown | Unknown |

Input person: **2785 x 3496**; garment: **2060 x 2312**. Input was not resized,
cropped, or square-padded. Both outputs lose original resolution. Person aspect
ratio is approximately 0.7966; Sunburst approximately 0.7972 (close, not exact),
MAI approximately 0.7917 (changed). Framing/shape preservation is not pixel-exact.
Sunburst's returned height 1405 is not a multiple of 16; size was unspecified,
so this does not establish how explicit size constraints would behave.
Defaults and output effort/resolution are not equivalent across models. This
is a common-input/default-controls baseline, not an equal-resolution benchmark.

Both new approval entries are consumed. Lifetime: **4 HTTP attempts**, first
two 401 failures and second two PNG successes, **2 generated outputs**, **0
automatic retries**. No fifth request, correction call, or repeated generation
was made. Authentication success now establishes these exact routes work for
this pair under this configuration, not broad model quality or repeatability.

## Actual visual assessment

The agent inspected both actual outputs beside the original person and garment.
This is **agent visual judgment**, not independent human evaluation, biometric
identity verification, or a validated perceptual metric. Scores use the stated
0-3 rubric; any applicable score below 2 rejects a result.

| Dimension | Sunburst | MAI basic |
| --- | --- | --- |
| Face / expression | 2: recognizable broad face/hair/expression; texture re-rendered | 2: recognizable face/head direction; softened/re-rendered |
| Body silhouette | 2: visible clothing volume changes, less dramatic than MAI | 1: lower torso/silhouette markedly fuller |
| Pose | 2: broad seated posture remains; not exact landmark preservation | 2: broad seated posture remains; not exact landmark preservation |
| Hands / cuff occlusion | 1: original small exposed hand area disappears; cuff/occlusion altered | 1: original small exposed hand area disappears; cuff/occlusion altered |
| Background / source annotations | 1: right-side portrait inscription removed; top annotation retained | 2: both inscriptions more visibly retained, but scaling/strokes differ |
| Garment color | 2: light cloth transferred with sepia scene lighting; not exact colorimetry | 2: light cloth transferred with sepia scene lighting; not exact colorimetry |
| Garment pattern / logo | N/A: plain reference; printed patterns and logos untested | N/A: plain reference; printed patterns and logos untested |
| Garment construction / cut | 1: collar/cuffs recognizable, but transverse gathered seam/placket termination and straight hem not faithful; curved uneven hem | 1: gathered seam clearer, but exaggerated fullness; complete reference hem not shown/preserved |
| Artifacts | 2: no obvious extra visible limbs, but re-rendered cuffs/cloth edges | 2: no obvious extra visible limbs, but synthetic gathers/body silhouette changes |

**Accepted under the preservation/cut rubric: 0 of 2 generated outputs.**
No severe whole-face/limb distortion was flagged, but recognizable identity is
not unchanged identity. The small source hand area must not be scored N/A just
because the generated output hides it. Neither image permits validation of
finger anatomy. Clothing volume changes are visible silhouette differences;
they do not reveal actual underlying body geometry, physical fit, or sizing.

Sunburst loses background annotation and key construction details. MAI retains
annotations and a more explicit gathered seam but alters apparent fullness
more. This one pair does **not** establish a winning model: modern color people,
striped/printed garments, logos/text, other poses, complex backgrounds, and
repeatability are all untested. Shirt replacement visibly happened, but the
user's stricter "person/pose unchanged, garment identical" requirement is not
demonstrated by these outputs.

## Usage-based retail estimate, not invoice or hard ceiling

Rates previously verified via official Azure Retail Prices API, USD/1M tokens:
both text input 5 and image input 8; Sunburst image output 30, MAI image output
38. Applied to the actual returned usage fields, without cache discounts:

| Estimate | Calculation | USD |
| --- | --- | --- |
| Sunburst | (246 x 5 + 2938 x 8 + 408 x 30) / 1,000,000 | 0.036974 |
| MAI basic | (0 x 5 + 14159 x 8 + 1026 x 38) / 1,000,000 | 0.152260 |
| Successful second-round requests only | Sum of the above | 0.189234 |

This is a **conditional meter-mapping/list-rate estimate**, not an observed
charge. MAI reported zero input text tokens despite a nonempty prompt: record
that fact, do not conclude all MAI prompts are free. No invoices, subscription
discounts, taxes, delayed meters, or additional billing components have been
reconciled. Prior 401 attempts have no usage/billing evidence and are not
assumed free. Lifetime billed total remains **unknown**. These observations
also do not supply a guaranteed ceiling for another request or larger inputs.
Cost per acceptable result is undefined because no output passes this rubric.

## Private artifacts and durable evidence

`second-smoke-results.json` records output hashes, input hashes/dimensions,
usage, latency, visual scores/notes, and estimates without photos or secrets.
The original failed smoke remains in `smoke-results.json`; its evidence was
not overwritten. Public metadata files record dated observations, not current
unlimited inference authorization.

Ignored local artifacts:

- `local\approved-second-smoke-runs\90f0c9d5b25f448c9f44062d28e3c510\output.png`
- `local\approved-second-smoke-runs\5927274610704f27bffe4fa5187daa8b\output.png`
- `local\second-smoke-comparison.png`: labeled original person, garment,
  Sunburst, MAI; proportion-preserving display thumbnails, no crop; private
  research only.
- `local\second-smoke-reviews.json`, `local\second-smoke-report.json`, and
  `local\approved-second-smoke-approval.ledger.json`.

No image, access token, oid, key, signed URL, or private approval was committed
or externally uploaded. Further requests require explicit new approval.
