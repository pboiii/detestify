# Claude Code command-hook package specification

**Status:** DECIDED for alpha implementation  
**Primary source:** `spec/compat/hooks-matrix.md`

## 1. Package layout

```text
plugins/claude/
  .claude-plugin/plugin.json
  hooks/hooks.json
  bin/test-steward-hook
  skills/test-steward/SKILL.md
  README.md
```

`bin/test-steward-hook` is a thin launcher into the installed TypeScript CLI. It reads the raw event from stdin, writes a redacted raw fixture/reference outside the repository, normalizes the event, invokes the core, and translates the portable decision into the event-specific Claude JSON shape.

## 2. Manifest

The implementation manifest must name the plugin and declare the default `hooks/hooks.json`. Exact metadata fields must be validated against the pinned Claude release during implementation. No manifest field may execute repository-provided commands.

Illustrative required intent:

```json
{
  "name": "test-steward",
  "version": "<package version>",
  "description": "Evidence-backed test portfolio guidance and bounded verification",
  "skills": "./skills/",
  "hooks": "./hooks/hooks.json"
}
```

If the pinned Claude manifest schema does not accept `skills` or `hooks` fields, preserve the conventional directories and record the change in `spec/conflicts.md`; do not silently invent metadata.

## 3. `hooks/hooks.json`

The package uses only synchronous command handlers for decisions. The implementation must render this semantic configuration with the installed launcher path:

```json
{
  "description": "Test Steward lifecycle checks",
  "hooks": {
    "SessionStart": [{
      "matcher": "startup|resume|clear|compact",
      "hooks": [{
        "type": "command",
        "command": "${CLAUDE_PLUGIN_ROOT}/bin/test-steward-hook claude session_start",
        "timeout": 5
      }]
    }],
    "PreToolUse": [{
      "matcher": "Bash|Edit|Write|MultiEdit|NotebookEdit",
      "hooks": [{
        "type": "command",
        "command": "${CLAUDE_PLUGIN_ROOT}/bin/test-steward-hook claude before_tool",
        "timeout": 5
      }]
    }],
    "PostToolUse": [{
      "matcher": "Bash|Edit|Write|MultiEdit|NotebookEdit",
      "hooks": [{
        "type": "command",
        "command": "${CLAUDE_PLUGIN_ROOT}/bin/test-steward-hook claude after_tool",
        "timeout": 5
      }]
    }],
    "TaskCompleted": [{
      "hooks": [{
        "type": "command",
        "command": "${CLAUDE_PLUGIN_ROOT}/bin/test-steward-hook claude task_complete",
        "timeout": 20
      }]
    }],
    "SubagentStop": [{
      "hooks": [{
        "type": "command",
        "command": "${CLAUDE_PLUGIN_ROOT}/bin/test-steward-hook claude subagent_stop",
        "timeout": 20
      }]
    }],
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "${CLAUDE_PLUGIN_ROOT}/bin/test-steward-hook claude turn_stop",
        "timeout": 20
      }]
    }],
    "SessionEnd": [{
      "hooks": [{
        "type": "command",
        "command": "${CLAUDE_PLUGIN_ROOT}/bin/test-steward-hook claude session_end",
        "timeout": 3
      }]
    }]
  }
}
```

Implementation must verify current built-in tool names. Unknown tool matchers are removed, not broadened to every tool. `FileChanged` is deliberately absent because its filename-watch semantics are not a repository-wide diff signal.

## 4. Event mapping

| Claude event | Normalized event | Core action |
|---|---|---|
| `SessionStart` | `session_start` | read-only doctor/capability cache |
| `PreToolUse` | `before_tool` | lightweight bypass and destructive-tool guard; no test execution |
| `PostToolUse` | `after_tool` | record actual Git-diff fingerprint and evidence references |
| `TaskCompleted` | `task_complete` | advisory verification; do not make the core depend on this event |
| `SubagentStop` | `subagent_stop` | bounded subagent verification |
| `Stop` | `turn_stop` | primary completion verification |
| `SessionEnd` | `session_end` | bounded cleanup of session state |

## 5. Translation rules

- Portable `allow`: exit 0 with no decision output unless an informational message is needed.
- Portable `advise`: return event-supported context without blocking. If the event lacks context support, preserve the report path and allow.
- Portable `request_remediation` on `Stop`, `SubagentStop`, or `TaskCompleted`: translate to the current event-specific blocking/feedback shape.
- Portable `deny_tool` on `PreToolUse`: translate to the current permission-decision shape; never use semantic uncertainty for denial.
- A portable action unsupported by an event degrades to `advise` and records a limitation. It is never guessed.

## 6. One-shot remediation

For `Stop`:

1. Read Claude `stop_hook_active`.
2. Resolve session state keyed by host/session/repo/turn.
3. If either host state or persisted state shows prior continuation, do not return another block.
4. On first eligible remediation, return one concrete bounded reason and persist attempt 1 atomically.
5. On the repeated stop, return allow/advice and include the detailed report path.
6. Expire loop state on session end and by bounded TTL.

The same rule applies to `SubagentStop` with agent identity included in the key. `TaskCompleted` may prevent completion once only when the rule is gate-eligible and configured; otherwise it advises.

## 7. Installation and trust

- Installation follows the current Claude plugin marketplace or local plugin path flow.
- Users review plugin source and hooks before enabling.
- `doctor` confirms package root, executable resolution, host version, hook discovery, schema compatibility, and writable private data location.
- Repository-local Test Steward configuration is inert until explicit trust.
- The hook launcher never evaluates repository JavaScript/TypeScript configuration during discovery.

## 8. Uninstall

Uninstall must:

1. disable/remove the plugin through the host-supported mechanism;
2. verify no Test Steward hooks remain active in `/hooks`;
3. remove only Test Steward-owned session/cache data after explicit confirmation;
4. leave repository reports and user-authored configuration untouched;
5. run `doctor` in detached mode to confirm no executable hook path remains.

## 9. Certification tests

- Raw payload fixtures for every used event normalize successfully.
- Event-specific output validates against the pinned host behavior.
- Initial Stop can request one continuation.
- Repeated Stop with `stop_hook_active=true` cannot request another.
- User interrupt does not get misreported as successful verification.
- Timeouts terminate descendants and return a limitation rather than a success claim.
- Untrusted repository config cannot inject a command or change launcher paths.
