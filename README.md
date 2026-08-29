# Test Steward (working name)

An evidence-backed test-portfolio policy engine for coding agents: the smallest defensible test portfolio for the risks the software actually carries. The specification is complete, and milestone M0 provides the package scaffold and read-only `doctor` command.

## Layout

- `spec/` — the canonical, validated specification tree (309 files): ADRs, JSON Schemas with examples, policy rulebook and golden cases, four benchmark fixture repositories with hidden oracles, Claude/Codex host packages, skill draft, threat model, and the implementation handoff under `spec/handoff/`.
- `planning/` — historical planning documents: the owner ruling and the ChatGPT Pro work-package briefs (v1 superseded, v2 executed).
- `archive/` — the original checksum-verified handoff archive the `spec/` tree was extracted from.

## Status

- Specification: complete and independently re-validated (schemas, examples, goldens, fixtures, YAML — 364 checks, 0 failures).
- Implementation: milestones M0–M5 and M8 complete — all six commands real (`plan --diff`, `verify-change`, `inventory`, `audit`, `cleanup-plan`, `doctor`), hook layer with Claude and Codex adapters and one-shot Stop remediation, read-only cleanup planner. `npm run test:pr` runs the full deterministic suite (99 policy goldens, hook contracts, cleanup safety, security, fixture CLI on tasks 01–04) green.
- ADR-002 threshold measurements (warm macOS, 2026-08-28): no-op p95 282 ms (< 500 ms), zero-config `plan --diff` p95 769 ms (< 2000 ms), byte-deterministic reports verified, clean `npx` execution from the packed tarball verified. Linux measurements pending.
- Not yet claimed: M9 dual-host canary, live host payload captures, and certification — see `spec/handoff/open-register.md` and `spec/conflicts.md`.
- Implementation entry point: `spec/handoff/IMPLEMENTATION_BRIEF.md`, milestones in `spec/handoff/milestones.md`.

## M0 development

The package requires Node.js 22.13 or later. Install the exact locked dependencies without lifecycle scripts, build, and run the read-only compatibility check:

```sh
npm ci --ignore-scripts
npm run build
node dist/bin/test-steward.js doctor --json=-
```

`doctor` loads schemas from the packaged `schemas/` copy. It does not run repository scripts, load executable configuration, install hooks, use telemetry, or make runtime network calls. An optional `--config` path must name a contained, inert JSON file that validates against `config.schema.json`.
