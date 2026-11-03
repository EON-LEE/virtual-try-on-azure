# Operations

These are current application contracts, not authorization to deploy or call
models. Historical evidence is in [application development](history/application-development.md)
and [experiment records](../experiments/README.md). Existing resources and
settings must be verified under the approved identity before a live operation.

## Demo access and customer assets

Configure `DEMO_USERNAME` (1-128 characters) and a random `DEMO_PASSWORD`
(32-128 characters), separate from `DEMO_OPERATOR_TOKEN`. No public password
or authentication fallback exists. Missing credentials refuse local logins and
prevent public-hosting startup. Bicep injects the password through a secure
parameter and Container Apps secret reference, never a public configuration value.
Changing source does not rotate credentials on the already deployed app.

Login attempts, including malformed bodies, are limited to 20 per minute **per
source**, not per process. Correct credentials do not bypass an exhausted source
window. Different source addresses have independent windows; clients behind the
same NAT still share one. The in-memory map is capped at 4096 sources and expires
entries after one minute. It is not a distributed abuse defense or Entra ID.

Local/direct HTTP uses the socket address and ignores `X-Forwarded-For`.
Only the direct ACA HTTP-ingress topology sets
`DEMO_TRUST_CONTAINER_APPS_PROXY=true`: use the rightmost validated IP appended by
ACA and reject missing/malformed headers. Never enable this on a directly
reachable Node port or assume the leftmost client-supplied entry is trusted.
An extra proxy such as Front Door changes the source seen by this policy and
requires a separate design. See [ACA HTTP headers](https://learn.microsoft.com/azure/container-apps/ingress-overview#http-headers).
Source addresses are used only for the short-lived limiter, not logged.

Customer demos use uploads, with `ENABLE_RESEARCH_SAMPLES=false`. A research pack
is optional, requires noncommercial rights review and is checked for file/hash
integrity at startup when enabled. A missing/invalid pack returns an explicitly
unavailable empty manifest; it does not break login or substitute photos.
Agree customer permission, model consent and local export retention/deletion
before receiving assets. Authentication does not establish those rights.

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
| Explicitly approved `unlimited` | No total-call cap, expiry or per-boot activation. A configured demo login can generate after cold start. Shared credentials plus paid access create abuse/cost risk. |
| Default `bounded` | Positive `DEMO_MAX_MODEL_ATTEMPTS` (1–100), future `DEMO_INFERENCE_EXPIRES_AT` and one activation of the current boot. Starts closed; exhausted/expired allowance cannot be recharged on that boot. |

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
Expiry/logout clear browser photos and review notes; downloads cannot be carried
over to another login. Export review JSON manually before the result's ten-minute
expiry. Clear/refresh/expiry removes in-memory review state; no hidden persistence
or automatic re-generation is provided.
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
The Docker image runs non-root. The default `customer` target includes no sample
photos and builds without `sample-images/`. The optional `research` target copies
only the reviewed private pack. Build context must not contain private reports,
customer uploads, CLI caches, `.env`, approvals or secrets.

```powershell
az bicep build --file infra\main.bicep --stdout > $null
docker build -t try-on-studio:local .
# Noncommercial research only, after reviewing rights:
# node scripts\prepare-samples.js
# docker build --target research -t try-on-studio:research .
```

Compilation/build is not deployment or evidence of live model quality.
An approved deployment uses explicit subscription, a private secure parameter
file, foundation first (`deployApp=false`), private image build, then
`deployApp=true` with an immutable commit tag. Keep inference disabled unless
separately authorized. `scripts\prepare-deployment.js` preserves an existing
operator secret, takes `DEMO_USERNAME` and `DEMO_PASSWORD` from the process
environment, and writes disabled-inference/upload-only parameters under ignored `.local-deploy`;
on Windows set operator-only directory ACLs before running it.
Do not print secrets or put them in command history.

## Non-paid hosted checks

Provide `DEMO_USERNAME` and `DEMO_PASSWORD` only in the checking process environment.
`node scripts\check-hosted.js <HTTPS-origin>` runs read-only API/sample checks
plus login/logout, with no model submission or operator secret. An explicit
`disabled` or `ready` argument checks that expected post-login model state.
`node scripts\check-studio.js <HTTPS-origin>` additionally verifies ready-state
browser selection, images and screenshots without pressing Create.
These checks do not activate bounded mode or assert generated-image quality.
Use offline tests for rejected-generation paths. The old six-call live verifier
was retired; its completed outcome remains in history, not reusable approval.

## Customer-demo runbook

1. Before deployment, obtain approval for the hosting account/cost and any
   inference allowance/expiry separately. Keep inference disabled otherwise.
   Do not reuse the exhausted experiment allowance or assume an unlimited demo
   approval applies to a new customer run.
2. Deploy only the reviewed immutable version with new demo credentials and
   research samples off. Keep the existing min0/max1 topology unless a change is
   separately approved. Run the disabled hosted check before customer uploads.
3. Before the meeting, request `/healthz` and complete a normal login to warm the
   host without calling a model. This does not guarantee it stays warm. Verify
   the visible client version and the permitted bounded window before any
   separately authorized generation.
4. Review every selected result, including failures. Export photo-free review
   JSON and only AI-labeled images as permitted by the customer's retention
   agreement. The size-matched slider does not prove pose or garment preservation.
   Provider metadata is stripped; the visible footer is not C2PA certification.
5. If approved pre-generated results are used, identify them as pre-generated
   and retain the selection/acceptance counts. Do not hide a live failure, retry
   automatically or switch models silently. This repository does not ship
   customer photos or pretend that fixture images are real model output.
6. After the demo, clear results, log out, and delete exports under the agreed
   policy. Accepted Azure work may still complete and incur charges.
