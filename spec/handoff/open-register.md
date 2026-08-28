# Open-item register

Every item remains explicit. `OPEN` means the architecture does not pretend the evidence already exists.

| ID | Item | Blocks | Evidence that closes it | Suggested owner | Status |
|---|---|---|---|---|---|
| OPEN-001 | Pinned Node baseline | M0 | Compatibility run on clean supported macOS/Linux and current Claude/Codex plugin requirements. | implementation agent | OPEN |
| OPEN-002 | Exact package versions and transitive licenses | M0 | Lockfile plus LICENSE/SBOM verification. | implementation agent | OPEN |
| OPEN-003 | Final public name and namespace reservation | M9 publication | Direct GitHub/npm/Homebrew checks and human red-flag/legal review. | human | OPEN |
| OPEN-004 | TypeScript performance thresholds | M3/M9 | Measured p95 startup and plan timing on documented warm macOS/Linux environments. | implementation agent | OPEN |
| OPEN-005 | Live Claude raw payload fixtures | M6 | Redacted captures from pinned current Claude CLI/desktop for every configured event. | implementation agent | OPEN |
| OPEN-006 | Live Codex raw payload fixtures | M7 | Redacted captures from pinned Codex CLI and desktop for every configured event. | implementation agent | OPEN |
| OPEN-007 | Current manifest metadata beyond minimal hook path | M6/M7 | Validate package manifests against pinned host schemas and install locally. | implementation agent | OPEN |
| OPEN-008 | Host tool-name matcher set | M6/M7 | Enumerate current local edit/shell tools from live hosts; remove unsupported aliases. | implementation agent | OPEN |
| OPEN-009 | Exact runner trust UX and config persistence | M5 | Usability/security review of one-shot and durable trust records. | human + implementation agent | OPEN |
| OPEN-010 | Vitest/Jest programmatic API version coupling | M5 | Integration fixtures against pinned versions and fallback to CLI contracts. | implementation agent | OPEN |
| OPEN-011 | Mutation adapter inclusion in alpha | After M8 | Measured value/cost on fixtures without making reports depend on it. | later research | OPEN |
| OPEN-012 | Canary cap adequacy | M9 | Per-host pilot receipts demonstrating caps are feasible or conflict evidence requesting change. | human | OPEN |
| OPEN-013 | Dual-host efficacy result | M9 | Completed bounded baseline/full runs on all four tasks per host. | implementation agent | OPEN |
| OPEN-014 | Native Windows support | post-alpha | Dedicated path/process/worktree/install/hook test matrix. | later research | OPEN |
| OPEN-015 | Python mutation output contracts | post-alpha Python ecosystem | Pinned mutmut/Cosmic Ray fixture runs and license/maintenance review. | later research | OPEN |
| OPEN-016 | CLA versus DCO final governance choice | before first external contribution | Maintainer/legal review of contributor policy. | human | OPEN |
| OPEN-017 | Universal plugin submission requirements | public marketplace submission | Current submission review against final package; not needed for local alpha. | human + implementation agent | OPEN |
| OPEN-018 | Real-repository obligation identifiability | post-alpha expansion | Pilot reports and reviewer acceptance/override data from representative repositories. | human + later research | OPEN |

No OPEN item authorizes scope expansion. When evidence contradicts a DECIDED contract, record a conflict and seek an owner amendment rather than silently changing the implementation.
