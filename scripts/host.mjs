#!/usr/bin/env node
/**
 * Quizzards host supervisor.
 *
 * Keeps the scoreboard server running and, when enabled, watches the git
 * remote for new commits and rolls them out without anyone touching the
 * machine. Designed to be started by run.bat and left alone all evening.
 *
 * The guiding rule is that a bad push must never take a live quiz down: the
 * running server is only stopped once new code has been installed and built
 * successfully. If anything fails, the current build keeps serving and the
 * updater tries again on the next cycle.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATE_DIR = join(ROOT, '.quizzards');
const LOCK_HASH_FILE = join(STATE_DIR, 'installed-lock.sha1');

const PORT = process.env.PORT ?? '4000';
const AUTO_UPDATE = process.env.QUIZZARDS_AUTOUPDATE !== '0';
const INTERVAL_SECONDS = Math.max(30, Number(process.env.QUIZZARDS_UPDATE_INTERVAL ?? 120));
const IS_WINDOWS = process.platform === 'win32';

let server = null;
let updating = false;
let shuttingDown = false;
/** Remote commit we've already complained about, so one problem warns once. */
let warnedAbout = null;

const stamp = () =>
  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const log = (message) => console.log(`[${stamp()}] ${message}`);

/** Run a command to completion. Resolves with the exit code rather than throwing. */
function run(command, args, { quiet = false } = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      shell: IS_WINDOWS, // npm/git are .cmd shims on Windows
    });

    let output = '';
    child.stdout?.on('data', (chunk) => (output += chunk));
    child.stderr?.on('data', (chunk) => (output += chunk));
    child.on('error', () => resolvePromise({ code: 1, output }));
    child.on('close', (code) => resolvePromise({ code: code ?? 1, output: output.trim() }));
  });
}

async function capture(command, args) {
  const { code, output } = await run(command, args, { quiet: true });
  return code === 0 ? output : null;
}

/** Every LAN address this machine can be reached on, for sharing viewer links. */
function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((nic) => nic && nic.family === 'IPv4' && !nic.internal)
    .map((nic) => nic.address);
}

/** Put text on the Windows clipboard, so the players' link is ready to paste. */
function copyToClipboard(text) {
  if (!IS_WINDOWS) return false;
  try {
    const child = spawn('clip', { shell: true, stdio: ['pipe', 'ignore', 'ignore'] });
    child.stdin.end(text);
    return true;
  } catch {
    return false;
  }
}

function banner() {
  const bar = '  ' + '='.repeat(58);
  const [players] = lanAddresses();
  const playersUrl = players ? `http://${players}:${PORT}` : null;
  const copied = playersUrl ? copyToClipboard(playersUrl) : false;

  const lines = [
    '',
    bar,
    '     QUIZZARDS IS RUNNING',
    bar,
    '',
    `     YOU (this PC):    http://localhost:${PORT}`,
  ];

  if (playersUrl) {
    lines.push(`     PLAYERS (wifi):   ${playersUrl}`);
    lines.push('');
    lines.push(
      copied
        ? "     The players' link is copied — just paste it to them."
        : "     Send the players' link to anyone on your wifi.",
    );
  } else {
    lines.push('');
    lines.push('     No network connection found, so only this PC can see it.');
  }

  lines.push(
    '',
    '     Leave this window open. Closing it stops the quiz.',
    AUTO_UPDATE ? '     Updates install themselves while you run.' : '     Auto-update is off.',
    bar,
    '',
  );
  console.log(lines.join('\n'));
}

// ---------------------------------------------------------------- dependencies

function lockHash() {
  const lockfile = join(ROOT, 'package-lock.json');
  if (!existsSync(lockfile)) return null;
  return createHash('sha1').update(readFileSync(lockfile)).digest('hex');
}

/** Install dependencies only when they are missing or the lockfile moved. */
async function ensureDependencies() {
  const current = lockHash();
  const installed = existsSync(LOCK_HASH_FILE) ? readFileSync(LOCK_HASH_FILE, 'utf8').trim() : null;
  const needsInstall = !existsSync(join(ROOT, 'node_modules')) || current !== installed;
  if (!needsInstall) return true;

  log('Installing dependencies (this can take a minute the first time)…');
  const { code } = await run('npm', ['install', '--no-audit', '--no-fund']);
  if (code !== 0) {
    log('ERROR: npm install failed.');
    return false;
  }

  mkdirSync(STATE_DIR, { recursive: true });
  if (current) writeFileSync(LOCK_HASH_FILE, current);
  return true;
}

async function build() {
  log('Building…');
  const { code } = await run('npm', ['run', 'build']);
  if (code !== 0) {
    log('ERROR: build failed.');
    return false;
  }
  return true;
}

// --------------------------------------------------------------- server process

