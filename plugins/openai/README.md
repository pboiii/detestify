# Codex plugin

Detestify for Codex CLI 0.147.0. The plugin contains its own Node.js hook
runtime; it does not depend on this repository's `dist/` directory.

```text
plugins/openai/
  .codex-plugin/plugin.json
  hooks/hooks.json
  bin/detestify-hook
  runtime/entry.js
  schemas/*.schema.json
  skills/detestify/SKILL.md
  README.md
```

## Install

From the repository root:

```sh
npm run build
codex plugin marketplace add .
codex plugin add detestify@detestify
```

Run `/hooks` in a fresh Codex session. Review the Detestify commands and
trust them only if the paths point inside the installed plugin. Changed hook
definitions require another review. The hooks run with your user permissions;
they are a guardrail, not a sandbox. The launcher accepts Node.js 22 or newer
only from standard user-managed or system installation directories.

## Behavior

- Reads the raw Codex hook payload from stdin.
- Stores only bounded structured invocation receipts in private user state.
- Normalizes to the `hook-io.schema.json` invocation.
- Invokes the same core the `detestify` CLI and Claude wrapper use.
- Translates the portable decision into the event-specific Codex output.
- Stop hooks request at most one remediation continuation for a normalized
  host, session, turn-or-diff, and subagent identity; a repeat for that work
  item allows.

`TaskCompleted` is deliberately not registered: the current Codex runtime
does not expose that event, and the adapter never synthesizes `task_complete`
from Stop. Ordinary ChatGPT Chat or Work conversations do not load these Codex
hooks.

## Uninstall

1. Run `codex plugin remove detestify@detestify`.
2. Confirm the hook source disappears from `/hooks`.
3. Optionally run `codex plugin marketplace remove detestify`.
4. Optionally remove Detestify state from your user state directory.

This alpha package targets macOS and Linux. Installation does not prove that
every host event fired; validate the hooks in the installed host before relying
on them.
