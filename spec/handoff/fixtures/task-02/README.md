# Fixture task-02: behavior-preserving refactor

Materialize `repo/` as a fresh Git repository. Commit it as the baseline revision. No setup patch is applied; the agent receives the engineering prompt against the committed baseline.

Do not copy `oracle/` into the agent workspace or index it in the host context. `changes/` contains harness setup material only. The hidden scorer runs after the agent session according to `spec/benchmark/oracle-protocol.md`.
