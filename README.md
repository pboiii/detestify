# Test Steward (working name)

An evidence-backed test-portfolio policy engine for coding agents: the smallest defensible test portfolio for the risks the software actually carries. The specification is complete, and milestone M0 provides the package scaffold and read-only `doctor` command.

## Layout

- `spec/` — the canonical, validated specification tree (309 files): ADRs, JSON Schemas with examples, policy rulebook and golden cases, four benchmark fixture repositories with hidden oracles, Claude/Codex host packages, skill draft, threat model, and the implementation handoff under `spec/handoff/`.
- `planning/` — historical planning documents: the owner ruling and the ChatGPT Pro work-package briefs (v1 superseded, v2 executed).
- `archive/` — the original checksum-verified handoff archive the `spec/` tree was extracted from.

## Status

- Specification: complete and independently re-validated (schemas, examples, goldens, fixtures, YAML — 364 checks, 0 failures).
- M0 implementation: TypeScript package scaffold and read-only `doctor` command.
- Open items before certification claims: see `spec/handoff/open-register.md` and `spec/conflicts.md`.
- Implementation entry point: `spec/handoff/IMPLEMENTATION_BRIEF.md`, milestones in `spec/handoff/milestones.md`.

## M0 development

The package requires Node.js 22.13 or later. Install the exact locked dependencies without lifecycle scripts, build, and run the read-only compatibility check:

```sh
npm ci --ignore-scripts
npm run build
node dist/bin/test-steward.js doctor --json=-
```

`doctor` loads schemas from the packaged `schemas/` copy. It does not run repository scripts, load executable configuration, install hooks, use telemetry, or make runtime network calls. An optional `--config` path must name a contained, inert JSON file that validates against `config.schema.json`.
