# Azure-only try-on experiments

**Completed replacement batch:** 12 entirely new VITON-HD unpaired combinations,
24/24 PNG outputs, 0 retries. Strict visual review: 0 verified passes, 5 visible
failures, 19 not established; broad similarity is not exact preservation.
Conditional list estimate USD 1.007004, actual billing unknown. Approval exhausted:
24 new + 16 historical = 40 lifetime attempts; live execution is disabled.
See `dataset-return-review.md`, `dataset-return-quality.json` and
`dataset-return-results.json`. `local\report\index.html` contains only the new
batch, large four-column images with filters and enlargement; no disposed images.
`dataset-return-color-review.json` adds all 24 Korean person-color/protected-detail/
reference-garment observations with confidence and limitations. Folded face/hair
and lower-region crops support visual comparison, not aligned pixel metrics.

**2026-10-15 later scope change:** user explicitly returned to noncommercial
VTO dataset inference/demo mockup. The 2026 Korean-brand/current-season
restriction was lifted. The same previously unused maximum 24 attempts apply,
not another allocation (historical 16, lifetime maximum 40). Deleted historical
photos are not restored. `dataset-return-cases.json` selects 12 new unpaired
VITON-HD ID combinations; local `dataset-return\manifest.json` freezes original
and normalized hashes, rights and source URLs before calls.
`restart-state.json` registers only that exact plan and approval-file hash.
Other approvals/legacy sample acquisition remain blocked.
During the now-completed batch, `dataset_batch.py run` used fresh scoped Entra validation,
serial requests, model spacing >=90s and provider Retry-After, no retries.
Reservations/failures/unknown completions consume slots; unknown completion or
two consecutive 401s stop the remaining batch. No roles/deployments changed.
`python .\experiments\report.py` now updates the new-dataset-only large grid;
new brand-source review photos are not part of the experiment grid.

**Earlier status, 2026-10-15: user-directed photo reset.** All 79 inventoried
historical input/output images and image-embedded local artifacts were removed.
All 65 preexisting JSON approval/result/provenance files remain intact.
They describe historical evidence; the image bytes are no longer available
for replay or re-review. Historical Met/VITON people and garments must not be
downloaded again or inserted into reports. No new approved calls were submitted:
**0/24 consumed; prior 16 consumed; lifetime cap 40**.

At that earlier point, `restart-state.json` governed the paused state. Inputs were required to be 2026
current-season Korean-brand product photos and completely new real adult-person
photos. Product-photo permissions remained unresolved. That restriction was
later superseded by the explicit dataset-return instruction above.
`python .\experiments\report.py` replaces `local\report\index.html` with the
new-start screen. It never reads historical pictures. After the blank reset,
two newly found CC BY-SA 4.0 source-review previews were added with attribution
and pinned hashes; they are not cleared experiment inputs or generated results.
One cuts off hands; the seated candidate still lacks consent/provenance review.
The exact disposal inventory/hashes are `local\disposal-2026-10-15.json`.
No code, approvals, ledgers, result metadata or source documentation was deleted.

## Historical observations (images disposed; no reuse)

Status, 2026-10-14: **16 lifetime attempts, 11 PNG outputs, 5 failed attempts,
0 retries.** The first two calls returned HTTP 401; the next two produced
outputs but failed the preservation/cut rubric. A separately approved
VITON-HD four-case batch used eight more attempts: five outputs, three failures,
and two outputs passed its historical pilot rubric. The subsequent hard-pose/
logo/lace batch returned four PNGs; none establishes the user's strict
unchanged-pose and exact garment-detail requirement. Historical pilot passes
are not passes under that later criterion. See `hardcase-review.md`,
`second-smoke-review.md` and `viton-hd-batch-review.md` for case-level reviews,
latency, and conditional usage-based estimates—not billed costs. Every current
historical approval ledger is exhausted. The later 24-call allocation was also
exhausted by the completed replacement batch described above.
This is a separate experiment track, not the application or evidence that
virtual try-on works generally.

Official-brand link candidates and a primary-paper-grounded next-case
evaluation matrix are in `next-case-research.md`. These are research only:
brand-photo rights and new Azure transfer/call approvals remain unresolved.
`brand-cases.json` and `brand-candidate-review.md` extend that list to six
combinations across three domestic brands/two companies; photos are not licensed
for inference yet. `python .\experiments\report.py` creates the ignored,
self-contained `local\report\index.html` for the registered replacement dataset
batch; the historical combined image report was disposed.

