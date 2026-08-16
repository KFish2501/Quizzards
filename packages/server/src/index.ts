import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import {
  type ClientToServerEvents,
  InvalidActionError,
  MAX_TEAMS,
  type ServerToClientEvents,
  isValidRoomCode,
  normalizeRoomCode,
  restoreRoomState,
} from '@quizzards/shared';
import { HostAuth } from './auth.js';
import { RoomManager } from './rooms.js';
import { RoomStore } from './store.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4000);
const DATA_FILE = process.env.QUIZZARDS_DATA ?? resolve(HERE, '../../../data/rooms.json');
const CLIENT_DIST = resolve(HERE, '../../client/dist');
const DEFAULT_TEAM_COUNT = 5;

const store = new RoomStore(DATA_FILE);
const rooms = new RoomManager({ onChange: () => store.schedule(rooms.all()) });
const auth = new HostAuth(process.env.QUIZZARDS_HOST_PASSWORD);

const app = express();
app.set('trust proxy', true); // behind a tunnel or reverse proxy, for real client IPs
app.use(express.json({ limit: '32kb' }));

const http = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(http, {
  cors: { origin: process.env.CORS_ORIGIN ?? true },
});

/** Every LAN address this machine can be reached on, for sharing viewer links. */
function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((nic): nic is NonNullable<typeof nic> => Boolean(nic) && nic!.family === 'IPv4' && !nic!.internal)
    .map((nic) => nic.address);
}

/** Push the current state to everyone watching a room. */
function broadcast(code: string): void {
  const room = rooms.get(code);
  if (!room) return;
  io.to(code).emit('state', { state: room.state, canUndo: rooms.canUndo(code) });
}

function broadcastViewers(code: string): void {
  const count = io.sockets.adapter.rooms.get(code)?.size ?? 0;
  io.to(code).emit('viewers', { count });
}

app.get('/api/health', (_req, res) => {
  // The client uses passwordRequired to decide whether to show a login prompt.
  res.json({ ok: true, rooms: rooms.list().length, passwordRequired: auth.required });
});

app.get('/api/rooms', (_req, res) => {
  // Room codes are guessable, so don't advertise them on a public board.
  if (auth.required) {
    res.status(404).json({ error: 'Not available.' });
    return;
  }
  res.json({ rooms: rooms.list() });
});

/**
 * Create (or re-open) a board. The host token comes back exactly once, on the
 * creating request; viewers who only know the code never receive it.
 */
app.post('/api/rooms', (req, res) => {
  const body = req.body as { code?: unknown; teams?: unknown; password?: unknown } | undefined;

  // Creating a room hands back the host token, so it is a control operation.
  const clientId = req.ip ?? 'unknown';
  if (auth.isLockedOut(clientId)) {
    res.status(429).json({ error: 'Too many wrong passwords. Wait a few minutes and try again.' });
    return;
  }
  if (!auth.verify(body?.password, clientId)) {
    res.status(401).json({ error: 'Wrong host password.' });
    return;
  }

  const requested = typeof body?.code === 'string' ? body.code : '';
  const code = normalizeRoomCode(requested) || `quiz-${Math.random().toString(36).slice(2, 7)}`;

  if (!isValidRoomCode(code)) {
    res.status(400).json({ error: 'Room code must be letters, numbers and hyphens.' });
    return;
  }

  const alreadyExisted = rooms.has(code);
  const teamCount = Number(body?.teams ?? DEFAULT_TEAM_COUNT);
  const room = rooms.create(code, Number.isFinite(teamCount) ? teamCount : DEFAULT_TEAM_COUNT);

  // A snapshot from the host's browser rebuilds a board the server lost — but
  // only into a genuinely new room, so it can never clobber a live one.
  let restored = false;
  if (!alreadyExisted && (body as { restore?: unknown } | undefined)?.restore) {
    room.state = restoreRoomState(code, (body as { restore?: unknown }).restore, {
      now: Date.now(),
      newId: () => randomUUID(),
    });
    room.history = [];
    restored = true;
  }

  res.status(alreadyExisted ? 200 : 201).json({
    code: room.state.code,
    hostToken: room.hostToken,
    reopened: alreadyExisted,
    restored,
    state: room.state,
    maxTeams: MAX_TEAMS,
  });
});

