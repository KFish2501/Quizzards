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
import { createHash, randomInt } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureCloudflared, startTunnel } from './tunnel.mjs';
import { findTailscale, startFunnel, tailscaleStatus } from './funnel.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATE_DIR = join(ROOT, '.quizzards');
const LOCK_HASH_FILE = join(STATE_DIR, 'installed-lock.sha1');
const PASSWORD_FILE = join(STATE_DIR, 'host-password.txt');

const PORT = process.env.PORT ?? '4000';
const AUTO_UPDATE = process.env.QUIZZARDS_AUTOUPDATE !== '0';
const INTERVAL_SECONDS = Math.max(30, Number(process.env.QUIZZARDS_UPDATE_INTERVAL ?? 120));
/**
 * How players reach the board:
 *   permanent — Tailscale Funnel, same address every time
 *   temporary — Cloudflare quick tunnel, new address each start
 *   off       — this wifi only
 * QUIZZARDS_PUBLIC=1 is still honoured as the old name for `temporary`.
 */
const LINK_MODE = (process.env.QUIZZARDS_LINK ?? (process.env.QUIZZARDS_PUBLIC === '1' ? 'temporary' : 'off'))
  .trim()
  .toLowerCase();
const IS_WINDOWS = process.platform === 'win32';

let publicUrl = null;
let linkIsPermanent = false;
let tunnel = null;
let hostPassword = '';
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

/**
 * The host password. Uses whatever is configured, otherwise generates one on
 * first run and keeps it, so an internet-facing board is never left open by
 * default and the password doesn't change every evening.
 */
function resolveHostPassword() {
  const configured = (process.env.QUIZZARDS_HOST_PASSWORD ?? '').trim();
  if (configured) return configured;

  if (existsSync(PASSWORD_FILE)) {
    const saved = readFileSync(PASSWORD_FILE, 'utf8').trim();
    if (saved) return saved;
  }

  // Ambiguous characters left out so it can be read aloud or typed on a phone.
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const generated = Array.from({ length: 10 }, () => alphabet[randomInt(alphabet.length)]).join('');
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(PASSWORD_FILE, generated + '\n');
  return generated;
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
  const bar = '  ' + '='.repeat(62);
  const [lan] = lanAddresses();
  const lanUrl = lan ? `http://${lan}:${PORT}` : null;

  // Prefer the internet link when there is one — that's what gets shared.
  const shareUrl = publicUrl ?? lanUrl;
  const copied = shareUrl ? copyToClipboard(shareUrl) : false;

  const lines = ['', bar, '     QUIZZARDS IS RUNNING', bar, ''];

  lines.push(`     YOU (this PC):     http://localhost:${PORT}`);
  if (publicUrl) {
    lines.push(`     PLAYERS anywhere:  ${publicUrl}`);
    if (lanUrl) lines.push(`     Players on wifi:   ${lanUrl}`);
  } else if (lanUrl) {
    lines.push(`     PLAYERS on wifi:   ${lanUrl}`);
  }

  lines.push('');
  if (shareUrl && copied) {
    lines.push("     The players' link is copied — just paste it to them.");
  } else if (shareUrl) {
    lines.push("     Send the players' link to anyone you want watching.");
  } else {
    lines.push('     No network found, so only this PC can see it.');
  }

  if (publicUrl) {
    lines.push(
      linkIsPermanent
        ? '     This link is permanent — it will be the same next time.'
        : '     This link is temporary — it changes each time you start.',
    );
  } else if (LINK_MODE !== 'off') {
    lines.push('     (No internet link this time — the wifi link still works.)');
  }

  lines.push('', `     HOST PASSWORD:     ${hostPassword}`);
  lines.push('     Keep this to yourself. It is what lets you change scores.');

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
    env: { ...process.env, PORT, QUIZZARDS_QUIET: '1', QUIZZARDS_HOST_PASSWORD: hostPassword },
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

/** Bring up a temporary Cloudflare link. Used directly, or as a fallback. */
async function startTemporaryLink() {
  const binary = await ensureCloudflared(STATE_DIR, log);
  if (!binary) return false;

  log('Starting a temporary link…');
  const started = await startTunnel(binary, PORT, log);
  if (!started) return false;

  publicUrl = started.url;
  tunnel = started.child;
  linkIsPermanent = false;
  return true;
}

/**
 * Bring up the permanent Tailscale link, explaining precisely what's missing if
 * it can't, then falling back to a temporary link so the quiz still has one.
 */
async function startPermanentLink() {
  const binary = findTailscale();
  if (!binary) {
    log('Tailscale is not installed, so there is no permanent link.');
    log('Install it from https://tailscale.com/download/windows and sign in.');
    return false;
  }

  const { state, hostname } = await tailscaleStatus(binary);
  if (state !== 'ready') {
    log(
      state === 'needs-login'
        ? 'Tailscale is installed but not signed in — open it and sign in, then restart.'
        : 'Tailscale is installed but not running — start it, then restart this.',
    );
    return false;
  }

  log('Starting your permanent link…');
  const started = await startFunnel(binary, PORT, log, { hostname });
  if (!started) {
    log('Tailscale could not publish the link. The messages above say why —');
    log('most often Funnel needs enabling once for your account.');
    return false;
  }

  publicUrl = started.url;
  tunnel = started.child;
  linkIsPermanent = true;
  return true;
}

async function startPublicLink() {
  if (LINK_MODE === 'off') return;

  if (LINK_MODE === 'permanent' || LINK_MODE === 'tailscale') {
    if (await startPermanentLink()) return;
    log('Falling back to a temporary link for now.');
  }

  await startTemporaryLink();
}

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
  hostPassword = resolveHostPassword();
  if (!(await ensureDependencies())) process.exit(1);

  const hasBuild = existsSync(join(ROOT, 'packages', 'server', 'dist', 'index.js'));
  if (!(await build())) {
    // Nothing to fall back on the very first time, so that's fatal.
    if (!hasBuild) process.exit(1);
    log('Continuing with the existing build.');
  }

  // Start serving first so the tunnel has something to point at, and so a slow
  // or failed tunnel never delays the local board.
  startServer();

  await startPublicLink();

  banner();

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
    tunnel?.kill();
    void stopServer().then(() => process.exit(0));
  });
}

void main();
