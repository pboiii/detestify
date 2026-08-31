# Open-item register

Every item remains explicit. `OPEN` means the architecture does not pretend the evidence already exists.

| ID | Item | Blocks | Evidence that closes it | Suggested owner | Status |
|---|---|---|---|---|---|
| OPEN-001 | Pinned Node baseline | M0 | Node 22.13.0 passed the full Linux suite and packed install; current macOS, Claude Code 2.1.241, and Codex CLI 0.147.0 passed their native checks. CI pins 22.13 on macOS and Linux. | implementation agent | CLOSED |
| OPEN-002 | Exact package versions and transitive licenses | M0 | The exact lockfile, license inventory, and a production CycloneDX 1.5 SBOM with 10 components and 11 dependency entries were verified. The tag workflow regenerates the SBOM and requests npm provenance. | implementation agent | CLOSED |
| OPEN-003 | Final public name and namespace reservation | M9 publication | Direct GitHub/npm/Homebrew checks and human red-flag/legal review. | human | OPEN |
| OPEN-004 | TypeScript performance thresholds | M3/M9 | Thirty-sample macOS and Linux measurements passed: worst p95 startup was 31.799 ms and worst fixture `plan --diff` p95 was 751.279 ms. See `spec/benchmark/performance-results.md`. | implementation agent | CLOSED |
| OPEN-005 | Fresh Claude native-host receipt proof | M6 | BrowserOS full-arm sessions recorded 17 type-only and 30 pagination receipts across session, tool, and stop events; output stayed bounded and requested no remediation. | implementation agent | CLOSED |
| OPEN-006 | Fresh Codex native-host receipt proof | M7 | BrowserOS full-arm sessions recorded 41 type-only and 37 pagination receipts from an isolated Codex plugin install; output stayed bounded and requested no remediation. | implementation agent | CLOSED |
| OPEN-007 | Current manifest/install proof | M6/M7 | The packed Claude plugin validated and loaded from an isolated install with all seven events and fresh receipts. The isolated Codex A/B install loaded the bundled plugin and recorded 37 pagination receipts. Both launchers resolve only bundled runtime paths. | implementation agent | CLOSED |
| OPEN-008 | Host tool-name matcher proof | M6/M7 | The BrowserOS A/B exercised configured before/after tool events on Claude and Codex and recorded bounded structured receipts from both current packages. | implementation agent | CLOSED |
| OPEN-009 | Exact runner trust UX and config persistence | M5 | Trust is explicit and non-durable: only a directly supplied, schema-valid `--config` can authorize fixed-argv repository commands. Discovered repository config cannot grant trust. Doctor output, quickstart guidance, stale-fingerprint checks, and security tests cover the path. | implementation agent | CLOSED |
| OPEN-010 | Vitest/Jest programmatic API version coupling | M5 | Not applicable after implementation: pinned Vitest, Jest, and Node-test adapters use fixed CLI argv and verified report contracts, not programmatic runner APIs. Integration and security fixtures pass. | implementation agent | CLOSED |
| OPEN-011 | Mutation adapter inclusion in alpha | After M8 | Measured value/cost on fixtures without making reports depend on it. | later research | OPEN |
| OPEN-012 | Launch-canary cap adequacy | M9 | Two tasks × two arms × one repetition completed within four runs and one wall-clock hour per host using existing subscriptions on 2026-08-30. | human | CLOSED |
| OPEN-013 | Dual-host launch-canary result | M9 | `docs` and `bug` baseline/full runs passed on Claude and Codex; no full arm regressed, full arms recorded hooks, and baselines recorded none on 2026-08-30. | implementation agent | CLOSED |
| OPEN-014 | Native Windows support | post-alpha | Dedicated path/process/worktree/install/hook test matrix. | later research | OPEN |
| OPEN-015 | Python mutation output contracts | post-alpha Python ecosystem | Pinned mutmut/Cosmic Ray fixture runs and license/maintenance review. | later research | OPEN |
| OPEN-016 | CLA versus DCO final governance choice | before first external contribution | Maintainer/legal review of contributor policy. | human | OPEN |
| OPEN-017 | Universal plugin submission requirements | public marketplace submission | Current submission review against final package; not needed for local alpha. | human + implementation agent | OPEN |
| OPEN-018 | Real-repository obligation identifiability | post-alpha expansion | Pilot reports and reviewer acceptance/override data from representative repositories. | human + later research | OPEN |

No OPEN item authorizes scope expansion. When evidence contradicts a DECIDED contract, record a conflict and seek an owner amendment rather than silently changing the implementation.

The completed one-repetition launch and product-purpose canaries provide directional real-repository evidence, not a reduction percentage or statistical efficacy claim (CON-012, CON-013).
