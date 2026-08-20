# Handoff — move mockup into its own repo

_Written by Claude Code, 2026-08-20. Read this if you're picking this up in a new session._

## Goal
Copy this `mockup-preview/` content into its own dedicated repo so it can be
iterated on without touching `robintheface/robintheface` at all.

**Target repo:** https://github.com/robintheface/The-First-House
(private, created by the user specifically for this — was briefly named
`Brand-New-Home` before being renamed)

## What to do
1. Attach `robintheface/The-First-House` with push access.
2. Clone it.
3. Copy everything under this folder (`mockup-preview/`) to the **root** of
   that repo — but **strip the `/mockup-preview` prefix** from every
   `href="/mockup-preview/..."`, `src="/mockup-preview/..."`, and the two
   JS references (`js/faces-data.js`'s `img:` path, `js/wallet-rank.js`'s
   `tierImg:` path). It's a dedicated repo now, so paths go back to plain
   root-absolute (`/css/styles.css`, `/images/face-01.webp`, etc.), same as
   the original standalone build.
4. Commit, push to `main`.

## Why this file exists
The session that built this hit a stretch where the MCP tool needed to
attach a *new* GitHub repo (`add_repo`) disconnected mid-task, while the
already-attached `robintheface/robintheface` kept working fine for git
push/fetch. This file is committed here (durable, on GitHub) rather than
left only in chat history or the ephemeral session container, so the work
isn't lost if the session ends before the reconnect happens.

## Context — what this actually is
9 screens from the Claude Design handoff `Robin The Face UI.dc.html`,
built as a static HTML/CSS/JS site (see this folder's own `index.html`,
`faces/`, `explore/*`). Wallet & Rank and Lucky Draw are mocked
client-side only — not wired to the real `js/wallet-connect.js` /
ethers.js integration that `robintheface/robintheface` already has.
Buy/Telegram/X links are still `#` placeholders.
