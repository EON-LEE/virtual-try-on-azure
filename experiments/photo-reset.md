# Photo reset, 2026-10-15

The user explicitly instructed disposal of all earlier photographs and generated
images, including grids and HTML embedding those images, and replacement with
2026 current-season Korean-brand product photos plus completely new person
photos. No historical Met/VITON person or garment is eligible for reuse.

The exact pre-action inventory contained **79 files / 153,004,953 bytes** under
this assigned worktree's `experiments\local`. Each file's path, size and SHA256
was recorded before deletion. Each exact file was rechecked and individually
removed; no recursive directory deletion or wildcard deletion was used.
All **65 existing JSON files** were hash-checked unchanged afterward, preserving
approval ledgers, result records, plans, provenance and reviews. No code was
deleted. No media files existed elsewhere under the assigned worktree.
No JSON files contained inline image data. No request lock existed.

The private inventory is `local\disposal-2026-10-15.json`; it contains paths,
counts and hashes only, not photographs. After deletion no historical media
files remained. `local\report\index.html` was first replaced by an image-free
restart page. Subsequent new-source review added two hash-pinned CC BY-SA 4.0
browser-preview screenshots only, with attribution and change notices.
It has no historical photos or outputs; CSP permits only inline `data:` images
and uses `connect-src 'none'`. No remote image is loaded by the report.
The report generator no longer reads historical results' picture bytes or
reconstructs the previous grids. Historical docs remain as records, not
instructions to redownload disposed photos. Existing local helper scripts
were preserved as code; they must not be used to reacquire or reinsert old photos.
Both CLI and imported acquisition/live entrypoints block execution while the
restart state is paused or missing. No guard was lifted for source research.

## Calls

The prior 16 attempts stay consumed. The subsequent up-to-12-pair/24-attempt
approval had **0 submitted, 0 consumed, 0 unresolved/inflight** when the scope
changed. No new ledger reservation, retry, Azure image request, deployment,
role or hosting change occurred. Maximum lifetime cap remains 40, but the
unused 24 are on hold until the exact replacement inputs, rights and preview
are reviewed and coordinator go is received. A maximum approval is not a
reason to fill the scope with unsuitable pictures.

## New-source status

Official product metadata rechecked after the reset:

