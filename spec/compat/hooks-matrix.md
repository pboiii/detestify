# Hook compatibility matrix

**Status:** DECIDED compatibility baseline  
**Access date for all sources:** 2026-08-28  
**Scope:** Claude Code and Codex local command-hook runtimes used by the alpha wrappers.

## Interpretation rules

- External claims use `VERIFIED`, `CHANGED`, or `UNVERIFIED`.
- `stable` means documented current release behavior, not a promise of permanent API stability.
- `experimental` is used only where the vendor labels the capability experimental.
- `absent` means the current host does not expose the event or handler type in its documented hook runtime.
- The normalized core contract is deliberately narrower than either host. Unsupported host events are dropped rather than projected into invented semantics.

## Desktop product premise

| Claim | Verdict | Current fact | Architecture implication | Source |
|---|---|---|---|---|
| The former standalone Codex desktop app is reached through the new ChatGPT desktop app. | VERIFIED | The new desktop app brings Chat, Work, and Codex together. Existing Codex users update into the new app. | Do not create a separate ChatGPT-specific Test Steward surface. | https://help.openai.com/en/articles/20001276/ (accessed 2026-08-28) |
| ChatGPT and Codex are one undifferentiated hook execution surface. | CHANGED | Codex remains a separate view with unchanged workflows and history. Hooks documented for Codex must not be attributed to ordinary Chat or Work conversations. | Certify the Codex view and Codex CLI. Keep the provider-neutral skill portable, but do not claim Chat/Work executes local command hooks. | https://help.openai.com/en/articles/20001275 (accessed 2026-08-28) |
| Plugins are discoverable across supported ChatGPT and Codex surfaces. | VERIFIED | OpenAI documents a universal plugin directory; plugins can include skills and hooks, with hooks reviewed before use. | One public skills package can be discoverable across supported surfaces; local enforcement remains Codex-specific. | https://learn.chatgpt.com/docs/plugins (accessed 2026-08-28) |

## Claude Code lifecycle events

Official source for every row: https://code.claude.com/docs/en/hooks (accessed 2026-08-28).

