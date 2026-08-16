import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  BoardAction,
  ClientToServerEvents,
  RoomState,
  ServerToClientEvents,
} from '@quizzards/shared';

type BoardSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting' | 'error';

export interface RoomConnection {
  state: RoomState | null;
  status: ConnectionStatus;
  canControl: boolean;
  canUndo: boolean;
  viewers: number;
  error: string | null;
  dispatch: (action: BoardAction) => void;
  undo: () => void;
  dismissError: () => void;
}

const HOST_TOKEN_PREFIX = 'quizzards:host:';

export function readHostToken(code: string): string | undefined {
  try {
    return localStorage.getItem(HOST_TOKEN_PREFIX + code) ?? undefined;
  } catch {
    return undefined;
  }
}

export function saveHostToken(code: string, token: string): void {
  try {
    localStorage.setItem(HOST_TOKEN_PREFIX + code, token);
  } catch {
    /* private browsing — the board still works, just read-only after a reload */
  }
}

/**
 * Subscribe to a room over websockets.
 *
 * The server is authoritative: every action is sent as an intent and the board
 * only re-renders when the server echoes new state back. That keeps two hosts
 * (say a laptop and a phone) from drifting apart, at the cost of one round trip
 * per tap — imperceptible on a LAN and worth it for a shared scoreboard.
 */
export function useRoom(code: string | null, asViewer: boolean): RoomConnection {
  const [state, setState] = useState<RoomState | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [canControl, setCanControl] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [viewers, setViewers] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<BoardSocket | null>(null);
  /** Guards against out-of-order frames on a flaky connection. */
  const revRef = useRef(-1);

  useEffect(() => {
    if (!code) return;

    const socket: BoardSocket = io({ transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    revRef.current = -1;

    const join = () => {
      const hostToken = asViewer ? undefined : readHostToken(code);
      socket.emit('join', { code, hostToken }, (result) => {
        if (!result.ok) {
          setStatus('error');
          setError(result.error);
          return;
        }
        revRef.current = result.data.state.rev;
        setState(result.data.state);
        setCanControl(result.data.canControl);
        setCanUndo(result.data.canUndo);
        setStatus('live');
        setError(null);
      });
    };

    socket.on('connect', join);
    socket.on('disconnect', () => setStatus('reconnecting'));
    socket.on('connect_error', () => setStatus('reconnecting'));

    socket.on('state', ({ state: next, canUndo: undoable }) => {
      if (next.rev < revRef.current) return; // stale frame, ignore
      revRef.current = next.rev;
      setState(next);
      setCanUndo(undoable);
    });

    socket.on('viewers', ({ count }) => setViewers(count));
    socket.on('actionError', ({ message }) => setError(message));

    return () => {
      socket.removeAllListeners();
      socket.close();
      socketRef.current = null;
    };
  }, [code, asViewer]);

  const dispatch = useCallback((action: BoardAction) => {
    socketRef.current?.emit('action', { action });
  }, []);

  const undo = useCallback(() => {
    socketRef.current?.emit('undo');
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  return useMemo(
    () => ({ state, status, canControl, canUndo, viewers, error, dispatch, undo, dismissError }),
    [state, status, canControl, canUndo, viewers, error, dispatch, undo, dismissError],
  );
}
