# Test Steward (working name)

An evidence-backed test-portfolio policy engine for coding agents: the smallest defensible test portfolio for the risks the software actually carries. Currently in the specification-complete, pre-implementation stage.

## Layout

- `spec/` — the canonical, validated specification tree (309 files): ADRs, JSON Schemas with examples, policy rulebook and golden cases, four benchmark fixture repositories with hidden oracles, Claude/Codex host packages, skill draft, threat model, and the implementation handoff under `spec/handoff/`.
- `planning/` — historical planning documents: the owner ruling and the ChatGPT Pro work-package briefs (v1 superseded, v2 executed).
- `archive/` — the original checksum-verified handoff archive the `spec/` tree was extracted from.

## Status

- Specification: complete and independently re-validated (schemas, examples, goldens, fixtures, YAML — 364 checks, 0 failures).
- Open items before certification claims: see `spec/handoff/open-register.md` and `spec/conflicts.md`.
- Implementation entry point: `spec/handoff/IMPLEMENTATION_BRIEF.md`, milestones in `spec/handoff/milestones.md`.
