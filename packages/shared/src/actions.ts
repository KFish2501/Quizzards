import {
  InvalidActionError,
  MAX_PLAYER_NAME_LENGTH,
  MAX_PLAYERS,
  MAX_SUBTITLE_LENGTH,
  MAX_TEAM_NAME_LENGTH,
  MAX_TEAMS,
  MAX_TITLE_LENGTH,
  defaultSubtitle,
  defaultTeamName,
  distributeEvenly,
  parseDelta,
  parseNameList,
  sanitizeText,
} from './scoreboard.js';
import type { Player, RoomState } from './types.js';

/** Every mutation a controlling client can request. */
export type BoardAction =
  | { type: 'adjust'; teamId: string; delta: number }
  | { type: 'renameTeam'; teamId: string; name: string }
  | { type: 'setTitle'; title: string }
  | { type: 'setSubtitle'; subtitle: string }
  | { type: 'addTeam' }
  | { type: 'removeTeam'; teamId: string }
  | { type: 'resetScores' }
  | { type: 'toggleSort' }
  // --- roster ---
  | { type: 'addPlayers'; names: string; teamId?: string | null }
  | { type: 'renamePlayer'; playerId: string; name: string }
  | { type: 'removePlayer'; playerId: string }
  | { type: 'assignPlayer'; playerId: string; teamId: string | null }
  | { type: 'autoAssign'; includeAssigned?: boolean }
  | { type: 'unassignAll' }
  | { type: 'clearRoster' };

/** Actions that change scores or membership, and so are worth an undo entry. */
const UNDOABLE = new Set<BoardAction['type']>([
  'adjust',
  'renameTeam',
  'setTitle',
  'setSubtitle',
  'addTeam',
  'removeTeam',
  'resetScores',
  'addPlayers',
  'renamePlayer',
  'removePlayer',
  'assignPlayer',
  'autoAssign',
  'unassignAll',
  'clearRoster',
]);

export function isUndoable(action: BoardAction): boolean {
  return UNDOABLE.has(action.type);
}

function requireTeamIndex(state: RoomState, teamId: unknown): number {
  const index = state.teams.findIndex((team) => team.id === teamId);
  if (index === -1) {
    throw new InvalidActionError('That team is no longer on the board.');
  }
  return index;
}

/**
 * Apply an action to a board, returning a new state. Pure: the caller supplies
 * `now` and an id factory so the reducer stays deterministic under test.
 *
 * Throws {@link InvalidActionError} for input the caller should be told about
 * rather than silently ignored.
 */
