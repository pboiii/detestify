# Threat model outline

**Status:** DECIDED outline; expanded in `spec/threat-model.md`.

## Assets

- source and test files;
- Git metadata and worktrees;
- host session and hook payloads;
- tool credentials and environment variables;
- policy configuration and protected-obligation records;
- generated reports, evidence, and cleanup plans;
- user trust decisions;
- child-process and test-runner execution environment.

## Trust boundaries

1. User and certified host -> adapter stdin.
2. Adapter -> normalized schema validator.
3. Repository filesystem/config -> deterministic analyzer.
4. Analyzer -> optional repository commands/test runners.
5. External tool output -> evidence parser.
6. Core report -> model-visible summary.
7. Cleanup planner -> isolated worktree instructions.
8. Plugin package/update source -> local executable environment.

## Top abuse cases

- malicious repository config causes arbitrary command execution;
- shell injection through paths, test names, or hook fields;
- symlink escape outside repository root;
- prompt injection in source, test output, filenames, or report text;
- spoofed or replayed hook payload;
- tampered report or stale Git snapshot;
- oversized output or adversarial AST causes denial of service;
- Stop hook creates an unbounded remediation loop;
- child process or descendant survives timeout;
- sensitive environment or source content is sent over network;
- cleanup recommendation deletes protected or semantically unique evidence;
- dependency/plugin update introduces malicious code.

## Required mitigation themes

- zero-config path executes no repository code and performs no network access;
- explicit trust before scripts, configuration evaluation, mutation, or hooks;
- direct argv execution with no shell by default;
- canonical-path containment and symlink policy;
- schema validation, size limits, redaction, and separation of raw evidence from model context;
- content hashes and repository snapshot identifiers;
- timeouts and descendant process cleanup;
- one-shot loop guard;
- read-only cleanup and human approval;
- lockfiles, provenance, checksums, dependency review, and signed release artifacts.
