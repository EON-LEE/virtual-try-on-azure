# Virtual Try-On

Azure-only, human-reviewed clothing-content studio with explicit **upper, lower, or upper+lower**
selection and **Sunburst, MAI Image 2.6 basic, or both**. Only selected models
run. Changing inputs or viewing results does not submit a paid request.

The application is hosted at
<https://vto-studio-b0af194e.purpleground-f12dc511.eastus2.azurecontainerapps.io/>.
Hosted managed-identity generation passed technical checks for all three modes
on both models. This establishes functionality, **not exact preservation of
face, pose, color, pattern, lettering or garment construction**, and not
physical fit or size prediction. See [verification history](docs/history/application-development.md#hosted-verification).

This version requires configured demo credentials and defaults to upload-only,
inference-disabled operation. There is no built-in `test/test` password.
Source changes do not update the existing hosted revision, which may still use
the earlier public login and unlimited-call configuration. **Do not upload
customer assets there until an authorized deployment and access check.**
See [operations](docs/operations.md) before changing hosting or paid-call settings.

## Local development

Use Node 24 or later. PowerShell can use `npm.cmd` without changing execution policy.

```powershell
npm.cmd ci --ignore-scripts
Copy-Item .env.example .env
```

In the ignored `.env`, set `DEMO_USERNAME` (1-128 characters) and a unique,
random `DEMO_PASSWORD` (32-128 characters). Do not reuse the operator token,
commit credentials, or enable inference. Then run `npm.cmd start`.
Without credentials, local login returns `login-not-configured`; public-hosting
startup fails rather than falling back to a public password.

Open `http://127.0.0.1:3000`. Local uploads can be previewed without generation.
There is no production mock mode, automatic retry or external-model fallback.
Do not enable inference without explicit account and cost approval.

## Input and API contract

| Mode | Ordered image fields | Fixed server prompt |
| --- | --- | --- |
| `upper` | `person`, `upper` | `upper-only-v2` |
| `lower` | `person`, `lower` | `lower-only-v1` |
| `full` | `person`, `upper`, `lower` | `upper-lower-set-v1` |
| Legacy, no `mode` | `person`, `garment` | `upper-body-v1` |

Full set means separate upper and lower garments, not a dress or shoes.
Missing, duplicate or extra references are rejected. Lower/full require a
suitable full-body upload. No free-text prompt is accepted.
Inputs are single-frame PNG/JPEG, at most 10 MiB each, 4096px per side and
20 megapixels. Sharp applies EXIF orientation, reduces the long edge to at most
2048px without enlarging smaller images, and strips metadata by PNG re-encoding.
The normalized PNG must also fit within 10 MiB. Both selected models receive
the same buffers. This is input normalization, not a measured quality improvement.

Sunburst uses the dated Azure deployment `images/edits` route with repeated
`image[]`, `n=1`; MAI uses `/mai/v1/images/edits` with repeated `image` and
`web_grounding=false`. No mask, fidelity, size, quality, seed or aspect-ratio
option is guessed. Exactly one base64 image is accepted; returned image URLs
are not fetched.

## Review and export

Each completed model result has a keyboard-operable original/result slider.
Both images fit the original frame without cropping or stretching; differing
aspect ratios leave padding. This is a size-matched comparison, **not pose
registration or a fidelity metric**. Clicking the image opens the full AI result.

Record a verdict and notes, then use **판정 JSON 내보내기** before clearing,
refreshing or expiry. The versioned JSON includes every selected model (including
failures and unreviewed results), prompt version, timing and review notes. It
does not embed photos, input filenames, image URLs, cookies or raw provider errors.
Do not put personal information into notes. Reviews live only in browser memory;
no server review history or automatic upload is added.

Results and the zoom view disclose AI generation. **AI 표시 포함 저장** downloads
a PNG with a rasterized `AI GENERATED | REVIEW REQUIRED` footer outside the photo,
leaving its pixels unchanged. The download uses the same session ownership and
expiry checks as the preview. It never falls back to an unlabeled file on error.
Image re-encoding strips provider metadata; the app does **not** preserve,
re-sign or claim C2PA provenance or legal compliance.

## Research samples and privacy

Research samples are **disabled by default**, including the customer Docker target.
Use customer-authorized garment images and consented model photos for customer demos.
An optional research gallery has six upper-only VITON-HD people and eight upper garments.
Person and garment source IDs are disjoint; nothing is auto-selected.
Lower/full hide the upper-only person gallery and require uploads. Known sample
hashes are also rejected server-side for unsupported modes; this is not
full-body detection for arbitrary uploads.

Only metadata, hashes and notices are committed. JPEGs stay in ignored
`sample-images/` and enter only an explicitly selected `research` Docker target. Manifest and image
endpoints require a current session and return `no-store`; public static image
paths return 404. With `ENABLE_RESEARCH_SAMPLES=false`, no samples are served.
When explicitly enabled, startup checks every declared file and hash.
A missing or invalid pack disables the entire gallery with an explicit notice;
uploads remain usable and there are no placeholder photos or automatic downloads.

Use is limited to **noncommercial research demos** under the official
[VITON-HD terms](https://github.com/shadow2496/VITON-HD) and
[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/).
Keep the paper citation, license and change notices in
[NOTICES](public/samples/NOTICES.txt) when sharing adaptations.
Mirror bytes have not been compared with the official archive; individual
releases, photographer/catalog rights and age records were not independently
verified. No endorsement is claimed.

For noncommercial research only, after reviewing those terms, the sample preparation command is
`node scripts\prepare-samples.js`. It checks pinned source hashes and 77 excluded
image/artifact hashes, without inference or download retries. It never runs
automatically in startup or CI. Set `ENABLE_RESEARCH_SAMPLES=true` only for that
reviewed research use. Do not restore discarded photos or commit the pack.

Uploads/results remain in process memory, not application disk or logs.
Results expire ten minutes after completion; sessions expire after thirty
minutes. One active job is allowed **globally**, with two submissions per minute
and up to eight retained jobs. Clearing deletes session-owned jobs and browser
blobs but cannot guarantee cancellation of accepted Azure work. Request-ID
deduplication lasts only while a job is retained, not across restart or deletion.
Azure processing/retention is separate; Global deployments need not process in
the resource region. Azure-only does not mean Korea-only.

## Checks and code layout

```powershell
npm.cmd run check
npm.cmd test
npx.cmd playwright install chromium
npm.cmd run test:e2e
python -m pip install -r experiments\requirements.txt
python -m unittest discover -s experiments -p 'test_*.py'
```

If Chromium download is unavailable and Edge is installed, set
`$env:PLAYWRIGHT_CHANNEL = 'msedge'` before browser tests.
Tests use injected providers and synthetic photos, not paid inference or
quality claims. Real-photo integrity/multipart checks explicitly skip when the
ignored pack is absent. Production never synthesizes fallback inputs.
CI checks JavaScript, Node/browser/Python tests, Docker build and Bicep compilation;
it does not acquire research photos, deploy or call models.

| Location | Responsibility |
| --- | --- |
| `src/` | Native HTTP API, explicit Azure identity, input validation and memory-only jobs |
| `public/` | Vanilla browser workspace, input previews and execution records |
| `test/`, `e2e/` | Offline server/browser regression |
| `scripts/` | Explicit non-paid checks and private build preparation |
| `infra/` | Approved hosting template; no automatic deployment |
| `experiments/` | Separate research tools, exhausted approvals and hash-bound evaluations |
| `docs/operations.md` | Current authentication, hosting, timeout and cost controls |
| `docs/history/` | Superseded application observations, not instructions |

HTTP routes use `src/http.js`, `sessions.js`, `upload.js` and `logging.js`
for bounded parsing, session ownership, upload contracts and safe events.
`src/assets.js` explicitly serves browser modules and fingerprints HTML, CSS
and JavaScript together. Browser `app.js` coordinates state; `network.js`,
`images.js`, `samples.js`, `execution.js` and `review.js` own requests, blob previews,
gallery selection, execution records and image-free review export. JSON and image requests share
session-expiry handling; neither retries generation.

See the [experiment guide](experiments/README.md) for its distinct approval
policy and historical evaluation criteria.

## Git accounts and workflow

Keep local development and shared `gh` login on **eonlee_microsoft** (EMU).
Use the existing URL-scoped **EON-LEE** Git credential for ordinary `git fetch`
and `git push`. Git already includes `~/.gitconfig-eonlee-auth`; including it
again duplicates Authorization headers and causes HTTP 400.

Work only in the assigned feature worktree. Stage intended files, run relevant
checks, commit concisely and push the feature branch. Merge only with user
authorization; prefer a reviewed PR. Never force-push or bypass protection.
Do not switch/log out shared accounts or change global credentials.

For authorized GitHub API/PR/merge commands, use the existing keyring credential
only in the command process. Never print or persist it:

```powershell
$previousToken = $env:GH_TOKEN
try {
    $token = gh auth token --hostname github.com --user EON-LEE
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($token)) {
        throw 'Existing EON-LEE credential unavailable; do not change shared login.'
    }
    $env:GH_TOKEN = $token
    $login = gh api user --jq .login
    if ($LASTEXITCODE -ne 0 -or $login -ne 'EON-LEE') {
        throw 'Unexpected GitHub write identity.'
    }
    gh repo view EON-LEE/virtual-try-on-azure
}
finally {
    $env:GH_TOKEN = $previousToken
    Remove-Variable token -ErrorAction SilentlyContinue
}
```

If authentication or branch protection blocks a write, stop and report it.
Do not change shared authentication or substitute a different PR creation path.
