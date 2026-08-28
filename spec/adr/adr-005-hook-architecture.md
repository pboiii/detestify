# ADR-005: Host-neutral hook architecture

**Status:** DECIDED  
**Date:** 2026-08-28

## Context

Claude Code and Codex expose overlapping but non-identical lifecycle events, payloads, trust flows, handler support, and blocking semantics. The core must remain portable while both hosts ship certified alpha wrappers.

## Decision

Use two layers:

1. **Raw host fixture layer:** pinned representative and later live-captured payloads used only for adapter compatibility tests.
2. **Normalized core layer:** the exact input and decision envelopes in `spec/schemas/hook-io.schema.json`.

### Core lifecycle

`session_start | before_tool | after_tool | task_complete | subagent_stop | turn_stop | session_end`

The core excludes `FileChanged`. Claude watches literal filenames rather than arbitrary repository globs, the event has no decision control, and Codex has no equivalent. Both adapters recompute actual repository state from Git at meaningful checkpoints.

### Output budgets

- Model-visible context: maximum 6,000 UTF-8 bytes after normalization and redaction.
- Remediation text: maximum 1,500 Unicode characters.
- Detailed evidence: written to report file and referenced by path.
- Host truncation limits are not relied upon.

### Loop guard

- Normalized input carries `already_remediated` and `attempt`.
- Adapter sets `already_remediated` from the host `stop_hook_active` flag and session state.
- At `attempt == 0`, a concrete eligible gap may request one remediation.
- At `attempt >= 1` or `stop_hook_active == true`, the adapter must allow stop and report any remaining limitation.
- Schema permits `max_attempts: 2` to represent initial stop plus one continuation; implementation may not create a second continuation.
- Session state is stored outside repository-controlled paths by default and keyed by host/session/repository snapshot.

### Host translation

- Claude `request_remediation` -> documented Stop `decision:block`/reason or equivalent command-hook shape.
- Codex `request_remediation` -> Stop `decision:block` with reason, which creates a continuation prompt.
- Event-specific `block` semantics are never generalized across hosts.
- Codex has no native `TaskCompleted`; wrapper capability advertises absence.

### Trust

Hooks are convenience and behavior-shaping controls, not a complete security or enforcement boundary. CI repeats policy independently. Repository configuration is untrusted until explicitly approved.

## Alternatives considered

- Core union of raw host payloads: rejected due volatility and accidental host coupling.
- Prompt or agent hooks as the primary verifier: rejected because current Codex skips them and Claude labels agent hooks experimental.
- Filesystem hooks after every edit: rejected due host mismatch, latency, and incomplete coverage.
- Unlimited Stop continuation: rejected due loop and cost risk.

## Consequences

- Host adapters remain thin and testable.
- Unsupported events become explicit capabilities rather than fabricated equivalents.
- Reports remain useful when hooks are disabled or bypassed.

## OPEN

- **Live raw payload captures.** Closes when implementation captures every supported event on pinned Claude and Codex versions, redacts them, and adds regression fixtures alongside the representative fixtures.
