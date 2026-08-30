import { InvalidActionError, sanitizeText } from './scoreboard.js';
import type { Buzz } from './types.js';

export const MAX_BUZZER_NAME_LENGTH = 24;
/** Enough for a big room; stops a runaway client filling memory. */
export const MAX_BUZZES = 100;

/** A press decorated with its position and how far behind the leader it was. */
export interface RankedBuzz extends Buzz {
  place: number;
  /** Milliseconds after the first press. Zero for the winner. */
  behindMs: number;
}

export function sanitizeBuzzerName(raw: unknown): string {
  const name = typeof raw === 'string' ? sanitizeText(raw, MAX_BUZZER_NAME_LENGTH) : '';
  if (!name) throw new InvalidActionError('Type your name before buzzing.');
  return name;
}

/**
 * Order presses and work out the gap to the winner.
 *
 * The list is already in arrival order — the server appends as presses land, so
 * ordering never depends on client clocks, which are routinely seconds out.
 */
export function rankBuzzes(buzzes: readonly Buzz[]): RankedBuzz[] {
  const first = buzzes[0]?.at ?? 0;
  return buzzes.map((buzz, index) => ({
    ...buzz,
    place: index + 1,
    behindMs: Math.max(0, buzz.at - first),
  }));
}

/** "first", "+0.31s", "+1.2s" — how far behind the winner a press landed. */
export function formatBehind(behindMs: number): string {
  if (behindMs <= 0) return 'first';
  if (behindMs < 1000) return `+${(behindMs / 1000).toFixed(2)}s`;
  return `+${(behindMs / 1000).toFixed(1)}s`;
}

/**
 * Add a press, unless the buzzer is closed or this person already has one in.
 * Returns the new list, or null when the press should be ignored.
 */
export function addBuzz(
  buzzes: readonly Buzz[],
  buzz: Buzz,
  { open }: { open: boolean },
): Buzz[] | null {
  if (!open) return null;
  if (buzzes.length >= MAX_BUZZES) return null;
  if (buzzes.some((existing) => existing.buzzerId === buzz.buzzerId)) return null;
  return [...buzzes, buzz];
}
