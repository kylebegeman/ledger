---
id: "0129"
kind: "product-note"
title: "A live Kore session never learned about its drafted receipt"
date: "2026-09-16"
updated: "2026-09-16"
status: "resolved"
areas:
  - "capture"
  - "hooks"
tags:
  - "dogfood"
---

# 0129: A Live Kore Session Never Learned About Its Drafted Receipt

## Context

B007's live acceptance check, run on 2026-09-16 in Kore on branch
`kore/ledger-adoption` with Ledger 0.7.0 hooks installed through
`npx --yes @kylebegeman/ledger@0.7.0`. Kyle opened a fresh Claude Code session
and asked for an ordinary fix, renaming Forge to Kore in `CONTRIBUTING.md`, with
no mention of Ledger. A second prompt asked the agent to report what it had
seen and to finish the drafted receipt.

## Finding

The mechanics worked. SessionStart injected Ledger context and created session
record S0001, PostToolUse recorded `CONTRIBUTING.md` and ignored the plan file
Claude Code wrote outside the repository, and the first Stop drafted receipt
0002 linked to S0001. Asked to finish it, the agent produced a good receipt
that passes `ledger ready` and `ledger ci`.

The loop around the agent did not work:

- The agent never learned a draft existed. The Stop hook's `systemMessage` is
  shown to the user, and nothing on the next turn mentions the draft. The agent
  found 0002 only because the verification command listed `.ledger/entries`.
- The instructions point the other way. The `AGENTS.md` block and the skill
  tell the agent to create a receipt with `ledger new --from-diff`, and the
  agent offered to, which would have made a second receipt beside the hook's
  draft (the collision in 0122).
- The agent ran no Ledger command during the task and skipped the `ledger
  packet` step the startup context asked for. Following that context literally
  would have run ledger-cli, which the agent later took for an old Ledger
  (0127).
- To finish the draft, the agent read Ledger 0.7.0's source to learn how hooks
  link and refresh drafts, what `ready` checks, and what
  `docsImpact: not-needed` means. The skill documents none of that lifecycle.
- Landing a linked draft while its session is open makes the next Stop or
  SessionEnd draft a second receipt, because only entries with
  `status: draft` count as linked. The agent left 0002 as a draft for that
  reason.
- The raw draft listed its own session record in `files` and took that
  record's headings as symbols (0122). Once the session expires and is pruned,
  that path becomes a missing-reference warning and a stale signal on a landed
  receipt, and `related: S0001` dangles the same way.
- The draft kept the session title, `docsImpact: none` with a TODO reason,
  three empty template bullets, and an area inferred from the file name,
  `contributing`.
- The session ran in the Claude desktop app, where `/exit` was recorded but
  the Claude Code process kept running, so SessionEnd never fired and S0001
  stayed `active`. It was closed with `ledger session close --id S0001` before
  0002 was landed, so a later Stop in that tab could not draft a second
  receipt.

## Impact

Capture writes the records, but it only closes the loop when a person or a
prompt tells the agent the draft exists. Unprompted, an agent either leaves
the draft unfinished or creates a duplicate, and landed receipts collect
references to session records that pruning removes.

## Recommendation

Tell the agent, not only the user: surface a new or refreshed linked draft as
agent-visible context once, on the next prompt or on SessionStart resume and
compact. Have the agents block and skill say to finish the hook's draft when
hooks are installed and to use `ledger new` only without them, and document
the draft lifecycle there (linked, refreshed, finished, `ready`, landed after
the session closes). Treat a landed receipt that links an open session as
linked, keep session paths out of drafted `files` and symbols, and decide what
pruning does to receipts that link a pruned session.

## Follow-ups

- Agent-visible notice of drafted receipts for Claude Code and Codex.
- Agents block and skill: finish the hook draft; document its lifecycle.
- Linked-receipt lookup that does not re-draft after landing.
- Drafts without session paths, with the change's title and areas.
- A rule for committing session records and for links to pruned sessions.
- Close sessions without relying on SessionEnd, which the desktop app did not
  fire on `/exit`.
- Resolved: 0133 announces drafts, documents their lifecycle, stops
  re-drafting after a receipt lands, keeps session paths out of drafts, and
  treats expired sessions as inactive. 0134 commits session records and keeps
  linked ones when pruning. 0162 confirmed the fix in a second live Kore
  session.
