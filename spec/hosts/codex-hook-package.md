# Codex command-hook package specification

**Status:** DECIDED for alpha implementation  
**Primary source:** `spec/compat/hooks-matrix.md`

## 1. Product surface

The current desktop application brings Chat, Work, and Codex together, while Codex remains a distinct view and workflow. Detestify supports the Codex view and Codex CLI hook runtime. It does not claim that ordinary Chat or Work conversations execute Codex lifecycle hooks.

## 2. Package layout

```text
plugins/openai/
  .codex-plugin/plugin.json
  hooks/hooks.json
  bin/detestify-hook
  skills/detestify/SKILL.md
  README.md
```

The plugin manifest points to `./hooks/hooks.json`. The launcher reads raw stdin, stores bounded invocation data in private user state, normalizes it, invokes the same core used by Claude/direct/CI, and translates the portable decision.

## 3. Manifest

```json
{
  "name": "detestify",
  "hooks": "./hooks/hooks.json"
}
```

Additional metadata follows the pinned OpenAI plugin schema. Hook paths must be `./`-prefixed, resolved inside the plugin root, and may not escape by symlink.

## 4. `hooks/hooks.json`

```json
{
  "description": "Detestify lifecycle checks",
  "hooks": {
    "SessionStart": [{
      "matcher": "startup|resume|clear|compact",
      "hooks": [{
        "type": "command",
        "command": "${PLUGIN_ROOT}/bin/detestify-hook codex session_start",
        "timeout": 5,
        "statusMessage": "Loading Detestify repository state",
        "additionalContextLimit": 6000
      }]
    }],
    "PreToolUse": [{
      "matcher": "Bash|apply_patch|Edit|Write",
      "hooks": [{
        "type": "command",
        "command": "${PLUGIN_ROOT}/bin/detestify-hook codex before_tool",
        "timeout": 5,
        "statusMessage": "Checking test-policy guard"
      }]
    }],
    "PostToolUse": [{
      "matcher": "Bash|apply_patch|Edit|Write",
      "hooks": [{
        "type": "command",
        "command": "${PLUGIN_ROOT}/bin/detestify-hook codex after_tool",
        "timeout": 5,
        "statusMessage": "Recording changed evidence"
      }]
    }],
    "SubagentStop": [{
      "hooks": [{
        "type": "command",
        "command": "${PLUGIN_ROOT}/bin/detestify-hook codex subagent_stop",
        "timeout": 20,
        "statusMessage": "Verifying subagent test evidence",
        "additionalContextLimit": 6000
      }]
    }],
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "${PLUGIN_ROOT}/bin/detestify-hook codex turn_stop",
        "timeout": 20,
        "statusMessage": "Verifying test evidence",
        "additionalContextLimit": 6000
      }]
    }],
    "SessionEnd": [{
      "hooks": [{
        "type": "command",
        "command": "${PLUGIN_ROOT}/bin/detestify-hook codex session_end",
        "timeout": 3
      }]
    }]
  }
}
```

Implementation must validate exact current tool names and remove unsupported aliases. `TaskCompleted` is not configured because the current Codex runtime does not expose that event.

## 5. Event mapping

| Codex event | Normalized event | Core action |
|---|---|---|
| `SessionStart` | `session_start` | doctor/capability cache |
| `PreToolUse` | `before_tool` | lightweight bypass/destructive guard |
| `PostToolUse` | `after_tool` | recompute diff and capture evidence references |
| `SubagentStop` | `subagent_stop` | bounded subagent verification |
| `Stop` | `turn_stop` | primary completion verification |
| `SessionEnd` | `session_end` | cleanup session state |

The normalized `task_complete` enum remains portable domain capacity. The Codex adapter advertises it unsupported and never emits it from production events. The synthetic fixture exists only to prove the core can parse the envelope without coupling it to Claude.

## 6. Handler restrictions

Use command handlers only in alpha. Codex currently supports command and MCP-tool handlers while parsing but skipping prompt and agent handlers. The plugin must not depend on skipped handlers or on an MCP connection being available.

## 7. Translation rules

- `allow`: exit 0 with valid event output or no output as allowed by the event.
- `advise`: place bounded context in the current supported output field; full detail stays in the report.
- `request_remediation` on `Stop`/`SubagentStop`: return `decision: "block"` with the bounded reason. This requests continuation; it does not reject or roll back the completed turn.
- `deny_tool` on `PreToolUse`: return the documented event-specific denial shape only for concrete deterministic tool policy.
- Unsupported actions degrade to advice and record a limitation.

## 8. One-shot remediation

1. Read Codex `stop_hook_active`.
2. Combine host flag with atomic plugin-data state keyed by session/repo/turn.
3. The initial eligible Stop may return one `decision: "block"` reason.
4. The resulting continuation is treated as a new prompt by Codex.
5. The next Stop must allow or advise; it may not block again.
6. A `continue: false` result from another matching hook takes precedence; Detestify records that it did not control the final outcome.
7. Apply the same bounded rule to a subagent key on `SubagentStop`.

## 9. Trust and install

- Codex hooks are enabled by the host feature but non-managed hook definitions require review and trust.
- Plugin installation does not automatically trust bundled hooks.
- Users review/trust the exact hook hash through `/hooks`; changed hooks require new review.
- `doctor` verifies plugin discovery, feature state, trusted hook hash, executable path, writable `PLUGIN_DATA`, host version, and schema compatibility.
- The wrapper does not use the dangerous trust-bypass option in normal installation or certification.

## 10. Merged desktop differences

- Distribution may expose the same plugin in supported ChatGPT/Codex directories, but hook certification is attached to the Codex runtime.
- `PLUGIN_ROOT` and `PLUGIN_DATA` are preferred. Compatibility variables such as `CLAUDE_PLUGIN_ROOT` are not the canonical OpenAI paths.
- Desktop and CLI must both pass the same raw-payload normalization and one-shot Stop tests before the host is called certified.

## 11. Uninstall

Disable/remove the plugin, confirm the hook source disappears from `/hooks`, optionally delete Detestify-owned plugin data, preserve repository reports/config, and run detached `doctor` verification.

## 12. Certification tests

- Live payload capture for each supported event from CLI and desktop Codex.
- Exact current output shape tests for allow, advise, deny, and continuation.
- Initial Stop continues once; repeated Stop exits without loop.
- Subagent continuation is independently bounded.
- Project hook trust changes invalidate prior approval.
- Commands started below repository root still resolve the installed plugin and Git root safely.
- Unsupported task-complete fixture is never emitted by production adapter code.
