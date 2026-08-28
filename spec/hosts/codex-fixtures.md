# Codex normalized compatibility fixtures

**Status:** DECIDED structure; live capture replacement remains OPEN

## Purpose

The JSON files in `spec/hosts/codex-fixtures/` validate the host-neutral **input branch** of `hook-io.schema.json`. They are representative normalized envelopes derived from the current documented Codex event fields.

They are not assertions that each normalized event has a native Codex source. In particular:

- `task-complete.synthetic.json` is deliberately synthetic because current Codex hooks have no native `TaskCompleted` event.
- The production Codex adapter must advertise `task_complete` unsupported and never emit this fixture.
- Before release certification, representative fixtures for supported events must be replaced or paired with redacted live raw payload captures from pinned CLI and desktop versions.

## Fixture inventory

| File | Native Codex event | Production-emittable |
|---|---|---:|
| `session-start.json` | `SessionStart` | yes |
| `before-tool.json` | `PreToolUse` | yes |
| `after-tool.json` | `PostToolUse` | yes |
| `task-complete.synthetic.json` | absent | no |
| `subagent-stop.json` | `SubagentStop` | yes |
| `turn-stop.json` | `Stop` | yes |
| `session-end.json` | `SessionEnd` | yes |

## Live capture acceptance

A live capture is acceptable only when:

- source host/version and event are recorded;
- secrets, source text, tool arguments, transcript text, and user identifiers are redacted into references;
- the normalized output validates;
- unexpected fields are retained only in the raw fixture, not silently added to the core envelope;
- a documented incompatibility enters `spec/conflicts.md`.
