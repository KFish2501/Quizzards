import { describe, expect, it } from 'vitest';
import { MAX_ABS_SCORE, restoreRoomState } from './restore.js';
import { MAX_PLAYERS, MAX_TEAMS, defaultSubtitle, membersOf } from './scoreboard.js';

let counter = 0;
const ctx = { now: 1_700_000_000_000, newId: () => `gen-${++counter}` };

const snapshot = {
  code: 'ignored',
  title: 'Pub Quiz',
  subtitle: 'Round 3',
  subtitleAuto: false,
  sortByScore: true,
  teams: [
    { id: 'a', name: 'Kyle', score: 25 },
    { id: 'b', name: 'OD', score: -5 },
  ],
  players: [
    { id: 'p1', name: 'Sam', teamId: 'a' },
    { id: 'p2', name: 'Priya', teamId: null },
  ],
};

describe('restoreRoomState', () => {
  it('brings a board back intact', () => {
    const state = restoreRoomState('quiz-night', snapshot, ctx);

    expect(state.code).toBe('quiz-night'); // the code comes from the URL, not the payload
    expect(state.title).toBe('Pub Quiz');
    expect(state.subtitle).toBe('Round 3');
    expect(state.sortByScore).toBe(true);
    expect(state.teams.map((t) => [t.name, t.score])).toEqual([
      ['Kyle', 25],
      ['OD', -5],
    ]);
    expect(membersOf(state.players, 'a').map((p) => p.name)).toEqual(['Sam']);
    expect(state.rev).toBe(0);
  });

  it('survives complete rubbish', () => {
    for (const input of [null, undefined, 42, 'nonsense', [], { teams: 'nope' }]) {
      const state = restoreRoomState('quiz-night', input, ctx);
      expect(state.teams.length).toBeGreaterThanOrEqual(1);
      expect(state.players).toEqual([]);
      expect(state.title).toBe('Live Quiz Scoreboard');
    }
  });

  it('always leaves at least one team to score', () => {
    expect(restoreRoomState('q', { teams: [] }, ctx).teams).toHaveLength(1);
  });

  it('caps teams and players at the configured maximums', () => {
    const huge = {
      teams: Array.from({ length: MAX_TEAMS + 20 }, (_, i) => ({ id: `t${i}`, name: `T${i}`, score: 0 })),
      players: Array.from({ length: MAX_PLAYERS + 50 }, (_, i) => ({ id: `p${i}`, name: `P${i}` })),
    };
    const state = restoreRoomState('q', huge, ctx);

    expect(state.teams).toHaveLength(MAX_TEAMS);
    expect(state.players).toHaveLength(MAX_PLAYERS);
  });

  it('clamps absurd, fractional and non-numeric scores', () => {
    const state = restoreRoomState(
      'q',
      {
        teams: [
          { name: 'A', score: 9e99 },
          { name: 'B', score: -9e99 },
          { name: 'C', score: 7.9 },
          { name: 'D', score: 'lots' },
          { name: 'E', score: NaN },
        ],
      },
      ctx,
    );

    expect(state.teams.map((t) => t.score)).toEqual([MAX_ABS_SCORE, -MAX_ABS_SCORE, 7, 0, 0]);
  });

  it('unassigns players pointing at teams that did not survive', () => {
    const state = restoreRoomState(
      'q',
      {
        teams: [{ id: 'real', name: 'Real', score: 0 }],
        players: [
          { id: 'p1', name: 'Sam', teamId: 'real' },
          { id: 'p2', name: 'Alex', teamId: 'ghost' },
        ],
      },
      ctx,
    );

    expect(membersOf(state.players, 'real').map((p) => p.name)).toEqual(['Sam']);
    expect(state.players.find((p) => p.name === 'Alex')?.teamId).toBeNull();
  });

  it('drops nameless players and sanitizes the rest', () => {
    const state = restoreRoomState(
      'q',
      { teams: [{ id: 'a', name: 'A' }], players: [{ name: '   ' }, {}, { name: '  Mary   Jane ' }] },
      ctx,
    );

    expect(state.players.map((p) => p.name)).toEqual(['Mary Jane']);
  });

  it('replaces duplicate and unusable ids so nothing collides', () => {
    const state = restoreRoomState(
      'q',
      {
        teams: [
          { id: 'same', name: 'A' },
          { id: 'same', name: 'B' },
          { id: 12345, name: 'C' },
          { id: 'x'.repeat(500), name: 'D' },
        ],
      },
      ctx,
    );

    const ids = state.teams.map((t) => t.id);
    expect(new Set(ids).size).toBe(4);
    expect(ids[0]).toBe('same');
  });

  it('falls back to default names for blank or missing ones', () => {
    const state = restoreRoomState('q', { teams: [{ name: '  ' }, { name: 'Real' }, {}] }, ctx);
    expect(state.teams.map((t) => t.name)).toEqual(['Team 1', 'Real', 'Team 3']);
  });

  it('regenerates the automatic subtitle rather than trusting a stale one', () => {
    const state = restoreRoomState(
      'q',
      { subtitleAuto: true, subtitle: '99-team real-time leaderboard', teams: [{ name: 'A' }, { name: 'B' }] },
      ctx,
    );

    expect(state.subtitle).toBe(defaultSubtitle(2));
  });

  it('treats a pinned but empty subtitle as automatic', () => {
    const state = restoreRoomState('q', { subtitleAuto: false, subtitle: '   ', teams: [{ name: 'A' }] }, ctx);
    expect(state.subtitleAuto).toBe(true);
    expect(state.subtitle).toBe(defaultSubtitle(1));
  });

  it('truncates oversized text instead of storing it', () => {
    const state = restoreRoomState(
      'q',
      { title: 'T'.repeat(500), teams: [{ name: 'N'.repeat(500), score: 0 }] },
      ctx,
    );

    expect(state.title.length).toBeLessThanOrEqual(60);
    expect(state.teams[0]!.name.length).toBeLessThanOrEqual(32);
  });
});
