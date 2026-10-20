# Azure-only research experiments

This is a separate upper-body research harness, not the hosted app or its
unlimited-demo policy. **All 40 experimental attempts are consumed; live
execution and legacy acquisition remain closed.** Editing an example approval
does not authorize another run. `restart-state.json` is an active fail-closed
guard, not disposable documentation. Missing state also blocks execution.

The completed replacement batch produced 24/24 PNGs, zero retries, and **zero
verified strict-preservation passes** (5 visible failures, 19 not established).
Its conditional list estimate was USD 1.007004; actual billing is unknown.
Earlier pilot acceptance criteria were less strict and must not be combined
into the same success rate.

## Offline checks

Use Python 3.12 and the existing Pillow requirements:

```powershell
python -m pip install -r experiments\requirements.txt
python -m unittest discover -s experiments -p 'test_*.py'
```

Tests use temporary synthetic inputs and mocked HTTP/identity, not model calls.
No dataset download, login or deployment is required.
`test_demo_samples.py` checks the app's 14-item metadata, private URL contract,
notices and excluded hashes, not private JPEG bytes. App tests verify
authenticated delivery with synthetic fixtures and optionally the ignored pack.

An offline plan requires user-supplied local images:

```powershell
python experiments\harness.py plan --config <local-config.json> --output <local-plan.json>
```

Copy `config.example.json` locally, set actual input paths relative to that
config and retain `rights_reviewed=false` until reviewed. Placeholder model
coordinates are permitted for offline plans only. Planning normalizes images
and hashes exact inputs, roles, fixed prompt, versions/options and scope;
it performs no inference. It does not download missing files.

## Tools and private inputs

| Tool | Scope and required local material |
| --- | --- |
| `harness.py` | Offline plan and guarded single-request executor. Current live/acquire paths are closed. |
| `evaluate.py` | Submitted result JSONs, matching output bytes and hash-bound manual reviews; keeps failures/unreviewed attempts in denominator. |
| `comparison.py` | Existing `selected-inputs.json`, local originals and run outputs; creates a private four-column grid. Never use it to recover disposed photos. |
| `report.py` | Registered dataset report, or historical paused-state preview. Requires the corresponding retained local manifest/assets. |
| `dataset_batch.py` | Historical exact 12-case/24-attempt executor, reconciliation, summary and report. Not a new batch template or renewed allowance. |
| `select_dataset_batch.py` | Historical pinned candidate acquisition; not an offline check. Do not rerun to restore disposed photos. |
| `prepare_private_viton_samples.py` | One-time private sample handoff using retained dataset manifest and disposal inventory. Current app preparation uses `scripts\prepare-samples.js`. |
| `provision.ps1` | Exact dedicated-resource checks/provisioning; requires separate explicit authorization. Not part of reproduction or tests. |

Private photos, reports, approvals, ledgers and outputs stay under ignored
`experiments\local`. Missing historical assets are not a reason to redownload
disposed photographs. Report generation must fail rather than fabricate a
success image. Do not publish private image-embedded HTML as a CI artifact.

## Contracts that must remain

The fixed `prompt.txt` is `upper-body-v1`, person first and garment second.
It is shared only with the app's legacy baseline, not its newer upper/lower/full
prompts. Instructions ask for preservation; they do not guarantee it or measure fit.
Preparation applies EXIF orientation, ICC-to-sRGB conversion and metadata
removal without cropping/resizing; limits are 20 MiB/25 MP. App sharp PNG bytes
can differ from Pillow bytes; strict paired comparison reuses exact prepared bytes.

Baseline sends `image[]`/`n=1` for Sunburst and repeated `image` with
`web_grounding=false` for MAI basic. Optimized options require exact-model
evidence and separate scope. No variant fallback, guessed masks/fidelity or
automatic paid retries.

Execution requires exact input rights, deployments, expiry, scope and explicit
cost-bound or unknown-cost acceptance. Slots reserve before submission; failures
and uncertain completion consume them. Locks, ledgers and registered approval
hashes must reconcile before continuing. No reset/refund by deleting records.
Timeout does not prove cancellation or zero billing. The harness never changes
shared logins/defaults. Current resources disable local key auth.

Reviews bind to actual output hashes. The historical 0–3 rubric requires
concrete notes, all applicable dimensions and no severe distortion; hands,
pattern and logo may be N/A only with reasons. Those pilot thresholds are not
production acceptance. Billing and cost per accepted output remain unknown
until actual reconciliation; token/list estimates are not invoices or ceilings.

## Evidence index

| Records | Meaning |
| --- | --- |
| [Replacement review](dataset-return-review.md), `dataset-return-{cases,results,quality,color-review}.json` | Exact completed replacement batch, strict verdicts, color/detail observations and uncertainties |
| [Azure evidence](azure-evidence.md), `deployments.json` | Dated catalog, API, RBAC, pricing and provisioning observations, not current authorization |
| [Second smoke](second-smoke-review.md), [VITON pilot](viton-hd-batch-review.md), [hard cases](hardcase-review.md) | Historical attempts with distinct criteria; original pictures were disposed |
| [Photo reset](photo-reset.md), `restart-state.json` | Disposal record and current closed execution state |
| [Candidate research](next-case-research.md), [brand review](brand-candidate-review.md), `brand-cases.json` | Superseded candidates; brand photos were not cleared for inference |
| `samples.json`, `sample-candidates.json`, `smoke-results.json`, `second-smoke-results.json` | Historical provenance/results, not a new input allocation |
| [Development archive](archive/development.md) | Original narrative and historical commands, not current instructions |

VITON-HD uses the original research/noncommercial terms, not a mirror's broader
license claim. Retain citation, attribution and modification notices.
Individual releases and mirror-to-official-byte equivalence were not verified.
See the application's [sample notices](../public/samples/NOTICES.txt).
