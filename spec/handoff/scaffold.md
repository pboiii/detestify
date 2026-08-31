# TypeScript CLI scaffold

**Status:** DECIDED shape; exact package versions remain implementation evidence

## 1. Proposed repository layout

```text
package.json
package-lock.json
LICENSE
NOTICE
README.md
tsconfig.json
tsconfig.build.json
eslint.config.js
src/
  cli/
    main.ts
    commands/
      plan.ts
      verify-change.ts
      inventory.ts
      audit.ts
      cleanup-plan.ts
      doctor.ts
    exit-codes.ts
    output.ts
  core/
    model/
    policy/
    materiality/
    reports/
    schemas/
  repository/
    git.ts
    paths.ts
    discovery.ts
    fingerprint.ts
  analysis/
    typescript.ts
    change-classifier.ts
    boundaries.ts
    tests.ts
  evidence/
    receipts.ts
    capabilities.ts
    runners/
      vitest.ts
      jest.ts
    coverage/
    mutation/
  cleanup/
    detectors/
    protection.ts
    planner.ts
  hooks/
    normalized.ts
    loop-state.ts
    claude/
    codex/
  security/
    redaction.ts
    limits.ts
    process.ts
  generated/
    schemas/
plugins/
  claude/
  openai/
skills/
  detestify/
test/
  unit/
  integration/
  policy-goldens/
  fixtures/
  hook-contracts/
  security/
scripts/
  validate-spec.ts
  materialize-fixtures.ts
  run-canary.ts
```

Keep modules internally importable but publish one CLI package and the two thin plugin packages for alpha. Do not create a micro-package/crate per directory.

## 2. `package.json` shape

Required intent:

- ESM package (`"type": "module"`).
- Node engine selected and pinned during M0 after compatibility verification.
- `bin.detestify` points to the compiled CLI launcher.
- `exports` exposes only stable programmatic contracts needed by plugin wrappers.
- Files include compiled CLI/core, schemas, license/notice, skill, and plugin assets.
- Scripts match `IMPLEMENTATION_BRIEF.md` exactly.
- Package lock committed.
- No `postinstall` command and no implicit hook installation.

## 3. TypeScript configuration

- strict mode;
- no implicit `any`;
- exact optional property types;
- no unchecked indexed access;
- ESM/Node-compatible module target selected for the pinned Node baseline;
- separate build config for declarations/source maps;
- fixture and oracle trees excluded from production build;
- generated schema types never replace runtime validation.

## 4. Dependency shortlist

| Package | Role | License | Decision |
|---|---|---|---|
| `commander` | CLI parsing/help | MIT | DECIDED; thin and widely supported |
| `ajv` | Draft 2020-12 runtime schema validation | MIT | DECIDED |
| `yaml` | Parse inert YAML config/manifests | ISC | DECIDED; safe schema and size limits required |
| `ts-morph` | TypeScript AST/project abstraction | MIT | DECIDED by tool dossier |
| `typescript` | Compiler API and type resolution | Apache-2.0 | DECIDED |
| Node `child_process`, `fs`, `path`, `crypto` | Process/filesystem/Git primitives | Node license | DECIDED; avoid shell wrapper dependency |
| `vitest` | Tool's own unit/integration/fixture tests | MIT | DECIDED |
| `tsx` | Development-only execution of scripts | MIT | DECIDED for development only; production uses compiled JS |
| `eslint` | Static checks | MIT | DECIDED |
| `prettier` | Deterministic formatting | MIT | DECIDED |
| `@types/node` | Node types | MIT | DECIDED |

Before installation, pin exact versions and verify each LICENSE file and transitive inventory. Do not add a Git library until native Git subprocess behavior proves insufficient. Do not add a shell-command convenience package that defaults to shell interpolation.

## 5. Test runner for Detestify

Use Vitest for the implementation repository because the first ecosystem and fixtures are JS/TS, its programmatic/CLI features are already in scope, and it supports fast unit/integration tests. Hidden benchmark oracles remain independent harness inputs and may run through a dedicated Vitest configuration.

## 6. Build outputs

```text
dist/bin/detestify.js
dist/src/... compiled modules
dist/schemas/*.json
plugins/claude/...
plugins/openai/...
skills/detestify/...
```

The package must not write hooks during install. Plugin install/trust is an explicit user action.
