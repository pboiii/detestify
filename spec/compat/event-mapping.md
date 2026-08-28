# Host event mapping

**Status:** DECIDED  
**Normalized event enum:** `session_start | before_tool | after_tool | task_complete | subagent_stop | turn_stop | session_end`

## Mapping principles

1. A host adapter may emit only events the host actually exposes.
2. Normalization preserves semantic cadence, not every raw field.
3. Raw payloads remain versioned compatibility fixtures; the core receives references rather than unbounded raw text.
4. Dropped host events remain observable in host-specific debug logs but do not expand the core enum.
5. A failed tool result may normalize as `after_tool` with a failed `result_ref`; the normalized envelope does not invent a separate failure event.

## Normalized-event coverage

| Normalized event | Claude Code source event | Codex source event | Direct CLI / CI source | Notes |
|---|---|---|---|---|
| `session_start` | `SessionStart` | `SessionStart` | Process invocation creates a synthetic start record | Both hosts provide source/start reason in raw payload. |
| `before_tool` | `PreToolUse` | `PreToolUse` | Not emitted by ordinary direct CLI | Tool inputs are stored out-of-band when large; normalized envelope carries `input_ref`. |
| `after_tool` | `PostToolUse`; optionally `PostToolUseFailure` folded with failed result metadata | `PostToolUse`; unsupported/failed paths may be absent | Not emitted by ordinary direct CLI | Do not infer a tool result when the host does not deliver one. |
| `task_complete` | `TaskCompleted` | **No native event** | CI job or direct caller may emit a synthetic task checkpoint | Codex wrapper v1 does not emit this event. `task-complete-synthetic.json` tests schema portability only. |
| `subagent_stop` | `SubagentStop` | `SubagentStop` | Not emitted unless a caller implements subagents | Both carry `stop_hook_active`; the raw agent transcript is referenced, not copied into model context. |
| `turn_stop` | `Stop` | `Stop` | Direct `verify-change` completion checkpoint | Primary bounded remediation gate for both certified hosts. |
| `session_end` | `SessionEnd` | `SessionEnd` | Process exit record where requested | Codex `SessionEnd` is documented for the main thread only and has a short timeout. |

## Claude events deliberately dropped

| Host event group | Events | Reason |
|---|---|---|
| Prompt lifecycle | `UserPromptSubmit`, `UserPromptExpansion` | Test Steward analyzes the actual diff and explicit task context; it does not intercept ordinary prompts in alpha. |
| Permission lifecycle | `PermissionRequest`, `PermissionDenied` | `PreToolUse` supplies the portable guard; host permission UX remains host-owned. |
| Batch and failure refinements | `PostToolBatch`, `PostToolUseFailure` | Batch state is recomputed from Git; failure may fold into `after_tool` only when a result reference exists. |
| Task creation and team coordination | `TaskCreated`, `TeammateIdle`, `SubagentStart` | No portable alpha decision requires them. |
| Compaction | `PreCompact`, `PostCompact` | Conversation-memory concern, not test-portfolio policy. |
| Filesystem and workspace | `FileChanged`, `CwdChanged`, `DirectoryAdded`, `WorktreeCreate`, `WorktreeRemove` | `FileChanged` watches literal basenames rather than repository globs. The core reads Git and canonical paths on invocation. |
| Configuration/UI/MCP | `ConfigChange`, `InstructionsLoaded`, `Notification`, `MessageDisplay`, `Elicitation`, `ElicitationResult` | No alpha policy contract depends on these events. |
| Failure terminal | `StopFailure` | Not evidence that work is complete; logged host-side only. |
| Setup | `Setup` | No portable equivalent required. |

## Codex events deliberately dropped

| Host event group | Events | Reason |
|---|---|---|
| Prompt and permission | `UserPromptSubmit`, `PermissionRequest` | The portable guard is `before_tool`; ordinary prompt interception is outside alpha. |
| Compaction | `PreCompact`, `PostCompact` | Not test-portfolio evidence. |
| Subagent start | `SubagentStart` | No core decision needed before a subagent starts. |

## Adapter handling of unsupported normalized events

- `task_complete` for Codex is declared `unsupported_native_event` in capability negotiation.
- No adapter may synthesize `task_complete` from `Stop`; the events have different semantics.
- The representative synthetic fixture uses `host: "codex"` only to prove the host-neutral schema remains parseable for future Codex support. Its fixture metadata explicitly marks `synthetic: true` outside the normalized envelope.
- A report must list unsupported events under `limitations`; absence is never treated as successful enforcement.

## Sources

- Claude Code hook reference: https://code.claude.com/docs/en/hooks (accessed 2026-08-28)
- Codex hook reference: https://learn.chatgpt.com/docs/hooks (accessed 2026-08-28)
