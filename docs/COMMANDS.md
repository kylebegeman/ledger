# Command Reference

<!-- Generated from Ledger's operation registry by src/operations/reference.ts.
     Regenerate with LEDGER_UPDATE_COMMANDS=1 npx vitest run test/commandReference.test.ts -->

Every command below comes from Ledger's operation registry, the same source
as `ledger help`, the MCP tools, and the JSON API. Commands with JSON output
print the versioned machine envelope when given `--json`. When
`ledger serve --api` is running for the project, commands run inside that
engine; `--local` or `LEDGER_NO_DAEMON=1` runs them in the calling process.

## Contents

- [ledger init](#ledger-init)
- [ledger adopt](#ledger-adopt)
- [ledger new](#ledger-new)
- [ledger feedback](#ledger-feedback)
- [ledger backlog new](#ledger-backlog-new)
- [ledger decision new](#ledger-decision-new)
- [ledger promote](#ledger-promote)
- [ledger update](#ledger-update)
- [ledger session start](#ledger-session-start)
- [ledger session touch](#ledger-session-touch)
- [ledger session note](#ledger-session-note)
- [ledger session close](#ledger-session-close)
- [ledger session prune](#ledger-session-prune)
- [ledger validate](#ledger-validate)
- [ledger ready](#ledger-ready)
- [ledger verify](#ledger-verify)
- [ledger index](#ledger-index)
- [ledger verify-integrity](#ledger-verify-integrity)
- [ledger render](#ledger-render)
- [ledger serve](#ledger-serve)
- [ledger coverage](#ledger-coverage)
- [ledger ci](#ledger-ci)
- [ledger context](#ledger-context)
- [ledger doctor](#ledger-doctor)
- [ledger metrics](#ledger-metrics)
- [ledger stale](#ledger-stale)
- [ledger cache status](#ledger-cache-status)
- [ledger cache warm](#ledger-cache-warm)
- [ledger cache clear](#ledger-cache-clear)
- [ledger conflict](#ledger-conflict)
- [ledger explain](#ledger-explain)
- [ledger search](#ledger-search)
- [ledger search-packet](#ledger-search-packet)
- [ledger query](#ledger-query)
- [ledger packet](#ledger-packet)
- [ledger mcp](#ledger-mcp)
- [ledger unreleased](#ledger-unreleased)
- [ledger release](#ledger-release)
- [ledger release notes](#ledger-release-notes)
- [ledger migrate changelog](#ledger-migrate-changelog)
- [ledger agents](#ledger-agents)
- [ledger skills install](#ledger-skills-install)
- [ledger hooks install](#ledger-hooks-install)
- [ledger docs audit](#ledger-docs-audit)
- [ledger docs check](#ledger-docs-check)
- [ledger docs classify](#ledger-docs-classify)
- [ledger docs impact](#ledger-docs-impact)
- [ledger docs reconcile](#ledger-docs-reconcile)
- [ledger docs migrate](#ledger-docs-migrate)
- [Commands for host hooks](#commands-for-host-hooks)

## ledger init

Create .ledger/ and optional docs scaffolding in the current directory.

```text
Ledger init

Usage:
  ledger init [--with-docs] [--migrate] [--managed-docs] [--json]

Creates .ledger/ in the current directory and adds a marked Ledger block to
.gitignore for derived state. With --with-docs or --migrate, also creates docs
routing files in partial adoption mode unless --managed-docs is set.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--with-docs` | switch | Also create the docs/ plane and routing files. |
| `--migrate` | switch | Alias of --with-docs for migration scaffolds. |
| `--managed-docs` | switch | Use managed docs adoption instead of partial. |

- Prints JSON with `--json`.
- Can write files.

## ledger adopt

Initialize Ledger for an established repository with partial docs adoption.

```text
Ledger adopt

Usage:
  ledger adopt [--managed-docs] [--json]

Initializes Ledger for an established repo. It inspects the tracked tree to
infer coverage roots, generated-code ignores, and a verification allowlist, sets
git.coverage to any, and adds a marked Ledger block to .gitignore. An existing
docs tree is left alone apart from docs/llm routing files. By default this uses
partial docs adoption, updating routing docs and impact reports without owning
all docs. Existing docs/llm routing files are never replaced: when one exists
that Ledger did not generate, docs.routing points at derived files under
.ledger/ instead.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--managed-docs` | switch | Use managed docs adoption instead of partial. |

- Prints JSON with `--json`.
- Can write files.

## ledger new

Create the next numbered change entry from the template.

```text
Ledger new

Usage:
  ledger new <title> [--from-diff] [--staged] [--area <area>] [--status <status>] [--file <path>] [--doc <path>] [--symbol <name>] [--related <id>] [--decision <id>] [--backlog <id>] [--docs-impact <status> --docs-impact-reason <text> [--docs-impact-doc <path>]] [--section <Heading=text>] [--sections-file <path>] [--json]

Creates the next numbered change entry. Use --from-diff to prefill files from
Git changes and --staged to read the staged diff. Ignored generated/vendor paths
are omitted, and very large diffs are grouped into coverage patterns.

--file, --doc, --symbol, --related, --decision, and --backlog add to the
frontmatter, and --docs-impact with --docs-impact-reason declares docs impact.
--section Heading=text replaces one section of the template, and
--sections-file reads every "## Heading" block of a Markdown file. With those,
one command writes a finished receipt; check it with ledger ready.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--from-diff` | switch | Prefill files from Git changes. |
| `--staged` | switch | Read the staged diff. |
| `--area` | text, repeatable | Area tag (repeatable). |
| `--status` | text | Entry status. |
| `--file` | text, repeatable | Path or coverage pattern the entry covers (repeatable). |
| `--doc` | text, repeatable | Durable doc the entry references (repeatable). |
| `--symbol` | text, repeatable | Symbol to anchor (repeatable). |
| `--related` | text, repeatable | Related record id (repeatable). |
| `--decision` | text, repeatable | Decision id (repeatable). |
| `--backlog` | text, repeatable | Backlog item id (repeatable). |
| `--docs-impact` | `updated`, `not-needed`, `none` | Docs impact status. |
| `--docs-impact-reason` | text | Reviewed docs impact reason. |
| `--docs-impact-doc` | text, repeatable | Doc the change updated (repeatable). |
| `--section` | text, repeatable | A section body as Heading=text (repeatable). Write --section=Heading=text when the text starts with --. |
| `--sections-file` | text | A Markdown file whose ## sections become section bodies; --section values win. |

- Prints JSON with `--json`.
- Can write files.
- MCP tool `ledger_new`, which asks the user to confirm before it writes.

## ledger feedback

Create a product-note record for dogfood findings and product observations.

```text
Ledger feedback

Usage:
  ledger feedback <title> [--area <area>] [--tag <tag>] [--status <status>] [--section <Heading=text>] [--sections-file <path>] [--json]

Creates a product-note record for dogfood findings, product observations, or
other feedback that should not be mixed into normal change receipts. --section
Heading=text and --sections-file fill the Context, Finding, Impact,
Recommendation, and Follow-ups sections.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--area` | text, repeatable | Area tag (repeatable). |
| `--tag` | text, repeatable | Tag (repeatable). |
| `--status` | text | Note status. |
| `--section` | text, repeatable | A section body as Heading=text (repeatable). Write --section=Heading=text when the text starts with --. |
| `--sections-file` | text | A Markdown file whose ## sections become section bodies; --section values win. |

- Prints JSON with `--json`.
- Can write files.
- MCP tool `ledger_feedback`, which asks the user to confirm before it writes.
- Also runs as `ledger product-note`.

## ledger backlog new

Create the next numbered backlog item from the template.

```text
Ledger backlog new

Usage:
  ledger backlog new <title> [--area <area>] [--decision <id>] [--related <id>] [--doc <path>] [--status <status>] [--section <Heading=text>] [--sections-file <path>] [--json]

Creates the next numbered backlog item under the configured backlog directory
from .ledger/templates/backlog.md. Promote it later with ledger promote <id>.
--section Heading=text and --sections-file fill the template's sections.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--area` | text, repeatable | Area tag (repeatable). |
| `--decision` | text, repeatable | Decision id (repeatable). |
| `--related` | text, repeatable | Related record id (repeatable). |
| `--doc` | text, repeatable | Durable doc path (repeatable). |
| `--status` | text | Item status. |
| `--section` | text, repeatable | A section body as Heading=text (repeatable). Write --section=Heading=text when the text starts with --. |
| `--sections-file` | text | A Markdown file whose ## sections become section bodies; --section values win. |

- Prints JSON with `--json`.
- Can write files.
- MCP tool `ledger_backlog_new`, which asks the user to confirm before it writes.

## ledger decision new

Create the next numbered decision record from the template.

```text
Ledger decision new

Usage:
  ledger decision new <title> [--area <area>] [--decision <id>] [--related <id>] [--doc <path>] [--status <status>] [--section <Heading=text>] [--sections-file <path>] [--json]

Creates the next numbered decision record under the configured decisions
directory from .ledger/templates/decision.md. --section Heading=text and
--sections-file fill the Context, Decision, Consequences, and Revisit Criteria
sections.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--area` | text, repeatable | Area tag (repeatable). |
| `--decision` | text, repeatable | Prior decision id (repeatable). |
| `--related` | text, repeatable | Related record id (repeatable). |
| `--doc` | text, repeatable | Durable doc path (repeatable). |
| `--status` | text | Decision status. |
| `--section` | text, repeatable | A section body as Heading=text (repeatable). Write --section=Heading=text when the text starts with --. |
| `--sections-file` | text | A Markdown file whose ## sections become section bodies; --section values win. |

- Prints JSON with `--json`.
- Can write files.
- MCP tool `ledger_decision_new`, which asks the user to confirm before it writes.

## ledger promote

Create a linked draft change entry from a backlog item and update the item in one transaction.

```text
Ledger promote

Usage:
  ledger promote <id> [--title <title>] [--area <area>] [--from-diff] [--staged] [--status <status>] [--source-status <status>] [--section <Heading=text>] [--sections-file <path>] [--json]

Creates a draft change entry linked to a backlog item through the backlog
frontmatter field. The entry carries the item's areas, decisions, and acceptance
checks (as Verification bullets). The item's status becomes in-progress unless
--source-status says otherwise. Both writes happen in one transaction.
--section Heading=text and --sections-file fill the entry's sections and win
over the carried checks and notes.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--title` | text | Entry title. |
| `--area` | text, repeatable | Area tag (repeatable). |
| `--from-diff` | switch | Prefill files from Git changes. |
| `--staged` | switch | Read the staged diff. |
| `--status` | text | Entry status. |
| `--source-status` | text | Status written to the promoted item. |
| `--section` | text, repeatable | A section body as Heading=text (repeatable). Write --section=Heading=text when the text starts with --. |
| `--sections-file` | text | A Markdown file whose ## sections become section bodies; --section values win. |

- Prints JSON with `--json`.
- Can write files.
- MCP tool `ledger_promote`, which asks the user to confirm before it writes.

## ledger update

Change a record's title, status, list fields, docs impact, or section bodies in place.

```text
Ledger update

Usage:
  ledger update <id> [--title <title>] [--status <status>] [--area <area>] [--file <path>] [--symbol <name>] [--doc <path>] [--related <id>] [--decision <id>] [--backlog <id>] [--tag <tag>] [--docs-impact <status> --docs-impact-reason <text> [--docs-impact-doc <path>]] [--section <Heading=text>] [--sections-file <path>] [--json]

Changes a record in place and sets updated to today. A list flag replaces
that whole list, so pass every value the record should keep. --title also
rewrites the "# id: title" heading; the file keeps its path. --section
Heading=text and --sections-file replace sections, and a heading from the
kind's template that the record lacks is appended. Docs impact and symbols
apply to change entries only. Finish a hook-drafted receipt this way, then run
ledger ready.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--title` | text | New title. |
| `--status` | text | New status. |
| `--area` | text, repeatable | Area tag (repeatable; replaces the list). |
| `--file` | text, repeatable | File or pattern (repeatable; replaces the list). |
| `--symbol` | text, repeatable | Symbol (repeatable; replaces the list). |
| `--doc` | text, repeatable | Durable doc (repeatable; replaces the list). |
| `--related` | text, repeatable | Related record id (repeatable; replaces the list). |
| `--decision` | text, repeatable | Decision id (repeatable; replaces the list). |
| `--backlog` | text, repeatable | Backlog item id (repeatable; replaces the list). |
| `--tag` | text, repeatable | Tag (repeatable; replaces the list). |
| `--docs-impact` | `updated`, `not-needed`, `none` | Docs impact status. |
| `--docs-impact-reason` | text | Reviewed docs impact reason. |
| `--docs-impact-doc` | text, repeatable | Doc the change updated (repeatable). |
| `--section` | text, repeatable | A section body as Heading=text (repeatable). Write --section=Heading=text when the text starts with --. |
| `--sections-file` | text | A Markdown file whose ## sections become section bodies; --section values win. |

- Prints JSON with `--json`.
- Can write files.
- MCP tool `ledger_update`, which asks the user to confirm before it writes.

## ledger session start

Start an expiring session record, or return the active one for the same host session.

```text
Ledger session start

Usage:
  ledger session start [title] [--host <host>] [--host-session <id>] [--id <id>] [--area <area>] [--expires-in <days>] [--json]

Starts a session record under the configured sessions directory. The record
expires after sessions.expiresInDays (default 7) unless it is promoted with
ledger promote <id>. When --host-session names a host session that already has
an active record, that record is returned instead of creating another. An
active record past its expires date is treated as inactive: a new record is
started and inherits the related receipts of the most recent expired record
for that host session. ledger scratch <title> is an alias
for scratch notes without a host.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--host` | text | Agent host, for example claude-code. |
| `--id` | text | Session record id. |
| `--host-session` | text | Host session identifier. |
| `--area` | text, repeatable | Area tag (repeatable). |
| `--expires-in` | number | Days until the record expires. |

- Prints JSON with `--json`.
- Can write files.
- MCP tool `ledger_session_start`, which asks the user to confirm before it writes.
- Also runs as `ledger scratch`.

## ledger session touch

Record touched paths on the active session record, starting one when none exists.

```text
Ledger session touch

Usage:
  ledger session touch <path...> [--host <host>] [--host-session <id>] [--id <id>] [--json]

Appends paths to the files list of the active session and refreshes its
inferred areas. Starts a session first when no active record matches, so a
hook installed mid-session still captures paths. An active session past its
expires date is not selected without --id.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--host` | text | Agent host used when a session must be started. |
| `--id` | text | Session record id. |
| `--host-session` | text | Host session identifier. |

- Prints JSON with `--json`.
- Can write files.

## ledger session note

Append a bullet to the Learned, Next, or Summary section of the active session.

```text
Ledger session note

Usage:
  ledger session note <text> [--section <Summary|Learned|Next>] [--host-session <id>] [--id <id>] [--json]

Appends one bullet to a section of the active session record, replacing the
template placeholder on first use. Use Learned for durable facts, Next for
follow-ups the next session should pick up, and Summary for the intent of the
work; the first Summary line becomes the title of the receipt the hooks
draft. An active session past its expires date is not selected without --id.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--section` | `Summary`, `Learned`, `Next` | Section to append to. |
| `--id` | text | Session record id. |
| `--host-session` | text | Host session identifier. |

- Prints JSON with `--json`.
- Can write files.
- MCP tool `ledger_session_note`, which asks the user to confirm before it writes.

## ledger session close

Mark the active session record closed.

```text
Ledger session close

Usage:
  ledger session close [--host-session <id>] [--id <id>] [--json]

Sets the session status to closed. Closed sessions keep their expiry and can
still be promoted with ledger promote <id>. An active session past its expires
date is treated as inactive and is not selected without --id; pass --id to
close it explicitly.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--id` | text | Session record id. |
| `--host-session` | text | Host session identifier. |

- Prints JSON with `--json`.
- Can write files.
- MCP tool `ledger_session_close`, which asks the user to confirm before it writes.

## ledger session prune

List expired session records and delete them with --write.

```text
Ledger session prune

Usage:
  ledger session prune [--write] [--json]

Lists session records whose expires date has passed. --write deletes them in
one transaction. Promoted sessions and sessions another record links through
related are never deleted; an expired active session that is kept is closed
instead. Session records are committed with the other records.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--write` | switch | Delete unlinked expired sessions and close kept active ones. |

- Prints JSON with `--json`.
- Can write files.

## ledger validate

Validate Ledger source records and return errors and warnings.

```text
Ledger validate

Usage:
  ledger validate [--current-only] [--update-baseline] [--no-baseline] [--json]

Validates Ledger source records and writes .ledger/reports/latest-validation.md.
--current-only skips historical records. --update-baseline records current
warnings in the configured validation baseline.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--current-only` | switch | Skip historical records. |
| `--update-baseline` | switch | Record current warnings in the validation baseline. |
| `--no-baseline` | switch | Ignore the configured validation baseline. |

- Prints JSON with `--json`.
- Can write files.
- MCP tool `ledger_validate`.

## ledger ready

Check that draft records have no TODOs or template placeholders and carry verification, invariants, docs impact, and valid references.

```text
Ledger ready

Usage:
  ledger ready [id-or-path...] [--kind <kind>] [--status <status>] [--json]

Distinguishes a structurally valid draft from a record that is ready to land.
By default it checks change entries with status draft; pass ids or paths to
check specific records, or --kind and --status to widen the selection. A record
is ready when validation is clean for it, no line carries a TODO marker or a
template placeholder, every required section has a body, change entries list
Verification and Invariants bullets, and docs impact is reviewed. Exits 1 when
any checked record is not ready.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--kind` | `change`, `backlog`, `decision`, `release`, `product-note`, `feedback`, `session` | Kind filter for the default selection. |
| `--status` | text | Status filter for the default selection. |

- Prints JSON with `--json`.
- Reads only.
- MCP tool `ledger_ready`.

## ledger verify

List the verification commands of change entries and, with --run, execute the allowlisted ones and record evidence.

```text
Ledger verify

Usage:
  ledger verify [id-or-path...] [--all] [--run] [--timeout <ms>] [--json]

Reads the Verification section of change entries. Each bullet that starts
with a backticked command is parsed; an optional KEY=value prefix sets the
environment. Commands must match verification.allow (npm run, npm test, npx
vitest, ledger checks, and similar by default). When agents.command is set, a
command written with it matches the same ledger pattern, and a bare ledger
command runs through it. Prose, shell operators, and unlisted commands are
skipped, never failed. --run executes the allowed
commands from the project root, records command, exit status, duration, and
the HEAD commit in the evidence sidecar (verification.evidence), and exits 1
when a command fails. Without ids, --all, or changed entries, nothing is
selected. doctor, stale, packets, and the reader surface the evidence.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--all` | switch | Select every change entry. |
| `--run` | switch | Execute allowlisted commands and record evidence. |
| `--timeout` | number | Per-command timeout in milliseconds. |

- Prints JSON with `--json`.
- Can write files.

## ledger index

Validate records and write JSON indexes under .ledger/indexes.

```text
Ledger index

Usage:
  ledger index [--json]

Validates records and writes JSON indexes under .ledger/indexes.
```

- Prints JSON with `--json`.
- Can write files.

## ledger verify-integrity

Return source record hashes and a deterministic catalog hash.

```text
Ledger verify-integrity

Usage:
  ledger verify-integrity [--check] [--json]

Writes source record hashes to .ledger/indexes/integrity.json and a readable
report to .ledger/reports/integrity.md. --check compares current records with
the existing baseline without replacing it.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--check` | switch | Compare with the existing baseline without replacing it. |

- Prints JSON with `--json`.
- Can write files.
- MCP tool `ledger_verify_integrity`.

## ledger render

Build the offline static reader plus search and graph JSON artifacts.

```text
Ledger render

Usage:
  ledger render [--profile <internal|public>] [--site-url <url>] [--json]

Builds the offline static reader at .ledger/dist/index.html plus lazy search
and relationship graph JSON artifacts. The public profile writes to
.ledger/dist/public and includes only explicit public notes from released
releases, with an Atom feed at feed.xml and a permalink for each release.

--site-url names where the rendered page will be served, such as
https://example.github.io/project/. It makes the canonical link, the Open
Graph URL, and the feed's links absolute. Without it the feed still carries
every release's notes.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--profile` | `internal`, `public` | Reader profile to render. |
| `--site-url` | text | Absolute URL the reader is served from. |

- Prints JSON with `--json`.
- Can write files.

## ledger serve

Render and serve the static reader on loopback, optionally with the engine API.

```text
Ledger serve

Usage:
  ledger serve [--host <host>] [--port <port>] [--profile <internal|public>] [--watch] [--expose] [--api]

Renders and serves the selected static reader profile. --api also serves the
JSON API at /api/v1, the event stream at /events, and MCP over Streamable HTTP
at /mcp, writes .ledger/daemon.json so CLI commands delegate to the warm
server, and always watches source records. --watch rebuilds when Ledger source
records change. The public profile serves .ledger/dist/public. Non-loopback
binding requires --expose and an access token of at least 24 characters from
LEDGER_SERVE_TOKEN.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--api` | switch | Serve the engine API, events, and MCP alongside the reader. |
| `--host` | text | Bind host. |
| `--port` | number | Bind port. |
| `--profile` | `internal`, `public` | Reader profile to serve. |
| `--watch` | switch | Rebuild when source records change. |
| `--expose` | switch | Allow non-loopback binding with a token. |

- Prints text only.
- Can write files.

## ledger coverage

Check changed files against git.requireEntryFor and Ledger file coverage.

```text
Ledger coverage

Usage:
  ledger coverage [--staged | --base <revision> --head <revision>] [--explain] [--mode <current|any>] [--json]

Checks changed files against git.requireEntryFor and Ledger file coverage.
Under the default current mode (git.coverage), a required path must be listed
by a change entry that is itself part of the change set; a path listed only by
older records is reported as historical and counts as missing. --mode any
also accepts an earlier change entry that names the path; a pattern such as
src/** counts only from an entry in the change set, and session records,
backlog items, and decisions never cover a path. --explain prints why each changed path is ignored, not
required, covered, historical, or missing. --base and --head inspect their
merge-base change range. A missing path that an active hooked session touched
names the session, whose hook drafts the receipt when the turn ends.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--staged` | switch | Inspect the staged Git diff. |
| `--base` | text | Base revision for a merge-base range. |
| `--head` | text | Head revision for a merge-base range. |
| `--explain` | switch | Explain each changed path's status. |
| `--mode` | `current`, `any` | Coverage mode override. |

- Prints JSON with `--json`.
- Reads only.
- MCP tool `ledger_coverage`.

## ledger ci

Run validation, docs audit, coverage, and docs impact as one check.

```text
Ledger ci

Usage:
  ledger ci [--staged | --base <revision> --head <revision>] [--current-only] [--no-baseline] [--github] [--json]

Runs validation, docs audit, coverage, and docs impact as one CI-friendly check.
The text report lists each failing file. When an active hooked session touched
one, the report names the session and its draft receipt: hooks draft the
receipt when a turn ends, so a run earlier in the turn reports the turn's files
until that draft is finished. --base and --head inspect their merge-base change
range. --github prints one workflow command per failing signal (::error with
the file path) so GitHub annotates the pull request, and appends a Markdown
summary to the file named by GITHUB_STEP_SUMMARY when it is set. The
repository's action.yml wraps this.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--staged` | switch | Inspect the staged Git diff. |
| `--base` | text | Base revision for a merge-base range. |
| `--head` | text | Head revision for a merge-base range. |
| `--current-only` | switch | Skip historical records. |
| `--no-baseline` | switch | Ignore the configured validation baseline. |
| `--github` | switch | Print GitHub Actions annotations and append a job summary. |

- Prints JSON with `--json`.
- Can write files.
- MCP tool `ledger_ci`.

## ledger context

Summarize a change set for review: each changed file's coverage, docs impact, history, invariants, and conflict rules, plus the change's receipts, linked records, and verification.

```text
Ledger context

Usage:
  ledger context [--staged | --base <revision> --head <revision>] [--budget <tokens>] [--json]

Prints one review packet for a change set: the working tree by default,
the staged diff with --staged, or a merge-base range with --base and --head.
For each changed file it shows the Git change, coverage, docs impact, the
newest records that mention it, and their invariants and conflict rules. It
then lists the receipts the change carries with their ready state and
verification evidence, the decisions and backlog items they link, and the
verification to run. Per-file details are dropped from the end to fit --budget.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--staged` | switch | Inspect the staged Git diff. |
| `--base` | text | Base revision for a merge-base range. |
| `--head` | text | Head revision for a merge-base range. |
| `--budget` | number | Approximate token budget. |

- Prints JSON with `--json`.
- Reads only.
- MCP tool `ledger_context`.

## ledger doctor

Check workspace health, Git availability, validation, docs, indexes, render output, hooks, and stale signals, and with fix repair derived state.

```text
Ledger doctor

Usage:
  ledger doctor [--no-baseline] [--fix] [--json]

Checks workspace health, Git availability, validation, docs references, index
freshness, render output, performance budgets, installed hooks, and
stale-knowledge signals. The hooks check warns when a host hook file runs a
different command than agents.command, or when that command cannot print this
Ledger's version, because hosts skip failing hooks without a message.

--fix first repairs derived and runtime state: it recovers interrupted writes
and stale locks, removes a stale engine record, rebuilds a stale catalog
cache, regenerates missing or stale indexes, and renders a missing reader. It
never edits records, so it is safe to rerun, and then it runs the checks
again.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--no-baseline` | switch | Ignore the configured validation baseline. |
| `--fix` | switch | Repair derived state, then check again. |

- Prints JSON with `--json`.
- Can write files.
- MCP tool `ledger_doctor`.

## ledger metrics

Measure read, validate, index, render-model, and search latency against budgets.

```text
Ledger metrics

Usage:
  ledger metrics [--json]

Measures read, validate, index, render-model, and search latency against
configured performance budgets.
```

- Prints JSON with `--json`.
- Reads only.
- MCP tool `ledger_metrics`.

## ledger stale

Find stale knowledge signals such as missing references, stale symbols, and release verification gaps.

```text
Ledger stale

Usage:
  ledger stale [--current-only] [--no-baseline] [--check] [--write-report] [--json]

Finds stale knowledge signals: missing references, missing relationship
targets, superseded relationships, symbols and Changed Files anchors that no
longer exist in the referenced files, invariants that cite them, release
verification gaps, expired sessions, and stale or failed verification
evidence. --write-report writes .ledger/reports/stale-knowledge.md.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--current-only` | switch | Skip historical records. |
| `--no-baseline` | switch | Ignore the configured validation baseline. |
| `--check` | switch | Fail when stale signals exist. |
| `--write-report` | switch | Write the stale knowledge report. |

- Prints JSON with `--json`.
- Reads only.
- MCP tool `ledger_stale`.

## ledger cache status

Report the catalog cache backend, size, and freshness.

```text
Ledger cache status

Usage:
  ledger cache status [--json]

Reports which catalog cache backend is active, where it lives, how many records
it holds, and whether it matches the current configuration.
```

- Prints JSON with `--json`.
- Reads only.
- MCP tool `ledger_cache_status`.

## ledger cache warm

Read every source record so the catalog cache is current.

```text
Ledger cache warm

Usage:
  ledger cache warm [--json]

Reads every source record once so later commands and agents hit a current cache.
```

- Prints JSON with `--json`.
- Can write files.

## ledger cache clear

Delete the catalog cache; the next read rebuilds it from source records.

```text
Ledger cache clear

Usage:
  ledger cache clear [--json]

Deletes the catalog cache files under the configured cache directory. The
cache is a derived artifact; the next command rebuilds it from Markdown.
```

- Prints JSON with `--json`.
- Can write files.

## ledger conflict

Return conflict rules, invariants, and verification for paths.

```text
Ledger conflict

Usage:
  ledger conflict <path...> [--json] [--write-report]

Shows file-specific conflict rules, invariants, and verification commands.
--write-report writes .ledger/reports/conflict.md.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--write-report` | switch | Write .ledger/reports/conflict.md. |

- Prints JSON with `--json`.
- Reads only.
- MCP tool `ledger_conflict`.

## ledger explain

Return Ledger records that mention a file path.

```text
Ledger explain

Usage:
  ledger explain <path> [--json] [--agent]

Shows Ledger records that mention a path, plus decisions, backlog items, and
superseding records one relationship hop away. --agent prints compact context.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--agent` | switch | Print compact invariants and verification context. |

- Prints JSON with `--json`.
- Reads only.
- MCP tool `ledger_explain`.

## ledger search

Run weighted fuzzy search over the static reader search fields.

```text
Ledger search

Usage:
  ledger search <query> [--limit <entries>] [--full-text] [--json]

Runs weighted fuzzy search over every record using the same search fields and
scoring as the browser reader, so results are identical on every cache backend.
--full-text first narrows candidates to records containing the query words with
sqlite FTS5 (cache.backend sqlite, or auto on Node 24.15 and newer), which is
faster on large catalogs but can miss fuzzy-only matches such as abbreviations.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--limit` | number | Maximum matches to return. |
| `--full-text` | switch | Narrow candidates with sqlite FTS5 first. |

- Prints JSON with `--json`.
- Reads only.
- MCP tool `ledger_search`.

## ledger search-packet

Return compact agent handoff context from weighted Ledger search results.

```text
Ledger search-packet

Usage:
  ledger search-packet <query> [--json] [--write-report] [--budget <tokens>] [--limit <entries>]

Builds a compact agent handoff packet from weighted search results. Use this
when you know the topic but not the exact file path. --budget compresses and
omits lower-priority matches to keep context bounded.
--write-report writes .ledger/reports/packet.md.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--limit` | number | Maximum search matches to include. |
| `--budget` | number | Approximate token budget. |
| `--write-report` | switch | Write .ledger/reports/packet.md. |

- Prints JSON with `--json`.
- Reads only.
- MCP tool `ledger_search_packet`.

## ledger query

Filter Ledger records by metadata, relationships, paths, and text.

```text
Ledger query

Usage:
  ledger query [--kind <kind>] [--status <status>] [--area <area>] [--tag <tag>] [--release <version>] [--decision <id>] [--backlog <id>] [--symbol <name>] [--file <path>] [--doc <path>] [--id <id>] [--text <text>] [--limit <entries>] [--json]

Filters Ledger records by metadata, tags, relationship ids, symbols, and paths.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--kind` | `change`, `backlog`, `decision`, `release`, `product-note`, `feedback`, `session` | Record kind. |
| `--status` | text | Record status. |
| `--area` | text | Area tag. |
| `--tag` | text | Tag. |
| `--release` | text | Release version. |
| `--decision` | text | Related decision id. |
| `--backlog` | text | Related backlog id. |
| `--symbol` | text | Symbol name. |
| `--file` | text | File path. |
| `--doc` | text | Docs path. |
| `--id` | text | Record id. |
| `--text` | text | Metadata text match. |
| `--limit` | number | Maximum records to return. |

- Prints JSON with `--json`.
- Reads only.
- MCP tool `ledger_query`.

## ledger packet

Return compact agent handoff context for a file path.

```text
Ledger packet

Usage:
  ledger packet <path> [--json] [--write-report] [--budget <tokens>] [--limit <entries>]

Builds a compact agent handoff packet for a file path. --budget compresses and
omits lower-priority entries to keep context bounded.
--write-report writes .ledger/reports/packet.md.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--limit` | number | Maximum records to include. |
| `--budget` | number | Approximate token budget. |
| `--write-report` | switch | Write .ledger/reports/packet.md. |

- Prints JSON with `--json`.
- Reads only.
- MCP tool `ledger_packet`.

## ledger mcp

Start a stdio Model Context Protocol server exposing Ledger tools for agents.

```text
Ledger mcp

Usage:
  ledger mcp

Starts a stdio Model Context Protocol server exposing Ledger tools for agents:
validate, ready, query, search, explain, conflict, packet, search-packet,
context, coverage, ci, doctor, metrics, stale, unreleased, release notes, cache status,
docs audit, docs classify, docs impact, and integrity verification. The tools
that write records (new, feedback, backlog new, decision new, promote,
update, and session start, note, and close) take section bodies, ask the user
to confirm first, and write nothing otherwise. The server speaks MCP 2026-07-28 and the 2025 revisions; a 2025-era
client can confirm when it supports elicitation. For MCP over HTTP, run
`ledger serve --api` and connect to /mcp.
```

- Prints text only.
- Reads only.

## ledger unreleased

List landed or shipped change entries without a release assignment.

```text
Ledger unreleased

Usage:
  ledger unreleased [--json]

Lists landed or shipped change entries without a release assignment.
```

- Prints JSON with `--json`.
- Reads only.
- MCP tool `ledger_unreleased`.

## ledger release

Render a Ledger release record and optionally assign entries and write the file.

```text
Ledger release

Usage:
  ledger release <version> [--include-unreleased] [--assign] [--status <status>] [--date <yyyy-mm-dd>] [--write | --update] [--json]

Renders a valid Ledger release record. status is planned or released.
--assign writes the selected release version back to the selected entries,
with or without --write; leave it off to preview.
--write creates .ledger/releases/<version>.md and refuses an existing record.
--update adds the selected entries that an existing record does not list to its
entries and Changes, and leaves its summary, public notes, verification, and
known issues for you to edit. For a receipt that landed after the record was
written: ledger release <version> --include-unreleased --assign --update.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--include-unreleased` | switch | Select currently unreleased landed entries. |
| `--assign` | switch | Write the release version back to selected entries. |
| `--status` | `planned`, `released` | Release status. |
| `--date` | text | Release date as yyyy-mm-dd. |
| `--write` | switch | Write .ledger/releases/<version>.md. |
| `--update` | switch | Add selected entries missing from the existing release record. |

- Prints JSON with `--json`.
- Can write files.

## ledger release notes

Print the Public Notes of a release record for changelogs and GitHub Releases.

```text
Ledger release notes

Usage:
  ledger release notes <version> [--json]

Prints the Public Notes section of .ledger/releases/<version>.md as Markdown.
Use it to publish GitHub Releases or changelog entries from the release record.
```

- Prints JSON with `--json`.
- Reads only.
- MCP tool `ledger_release_notes`.

## ledger migrate changelog

Migrate legacy Markdown changelog records into .ledger/entries.

```text
Ledger migrate changelog

Usage:
  ledger migrate changelog <dir> [--dry-run] [--rewrite-docs] [--status <status>] [--json]

Migrates folders of legacy Markdown changelog records into .ledger/entries,
preserves IDs when possible, suggests duplicate ID suffixes, and writes a
migration receipt. --rewrite-docs updates docs references from old paths to new
Ledger entry paths.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--dry-run` | switch | Report without writing. |
| `--rewrite-docs` | switch | Rewrite docs references to new entry paths. |
| `--status` | text | Status to assign to migrated entries. |

- Prints JSON with `--json`.
- Can write files.

## ledger agents

Print AGENTS.md instructions for the configured Ledger workflow, or maintain them as a fenced block in a file.

```text
Ledger agents

Usage:
  ledger agents [--role <contributor|reviewer|release|migration|conflict>] [--write] [--file <path>] [--json]

Prints ready-to-paste AGENTS.md instructions for the configured Ledger workflow.
--write maintains them between <!-- ledger:agents:start --> and
<!-- ledger:agents:end --> markers in AGENTS.md (or --file <path>), replacing
the block in place, appending it when absent, and creating the file when
missing. Claude Code reads CLAUDE.md, so import AGENTS.md from it (ledger
hooks install --host claude-code --import-agents adds the import) or pass
--file CLAUDE.md. Command spans use agents.command from .ledger/config.yaml.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--role` | `contributor`, `reviewer`, `release`, `migration`, `conflict` | Agent role. |
| `--write` | switch | Maintain the fenced Ledger block in the target file. |
| `--file` | text | Project-relative file to write the block into. |

- Prints JSON with `--json`.
- Can write files.

## ledger skills install

Write the Ledger SKILL.md under .agents/skills/ledger and expose it to agent hosts.

```text
Ledger skills install

Usage:
  ledger skills install [--host <claude-code|codex|cursor|all>] [--json]

Writes .agents/skills/ledger/SKILL.md, the Agent Skills entry that tells any
skills-aware agent when to call packet, explain, search, session note, new,
promote, and ready. Codex and Cursor read .agents/skills natively; Claude Code
gets a symlink at .claude/skills/ledger, or a copy where symlinks are not
available. Re-running refreshes the skill in place.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--host` | `claude-code`, `codex`, `cursor`, `all` | Host to expose the skill to (repeatable). |

- Prints JSON with `--json`.
- Can write files.

## ledger hooks install

Install Ledger lifecycle hooks into an agent host's project hook file.

```text
Ledger hooks install

Usage:
  ledger hooks install --host <claude-code|codex|cursor> [--command <prefix>] [--launcher] [--import-agents] [--dry-run] [--json]

Writes Ledger's SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd,
and PreCompact hooks into the host's project hook file: .claude/settings.json
for Claude Code, .codex/hooks.json for Codex, or .cursor/hooks.json for Cursor
(Cursor has no prompt hook, so it gets the other five). Existing hooks that
are not Ledger's are preserved; earlier Ledger entries are replaced. Each
hook runs "<command> hook <event> --host <host>". The prefix is saved as
agents.command in .ledger/config.yaml and reused by hooks install, agents
--write, skills install, and the hook context; pass --command "npx ledger"
when Ledger is a project dependency. A dry run computes but never writes the
config. --import-agents adds the @AGENTS.md import to CLAUDE.md so Claude Code
reads the Ledger block. Nothing auto-starts the engine.

Codex asks you to approve a hook again whenever its command changes, so a new
pinned version in --command means approving all six again. With --launcher,
the Codex hooks run "node .ledger/bin/ledger.mjs hook <event> --host codex"
instead, and that generated script runs agents.command. A later install with
a new --command rewrites only the script, so the approval carries over.
Start Codex at the project root, where the hooks find the script. Later
installs keep the form .codex/hooks.json already uses; --launcher=false
returns to direct commands and removes the script.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--host` | `claude-code`, `codex`, `cursor` | Agent host to install hooks for. |
| `--command` | text | Command prefix that runs Ledger; saved as agents.command in .ledger/config.yaml. |
| `--launcher` | switch | Codex only: run the hooks through .ledger/bin/ledger.mjs, so a new version leaves .codex/hooks.json and Codex's approval unchanged; --launcher=false switches back. |
| `--import-agents` | switch | Add the @AGENTS.md import to CLAUDE.md when it is missing (claude-code only). |
| `--dry-run` | switch | Print the merged hook file without writing it. |

- Prints JSON with `--json`.
- Can write files.

## ledger docs audit

Classify the docs root and report Ledger-to-doc references.

```text
Ledger docs audit

Usage:
  ledger docs audit [--json]

Audits docs references and writes .ledger/reports/docs-audit.md.
```

- Prints JSON with `--json`.
- Can write files.
- MCP tool `ledger_docs_audit`.

## ledger docs check

Audit docs references and fail when Ledger references docs that do not exist.

```text
Ledger docs check

Usage:
  ledger docs check [--json]

Audits docs references and exits non-zero for missing Ledger-referenced docs.
```

- Prints JSON with `--json`.
- Can write files.

## ledger docs classify

Classify docs paths as durable, routing, scratch, generated, or unknown.

```text
Ledger docs classify

Usage:
  ledger docs classify [path...] [--json]

Classifies docs paths as durable, routing, scratch, generated, or unknown.
```

- Prints JSON with `--json`.
- Reads only.
- MCP tool `ledger_docs_classify`.

## ledger docs impact

Return docs impact for changed files or the current git diff.

```text
Ledger docs impact

Usage:
  ledger docs impact [--staged | --base <revision> --head <revision>] [--check] [--json]

Reports whether each changed source file has docs impact evidence: a changed
change entry that lists the file and carries a reviewed docsImpact declaration
or references docs. A docs edit elsewhere in the change set does not satisfy a
file on its own. Under git.coverage any, an earlier receipt that lists the file
and carries that evidence also satisfies it, as it satisfies coverage. --base
and --head inspect their merge-base change range.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--staged` | switch | Inspect the staged Git diff. |
| `--base` | text | Base revision for a merge-base range. |
| `--head` | text | Head revision for a merge-base range. |
| `--check` | switch | Fail when source files lack docs impact. |

- Prints JSON with `--json`.
- Can write files.
- MCP tool `ledger_docs_impact`.

## ledger docs reconcile

Regenerate the docs routing manifest and START_HERE file from the docs audit, refusing files Ledger did not generate unless forced.

```text
Ledger docs reconcile

Usage:
  ledger docs reconcile [--force] [--json]

Writes the configured docs routing manifest and START_HERE file from the current
docs audit. Refuses to replace a routing file Ledger did not generate (a manifest
without generatedBy: "ledger", a START_HERE without the Ledger marker) and exits 1
without writing either file; --force replaces them anyway.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--force` | switch | Replace routing files that Ledger did not generate. |

- Prints JSON with `--json`.
- Can write files.

## ledger docs migrate

Write cleanup and organization guidance for the docs root.

```text
Ledger docs migrate

Usage:
  ledger docs migrate [--json]

Writes .ledger/reports/docs-migration.md with docs cleanup and organization
guidance from the current docs audit.
```

- Prints JSON with `--json`.
- Can write files.

## Commands for host hooks

Host hook files that `ledger hooks install` writes run these commands. They
are left out of `ledger help` because people do not run them directly.

### ledger hook

Handle one agent host lifecycle event from JSON on stdin. Installed by ledger hooks install.

```text
Ledger hook

Usage:
  ledger hook <session-start|user-prompt-submit|post-tool-use|stop|session-end|pre-compact> [--host <host>] [--budget <tokens>]

Handles one host lifecycle event. The host's JSON payload is read from stdin
and the response object the host expects is written to stdout. session-start
injects the session context, user-prompt-submit injects a one-time notice of a
hook-drafted receipt linked to the session, post-tool-use records touched
paths, stop and session-end draft or refresh the linked receipt, and
pre-compact writes the handoff. Exits 0 with an empty object when Ledger is
not initialized or the event cannot be handled, so hosts are never blocked.
Installed by ledger hooks install.
```

| Flag | Value | Description |
| --- | --- | --- |
| `--host` | `claude-code`, `codex`, `cursor` | Agent host that sent the event. |
| `--budget` | number | Token budget for injected context. |

- Prints text only.
- Can write files.
