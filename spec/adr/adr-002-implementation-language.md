# ADR-002: TypeScript implementation default and overturn thresholds

**Status:** DECIDED  
**Date:** 2026-08-28

## Context

The alpha targets JS/TS repositories, uses `npx` as the zero-config adoption wedge, and needs native TypeScript program information. Rust was selected prematurely in the original plan. The owner ruling makes TypeScript the default while requiring measured escape criteria.

## Decision

Implement the alpha CLI and analyzers in TypeScript on a pinned supported Node.js LTS release. Use `ts-morph` over a pinned TypeScript compiler version for semantic AST analysis. Use Node `child_process.spawn` with explicit argv arrays rather than shell interpolation.

Before implementation moves beyond the CLI skeleton, measure all five owner thresholds:

1. **Warm no-op startup:** p95 below **500 ms**.
2. **Read-only `plan --diff`:** p95 below **2 s** on all four alpha fixtures without running tests.
3. **Deterministic JSON:** byte-identical canonical JSON for repeated runs against the same repository snapshot, after explicitly excluded volatile timing fields are removed.
4. **Clean `npx`:** install and execute in a fresh temporary npm cache and project without global packages.
5. **Safe process termination:** spawned fixture commands terminate, time out, and clean their descendant process groups on macOS and Linux.

### Measurement procedure

- Pin OS version, architecture, Node version, package-lock hash, repository commit, and power mode.
- Warm the package cache once; record 30 measured invocations for startup and each fixture.
- Measure monotonic elapsed time from process launch to parsed result.
- Report p50, p95, maximum, and raw sample list.
- For determinism, run each fixture ten times and compare canonicalized JSON hashes.
- For process termination, use a fixture that spawns a child and grandchild, then enforce timeout and verify no recorded PID remains alive.
- Save results under an implementation-owned benchmark artifact; do not backfill this ADR with invented numbers.

### Overturn path

Failure triggers a focused ADR comparing:

- a small compiled launcher in front of the TypeScript engine;
- a long-lived local daemon/cache;
- a Go core with ecosystem-native TypeScript analysis worker;
- a Rust core with ecosystem-native TypeScript analysis worker.

Failure does not automatically authorize a full rewrite.

## Alternatives considered

- Rust first: rejected for alpha because native JS/TS semantics and `npx` adoption dominate hypothetical cold-start benefits until measured otherwise.
- Go first: rejected for the same ecosystem impedance; retained as an overturn alternative.
- Babel-only TypeScript parsing: rejected because type and module semantics are central to public-contract classification.
- Direct TypeScript compiler API: rejected for alpha due implementation boilerplate; retained if `ts-morph` blocks required facts.

## Consequences

- The implementation can integrate runner and AST tooling directly.
- Dependency versions require deliberate pinning.
- Node startup and process control become measurable release gates.

## Closure

Node.js 22.13.0 is the minimum supported release. It passed the full Linux
suite and packed install; CI pins the same release on Linux and macOS. The
30-sample measurements in `spec/benchmark/performance-results.md` pass every
startup and fixture threshold, so the overturn path is not triggered.
