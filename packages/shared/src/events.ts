import type { BoardAction } from './actions.js';
import type { JoinResult, RoomState } from './types.js';

/** Wire shape for anything the server pushes to clients. */
export interface ServerToClientEvents {
  state: (payload: { state: RoomState; canUndo: boolean }) => void;
  /** A recoverable problem with the last request — surfaced as a toast. */
  actionError: (payload: { message: string }) => void;
  viewers: (payload: { count: number }) => void;
}

export interface ClientToServerEvents {
  join: (
    payload: { code: string; hostToken?: string; password?: string },
    ack: (result: { ok: true; data: JoinResult } | { ok: false; error: string }) => void,
  ) => void;
  action: (payload: { action: BoardAction }) => void;
  undo: () => void;
}

/** Room codes are lowercase words joined by single hyphens. */
export const ROOM_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_ROOM_CODE_LENGTH = 32;

export function normalizeRoomCode(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_ROOM_CODE_LENGTH)
    .replace(/-+$/g, '');
}

export function isValidRoomCode(code: string): boolean {
  return code.length > 0 && code.length <= MAX_ROOM_CODE_LENGTH && ROOM_CODE_PATTERN.test(code);
}
