# Claude plugin

Test Steward for Claude Code. The layout follows
`spec/hosts/claude-hook-package.md`:

```text
plugins/claude/
  .claude-plugin/plugin.json
  hooks/hooks.json
  bin/test-steward-hook
  skills/test-steward/SKILL.md
  README.md
```

## Install

Installation is always explicit. Place `plugins/claude/` where Claude Code
discovers local plugins (or install through the plugin marketplace flow once
published), then review and enable the hooks in `/hooks`. Nothing is active
until you review it.

The launcher `bin/test-steward-hook` resolves the installed CLI distribution
(`dist/src/hooks/entry.js`) and never evaluates repository configuration.
`TEST_STEWARD_HOOK_ENTRY` overrides the entry path for testing.

## Behavior

- Reads the raw Claude hook payload from stdin.
- Stores a redacted raw-payload reference outside the envelope.
- Normalizes to the `hook-io.schema.json` invocation.
- Invokes the same core the `test-steward` CLI uses.
- Translates the portable decision into the event-specific Claude output.
- Stop hooks request at most one remediation continuation per
  host/session/repository key; every repeated stop allows.

`FileChanged` is deliberately not registered: it watches literal filenames,
not repository-wide changes.

## Uninstall

1. Disable or remove the plugin through Claude Code.
2. Confirm no Test Steward hooks remain in `/hooks`.
3. Optionally delete Test Steward-owned state under `.test-steward/`.
4. Run `test-steward doctor` to confirm no hook executable remains.

Alpha certification covers the pinned Claude Code release on macOS and Linux
only; live payload capture is still pending (spec conflict CON-003 analog for
Claude). Alpha software under the Apache-2.0 license; see the repository
`NOTICE`.
