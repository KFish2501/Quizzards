import { randomUUID } from 'node:crypto';
import {
  type BoardAction,
  InvalidActionError,
  MAX_HISTORY,
  type RoomState,
  type RoomSummary,
  applyAction,
  createRoomState,
  isUndoable,
} from '@quizzards/shared';

export interface Room {
  state: RoomState;
  /** Secret that grants control of this board. Never sent to viewers. */
  hostToken: string;
  /** Snapshots taken *before* each undoable mutation, most recent last. */
  history: RoomState[];
  createdAt: number;
}

export interface RoomManagerOptions {
  now?: () => number;
  newId?: () => string;
  /** Called whenever a room's state changes, for persistence. */
  onChange?: (room: Room) => void;
}

/**
 * Owns every live scoreboard. State is authoritative here — clients send
 * intents and render whatever comes back, so two hosts on two devices can drive
 * the same board without diverging.
 */
export class RoomManager {
  readonly #rooms = new Map<string, Room>();
  readonly #now: () => number;
  readonly #newId: () => string;
  readonly #onChange: (room: Room) => void;

  constructor(options: RoomManagerOptions = {}) {
    this.#now = options.now ?? (() => Date.now());
    this.#newId = options.newId ?? (() => randomUUID());
    this.#onChange = options.onChange ?? (() => {});
  }

  get #ctx() {
    return { now: this.#now(), newId: this.#newId };
  }

  has(code: string): boolean {
    return this.#rooms.has(code);
  }

  get(code: string): Room | undefined {
    return this.#rooms.get(code);
  }

  /** Live view of every room, keyed by code. Used by the persistence layer. */
  all(): Map<string, Room> {
    return this.#rooms;
  }

  list(): RoomSummary[] {
    return [...this.#rooms.values()]
      .map((room) => ({
        code: room.state.code,
        title: room.state.title,
        teamCount: room.state.teams.length,
        updatedAt: room.state.updatedAt,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** Create a room, or return the existing one if the code is already taken. */
  create(code: string, teamCount: number): Room {
    const existing = this.#rooms.get(code);
    if (existing) return existing;

    const room: Room = {
      state: createRoomState(code, teamCount, this.#ctx),
      hostToken: this.#newId(),
      history: [],
      createdAt: this.#now(),
    };
    this.#rooms.set(code, room);
    this.#onChange(room);
    return room;
  }

  /** Re-add a room recovered from disk, keeping its token and scores. */
  restore(room: Room): void {
    this.#rooms.set(room.state.code, room);
  }

  delete(code: string): boolean {
    return this.#rooms.delete(code);
  }

  isHost(code: string, token: string | undefined): boolean {
    const room = this.#rooms.get(code);
    return Boolean(room && token && token === room.hostToken);
  }

  canUndo(code: string): boolean {
    return (this.#rooms.get(code)?.history.length ?? 0) > 0;
  }

  /**
   * Apply an action to a room. Undoable actions push the prior state onto the
   * history stack first, so `undo` restores exactly what was on screen.
   */
  apply(code: string, action: BoardAction): RoomState {
    const room = this.#requireRoom(code);
    const previous = room.state;
    const next = applyAction(previous, action, this.#ctx);

    if (isUndoable(action)) {
      room.history.push(previous);
      if (room.history.length > MAX_HISTORY) room.history.shift();
    }

    room.state = next;
    this.#onChange(room);
    return next;
  }

  /** Step one mutation back. Sorting and the revision counter move forward. */
  undo(code: string): RoomState {
    const room = this.#requireRoom(code);
    const previous = room.history.pop();
    if (!previous) {
      throw new InvalidActionError('Nothing left to undo.');
    }

    room.state = {
      ...previous,
      // Keep the view preference the host is currently looking at.
      sortByScore: room.state.sortByScore,
      rev: room.state.rev + 1,
      updatedAt: this.#now(),
    };
    this.#onChange(room);
    return room.state;
  }

  #requireRoom(code: string): Room {
    const room = this.#rooms.get(code);
    if (!room) {
      throw new InvalidActionError('That room no longer exists.');
    }
    return room;
  }
}
