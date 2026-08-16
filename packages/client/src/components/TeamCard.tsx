import { useState } from 'react';
import { EditableText } from './EditableText.js';
import {
  MAX_DELTA,
  MAX_TEAM_NAME_LENGTH,
  MIN_DELTA,
  QUICK_DELTAS,
  type RankedTeam,
} from '@quizzards/shared';

interface TeamCardProps {
  team: RankedTeam;
  editable: boolean;
  removable: boolean;
  onAdjust: (delta: number) => void;
  onRename: (name: string) => void;
  onRemove: () => void;
}

function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`;
}

export function TeamCard({ team, editable, removable, onAdjust, onRename, onRemove }: TeamCardProps) {
  const [custom, setCustom] = useState('');

  const submitCustom = () => {
    const delta = Number(custom.trim());
    if (!custom.trim() || !Number.isInteger(delta) || delta === 0) return;
    onAdjust(Math.min(Math.max(delta, MIN_DELTA), MAX_DELTA));
    setCustom('');
  };

  const scoreTone = team.score > 0 ? 'positive' : team.score < 0 ? 'negative' : 'neutral';

  return (
    <article className={`card ${team.isLeader ? 'card--leader' : ''}`}>
      <header className="card__head">
        <EditableText
          className="card__name"
          value={team.name}
          editable={editable}
          onCommit={onRename}
          maxLength={MAX_TEAM_NAME_LENGTH}
          ariaLabel="Team name"
        />
        <span className={`rank ${team.isLeader ? 'rank--leader' : ''}`}>#{team.rank}</span>
        {editable && removable && (
          <button type="button" className="card__remove" onClick={onRemove} title={`Remove ${team.name}`}>
            ×
          </button>
        )}
      </header>

      <p className={`score score--${scoreTone}`} aria-label={`${team.name} score`}>
        {team.score}
      </p>

      {team.members.length > 0 && (
        <ul className="members" aria-label={`${team.name} players`}>
          {team.members.map((member) => (
            <li key={member.id} className="members__item" title={member.name}>
              {member.name}
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <>
          <div className="card__row">
            {QUICK_DELTAS.slice(0, 3).map((delta) => (
              <button key={delta} type="button" className="btn" onClick={() => onAdjust(delta)}>
                {formatDelta(delta)}
              </button>
            ))}
          </div>
          <div className="card__row">
            {QUICK_DELTAS.slice(3).map((delta) => (
              <button key={delta} type="button" className="btn" onClick={() => onAdjust(delta)}>
                {formatDelta(delta)}
              </button>
            ))}
          </div>
          <div className="card__row card__row--custom">
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={MIN_DELTA}
              max={MAX_DELTA}
              placeholder={`${MIN_DELTA} to +${MAX_DELTA}`}
              aria-label={`Custom adjustment for ${team.name}`}
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submitCustom();
                }
              }}
            />
            <button type="button" className="btn btn--accent" onClick={submitCustom}>
              Add
            </button>
          </div>
        </>
      )}
    </article>
  );
}
