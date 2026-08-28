# Seeded-fault design rules

**Status:** DECIDED

## Required properties

Every seeded fault must:

1. represent one named failure mechanism relevant to the fixture obligation;
2. be non-equivalent under the hidden acceptance behavior;
3. compile and execute in the same environment as the unmodified fixture;
4. change no unrelated public behavior needed to detect the intended fault;
5. be independently applicable to the agent's final revision or be marked invalid;
6. remain hidden from the agent, skill, host hook, and Test Steward report inputs;
7. have a deterministic oracle and bounded command;
8. document why existing visible tests do or do not detect it in the baseline fixture.

Fault quantity follows distinct failure mechanisms. There is no fixed minimum per task.

## Disallowed faults

Do not use:

- syntax errors, missing imports, or obvious compilation failures;
- faults detectable only by source-text matching;
- implementation-specific mutations that legitimate alternative designs cannot receive;
- faults that alter the task prompt's requested behavior;
- broad deletion of a function or test suite;
- timing races without controlled scheduling or repeat policy;
- faults that disclose the expected test name, assertion, or implementation patch;
- equivalent mutants counted as survivors.

## Mechanism mapping

A fault record contains:

```yaml
id: stable identifier
obligation: protected behavior or invariant
mechanism: distinct failure mechanism
patch_ref: hidden patch path
detection_command: bounded command
validity_check: how the harness proves the fault is live
expected_visible_tests: detect|survive|not_applicable
notes: limitations and alternative-design handling
```

## Alternative implementations

When a submitted implementation makes a patch inapplicable, the harness may use a semantically equivalent adapter fault only when that adapter was declared before the run. Otherwise the fault is `invalid`, not `survived`.

## Benchmark-only boundary

Seeded faults are an evaluation instrument. Production cleanup decisions cannot cite benchmark faults unless the repository itself supplies and owns a fault-replay suite through an explicit adapter.
