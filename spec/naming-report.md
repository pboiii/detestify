# Naming and availability report

**Status:** working-name decision is DECIDED; public namespace availability is UNVERIFIED until direct reservation checks.  
**Access date:** 2026-08-28

## Method limitation

Search-engine results and unauthenticated registry pages can reveal obvious collisions but cannot prove that a repository, package, formula, domain, or trademark is legally and practically available. This is a red-flag scan, not legal clearance. Every “no obvious collision” result below remains `UNVERIFIED` until a human performs direct namespace checks immediately before publication.

## Candidate matrix

| Candidate | GitHub | npm | PyPI | crates.io | Homebrew | Domain / product red flags | Assessment |
|---|---|---|---|---|---|---|---|
| `test-steward` | UNVERIFIED; no obvious exact developer-tool collision surfaced | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | Descriptive; potential weak distinctiveness | **Primary working name** |
| `detestify` | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | “detest” implies dislike and obscures portfolio-governance thesis | Reject |
| `proofwarden` | UNVERIFIED; no obvious exact collision surfaced | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | Distinctive but broader than testing | **Fallback** |
| `suitewarden` | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | Generic suite/security connotation | Reserve only if primary/fallback unavailable |
| `testwright` | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | Strong resemblance to Playwright naming | Reject |
| `test-orchard` | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | “Orchard” is common across software brands | Reject |
| `proofsuite` | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | Sounds like a test framework rather than governor | Lower rank |
| `suite-sentinel` | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | Generic monitoring/security collision risk | Lower rank |
| `evidence-test` | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | Awkward phrase; likely namespace noise | Reject |
| `test-portfolio` | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED | Highly descriptive and hard to protect | Reject as product name; useful category phrase |

## Recommendation

1. **Primary:** `Test Steward` / package candidate `test-steward`.
2. **Fallback:** `Proofwarden` / package candidate `proofwarden`.

The primary name most clearly communicates ongoing stewardship rather than one-time test generation. It matches the product’s lifecycle responsibility: create only justified tests, place them at the right boundary, maintain them, and retire them conservatively.

## Publication gate

Before any public repository, package, domain, or formula is announced, a human must record:

- direct GitHub organization/repository creation check;
- direct npm package and organization check;
- PyPI, crates.io, and Homebrew formula/tap check;
- domain registrar check for chosen domains;
- USPTO and relevant international red-flag search;
- legal approval that the scan is sufficient for launch.

If any primary namespace is unavailable, use `proofwarden` only after the same checks. Do not create divergent public names across registries merely to preserve `test-steward` somewhere.

## Search sources

- GitHub repository search: https://github.com/search (accessed 2026-08-28)
- npm search: https://www.npmjs.com/search (accessed 2026-08-28)
- PyPI search: https://pypi.org/search/ (accessed 2026-08-28)
- crates.io search: https://crates.io/ (accessed 2026-08-28)
- Homebrew formulae: https://formulae.brew.sh/ (accessed 2026-08-28)
- USPTO trademark search: https://tmsearch.uspto.gov/ (accessed 2026-08-28)
