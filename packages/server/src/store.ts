import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Room, RoomManager } from './rooms.js';

/**
 * A quiz night should survive a server restart, so rooms are mirrored to a
 * single JSON file. Writes are debounced and atomic (write-temp-then-rename) so
 * a crash mid-save cannot leave a truncated file behind.
 */
export class RoomStore {
  readonly #file: string;
  readonly #debounceMs: number;
  #timer: NodeJS.Timeout | null = null;
  #pending: Map<string, Room> | null = null;
  #writing: Promise<void> = Promise.resolve();

  constructor(file: string, debounceMs = 400) {
    this.#file = resolve(file);
    this.#debounceMs = debounceMs;
  }

  /** Load previously saved rooms into a manager. Missing/corrupt files are ignored. */
  async load(manager: RoomManager): Promise<number> {
    let raw: string;
    try {
      raw = await readFile(this.#file, 'utf8');
    } catch {
      return 0;
    }

    try {
      const parsed = JSON.parse(raw) as { rooms?: Room[] };
      const rooms = Array.isArray(parsed.rooms) ? parsed.rooms : [];
      let restored = 0;
      for (const room of rooms) {
        if (!room?.state?.code || !room.hostToken) continue;
        manager.restore({
          ...room,
          // Snapshots written before the roster existed have no players field.
          state: { ...room.state, players: room.state.players ?? [] },
          // History is deliberately dropped: undo does not span restarts.
          history: [],
        });
        restored += 1;
      }
      return restored;
    } catch {
      console.warn(`[store] ignoring unreadable snapshot at ${this.#file}`);
      return 0;
    }
  }

  /** Queue a snapshot of all rooms. Safe to call on every mutation. */
  schedule(rooms: Map<string, Room>): void {
    this.#pending = rooms;
    if (this.#timer) return;
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.flush();
    }, this.#debounceMs);
    this.#timer.unref?.();
  }

  /** Write any queued snapshot immediately. */
  async flush(): Promise<void> {
    const rooms = this.#pending;
    this.#pending = null;
    if (!rooms) return await this.#writing;

    const payload = JSON.stringify(
      { version: 1, savedAt: Date.now(), rooms: [...rooms.values()].map(({ history: _h, ...r }) => r) },
      null,
      2,
    );

    this.#writing = this.#writing.then(async () => {
      const temp = `${this.#file}.${process.pid}.tmp`;
      try {
        await mkdir(dirname(this.#file), { recursive: true });
        await writeFile(temp, payload, 'utf8');
        await rename(temp, this.#file);
      } catch (error) {
        console.error('[store] failed to persist rooms:', error);
      }
    });

    return await this.#writing;
  }
}
