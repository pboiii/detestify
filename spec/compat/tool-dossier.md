# Alpha tool and reuse dossier

**Status:** DECIDED for alpha recommendations; volatile capabilities must be pinned and rechecked during implementation.  
**Access date for every external source in this file:** 2026-08-28

## Label convention

- `VERIFIED` means the external capability or license fact was checked against the primary source listed in the same row.
- `CHANGED` means current primary documentation contradicts a governing-plan premise.
- `UNVERIFIED` means the source did not establish the claim.
- `DECIDED`, `OPEN`, and `DEFERRED` apply only to Test Steward architecture.

## Selection criteria

Alpha tools are assessed for:

- zero-config read-only inventory;
- stable machine-readable output;
- changed-file or affected-test selection;
- optional per-test and mutation evidence;
- AST and module-graph fidelity;
- subprocess isolation and version pinning;
- permissive licensing compatible with Apache-2.0 distribution.

No third-party tool is part of the semantic trust base. Its output is evidence with explicit limitations.

## StrykerJS

**DECIDED recommendation:** optional subprocess evidence adapter after the deterministic vertical slice. Do not invoke during a zero-config first run.

| Field | Label | Finding | Primary source |
|---|---|---|---|
| Per-test evidence | VERIFIED | `coverageAnalysis: "perTest"` associates tests with mutants for supported runner plugins so Stryker can select covering tests. | https://stryker-mutator.io/docs/stryker-js/configuration/ |
| Incremental evidence | VERIFIED | Incremental mode can reuse a prior report and rerun affected mutants; applicability depends on available test details and changed-file assumptions. | https://stryker-mutator.io/docs/stryker-js/incremental/ |
| Targeted mutation | VERIFIED | `mutate` accepts file globs and exact line or line/column ranges. | https://stryker-mutator.io/docs/stryker-js/configuration/ |
| Report formats | VERIFIED | The documented reporter set includes JSON and event-recorder output suitable for subprocess evidence capture. | https://stryker-mutator.io/docs/stryker-js/configuration/ |
| Important limitations | VERIFIED | Command-runner mode does not support coverage analysis; static mutants can require all tests; mutation invokes repository tests and is materially more expensive than static planning. | https://stryker-mutator.io/docs/stryker-js/configuration/ |
| License | VERIFIED | Apache-2.0. | https://raw.githubusercontent.com/stryker-mutator/stryker-js/master/LICENSE |

**DECIDED integration mode:** subprocess only. Pin the supported version range, parse the documented JSON mutation report, and require explicit trust before executing repository configuration or tests. Never import Stryker internals into the policy core.

## Vitest

**DECIDED recommendation:** first-class runner inventory and selected-execution adapter; start with CLI contracts rather than the advanced Node API.

| Field | Label | Finding | Primary source |
|---|---|---|---|
| Discovery | VERIFIED | `vitest list` lists matching tests; `--filesOnly` limits output to test files; JSON output is documented for list mode. | https://vitest.dev/guide/cli |
| Affected selection | VERIFIED | `vitest related <source files>` follows static imports; `--changed [revision]` selects tests related to Git changes. This is affected execution evidence, not proof of test ownership. | https://vitest.dev/guide/cli |
| Coverage | VERIFIED | Vitest documents V8, Istanbul, and custom coverage providers with configurable reporters and output. | https://vitest.dev/guide/coverage.html |
| Programmatic API | VERIFIED | `vitest/node` and advanced APIs exist; documented advanced APIs include stability cautions that make direct integration more version-coupled than the CLI. | https://vitest.dev/api/advanced/vitest |
| License | VERIFIED | MIT. | https://raw.githubusercontent.com/vitest-dev/vitest/main/LICENSE |

**DECIDED integration mode:** CLI subprocess for alpha. A pinned library adapter is deferred unless the CLI cannot expose required evidence.

## Jest

**DECIDED recommendation:** first-class runner inventory and selected-execution adapter using documented CLI output.

| Field | Label | Finding | Primary source |
|---|---|---|---|
| Discovery | VERIFIED | `--listTests` lists selected test files; `--json` and `--outputFile` provide machine-readable results. | https://jestjs.io/docs/cli |
| Affected selection | VERIFIED | `--findRelatedTests`, `--onlyChanged`, and `--changedSince` use Jest's dependency graph to select affected tests. Dynamic or opaque runtime loading can limit completeness. | https://jestjs.io/docs/cli |
| Coverage | VERIFIED | `--coverage` and configuration support Babel or V8 providers and configurable reporters/output. | https://jestjs.io/docs/configuration |
| Programmatic surface | VERIFIED | Jest publishes reusable platform packages, but the documented CLI is the narrower alpha compatibility contract. | https://jestjs.io/docs/jest-platform |
| License | VERIFIED | MIT. | https://raw.githubusercontent.com/jestjs/jest/main/LICENSE |

