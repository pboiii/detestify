# Deferred Python mutation appendix

**Status:** DEFERRED integration; current maintenance facts are VERIFIED where sourced.  
**Scope:** one-page forward-looking note only.

## mutmut 3.7.0

- `VERIFIED`: PyPI records release 3.7.0 on 2026-07-31 and declares Python support and BSD-3-Clause licensing.
- `VERIFIED`: current project documentation describes incremental mutation runs, relevant-test selection conventions, and a terminal interface.
- `OPEN`: no stable, versioned JSON output contract suitable for Test Steward was confirmed from the reviewed documentation. Evidence that closes this item: a pinned release with documented machine schema or a maintained exporter.
- `OPEN`: performance and correctness across large pytest monorepos, subprocess-heavy tests, and macOS/Linux process cleanup require fixture measurements.

Sources:

- https://pypi.org/project/mutmut/3.7.0/ (accessed 2026-08-28)
- https://github.com/boxed/mutmut (accessed 2026-08-28)
- https://raw.githubusercontent.com/boxed/mutmut/main/LICENSE (accessed 2026-08-28)

## Cosmic Ray 8.7.0

- `VERIFIED`: PyPI records version 8.7.0 released 2026-08-09.
- `OPEN`: the exact durable machine-output and per-test relationship contracts were not established to certification quality in this package. Evidence that closes this item: pinned CLI/database schema documentation and representative output fixtures.
- `OPEN`: suitability for incremental changed-code mutation and integration with pytest selection requires direct evaluation.

Sources:

- https://pypi.org/project/cosmic-ray/ (accessed 2026-08-28)
- https://cosmic-ray.readthedocs.io/ (accessed 2026-08-28)
- https://github.com/sixty-north/cosmic-ray (accessed 2026-08-28)

## Deferred recommendation

Do not choose a Python mutation adapter during the JS/TS alpha. A later Python ecosystem ADR should compare pinned output schemas, incremental behavior, fault operator coverage, test selection, runtime, license, and maintenance. Mutation evidence must remain optional regardless of the selected tool.
