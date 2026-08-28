# Test Steward alpha threat model

**Status:** DECIDED baseline; implementation evidence remains OPEN  
**Method:** STRIDE-oriented analysis across direct CLI, repository inputs, host adapters, reports, trusted external tools, and fixture/canary infrastructure.

## 1. Assets

- source code, tests, contracts, and repository history;
- user credentials, environment variables, host transcripts, and tool payloads;
- integrity of Test Steward policy decisions and reports;
- hook trust state and continuation-loop state;
- protected-test and obligation records;
- local filesystem outside the repository;
- benchmark hidden oracles and fault corpus;
- CI budgets, API-equivalent spend, and result provenance.

## 2. Trust boundaries

1. User/host to hook launcher stdin.
2. Hook launcher to normalized core envelope.
3. Repository files/config to analyzer.
4. Analyzer to trusted external test/coverage/mutation processes.
5. Core to report filesystem.
6. Core decision to host-specific output translator.
7. Agent-visible fixture to hidden benchmark oracle.
8. Local plugin package to host trust store.
9. CI runner to network/package registries during installation.

Repository contents, filenames, tests, comments, package metadata, tool output, and hook payloads are untrusted data.

## 3. Threats and required mitigations

| ID | STRIDE | Threat | Required mitigation | Verification |
|---|---|---|---|---|
| TM-001 | Spoofing | Crafted stdin claims a trusted host/session/event. | Validate schema; record adapter identity out of band; bind loop state to host/session/repo/turn; reject impossible event/host combinations in adapter. | Spoofed-host fixture and negative normalization test. |
| TM-002 | Tampering | Repository edits or symlinks redirect reads/writes outside root. | Canonicalize each path; reject escape after symlink resolution; use descriptor-relative/atomic writes where possible; never follow report paths supplied by repo config. | Symlink escape and traversal tests. |
| TM-003 | Tampering | Malicious repo config injects commands or executable JS. | Zero-config reads only inert schema-validated data; executable commands require explicit trust and fixed argv; never use shell interpolation. | Config command-injection fixtures. |
| TM-004 | Repudiation | Agent or hook claims tests ran when no valid receipt exists. | Evidence records include command, revision, environment, start/end, exit, timeout, digest, and limitations; stale fingerprints invalidate receipts. | Stale-report and forged-receipt tests. |
| TM-005 | Information disclosure | Raw tool payload, transcript, source, or secrets enter model context/report. | Store bounded redacted references; deny known secret fields; cap model-visible bytes; local-only default; no telemetry/network in zero-config. | Secret canary and oversized-payload tests. |
| TM-006 | Information disclosure | Hidden benchmark oracle leaks through paths, logs, cache, or model context. | Physical separation; scrub logs; independent caches; digest checks; no oracle filenames in prompts. | Contamination audit. |
| TM-007 | Denial of service | Huge repos, diffs, snapshots, tool output, or recursive symlinks exhaust resources. | File/count/byte limits; streaming; bounded concurrency; timeouts; process-group termination; partial report with explicit limitation. | Resource-limit tests. |
| TM-008 | Denial of service | Stop hooks loop forever. | Atomic one-shot state plus host `stop_hook_active`; maximum one continuation; repeated stop allows/advises; TTL cleanup. | Claude and Codex repeated-stop tests. |
| TM-009 | Elevation | Hook executes with user privileges and invokes arbitrary repository command. | Thin installed launcher; fixed subcommands; explicit trust; no `shell:true`; environment allowlist; working-directory validation. | Malicious package script test. |
| TM-010 | Elevation | Plugin manifest or hook path escapes package root. | Resolve real path beneath trusted plugin root; validate manifest paths; reject symlink escape. | Plugin-path escape test. |
| TM-011 | Tampering | Prompt injection in test names/output alters agent behavior. | Treat names/output as quoted evidence; never concatenate into instructions; stable reason codes; remediation assembled from templates and bounded facts. | Injection-string golden tests. |
| TM-012 | Tampering | Another hook's output conflicts with Test Steward. | Treat host merge/precedence as observable limitation; never claim final control; record parallel hook sources where host exposes them. | Multiple-hook precedence tests. |
| TM-013 | Repudiation | Cleanup plan omits protected records or independent-evidence limits. | Schema requires protected checks, limitations, and approval; deletion candidate requires all checks passed plus independent signal. | Cleanup counterexamples. |
| TM-014 | Elevation | Cleanup recommendation is applied automatically. | No `apply-cleanup` command; alpha outputs read-only plans; destructive work requires separate human action. | CLI command inventory test. |
| TM-015 | Tampering | TOCTOU changes repo after analysis but before verification. | Bind reports/receipts to Git revision, diff fingerprint, and file digests; re-evaluate before gate translation. | Mid-run mutation test. |
| TM-016 | Denial of service | External tool leaves descendants or worktrees. | Spawn without shell; isolated process group; terminate/kill escalation; finally cleanup; receipt records cleanup state. | Timeout descendant test. |
| TM-017 | Information disclosure | Reports created with permissive permissions. | Private cache/data mode; atomic create with restrictive permissions; user-selected report path warned/validated. | Permission test on macOS/Linux. |
| TM-018 | Spoofing | Synthetic Codex task-complete fixture enters production. | Adapter capability map forbids emission; fixture metadata marks synthetic; production test asserts event unreachable. | Negative adapter test. |
| TM-019 | Denial of service | Canary exceeds run/time/cost budget. | Pre-run reservation, hard per-host cap, skip-and-report policy, no automatic cap increase. | Budget exhaustion simulation. |
| TM-020 | Supply chain | Dependency/plugin update changes behavior or license. | Lockfile, provenance/SBOM, release verification, license inventory, dependency review, signed artifacts where supported. | Release pipeline checks. |

## 4. Security invariants

- Zero-config never executes repository code or uses the network.
- Hooks are guardrails running with user privileges, not a sandbox.
- Semantic/model uncertainty never denies a tool or requests mandatory remediation.
- Reports disclose missing evidence rather than fabricating a pass.
- No source upload or telemetry by default.
- Cleanup is advisory and read-only.
- Host output translation is event-specific; generic `block` semantics are forbidden.

## 5. Residual risks

- A compromised host runtime can falsify hook input/output.
- A fully trusted repository command can execute arbitrary project code.
- Static analysis cannot identify every product obligation.
- Host lifecycle and merge precedence can change between versions.
- Secret redaction cannot guarantee removal of novel credential formats.
- Benchmark fixtures may underrepresent large monorepos and nonstandard runners.

These are disclosed in `doctor`, reports, compatibility records, and release notes. Certification pins tested host versions.
