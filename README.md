# virtual-try-on-azure

Azure-only virtual try-on studio for **upper-only, lower-only, or upper+lower
full-set clothing**. Upload a person photo and the required garment references,
then explicitly select GPT Image 2.5 Sunburst,
MAI, or both. Only checked models run; changing the result view does not call
a model. No user-written prompt is required.

**Status:** local application/API/browser flows are implemented. Dedicated Azure
model resources and deployments were provisioned successfully on 2026-10-14.
App hosting has not been deployed. The experiment harness observed one HTTP 200
image edit per model after RBAC propagation; the application credential path has
not been live-tested. The initial two outputs failed the agent's visual
preservation review; only two outputs in a later four-case pilot passed its
rubric. These observations do not establish service quality or garment accuracy.
No sample illustration or test fixture is presented as a generated try-on result.

## Local run

Install Node 24 or later. In PowerShell, use `npm.cmd` if the execution policy
blocks the `npm.ps1` wrapper; no policy change is necessary.

```powershell
npm.cmd ci --ignore-scripts
Copy-Item .env.example .env
npm.cmd start
```

Open `http://127.0.0.1:3000`. The default UI previews local files and explicitly
shows that Azure generation is disconnected. There is no mock mode in the
application. `ENABLE_AZURE_INFERENCE=false` prevents all inference even if keys
are present. Do not enable it without explicit account and cost approval.

After generation approval, set these values in the ignored `.env` or hosting secrets:

| Model | Required settings |
| --- | --- |
| Sunburst | `AZURE_SUNBURST_ENDPOINT` (resource root `https://NAME.openai.azure.com`), `AZURE_SUNBURST_DEPLOYMENT`, `AZURE_SUNBURST_API_VERSION`, selected authentication mode below |
| MAI | `AZURE_MAI_ENDPOINT` (resource root `https://NAME.services.ai.azure.com`), `AZURE_MAI_DEPLOYMENT`, `AZURE_MAI_MODEL=MAI-Image-2.6`, selected authentication mode below |
| Paid-call gate | `ENABLE_AZURE_INFERENCE=true`, only after authorization |

### Provisioned model configuration

The experiment track reported the following control-plane deployments as
`Succeeded` in resource group `rg-virtual-try-on`. These are secret-free resource
coordinates, not proof of a successful image edit. `.env.example` contains the
matching endpoint/deployment values, blank API keys and inference disabled.

| Model | Resource / region | Deployment | Model version | SKU / capacity |
| --- | --- | --- | --- | --- |
| Sunburst | `vto-sunburst-eus2-b0af194e` / `eastus2` | `tryon-sunburst` | `gpt-image-2.5-sunburst`, `2026-09-08` | `GlobalStandard` / 1 |
| MAI basic | `vto-mai26-eus-b0af194e` / `eastus` | `tryon-mai26` | `MAI-Image-2.6`, `2026-07-31` | `GlobalStandard` / 1 |

Use `https://vto-sunburst-eus2-b0af194e.openai.azure.com` for Sunburst and
`https://vto-mai26-eus-b0af194e.services.ai.azure.com` for MAI. These origins
were reported from Azure's service-specific `properties.endpoints`; the generic
`cognitiveservices.azure.com` endpoint is not compatible with these adapters.
The **model version is not the HTTP API version**. Provisioning success does
not validate the configured Sunburst `2025-04-01-preview` edits contract.
Both resources have `disableLocalAuth=true`; API-key mode cannot authenticate
to them. The first approved research smoke call to each model returned HTTP 401,
with no outputs and no retries. Control-plane Owner access did not provide the
required inference DataActions. The experiment track subsequently reported
resource-scoped OpenAI User (Sunburst) and Cognitive Services User (MAI)
assignments for the approved admin principal. A separately approved second smoke
run then returned HTTP 200 for each model using fresh Cognitive Services bearer
tokens. This verifies the harness routes/authentication for those deployments,
not the application's AzureCliCredential execution path or general model quality.
Those historical permission changes did not authorize additional generation or app hosting.
The later hosted verification and current paid-demo policy are recorded below.

