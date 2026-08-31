# Detestify

Detestify keeps target repositories' test portfolios as small as their evidence safely permits. While an agent codes, it decides whether the change needs a new test, an update to existing evidence, no persistent test, or more information. For existing suites, it identifies exact removal paths only after retained tests prove they preserve the same repository-owned behavior.

The alpha supports JavaScript and TypeScript repositories on macOS and Linux with Node.js 22.13 or newer. Claude Code and Codex plugins use the same policy engine.

## Install

The npm package is not published yet. Install the exact alpha from this trusted
checkout, then run it against your repository:

```sh
npm ci --ignore-scripts
npm run build
npm install --global .
detestify plan --repo /path/to/repository --diff
```

The first run is read-only. It reads Git state, inert package metadata, and TypeScript structure. It does not run repository commands, install dependencies, edit files, create hooks, or use the network.

The six alpha commands are:

```text
detestify plan --diff
detestify verify-change
detestify inventory
detestify audit
detestify cleanup-plan
detestify doctor
```

`verify-change` runs repository tests only when an explicitly passed JSON configuration grants repository command execution, executable config loading, and network access together. Discovered repository configuration cannot grant that trust.

## Historical cleanup proof

`cleanup-plan` can replay repository-owned, source-only historical faults in temporary copies. The manifest must bind each fix commit to its exact source paths and preregister an expected failure substring. Detestify then compares only the proposed removal tests with only their retained replacements:

```json
{
  "version": "1.0",
  "faults": [
    {
      "id": "EMAIL-TRIM-REGRESSION",
      "obligation_ids": ["OBL-EMAIL-NORMALIZATION"],
      "fix_commit": "0123456789abcdef0123456789abcdef01234567",
      "source_paths": ["src/email.ts"],
      "expected_failure_substring": "email normalization fault"
    }
  ]
}
```

```sh
detestify cleanup-plan \
  --config .detestify/config.json \
  --historical-faults .detestify/historical-faults.json \
  --candidate <candidate-id> \
  --exclude-test <candidate-test-path>
```

The command never changes the source repository. A deletion candidate still requires a structural signal, direct imports of every declared source path from both test groups, one matching preregistered failure observable in the candidate-only and retained-only runs, passing protection checks, and human review. An unrelated fault or a different failure observable cannot promote deletion. Detestify has no cleanup apply command.

## Host plugins

Builds and npm packages include self-contained plugins. Review every hook before trusting it; hooks run with your user permissions and are not a sandbox.

Claude Code:

```sh
claude plugin marketplace add pboiii/detestify --scope user
claude plugin install detestify@detestify --scope user
```

Codex:

```sh
codex plugin marketplace add pboiii/detestify
codex plugin add detestify@detestify
```

Open `/hooks` in a fresh host session and review the exact installed definitions. See `plugins/claude/README.md` and `plugins/openai/README.md` for trust and uninstall details.

## Development

```sh
npm ci --ignore-scripts
npm run build
npm run test:pr
node dist/bin/detestify.js doctor --json=-
```

`spec/` is the canonical policy and host contract. `planning/` and `archive/` preserve the implementation history.

Tagged GitHub releases contain the verified package tarball and CycloneDX SBOM.
npm publication is a separate manual workflow that publishes that exact release
tarball only after npm authentication is configured.

Licensed under Apache-2.0.
