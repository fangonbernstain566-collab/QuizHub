# QuizHub

A LAN trivia game server. One Node.js process runs the whole game — the host PC
is the server, and every other device (phones, a projector laptop) just opens
a browser tab. No app installs, no internet required after setup.

## Requirements

- Node.js 22.5+ (uses the built-in `node:sqlite` module — no native build tools
  or separate database server needed). Node 24 is recommended.

## Setup

```
npm install
npm start
```

The console will print three URLs for this PC, plus your PC's LAN IP for phones:

```
On this PC:
  Admin:   http://localhost:3000/admin
  Display: http://localhost:3000/display
  Play:    http://localhost:3000/play

On phones/laptops on the same Wi-Fi:
  http://192.168.x.x:3000/play
```

## Running it at an event (no internet)

1. Turn on the host PC's Wi-Fi hotspot, or connect it and every phone to the
   same router/access point (an offline router works fine — devices only need
   to reach each other on the LAN, not the internet).
2. Run `npm start` on the host PC.
3. On the host PC (or a laptop hooked to a projector/TV), open
   `http://localhost:3000/display` — this is the shared screen.
4. On the host PC, open `http://localhost:3000/admin` — this is the game
   master control panel. Keep it open on a laptop/tablet you control.
5. Give players the LAN IP printed in the console, e.g.
   `http://192.168.1.42:3000/play`. Each player types their own name plus
   either creates their team's name + password (once, for the first player on
   that team) or logs in with the team password if the team already exists.
   The phone stays logged in after that — there's no self-service "switch
   team" option, so a player can't accidentally re-claim a different team's
   slot. If a team needs to log in on a different phone, or a player's device
   needs to be reset, the game master resets that team's password from the
   Admin panel, which logs out every device on that team (all player names
   are cleared) and lets them log back in with their names again.
6. Windows Firewall may prompt the first time Node listens on the network —
   choose "Allow access" for private networks.

If phones can't reach the host, double-check they're on the same Wi-Fi network
as the host PC (not a guest network that isolates clients from each other).

## How a round works

The server is the single source of truth for game state — every screen
(admin/display/play) re-syncs from the server on connect or reconnect, so a
phone that loses signal and reopens the page resumes exactly where the round
left off, still assigned to its team.

State machine per question:

```
ASK_QUESTION → ANSWERING (timer running) → REVEALED → SCORED → next question
```

Questions themselves are **narrated aloud by the game master** — the app
doesn't store question text or answer keys, only round number, question
number, and the timer, so answers and scores have somewhere to attach.

1. **Admin** sets a round number and time limit and clicks **Start Question**
   → `ASK_QUESTION`: the display and phones show "Round N — Question M" while
   the game master reads the question out loud.
2. Admin clicks **Start Answering** → a server-authoritative countdown begins;
   phones can type and submit/edit their answer until time runs out
   (`ANSWERING`).
3. When the timer expires (or admin clicks **Reveal Answers** early), the
   round moves to `REVEALED`: the display shows every team's answer side by
   side, with "No answer" for teams that didn't submit in time. Late or
   post-reveal submissions are rejected by the server.
4. Admin enters points per team and clicks **Finalize Scoring** (`SCORED`) —
   the running scoreboard updates everywhere.
5. Admin clicks **Next Round** to return to idle and start the next question.

## Data

Everything is stored in a single SQLite file at `data/quiz.db`, created
automatically on first run — teams, questions, answers, and scores all
persist across restarts. If the server restarts mid-timer, the round resets
to `ASK_QUESTION` for that question rather than leaving it stuck, so the host
just clicks Start Answering again.


## Game sessions

The Admin panel also supports finishing a complete game and starting another
session without changing the question bank or teams. After the last question is
finalized, click **End game**. QuizHub freezes the final standings, announces the
highest-scoring team on the Display page, and records the winner in the Admin
panel's in-memory session history. Click **Start new session** to reset the
current scores, answers, and asked-question history back to zero while keeping
teams, players, and the question bank.

Session history is intentionally **in memory only** and is cleared when the Node
server is restarted. No new database tables are required for this feature.
