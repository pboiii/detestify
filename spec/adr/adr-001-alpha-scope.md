# ADR-001: Alpha scope

**Status:** DECIDED  
**Date:** 2026-08-28

## Context

The original research plan coupled a provider-neutral policy engine with two ecosystems, several evidence adapters, broad cleanup optimization, multiple operating systems, and a statistical evaluation program. The owner ruling narrows the release matrix while retaining the evidence spine. The later owner amendments restore Claude and Codex as parallel certified hosts and require per-host efficacy evidence.

## Decision

Alpha includes:

- JavaScript and TypeScript repositories;
- a TypeScript CLI;
- direct CLI as the primary surface;
- live Claude Code and Codex command-hook wrappers;
- macOS and Linux support;
- exactly six commands: `plan --diff`, `verify-change`, `inventory`, `audit`, `cleanup-plan`, and `doctor`;
- four canonical fixtures;
- advisory-by-default policy and read-only cleanup planning;
- deterministic operation without mutation or per-test coverage;
- optional StrykerJS evidence after trust is granted;
- provider-neutral Agent Skill packaging;
- deterministic PR verification and bounded dual-host release canaries.

No command applies cleanup. `verify-change` is part of alpha but is implemented after the first `plan --diff` wedge and before live hook certification.

### Supported platforms

- macOS: supported and tested.
- Linux: supported and tested.
- Native Windows: deferred. WSL results must not be reported as native Windows support.

### Deferred items and re-entry conditions

| Deferred item | Re-entry evidence |
|---|---|
| Python ecosystem | Alpha architecture meets efficacy criteria; Python adapter ADR verifies runner, AST, coverage, and optional mutation contracts. |
| Native Windows | Clean installation, canonical path, symlink, process-group termination, and hook execution fixtures pass on Windows. |
| Automatic deletion | Human-approved cleanup plans show near-zero false deletion across expanded real and fixture corpora; owner ratifies a destructive action policy. |
| Set-cover portfolio optimizer | Obligation-to-test mappings are demonstrated to be identifiable and stable enough to optimize. |
| Hosted source-code service | Explicit product decision, privacy/security model, and threat review. |
| Full twelve-family benchmark | Four-task smoke tier is stable and effect sizes justify broader evaluation. |
| Marketplace publication | Naming, license, live host certification, security, and package review complete. |

## Alternatives considered

- Keep the original multi-language/multi-platform scope: rejected because it delays validation of the core thesis.
- Ship a prompt-only skill: rejected because it lacks deterministic evidence, cleanup safeguards, and host-independent contracts.
- Certify only one host: superseded by the owner amendments requiring both Claude and Codex.

## Consequences

- Alpha is useful before expensive evidence tooling exists.
- Host adapters receive equal certification targets without contaminating the core with host-specific semantics.
- Some repositories receive `INSUFFICIENT_EVIDENCE` more often than a more speculative product would.
- No public claim may imply universal language, host, or operating-system support.

## OPEN

None for scope. Capability details are versioned in `spec/compat/` and may change without reopening the product scope ADR unless certification becomes infeasible.
