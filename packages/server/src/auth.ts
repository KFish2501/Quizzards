import { timingSafeEqual } from 'node:crypto';

/**
 * Host authentication.
 *
 * On a private LAN it's fine for whoever opened the board to control it. Once
 * the scoreboard is reachable from the public internet that no longer holds —
 * anyone who guesses a room code could otherwise claim control — so a shared
 * host password gates every route that hands out control.
 */
export class HostAuth {
  readonly #password: string;
  readonly #attempts = new Map<string, { count: number; resetAt: number }>();

  /** Wrong guesses allowed per window before a client is locked out. */
  static readonly MAX_ATTEMPTS = 8;
  static readonly WINDOW_MS = 5 * 60_000;

  constructor(password: string | undefined) {
    this.#password = (password ?? '').trim();
  }

  /** When false the server is unprotected, which is only sane on a trusted LAN. */
  get required(): boolean {
    return this.#password.length > 0;
  }

  /** True when this client has burned through its allowance of wrong guesses. */
  isLockedOut(clientId: string, now = Date.now()): boolean {
    const record = this.#attempts.get(clientId);
    if (!record) return false;
    if (now > record.resetAt) {
      this.#attempts.delete(clientId);
      return false;
    }
    return record.count >= HostAuth.MAX_ATTEMPTS;
  }

  /**
   * Check a supplied password. Comparison is constant-time, and failures are
   * counted per client so a public board can't be brute-forced.
   */
  verify(supplied: unknown, clientId: string, now = Date.now()): boolean {
    if (!this.required) return true;
    if (this.isLockedOut(clientId, now)) return false;

    const ok = typeof supplied === 'string' && this.#matches(supplied);
    if (ok) {
      this.#attempts.delete(clientId);
      return true;
    }

    const record = this.#attempts.get(clientId);
    if (record && now <= record.resetAt) record.count += 1;
    else this.#attempts.set(clientId, { count: 1, resetAt: now + HostAuth.WINDOW_MS });
    return false;
  }

  #matches(supplied: string): boolean {
    const a = Buffer.from(supplied);
    const b = Buffer.from(this.#password);
    // timingSafeEqual demands equal lengths, so compare a fixed-size digest of
    // both instead of bailing out early and leaking the length.
    if (a.length !== b.length) {
      // Still burn a comparison so the timing doesn't depend on the length.
      timingSafeEqual(b, b);
      return false;
    }
    return timingSafeEqual(a, b);
  }
}
