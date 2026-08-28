# Test Steward (Claude)

Evidence-backed test portfolio policy for coding agents.

## What it does

- Analyzes a JS/TS Git diff without executing repository code.
- Returns `NO_TEST_SUPPORTED`, `EXISTING_TEST_UPDATE_CANDIDATE`,
  `NEW_TEST_CANDIDATE`, or `INSUFFICIENT_EVIDENCE` with provenance.
- Verifies a completed change and requests at most one bounded remediation
  continuation per stop flow.

## Commands

Run the installed CLI, not this skill, for decisions:

```sh
test-steward plan --diff
test-steward verify-change
test-steward inventory
test-steward audit
test-steward cleanup-plan
test-steward doctor
```

## Hooks

This plugin registers lifecycle hooks for SessionStart, PreToolUse,
PostToolUse, TaskCompleted, SubagentStop, Stop, and SessionEnd. The Stop hook
may request at most one remediation continuation; repeated stops always
allow. Hooks are a guardrail, not a sandbox.
