import {
  MAX_PLAYER_NAME_LENGTH,
  MAX_PLAYERS,
  MAX_SUBTITLE_LENGTH,
  MAX_TEAM_NAME_LENGTH,
  MAX_TEAMS,
  MAX_TITLE_LENGTH,
  defaultSubtitle,
  defaultTeamName,
  sanitizeText,
} from './scoreboard.js';
import type { Player, RoomState, Team } from './types.js';

/** Scores are clamped to something a quiz could plausibly reach. */
export const MAX_ABS_SCORE = 100_000;

/**
 * Rebuild a board from a snapshot that came from a browser.
 *
 * Free cloud hosting has no persistent disk, so a restart can lose the server's
 * copy of a room. The host's browser keeps a backup and can push it back — but
 * that backup arrives over the network from a client, so nothing in it is
 * trusted. Every field is re-derived here: unknown keys are dropped, text is
 * sanitized and capped, scores are clamped to integers, and player assignments
 * that don't point at a surviving team fall back to unassigned.
 */
export function restoreRoomState(
  code: string,
  input: unknown,
  ctx: { now: number; newId: () => string },
): RoomState {
  const raw = (input ?? {}) as Record<string, unknown>;

  const teams = normalizeTeams(raw.teams, ctx);
  const teamIds = new Set(teams.map((team) => team.id));
  const players = normalizePlayers(raw.players, teamIds, ctx);

  const title = safeText(raw.title, MAX_TITLE_LENGTH) || 'Live Quiz Scoreboard';
  const customSubtitle = safeText(raw.subtitle, MAX_SUBTITLE_LENGTH);
  const subtitleAuto = raw.subtitleAuto !== false || !customSubtitle;

  return {
    code,
    title,
    subtitle: subtitleAuto ? defaultSubtitle(teams.length) : customSubtitle,
    subtitleAuto,
    teams,
    players,
    sortByScore: raw.sortByScore === true,
    rev: 0,
    updatedAt: ctx.now,
  };
}

function safeText(value: unknown, max: number): string {
  return typeof value === 'string' ? sanitizeText(value, max) : '';
}

function normalizeTeams(value: unknown, ctx: { newId: () => string }): Team[] {
  const list = Array.isArray(value) ? value.slice(0, MAX_TEAMS) : [];
  const teams: Team[] = [];
  const usedIds = new Set<string>();

  list.forEach((entry, index) => {
    const team = (entry ?? {}) as Record<string, unknown>;
    // Reuse the snapshot's id when it's usable so player links survive, but
    // never trust it to be unique or even a string.
    const id =
      typeof team.id === 'string' && team.id.length > 0 && team.id.length <= 64 && !usedIds.has(team.id)
        ? team.id
        : ctx.newId();
    usedIds.add(id);

    teams.push({
      id,
      name: safeText(team.name, MAX_TEAM_NAME_LENGTH) || defaultTeamName(index + 1),
      score: clampScore(team.score),
    });
  });

  // A board always has at least one team to score against.
  if (teams.length === 0) {
    teams.push({ id: ctx.newId(), name: defaultTeamName(1), score: 0 });
  }
  return teams;
}

function normalizePlayers(
  value: unknown,
  teamIds: ReadonlySet<string>,
  ctx: { newId: () => string },
): Player[] {
  const list = Array.isArray(value) ? value.slice(0, MAX_PLAYERS) : [];
  const players: Player[] = [];
  const usedIds = new Set<string>();

  for (const entry of list) {
    const player = (entry ?? {}) as Record<string, unknown>;
    const name = safeText(player.name, MAX_PLAYER_NAME_LENGTH);
    if (!name) continue; // a nameless player is just noise on the roster

    const id =
      typeof player.id === 'string' &&
      player.id.length > 0 &&
      player.id.length <= 64 &&
      !usedIds.has(player.id)
        ? player.id
        : ctx.newId();
    usedIds.add(id);

    const teamId = typeof player.teamId === 'string' && teamIds.has(player.teamId) ? player.teamId : null;
    players.push({ id, name, teamId });
  }

  return players;
}

function clampScore(value: unknown): number {
  const score = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(-MAX_ABS_SCORE, Math.min(MAX_ABS_SCORE, Math.trunc(score)));
}
