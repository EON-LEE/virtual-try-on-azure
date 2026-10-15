# New VTO dataset batch, 2026-10-15

## Authorized scope change

User returned to VTO datasets for noncommercial demo/mockup inference, not
training or finetuning. This lifts the previous current-season Korean-brand
and recent-photo-only restriction. It does not authorize unlimited calls.
The same unused maximum 12 new combinations / 24 attempts applies; historical
16 remain consumed, lifetime maximum 40. Azure transfer, unknown amount and no
retry were already included and are linked in the exact approval record.
No deployments, roles, hosting, alternate model or shared login changes.

`dataset-return-cases.json` records the exact 12 new person/cloth ID pairs,
pose descriptions and checks. Local `dataset-return\manifest.json` adds source
URLs, original and normalized hashes before live calls. Inputs are EXIF-rotated,
color-normalized PNG without resize/crop; person first, garment second; existing
`upper-body-v1` fixed prompt and minimal baseline options unchanged.
`dataset-return\approval.json` freezes 24 one-shot model/case limits with
90-second minimum same-model spacing, unknown-cost acknowledgment and lifetime
cap. Scope and approval-file SHA256 are registered in `restart-state.json`.
This enables only that replacement plan, not global approval bypass.

## Source and rights

[Original upstream README](https://github.com/shadow2496/VITON-HD) was rechecked:
1024x768 frontal-view women/top pairs, **research purposes only**, CC BY-NC 4.0;
reuse/adaptation for noncommercial purposes with citation and change notice.
Attribution: Choi, Park, Lee and Choo, *VITON-HD: High-Resolution Virtual Try-On
via Misalignment-Aware Normalization*, CVPR 2021.

Acquisition uses the pinned
[TryOnVirtual/VITON-HD-TEST mirror](https://huggingface.co/datasets/TryOnVirtual/VITON-HD-TEST)
revision `fbec00f2f68cacbcdd7e1dee047405e7319226c6`.
The mirror's broader CC BY claim is not relied on. Mirror files were not
byte-compared with the authors' full archive. Individual releases,
photographer/catalog rights and age records are not independently verified;
selected catalog people visually appear adult. No express restriction against
third-party processing was found. These remaining uncertainties are recorded,
not represented as individually verified releases, and do not negate the
source's explicit noncommercial research grant for this approved use.
No Korean-brand ownership or recent photography claim is made.

Selection rejects all original and normalized byte hashes in the prior disposal
inventory, as well as known old input IDs. Deleted historical photos were not
restored. All photographs, thumbnails, generated outputs and HTML remain
ignored/local; only source, manifests and secret-free reviews are committed.

## Coverage and strict evaluation

The twelve cases cover head-hand contact, folded forearms with chin contact,
forearm/wrist gripping, front hands, modest three-quarter torso with open palm,
outward arm, both hands at waist and arms behind the back. This is not strong
side-view/seated coverage. Hand-on-hair is not full overhead arm extension.
Garments cover thin stripes, dense small repeat, floral, text wordmarks,
lace/sheer layers, tiny cactus-like motifs, collar/placket and graphic crossed lines.
The crossed graphic is not a fine regular plaid; fine plaid remains untested.
Material appearance is assessed, not certified fiber composition.

Full-size review corrected two initial thumbnail descriptions without changing
any input bytes or prompt: case 07 reads **PASSIVE EXISTENCE**, not PARALLEL;
case 10 is a small cactus-like print, not verified eyelet/openwork (its frozen
case ID retains the initial mnemonic). Frozen manifest is preserved for audit;
`dataset-return-quality.json` supplies explicit corrections in the report.

Each actual output must be reviewed for source face/body/pose/hand position,
finger geometry and depth ordering, garment motif/repeat direction/spacing/color,
visible letters/logo and placement, material appearance, collar/cuffs/hem/seams,
and natural wrinkles/lighting. Attractive images or broadly similar poses alone
do not pass. Unreadable/absent source text is N/A, not verified exact text.
Unpaired targets have no exact wearing GT: no SSIM/LPIPS score or small-sample
FID is used as quality proof. Size/physical fit is not predicted.

## Completed results

**24/24 attempts completed: 24 PNG outputs, 0 failed, 0 unresolved, 0 retries.**
Both models produced one output for each of the twelve new unpaired cases.
All recorded HTTP responses were 200; no 401/429 occurred in this batch.
This does not establish the cause of earlier authentication failures.
The same approval is exhausted: historical 16 + new 24 = **40 lifetime attempts**.
`restart-state.json` disables further live execution. No more calls are approved.
Each output hash matches its saved result; every model/case ledger slot is one.

Execution records were persisted before and
after each request; all failures/timeouts consume their slot. Serial runner uses
fresh approved-tenant/principal/audience/expiry checks and no automatic retries.
Safe status/code/request ID/date/Retry-After only; no token or raw body logging.
Two consecutive 401s stop unused slots instead of wasting the remaining cap.
Unknown completion/ledger mismatch also stops rather than replays a request.

| Model | Outputs | Latency min / median / max, seconds | Minimum same-model start gap | Conditional list estimate, USD |
|---|---:|---|---:|---:|
| Sunburst | 12 | 18.320 / 23.506 / 74.837 | 94.070 s | 0.369396 |
| MAI 2.6 | 12 | 22.567 / 24.508 / 27.556 | 94.258 s | 0.637608 |

Total conditional usage/list estimate: **USD 1.007004**. Rates and token categories
are recorded in `dataset-return-results.json`, sourced from the Azure Retail
Prices API check in `azure-evidence.md`. This is not an invoice or monetary cap;
actual billing, discounts and taxes remain unknown. These small-sample latency
observations do not establish guaranteed service performance or RPM.

## Strict visual review

**0 verified strict passes, 5 visible failures, 19 not established.**
An output being generated is not a preservation pass. Nor does “not established”
mean a visible failure was proven. `dataset-return-quality.json` records all
24 separate output reviews. One non-blinded reviewer used 2000px four-column
contact sheets; quantitative landmarks, OCR, repeat-frequency measurements and
independent blinded reviews were not performed.

Visible failures: case 02 Sunburst changes the raised-elbow contour; case 04 MAI
places the reference's inner neck label visibly at the front; both case 09
outputs change visible lowered-hand/finger silhouettes (Sunburst also hides the
reference hem by tucking); case 12 MAI coarsens the fine diamond mesh.
The remaining outputs often retain the broad pose and garment family, but
fine hands/contact, exact text geometry, material and construction are not
fully established. Case 11's hidden hands and unreadable stylized source script
are N/A. Case 12 front/back neck-closure interpretation remains uncertain from
one translucent flat reference; it is not presented as a proven failure.

Consequently, this batch does **not** establish the user's strict unchanged-pose
and exact garment-detail requirement for either model, or a general winner.
It provides concrete new images and failures for comparison, not a physical-fit
or sizing predictor. Primary-paper evaluation rationale remains in
`next-case-research.md` and is summarized in the report's folded details.

The large self-contained report is `local\report\index.html`. It updates after
each completed attempt and includes only this new dataset batch. No remote
images or network requests are used by the report. Usage and latency are
reported separately from conditional list-price estimates; actual billing is
unknown and no hard monetary cap exists.