app.get('/api/rooms/:code', (req, res) => {
  const room = rooms.get(normalizeRoomCode(req.params.code));
  if (!room) {
    res.status(404).json({ error: 'No such room.' });
    return;
  }
  res.json({ state: room.state });
});

io.on('connection', (socket) => {
  let joined: string | null = null;
  let controls = false;

  socket.on('join', ({ code: rawCode, hostToken, password }, ack) => {
    const code = normalizeRoomCode(String(rawCode ?? ''));
    const room = rooms.get(code);
    if (!room) {
      ack?.({ ok: false, error: 'No such room.' });
      return;
    }

    // The remembered token always works; a password is the way to claim control
    // on a device that has never hosted this board before.
    const clientId = socket.handshake.address;
    let grantedToken: string | undefined;
    let canControl = rooms.isHost(code, hostToken);

    if (!canControl && typeof password === 'string' && password.length > 0) {
      if (auth.isLockedOut(clientId)) {
        ack?.({ ok: false, error: 'Too many wrong passwords. Wait a few minutes and try again.' });
        return;
      }
      if (auth.verify(password, clientId)) {
        canControl = true;
        grantedToken = room.hostToken;
      } else {
        ack?.({ ok: false, error: 'Wrong host password.' });
        return;
      }
    }

    if (joined && joined !== code) {
      void socket.leave(joined);
      broadcastViewers(joined);
    }

    joined = code;
    controls = canControl;
    void socket.join(code);

    ack?.({
      ok: true,
      data: {
        state: room.state,
        canControl,
        canUndo: rooms.canUndo(code),
        hostToken: grantedToken,
        passwordRequired: auth.required,
      },
    });
    broadcastViewers(code);
  });

  socket.on('action', ({ action }) => {
    if (!joined || !controls) {
      socket.emit('actionError', { message: 'This view is read-only.' });
      return;
    }
    try {
      rooms.apply(joined, action);
      broadcast(joined);
    } catch (error) {
      socket.emit('actionError', {
        message: error instanceof InvalidActionError ? error.message : 'That change could not be applied.',
      });
      if (!(error instanceof InvalidActionError)) console.error('[action]', error);
    }
  });

  socket.on('undo', () => {
    if (!joined || !controls) {
      socket.emit('actionError', { message: 'This view is read-only.' });
      return;
    }
    try {
      rooms.undo(joined);
      broadcast(joined);
    } catch (error) {
      socket.emit('actionError', {
        message: error instanceof InvalidActionError ? error.message : 'Undo failed.',
      });
    }
  });

  socket.on('disconnect', () => {
    if (joined) broadcastViewers(joined);
  });
});

// In production the API also serves the built client; in dev, Vite does.
if (existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (_req, res) => res.sendFile(join(CLIENT_DIST, 'index.html')));
}

async function main(): Promise<void> {
  const restored = await store.load(rooms);
  if (restored > 0) console.log(`[quizzards] restored ${restored} room(s) from ${DATA_FILE}`);

  if (!auth.required) {
    console.warn(
      '[quizzards] WARNING: no host password set. Anyone who can reach this server can\n' +
        '            take control of a board. Set QUIZZARDS_HOST_PASSWORD before exposing it.',
    );
  }

  http.listen(PORT, () => {
    // The host supervisor prints its own banner; don't say it all twice.
    if (process.env.QUIZZARDS_QUIET === '1') return;
    console.log(`[quizzards] scoreboard server listening on http://localhost:${PORT}`);
    for (const address of lanAddresses()) {
      console.log(`[quizzards] reachable on your network at http://${address}:${PORT}`);
    }
  });
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void store.flush().finally(() => process.exit(0));
  });
}

void main();
