# Five-minute quickstart

**Status:** DECIDED adoption path

## 1. Read-only first run

From a JavaScript or TypeScript Git repository with Node available:

```text
npx test-steward plan --diff
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
Report: .test-steward/reports/<id>.json
```

For a documentation-only diff the correct output may be `NO_TEST_SUPPORTED`. When the repository does not expose enough product intent, the correct output is `INSUFFICIENT_EVIDENCE`.

## 2. Inspect compatibility

```text
npx test-steward doctor
npx test-steward inventory
```

These commands remain read-only. `doctor` reports platform, host, trust, and optional-tool compatibility. `inventory` reports repository/test shape and unsupported features.

## 3. Grant trust deliberately

Trust is required before Test Steward executes repository test commands or consumes executable configuration. Trust must identify:

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
npx test-steward verify-change
```

Optional coverage or mutation evidence is used only when explicitly requested and supported. Its absence does not prevent a report.

## 5. Enable a certified host wrapper

Install the Claude or OpenAI plugin package, review the bundled hook definition in the host's hook browser, and trust the exact current hook hash. Run:

```text
npx test-steward doctor
```

Certification applies to Claude Code and the Codex workflow/CLI. The merged desktop application does not imply ordinary Chat or Work conversations run Codex hooks.

## 6. Audit legacy tests

```text
npx test-steward audit
npx test-steward cleanup-plan
```

Both commands are read-only in alpha. A `DELETE_CANDIDATE` is still a human-review candidate, not an instruction automatically executed by Test Steward.
