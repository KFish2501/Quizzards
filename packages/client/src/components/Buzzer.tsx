import { useEffect, useState } from 'react';
import { type RoomState, formatBehind, rankBuzzes, MAX_BUZZER_NAME_LENGTH } from '@quizzards/shared';

interface BuzzerProps {
  state: RoomState;
  canControl: boolean;
  myBuzzerId: string;
  name: string;
  onNameChange: (name: string) => void;
  onBuzz: () => Promise<string | null>;
  onOpen: () => void;
  onClose: () => void;
  onClear: () => void;
}

/**
 * The buzzer. Everyone sees the same order, live; only the host opens and
 * closes it. Deliberately the largest thing on a watcher's screen — it's the
 * one control they have, usually on a phone, usually in a hurry.
 */
export function Buzzer({
  state,
  canControl,
  myBuzzerId,
  name,
  onNameChange,
  onBuzz,
  onOpen,
  onClose,
  onClear,
}: BuzzerProps) {
  const [error, setError] = useState<string | null>(null);
  const [pressing, setPressing] = useState(false);

  const ranked = rankBuzzes(state.buzzers);
  const mine = ranked.find((buzz) => buzz.buzzerId === myBuzzerId);
  const open = state.buzzersOpen;

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 2500);
    return () => clearTimeout(timer);
  }, [error]);

  // A new round clears last round's message.
  useEffect(() => {
    if (open && state.buzzers.length === 0) setError(null);
  }, [open, state.buzzers.length]);

  const buzz = async () => {
    if (pressing) return;
    setPressing(true);
    const message = await onBuzz();
    setPressing(false);
    if (message) setError(message);
  };

  return (
    <section className={`buzzer ${open ? 'buzzer--open' : ''}`} aria-label="Buzzer">
      <header className="buzzer__head">
        <h2 className="buzzer__title">
          Buzzer
          <span className={`buzzer__state ${open ? 'buzzer__state--open' : ''}`}>
            {open ? 'OPEN' : 'closed'}
          </span>
        </h2>

        {canControl && (
          <div className="buzzer__controls">
            {open ? (
              <button type="button" className="btn" onClick={onClose}>
                Close buzzer
              </button>
            ) : (
              <button type="button" className="btn btn--accent" onClick={onOpen}>
                Open buzzer
              </button>
            )}
            <button
              type="button"
              className="btn"
              onClick={onClear}
              disabled={state.buzzers.length === 0}
            >
              Clear
            </button>
          </div>
        )}
      </header>

      {!canControl && (
        <div className="buzzer__me">
          <input
            className="input buzzer__name"
            value={name}
            maxLength={MAX_BUZZER_NAME_LENGTH}
            placeholder="Your name"
            aria-label="Your name"
            onChange={(event) => onNameChange(event.target.value)}
          />
          <button
            type="button"
            className={`buzzer__button ${mine ? 'buzzer__button--done' : ''}`}
            onClick={buzz}
            disabled={!open || !name.trim() || Boolean(mine) || pressing}
          >
            {mine ? `You were #${mine.place}` : open ? 'BUZZ' : 'Waiting…'}
          </button>
          {error && <p className="buzzer__error">{error}</p>}
          {!name.trim() && open && <p className="buzzer__hint">Type your name first.</p>}
        </div>
      )}

      {ranked.length > 0 ? (
        <ol className="buzzlist">
          {ranked.map((buzz) => (
            <li
              key={buzz.buzzerId}
              className={`buzzlist__item ${buzz.place === 1 ? 'buzzlist__item--first' : ''} ${
                buzz.buzzerId === myBuzzerId ? 'buzzlist__item--me' : ''
              }`}
            >
              <span className="buzzlist__place">{buzz.place}</span>
              <span className="buzzlist__name">{buzz.name}</span>
              <span className="buzzlist__gap">{formatBehind(buzz.behindMs)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="buzzer__empty">
          {open ? 'Nobody has buzzed yet.' : 'The host opens the buzzer when a question is live.'}
        </p>
      )}
    </section>
  );
}