| Current event | Cadence / matcher input | Input payload additions | Output and blocking semantics | Stability | Verdict | Alpha use | Source |
|---|---|---|---|---|---|---|---|
| `Setup` | Setup lifecycle; matcher follows setup trigger | Common fields plus setup source | Command or MCP-tool output; not part of the portable alpha lifecycle | stable | VERIFIED | Drop | https://code.claude.com/docs/en/hooks (accessed 2026-08-28) |
| `SessionStart` | Session start; matcher `startup|resume|clear|compact` | Common fields and source | Can add context; command and MCP-tool handlers supported | stable | VERIFIED | `session_start` | https://code.claude.com/docs/en/hooks (accessed 2026-08-28) |
| `UserPromptSubmit` | Once per user prompt | Prompt text | Can add context or block prompt | stable | VERIFIED | Drop in alpha | https://code.claude.com/docs/en/hooks (accessed 2026-08-28) |
| `UserPromptExpansion` | Slash-command expansion | Expansion context | Supports decision control | stable | VERIFIED | Drop | https://code.claude.com/docs/en/hooks (accessed 2026-08-28) |
| `PreToolUse` | Before matching tool; matcher is tool name | Tool name, input, tool-use id | Command output can allow, deny, ask, or update input according to event schema; exit 2 blocks | stable | VERIFIED | `before_tool` | https://code.claude.com/docs/en/hooks (accessed 2026-08-28) |
| `PermissionRequest` | Before a permission decision | Tool and proposed permission | Can allow or deny permission | stable | VERIFIED | Drop; `PreToolUse` is the portable guard | https://code.claude.com/docs/en/hooks (accessed 2026-08-28) |
| `PostToolUse` | After successful tool use | Tool name/input/response | Can provide context or block continuation with feedback | stable | VERIFIED | `after_tool` | https://code.claude.com/docs/en/hooks (accessed 2026-08-28) |
| `PostToolUseFailure` | After failed tool use | Tool error fields | Can provide feedback | stable | VERIFIED | Fold into `after_tool` with failed result reference when adapter supports it | https://code.claude.com/docs/en/hooks (accessed 2026-08-28) |
| `PostToolBatch` | After a batch of tools | Batch details | Can evaluate the batch; prompt and agent handlers supported | stable | VERIFIED | Drop; stop verification reads actual Git diff | https://code.claude.com/docs/en/hooks (accessed 2026-08-28) |
| `SubagentStart` | Subagent starts; matcher agent type | Agent id/type | Context-only lifecycle response | stable | VERIFIED | Drop | https://code.claude.com/docs/en/hooks (accessed 2026-08-28) |
| `SubagentStop` | Subagent finished; matcher agent type | `stop_hook_active`, agent id/type, transcript path, last message | `decision: block` with reason continues subagent; no `additionalContext`; exit 2 alternative | stable | VERIFIED | `subagent_stop` | https://code.claude.com/docs/en/hooks (accessed 2026-08-28) |
| `TaskCreated` | TaskCreate operation | Task fields | Exit 2 prevents creation; structured control available | stable | VERIFIED | Drop | https://code.claude.com/docs/en/hooks (accessed 2026-08-28) |
| `TaskCompleted` | TaskUpdate completion or teammate finishes with in-progress task | Task id/subject/description and optional team fields | Exit 2 prevents completion and feeds feedback; `continue:false` stops teammate | stable | VERIFIED | `task_complete` | https://code.claude.com/docs/en/hooks (accessed 2026-08-28) |
| `TeammateIdle` | Agent-team teammate becomes idle | Teammate fields | Can block idle or feed feedback depending on current event contract | stable | VERIFIED | Drop | https://code.claude.com/docs/en/hooks (accessed 2026-08-28) |
| `Stop` | Main agent has finished; does not fire on user interrupt; API errors use `StopFailure` | `stop_hook_active`, last assistant message | `decision: block` with reason continues; implementation must check loop state; Claude eventually overrides repeated blocking | stable | VERIFIED | `turn_stop` | https://code.claude.com/docs/en/hooks (accessed 2026-08-28) |
| `StopFailure` | Main agent stops because of API/runtime failure | Failure details | Informational/recovery output; not a semantic completion gate | stable | VERIFIED | Drop | https://code.claude.com/docs/en/hooks (accessed 2026-08-28) |
| `PreCompact` | Before compaction | Trigger details | Context/control as documented | stable | VERIFIED | Drop | https://code.claude.com/docs/en/hooks (accessed 2026-08-28) |
| `PostCompact` | After compaction | Trigger details | Context/control as documented | stable | VERIFIED | Drop | https://code.claude.com/docs/en/hooks (accessed 2026-08-28) |
| `SessionEnd` | End of session | End reason | Cleanup/telemetry; bounded execution | stable | VERIFIED | `session_end` | https://code.claude.com/docs/en/hooks (accessed 2026-08-28) |
| `Elicitation` | MCP elicitation starts | Elicitation fields | Command/HTTP/MCP handler output | stable | VERIFIED | Drop | https://code.claude.com/docs/en/hooks (accessed 2026-08-28) |
| `ElicitationResult` | MCP elicitation completes | Result fields | Command/HTTP/MCP handler output | stable | VERIFIED | Drop | https://code.claude.com/docs/en/hooks (accessed 2026-08-28) |
| `PermissionDenied` | Permission already denied | Denial details | Retry-oriented output; denial has already happened | stable | VERIFIED | Drop | https://code.claude.com/docs/en/hooks (accessed 2026-08-28) |
| `WorktreeCreate` | Worktree lifecycle | Worktree path/details | Lifecycle response | stable | VERIFIED | Drop | https://code.claude.com/docs/en/hooks (accessed 2026-08-28) |
| `WorktreeRemove` | Worktree lifecycle | Worktree path/details | Lifecycle response | stable | VERIFIED | Drop | https://code.claude.com/docs/en/hooks (accessed 2026-08-28) |
| `Notification` | Notification emitted | Notification fields | Informational | stable | VERIFIED | Drop | https://code.claude.com/docs/en/hooks (accessed 2026-08-28) |
| `ConfigChange` | Configuration changes | Changed config fields | Informational/control per event | stable | VERIFIED | Drop | https://code.claude.com/docs/en/hooks (accessed 2026-08-28) |
| `InstructionsLoaded` | Instructions loaded | Source/path information | Informational | stable | VERIFIED | Drop | https://code.claude.com/docs/en/hooks (accessed 2026-08-28) |
| `CwdChanged` | Working directory changes | Old/new cwd | Informational | stable | VERIFIED | Drop; recompute root on next core invocation | https://code.claude.com/docs/en/hooks (accessed 2026-08-28) |
| `DirectoryAdded` | Directory added to session scope | Directory fields | Informational | stable | VERIFIED | Drop | https://code.claude.com/docs/en/hooks (accessed 2026-08-28) |
| `FileChanged` | Watched filename changes; matcher segments form literal basename watch list; `*` is literal for watch-list construction | `file_path`, filesystem event | No decision control; can return `watchPaths` to replace a dynamic watch list and can persist environment variables through `CLAUDE_ENV_FILE` | stable | VERIFIED | Excluded from core; not a repository-glob change detector | https://code.claude.com/docs/en/hooks (accessed 2026-08-28) |
| `MessageDisplay` | UI message lifecycle | Message fields | Informational | stable | VERIFIED | Drop | https://code.claude.com/docs/en/hooks (accessed 2026-08-28) |

