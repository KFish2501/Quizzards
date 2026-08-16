import type { Player, RankedTeam, RoomState, Team } from './types.js';

/** Bounds for a single score adjustment, matching the custom-delta input. */
export const MIN_DELTA = -15;
export const MAX_DELTA = 30;

/** Quick-adjust buttons rendered on every team card, in display order. */
export const QUICK_DELTAS = [-5, -1, 1, 5, 10] as const;

export const MAX_TEAMS = 24;
export const MAX_PLAYERS = 300;
export const MAX_PLAYER_NAME_LENGTH = 40;
export const MAX_TEAM_NAME_LENGTH = 32;
export const MAX_TITLE_LENGTH = 60;
export const MAX_SUBTITLE_LENGTH = 80;
/** How many mutations deep `undo` can reach. */
export const MAX_HISTORY = 100;

export class InvalidActionError extends Error {
  override name = 'InvalidActionError';
}

/**
 * Validate a score adjustment. Deltas are integers within [MIN_DELTA, MAX_DELTA];
 * a zero delta is rejected so it never consumes an undo slot.
 */
export function parseDelta(raw: unknown): number {
  const delta = typeof raw === 'string' ? Number(raw.trim()) : raw;
  if (typeof delta !== 'number' || !Number.isInteger(delta)) {
    throw new InvalidActionError('Adjustment must be a whole number.');
  }
  if (delta === 0) {
    throw new InvalidActionError('Adjustment must not be zero.');
  }
  if (delta < MIN_DELTA || delta > MAX_DELTA) {
    throw new InvalidActionError(`Adjustment must be between ${MIN_DELTA} and ${MAX_DELTA}.`);
  }
  return delta;
}

/** Collapse whitespace and enforce a length cap on a user-supplied label. */
export function sanitizeText(raw: unknown, maxLength: number): string {
  if (typeof raw !== 'string') {
    throw new InvalidActionError('Expected a text value.');
  }
  return raw.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

/** The auto-generated subtitle for a board with `teamCount` teams. */
export function defaultSubtitle(teamCount: number): string {
  return `${teamCount}-team real-time leaderboard`;
}

/** The default name for the nth team (1-indexed), e.g. `Team 3`. */
export function defaultTeamName(index: number): string {
  return `Team ${index}`;
}

/**
 * Split a pasted list of names into clean entries.
 *
 * Hosts paste from anywhere — a signup sheet, a chat message, a spreadsheet
 * column — so newlines, commas, semicolons and tabs all count as separators.
 * Bullets, numeric prefixes and surrounding quotes are stripped, and names are
 * de-duplicated case-insensitively so a double paste doesn't double the roster.
 */
export function parseNameList(raw: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const chunk of raw.split(/[\n\r,;\t]+/)) {
    const name = chunk
      .replace(/^\s*(?:[-*•‣·]|\d+[.)])\s*/, '')
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_PLAYER_NAME_LENGTH);
    if (!name) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }

  return names;
}

/** Players assigned to a given team, in roster order. */
export function membersOf(players: readonly Player[], teamId: string): Player[] {
  return players.filter((player) => player.teamId === teamId);
}

/** Players who have not been put on a team yet. */
export function unassignedPlayers(players: readonly Player[]): Player[] {
  return players.filter((player) => player.teamId === null);
}

/**
 * Spread the given players across teams round-robin, starting with the
 * smallest squads so repeated auto-assigns keep team sizes level.
 */
export function distributeEvenly(
  playersToPlace: readonly Player[],
  teams: readonly Team[],
  currentCounts: ReadonlyMap<string, number>,
): Map<string, string> {
  const assignment = new Map<string, string>();
  if (teams.length === 0) return assignment;

  const counts = new Map(teams.map((team) => [team.id, currentCounts.get(team.id) ?? 0]));

  for (const player of playersToPlace) {
    let targetId = teams[0]!.id;
    for (const team of teams) {
      if ((counts.get(team.id) ?? 0) < (counts.get(targetId) ?? 0)) targetId = team.id;
    }
    assignment.set(player.id, targetId);
    counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
  }

  return assignment;
}

/**
 * Rank teams highest-first using competition ranking, so an all-square board
 * shows every team at #1. Ties are broken for display by original entry order,
 * which keeps card positions stable while scores are equal.
 */
export function rankTeams(teams: readonly Team[], players: readonly Player[] = []): RankedTeam[] {
  const byScoreDesc = teams
    .map((team, index) => ({ team, index }))
    .sort((a, b) => b.team.score - a.team.score || a.index - b.index);

  const rankById = new Map<string, number>();
  let previousScore: number | null = null;
  let previousRank = 0;

  byScoreDesc.forEach(({ team }, position) => {
    const rank = previousScore !== null && team.score === previousScore ? previousRank : position + 1;
    rankById.set(team.id, rank);
    previousScore = team.score;
    previousRank = rank;
  });

  return teams.map((team) => {
    const rank = rankById.get(team.id) ?? 1;
    return { ...team, rank, isLeader: rank === 1, members: membersOf(players, team.id) };
  });
}

/**
 * Ranked teams in the order they should be rendered: entry order by default,
 * or standings order when the board is sorted by score.
 */
export function displayOrder(state: RoomState): RankedTeam[] {
  const ranked = rankTeams(state.teams, state.players);
  if (!state.sortByScore) return ranked;
  const entryOrder = new Map(state.teams.map((team, index) => [team.id, index]));
  return [...ranked].sort(
    (a, b) => a.rank - b.rank || (entryOrder.get(a.id) ?? 0) - (entryOrder.get(b.id) ?? 0),
  );
}
