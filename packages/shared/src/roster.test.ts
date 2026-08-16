import { describe, expect, it } from 'vitest';
import { applyAction, createRoomState } from './actions.js';
import {
  InvalidActionError,
  MAX_PLAYER_NAME_LENGTH,
  membersOf,
  parseNameList,
  rankTeams,
  unassignedPlayers,
} from './scoreboard.js';
import type { RoomState } from './types.js';

let idCounter = 0;
const ctx = { now: 1_700_000_000_000, newId: () => `p${++idCounter}` };

function board(teams = 3): RoomState {
  return createRoomState('quiz-night', teams, ctx);
}

/** Team sizes in team order — the thing auto-assign is supposed to level out. */
function sizes(state: RoomState): number[] {
  return state.teams.map((team) => membersOf(state.players, team.id).length);
}

describe('parseNameList', () => {
  it('splits on newlines', () => {
    expect(parseNameList('Kyle\nOD\nGodse\nNer\nAmol')).toEqual(['Kyle', 'OD', 'Godse', 'Ner', 'Amol']);
  });

  it('splits on commas, semicolons and tabs', () => {
    expect(parseNameList('Kyle, OD; Godse\tNer')).toEqual(['Kyle', 'OD', 'Godse', 'Ner']);
  });

  it('strips bullets, numbering and stray quotes', () => {
    expect(parseNameList('- Kyle\n* OD\n3. Godse\n4) Ner\n"Amol"')).toEqual([
      'Kyle',
      'OD',
      'Godse',
      'Ner',
      'Amol',
    ]);
  });

  it('collapses internal whitespace and drops blank lines', () => {
    expect(parseNameList('  Mary   Jane  \n\n\n   \nBob  ')).toEqual(['Mary Jane', 'Bob']);
  });

  it('de-duplicates case-insensitively, keeping the first spelling', () => {
    expect(parseNameList('Kyle\nKYLE\nkyle\nOD')).toEqual(['Kyle', 'OD']);
  });

  it('truncates very long names', () => {
    const [name] = parseNameList('x'.repeat(120));
    expect(name).toHaveLength(MAX_PLAYER_NAME_LENGTH);
  });

  it('returns nothing for empty or separator-only input', () => {
    expect(parseNameList('')).toEqual([]);
    expect(parseNameList(' , ; \n\t ')).toEqual([]);
  });
});

describe('addPlayers', () => {
  it('adds a pasted list to the unassigned pool', () => {
    const state = applyAction(board(), { type: 'addPlayers', names: 'Kyle\nOD\nGodse' }, ctx);

    expect(state.players.map((p) => p.name)).toEqual(['Kyle', 'OD', 'Godse']);
    expect(unassignedPlayers(state.players)).toHaveLength(3);
  });

  it('can add a list straight onto one team', () => {
    const start = board();
    const teamId = start.teams[1]!.id;
    const state = applyAction(start, { type: 'addPlayers', names: 'Kyle, OD', teamId }, ctx);

    expect(membersOf(state.players, teamId).map((p) => p.name)).toEqual(['Kyle', 'OD']);
  });

  it('skips names already on the roster instead of duplicating them', () => {
    let state = applyAction(board(), { type: 'addPlayers', names: 'Kyle\nOD' }, ctx);
    state = applyAction(state, { type: 'addPlayers', names: 'kyle\nOD\nNer' }, ctx);

    expect(state.players.map((p) => p.name)).toEqual(['Kyle', 'OD', 'Ner']);
  });

  it('rejects a list with nothing new in it', () => {
    const state = applyAction(board(), { type: 'addPlayers', names: 'Kyle' }, ctx);
    expect(() => applyAction(state, { type: 'addPlayers', names: 'Kyle' }, ctx)).toThrow(
      InvalidActionError,
    );
    expect(() => applyAction(state, { type: 'addPlayers', names: '   ' }, ctx)).toThrow(
      InvalidActionError,
    );
  });

  it('rejects an unknown target team', () => {
    expect(() =>
      applyAction(board(), { type: 'addPlayers', names: 'Kyle', teamId: 'ghost' }, ctx),
    ).toThrow(InvalidActionError);
  });
});

describe('assignPlayer', () => {
  it('moves a player between teams and back to unassigned', () => {
    let state = applyAction(board(), { type: 'addPlayers', names: 'Kyle' }, ctx);
    const playerId = state.players[0]!.id;
    const [teamA, teamB] = state.teams;

    state = applyAction(state, { type: 'assignPlayer', playerId, teamId: teamA!.id }, ctx);
    expect(membersOf(state.players, teamA!.id)).toHaveLength(1);

    state = applyAction(state, { type: 'assignPlayer', playerId, teamId: teamB!.id }, ctx);
    expect(membersOf(state.players, teamA!.id)).toHaveLength(0);
    expect(membersOf(state.players, teamB!.id)).toHaveLength(1);

    state = applyAction(state, { type: 'assignPlayer', playerId, teamId: null }, ctx);
    expect(unassignedPlayers(state.players)).toHaveLength(1);
  });

  it('rejects unknown players and unknown teams', () => {
    const state = applyAction(board(), { type: 'addPlayers', names: 'Kyle' }, ctx);
    const playerId = state.players[0]!.id;

    expect(() => applyAction(state, { type: 'assignPlayer', playerId: 'ghost', teamId: null }, ctx))
      .toThrow(InvalidActionError);
    expect(() => applyAction(state, { type: 'assignPlayer', playerId, teamId: 'ghost' }, ctx))
      .toThrow(InvalidActionError);
  });
});