### Claude handler and package facts

| Claim | Verdict | Current fact | Source |
|---|---|---|---|
| Command hooks are suitable for production enforcement. | VERIFIED | Command hooks are documented generally; agent-based hooks are explicitly experimental and vendor guidance says to prefer command hooks for production. | https://code.claude.com/docs/en/hooks (accessed 2026-08-28) |
| Claude supports five handler types everywhere. | CHANGED | Handler support depends on event. The runtime documents command, HTTP, MCP-tool, prompt, and agent handlers, but `SessionStart`/`Setup` and several lifecycle events support narrower subsets. | https://code.claude.com/docs/en/hooks (accessed 2026-08-28) |
| Plugin hooks live in `hooks/hooks.json`. | VERIFIED | Plugin hooks use the plugin component format and are surfaced in `/hooks` with source `Plugin`. | https://code.claude.com/docs/en/hooks and https://code.claude.com/docs/en/plugins-reference (accessed 2026-08-28) |
| Hook commands are a security boundary. | CHANGED | Vendor documentation warns that command hooks run with the user’s permissions; they are a guardrail, not a sandbox. | https://code.claude.com/docs/en/hooks (accessed 2026-08-28) |

## Codex lifecycle events

Official source for every row: https://learn.chatgpt.com/docs/hooks (accessed 2026-08-28).

