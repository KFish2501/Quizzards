import { useMemo, useState } from 'react';
import type { RoomState } from '@quizzards/shared';
import { clearBackup, readBackup, saveHostToken } from '../useRoom.js';

interface RestoreBoardProps {
  code: string;
  onRestored: () => void;
}

/**
 * Offered when a board can't be found but this browser has a backup of it —
 * typically after the free cloud service restarted and lost its copy. Puts the
 * teams, scores and roster back in one go rather than retyping them.
 */
export function RestoreBoard({ code, onRestored }: RestoreBoardProps) {
  const backup = useMemo<RoomState | null>(() => readBackup(code), [code]);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!backup) return null;

  const restore = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, password, restore: backup }),
      });
      const data = (await response.json()) as { hostToken?: string; error?: string };
      if (!response.ok || !data.hostToken) throw new Error(data.error ?? 'Could not restore.');

      saveHostToken(code, data.hostToken);
      onRestored();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not restore.');
    } finally {
      setBusy(false);
    }
  };

  const when = new Date(backup.updatedAt).toLocaleString();
  const teamCount = backup.teams.length;

  return (
    <form
      className="restore"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy) void restore();
      }}
    >
      <p className="restore__lead">
        You have a saved copy of this board — {teamCount} {teamCount === 1 ? 'team' : 'teams'}, last
        changed {when}.
      </p>

      <ul className="restore__teams">
        {backup.teams.map((team) => (
          <li key={team.id}>
            {team.name} <strong>{team.score}</strong>
          </li>
        ))}
      </ul>

      <div className="restore__controls">
        <input
          className="input"
          type="password"
          value={password}
          placeholder="Host password"
          aria-label="Host password"
          onChange={(event) => setPassword(event.target.value)}
        />
        <button type="submit" className="btn btn--accent" disabled={busy || !password}>
          {busy ? 'Restoring…' : 'Put this board back'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <button
        type="button"
        className="linklike small"
        onClick={() => {
          if (window.confirm('Forget the saved copy of this board?')) {
            clearBackup(code);
            onRestored();
          }
        }}
      >
        Discard the saved copy
      </button>
    </form>
  );
}
