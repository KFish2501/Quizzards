import { describe, expect, it } from 'vitest';
import { HostAuth } from './auth.js';

const CLIENT = '203.0.113.7';

describe('HostAuth', () => {
  it('is not required when no password is configured', () => {
    for (const value of [undefined, '', '   ']) {
      const auth = new HostAuth(value);
      expect(auth.required).toBe(false);
      // An unprotected server lets anything through, for LAN-only use.
      expect(auth.verify(undefined, CLIENT)).toBe(true);
    }
  });

  it('accepts the right password and rejects everything else', () => {
    const auth = new HostAuth('quiz-master');

    expect(auth.required).toBe(true);
    expect(auth.verify('quiz-master', CLIENT)).toBe(true);
    expect(auth.verify('quiz-Master', CLIENT)).toBe(false);
    expect(auth.verify('quiz-master ', CLIENT)).toBe(false);
    expect(auth.verify('', CLIENT)).toBe(false);
    expect(auth.verify(undefined, CLIENT)).toBe(false);
    expect(auth.verify(12345, CLIENT)).toBe(false);
  });

  it('trims the configured password so a stray newline cannot lock you out', () => {
    expect(new HostAuth('  hunter2\n').verify('hunter2', CLIENT)).toBe(true);
  });

  it('locks a client out after too many wrong guesses', () => {
    const auth = new HostAuth('correct');

    for (let i = 0; i < HostAuth.MAX_ATTEMPTS; i++) {
      expect(auth.verify('wrong', CLIENT)).toBe(false);
    }

    expect(auth.isLockedOut(CLIENT)).toBe(true);
    // Even the right password is refused while locked out.
    expect(auth.verify('correct', CLIENT)).toBe(false);
  });

  it('locks out only the offending client', () => {
    const auth = new HostAuth('correct');
    for (let i = 0; i < HostAuth.MAX_ATTEMPTS; i++) auth.verify('wrong', CLIENT);

    expect(auth.isLockedOut(CLIENT)).toBe(true);
    expect(auth.isLockedOut('198.51.100.4')).toBe(false);
    expect(auth.verify('correct', '198.51.100.4')).toBe(true);
  });

  it('forgives a client once the window passes', () => {
    const auth = new HostAuth('correct');
    const start = 1_700_000_000_000;

    for (let i = 0; i < HostAuth.MAX_ATTEMPTS; i++) auth.verify('wrong', CLIENT, start);
    expect(auth.isLockedOut(CLIENT, start)).toBe(true);

    const later = start + HostAuth.WINDOW_MS + 1;
    expect(auth.isLockedOut(CLIENT, later)).toBe(false);
    expect(auth.verify('correct', CLIENT, later)).toBe(true);
  });

  it('clears the failure count after a success', () => {
    const auth = new HostAuth('correct');

    for (let i = 0; i < HostAuth.MAX_ATTEMPTS - 1; i++) auth.verify('wrong', CLIENT);
    expect(auth.verify('correct', CLIENT)).toBe(true);

    // The earlier failures are forgotten, so the allowance is full again.
    for (let i = 0; i < HostAuth.MAX_ATTEMPTS - 1; i++) auth.verify('wrong', CLIENT);
    expect(auth.isLockedOut(CLIENT)).toBe(false);
  });

  it('rejects a wrong password of a different length without throwing', () => {
    const auth = new HostAuth('short');
    expect(auth.verify('a-much-longer-guess', CLIENT)).toBe(false);
    expect(auth.verify('x', CLIENT)).toBe(false);
  });
});
