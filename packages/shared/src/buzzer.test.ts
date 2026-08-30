import { describe, expect, it } from 'vitest';
import { MAX_BUZZES, addBuzz, formatBehind, rankBuzzes, sanitizeBuzzerName } from './buzzer.js';
import { InvalidActionError } from './scoreboard.js';
import { applyAction, createRoomState } from './actions.js';
import type { Buzz } from './types.js';

let n = 0;
const ctx = { now: 1_700_000_000_000, newId: () => `id-${++n}` };
const press = (buzzerId: string, at: number, name = buzzerId): Buzz => ({ buzzerId, name, at });

describe('rankBuzzes', () => {
  it('places presses in arrival order with the gap to the winner', () => {
    const ranked = rankBuzzes([press('a', 1000), press('b', 1320), press('c', 2500)]);

    expect(ranked.map((b) => b.place)).toEqual([1, 2, 3]);
    expect(ranked.map((b) => b.behindMs)).toEqual([0, 320, 1500]);
  });

  it('does not reorder by timestamp — arrival order is the truth', () => {
    // A device clock can be wrong; the server appended b first, so b won.
    const ranked = rankBuzzes([press('b', 500), press('a', 100)]);
    expect(ranked.map((b) => b.buzzerId)).toEqual(['b', 'a']);
    expect(ranked[0]!.place).toBe(1);
  });

  it('never reports a negative gap', () => {
    expect(rankBuzzes([press('a', 1000), press('b', 400)])[1]!.behindMs).toBe(0);
  });

  it('handles an empty list', () => {
    expect(rankBuzzes([])).toEqual([]);
  });
});

describe('formatBehind', () => {
  it('labels the winner and the gaps', () => {
    expect(formatBehind(0)).toBe('first');
    expect(formatBehind(310)).toBe('+0.31s');
    expect(formatBehind(1500)).toBe('+1.5s');
  });
});

describe('sanitizeBuzzerName', () => {
  it('tidies a name', () => {
    expect(sanitizeBuzzerName('  Kyle   F ')).toBe('Kyle F');
  });

  it('truncates a very long one', () => {
    expect(sanitizeBuzzerName('x'.repeat(80))).toHaveLength(24);
  });

  it.each(['', '   ', null, undefined, 42])('rejects %p', (value) => {
    expect(() => sanitizeBuzzerName(value)).toThrow(InvalidActionError);
  });
});

describe('addBuzz', () => {
  it('accepts a press while open', () => {
    expect(addBuzz([], press('a', 1), { open: true })).toHaveLength(1);
  });

  it('ignores presses while closed', () => {
    expect(addBuzz([], press('a', 1), { open: false })).toBeNull();
  });

  it('ignores a second press from the same device', () => {
    const first = addBuzz([], press('a', 1), { open: true })!;
    expect(addBuzz(first, press('a', 2), { open: true })).toBeNull();
  });

  it('keeps different people, in order', () => {
    let list = addBuzz([], press('a', 1), { open: true })!;
    list = addBuzz(list, press('b', 2), { open: true })!;
    expect(list.map((b) => b.buzzerId)).toEqual(['a', 'b']);
  });

  it('stops at the cap', () => {
    const full = Array.from({ length: MAX_BUZZES }, (_, i) => press(`p${i}`, i));
    expect(addBuzz(full, press('extra', 999), { open: true })).toBeNull();
  });

  it('does not mutate the list it was given', () => {
    const original = [press('a', 1)];
    addBuzz(original, press('b', 2), { open: true });
    expect(original).toHaveLength(1);
  });
});

describe('buzzer actions', () => {
  it('starts closed and empty', () => {
    const state = createRoomState('quiz-night', 3, ctx);
    expect(state.buzzersOpen).toBe(false);
    expect(state.buzzers).toEqual([]);
  });

  it('opening clears last round, so nobody inherits a stale press', () => {
    let state = createRoomState('quiz-night', 3, ctx);
    state = { ...state, buzzers: [press('a', 1), press('b', 2)] };

    state = applyAction(state, { type: 'openBuzzers' }, ctx);
    expect(state.buzzersOpen).toBe(true);
    expect(state.buzzers).toEqual([]);
  });

  it('closing keeps the order on screen', () => {
    let state = createRoomState('quiz-night', 3, ctx);
    state = applyAction(state, { type: 'openBuzzers' }, ctx);
    state = { ...state, buzzers: [press('a', 1)] };

    state = applyAction(state, { type: 'closeBuzzers' }, ctx);
    expect(state.buzzersOpen).toBe(false);
    expect(state.buzzers).toHaveLength(1);
  });

  it('clearing empties the list without closing', () => {
    let state = createRoomState('quiz-night', 3, ctx);
    state = applyAction(state, { type: 'openBuzzers' }, ctx);
    state = { ...state, buzzers: [press('a', 1)] };

    state = applyAction(state, { type: 'clearBuzzers' }, ctx);
    expect(state.buzzers).toEqual([]);
    expect(state.buzzersOpen).toBe(true);
  });

  it('leaves scores and roster alone', () => {
    let state = createRoomState('quiz-night', 2, ctx);
    const teamId = state.teams[0]!.id;
    state = applyAction(state, { type: 'adjust', teamId, delta: 10 }, ctx);
    state = applyAction(state, { type: 'addPlayers', names: 'Sam' }, ctx);

    state = applyAction(state, { type: 'openBuzzers' }, ctx);
    expect(state.teams[0]!.score).toBe(10);
    expect(state.players).toHaveLength(1);
  });
});
