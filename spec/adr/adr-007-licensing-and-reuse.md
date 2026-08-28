# ADR-007: Licensing and reuse

**Status:** DECIDED  
**Date:** 2026-08-28

## Context

The project will be open source and will integrate with permissively licensed JS/TS tools. The doctrine must remain independently authored, and external code/prose reuse must be traceable.

## Decision

- Project license: Apache License 2.0, subject to final human legal review before publication.
- Contribution mechanism: Developer Certificate of Origin (DCO), not a contributor license agreement, for alpha.
- Maintain `NOTICE`, `THIRD_PARTY_LICENSES`, dependency lockfiles, and an automated license inventory.
- Use permissively licensed dependencies as libraries only when needed.
- Keep external executables behind subprocess adapters with explicit version and output-schema checks.
- Do not vendor copyleft code or substantial prose without a separate owner/legal decision.
- Independently author testing doctrine, policy examples, schemas, and skill instructions.
- Record copied code or substantial wording with source repository, commit, path, SPDX identifier, modifications, and required notices.

### DCO rationale

A DCO is proportionate for an early Apache-2.0 developer tool, preserves contributor ownership, and avoids the adoption friction of a bespoke CLA. Revisit only if a foundation, dual-license strategy, or enterprise IP requirement emerges.

### Current alpha dependencies

| Dependency | License | Mode | Decision |
|---|---|---|---|
| TypeScript | Apache-2.0 | Library/compiler | Allowed |
| ts-morph | MIT | Library | Allowed, pinned |
| Commander | MIT | Library | Allowed after implementation verifies exact package license |
| Ajv | MIT | Library | Allowed |
| YAML parser | ISC or permissive candidate | Library | Select exact package and verify license before lock |
| Vitest | MIT | Dev dependency and optional repo subprocess | Allowed |
| Jest | MIT | Optional repo subprocess | Allowed |
| StrykerJS | Apache-2.0 | Optional subprocess | Allowed |

## Alternatives considered

- MIT project license: rejected because Apache-2.0 adds an explicit patent grant useful for tooling.
- CLA at launch: rejected as unnecessary friction.
- Copy an existing testing skill: rejected; no complete licensed skill supplies the required evidence and cleanup architecture, and independent authorship reduces ambiguity.

## Consequences

- Release automation must verify licenses and notices.
- New dependencies cannot enter solely through generated implementation without inventory updates.
- Legal clearance for the public name and license remains human responsibility.

## OPEN

- **Final legal approval.** Closes when an authorized human approves Apache-2.0, DCO wording, public name, and third-party notice inventory before publication.
