# Quizzards

**Live Quiz Scoreboard** — a real-time, multi-team leaderboard for running a quiz night.

Open a board, put it on the big screen, and adjust scores as the night runs. Anyone with the
viewer link sees every change instantly, on any device.

![The scoreboard with five teams mid-game](docs/scoreboard.png)

## What it does

- **Live scores.** Quick `−5 / −1 / +1 / +5 / +10` buttons on every team card, plus a custom
  adjustment for anything else in range. Changes reach every connected screen over websockets.
- **Standings.** Teams are ranked as you go, with competition ranking — tied teams share a place,
  so an all-square board shows everyone at `#1`. The leader's card is highlighted.
- **A roster.** Paste a list of names, then assign each person to a team from a dropdown, or let
  **Auto-assign** spread them evenly. Team members show as chips on their team's card.
- **Undo.** Every score change, rename, reset and roster edit can be walked back — from the button
  or <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>Z</kbd>. Undo is shared, so it works from any host device.
- **Editable everywhere.** Board title, subtitle and team names are click-to-edit.
- **Viewer links.** *Copy viewer link* produces a read-only URL for the projector or the audience —
  it has no controls and can't change anything.
- **Full screen**, for the big screen at the front of the room.
- **Survives a restart.** Rooms are mirrored to disk, so a server hiccup doesn't lose the scores.

## Quick start

```bash
npm install
npm run dev
```

Then open <http://localhost:5173>, pick a room code, and hit **Host a board**.

For a production-style run (one process serving API and UI on port 4000):

```bash
npm run build
npm start
```

## How a quiz night runs

1. **Host a board** from the landing page — pick a code like `quiz-night` and a team count.
2. Open the **Roster**, paste your list of names, and hit **Auto-assign** (or set teams by hand).
3. Rename teams by clicking their names.
4. **Copy viewer link** and open it on the projector, or send it to the players.
5. Score each round with the quick buttons. Got it wrong? **Undo**.
6. **Sort by score** when you want the cards to reorder into standings.

Reopening the same room code later keeps the board exactly as you left it. The device that created
the board holds the host token (in `localStorage`); every other device gets the read-only view.

## Layout

| Package | What lives there |
| --- | --- |
| `packages/shared` | Types, the board reducer, ranking, roster parsing — the rules, with no I/O |
| `packages/server` | Express + Socket.IO, room ownership, undo history, disk persistence |
| `packages/client` | React + Vite UI: landing page, host board, read-only viewer |

The server is authoritative. Clients send *intents* (`adjust`, `assignPlayer`, …) and re-render only
when the server echoes new state back, so two hosts on two devices can drive the same board without
drifting apart.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Server on `:4000`, Vite dev server on `:5173` with API/websocket proxy |
| `npm run build` | Type-check and build all three packages |
| `npm start` | Run the built server, which also serves the built client |
| `npm test` | Run the test suite |
| `npm run typecheck` | Type-check without emitting |

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | Server port |
| `QUIZZARDS_DATA` | `data/rooms.json` | Where room snapshots are written |
| `CORS_ORIGIN` | any | Restrict the origins allowed to connect |
| `VITE_SERVER_URL` | `http://localhost:4000` | Where the dev server proxies API traffic |

## Tests

```bash
npm test
```

Covers ranking and tie handling, delta validation, the full board reducer, roster parsing and
even distribution, and the server's room ownership and undo behaviour.
