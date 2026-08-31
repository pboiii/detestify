# Five-minute quickstart

**Status:** DECIDED adoption path

## 1. Read-only first run

Install the exact package from a trusted directory, then point it at a
JavaScript or TypeScript Git repository:

```text
npm install --global detestify@0.1.0-alpha.0
```

From the target repository:

```text
detestify plan --diff
```

The first run:

- discovers the Git root and current diff;
- detects supported repository shape and nearby tests;
- reads inert package metadata and TypeScript syntax/exports;
- produces a concise decision and a detailed local JSON report;
- does not run project scripts, install project dependencies, invoke mutation, edit files, create hooks, use the network beyond obtaining the explicitly requested npm package, or send telemetry.

Expected terminal structure:

```text
Decision: NEW_TEST_CANDIDATE
Why: stateful webhook claim/release behavior changed
Likely scope: integration
Failure class: claim not released after failed handler
Existing evidence: test/webhook.test.ts covers success and duplicate success only
Limitations: no repository command was executed; production database semantics are unverified
Report: .detestify/reports/<id>.json
```

For a documentation-only diff the correct output may be `NO_TEST_SUPPORTED`. When the repository does not expose enough product intent, the correct output is `INSUFFICIENT_EVIDENCE`.

## 2. Inspect compatibility

```text
detestify doctor
detestify inventory
```

These commands remain read-only. `doctor` reports platform, host, trust, and optional-tool compatibility. `inventory` reports repository/test shape and unsupported features.

## 3. Grant trust deliberately

Trust is required before Detestify executes repository test commands or consumes executable configuration. Trust must identify:

- repository root and revision/fingerprint;
- exact command argv or approved runner adapter;
- environment allowlist;
- timeout;
- network policy;
- report/data location.

Trust is never inferred from opening a repository or installing a plugin.

## 4. Verify a completed change

After granting the exact required trust:

```text
detestify verify-change
```

Optional coverage or mutation evidence is used only when explicitly requested and supported. Its absence does not prevent a report.

## 5. Enable a host wrapper

Install the Claude or OpenAI plugin package, review the bundled hook definition in the host's hook browser, and trust the exact current hook hash. Run:

```text
detestify doctor
```

Detestify supports Claude Code and the Codex workflow/CLI on macOS and Linux. Review the current installed definitions and validate their receipts in the host before relying on them. The merged desktop application does not imply ordinary Chat or Work conversations run Codex hooks.

## 6. Audit legacy tests

```text
detestify audit
detestify cleanup-plan
```

Both commands are read-only in alpha. A `DELETE_CANDIDATE` is still a human-review candidate, not an instruction automatically executed by Detestify.
