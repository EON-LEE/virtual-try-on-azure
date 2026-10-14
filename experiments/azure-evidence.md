# Verified Azure evidence, 2026-10-14

**Latest: lifetime image-edit attempts 12, 7 valid PNG outputs, 5 failed
attempts, and 0 retries.** The first two Met calls returned HTTP 401; the next
two returned PNGs but both failed the preservation/cut rubric. The latest
VITON-HD batch used eight separately approved calls and returned five PNGs;
two of those five passed the stated visual pilot rubric. See
`second-smoke-review.md` and `viton-hd-batch-review.md` for visual reviews,
usage, and conditional list-rate estimates.
Initial investigation/provisioning had zero calls.
All current request approvals are exhausted; no further inference is authorized.
The following distinguishes public documentation, read-only control-plane
observations, list prices, and limited visual evidence. It is not a broad
success claim.
MAI-Image-2.6 **basic** was subsequently confirmed by the user; Flash is excluded.
The admin subscription was authorized for investigation, then the user approved
the dedicated resource group, two AI resources, and the exact model deployments.
Provisioning succeeded as documented below. The user later approved exactly
two private-research image edits, accepting unknown monetary ceiling; both
failed and exhausted approval. Additional calls/permissions remain unapproved.

## Official API documentation

- [Azure GPT image how-to](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/dall-e):
  model-specific table lists Sunburst GA, text+image input, inpainting, custom
  sizes and quality. Sunburst face-preservation table cell is empty. The
  family edit section gives multipart `image[]`, deployment-based edit route,
  up to 16 PNG/JPEG references under 50 MB each. Its example versions differ
  (`2025-04-01` prose, `2025-04-01-preview` quickstart). The harness candidate
  route uses the explicit preview version. Later approved calls returned valid
  Sunburst PNGs, alongside HTTP 401/429 failures: route compatibility was
  observed on successful requests, but reliable availability is not
  established. Generic mask/fidelity sections do not prove Sunburst support.
  Retrieved page git revision:
  `3c005e56db92baeb0697eac859eb04436c16bb75`.
- [Azure MAI image how-to](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-mai-image):
  basic MAI-Image-2.6 v2026-07-31, Preview, GlobalStandard, edits;
  `/mai/v1/images/edits`, multipart repeated `image`, up to five JPEG/PNG
  references, PNG base64 output. Exact 2.6 request table documents
  `web_grounding` and `auto_aspect_ratio` for **both** generation and edits.
  `width`/`height` are marked **generation only**. Maximum 2.6 output pixels:
  2,359,296; no exact-model mask/fidelity control is documented.
  Example response provides no billing/usage field. Preview has no SLA and is
  not recommended for production. Photorealistic minors' edits are blocked by
  default; do not use minors as experimental subjects.
  Retrieved page git revision:
  `7928acff484d117f43e4a6d23924e6495de6cabb`.
- [Region/deployment processing](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure-region-availability):
  GlobalStandard may process inference in other Azure regions. Azure-managed
  does not mean processing remains in Korea or in the resource's region.

## Initial read-only catalog and quota observations

No keys or tokens were read/printed. Linux Azure CLI was invoked through
`wsl -d Ubuntu`; every Azure command explicitly scoped the user-authorized
subscription. Shared login/default was not changed. No deployment was attempted
during this initial investigation.
The initial other-project resource names/subscription identifiers are not
published here; approved dedicated resources are recorded in `deployments.json`.

| Observation | Sunburst | MAI-Image-2.6 basic |
| --- | --- | --- |
| Exact catalog model/version | `gpt-image-2.5-sunburst`, `2026-09-08` | `MAI-Image-2.6`, `2026-07-31` |
| Format/lifecycle | OpenAI / GenerallyAvailable | Microsoft / Preview |
| Selected region candidates | eastus2 account catalog; westus3 account and regional catalog | eastus regional catalog |
| SKU | GlobalStandard | GlobalStandard |
| Subscription quota in candidates | current 0, limit 2, unit Count in eastus2 and westus3 | current 0, limit 6, unit Count in eastus |
| Catalog capacity | default 3, maximum 1000, minimum/step/allowedValues null | default 1, maximum 1500, minimum/step/allowedValues null |
| Observed deployment | None among four reviewed existing project resources | None among four reviewed existing project resources |

