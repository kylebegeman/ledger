# Ledger Change Records

This directory is Ledger's own change memory.

The source documents are hand-authored Markdown files. Generated indexes and
reports are derived from those files.

## Directories

- `entries/`: landed implementation records.
- `backlog/`: proposed or accepted future work.
- `decisions/`: durable product and architecture decisions.
- `releases/`: release notes and release groupings.
- `templates/`: source templates used by CLI commands.
- `policies/`: validation and coverage policy configuration.
- `indexes/`: generated JSON indexes.
- `reports/`: generated validation and audit reports.
- `dist/`: optional static output.

## Workflow

```bash
ledger new "Short title"
ledger validate
ledger index
ledger explain path/to/file.ts
```

Until the CLI is installed, use:

```bash
node dist/cli.js validate
node dist/cli.js index
```
