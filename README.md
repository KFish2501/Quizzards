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

## Running it on your Windows PC

### First time — do this once

1. Go to **[setup.bat](https://github.com/KFish2501/Quizzards/raw/main/setup.bat)** and save the file
   (your browser may warn about a `.bat` file — keep it).
2. **Double-click `setup.bat`.** Click **Yes** to any Windows permission pop-up.

That's it. It installs what's needed, downloads the scoreboard, puts a **Quizzards** shortcut on
your Desktop, and starts it.

### Every time after that

**Double-click the Quizzards shortcut on your Desktop.**

A black window opens and shows you this:

```
==============================================================
   QUIZZARDS IS RUNNING
==============================================================

   YOU (this PC):     http://localhost:4000
   PLAYERS anywhere:  https://kyle-pc.tail9f2c.ts.net
   Players on wifi:   http://192.168.1.42:4000

   The players' link is copied — just paste it to them.
   This link is permanent — it will be the same next time.

   HOST PASSWORD:     kvv7rq3mza
   Keep this to yourself. It is what lets you change scores.

   Leave this window open. Closing it stops the quiz.
   Updates install themselves while you run.
==============================================================
```

Your browser opens automatically. Send the **players anywhere** link to whoever you like — it works
over the internet, so people don't have to be in the building. It's already on your clipboard, so
just paste it into WhatsApp or wherever.

**Leave the black window open** for the whole quiz. Closing it stops everything. Scores are saved,
so if it does get closed, opening it again picks up where you left off.

### Letting someone else run the quiz

Give them the link and the host password. That's it — they open the link on their own phone or
laptop, click **Take control**, type the password, and they're running the scoreboard.

They need **no account, no GitHub, no access to this repository and nothing installed**. The
password works purely through the web page. Their browser remembers it, so they only type it once
even if they reload.

You can both host at the same time — changes from either of you show up for the other instantly.
When you want them to stop, change `QUIZZARDS_HOST_PASSWORD` and restart; their control ends at
the next reload.

One thing to be aware of: the password is per *server*, not per *board*. Anyone you give it to can
control any board on your scoreboard, not just tonight's.

### Who can do what

| | Sees live scores | Changes scores |
| --- | :---: | :---: |
| **Anyone with the host password** | yes | yes |
| **Everyone else** with the link | yes | no |

Anyone with the link watches the board update live and can do nothing else — the buttons aren't
just hidden, the server refuses the change. To take charge from another device (a second laptop,
or your phone), open the link, click **Take control**, and enter the host password from the black
window. That browser stays in control from then on.

The password is made for you the first time you run it and doesn't change. It lives in
`.quizzards\host-password.txt` inside the Quizzards folder if you forget it. To pick your own, put
it in `START.bat` next to `QUIZZARDS_HOST_PASSWORD=`.

### The public link, in detail

`setup.bat` installs [Tailscale](https://tailscale.com/), which is what gives you a **permanent**
web address — something like `https://kyle-pc.tail9f2c.ts.net`. It's free, asks for no card, and
visitors see a normal HTTPS page with no warning screen and no sign-in.

Sign in to Tailscale once (with Google or GitHub) when setup opens it. The first time you use the
link, Tailscale may ask you to switch on its "Funnel" feature for your account — if so, the black
window prints the exact link to click.

You can change what kind of link you get with `QUIZZARDS_LINK` in `START.bat`:

| Value | What you get |
| --- | --- |
| `permanent` | Same address every time, via Tailscale. **Default.** |
| `temporary` | A new address each start, via Cloudflare. Nothing to install. |
| `off` | Your wifi only, no internet link. |

If Tailscale isn't ready for any reason, it falls back to a temporary link automatically and says
so, rather than leaving you with nothing.

**Your PC is the host.** If it sleeps or you close the window, the link stops working until you
start it again.

### Updates happen by themselves

Every time you start it, and every couple of minutes while it runs, it fetches the latest version
and installs it. You don't have to do anything. If an update ever fails, it keeps running the
version you already have, so nothing breaks mid-quiz.

### If something goes wrong

| What you see | What to do |
| --- | --- |
| Players can't open the wifi link | Windows Firewall — click **Allow** when it asks about Node.js. If you missed it, restart the PC and try again. (The internet link is unaffected by this.) |
| No internet link appeared | It falls back to the wifi link and says so. Usually a blocked network; try again, or use the wifi link. |
| You can't change scores | Click **Take control** and enter the host password from the black window. |
| "Node.js isn't installed" | Run `setup.bat` again. |
| The window closed by itself | Just open the Desktop shortcut again. Your scores are saved. |
| Something else | Screenshot the black window and send it on. |

### Settings

You almost certainly don't need these. To change one, right-click `START.bat` in the Quizzards
folder, pick **Edit**, and change the number near the top.

| Setting | Default | Meaning |
| --- | --- | --- |
| `QUIZZARDS_LINK` | `permanent` | `permanent`, `temporary` or `off` — see above |
| `QUIZZARDS_HOST_PASSWORD` | generated | Your own host password, if you don't want the generated one |
| `PORT` | `4000` | Port the scoreboard is served on |
| `QUIZZARDS_AUTOUPDATE` | `1` | Set to `0` to stop updates while it runs |
| `QUIZZARDS_UPDATE_INTERVAL` | `120` | Seconds between update checks |
| `QUIZZARDS_OPEN_BROWSER` | `1` | Set to `0` to not open a browser on startup |

## Hosting it in the cloud instead (optional)

**You don't need this.** The setup above already gives you a permanent link. This section is only
if you'd rather your PC weren't involved at all, so the board is up even with your machine off.

> **Heads up on cost:** Render now asks for card details during signup, even for free services, and
> its Blueprint flow requires a paid workspace. If you hit that wall, stick with the Tailscale setup
> above, or use a host that takes the included `Dockerfile` —
> [Hugging Face Spaces](https://huggingface.co/spaces) has a free Docker tier that asks for no card
> (choose *Docker* as the Space SDK and set `QUIZZARDS_HOST_PASSWORD` as a Space secret).

If you do have a Render account, create the service **by hand** — not via a Blueprint or deploy
button, which are the paid path.

1. Sign up at **[render.com](https://render.com/)** with your GitHub account.
2. Click **New** (top right) → **Web Service**.
3. Find **KFish2501/Quizzards** in the list and click **Connect**. If it isn't listed, click
   *Configure account* and give Render access to the repo.
4. Fill the form in exactly like this — everything else can stay as it is:

   | Field | What to put |
   | --- | --- |
   | Name | `quizzards` (this becomes your web address) |
   | Language | `Node` |
   | Branch | `main` |
   | Region | `Frankfurt (EU Central)` |
   | Build Command | `npm ci --include=dev && npm run build` |
   | Start Command | `npm start` |
   | Instance Type | **Free** — pick this one deliberately |

5. Scroll to **Environment Variables** and click **Add Environment Variable**:
   - Key: `QUIZZARDS_HOST_PASSWORD`
   - Value: any password you'll remember — this is what lets you change scores.
6. Click **Deploy Web Service**. The first build takes about five minutes.

Render shows your address at the top of the page when it's done, like
`https://quizzards.onrender.com`. That's the link — bookmark it, and send it to players.
**It stays the same forever.**

Whenever I push a change, Render rebuilds and deploys it automatically.

### If it still asks for payment details

Free web services shouldn't. If you're being asked, check you picked **Free** as the instance type
and that you went through **New → Web Service** rather than **New → Blueprint**.

If it still insists, the app also ships a `Dockerfile`, so it runs on any host that takes one —
[Hugging Face Spaces](https://huggingface.co/spaces) has a free Docker tier that needs no card
(choose *Docker* as the Space SDK, and set `QUIZZARDS_HOST_PASSWORD` as a Space secret). Or skip
cloud hosting entirely and run it from your own PC — see below.

### Two things about the free plan

- **It falls asleep after 15 minutes of nobody using it.** The next person to open the link waits
  about 50 seconds while it wakes up. Open the link yourself a minute before the quiz starts and
  everyone else arrives to an awake board.
- **A restart can lose the scores**, because free hosting has no permanent storage. This is covered:
  your browser keeps a copy of any board you're hosting. If the board has vanished, open its link
  and you'll be offered **Put this board back** — enter your host password and the teams, scores and
  roster all come back exactly as they were.

## Developing

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
| `setup.bat` | One-time Windows setup: installs prerequisites, clones, makes a shortcut |
| `START.bat` | Host on Windows: update, build, serve, and keep updating |
| `npm run host` | The same supervisor `START.bat` uses, on any platform |
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