Eastus regional catalog returned MAI 2.6 but not Sunburst. Eastus2/westus3
reviewed account catalogs did not expose MAI image models. Koreacentral regional
catalog and reviewed account returned neither selected model. These observations
are scoped to this subscription/date/query; they are not a global impossibility
claim. Catalog appearance/quota do not prove access or successful deployment.
`Count` quota is not itself a latency or sustained RPM guarantee.

At initial investigation, Sunburst's **default capacity 3 exceeded quota 2**. Capacity 1 was a
candidate to investigate, **not a confirmed supported minimum**: provider
metadata leaves minimum/step/allowedValues null; read-only `account list-skus`
only returns account S0 and cannot establish model-deployment capacity 1.
The approved actual deployment below subsequently established capacity-one
provisioning for this resource/date. No quota increase or alternate SKU was used.

Existing resources belong to other projects. Prefer a separately approved
try-on resource in eastus2 or westus3 for Sunburst and an eastus resource for
MAI if these region observations remain valid. This is a **two-resource
proposal**, not a command to deploy, and does not imply Fabric or external
inference. The proposal was subsequently approved and provisioned below.
A dedicated resource limits unrelated project coupling; actual data-plane
access/network/API validation remains necessary.

## Approved actual provisioning, 2026-10-14

User approval relayed by the coordinator: dedicated resources and model
deployments only, **excluding image generation/edit calls**. Created
`rg-virtual-try-on` with ownership tag `project=virtual-try-on`.

| Verified field | Sunburst | MAI 2.6 basic |
| --- | --- | --- |
| Dedicated account | `vto-sunburst-eus2-b0af194e` | `vto-mai26-eus-b0af194e` |
| Region / resource kind / account SKU | eastus2 / AIServices / S0 | eastus / AIServices / S0 |
| Deployment | `tryon-sunburst` | `tryon-mai26` |
| Actual model / format | `gpt-image-2.5-sunburst` / OpenAI | `MAI-Image-2.6` / Microsoft |
| Actual model version | `2026-09-08` | `2026-07-31` |
| Deployment SKU / capacity | GlobalStandard / **1** | GlobalStandard / **1** |
| Resource / deployment state | Succeeded / Succeeded | Succeeded / Succeeded |
| Post-deployment regional quota | current 1 / limit 2 | current 1 / limit 6 |
| Image edits/generation requests | **0** | **0** |

Family-specific API origins were read from **actual provider-published**
`properties.endpoints`, not assumed from generic `properties.endpoint`:

- Sunburst: `https://vto-sunburst-eus2-b0af194e.openai.azure.com/`
- MAI: `https://vto-mai26-eus-b0af194e.services.ai.azure.com/`

The generic origins are `cognitiveservices.azure.com` and are not substituted
into the image adapters. `deployments.json` contains this non-secret metadata.
Both endpoints/version/capacity/state were relayed to the development session.
No keys were listed, no credentials were printed/committed, no existing other-
project resources were modified, and the shared login/default was unchanged.
No app hosting, projects, roles, paid inference, or quota changes were performed.

Provider AIServices S0 availability was checked in both regions. A first
resource-create invocation failed with `InvalidResourceLocation` because a
PowerShell format placeholder `{2}` was not substituted; the string-expression
precedence was corrected before retrying the **same approved specification**.
No account/deployment was created by that failed command; the dedicated group
already existed. The subsequent exact two accounts and deployments succeeded.
No model, region, SKU, capacity, or quota fallback was used.

`provision.ps1` preserves the repeatable procedure and fail-closed checks.
An actual second execution completed by **reading existing matching resources/
deployments**, without recreating or updating them. It verified both exact
models, versions, capacity 1, Succeeded state, and family-specific origins.
This proves capacity-one control-plane deployment here, **not that 1 is the
global minimum**, that the dated image-edit API is compatible, that credentials
are available to the app, or that any try-on output preserves the person/garment.
Inference approval, case person-use review, and a reliable request-cost bound
remain prerequisites for any image-edit probe.

Read-only command families used:

```text
az cognitiveservices account list-models --name <approved-resource> --resource-group <approved-group> --subscription <approved-subscription>
az cognitiveservices model list --location <region> --subscription <approved-subscription>
az cognitiveservices usage list --location <region> --subscription <approved-subscription>
az cognitiveservices account deployment list --name <approved-resource> --resource-group <approved-group> --subscription <approved-subscription>
az cognitiveservices account list-skus --name <approved-resource> --resource-group <approved-group> --subscription <approved-subscription>
```

