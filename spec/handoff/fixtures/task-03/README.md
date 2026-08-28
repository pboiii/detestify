# Fixture task-03: stateful webhook boundary bug

Materialize `repo/` as a fresh Git repository. Commit it as the baseline revision. No setup patch is applied. The committed source contains the defect described by the agent-visible prompt.

Do not copy `oracle/` into the agent workspace or index it in the host context. `changes/` contains harness setup material only. The hidden scorer runs after the agent session according to `spec/benchmark/oracle-protocol.md`.
