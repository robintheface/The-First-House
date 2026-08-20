# Handoff — DO NOT copy this to repo root, read before doing anything

_Written by Claude Code, 2026-08-20. Read this if you're picking this up in a new session._

## ⚠️ Correction (important, read first)

An earlier version of this file said `robintheface/The-First-House` was a
fresh **empty** repo the user created to dump this mockup into, and told
the next session to copy `mockup-preview/`'s content to its **root**.

**That was wrong and would have overwritten the production site.**
Pushing this branch just now, git reported:

> This repository moved. Please use the new location:
> https://github.com/robintheface/The-First-House.git

`robintheface/The-First-House` is **not a new repo** — it's
`robintheface/robintheface` (the real, live production site — real
wallet-connect, real Uniswap buy link, tests, CSP, everything) **renamed**.
The user asked to create a separate empty repo for the mockup (originally
named `Brand-New-Home`), then said "I renamed it to The First House for
the first repo" — but the git evidence shows the *original* repo got
renamed, not the new empty one. Whether `Brand-New-Home` still exists
separately (still empty, still under its own name) is unconfirmed.

**Do not copy anything to the root of `robintheface/The-First-House`.**

**Confirmed with the user (2026-08-20):** the correct, still-empty target
is **https://github.com/robintheface/Brand-New-Home** — a genuinely
separate, brand new repo with nothing in it. `The-First-House` above is
the renamed production repo and is not involved in this move at all.

## What to do
1. Attach `robintheface/Brand-New-Home` with push access.
2. Clone it (it's empty — no need to worry about existing content).
3. Copy everything under this folder (`mockup-preview/`) to the **root**
   of that repo — **strip the `/mockup-preview` prefix** from every
   `href="/mockup-preview/..."`, `src="/mockup-preview/..."`, and the two
   JS references (`js/faces-data.js`'s `img:` path, `js/wallet-rank.js`'s
   `tierImg:` path). Root-absolute paths (`/css/styles.css`,
   `/images/face-01.webp`, etc.), same as the original standalone build
   in `/home/claude/repo/site` if that's still around, or just this
   folder with the prefix stripped.
4. Commit, push to `main`. Delete this `HANDOFF.md` from the new repo
   once done (it's only useful as an in-flight note).

## What this file is (unchanged)
9 screens from the Claude Design handoff `Robin The Face UI.dc.html`,
built as a static HTML/CSS/JS site — see this folder's own `index.html`,
`faces/`, `explore/*`. Wallet & Rank and Lucky Draw are mocked
client-side only, not wired to the real `js/wallet-connect.js` / ethers.js
integration. Buy/Telegram/X links are still `#` placeholders.

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