## Verified retail price meters, not a per-image quote

The public pricing page rendered `$-`; catalog SKU `cost` was null. Initial
retail searches for capitalized Sunburst and hyphenated MAI model IDs returned
no records. Exact meter naming below resolved this: **missing search results
were not evidence that price was unavailable**.

Source: [Azure Retail Prices API](https://prices.azure.com/api/retail/prices).
Retrieved 2026-10-14, USD retail consumption rates, effective 2026-09-01,
unit `1M` tokens. No negotiated subscription discount, tax, or billing receipt
was inferred. Cache discounts are excluded from the proposed conservative
estimate.

| Model / region / Global meter | USD per 1M tokens | Exact meter ID |
| --- | --- | --- |
| Sunburst text input / eastus2 | 5 | `5c400fe2-5d18-5b6b-8b59-8130f65f6253` |
| Sunburst image input / eastus2 | 8 | `a41adadc-5a63-5b50-a0f5-4ce3f17b050e` |
| Sunburst image output / eastus2 | 30 | `fbe31b29-b615-5eec-b091-905bf7da614c` |
| MAI 2.6 basic text input / eastus | 5 | `9be59ef2-ac51-5eb5-bb55-62981442a110` |
| MAI 2.6 basic image input / eastus | 8 | `1b05259f-8606-547c-9f1b-61822533324c` |
| MAI 2.6 basic image output / eastus | 38 | `aa7cf024-1053-58f1-a205-3702b4b74924` |

Reproducible query filters (URL-encode before appending to `?$filter=`):

```text
productName eq 'MAI Models' and armRegionName eq 'eastus' and contains(meterName, 'Image 2.6')
armRegionName eq 'eastus2' and contains(meterName, '2.5') and (contains(productName, 'OpenAI') or contains(productName, 'GPT'))
```

Select only **basic** Image 2.6 meters, not Flash, from the first response.
Select only **sunburst**, not flare, from the second. Pagination must be
respected; these exact responses contained 5 and 10 items respectively with
no next page. A broad MAI query returned 1000 items and a next page; taking
its first entries would have produced a misleading quote.

A request estimate requires actual or verified upper-bound **text input,
two-image input, and output token counts**, multiplied by the corresponding
per-million rates. Pixel limits do not alone establish token counts. Image
edit default size/effort and token usage are unmeasured, so a fixed cost per
image, total pilot price, and worst-case cost bound are **not established**.
Billing may arrive later and includes failed/uncertain attempts where billed.
Do not equate list-price estimates with charges.

## Smallest proposed paid sequence

This was the initial proposal. The subsequently approved two-request smoke
failed with authorization errors; no quality outputs exist. Do not execute the
four-request expansion or repeat failed requests without new approval.

After exact resource/deployment/API/rights/budget authorization:

1. One identical person/garment pair on each selected model: **2 requests**,
   single output per request, no automatic retries. This is an API/shape smoke
   probe and must not be promoted to a quality-success conclusion.
2. Frontal/plain and different-pose/pattern pairs on both models: **4 total
   baseline requests**, if the smoke probe uses one of these pairs and outputs
   pass integrity checks. Review every output and failed attempt.
3. Add repeatability, modern color/stripe/logo/occlusion/background cases only
   under a separately approved expanded count and cost scope.

These counts are proposals, not paid authorization or statistically adequate
quality evidence. Two/four outputs cannot demonstrate broad garment fidelity,
tail latency, or reliable identity preservation. A concrete dollar bound is
blocked by unverified per-request token ceilings; an arbitrary USD budget
cannot make those ceilings true. If no approved managed model meets the
preservation requirement, report it as unmet rather than replacing it silently.

## Two-request smoke, then read-only authorization diagnosis

Actual sanitized metrics are in `smoke-results.json`. Sunburst/MAI each received
one edit request using the same normalized Met 286070 / Met 84219 pair, exact
`upper-body-v1` prompt, baseline controls, and process-only Bearer credentials.
HTTP 401 `PermissionDenied` at 05:00:18/05:00:27 UTC (14:00 KST), elapsed
5.097s/3.976s. Retries 0, outputs 0, response usage absent, billed cost unknown.
Failed requests consumed approval; no further image requests were made.
Approval was explicitly for private technical research and Azure transfer,
not commercial/promotional publication or a blanket subject-rights grant.

An initial control-plane key retrieval returned `BadRequest` because
`disableLocalAuth=true`; it did not acquire a key or submit an image. The two
approved image requests therefore used Entra authentication. Token contents,
principal oid, and credentials were kept internal and not persisted/published.

Read-only inspection after failure:

- Token audience matches `https://cognitiveservices.azure.com`, token tenant
  matches the approved subscription tenant, and token user matches the cached
  admin principal. Only boolean matching facts were emitted, no claim dump.
- Both resource `disableLocalAuth` values are **true**, unchanged.
- Using the actual token oid internally, resource-scoped role assignment
  queries included inherited and group assignments. On each resource, only
  inherited Owner (two assignments) and User Access Administrator were found;
  no inference-capable data-action role was found.
- The actual Owner definition has `DataActions=[]`. Owning/provisioning Azure
  resources does not grant Bearer data-plane inference access.
- Actual provider-operation metadata lists data actions
  `Microsoft.CognitiveServices/accounts/OpenAI/images/generations/action` and
  `Microsoft.CognitiveServices/accounts/MAI/images/action`; no separately
  named image-edit operation was found. Do not invent a custom edit action.

This evidence is consistent with missing inference RBAC as the 401 cause.
It does not prove a subsequent edit will succeed after permission changes;
route/API-version compatibility and quality remain untested.

Official Entra support:

- [MAI image guide](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-mai-image)
  gives Bearer auth using `https://cognitiveservices.azure.com/.default`;
  its edits section refers to the same authentication method.
- [Azure OpenAI RBAC](https://learn.microsoft.com/en-us/azure/foundry-classic/openai/how-to/role-based-access-control)
  explicitly supports inference with Microsoft Entra ID under OpenAI User.
  [GPT image guide](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/dall-e)
  also supplies Entra-based examples. Family auth support is not proof of exact
  Sunburst dated edit-route compatibility.
- [Built-in AI roles](https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles/ai-machine-learning)
  and actual Azure role definitions were checked.

**Proposed sufficient common built-in role, not assigned:**
`Cognitive Services User`, ID `a97b65f3-24c7-4388-baec-2e87135dc908`.
Its verified data actions include `Microsoft.CognitiveServices/*`, excluding
specific fine-tune deployment and impersonation actions. This covers both
OpenAI image and MAI image operations. It also grants read/key-list actions and
broad service data access **inside the assigned resource**; it is not claimed
to be the smallest conceivable custom permission set.

Scope proposal: only the two dedicated account resource IDs under
`<approved-subscription>/resourceGroups/rg-virtual-try-on/providers/Microsoft.CognitiveServices/accounts/`:
`vto-sunburst-eus2-b0af194e` and `vto-mai26-eus-b0af194e`.
Target: the verified current admin user's actual oid, resolved privately.
No group/subscription-wide assignment is necessary for this proposed remedy.

For Sunburst alone, `Cognitive Services OpenAI User`,
ID `5e0bd9bd-7b93-4f28-af87-19fc36ad61bd`, is narrower and officially supports
OpenAI inference; its definition does **not** include MAI image data actions.
It therefore cannot serve as the common two-model role. A custom role would
require additional investigation and explicit creation approval, not an
automatic fallback.

No permission assignment, local-auth change, credential switch, or additional
image request was performed. Prefer preserving `disableLocalAuth=true`.
The coordinator must obtain separate permission-change and fresh two-call
approval before applying a remedy or repeating the smoke. App hosting is
still outside scope.

### Subsequently approved resource-scoped assignments

The user then approved **only** the following two assignments to the already
verified cached admin user, whose oid remained private:

| Dedicated account scope | Actual role / ID | Verification |
| --- | --- | --- |
| `vto-sunburst-eus2-b0af194e` | Cognitive Services OpenAI User / `5e0bd9bd-7b93-4f28-af87-19fc36ad61bd` | Created; exact resource scope, principal, and role re-read and matched |
| `vto-mai26-eus-b0af194e` | Cognitive Services User / `a97b65f3-24c7-4388-baec-2e87135dc908` | Created; exact resource scope, principal, and role re-read and matched |

Execution on 2026-10-14 resolved the current token oid internally after checking
subscription-tenant/admin matching. It read each account ID and local-auth
state, searched for the exact existing principal/scope/role tuple, created
only if absent using `--assignee-object-id`, `--assignee-principal-type User`,
the exact role ID and resource ID, and re-read the tuple to verify existence.
All control-plane commands explicitly used the approved subscription.
No role assignment ID, oid, token, or claims were published.

Both exact assignments were absent before and present afterward.
`disableLocalAuth=true` was read and preserved for both. No subscription-wide
grant, custom role, other account/identity, hosting, deployment, or additional
image/API compatibility request was made. Role propagation can take minutes;
control-plane existence does not prove effective data-plane access or edit
compatibility at that diagnostic stage. **The original two-call approval was
still exhausted at that point.** Fresh
generation approval is required before testing the assignments with images.

The user subsequently granted fresh two-call approval with the same pair and
unknown-amount acceptance. Both exact routes returned valid PNGs after RBAC
propagation; a separate ledger consumed exactly one request per model, retries 0.
Original failures were retained. This validates the observed data-plane route/
auth combination, not general preservation or repeatability. Both outputs fail
the documented agent visual preservation/cut review. Lifetime attempts are 4;
both approvals exhausted, no additional calls authorized. See the separate
`second-smoke-results.json` and `second-smoke-review.md`; no output photos
are included in Git.

## Latest approved VITON-HD four-case batch

The user later approved the existing stripe pair for two requests and three
additional pinned VITON-HD cross-pairs for six requests. The separate
unknown-cost approvals covered exactly one Sunburst and one MAI basic request
per case. The executed order was sequential; all eight slots were consumed,
including failures. No automatic retry or additional API probe occurred.

| Model | Attempts | PNGs | Failures | Retry count | Median latency, all attempts |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sunburst | 4 | 2 | 2 (401 `PermissionDenied`, 429 `RateLimitReached`) | 0 | 11.343 s |
| MAI-Image-2.6 basic | 4 | 3 | 1 (401 `PermissionDenied`) | 0 | 23.779 s |

Sunburst successful usage per output was 246 text-input, 1,536 image-input,
and 386 image-output tokens. MAI successful usage per output was 440
text-input, 1,536 image-input, and 1,017 output tokens. Applying the previously
verified Azure Retail Prices API list rates gives conditional estimates of
$0.025098 per successful Sunburst output and $0.053134 per successful MAI
output, or **$0.209598 for the five successful outputs**. Failed attempts had
no usage object and are not assumed free. Actual billing remains unknown; no
invoice, discount, tax, delayed charge, or hard spending ceiling was verified.

All inputs were 768 × 1024 normalized PNGs without crop, resize, or square
padding. Sunburst outputs were 1086 × 1448 (same 0.75 aspect ratio); MAI
outputs were 880 × 1184 (approximately 0.743 aspect ratio). Both models
changed source pixel dimensions; the grid uses proportional contain-fit.
Case-level judgments, pattern/cut differences, and the local-only grid are
documented in `viton-hd-batch-review.md`.

### Read-only failure diagnosis

Every attempt was serialized; same-model start intervals ranged from 39.442
to 54.485 seconds for Sunburst and 24.121 to 53.344 seconds for MAI. The
HTTP 429 was not caused by concurrent requests or a rapid repeated call. It
does establish service throttling, but the sanitized response contains no
provider details or `Retry-After`; capacity 1 and deployment quota do not
specify an image request rate.

Before each call, the runner reacquired a Cognitive Services Entra token and
checked the subscription-scoped account, tenant, admin username, audience,
and expiry internally. A post-run read-only check matched the current token
principal to the exact resource-scoped OpenAI User role on Sunburst and
Cognitive Services User role on MAI. Both exact model/version deployments
still report GlobalStandard capacity 1 and Succeeded. The same configured
identity/deployment combinations succeeded on other cases in this batch, so
the two 401s do not establish a general missing-role or route failure. The
sanitized records intentionally omit token IDs and raw response bodies; they
cannot distinguish transient service behavior from request-specific
authorization handling. No image call, role change, or deployment change was
made to investigate further.

All eight VITON-HD attempts are exhausted. The upstream CC BY-NC 4.0
non-commercial terms, attribution/change requirement, absent individual
release/age verification, and remaining third-party-rights uncertainty still
apply. No input or output photo is included in Git.