| Brand / exact item | Actual date/season evidence | Limits |
| --- | --- | --- |
| BEANPOLE MEN `BC6X64C75A`, big multi-check beige | [Official item](https://www.ssfshop.com/BEANPOLE-MEN/GM0026092333362/good) exact-item HTML `goodsSeasonCd="FW26"` and `Product.releaseDate=2026-09-30` | 100% cotton. Listing/season evidence is not camera capture date. No image acquired |
| 8 seconds Minjukim `356841SX21`, clover-print layered jersey | [Official item](https://www.ssfshop.com/8-seconds/GM0026080770250/good) exact-item `goodsSeasonCd="FW26"` and `releaseDate=2026-08-26` | Polyester 64%, rayon 28%, polyurethane 8%. Photo capture date unverified. No image acquired |
| HAZZYS MEN `HZSH6D502B2`, wool-blend flannel check | [Official item](https://www.hazzys.com/product.do?cmd=getProductDetail&PROD_CD=HZSH6D502B2) product notice says winter and manufactured 2026-06 | Cotton 56%, lyocell 34%, wool 10%. Product-specific evidence, not global banner; manufacturing is not photo capture/publication. No image acquired |

These are **source links only**, not fresh photo inputs. Previously researched
links do not authorize reusing historical images or substituting old people.
SSF SHOP Article 21 / HAZZYS Article 25 do not expressly grant this
non-commercial AI-edit/Azure processing use. Photo permission remains unresolved.
Permission can be requested through the official customer/rights-owner paths
in `brand-candidate-review.md`; no message or permission request was sent.

A genuinely new person source was investigated separately:
[Pexels terms §5](https://www.pexels.com/terms-of-service/) expressly grants
copying/modification/adaptation for commercial/non-commercial purposes subject
to prohibited uses and other rights. That is meaningfully different from
the product-store terms with no express adaptation grant. Section 5 expressly
does not warrant other consents, and Section 8 prohibits unauthorized scraping,
automated extraction and bypass of restrictions. No automated image acquisition
from this service will be attempted. However, the search
page did not expose a verified eligible individual photo; direct public
retrieval returned 403 and was not bypassed. No photo, age/release evidence,
hard-pose verification or capture date was secured. A recent dataset upload
would not establish recent photography.

### Specific new person sources checked after closeout

The source pages below were reviewed on 2026-10-15 through public Wikimedia
file pages and their MediaWiki `imageinfo/extmetadata` and original Information
templates. This is individual source review, not bulk image acquisition.

| Candidate source | Actual evidence | Decision |
| --- | --- | --- |
| [Nater Kane Portrait 2026-09-07](https://commons.wikimedia.org/wiki/File:Nater_Kane_Portrait_2026-09-07.jpg) | Source describes crossed arms in a plaid shirt; own-work author Naterkane; CC BY-SA 4.0; date 2026-09-07 18:42:56, iPhone 12 Pro metadata; uploaded 2026-09-22 | Preview inspected: square head/upper-torso crop omits hands and most crossed-forearm contact. **Exclude from full hand/occlusion hard-pose coverage**, not a substitute to fill calls. Copyright adaptation is allowed; person consent and adult eligibility unverified. Browser review screenshot only, not acquired as an input |
| [Portrait of Marin Niehues with his arms crossed](https://commons.wikimedia.org/wiki/File:Portrait_of_Marin_Niehues_with_his_arms_crossed.jpg) | 2026-08-24, own-work author Misoramenyum, CC BY-SA 4.0, iPhone 16 Pro. File page explicitly says `Credit/Provider: Apple Photos Clean Up` and `Source of digital media: Edited using generative AI` | **Exclude from unmodified actual-photo baseline**, even though date/license meet parts of the request. No old or generated-photo substitute |
| [Woman asswan](https://commons.wikimedia.org/wiki/File:Woman_asswan.jpg) | Own-work author Mira Fathy; CC BY-SA 4.0; claimed date 2026-06-06, uploaded 2026-09-20; no camera corroboration shown. Preview inspected: seated person, bent elbows and hands meeting in lap, bag/strap over torso | Seated/layer-overlap source candidate, **not chest-level crossed/raised arms**. Copyright preview/adaptation allowed under stated terms, but adult eligibility, real-photo provenance and model consent still need confirmation. Browser review screenshot only |

The two retained local previews are `local\new-source-review\crossed-arms-review.png`
and `local\new-source-review\seated-review.png`. Their exact hashes and source
credit/change notices are in `restart-state.json`. They are resized browser
screenshots for research review, not downloaded full-size input photographs,
not synthetic replacements and not Azure-generated outputs.
The generator only embeds matching hashes under `local\new-source-review`;
missing preview files in a fresh checkout produce source links without photos,
while mismatched hashes or paths outside that directory stop generation.
All photograph bytes and the self-contained report remain ignored, not committed.

[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) allows adaptation
under attribution, license-link, change-notice and share-alike conditions upon
distribution; it does not automatically grant personality/publicity rights or
endorsement. [Commons personality-rights guidance](https://commons.wikimedia.org/wiki/Commons:Personality_rights)
distinguishes permission to take a photograph from all later uses.
The person-source authors can be contacted through their linked file-page user
profiles, subject to user authorization to send an inquiry. No inquiry was sent.

The search also rejected concrete examples of **2026 upload != 2026 capture**:
`Kadoch 10 19 23 4938 RR.jpg` (uploaded 2026-08-18, capture 2023-10-19),
`Honey Chen and Puma backpack 20250329 T1524.jpg` (uploaded 2026-09-09,
capture 2025-03-29), and
`Feeling discomfort at home while working on a laptop during the day.jpg`
(uploaded 2026-07-22, capture 2022-08-06). None was acquired as a replacement.

[Unsplash terms](https://unsplash.com/terms) were also checked: Section 5 gives
a broad copyright adaptation license but excludes recognizable people's rights;
Section 8 restricts automation and AI-dataset uses. No Unsplash acquisition or
inference was attempted and those restrictions were not treated as permissions.
An isolated image-edit task is not automatically identical to dataset training,
but that distinction does not establish permission.

**Blocked:** no exact fresh brand garment/person pair is ready. A permissioned
current-season product photo and completely new consenting adult photographs
(crossed arms, raised arm, hands in front, strong three-quarter, seated) or
an equivalently reviewed source are needed before input preview/call scope
can be frozen. No historical photo will be used as a fallback.
