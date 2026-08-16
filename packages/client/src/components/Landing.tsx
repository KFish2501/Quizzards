import { useState } from 'react';
import { MAX_TEAMS, normalizeRoomCode } from '@quizzards/shared';
import { saveHostToken } from '../useRoom.js';

interface LandingProps {
  onOpen: (code: string) => void;
}

export function Landing({ onOpen }: LandingProps) {
  const [code, setCode] = useState('quiz-night');
  const [teams, setTeams] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slug = normalizeRoomCode(code);

  const host = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: slug, teams }),
      });
      const data = (await response.json()) as { code?: string; hostToken?: string; error?: string };
      if (!response.ok || !data.code || !data.hostToken) {
        throw new Error(data.error ?? 'Could not open that board.');
      }
      saveHostToken(data.code, data.hostToken);
      onOpen(data.code);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reach the scoreboard server.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page page--centered">
      <div className="landing">
        <h1 className="title">Live Quiz Scoreboard</h1>
        <p className="subtitle">
          Open a board, put it on the big screen, and adjust scores as the night runs. Everyone with
          the viewer link sees each change instantly.
        </p>

        <form
          className="landing__form"
          onSubmit={(event) => {
            event.preventDefault();
            if (slug && !busy) void host();
          }}
        >
          <label className="field">
            <span className="field__label">Room code</span>
            <input
              className="input"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="quiz-night"
              aria-describedby="code-hint"
            />
          </label>

          <label className="field field--narrow">
            <span className="field__label">Teams</span>
            <input
              className="input"
              type="number"
              min={1}
              max={MAX_TEAMS}
              value={teams}
              onChange={(event) => setTeams(Number(event.target.value))}
            />
          </label>

          <button type="submit" className="btn btn--accent btn--lg" disabled={!slug || busy}>
            {busy ? 'Opening…' : 'Host a board'}
          </button>
        </form>

        <p id="code-hint" className="muted small">
          {slug ? (
            <>
              Your board will live at <code>/b/{slug}</code>. Reopening the same code keeps its
              scores.
            </>
          ) : (
            'Enter a code made of letters, numbers or hyphens.'
          )}
        </p>

        <p className="muted small">
          Joining as a spectator?{' '}
          <button
            type="button"
            className="linklike"
            onClick={() => slug && onOpen(slug)}
            disabled={!slug}
          >
            Open “{slug || '…'}” read-only
          </button>
        </p>

        {error && <p className="error">{error}</p>}
      </div>
    </main>
  );
}
