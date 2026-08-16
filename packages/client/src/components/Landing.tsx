import { useEffect, useState } from 'react';
import { MAX_TEAMS, normalizeRoomCode } from '@quizzards/shared';
import { saveHostToken } from '../useRoom.js';

interface LandingProps {
  onOpen: (code: string, asViewer: boolean) => void;
}

export function Landing({ onOpen }: LandingProps) {
  const [code, setCode] = useState('quiz-night');
  const [teams, setTeams] = useState(5);
  const [password, setPassword] = useState('');
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slug = normalizeRoomCode(code);

  // Only ask for a password when the server actually wants one.
  useEffect(() => {
    let cancelled = false;
    void fetch('/api/health')
      .then((response) => response.json())
      .then((data: { passwordRequired?: boolean }) => {
        if (!cancelled) setPasswordRequired(Boolean(data.passwordRequired));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const host = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: slug, teams, password }),
      });
      const data = (await response.json()) as { code?: string; hostToken?: string; error?: string };
      if (!response.ok || !data.code || !data.hostToken) {
        throw new Error(data.error ?? 'Could not open that board.');
      }
      saveHostToken(data.code, data.hostToken);
      onOpen(data.code, false);
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
        <p className="subtitle">Live team scores, on everyone's screen at once.</p>

        <label className="field landing__code">
          <span className="field__label">Room code</span>
          <input
            className="input"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="quiz-night"
          />
        </label>

        <div className="choices">
          <section className="choice choice--primary">
            <h2 className="choice__title">Watching the quiz</h2>
            <p className="choice__body">
              See scores update live. Nothing to set up, and you can't change anything by accident.
            </p>
            <button
              type="button"
              className="btn btn--accent btn--lg choice__action"
              disabled={!slug}
              onClick={() => onOpen(slug, true)}
            >
              Watch scores
            </button>
          </section>

          <section className="choice">
            <h2 className="choice__title">Running the quiz</h2>
            <p className="choice__body">You'll need the host password to change scores.</p>

            <form
              className="choice__form"
              onSubmit={(event) => {
                event.preventDefault();
                if (slug && !busy) void host();
              }}
            >
              <div className="choice__row">
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

                {passwordRequired && (
                  <label className="field">
                    <span className="field__label">Host password</span>
                    <input
                      className="input"
                      type="password"
                      value={password}
                      placeholder="From the black window"
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </label>
                )}
              </div>

              <button
                type="submit"
                className="btn btn--lg choice__action"
                disabled={!slug || busy || (passwordRequired && !password)}
              >
                {busy ? 'Opening…' : 'Host this board'}
              </button>
            </form>
          </section>
        </div>

        {error && <p className="error">{error}</p>}

        <p className="muted small">
          {slug ? (
            <>
              This board lives at <code>/b/{slug}</code>. Reopening the same code keeps its scores.
            </>
          ) : (
            'Enter a code made of letters, numbers or hyphens.'
          )}
        </p>
      </div>
    </main>
  );
}
