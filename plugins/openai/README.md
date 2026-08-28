# Codex plugin

Test Steward for the Codex view and Codex CLI hook runtime. The layout
follows `spec/hosts/codex-hook-package.md`:

```text
plugins/openai/
  .codex-plugin/plugin.json
  hooks/hooks.json
  bin/test-steward-hook
  skills/test-steward/SKILL.md
  README.md
```

## Install

Installation is always explicit. Place `plugins/openai/` in a supported
plugin directory, review the exact hook definition hash, and trust it through
`/hooks`. Plugin installation does not automatically trust bundled hooks;
changed definitions require new review.

The launcher `bin/test-steward-hook` resolves the installed CLI distribution
(`dist/src/hooks/entry.js`) and never evaluates repository configuration.
`TEST_STEWARD_HOOK_ENTRY` overrides the entry path for testing.

## Behavior

- Reads the raw Codex hook payload from stdin.
- Stores a redacted compatibility reference in plugin data.
- Normalizes to the `hook-io.schema.json` invocation.
- Invokes the same core the `test-steward` CLI and Claude wrapper use.
- Translates the portable decision into the event-specific Codex output.
- Stop hooks request at most one remediation continuation per
  host/session/repository key; repeated stops always allow.

`TaskCompleted` is deliberately not registered: the current Codex runtime
does not expose that event, and the adapter never synthesizes `task_complete`
from Stop. Ordinary ChatGPT Chat or Work conversations are not a certified
hook surface.

## Uninstall

1. Disable or remove the plugin through the host.
2. Confirm the hook source disappears from `/hooks`.
3. Optionally delete Test Steward-owned state under `.test-steward/`.
4. Run `test-steward doctor` to confirm no hook executable remains.

Alpha certification covers the pinned Codex release on macOS and Linux only;
live payload capture is still pending (spec conflict CON-003). Alpha software
under the Apache-2.0 license; see the repository `NOTICE`.
