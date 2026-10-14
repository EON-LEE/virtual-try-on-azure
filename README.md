# virtual-try-on-azure

Azure-only virtual try-on studio for **upper-body clothing**. Upload a person
photo and a garment reference, then explicitly select GPT Image 2.5 Sunburst,
MAI, or both. Only checked models run; changing the result view does not call
a model. No user-written prompt is required.

**Status:** local application/API/browser flows are implemented. Dedicated Azure
model resources and deployments were provisioned successfully on 2026-10-14.
App hosting has not been deployed. The experiment harness observed one HTTP 200
image edit per model after RBAC propagation; the application credential path has
not been live-tested. Both outputs failed the agent's visual preservation review.
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
Those permission changes do not authorize additional generation or app hosting.
Keep inference disabled until another explicit generation approval.

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
preservation or physical fit. No additional app calls or hosting were approved.
Across both smoke runs: four total calls (two 401, two 200), zero automatic
retries; both call authorizations are exhausted.

Evidence was published by the experiment track in
[commit ec07e79](https://github.com/EON-LEE/virtual-try-on-azure/commit/ec07e79),
including `experiments/second-smoke-results.json` and
`experiments/second-smoke-review.md`. The reported usage-based retail estimates
were USD 0.036974 (Sunburst) and USD 0.152260 (MAI); **actual billing is unknown**.
These are not fixed prices or approval for more calls. Private research images
are not embedded in the application or this document.

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

MAI Image 2.6 basic is the **user-confirmed quality-first variant** and is shown
as Preview. Flash and other variants are rejected rather than substituted.
Changing a deployment name does not prove that it contains the intended model:
the operator must verify its actual model/version in Azure. Resource endpoint
validation only permits the supported Azure domains; there is no external fallback.

Non-loopback binding requires `APP_ACCESS_TOKEN` (32+ characters) and an HTTPS
`APP_ORIGIN`. Users unlock the UI with that token; it is exchanged for an
HttpOnly, SameSite session cookie, not stored in browser local storage. Public
deployments need an HTTPS reverse proxy. Do not expose the loopback development
server with an unauthenticated tunnel. The shared-token demo is not a substitute
for per-user enterprise identity, access auditing, or production authorization.

## Editing contract and limitations

`src/prompt.js` exports the five-line `upper-body-v1` fixed instruction shared
with the experiment track. Image 1 is the person/base photograph; image 2 is
the garment reference. The backend asks to preserve face, body, pose, hands,
background and garment details. These are instructions, **not guarantees**.
This preview does not measure physical fit or size.

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

## Deployment configuration (approval required)

`Dockerfile` runs the production app as a non-root user. `infra/main.bicep`
defines HTTPS Azure Container Apps hosting, secret environment variables,
health probes and one replica/revision because sessions/jobs are in memory.
It does **not** create model deployments, pick a subscription, enable inference
by default, or install Fabric. The minimum of one replica incurs hosting costs
even when inference is disabled. The template requires an existing publicly
pullable immutable container image reference; private-registry wiring is not
included. Never publish photos, keys, or `.env` in the image.

The current container/template retains the original **key-mode hosting
configuration** and does not install Azure CLI, provision managed identity or
assign roles. It cannot authenticate to the currently key-disabled resources.
Entra CLI mode is a local development connection, not a cloud hosting solution.
Identity-based hosting requires a separate approved design/provisioning change;
do not package personal CLI caches into a container or enable local auth to
work around this limitation.

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
Deploy to an explicitly approved resource group using `az deployment group
create --subscription <approved-id> --resource-group <approved-group>
--template-file infra\main.bicep --parameters @<private-parameters.json>`.
Start with `enableInference=false`, inspect `/healthz` and access control, then
configure only verified model deployments and enable approved experiments.
No deployment or model quality claim should be based on template compilation.

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