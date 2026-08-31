# Claude plugin

Detestify for Claude Code 2.1.241. The plugin contains its own Node.js hook
runtime; it does not depend on this repository's `dist/` directory.

```text
plugins/claude/
  .claude-plugin/plugin.json
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
claude plugin marketplace add . --scope user
claude plugin install detestify@detestify --scope user
```

Run `/hooks` in a fresh Claude Code session. Review the Detestify commands
and enable them only if the paths point inside the installed plugin. The hooks
run with your user permissions; they are a guardrail, not a sandbox. The
launcher accepts Node.js 22 or newer only from standard user-managed or system
installation directories.

## Behavior

- Reads the raw Claude hook payload from stdin.
- Stores only bounded structured invocation receipts in private user state.
- Normalizes to the `hook-io.schema.json` invocation.
- Invokes the same core the `detestify` CLI uses.
- Translates the portable decision into the event-specific Claude output.
- Stop hooks request at most one remediation continuation for a normalized
  host, session, turn-or-diff, and subagent identity; a repeat for that work
  item allows.

`FileChanged` is deliberately not registered: it watches literal filenames,
not repository-wide changes.

## Uninstall

1. Run `claude plugin uninstall detestify@detestify`.
2. Confirm no Detestify hooks remain in `/hooks`.
3. Optionally run `claude plugin marketplace remove detestify`.
4. Optionally remove Detestify state from your user state directory.

This alpha package targets macOS and Linux. Installation does not prove that
every host event fired; validate the hooks in the installed host before relying
on them.