export function applyAction(
  state: RoomState,
  action: BoardAction,
  ctx: { now: number; newId: () => string },
): RoomState {
  const next = ((): RoomState => {
    switch (action.type) {
      case 'adjust': {
        const index = requireTeamIndex(state, action.teamId);
        const delta = parseDelta(action.delta);
        const teams = state.teams.map((team, i) =>
          i === index ? { ...team, score: team.score + delta } : team,
        );
        return { ...state, teams };
      }

      case 'renameTeam': {
        const index = requireTeamIndex(state, action.teamId);
        const name = sanitizeText(action.name, MAX_TEAM_NAME_LENGTH) || defaultTeamName(index + 1);
        const teams = state.teams.map((team, i) => (i === index ? { ...team, name } : team));
        return { ...state, teams };
      }

      case 'setTitle': {
        const title = sanitizeText(action.title, MAX_TITLE_LENGTH) || 'Live Quiz Scoreboard';
        return { ...state, title };
      }

      case 'setSubtitle': {
        const subtitle = sanitizeText(action.subtitle, MAX_SUBTITLE_LENGTH);
        // Clearing the subtitle hands control back to the automatic one.
        return subtitle
          ? { ...state, subtitle, subtitleAuto: false }
          : { ...state, subtitle: defaultSubtitle(state.teams.length), subtitleAuto: true };
      }

      case 'addTeam': {
        if (state.teams.length >= MAX_TEAMS) {
          throw new InvalidActionError(`A board holds at most ${MAX_TEAMS} teams.`);
        }
        const team = { id: ctx.newId(), name: defaultTeamName(state.teams.length + 1), score: 0 };
        return { ...state, teams: [...state.teams, team] };
      }

      case 'removeTeam': {
        const index = requireTeamIndex(state, action.teamId);
        if (state.teams.length <= 1) {
          throw new InvalidActionError('A board needs at least one team.');
        }
        const removedId = state.teams[index]!.id;
        return {
          ...state,
          teams: state.teams.filter((_, i) => i !== index),
          // Its players go back to the unassigned pool rather than vanishing.
          players: state.players.map((player) =>
            player.teamId === removedId ? { ...player, teamId: null } : player,
          ),
        };
      }

      case 'resetScores':
        return { ...state, teams: state.teams.map((team) => ({ ...team, score: 0 })) };

      case 'toggleSort':
        return { ...state, sortByScore: !state.sortByScore };

      case 'addPlayers': {
        if (typeof action.names !== 'string') {
          throw new InvalidActionError('Expected a list of names.');
        }
        const teamId = action.teamId ?? null;
        if (teamId !== null) requireTeamIndex(state, teamId);

        // Names already on the roster are skipped rather than duplicated, so a
        // host can paste an updated list without cleaning it up first.
        const existing = new Set(state.players.map((player) => player.name.toLowerCase()));
        const additions: Player[] = [];
        for (const name of parseNameList(action.names)) {
          if (existing.has(name.toLowerCase())) continue;
          existing.add(name.toLowerCase());
          additions.push({ id: ctx.newId(), name, teamId });
        }

        if (additions.length === 0) {
          throw new InvalidActionError('No new names found in that list.');
        }
        if (state.players.length + additions.length > MAX_PLAYERS) {
          throw new InvalidActionError(`A roster holds at most ${MAX_PLAYERS} players.`);
        }
        return { ...state, players: [...state.players, ...additions] };
      }

      case 'renamePlayer': {
        const index = state.players.findIndex((player) => player.id === action.playerId);
        if (index === -1) throw new InvalidActionError('That player is no longer on the roster.');

        const name = sanitizeText(action.name, MAX_PLAYER_NAME_LENGTH);
        if (!name) throw new InvalidActionError('A player needs a name.');
        return {
          ...state,
          players: state.players.map((player, i) => (i === index ? { ...player, name } : player)),
        };
      }

      case 'removePlayer': {
        if (!state.players.some((player) => player.id === action.playerId)) {
          throw new InvalidActionError('That player is no longer on the roster.');
        }
        return { ...state, players: state.players.filter((p) => p.id !== action.playerId) };
      }

      case 'assignPlayer': {
        const index = state.players.findIndex((player) => player.id === action.playerId);
        if (index === -1) throw new InvalidActionError('That player is no longer on the roster.');
        if (action.teamId !== null) requireTeamIndex(state, action.teamId);

        return {
          ...state,
          players: state.players.map((player, i) =>
            i === index ? { ...player, teamId: action.teamId } : player,
          ),
        };
      }

      case 'autoAssign': {
        if (state.players.length === 0) {
          throw new InvalidActionError('Add some names to the roster first.');
        }
        const toPlace = action.includeAssigned
          ? state.players
          : state.players.filter((player) => player.teamId === null);
        if (toPlace.length === 0) {
          throw new InvalidActionError('Everyone is already on a team.');
        }

        const counts = new Map<string, number>();
        if (!action.includeAssigned) {
          for (const player of state.players) {
            if (player.teamId) counts.set(player.teamId, (counts.get(player.teamId) ?? 0) + 1);
          }
        }

        const assignment = distributeEvenly(toPlace, state.teams, counts);
        return {
          ...state,
          players: state.players.map((player) =>
            assignment.has(player.id) ? { ...player, teamId: assignment.get(player.id)! } : player,
          ),
        };
      }

      case 'unassignAll':
        return { ...state, players: state.players.map((player) => ({ ...player, teamId: null })) };

      case 'clearRoster':
        return { ...state, players: [] };

      default: {
        const exhaustive: never = action;
        throw new InvalidActionError(`Unknown action: ${JSON.stringify(exhaustive)}`);
      }
    }
  })();

  const subtitle = next.subtitleAuto ? defaultSubtitle(next.teams.length) : next.subtitle;
  return { ...next, subtitle, rev: state.rev + 1, updatedAt: ctx.now };
}

export function createRoomState(
  code: string,
  teamCount: number,
  ctx: { now: number; newId: () => string },
): RoomState {
  const size = Math.min(Math.max(Math.trunc(teamCount) || 0, 1), MAX_TEAMS);
  return {
    code,
    title: 'Live Quiz Scoreboard',
    subtitle: defaultSubtitle(size),
    subtitleAuto: true,
    teams: Array.from({ length: size }, (_, i) => ({
      id: ctx.newId(),
      name: defaultTeamName(i + 1),
      score: 0,
    })),
    players: [],
    sortByScore: false,
    rev: 0,
    updatedAt: ctx.now,
  };
}