| Current event | Cadence / matcher input | Input payload additions | Output and blocking semantics | Stability | Verdict | Alpha use | Source |
|---|---|---|---|---|---|---|---|
| `SessionStart` | Start/resume/clear/compact | Common fields plus source | Context/control according to event output | stable | VERIFIED | `session_start` | https://learn.chatgpt.com/docs/hooks (accessed 2026-08-28) |
| `SubagentStart` | Subagent starts; matcher agent type | Agent id/type | Lifecycle context | stable | VERIFIED | Drop | https://learn.chatgpt.com/docs/hooks (accessed 2026-08-28) |
| `UserPromptSubmit` | User prompt submission; matcher ignored | `turn_id`, prompt | Plain stdout or `additionalContext`; `decision:block` prevents prompt | stable | VERIFIED | Drop | https://learn.chatgpt.com/docs/hooks (accessed 2026-08-28) |
| `PreToolUse` | Before local tool; matcher tool name | Tool name, input, tool-use id and Codex turn id | Can block or rewrite supported local tool calls | stable | VERIFIED | `before_tool` | https://learn.chatgpt.com/docs/hooks (accessed 2026-08-28) |
| `PermissionRequest` | Permission request; matcher tool name | Permission proposal | Can approve or deny | stable | VERIFIED | Drop | https://learn.chatgpt.com/docs/hooks (accessed 2026-08-28) |
| `PostToolUse` | After supported local tool | Tool name/input/response | Feedback/context according to event output | stable | VERIFIED | `after_tool` | https://learn.chatgpt.com/docs/hooks (accessed 2026-08-28) |
| `PreCompact` | Before compaction; matcher manual/auto | `turn_id`, trigger | Can stop before compacting | stable | VERIFIED | Drop | https://learn.chatgpt.com/docs/hooks (accessed 2026-08-28) |
| `PostCompact` | After compaction; matcher manual/auto | `turn_id`, trigger | Can stop after compacting | stable | VERIFIED | Drop | https://learn.chatgpt.com/docs/hooks (accessed 2026-08-28) |
| `SubagentStop` | Subagent ends; matcher agent type | `turn_id`, agent fields, `stop_hook_active`, last message | JSON required on exit 0; `decision:block` and reason continue subagent; exit 2 alternative | stable | VERIFIED | `subagent_stop` | https://learn.chatgpt.com/docs/hooks (accessed 2026-08-28) |
| `Stop` | Main turn ends; matcher ignored | `turn_id`, `stop_hook_active`, last message | JSON required on exit 0; `decision:block` creates a new continuation prompt from `reason`; exit 2 alternative | stable | VERIFIED | `turn_stop` | https://learn.chatgpt.com/docs/hooks (accessed 2026-08-28) |
| `SessionEnd` | Main thread ends; matcher currently `other` | End reason | Short bounded cleanup hook; no subagent session-end | stable | VERIFIED | `session_end` | https://learn.chatgpt.com/docs/hooks (accessed 2026-08-28) |
| `TaskCompleted` | No documented Codex hook event | none | absent | absent | VERIFIED | No native mapping. A synthetic fixture tests the normalized contract only. | https://learn.chatgpt.com/docs/hooks (accessed 2026-08-28) |

### Codex handler, discovery, trust, and package facts

| Claim | Verdict | Current fact | Source |
|---|---|---|---|
| Codex executes command and MCP-tool hook handlers. | VERIFIED | Current docs state command and `mcp_tool` handlers execute. | https://learn.chatgpt.com/docs/hooks (accessed 2026-08-28) |
| Codex executes prompt and agent hook handlers. | CHANGED | These handler types are parsed but skipped in the current release. | https://learn.chatgpt.com/docs/hooks (accessed 2026-08-28) |
| Codex hooks are discovered only from a plugin. | CHANGED | Codex loads `hooks.json` or inline hooks beside active configuration layers and can also load plugin-bundled hooks. | https://learn.chatgpt.com/docs/hooks (accessed 2026-08-28) |
| Project hooks run automatically when present. | CHANGED | Project-local hooks require the project layer and exact hook definition to be trusted. Changed definitions are skipped until reviewed again. `/hooks` manages review and trust. | https://learn.chatgpt.com/docs/hooks (accessed 2026-08-28) |
| Plugin default hook path is `hooks/hooks.json`. | VERIFIED | Plugins may bundle lifecycle config through their manifest or default hook path. | https://learn.chatgpt.com/docs/hooks and https://learn.chatgpt.com/docs/plugins (accessed 2026-08-28) |
| `.codex-plugin/plugin.json` can participate in packaging. | VERIFIED | OpenAI plugin guidance documents conversion to `.codex-plugin/plugin.json`; current plugin docs support bundled hooks and skills. | https://developers.openai.com/plugins/guides/submit-claude-plugin and https://learn.chatgpt.com/docs/plugins (accessed 2026-08-28) |
| Tool hooks observe every Codex tool. | CHANGED | Most local function tools use the hook path, but hosted tools and specialized paths can be absent. The docs explicitly call hooks a useful guardrail rather than complete enforcement. | https://learn.chatgpt.com/docs/hooks (accessed 2026-08-28) |

## Certification conclusion

`VERIFIED`: a live command-hook wrapper is technically supportable for both Claude Code and Codex. Both expose `PreToolUse`, `PostToolUse`, `SubagentStop`, `Stop`, session start, and session end semantics sufficient for the normalized alpha lifecycle. Both expose a stop-loop flag and bounded continuation mechanism.

`CHANGED`: the two hosts are not event-identical. Codex has no native `TaskCompleted`; Claude `FileChanged` is not a general glob-based repository change feed; ChatGPT Chat/Work must not be described as running Codex hooks merely because all three views share one desktop app.
