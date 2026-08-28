# Fixture task-01: documentation only

Materialize `repo/` as a fresh Git repository. Commit it as the baseline revision. Apply `changes/initial.patch` to create the starting worktree diff before the agent session.

Do not copy `oracle/` into the agent workspace or index it in the host context. `changes/` contains harness setup material only. The hidden scorer runs after the agent session according to `spec/benchmark/oracle-protocol.md`.
