import { describe, expect, it } from 'vitest';
import { InvalidActionError } from '@quizzards/shared';
import { RoomManager } from './rooms.js';

function makeManager() {
  let id = 0;
  let clock = 1_700_000_000_000;
  return new RoomManager({
    newId: () => `id-${++id}`,
    now: () => (clock += 1000),
  });
}

describe('RoomManager', () => {
  it('creates a room with a host token and the requested team count', () => {
    const rooms = makeManager();
    const room = rooms.create('quiz-night', 5);

    expect(room.state.teams).toHaveLength(5);
    expect(room.hostToken).toBeTruthy();
    expect(rooms.has('quiz-night')).toBe(true);
  });

  it('returns the existing room when a code is reused, preserving scores', () => {
    const rooms = makeManager();
    const first = rooms.create('quiz-night', 5);
    rooms.apply('quiz-night', { type: 'adjust', teamId: first.state.teams[0]!.id, delta: 10 });

    const second = rooms.create('quiz-night', 3);
    expect(second.hostToken).toBe(first.hostToken);
    expect(second.state.teams).toHaveLength(5);
    expect(second.state.teams[0]!.score).toBe(10);
  });

  it('only grants control to the exact host token', () => {
    const rooms = makeManager();
    const room = rooms.create('quiz-night', 2);

    expect(rooms.isHost('quiz-night', room.hostToken)).toBe(true);
    expect(rooms.isHost('quiz-night', 'guess')).toBe(false);
    expect(rooms.isHost('quiz-night', undefined)).toBe(false);
    expect(rooms.isHost('other-room', room.hostToken)).toBe(false);
  });

  it('undoes the most recent adjustment', () => {
    const rooms = makeManager();
    const room = rooms.create('quiz-night', 3);
    const id = room.state.teams[0]!.id;

    rooms.apply('quiz-night', { type: 'adjust', teamId: id, delta: 10 });
    rooms.apply('quiz-night', { type: 'adjust', teamId: id, delta: 5 });
    expect(rooms.get('quiz-night')!.state.teams[0]!.score).toBe(15);

    rooms.undo('quiz-night');
    expect(rooms.get('quiz-night')!.state.teams[0]!.score).toBe(10);
    rooms.undo('quiz-night');
    expect(rooms.get('quiz-night')!.state.teams[0]!.score).toBe(0);
  });

  it('can undo a reset, restoring every score at once', () => {
    const rooms = makeManager();
    const room = rooms.create('quiz-night', 3);
    const [a, b] = room.state.teams;

    rooms.apply('quiz-night', { type: 'adjust', teamId: a!.id, delta: 10 });
    rooms.apply('quiz-night', { type: 'adjust', teamId: b!.id, delta: -5 });
    rooms.apply('quiz-night', { type: 'resetScores' });
    expect(rooms.get('quiz-night')!.state.teams.map((t) => t.score)).toEqual([0, 0, 0]);

    rooms.undo('quiz-night');
    expect(rooms.get('quiz-night')!.state.teams.map((t) => t.score)).toEqual([10, -5, 0]);
  });

  it('reports whether undo is available and refuses when the stack is empty', () => {
    const rooms = makeManager();
    const room = rooms.create('quiz-night', 2);

    expect(rooms.canUndo('quiz-night')).toBe(false);
    expect(() => rooms.undo('quiz-night')).toThrow(InvalidActionError);

    rooms.apply('quiz-night', { type: 'adjust', teamId: room.state.teams[0]!.id, delta: 1 });
    expect(rooms.canUndo('quiz-night')).toBe(true);
  });

  it('does not record sort toggles in the undo history', () => {
    const rooms = makeManager();
    rooms.create('quiz-night', 2);

    rooms.apply('quiz-night', { type: 'toggleSort' });
    expect(rooms.canUndo('quiz-night')).toBe(false);
  });

  it('keeps the current sort preference when undoing', () => {
    const rooms = makeManager();
    const room = rooms.create('quiz-night', 2);

    rooms.apply('quiz-night', { type: 'adjust', teamId: room.state.teams[0]!.id, delta: 5 });
    rooms.apply('quiz-night', { type: 'toggleSort' });
    rooms.undo('quiz-night');

    expect(rooms.get('quiz-night')!.state.sortByScore).toBe(true);
    expect(rooms.get('quiz-night')!.state.teams[0]!.score).toBe(0);
  });

  it('advances the revision on every change so clients can drop stale frames', () => {
    const rooms = makeManager();
    const room = rooms.create('quiz-night', 2);
    const id = room.state.teams[0]!.id;

    const start = room.state.rev;
    rooms.apply('quiz-night', { type: 'adjust', teamId: id, delta: 1 });
    rooms.apply('quiz-night', { type: 'toggleSort' });
    rooms.undo('quiz-night');

    expect(rooms.get('quiz-night')!.state.rev).toBe(start + 3);
  });

  it('notifies the change listener on create, apply and undo', () => {
    let changes = 0;
    const rooms = new RoomManager({ onChange: () => (changes += 1) });
    const room = rooms.create('quiz-night', 2);

    rooms.apply('quiz-night', { type: 'adjust', teamId: room.state.teams[0]!.id, delta: 1 });
    rooms.undo('quiz-night');

    expect(changes).toBe(3);
  });

  it('rejects actions against an unknown room', () => {
    const rooms = makeManager();
    expect(() => rooms.apply('ghost', { type: 'resetScores' })).toThrow(InvalidActionError);
  });

  it('lists rooms most-recently-updated first', () => {
    const rooms = makeManager();
    rooms.create('first-room', 2);
    rooms.create('second-room', 2);
    rooms.apply('first-room', { type: 'resetScores' });

    expect(rooms.list().map((r) => r.code)).toEqual(['first-room', 'second-room']);
  });
});
