# Open-item register

Every item remains explicit. `OPEN` means the architecture does not pretend the evidence already exists.

| ID | Item | Blocks | Evidence that closes it | Suggested owner | Status |
|---|---|---|---|---|---|
| OPEN-001 | Pinned Node baseline | M0 | Compatibility run on clean supported macOS/Linux and current Claude/Codex plugin requirements. | implementation agent | OPEN |
| OPEN-002 | Exact package versions and transitive licenses | M0 | Lockfile plus LICENSE/SBOM verification. | implementation agent | OPEN |
| OPEN-003 | Final public name and namespace reservation | M9 publication | Direct GitHub/npm/Homebrew checks and human red-flag/legal review. | human | OPEN |
| OPEN-004 | TypeScript performance thresholds | M3/M9 | Measured p95 startup and plan timing on documented warm macOS/Linux environments. | implementation agent | OPEN |
| OPEN-005 | Fresh Claude native-host receipt proof | M6 | BrowserOS full-arm sessions recorded 17 type-only and 30 pagination receipts across session, tool, and stop events; output stayed bounded and requested no remediation. | implementation agent | CLOSED |
| OPEN-006 | Fresh Codex native-host receipt proof | M7 | BrowserOS full-arm sessions recorded 41 type-only and 37 pagination receipts from an isolated Codex plugin install; output stayed bounded and requested no remediation. | implementation agent | CLOSED |
| OPEN-007 | Current manifest/install proof | M6/M7 | Build the current plugin artifacts, install them through each host, and verify the reviewed definitions resolve only inside each installed plugin. | implementation agent | OPEN |
| OPEN-008 | Host tool-name matcher proof | M6/M7 | The BrowserOS A/B exercised configured before/after tool events on Claude and Codex and recorded bounded structured receipts from both current packages. | implementation agent | CLOSED |
| OPEN-009 | Exact runner trust UX and config persistence | M5 | Usability/security review of one-shot and durable trust records. | human + implementation agent | OPEN |
| OPEN-010 | Vitest/Jest programmatic API version coupling | M5 | Integration fixtures against pinned versions and fallback to CLI contracts. | implementation agent | OPEN |
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
