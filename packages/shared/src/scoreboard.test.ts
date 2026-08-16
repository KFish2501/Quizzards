import { describe, expect, it } from 'vitest';
import { applyAction, createRoomState } from './actions.js';
import {
  InvalidActionError,
  MAX_TEAMS,
  defaultSubtitle,
  displayOrder,
  parseDelta,
  rankTeams,
  sanitizeText,
} from './scoreboard.js';
import { isValidRoomCode, normalizeRoomCode } from './events.js';
import type { Team } from './types.js';

let idCounter = 0;
const ctx = { now: 1_700_000_000_000, newId: () => `t${++idCounter}` };

function team(id: string, name: string, score: number): Team {
  return { id, name, score };
}

describe('rankTeams', () => {
  it('gives every team rank 1 when all scores are level', () => {
    const ranked = rankTeams([team('a', 'A', 0), team('b', 'B', 0), team('c', 'C', 0)]);
    expect(ranked.map((t) => t.rank)).toEqual([1, 1, 1]);
    expect(ranked.every((t) => t.isLeader)).toBe(true);
  });

  it('ranks highest score first and handles negatives', () => {
    const ranked = rankTeams([
      team('kyle', 'Kyle', 9),
      team('od', 'OD', 25),
      team('godse', 'Godse', -5),
      team('ner', 'Ner', 12),
      team('amol', 'Amol', -6),
    ]);
    const byId = Object.fromEntries(ranked.map((t) => [t.id, t.rank]));
    expect(byId).toEqual({ od: 1, ner: 2, kyle: 3, godse: 4, amol: 5 });
    expect(ranked.filter((t) => t.isLeader).map((t) => t.id)).toEqual(['od']);
  });

  it('uses competition ranking, skipping ranks after a tie', () => {
    const ranked = rankTeams([
      team('a', 'A', 10),
      team('b', 'B', 10),
      team('c', 'C', 5),
      team('d', 'D', 1),
    ]);
    expect(ranked.map((t) => t.rank)).toEqual([1, 1, 3, 4]);
  });

  it('preserves the input order of the returned array', () => {
    const ranked = rankTeams([team('a', 'A', 1), team('b', 'B', 99)]);
    expect(ranked.map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('displayOrder', () => {
  const base = { ...createRoomState('quiz-night', 0, ctx), teams: [] };
  const state = {
    ...base,
    teams: [team('a', 'A', 1), team('b', 'B', 50), team('c', 'C', 20)],
  };

  it('keeps entry order when sorting is off', () => {
    expect(displayOrder({ ...state, sortByScore: false }).map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('orders by standing when sorting is on', () => {
    expect(displayOrder({ ...state, sortByScore: true }).map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });

  it('breaks ties by entry order so tied cards do not shuffle', () => {
    const tied = { ...state, sortByScore: true, teams: [team('a', 'A', 5), team('b', 'B', 5)] };
    expect(displayOrder(tied).map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('parseDelta', () => {
  it('accepts the quick-adjust values and in-range custom deltas', () => {
    for (const delta of [-15, -5, -1, 1, 5, 10, 30]) {
      expect(parseDelta(delta)).toBe(delta);
    }
  });

  it('accepts numeric strings from the custom input', () => {
    expect(parseDelta(' 7 ')).toBe(7);
    expect(parseDelta('-3')).toBe(-3);
  });

  it.each([0, -16, 31, 1.5, NaN, 'abc', null, undefined])('rejects %p', (value) => {
    expect(() => parseDelta(value)).toThrow(InvalidActionError);
  });
});

describe('sanitizeText', () => {
  it('collapses whitespace and trims', () => {
    expect(sanitizeText('  Team   Rocket  ', 32)).toBe('Team Rocket');
  });

  it('truncates to the cap', () => {
    expect(sanitizeText('x'.repeat(50), 10)).toHaveLength(10);
  });
});

describe('applyAction', () => {
  it('adjusts a single score and bumps the revision', () => {
    const state = createRoomState('quiz-night', 5, ctx);
    const firstId = state.teams[0]!.id;
    const next = applyAction(state, { type: 'adjust', teamId: firstId, delta: 10 }, ctx);

    expect(next.teams[0]!.score).toBe(10);
    expect(next.teams.slice(1).every((t) => t.score === 0)).toBe(true);
    expect(next.rev).toBe(state.rev + 1);
    expect(state.teams[0]!.score).toBe(0); // input untouched
  });

  it('accumulates repeated adjustments, including into negatives', () => {
    let state = createRoomState('quiz-night', 2, ctx);
    const id = state.teams[0]!.id;
    for (const delta of [10, -5, -5, -1]) {
      state = applyAction(state, { type: 'adjust', teamId: id, delta }, ctx);
    }
    expect(state.teams[0]!.score).toBe(-1);
  });

  it('rejects adjustments for a team that has been removed', () => {
    const state = createRoomState('quiz-night', 2, ctx);
    expect(() => applyAction(state, { type: 'adjust', teamId: 'ghost', delta: 1 }, ctx)).toThrow(
      InvalidActionError,
    );
  });

  it('renames a team and falls back to the default name when cleared', () => {
    const state = createRoomState('quiz-night', 3, ctx);
    const id = state.teams[1]!.id;
    expect(applyAction(state, { type: 'renameTeam', teamId: id, name: ' OD ' }, ctx).teams[1]!.name)
      .toBe('OD');
    expect(applyAction(state, { type: 'renameTeam', teamId: id, name: '   ' }, ctx).teams[1]!.name)
      .toBe('Team 2');
  });

  it('keeps the subtitle in step with the team count while it is automatic', () => {
    let state = createRoomState('quiz-night', 5, ctx);
    expect(state.subtitle).toBe(defaultSubtitle(5));

    state = applyAction(state, { type: 'addTeam' }, ctx);
    expect(state.teams).toHaveLength(6);
    expect(state.subtitle).toBe(defaultSubtitle(6));

    state = applyAction(state, { type: 'setSubtitle', subtitle: 'Round 3 of 5' }, ctx);
    state = applyAction(state, { type: 'addTeam' }, ctx);
    expect(state.subtitle).toBe('Round 3 of 5'); // pinned by hand, no longer auto
  });

  it('restores the automatic subtitle when the custom one is cleared', () => {
    let state = createRoomState('quiz-night', 4, ctx);
    state = applyAction(state, { type: 'setSubtitle', subtitle: 'Finals' }, ctx);
    state = applyAction(state, { type: 'setSubtitle', subtitle: '' }, ctx);
    expect(state.subtitleAuto).toBe(true);
    expect(state.subtitle).toBe(defaultSubtitle(4));
  });

  it('resets every score to zero but keeps names', () => {
    let state = createRoomState('quiz-night', 3, ctx);
    state = applyAction(state, { type: 'renameTeam', teamId: state.teams[0]!.id, name: 'Kyle' }, ctx);
    state = applyAction(state, { type: 'adjust', teamId: state.teams[0]!.id, delta: 10 }, ctx);
    state = applyAction(state, { type: 'resetScores' }, ctx);

    expect(state.teams.map((t) => t.score)).toEqual([0, 0, 0]);
    expect(state.teams[0]!.name).toBe('Kyle');
  });

  it('toggles sorting', () => {
    const state = createRoomState('quiz-night', 2, ctx);
    expect(applyAction(state, { type: 'toggleSort' }, ctx).sortByScore).toBe(true);
  });

  it('refuses to remove the last team', () => {
    const state = createRoomState('quiz-night', 1, ctx);
    expect(() =>
      applyAction(state, { type: 'removeTeam', teamId: state.teams[0]!.id }, ctx),
    ).toThrow(InvalidActionError);
  });

  it('caps the number of teams', () => {
    const state = createRoomState('quiz-night', MAX_TEAMS, ctx);
    expect(() => applyAction(state, { type: 'addTeam' }, ctx)).toThrow(InvalidActionError);
  });
});

describe('createRoomState', () => {
  it('clamps the requested team count into range', () => {
    expect(createRoomState('a', 0, ctx).teams).toHaveLength(1);
    expect(createRoomState('a', 999, ctx).teams).toHaveLength(MAX_TEAMS);
  });

  it('names teams Team 1..n and starts everyone on zero', () => {
    const state = createRoomState('quiz-night', 5, ctx);
    expect(state.teams.map((t) => t.name)).toEqual(['Team 1', 'Team 2', 'Team 3', 'Team 4', 'Team 5']);
    expect(state.teams.every((t) => t.score === 0)).toBe(true);
    expect(state.title).toBe('Live Quiz Scoreboard');
  });
});

describe('room codes', () => {
  it('normalizes free text into a slug', () => {
    expect(normalizeRoomCode('  Quiz Night!  ')).toBe('quiz-night');
    expect(normalizeRoomCode('Pub__Quiz  2026')).toBe('pub-quiz-2026');
  });

  it('produces codes that pass validation', () => {
    expect(isValidRoomCode(normalizeRoomCode('Quiz Night'))).toBe(true);
    expect(isValidRoomCode('')).toBe(false);
    expect(isValidRoomCode('-bad-')).toBe(false);
    expect(isValidRoomCode('Bad Code')).toBe(false);
  });
});