## Reproduce the offline work

Python 3.12 and Pillow 12.3.0 are used. No cloud SDK, Azure login, external
inference service, deployment, or web application is required.

```powershell
python -m pip install -r .\experiments\requirements.txt
python -m unittest discover -s .\experiments -p 'test_*.py' -v
python .\experiments\harness.py acquire
Copy-Item .\experiments\config.example.json .\experiments\local\config.json
python .\experiments\harness.py plan --config .\experiments\local\config.json --output .\experiments\local\plan.json
```

`acquire` downloads public Met images, **not inference**. It rechecks each
object's `isPublicDomain=true`, requires the official image hostname, rejects
redirects, keeps original JPEGs locally, prepares PNGs, and records original and
normalized SHA256, dimensions, timestamp, source, and license in
`local\samples\inventory.json`. Re-running into an existing sample directory
stops rather than overwriting inputs; choose a new `--destination` if needed.
Photographs, credentials, local approvals, outputs, and raw API responses must
never be committed. `experiments\local\` is ignored.

`plan` is offline, requires actual input files, and records the exact input
order/bytes, prompt digest, model versions, options, case labels, and an approval
scope hash. Placeholder deployments/endpoints are acceptable **only for an
offline plan**. They prevent live execution. Verified non-secret deployment
metadata is in `deployments.json`; replace local config placeholders from that
file only after checking the approved scope. The example models are the
user-selected Sunburst and **MAI-Image-2.6 basic**, not Flash or an automatic
fallback. The catalog versions are verified. Both exact routes have returned
valid PNGs in approved attempts, but the later 401/429 responses mean reliability
is not established.

## Input and prompt contract

`prompt.txt`, version `upper-body-v1`, is the backend-owned instruction. UTF-8,
five LF-separated lines, trimmed at both ends. No user prompt field is accepted.
The same text is shared with the application development session.

The input roles are fixed: **first person original; second garment reference**.
This version handles **upper-body garments only**. It asks for face, expression,
hair, skin tone, body proportions, pose, hands, background, framing, viewpoint,
and lighting preservation, while transferring garment color, pattern, visible
logo/text, neckline, sleeves, fasteners, seams, silhouette, and hem. Instructions
are constraints to evaluate, not guarantees. Image text is visual content, not
an instruction channel. No size, physical fit, or fabric-physics claim is made.

Preparation applies EXIF orientation, converts embedded ICC profiles to sRGB,
preserves transparency/aspect ratio, copies only pixels into a new PNG, and
does **not** crop, resize, or square-pad. Local safety caps: 20 MiB per input and
25 million decoded pixels; animated inputs are rejected. Conversion failures
stop explicitly. Model comparison uses one prepared person/garment byte pair
for both adapters. Pillow and the app's sharp encoder can produce different
PNG bytes; use the same prepared files for strict cross-harness comparison,
not merely similar source images.

| Track | GPT Sunburst form | MAI 2.6 basic form |
| --- | --- | --- |
| Baseline | `model`, fixed `prompt`, `n=1`, ordered `image[]` | `model`, fixed `prompt`, `web_grounding=false`, repeated ordered `image` |
| Optimized, separately reported | Exact-model-supported `size` / `quality` with evidence | `auto_aspect_ratio` boolean with evidence |

Baseline output dimensions are **not forced equivalent**: MAI edit
`width`/`height` are not documented controls. Record actual output dimensions
and evaluate cropping, reframing, and pose drift rather than silently
normalizing results to a square. MAI web grounding is explicitly off: no Bing
search context is needed. Masks, input fidelity, seed, and other options are
rejected because their compatibility with the exact selected deployments has
not been verified. Optimized requests must remain in separate config/scope
groups and require their own approval.

## Sample provenance and coverage

The [official Met API documentation](https://metmuseum.github.io/) states that
the API supplies public-domain high-resolution images under its Open Access
policy. Individual public-domain flags and image availability were verified
on 2026-10-14. [The official Open Access repository](https://github.com/metmuseum/openaccess)
explains CC0 and cautions that its CSV license alone does not license every
image: only Open Access companion images qualify. All six selected records
passed the image check. Source/creator/title/date links are in `samples.json`.
No image is redistributed in Git.

| Sample | Actual visual inspection | Use and limitation |
| --- | --- | --- |
| Met 286070, Nadar's Jules Janin | Frontal seated portrait, torso visible, hands partly hidden; monochrome | Frontal pose diagnostic; not a modern color-photo benchmark |
| Met 269256, Franz Antoine portrait | Standing looking left, one hand on a prop, long skirt, oval framing | Different-pose and hand/prop-preservation diagnostic |
| Met 764794, Pierre Petit self-portrait | Standing three-quarter view, large mirror reflection | Diagnostic-only: second depiction violates ideal single-person guidance |
| Met 84219, cotton shirt | Plain light shirt, full front, visible collar/placket/cuffs | Plain-garment cut/texture transfer |
| Met 80714, linen shirt | Plain light shirt with pleated front and cuffs | Pleat/detail transfer, not modern branding |
| Met 102528, silk jacket | Short light lace-pattern jacket with ties, dark background | Pattern/detail/background-transfer diagnostic |

The example pairs use the frontal portrait/plain shirt and standing
looking-left/lace jacket. Samples are non-explicit historical subjects, but
**public-domain copyright is not a blanket consent/personality-rights grant**.
These are archival research candidates, not approved marketing imagery.
By default, `rights_reviewed=false` blocks inference until the intended jurisdiction,
person-use permission/ethical suitability, and permitted disclosure have been
reviewed. Do not imply museum/subject endorsement; label any edit as generated.
Use adult volunteers' specifically consented originals and owned/licensed
garment references before drawing modern consumer-use conclusions.

Uncovered: contemporary color portraits, modern striped/printed patterns,
logos/text, diverse body shapes, arm-crossing occlusion, and complex outdoor
backgrounds. Do not label lace as a successful modern-logo test. Add rights-
reviewed pairs and tags before assessing those requirements.

### Hugging Face VITON-HD sample review and completed batch

`sample-candidates.json` records the approved stripe pair plus three additional
unpaired VITON-HD cases: a multicolor banded graphic, a yellow floral repeat,
and a legible text/illustration print. Each person is wearing a different
garment from the reference. None has an exact target-wearing ground-truth
image. A clear check/plaid pattern was not represented in this batch and
remains untested. The four-row/four-column local comparison is
`experiments\local\viton-hd-approved-batch\comparison-grid.jpg`; a
self-contained `comparison.html` is beside it. Both are ignored local
artifacts; inspect them without publishing or redistributing the images.

The [official VITON-HD repository](https://github.com/shadow2496/VITON-HD)
describes the data as research-only and declares [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/),
requiring citation and change indication. The selected bytes were obtained
from the Hugging Face `TryOnVirtual/VITON-HD-TEST` mirror, pinned in the
manifest; that mirror labels its card CC BY 4.0, which conflicts with the
original upstream restriction. We rely only on the original, narrower
non-commercial grant and do not rely on the mirror's broader claim. The
official repository links the original dataset download, but these individual
mirror files were not independently byte-compared with that archive.

Neither source checked here states a specific prohibition on third-party
processing. The original license is non-commercial, so any use must stay
within that scope and preserve attribution; the mirror/license does not
establish that the original uploader controls every underlying image right.
No individual model release or separate subject/photographer permission was
verified. This is a documented residual rights uncertainty, not an inference
that the sample is forbidden merely because release forms are not published.
The selected images appear adult, but no age records were verified. The user
approved Azure transfer of these exact inputs for private non-commercial
research and the exact eight calls documented in
`viton-hd-batch-review.md`; this does not create a blanket rights grant.
Originals, outputs, previews, approvals, and run records remain ignored local
files; no photo or model output is committed.

The previously reviewed
[`glanceai/VTON-Synthetic-Pairs`](https://huggingface.co/datasets/glanceai/VTON-Synthetic-Pairs)
candidate remains a synthetic alternative, not a real-person sample. Its
person already wears the same target garment, so it is a trivial reconstruction
pair. Provenance and rights notes remain in `sample-candidates.json`.

DressCode remains excluded unless its signed release and institutional access
conditions are met. VITON-HD is not excluded merely because its license is
non-commercial. The eight VITON-HD attempts are completed and exhausted; any
new paid run needs a separate exact approval. Do not publish the images or
generated outputs, use them commercially, or claim model/subject endorsement.

### Human review rubric for future outputs

Keep `upper-body-v1` unchanged. Score each dimension from 0 to 3: **0** =
missing or severe mismatch; **1** = obvious material change; **2** = mostly
preserved with visible deviations; **3** = visually consistent with no
material deviation. Explain every score with a concrete comparison to the
input; these are visual judgments, not biometric identity or physical-fit
claims.

| Dimension | Compare explicitly |
| --- | --- |
| Face | Face shape/features, expression, hair, and visible skin appearance; do not claim identity is verified |
| Body silhouette | Shoulder, waist, torso width/length and apparent volume, separating clothing volume from body geometry |
| Pose/framing | Head direction, shoulder/torso axis, elbows, wrists, camera viewpoint, crop, and aspect ratio |
| Hands/occlusion | Hand/finger anatomy and position; whether crossed or raised arms retain their overlap with torso, face, and garment, including what sleeves/cuffs hide or expose |
| Background | Objects, text, edges, lighting, and shadows that appear, disappear, or move |
| Garment color/pattern | Main and secondary colors; stripe/check direction, spacing, scale, repeat, and continuity across folds, seams, and placket; compare the entire visible reference |
| Garment material/texture | Surface weave, knit, lace/openwork, transparency, sheen, and texture scale; distinguish preserved material character from a re-created or smoothed surface |
| Garment logo/text | Exact brand mark, lettering, spelling, color, scale, orientation, and chest/sleeve placement; never accept an invented, altered, or relocated mark |
| Garment cut/construction | Collar, neckline, placket/button count and positions, pockets, sleeve length, cuffs, seams, silhouette, and hem |
| Drape and occlusion | Folds, tension, and sleeve/torso overlap should follow the preserved pose and plausible fabric drape; this is not a physical-fit or size prediction |
| Artifacts | Extra/missing anatomy, moved hands, doubled edges, pattern discontinuities, changed texture, warped fasteners, and background bleed |

For an input with a discernible pattern, score `garment_pattern` as applicable;
do not mark it N/A. Mark logo/text N/A only when the reference has no visible
mark, and state why. A visually attractive result or broadly similar pose is
not a pass: every applicable pose, face/body, hand/occlusion, pattern,
material/texture, logo/text, construction, drape, and artifact dimension must
score at least 2, with no severe distortion. Any invented/changed brand mark,
material pattern, or hand/arm position is a failure. Keep per-model scores and
observations separate. A same-garment person/ground-truth pair cannot count as
evidence of successful transfer to a different person.

The historical `evaluate.py` numeric schema does not separately score material
texture or drape. Its automatic pilot verdict is not the later strict
acceptance decision; record that full criterion-by-criterion visual review
explicitly, as in `hardcase-review.md`.

## Paid execution gate

The user subsequently authorized a dedicated resource group, two AI resources,
and the exact model deployments. Those have been provisioned. The first
Met-pair smoke used two requests and both returned 401; after scoped RBAC, a
separate two-request smoke returned two PNGs, both rejected under the
preservation/cut rubric. The latest VITON-HD batch used eight separately
approved requests: five PNGs and three failures, with two of five outputs
passing its historical pilot rubric. A separate four-call hard-case approval
then returned four PNGs, bringing the lifetime total to 16 attempts. See
`hardcase-review.md` for the stricter assessment. All related approvals are exhausted; new
inference is not authorized. See `viton-hd-batch-review.md` for details.
Existing-project resource reuse remains unauthorized. The experiment runner
never uses `az login`, changes a shared default, or deploys anything. Azure
public resource origins only; redirects and image-URL responses are rejected.
Credentials come solely from the explicitly named process environment, never
JSON or stdout.

For any future experiment, first obtain approval for the **exact deployments,
input rights, request count, cost-bound or explicit unknown-cost acceptance,
and expiration**, fill a local copy of `approval.example.json` and set
credential in the command process through an approved secure mechanism.
`auth_mode` defaults to `api_key`; explicit `bearer` uses the same named
environment variable as an Entra access token. The current dedicated resources
have `disableLocalAuth=true`, so API keys cannot be used. The harness does not
acquire or refresh tokens itself. Do not silently enable key authentication.
The `deployment_api_verified` field covers verified deployment/version,
documented route and controls, and authorization to make the first paid API
compatibility probe; it is **not a claim that a successful edit was already
observed**. Recompute the offline plan hash after any input/model/option change.

```powershell
python .\experiments\harness.py live --config .\experiments\local\config.json --approval .\experiments\local\approval.json --model sunburst --case frontal-shirt
python .\experiments\harness.py live --config .\experiments\local\config.json --approval .\experiments\local\approval.json --model mai --case frontal-shirt
```

Each command makes **at most one paid request**, with no automatic retry or
hidden model fallback. A persistent ledger next to the approval reserves the
verified worst-case request bound **before** submission, counting failed and
uncertain completions too. An exclusive lock prevents concurrent spending from
the same ledger. Interrupted submission leaves a sanitized `submitted` record;
reserve is not refunded. Investigate stale locks and reconcile reservations
manually; do not delete/reissue approvals to reset the budget. This is local
admission control, not an Azure billing hard limit. A guessed per-request price
cannot supply a reliable upper bound. Azure budgets also are not hard spending
limits.

The default `verified_bound` mode still rejects missing/invalid price bounds.
An exceptional `cost_mode=explicit_unknown_cost` is allowed **only** after a
specific user risk decision: `unknown_cost_accepted=true`, explicit
`cost_risk_acknowledgment`, `max_cost=null`, and `request_limits` containing
exactly one request for each approved model/case combination. Their sum must
equal `max_requests`. Scope hash/expiry/rights/deployment gates remain required.
The ledger records exact combination counts before HTTP submission and blocks
repeat calls even if the other model has not run. `reserved_cost_bound=null`
means no monetary ceiling, never zero cost. Changing a failed request or
auth mode does not replenish approval; new calls require new user approval.

## Actual two-call smoke and authorization diagnosis

At 2026-10-14 14:00 KST, the approved frontal-shirt pair was submitted once to
Sunburst and once to MAI with the exact same prepared bytes and prompt.
Both returned **HTTP 401 PermissionDenied** (5.097s and 3.976s respectively),
no generated image and no usage object. Monetary cost remains unknown/null:
failure is not recorded as free. Both count against the approved two requests.
`smoke-results.json` preserves sanitized evidence. Local result/plan/ledger:
`local\approved-smoke-runs\` and
`local\approved-smoke-bearer-approval.ledger.json`.
There is **no output image to inspect**; face/pose/body/background/garment
quality cannot be evaluated.

The user approved Azure transfer of Met 286070 and 84219 for private technical
research, explicitly excluding commercial/promotional publication. Public-domain
provenance and that specific use/transfer decision were documented in the
private approval. This is not a blanket consent/personality-rights grant.

Initial key retrieval was rejected by the control plane because local auth
is disabled; no key was acquired or logged and that was not an image request.
The approved image requests used process-only Entra tokens. Subsequent
**read-only** checks verified token audience/tenant/admin-principal matching
without printing claims, identifiers, or tokens. Inherited Owner and User
Access Administrator assignments do not include inference data actions.
No inference role was found on either resource. See `azure-evidence.md` for
official role definitions and the proposed resource-scoped remedy. No roles,
local-auth settings, hosting, deployments, or additional image requests were
changed during diagnosis. Subsequently, the user approved and the agent created
only the exact resource-scoped admin assignments: OpenAI User on Sunburst,
Cognitive Services User on MAI. Both tuples were re-read and verified, with
local auth still disabled. Propagation/effective inference are untested.
The user subsequently approved a separate second two-call smoke, which returned
HTTP 200 for both models. Both outputs were visually reviewed and rejected
under the preservation/cut rubric. **Those two historical ledgers were
exhausted at that point.** The later eight-call VITON-HD batch is documented in
`viton-hd-batch-review.md`; the subsequent four-call hard-case batch is in
`hardcase-review.md`. All 16 lifetime attempts have now consumed their
approvals. No further calls are authorized. See the dated authorization
sequence in `azure-evidence.md`.

## Approved control-plane provisioning

`provision.ps1` creates/checks `rg-virtual-try-on`, then the dedicated
`vto-sunburst-eus2-<subscription-prefix>` and `vto-mai26-eus-<subscription-prefix>`
AIServices S0 resources. Custom subdomains are explicit; project management is
disabled because no Foundry project or app hosting was requested. Deployments
are exactly `tryon-sunburst` / `tryon-mai26`, GlobalStandard capacity 1, using
OpenAI Sunburst `2026-09-08` / Microsoft MAI-Image-2.6 basic `2026-07-31`.
Public authenticated service origins are provisioned; no roles, keys, login,
network overrides, app hosting, or inference calls are created by the script.

```powershell
.\experiments\provision.ps1 -Subscription <explicit-approved-subscription> -ApprovedProvisioning
```

On the current machine direct `.ps1` execution is restricted. The reviewed
repository script was run as a script block without changing execution policy:

```powershell
$provision = [scriptblock]::Create((Get-Content -LiteralPath .\experiments\provision.ps1 -Raw))
& $provision -Subscription <explicit-approved-subscription> -ApprovedProvisioning
```

The script invokes only Ubuntu's Azure CLI (`wsl -d Ubuntu -- sh -lc`),
explicitly scopes every command to the passed subscription, and requires the
caller to have obtained specific provisioning approval first. It never
switches shared accounts/defaults. Repeated execution checks project ownership
tags and exact account/model specifications; successful existing deployments
are read, not recreated or modified. Unexpected existing resources, provider
errors, version/SKU/capacity mismatches, or non-Succeeded state stop execution
without fallback. It is deliberately sequential and not transactional: if a
later step fails, earlier provisioned resources remain for explicit review;
there is no unapproved rollback/deletion.

The 2026-10-14 approved run verified **both resources and both deployments
Succeeded**, capacity 1, exact versions, and family-specific endpoints via
control-plane reads. Sunburst quota consumption is now 1 of 2; MAI is 1 of 6.
The generic account `cognitiveservices.azure.com` origin is not the app's image
API origin: use the provider-published `openai.azure.com` (Sunburst) and
`services.ai.azure.com` (MAI) endpoints in `deployments.json`.
This resolves capacity-one **provisioning**, not request-rate guarantees,
reliable availability, billing ceilings, or try-on quality. Exact model edit
routes have since returned valid PNGs in approved attempts, with intermittent
401 and 429 failures; see `viton-hd-batch-review.md`.

Results contain request attempts/retries, elapsed request+decode+save duration,
input/prompt scope hash, actual PNG hash/dimensions, sanitized HTTP failures,
client request ID, and available sanitized Azure request IDs. Raw error bodies,
photos, signed URLs, and keys are not logged. HTTP/moderation/shape errors fail
explicitly; network failures mark completion uncertain. A timeout does not prove
Azure did not generate or bill. The recorded latency starts immediately before
network submission, **not browser upload or full application latency**.

## Human evaluation and cost reporting

Inspect person, garment, and every actual output side by side at full resolution.
Review all attempts, not best-of-N. No biometric face-recognition metric is used.
Score each dimension independently:

| Score | Meaning |
| --- | --- |
| 0 | Severe mismatch/distortion or requirement absent |
| 1 | Clearly visible, unacceptable defect |
| 2 | Small visible deviation; acceptable only for a labeled pilot |
| 3 | No visible deviation under the stated viewing conditions |

Dimensions: face, body, pose, hands, background, garment color, garment pattern,
garment logo/text, garment cut, artifacts. For artifacts, a higher score means
fewer defects. Record visible evidence in `notes`. Only hands/pattern/logo may
be N/A, with an explanation such as hidden hands or a garment with no logo;
N/A does not establish those dimensions work. All applicable dimensions must
score at least 2, with `severe_distortion=false`, to count as accepted. Do not
average away identity or pose failures. This is a transparent **proposed pilot
criterion**, not a validated production acceptance standard.

Copy `reviews.example.json` locally. Key each review by the actual `run_id`:

```json
{
  "ACTUAL_RUN_ID": {
    "output_sha256": "ACTUAL_OUTPUT_SHA256",
    "scores": {
      "face": 2, "body": 2, "pose": 2, "hands": null, "background": 2,
      "garment_color": 2, "garment_pattern": 2, "garment_logo": null,
      "garment_cut": 2, "artifacts": 2
    },
    "not_applicable": {"hands": "Hidden in source", "garment_logo": "No logo in reference"},
    "severe_distortion": false,
    "notes": "Replace these illustrative scores and text with actual visual evidence."
  }
}
```

```powershell
python .\experiments\evaluate.py --runs .\experiments\local\runs --reviews .\experiments\local\reviews.json --output .\experiments\local\report.json
```

The evaluator verifies output files/hashes, rejects mismatched or extra reviews,
and groups by model/track/scope/currency. It reports failed, incomplete,
unreviewed, accepted, and rejected runs, dimension-specific scores, individual
verdicts, median, and nearest-rank p95. Failure/unreviewed counts remain in the
all-attempt acceptance denominator. Small pilots cannot establish stable p95
or production reliability. Empty runs say `no live outputs`.

`reserved_cost_bound` is **not billed cost**. `billed_cost` and
`cost_per_accepted_result` stay `null` until actual Azure billing reconciliation;
the current evaluator does not invent them from latency, list pricing, output
count, or token guesses. Keep invoices/receipts private and publish only reviewed
non-sensitive aggregates. See `azure-evidence.md` for verified retail rates and
remaining deployability/cost uncertainties.
