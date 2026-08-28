# Specification validation log

**Status:** PASS  
**Run date:** 2026-08-28  
**Tree:** `spec/`  
**Authoring validator:** external validation harness used to validate this specification tree; not implementation source code

## Environment

```text
Python 3.13.5
jsonschema 4.26.0
PyYAML 6.0.3
TypeScript compiler 5.8.3
Linux 6.18.35 x86_64, glibc 2.41
```

## Command

```text
python /mnt/data/validate_spec_tree.py
```

## Validations performed

- exact Package A–F and final-deliverable artifact presence;
- parse of every JSON and YAML document;
- draft-2020-12 metaschema validation for every JSON Schema;
- description checks for every schema property;
- every required example against its schema;
- every expected policy golden against `decision.schema.json`;
- every Codex normalized fixture against the hook input envelope;
- policy-rule positive, negative, ambiguous, classification, and low-confidence coverage;
- absence of scalar or multiplicative risk scoring;
- Agent Skill line limit;
- exact dual-host canary caps;
- four benchmark hidden-oracle and expected-decision contracts;
- complete fixture structure, exact duplicate, and protected-test records;
- TypeScript parse of fixture and hidden-oracle files;
- strict TypeScript typecheck of fixture production source;
- implementation-brief and specification cross-reference resolution;
- naming candidate count;
- hook-matrix verdict and source coverage;
- tool-dossier fact labeling and source coverage;
- fact-versus-decision separation in the conflict register;
- cleanup deletion and explicit decision-field safety constraints.

## Output

```text
PASS: all 47 required top-level package artifacts exist
PASS: parsed 236 JSON files
PASS: parsed 5 YAML files
PASS: all 7 schemas pass draft-2020-12 metaschema and property-description checks
PASS: all 10 schema examples validate
PASS: 99 policy golden input/expected pairs exist
PASS: all 99 golden expected decisions validate against decision.schema.json
PASS: all 7 Codex normalized fixtures validate against hook input envelope
PASS: all 33 policy rules include classification and positive/negative/ambiguous behavior
PASS: policy contains no scalar/multiplicative risk formula
PASS: SKILL.md is 178 lines (<500)
PASS: dual-host canary encodes all per-host and total caps
PASS: all four benchmark tasks contain hidden oracles and expected-decision contracts
PASS: four fixture repositories are complete; Task 04 includes exact duplicate and protected records
PASS: all fixture and hidden-oracle TypeScript files parse with tsc --noCheck
PASS: all fixture production source files pass strict TypeScript typecheck
PASS: implementation brief artifact references resolve (18 checked)
PASS: naming report covers 10 candidate rows
PASS: all 44 hook lifecycle rows include fact verdict and primary-source URL/access date
PASS: tool dossier labels and sources 31 external-fact rows
PASS: all 10 conflict rows separate fact verdicts from normative status
PASS: all explicit specification references resolve (28 unique paths)
PASS: DELETE_CANDIDATE requires every protected check to pass
PASS: decision schema requires explicit nullable cleanup_requirements
INFO: specification files in final tree: 309
INFO: JSON files: 236; YAML files: 5; schemas: 7
INFO: policy rules: 33; golden pairs: 99
```

## Evidence boundary

This PASS establishes internal consistency and mechanical validity of the specification tree. It does not claim live Claude or Codex certification, measured TypeScript performance, or dual-host efficacy. Those remain explicit implementation evidence in `spec/handoff/open-register.md` and `spec/readiness-summary.md`.