**DECIDED integration mode:** CLI subprocess. Pin the supported version range and parse JSON/output-file artifacts rather than undocumented internals.

## TypeScript AST stack

### DECIDED: `ts-morph`, pinned to an exact compatible version

| Candidate | External facts | Architecture decision | Reason | Primary sources |
|---|---|---|---|---|
| `ts-morph` | VERIFIED: wraps the TypeScript compiler API; exposes project, source-file, symbol, and type APIs; MIT license. | **Selected** | Preserves TypeScript semantic access while reducing low-level program, traversal, and node-management boilerplate. Pin it because wrapper/compiler compatibility can move. | https://ts-morph.com/setup/; https://raw.githubusercontent.com/dsherret/ts-morph/latest/LICENSE |
| TypeScript compiler API | VERIFIED: compiler API is documented directly; Apache-2.0 license. | Rejected for alpha | Highest direct control, but substantially more program lifecycle, traversal, source-map, and incremental-update boilerplate. Reconsider if `ts-morph` obscures required facts or exceeds ADR-002 thresholds. | https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API; https://raw.githubusercontent.com/microsoft/TypeScript/main/LICENSE.txt |
| Babel parser/traverse | VERIFIED: syntax parsing and traversal APIs are documented; MIT license. | Rejected for alpha | Strong transformation ecosystem, but not the default for type-resolved public-contract, symbol, and module-graph reasoning. | https://babeljs.io/docs/babel-parser; https://babeljs.io/docs/babel-traverse; https://raw.githubusercontent.com/babel/babel/main/LICENSE |

### AST contract boundary

The core may use AST facts for deterministic classification, but every report must expose:

- parser/compiler version;
- files skipped and diagnostics;
- whether a fact is syntactic or type-resolved;
- project-reference and monorepo limitations;
- confidence degradation when the program cannot be built.

## Agent Skills and prose reuse

### Agent Skills open format

**DECIDED use:** packaging contract only.

| External claim | Label | Current fact | Primary source |
|---|---|---|---|
| Skill directory shape | VERIFIED | A skill is a directory containing required `SKILL.md` and may contain scripts, references, and assets. | https://agentskills.io/specification |
| Required frontmatter | VERIFIED | The open specification requires at least `name` and `description`. | https://agentskills.io/specification |
| Progressive disclosure | VERIFIED | The format supports concise metadata and on-demand loading of the full skill and linked resources. | https://agentskills.io/specification |
| Claude line guidance | VERIFIED | Claude Code's current guidance recommends keeping `SKILL.md` under 500 lines. | https://code.claude.com/docs/en/skills |
| OpenAI skill compatibility | VERIFIED | OpenAI documents skills as reusable instruction bundles with `SKILL.md` and supporting resources. | https://learn.chatgpt.com/docs/skills |

### Existing testing skills

**DECIDED:** no third-party testing-skill prose, scripts, schemas, or code is copied into the alpha specification. The doctrine is independently authored from the governing plan and owner ruling. Existing public skills remain ecosystem context unless implementation later selects a concrete source after verifying its exact repository license and commit.

Consequences:

- Generic lifecycle words such as `KEEP`, `ADD`, or `DELETE` create no third-party code dependency.
- Copying a helper or substantial wording later requires the exact source commit, source path, SPDX license, attribution, and notices before merge.
- Concept-only inspiration is recorded in design history rather than vendored.

## Adapter order

1. Git and package/test-runner discovery without executing repository code.
2. TypeScript AST inventory with `ts-morph`.
3. Vitest and Jest CLI discovery behind explicit trust when repository configuration may execute.
4. Focused selected-test execution.
5. StrykerJS mutation as optional evidence.

## License summary

| Component | Label | SPDX / status | Planned mode | Copyleft isolation | Primary source |
|---|---|---|---|---|---|
| StrykerJS | VERIFIED | Apache-2.0 | Optional subprocess | No | https://raw.githubusercontent.com/stryker-mutator/stryker-js/master/LICENSE |
| Vitest | VERIFIED | MIT | Subprocess | No | https://raw.githubusercontent.com/vitest-dev/vitest/main/LICENSE |
| Jest | VERIFIED | MIT | Subprocess | No | https://raw.githubusercontent.com/jestjs/jest/main/LICENSE |
| ts-morph | VERIFIED | MIT | Library | No | https://raw.githubusercontent.com/dsherret/ts-morph/latest/LICENSE |
| TypeScript | VERIFIED | Apache-2.0 | Library/transitive | No | https://raw.githubusercontent.com/microsoft/TypeScript/main/LICENSE.txt |
| Babel, if later used | VERIFIED | MIT | Optional library | No | https://raw.githubusercontent.com/babel/babel/main/LICENSE |
| Agent Skills specification | VERIFIED capability; no copied prose | Format/reference only | Packaging contract | Not applicable | https://agentskills.io/specification |