describe('autoAssign', () => {
  it('spreads players evenly across the teams', () => {
    let state = applyAction(board(3), { type: 'addPlayers', names: 'a,b,c,d,e,f' }, ctx);
    state = applyAction(state, { type: 'autoAssign' }, ctx);

    expect(sizes(state)).toEqual([2, 2, 2]);
    expect(unassignedPlayers(state.players)).toHaveLength(0);
  });

  it('distributes a remainder without leaving a team two behind', () => {
    let state = applyAction(board(3), { type: 'addPlayers', names: 'a,b,c,d,e,f,g,h' }, ctx);
    state = applyAction(state, { type: 'autoAssign' }, ctx);

    expect(sizes(state).sort()).toEqual([2, 3, 3]);
  });

  it('only fills the gaps when some players are already placed', () => {
    let state = applyAction(board(3), { type: 'addPlayers', names: 'a,b,c,d' }, ctx);
    const firstTeam = state.teams[0]!.id;
    // Stack three players onto team 1 by hand.
    for (const player of state.players.slice(0, 3)) {
      state = applyAction(state, { type: 'assignPlayer', playerId: player.id, teamId: firstTeam }, ctx);
    }
    state = applyAction(state, { type: 'autoAssign' }, ctx);

    // The lone remaining player fills an empty team rather than the full one.
    expect(sizes(state)).toEqual([3, 1, 0]);
  });

  it('levels everyone out when redistributing all', () => {
    let state = applyAction(board(3), { type: 'addPlayers', names: 'a,b,c,d,e,f' }, ctx);
    const firstTeam = state.teams[0]!.id;
    for (const player of state.players) {
      state = applyAction(state, { type: 'assignPlayer', playerId: player.id, teamId: firstTeam }, ctx);
    }
    expect(sizes(state)).toEqual([6, 0, 0]);

    state = applyAction(state, { type: 'autoAssign', includeAssigned: true }, ctx);
    expect(sizes(state)).toEqual([2, 2, 2]);
  });

  it('refuses when the roster is empty or everyone is already placed', () => {
    const empty = board();
    expect(() => applyAction(empty, { type: 'autoAssign' }, ctx)).toThrow(InvalidActionError);

    let state = applyAction(empty, { type: 'addPlayers', names: 'a,b' }, ctx);
    state = applyAction(state, { type: 'autoAssign' }, ctx);
    expect(() => applyAction(state, { type: 'autoAssign' }, ctx)).toThrow(InvalidActionError);
  });
});

describe('roster upkeep', () => {
  it('returns players to the pool when their team is removed', () => {
    let state = applyAction(board(3), { type: 'addPlayers', names: 'a,b,c' }, ctx);
    state = applyAction(state, { type: 'autoAssign' }, ctx);
    const doomed = state.teams[1]!.id;

    state = applyAction(state, { type: 'removeTeam', teamId: doomed }, ctx);
    expect(state.teams).toHaveLength(2);
    expect(state.players).toHaveLength(3);
    expect(unassignedPlayers(state.players)).toHaveLength(1);
  });

  it('renames and removes individual players', () => {
    let state = applyAction(board(), { type: 'addPlayers', names: 'Kyle' }, ctx);
    const playerId = state.players[0]!.id;

    state = applyAction(state, { type: 'renamePlayer', playerId, name: '  Kyle F  ' }, ctx);
    expect(state.players[0]!.name).toBe('Kyle F');

    expect(() => applyAction(state, { type: 'renamePlayer', playerId, name: ' ' }, ctx)).toThrow(
      InvalidActionError,
    );

    state = applyAction(state, { type: 'removePlayer', playerId }, ctx);
    expect(state.players).toHaveLength(0);
  });

  it('unassigns everyone and clears the roster', () => {
    let state = applyAction(board(2), { type: 'addPlayers', names: 'a,b,c,d' }, ctx);
    state = applyAction(state, { type: 'autoAssign' }, ctx);

    state = applyAction(state, { type: 'unassignAll' }, ctx);
    expect(unassignedPlayers(state.players)).toHaveLength(4);

    state = applyAction(state, { type: 'clearRoster' }, ctx);
    expect(state.players).toEqual([]);
  });

  it('keeps scores untouched when the roster changes', () => {
    let state = board(2);
    const teamId = state.teams[0]!.id;

    state = applyAction(state, { type: 'adjust', teamId, delta: 5 }, ctx);
    state = applyAction(state, { type: 'addPlayers', names: 'a,b' }, ctx);
    state = applyAction(state, { type: 'autoAssign' }, ctx);

    expect(state.teams[0]!.score).toBe(5);
  });
});

describe('rankTeams with a roster', () => {
  it('attaches each team its members', () => {
    let state = applyAction(board(2), { type: 'addPlayers', names: 'a,b,c,d' }, ctx);
    state = applyAction(state, { type: 'autoAssign' }, ctx);

    const ranked = rankTeams(state.teams, state.players);
    expect(ranked.map((t) => t.members.length)).toEqual([2, 2]);
  });

  it('reports no members when no roster is supplied', () => {
    expect(rankTeams(board(2).teams).every((t) => t.members.length === 0)).toBe(true);
  });
});
