# Operations

These are current application contracts, not authorization to deploy or call
models. Historical evidence is in [application development](history/application-development.md)
and [experiment records](../experiments/README.md). Existing resources and
settings must be verified under the approved identity before a live operation.

## Identity and model configuration

`.env.example` has the resource coordinates, empty credentials and inference
disabled. Model endpoints must be Azure resource roots, not generic
`cognitiveservices.azure.com` origins.

| Model | Resource / region | Deployment | Catalog version |
| --- | --- | --- | --- |
| Sunburst | `vto-sunburst-eus2-b0af194e` / eastus2 | `tryon-sunburst` | `gpt-image-2.5-sunburst`, 2026-09-08 |
| MAI basic | `vto-mai26-eus-b0af194e` / eastus | `tryon-mai26` | `MAI-Image-2.6`, 2026-07-31 |

Both are GlobalStandard capacity 1 with local key authentication disabled.
The Sunburst HTTP API version `2025-04-01-preview` is distinct from its catalog
version. Actual deployment model/version and permissions require control-plane
verification; configured readiness is not proof of working credentials.
MAI Flash or another variant is never silently substituted.

| `AZURE_AUTH_MODE` | Explicit configuration and behavior |
| --- | --- |
| `key` | Selected model's API key; only for resources permitting local auth. No Entra fallback. Not usable on the current resources. |
| `entra-cli` | Official AzureCliCredential, pinned subscription/tenant/principal UUIDs. Reads account state before each token acquisition/refresh. Run in the OS containing the approved CLI cache. |
| `managed-identity` | Hosted ManagedIdentityCredential pinned to user-assigned client ID, tenant and principal. No CLI/default credential chain. |

Tokens must match tenant, principal, Cognitive Services audience and expiry.
Claim inspection is an identity guard; Azure verifies signatures. Verified
tokens stay in process memory; refresh within two minutes of expiry coalesces
concurrent requests. Refresh failure blocks inference rather than using an old
token or falling back. Disabled inference acquires no token. Errors are sanitized.
Never change shared Azure login/defaults to repair a session, or print tokens,
keys, cookies, photo bodies or raw provider errors.

## Paid-call controls

Default `ENABLE_AZURE_INFERENCE=false` prevents generation.
Both modes require explicit account/cost approval and configured models.

| Mode | Admission policy |
| --- | --- |
| Approved hosted `unlimited` | No total-call cap, expiry or per-boot activation. Ordinary test/test login can generate after cold start. Public credentials plus paid access create abuse/cost risk. |
| Optional `bounded` | Positive `DEMO_MAX_MODEL_ATTEMPTS` (1–100), future `DEMO_INFERENCE_EXPIRES_AT` and one activation of the current boot. Starts closed; exhausted/expired allowance cannot be recharged on that boot. |

Both retain one global active job, two submissions/minute, input limits,
explicit model selection and **zero automatic paid retries**. A two-model job
reserves two attempts in bounded mode. Failed/cancelled/uncertain attempts are
not refunded. Process-local controls are not a durable monetary cap.

Bounded operators use a separate 32+ character `DEMO_OPERATOR_TOKEN`.
POST `/api/operator/state` returns the boot nonce; POST
`/api/operator/activate` accepts `{ nonce, allowance, expiresAt }`.
Both require `x-studio-request: 1` and `x-operator-token`, reject URL query
parameters and share an eight-request/minute limit. Activation cannot exceed
configured allowance/expiry. `sessionOnly: true` additionally requires a current
demo session and restricts spending to it. Demo credentials cannot activate.
Do not activate based on an old record or an exhausted experimental approval.

To disable new paid requests, an authorized operator can update the existing app:

```powershell
wsl -d Ubuntu -- sh -lc 'az containerapp update --subscription b0af194e-77a5-4471-bb43-67e78295b5c8 --resource-group rg-virtual-try-on --name vto-studio-b0af194e --set-env-vars ENABLE_AZURE_INFERENCE=false --query properties.latestRevisionName -o tsv'
```

This creates a revision. Also preserve `enableInference=false` in subsequent
deployment parameters. Accepted work may still finish and be billed.

## Timeouts, logs and recovery

Login, startup config/manifest and generation acceptance allow 120 seconds per
request for min0 cold starts. Ordinary API/image requests allow 30 seconds;
upload receipt is bounded server-side at 30 seconds. Provider HTTP allows
180 seconds; the whole job has a 210-second deadline including identity work.
Browser polling allows 240 seconds after acceptance. These cover different phases.

Duplicate login/submit actions are blocked. Late startup responses cannot replace
new login state; stale input/result responses are ignored. Korean errors keep
login inputs for manual retry. Cookie rejection does not weaken SameSite/Secure.
Session expiry returns to login; logout also works after a server restart.
Network/timeout/lost-job errors end the busy display but do not prove Azure
cancellation or free processing.

The collapsed execution record and server JSON events link safe request/job/provider
IDs with stages and status. They exclude secrets/photos/raw bodies.
An old open page cannot be patched in place or recover a lost memory-only job.
A version mismatch offers manual refresh, never automatic generation replay.

## Hosting and builds

Approved topology: eastus2 Consumption Container App/environment, 0.5 vCPU/1 GiB,
single active revision, min0/max1; private eastus ACR Basic and user-assigned
identity. Exactly three resource-scoped roles cover Sunburst OpenAI User,
MAI Cognitive Services User and registry AcrPull. The failed earlier eastus
environment was not deleted. Storage/build/requests/compute can incur charges
even while inference is disabled; no fixed monthly or free-service claim is made.

Restarts/revisions/scale-to-zero discard sessions/jobs/results. Do not scale out
or enable multiple revisions without a separate persistence/ownership design.
The Docker image runs non-root. Build context must contain tracked code/metadata
plus only the 14 verified research JPEGs, not private reports, uploads, CLI caches,
`.env`, approvals or secrets. Authentication does not waive research licenses.

```powershell
az bicep build --file infra\main.bicep --stdout > $null
# Only after reviewing sample rights and preparing the ignored private pack:
node scripts\prepare-samples.js
docker build -t try-on-studio:local .
```

Compilation/build is not deployment or evidence of live model quality.
An approved deployment uses explicit subscription, a private secure parameter
file, foundation first (`deployApp=false`), private image build, then
`deployApp=true` with an immutable commit tag. Keep inference disabled unless
separately authorized. `scripts\prepare-deployment.js` preserves an existing
operator secret and writes disabled parameters under ignored `.local-deploy`;
on Windows set operator-only directory ACLs before running it.
Do not print secrets or put them in command history.

## Non-paid hosted checks

`node scripts\check-hosted.js <HTTPS-origin>` runs read-only API/sample checks
plus login/logout, with no model submission or operator secret. An explicit
`disabled` or `ready` argument checks that expected post-login model state.
`node scripts\check-studio.js <HTTPS-origin>` additionally verifies ready-state
browser selection, images and screenshots without pressing Create.
These checks do not activate bounded mode or assert generated-image quality.
Use offline tests for rejected-generation paths. The old six-call live verifier
was retired; its completed outcome remains in history, not reusable approval.
