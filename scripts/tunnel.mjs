/**
 * Public link support, via a Cloudflare quick tunnel.
 *
 * This gives the locally-hosted scoreboard an https address anyone on the
 * internet can open, with no account, no port forwarding and no router
 * changes. The address is random and lasts for the life of the process, which
 * suits a one-evening quiz night.
 */
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const RELEASE = 'https://github.com/cloudflare/cloudflared/releases/latest/download';

/** The cloudflared build for this machine, or null if we don't ship one. */
function assetName() {
  const { platform, arch } = process;
  if (platform === 'win32') return arch === 'arm64' ? null : 'cloudflared-windows-amd64.exe';
  if (platform === 'darwin') return null; // ships as a .tgz — not worth unpacking here
  if (platform === 'linux') {
    if (arch === 'x64') return 'cloudflared-linux-amd64';
    if (arch === 'arm64') return 'cloudflared-linux-arm64';
  }
  return null;
}

/**
 * Return a path to cloudflared, downloading it on first use. Kept beside the
 * repo's other generated state so removing .quizzards resets everything.
 */
export async function ensureCloudflared(stateDir, log) {
  const asset = assetName();
  if (!asset) return null;

  const binary = join(stateDir, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
  if (existsSync(binary)) return binary;

  log('Downloading the public-link helper (one time, about 20 MB)…');
  try {
    const response = await fetch(`${RELEASE}/${asset}`, { redirect: 'follow' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    mkdirSync(stateDir, { recursive: true });
    await writeFile(binary, Buffer.from(await response.arrayBuffer()));
    if (process.platform !== 'win32') chmodSync(binary, 0o755);
    return binary;
  } catch (error) {
    log(`Could not download the public-link helper: ${error.message}`);
    return null;
  }
}

const URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

/**
 * Start a tunnel to the given local port and resolve with its public URL.
 * Resolves to null if the tunnel can't be established, so the caller can carry
 * on serving locally rather than failing outright.
 */
export function startTunnel(binary, port, log, { timeoutMs = 45_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(binary, ['tunnel', '--url', `http://localhost:${port}`, '--no-autoupdate'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let settled = false;
    const finish = (url) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(url ? { url, child } : null);
    };

    const scan = (chunk) => {
      const match = URL_PATTERN.exec(String(chunk));
      if (match) finish(match[0]);
    };

    // cloudflared reports the assigned URL on stderr, not stdout.
    child.stdout.on('data', scan);
    child.stderr.on('data', scan);

    child.on('error', (error) => {
      log(`Public link failed to start: ${error.message}`);
      finish(null);
    });
    child.on('close', () => finish(null));

    const timer = setTimeout(() => {
      log('Public link timed out — carrying on with the local address only.');
      finish(null);
    }, timeoutMs);
    timer.unref?.();
  });
}