### Observed smoke results (2026-10-14)

The experiment track reported the same normalized person/garment inputs and
`upper-body-v1` prompt for its second smoke run:

| Model | HTTP / output | Harness duration | Agent visual review |
| --- | --- | --- | --- |
| Sunburst | 200 / PNG 1120 x 1405 | 32.414 s | Not accepted: hand occlusion changed, original right-side signature removed, shirt gathering/seams/hem differed |
| MAI basic | 200 / PNG 912 x 1152 | 29.378 s | Not accepted: hand occlusion changed, torso silhouette expanded, hem not preserved |

The garment changed, but **0 of 2 outputs passed this agent review**. Output
resolution/aspect ratio did not exactly match the original. This single pair is
not a benchmark, independent quality assessment or proof of face/pose/logo
preservation or physical fit. At that checkpoint, no additional app calls or hosting were approved.
Across both smoke runs: four total calls (two 401, two 200), zero automatic
retries; both call authorizations are exhausted.

Evidence was published by the experiment track in
[commit ec07e79](https://github.com/EON-LEE/virtual-try-on-azure/commit/ec07e79),
including `experiments/second-smoke-results.json` and
`experiments/second-smoke-review.md`. The reported usage-based retail estimates
were USD 0.036974 (Sunburst) and USD 0.152260 (MAI); **actual billing is unknown**.
These are not fixed prices or approval for more calls. Private research images
are not embedded in the application or this document.

The later VITON-HD pilot used four unpaired cases: eight approved attempts,
five valid PNGs, three failures and no retries. Only stripe/Sunburst and
lettered-print/MAI passed the agent's visual pilot rubric, not a ground-truth or
service-quality assessment. Graphic/MAI invented a **BOSS wordmark absent from
the garment reference**; both floral outputs failed to preserve the collar/
placket. Models can invent lettering or brands, not just change patterns.
Compare every result with both source images; garment accuracy is not guaranteed.
Two attempts returned 401 and one returned 429; exact causes remain unresolved.
The conditional usage-based estimate for five successful outputs was USD
0.209598; actual billing is unknown, and failed calls are not assumed free.
Evidence: [commit a63a9ad](https://github.com/EON-LEE/virtual-try-on-azure/commit/a63a9ad),
`experiments/viton-hd-batch-review.md`. Totals at that pilot checkpoint were twelve attempts and
seven outputs; these are not current lifetime usage or the current demo policy.

### Authentication modes

`AZURE_AUTH_MODE=key` preserves the API-key integration for resources where
local authentication is allowed. It requires the selected model's
`AZURE_SUNBURST_API_KEY` or `AZURE_MAI_API_KEY`. It never falls back to Entra.

`AZURE_AUTH_MODE=entra-cli` uses only the official `AzureCliCredential`, with
explicit `AZURE_SUBSCRIPTION_ID`, `AZURE_TENANT_ID` and
`AZURE_EXPECTED_PRINCIPAL_ID` (the approved admin user's object ID). Set these
UUIDs privately in `.env`; the example leaves identity values blank and
inference disabled. Enabled inference refuses incomplete identity configuration.
Run the backend in the same OS/CLI environment containing the existing approved
admin authentication. A WSL CLI cache is not automatically visible to the Windows
backend; do not compensate by changing the shared login or default subscription.

Before acquiring or refreshing a token, the backend reads
`az account show --subscription <explicit-id>` and checks subscription, tenant,
Enabled state and user credential type. `AzureCliCredential` is pinned to that
subscription/tenant. The SDK-acquired token's tenant, principal, Cognitive
Services audience and expiration must match before sending any image request.
JWT claim inspection is an identity guard, not independent signature validation;
Azure validates the token. Any mismatch or CLI/SDK failure returns a sanitized
error before inference, without switching accounts or falling back to keys.

The official `getBearerTokenProvider` builds the bearer header for
`https://cognitiveservices.azure.com/.default`. The backend caches the validated
token in process memory and synchronously refreshes within two minutes of
expiration, coalescing concurrent refreshes. A refresh failure blocks the request
rather than using the helper's background-refresh behavior or retrying silently.
No bearer token reaches the browser, `.env`, application logs or committed files.
Reusing a cached verified token does not follow later shared CLI identity changes;
refresh verifies the pinned identity again. Readiness means configuration is
present, not that credentials/RBAC have been live-validated. Disabled inference
does not run the account check or acquire a token. Tests use stub credentials and
stub HTTP only; no live authentication or inference is performed by the tests.

References:
[AzureCliCredential options](https://learn.microsoft.com/en-us/javascript/api/@azure/identity/azureclicredentialoptions)
and [Azure Identity bearer token helper](https://learn.microsoft.com/en-us/javascript/api/@azure/identity/?view=azure-node-latest).

`AZURE_AUTH_MODE=managed-identity` is the explicit hosted connection. It uses
`ManagedIdentityCredential` pinned to `AZURE_MANAGED_IDENTITY_CLIENT_ID`, not a
default credential chain or personal CLI cache. `AZURE_TENANT_ID` and
`AZURE_EXPECTED_PRINCIPAL_ID` pin the managed identity's token claims with the
same audience/expiry guards and process-only cache. CLI checks apply only to
`entra-cli`. No key fallback or image retry occurs. The deployment template
supplies all three IDs from the user-assigned identity, and grants only the
approved resource-scoped inference roles. Hosted managed-identity authentication
and both edits routes passed six approved image calls across all three modes.
Disabled inference acquires no model token.

MAI Image 2.6 basic is the **user-confirmed quality-first variant** and is shown
as Preview. Flash and other variants are rejected rather than substituted.
Changing a deployment name does not prove that it contains the intended model:
the operator must verify its actual model/version in Azure. Resource endpoint
validation only permits the supported Azure domains; there is no external fallback.

Non-loopback binding requires an HTTPS `APP_ORIGIN`. The demo login is
**username `test`, password `test`**, verified by the server before issuing an
HttpOnly, Secure (HTTPS), SameSite=Strict session cookie. No invitation token or
local secret-file reading is required. The old token-login request is rejected.
These intentionally public, weak credentials are a demo convenience, **not
private access or production security**; do not reuse them for a real service.
Login requests are rate limited. The current user-approved paid demo uses
`DEMO_INFERENCE_MODE=unlimited`: login is enough to generate, including after
a cold start. There is **no total-call cap, automatic expiry or guaranteed cost
ceiling**. Anyone with these public credentials can incur charges. The operator
secret is only for the optional bounded mode, never the login form.

## Editing contract and limitations

`src/prompt.js` exports the five-line `upper-body-v1` fixed instruction shared
with the experiment track. Image 1 is the person/base photograph; image 2 is
the garment reference. The backend asks to preserve face, body, pose, hands,
background and garment details. These are instructions, **not guarantees**.
This preview does not measure physical fit or size.

The original baseline remains unchanged for legacy requests with `person` and
`garment` and no `mode`. The live UI explicitly uses these new contracts:

| `mode` | Required image fields (order sent) | Server-owned prompt version |
| --- | --- | --- |
| `upper` | `person`, `upper` | `upper-only-v2` |
| `lower` | `person`, `lower` | `lower-only-v1` |
| `full` | `person`, `upper`, `lower` | `upper-lower-set-v1` |

`src/modes.js` preserves the non-target clothing, shoes/accessories, skin/hair,
body/pose/hands, background, white balance and exposure in each instruction.
Full set means separate upper and lower garments, not a dress or shoes. Missing,
extra or duplicate references are rejected, not inferred. Use a full-body image
showing waist, legs, feet and occlusion for lower/full tests. Three images are
within the documented GPT Image family maximum of 16 and MAI maximum of five,
but **lower/full edits have not been live-tested** on these deployments.
The new prompts are not equivalent to the previous upper-body-v1 experiments.

The studio shows person, garment reference(s) and the selected model's result;
selecting both models expands the workspace to four columns, with Sunburst then
MAI. Images use `object-fit: contain` without cropping to hide
differences; click to enlarge. Result cells show actual state/errors/duration.
New live outputs receive no pre-existing agent verdict or fake automatic score.
Manual verdicts/notes are local browser memory only and reset on input changes,
new generation, clearing or refresh. Compare skin/hair color, protected
non-target areas and garment color/pattern/texture/logos/cut explicitly.
Manual review is collapsed below each result so it does not reduce image space.
The studio workflow is person (upload or sample), garment (upload or sample),
model selection, then create. Samples are loaded from the same-origin
`public/samples/manifest.json`; selection uses the actual image bytes as the
request input, never a fake output, and does not call Azure until submission.
Sample sources/licenses are recorded in the manifest and shown in photo help.
The published pack has three person photos, four upper garments and three lower
garments. The seated person sample supports upper mode only; the client disables
it for lower/full, and the server rejects its known input hash even if uploaded
under another filename. This is a known-sample guard, not automatic full-body
detection for arbitrary uploads. A folded striped shirt, partially occluded
skirt and low-resolution shorts have reference limitations recorded in photo help.
Sources, changes and license obligations are available through the footer's
`사진 출처` link to `/samples/NOTICES.txt`. BY-SA assets and shared adaptations
retain applicable attribution/ShareAlike obligations; generated images are not
universally unrestricted. The stock platform's uploader assurances were used;
individual model releases and age records were not independently inspected.

Inputs are single-frame PNG/JPEG, at most 10 MiB each, 4096 pixels per side and
20 megapixels. Sharp applies EXIF orientation and removes metadata by PNG
re-encoding without resizing. Both selected models receive the same normalized
buffers, person first and garment second. PNG encoder differences mean a
cross-tool experiment must reuse the exact prepared bytes, not just equivalent
pixels, for a strict paired comparison.

| Adapter | Request contract |
| --- | --- |
| Sunburst | Azure dated deployment `images/edits`, repeated `image[]`, `model`, fixed `prompt`, `n=1` |
| MAI Image 2.6 | Azure `/mai/v1/images/edits`, repeated `image`, `model`, fixed `prompt`, `web_grounding=false` |

No mask, fidelity, size, quality, seed or aspect-ratio fields are guessed or
sent. MAI's documented Image 2.6 edits control `web_grounding=false` explicitly
disables additional Bing context. `2025-04-01-preview` comes from the official GPT Image family example and
is configurable. The second approved harness smoke observed HTTP 200 for this
exact dated Sunburst route; this does not establish compatibility for every
deployment/version or validate the application's credential path.
Provider response must contain one base64 image; arbitrary returned URLs are
not fetched. Requests time out after 180 seconds, with no paid retry or fallback.
Azure may continue processing and billing after a timeout or client cancellation.

Reference documentation, reviewed 2026-10-14:
[GPT Image](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/dall-e)
and [MAI Image](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-mai-image).
Availability, quota, pricing, model/version and regional processing must still
be checked in the approved subscription before a live call.

## Privacy and lifecycle

Photos and results are not written to disk, logged, or committed. Original
browser previews remain local until generation is submitted with photo-use
consent. Backend inputs live only while processing; results expire from server
memory ten minutes after completion. A session expires after thirty minutes.
Clearing the UI deletes that session's server jobs and browser blob previews;
it cannot guarantee cancellation of already accepted Azure work.

Job ownership is bound to the session cookie. Same-origin host/header checks,
bounded uploads, decoder limits, at most eight retained jobs, one active job per
session, and request-ID deduplication limit accidental duplicate submissions.
Deduplication lasts only while the job is retained; this is not an Azure billing
idempotency guarantee. Secrets and raw Azure errors are never returned to clients.
Server restarts/revisions lose in-memory jobs and sessions.

Azure data processing/retention is separate from application retention. Global
deployments may process outside the resource region; Azure-only does not mean
Korea-only processing. Do not use sensitive photos without appropriate consent.

## Checks

```powershell
npm.cmd test
npm.cmd run check
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

If downloading Chromium is blocked but Microsoft Edge is installed:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm.cmd run test:e2e
```

API tests inject a synthetic image provider and assert selection, form fields,
metadata stripping, isolation, deduplication, expiry, quota failure and no retry.
Browser tests launch `e2e/server.js` with clearly test-only colored PNG responses.
These check UI wiring, **not real model fidelity**. Normal `npm start` never loads
that fixture. CI also builds the container and compiles Bicep; it does not deploy.

## Approved demo hosting configuration

`Dockerfile` runs as a non-root user. The approved `infra/main.bicep` creates
an eastus2 Consumption Container Apps environment/app (0.5 vCPU, 1 GiB),
dedicated eastus ACR Basic registry (admin keys disabled), and eastus user-assigned
managed identity. The initial eastus environment failed with regional capacity
exhaustion; the approved single eastus2 fallback succeeded. The failed eastus
environment was not deleted. Exactly three role assignments are scoped to the Sunburst resource
(OpenAI User), MAI resource (Cognitive Services User) and registry (AcrPull).
Existing model resources/local-auth settings are not changed. HTTPS external
ingress exposes the static login and published sample assets. Uploads, jobs and
result images require the server-issued demo login session cookie. The public
test/test account is not per-user enterprise SSO or a private access boundary.

Single revision/max replica 1 preserves session ownership; min replica 0
reduces idle compute but introduces cold starts and loss of in-memory sessions/
jobs on restart/scale-down. Registry storage has ongoing cost, even with
inference disabled; Consumption compute/requests and image build may also incur
charges. No fixed monthly estimate or free-service claim is made.

The image contains only Dockerfile/package manifests, `src/` and `public/`
from a clean tracked commit. Never include private reports, dataset images,
photos, `.env`, CLI caches or access secrets in build context. Private registry
pull is handled by the assigned managed identity, not registry passwords.
No model deployment or Fabric is created.

### Paid demo modes

Both modes require `ENABLE_AZURE_INFERENCE=true`, configured model credentials
and explicit account/cost approval. The default remains inference-disabled.

**Current approved user demo:** `DEMO_INFERENCE_MODE=unlimited`. It does not use
the attempt cap, expiry, operator nonce or per-boot activation. The deployment
stores this mode in the Container App environment; a min0 cold start remains
ready after ordinary test/test login. Sessions and result images are still
temporary and are lost on restart. No persistent helper, min1 replica, new
storage or extra role is needed. Public weak credentials plus unlimited paid
calls create abuse/cost risk, not a private or cost-capped service.

Both modes retain one active job globally, two submissions/minute, request-size
limits, 180-second provider timeout, explicit model selection and no automatic
retry. Frequency/concurrency protection is **not** a total-use or monetary cap.

To stop new paid requests on the existing deployment:

```powershell
wsl.exe -d Ubuntu --exec /home/eonlee/.local/bin/az containerapp update --subscription b0af194e-77a5-4471-bb43-67e78295b5c8 --resource-group rg-virtual-try-on --name vto-studio-b0af194e --set-env-vars ENABLE_AZURE_INFERENCE=false --query properties.latestRevisionName -o tsv
```

This creates a disabled revision; also keep `enableInference=false` in the next
deployment parameters to avoid re-enabling it. Accepted work may still incur
charges after cancellation, timeout or disabling. Check Azure usage; do not
assume failed attempts are free.

**Optional bounded technical verification:** `DEMO_INFERENCE_MODE=bounded`.
Hosted inference in this mode requires all of:
`ENABLE_AZURE_INFERENCE=true`, `DEMO_MAX_MODEL_ATTEMPTS` (1-100), and future
`DEMO_INFERENCE_EXPIRES_AT` (ISO timestamp), **and one operator activation for
the current process boot**. Zero allowance closes jobs, including
local jobs; examples/hosting deploy default false/zero. One global active job,
two submissions/minute, 30-second bounded uploads (max three 10 MiB images),
180-second provider timeout and session/request-ID guards limit accidental abuse.
An explicit two-model comparison reserves two attempts; failures/cancellations
do not refund attempts. Clearing photos/sessions cannot reset the counter or
free an active slot before provider completion. Reservations avoid races.

In bounded mode, every process starts with its paid gate closed, even when environment settings
permit inference. Restart, revision rollout and min0 cold start do **not**
automatically replenish an enabled allowance: the new boot must be explicitly
activated by the operator after authorization. Activation requires its current
random boot nonce, a positive allowance within the configured cap, and a future
expiry no later than the configured expiry. A boot can activate only once;
exhaustion/expiry cannot be recharged or reopened on that boot.

`DEMO_OPERATOR_TOKEN` is a separate 32+ character operator credential, unrelated
to the demo login. Only an operator can POST `/api/operator/state` to obtain the
boot nonce, then POST `/api/operator/activate` with JSON
`{ "nonce": "...", "allowance": 2, "expiresAt": "approved ISO timestamp" }`.
Both endpoints require `x-studio-request: 1` and `x-operator-token` headers.
URL query parameters are rejected. Secrets are compared in constant time after
hashing; operator requests have a process-wide eight-per-minute limit.
Ordinary demo credentials/session cookies cannot obtain the nonce or activate.
For an approved technical smoke, operators can set `sessionOnly: true` on the
activation request and send their current studio session cookie. Only that
session can spend its allowance; another public test/test login cannot consume
the verification budget. This option does not authorize additional user calls.
Do not activate a bounded deployment without a paid-generation approval.

After login, the browser verifies that the session cookie was actually retained.
If an embedded browser blocks it, the login screen asks the user to retry in a
standalone browser tab; cookie policy is not weakened. Session expiry returns to
login. Configuration and post-generation refresh reflect actual availability
without hiding finished images. A bounded health keepalive is used only
during an approved live smoke and stops when that script exits; no always-on
helper or automatic budget refill is provided.

**This is not durable billing enforcement or a monetary cap.** Counters and
operator rate limits are process-local, and an explicitly authorized new boot
can receive a new allowance. Single revision/max replica1 is required; do not
scale out or activate multiple revisions. Monitor usage, use a short approved
window for bounded verification. Azure may still bill accepted work
after expiry, timeout or cancellation. No storage or extra cloud roles were added.

Compile without resource changes:

```powershell
az bicep build --file infra\main.bicep --stdout > $null
docker build -t try-on-studio:local .
```

An operator must approve the account, subscription, location, hosting/model
costs and model deployments before executing a deployment. Use the existing
approved Azure identity with explicit `--subscription`; never change a shared
login or default. Supply secure Bicep parameters from a private, ignored file or
secure automation input rather than exposing secrets in command history.
Deploy the foundation first (`deployApp=false`), build the tracked clean image
into its registry, then deploy with `deployApp=true` and an immutable commit tag.
Use the same private secure-parameter file across both deployments and do not
print it. Keep `enableInference=false`, `maxModelAttempts=0`. The deployment
operator stores the separate operator secret in ACL-restricted,
ignored `.local-deploy\demo-operator-token.txt`; `scripts/prepare-deployment.js` preserves
existing values and writes secure parameters without printing secrets. On Windows
the directory must have an operator-only inherited ACL before running that script.
Never share the operator secret in chat/logs/Git or with demo users.
Verify `/healthz`, unauthenticated API rejection, test/test login/logout and mode controls without any
image calls. Template compilation is not proof of live authentication/quality.

### Hosted verification

The demo is hosted at
<https://vto-studio-b0af194e.purpleground-f12dc511.eastus2.azurecontainerapps.io>.
Fresh Edge login, all ten public samples, three modes, real managed-identity
edits, result enlargement and PNG downloads passed the approved six-attempt
hosted verification. All six succeeded, with zero retries or browser errors:

| Mode | Sunburst | MAI |
| --- | --- | --- |
| Upper | 28.602 s | 26.127 s |
| Lower | 22.231 s | 20.928 s |
| Full set | 19.686 s | 26.671 s |

These are technical successes, **not fidelity acceptance**. Visual inspection
shows garment changes, but color, trim and fit differ; exact face/pose/pattern
preservation is not established. The six-attempt verification ended closed
with zero remaining attempts and its temporary keepalive stopped. The user's
subsequent explicit unlimited-demo request supersedes that bounded user policy;
the old verification record must never be rerun.

`node scripts/check-hosted.js <HTTPS origin>` is for a **disabled bounded**
deployment only. It verifies
health, demo login/session controls, disabled submission and closed operator
state without activating or sending any image request to a provider.

## Accounts

| Purpose | Account |
| --- | --- |
| Local development and the shared Copilot/`gh` session | `eonlee_microsoft` (EMU) |
| Authorized writes to this personal repository | `EON-LEE` |

Keep the shared login unchanged. Do not run `gh auth switch`, `gh auth logout`,
`gh auth setup-git`, or change global Git credential settings for a session.
If authentication is missing, stop and coordinate with the user before logging in.
Never print, persist, or commit tokens.

## Git workflow

1. Work on the session's feature branch, not in the main checkout.
2. Review the diff and run the checks relevant to the change.
3. Commit only the intended files with a short, descriptive message.
4. Push the feature branch using the existing URL-scoped `EON-LEE` Git configuration.
5. Merge only when the user authorizes it. Prefer a pull request and squash merge
   for application changes. For an explicitly authorized initial setup, a
   non-force fast-forward push of the feature commit to `main` is sufficient.
6. Confirm the remote contains the expected commit and the working tree is clean.

Git already loads the URL-scoped authentication header from
`~/.gitconfig-eonlee-auth` for this repository. Use ordinary `git fetch` and
`git push`; do not add a second `include.path` for that file. Including it twice
produces a duplicate `Authorization` header and an HTTP 400 error.

The following PowerShell example checks the command-scoped GitHub write identity
and pushes the current branch through the existing Git configuration. It requires
an `EON-LEE` credential in the `gh` keyring. It leaves both the shared login and
the existing authentication file unchanged.

```powershell
$previousToken = $env:GH_TOKEN
try {
    $authConfig = Join-Path $HOME '.gitconfig-eonlee-auth'
    if (-not (Test-Path $authConfig)) {
        throw 'Existing EON-LEE Git authentication file is unavailable.'
    }
    $token = gh auth token --hostname github.com --user EON-LEE
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($token)) {
        throw 'EON-LEE credentials are unavailable. Do not change the shared login.'
    }
    $env:GH_TOKEN = $token
    $login = gh api user --jq .login
    if ($LASTEXITCODE -ne 0 -or $login -ne 'EON-LEE') {
        throw 'Unexpected GitHub write identity.'
    }
    git push --set-upstream origin HEAD
    if ($LASTEXITCODE -ne 0) {
        throw 'Feature branch push failed.'
    }
}
finally {
    $env:GH_TOKEN = $previousToken
    Remove-Variable token -ErrorAction SilentlyContinue
}
```

Use the same command-scoped identity for authorized PR and merge operations.
If permissions or branch protection block a write, report the error; do not
switch the shared account, force-push, or bypass protection.