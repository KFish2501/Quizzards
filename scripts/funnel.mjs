/**
 * Permanent public link via Tailscale Funnel.
 *
 * Unlike a quick tunnel, the address is derived from the machine's name on your
 * tailnet, so it is the same every time: https://<pc-name>.<tailnet>.ts.net.
 * Visitors need no account and see no interstitial — it is a normal HTTPS site.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const WINDOWS_PATHS = [
  'C:\\Program Files\\Tailscale\\tailscale.exe',
  'C:\\Program Files (x86)\\Tailscale\\tailscale.exe',
];

const TS_NET_URL = /https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+\.ts\.net\b/i;

/** Locate the tailscale CLI, which isn't on PATH by default on Windows. */
export function findTailscale() {
  if (process.platform === 'win32') {
    for (const path of WINDOWS_PATHS) if (existsSync(path)) return path;
  }
  for (const path of ['/usr/bin/tailscale', '/usr/local/bin/tailscale', '/opt/homebrew/bin/tailscale']) {
    if (existsSync(path)) return path;
  }
  return null;
}

function runCapture(binary, args, timeoutMs = 10_000) {
  return new Promise((resolve) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (out += c));
    child.on('error', () => resolve({ code: 1, out }));
    child.on('close', (code) => resolve({ code: code ?? 1, out }));
    setTimeout(() => child.kill(), timeoutMs).unref?.();
  });
}

/**
 * Whether Tailscale is installed, signed in, and what this machine is called.
 * Returns { state, hostname } where state is 'ready' | 'needs-login' | 'stopped'.
 */
export async function tailscaleStatus(binary) {
  const { code, out } = await runCapture(binary, ['status', '--json']);
  if (code !== 0) return { state: 'stopped', hostname: null };

  try {
    const status = JSON.parse(out);
    const dnsName = String(status?.Self?.DNSName ?? '').replace(/\.$/, '');
    const backend = String(status?.BackendState ?? '');
    if (backend === 'NeedsLogin' || backend === 'NoState') return { state: 'needs-login', hostname: null };
    if (backend !== 'Running') return { state: 'stopped', hostname: dnsName || null };
    return { state: 'ready', hostname: dnsName || null };
  } catch {
    return { state: 'stopped', hostname: null };
  }
}

/**
 * Expose the local port on the public internet and resolve with the permanent
 * URL. Resolves null on failure, having logged whatever Tailscale said — most
 * commonly a one-time "enable Funnel" link for the tailnet admin.
 */
export function startFunnel(binary, port, log, { timeoutMs = 40_000, hostname = null } = {}) {
  return new Promise((resolve) => {
    const child = spawn(binary, ['funnel', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });

    let output = '';
    let settled = false;
    const finish = (url) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(url ? { url, child } : null);
    };

    const scan = (chunk) => {
      output += chunk;
      const match = TS_NET_URL.exec(output);
      if (match) finish(match[0].replace(/\/$/, ''));
    };

    child.stdout.on('data', scan);
    child.stderr.on('data', scan);

    child.on('error', (error) => {
      log(`Permanent link failed to start: ${error.message}`);
      finish(null);
    });

    child.on('close', () => {
      if (settled) return;
      // Tailscale exits with guidance when Funnel isn't enabled yet; that text
      // is the most useful thing we can show, so pass it straight through.
      for (const line of output.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 12)) {
        log(`  tailscale: ${line}`);
      }
      finish(null);
    });

    const timer = setTimeout(() => {
      // Funnel is serving but stayed quiet; fall back to the known hostname.
      if (hostname) finish(`https://${hostname}`);
      else {
        log('Permanent link timed out.');
        finish(null);
      }
    }, timeoutMs);
    timer.unref?.();
  });
}
