# Naming and availability report

**Status:** `Detestify` is the selected public alpha name. Exact-name availability signals were rechecked immediately before release, but legal clearance remains UNVERIFIED.
**Access date:** 2026-08-31

## Method limitation

Search-engine results and unauthenticated registry pages can reveal obvious collisions but cannot prove that a repository, package, formula, domain, or trademark is legally and practically available. This is a red-flag scan, not legal clearance. Every “no obvious collision” result below remains `UNVERIFIED` until a human performs direct namespace checks immediately before publication.

## Candidate matrix

| Candidate | GitHub | npm | PyPI | crates.io | Homebrew | Domain / product red flags | Assessment |
|---|---|---|---|---|---|---|---|
| `test-steward` | UNVERIFIED; no obvious exact developer-tool collision surfaced | Available signal only | UNVERIFIED | UNVERIFIED | UNVERIFIED | Descriptive; potential weak distinctiveness | Former internal/compatibility name |
| `detestify` | `pboiii/detestify` is reserved | Exact registry endpoint returned 404 | Exact project endpoint returned 404 | Exact sparse-index endpoint returned 404 | Exact formula endpoint returned 404 | `.com` and `.dev` RDAP lookups returned 404; existing npm `detectify` and a live DETECTIFY software/security trademark are material similarity risks | **Selected public alpha name; no legal clearance** |
| `proofwarden` | UNVERIFIED; no obvious exact collision surfaced | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | Distinctive but broader than testing | **Fallback** |
| `suitewarden` | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | Generic suite/security connotation | Reserve only if primary/fallback unavailable |
| `testwright` | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | Strong resemblance to Playwright naming | Reject |
| `test-orchard` | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | “Orchard” is common across software brands | Reject |
| `proofsuite` | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | Sounds like a test framework rather than governor | Lower rank |
| `suite-sentinel` | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | Generic monitoring/security collision risk | Lower rank |
| `evidence-test` | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | Awkward phrase; likely namespace noise | Reject |
| `test-portfolio` | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | Highly descriptive and hard to protect | Reject as product name; useful category phrase |

## Recommendation

1. **Selected alpha name:** `Detestify` / package candidate `detestify`.
2. **Fallback:** `Proofwarden` / package candidate `proofwarden` only if the owner changes the name after legal review.

`Detestify` is the public alpha decision. The earlier branding preference for `Test Steward` did not include direct namespace checks. The close-name npm package and trademark risk mean this report is not legal approval and must not be presented as clearance.

## Latest direct technical check

On 2026-08-31, the exact npm, PyPI, crates.io sparse-index, and Homebrew
endpoints returned 404. GitHub search returned only the owned
`pboiii/detestify` repository. RDAP lookups for `detestify.com` and
`detestify.dev` also returned 404. These results are availability signals, not
reservations or legal advice. npm authentication was deliberately not created
or changed.

## Publication gate

Before any public repository, package, domain, or formula is announced, a human must record:

- direct GitHub organization/repository creation check;
- direct npm package and organization check;
- PyPI, crates.io, and Homebrew formula/tap check;
- domain registrar check for chosen domains;
- USPTO and relevant international red-flag search;
- legal approval that the scan is sufficient for launch.

If `Detestify` cannot be used after review, choose a replacement before publication. Do not create divergent public names across registries merely to preserve `detestify` somewhere.

## Search sources

- GitHub repository search: https://github.com/search (accessed 2026-08-28)
- npm search: https://www.npmjs.com/search (accessed 2026-08-28)
- PyPI search: https://pypi.org/search/ (accessed 2026-08-28)
- crates.io search: https://crates.io/ (accessed 2026-08-28)
- Homebrew formulae: https://formulae.brew.sh/ (accessed 2026-08-28)
- USPTO trademark search: https://tmsearch.uspto.gov/ (accessed 2026-08-28)