function startServer() {
  server = spawn(process.execPath, [join(ROOT, 'packages', 'server', 'dist', 'index.js')], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, PORT, QUIZZARDS_QUIET: '1' },
  });

  server.on('close', (code) => {
    server = null;
    if (shuttingDown || updating) return;
    // An unexpected exit shouldn't end the quiz night — come back up.
    log(`Server stopped unexpectedly (code ${code}). Restarting in 3s…`);
    setTimeout(() => {
      if (!shuttingDown) startServer();
    }, 3000);
  });
}

function stopServer() {
  return new Promise((resolvePromise) => {
    if (!server) return resolvePromise();
    const child = server;
    child.once('close', () => resolvePromise());
    // SIGINT lets the server flush its room snapshot before exiting.
    child.kill(IS_WINDOWS ? undefined : 'SIGINT');
    setTimeout(() => child.killed || child.kill('SIGKILL'), 5000).unref?.();
  });
}

// ------------------------------------------------------------------- updating

async function currentBranch() {
  return (await capture('git', ['rev-parse', '--abbrev-ref', 'HEAD'])) ?? 'main';
}

/**
 * Fetch, and if the tracked branch has moved, pull it and roll the new build
 * out. The server keeps serving the old build until the new one is ready.
 */
async function checkForUpdates() {
  if (updating || shuttingDown) return;

  const branch = await currentBranch();
  const fetched = await run('git', ['fetch', 'origin', branch], { quiet: true });
  if (fetched.code !== 0) {
    log('Could not reach GitHub — will try again next cycle.');
    return;
  }

  const local = await capture('git', ['rev-parse', 'HEAD']);
  const remote = await capture('git', ['rev-parse', `origin/${branch}`]);
  if (!local || !remote || local === remote) return;

  updating = true;
  try {
    const subject = await capture('git', ['log', '-1', '--format=%s', `origin/${branch}`]);
    const firstTimeSeeing = warnedAbout !== remote;
    if (firstTimeSeeing) log(`Update found: ${subject ?? remote.slice(0, 7)}`);

    const pulled = await run('git', ['pull', '--ff-only', 'origin', branch], {
      quiet: !firstTimeSeeing,
    });
    if (pulled.code !== 0) {
      // A pull that can't fast-forward won't start working on its own, so say
      // what to do once rather than repeating the same error all evening.
      if (firstTimeSeeing) {
        warnedAbout = remote;
        log('ERROR: cannot update automatically — this folder has changes of its');
        log('       own, or the branch history was rewritten upstream.');
        log('       Fix with:  git status   then   git reset --hard origin/' + branch);
        log('       Until then the current version keeps running.');
      }
      return;
    }
    warnedAbout = null;

    if (!(await ensureDependencies())) return;
    if (!(await build())) {
      log('Keeping the previous build running.');
      return;
    }

    log('Restarting with the new version…');
    await stopServer();
    startServer();
    log('Update applied. Scores were saved and reload automatically.');
  } finally {
    updating = false;
    if (!server && !shuttingDown) startServer();
  }
}

// ---------------------------------------------------------------------- start

/** Grab the latest version at launch, so starting up is also updating. */
async function pullOnLaunch() {
  if (!AUTO_UPDATE) return;
  if (!(await capture('git', ['rev-parse', '--git-dir']))) return;

  const branch = await currentBranch();
  log('Checking for the latest version…');
  const fetched = await run('git', ['fetch', 'origin', branch], { quiet: true });
  if (fetched.code !== 0) {
    log('No internet — starting the version you already have.');
    return;
  }

  const local = await capture('git', ['rev-parse', 'HEAD']);
  const remote = await capture('git', ['rev-parse', `origin/${branch}`]);
  if (!local || !remote || local === remote) {
    log('Already up to date.');
    return;
  }

  const pulled = await run('git', ['pull', '--ff-only', 'origin', branch], { quiet: true });
  log(pulled.code === 0 ? 'Updated to the latest version.' : 'Could not update — starting anyway.');
}

async function main() {
  await pullOnLaunch();
  if (!(await ensureDependencies())) process.exit(1);

  const hasBuild = existsSync(join(ROOT, 'packages', 'server', 'dist', 'index.js'));
  if (!(await build())) {
    // Nothing to fall back on the very first time, so that's fatal.
    if (!hasBuild) process.exit(1);
    log('Continuing with the existing build.');
  }

  banner();
  startServer();

  if (AUTO_UPDATE) {
    if (!(await capture('git', ['rev-parse', '--git-dir']))) {
      log('Not a git clone — auto-update disabled. Use "git clone" if you want live updates.');
      return;
    }
    setInterval(() => void checkForUpdates(), INTERVAL_SECONDS * 1000);
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    shuttingDown = true;
    void stopServer().then(() => process.exit(0));
  });
}

void main();
