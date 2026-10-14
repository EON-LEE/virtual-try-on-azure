# Verified Azure evidence, 2026-10-14

**Live image-edit requests: 0. Generated try-on outputs: 0.**
The following distinguishes public documentation, read-only control-plane
observations, list prices, and untested inference. It is not a success case.
MAI-Image-2.6 **basic** was subsequently confirmed by the user; Flash is excluded.
The admin subscription was authorized for investigation, then the user approved
the dedicated resource group, two AI resources, and the exact model deployments.
Provisioning succeeded as documented below. Existing-project reuse, paid probes,
and experiment budget remain unapproved.

## Official API documentation

- [Azure GPT image how-to](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/dall-e):
  model-specific table lists Sunburst GA, text+image input, inpainting, custom
  sizes and quality. Sunburst face-preservation table cell is empty. The
  family edit section gives multipart `image[]`, deployment-based edit route,
  up to 16 PNG/JPEG references under 50 MB each. Its example versions differ
  (`2025-04-01` prose, `2025-04-01-preview` quickstart). The harness candidate
  route uses the explicit preview version; exact Sunburst compatibility is
  **untested**. Generic mask/fidelity sections do not prove Sunburst support.
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
