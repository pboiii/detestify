# Alpha benchmark metric definitions

**Status:** DECIDED  
**Reporting unit:** one host × task × arm × repetition, followed by per-host aggregation.

## 1. Correctness gates

### Hidden-fault detection

For one run:

```text
fault_detection_rate = detected valid faults / all valid faults
```

Invalid faults and infrastructure errors are reported separately. Alpha efficacy requires no hidden-fault regression in the full arm relative to the matched baseline for each host. A smaller test portfolio cannot compensate for a lower valid-fault detection count.

### Hidden acceptance pass

Boolean conjunction of the task's hidden behavior, contract, safety, and repository-integrity checks. A failed hidden acceptance check is a run failure.

### Decision correctness

Boolean evaluation of:

- allowed outcome set;
- obligation provenance constraints;
- target failure boundary/scope where applicable;
- cleanup action constraints;
- required limitations and uncertainty.

The oracle does not require an exact rationale string or golden test implementation.

## 2. Unnecessary test creation

A newly added test case is unnecessary when all are true:

1. it protects no expected task obligation or distinct failure mechanism;
2. an existing retained test or a smaller valid addition already detects the same applicable hidden faults;
3. it is not required for a distinct runner/layer contract accepted by the task oracle.

Report:

```text
new_test_files
new_test_cases
necessary_new_test_cases
unnecessary_new_test_cases
unnecessary_creation_rate = unnecessary / max(1, new_test_cases)
```

Task 01 expects zero new test cases. Task 02 expects zero unless the submitted refactor legitimately changes behavior, in which case the run ordinarily fails the task rather than earning permission for churn.

## 3. Test churn

Test churn is the normalized changed-test footprint:

```text
test_churn_lines = added test lines + deleted test lines
test_churn_cases = added cases + deleted cases + materially rewritten cases
```

Formatting-only changes are normalized before counting. For Task 02, full-arm churn must be lower than or equal to the matched baseline, with the primary success signal being zero test changes.

## 4. Protected-obligation loss

Count any protected test deleted, weakened, skipped, quarantined without ownership, or rendered unreachable without an accepted replacement that preserves the protected hidden obligation.

Alpha requires zero protected-obligation loss.

## 5. Cleanup safety

Per candidate:

- `delete_false_positive`: output is `DELETE_CANDIDATE` but structural + independent evidence, all protected checks, and human approval requirement are not present;
- `static_only_delete`: output is `DELETE_CANDIDATE` when every signal is static/structural;
- `protected_delete`: output suggests deletion of a protected test;
- `missed_exact_duplicate`: exact duplicate pair receives neither merge/delete candidate nor a disclosed limitation explaining why.

The first three are release-blocking fixture failures.

## 6. Hook false positives

A hook false positive occurs when the host requests remediation although the task oracle permits completion and the report has no gate-eligible declared/observed obligation with a concrete reproducible evidence gap.

Report numerator and denominator per host. Inferred, unknown, or unsupported facts cannot make a remediation request a true positive.

## 7. Bounded-remediation behavior

For each stop scenario record:

```text
continuations_requested: integer
repeated_stop_action: allow|advise|request_remediation
loop_terminated: boolean
```

Pass requires at most one continuation and no second remediation request after `already_remediated=true` or host `stop_hook_active=true`.

## 8. Overhead

Measure with a monotonic clock:

- CLI startup and command wall time;
- hook adapter wall time;
- total agent wall time;
- host/model token usage where available;
- number of tool invocations;
- API-equivalent spend.

Report medians and distributions; do not collapse host results into one average.

## 9. Alpha efficacy criterion

For each certified host independently:

1. hidden acceptance and valid-fault detection do not regress versus baseline; and
2. the full arm reduces unnecessary test creation or test churn versus baseline on at least three of four tasks.

A task is counted as improved only when correctness gate 1 passes. Side-by-side Claude/Codex reporting is descriptive; one host cannot offset failure on the other.
