import { useMemo, useState } from 'react';
import {
  type BoardAction,
  type Player,
  type RoomState,
  parseNameList,
  unassignedPlayers,
} from '@quizzards/shared';

interface RosterPanelProps {
  state: RoomState;
  dispatch: (action: BoardAction) => void;
}

/**
 * Host-only roster: paste a list of names, then assign each person to a team.
 * Assignment is a plain `<select>` rather than drag-and-drop so it works the
 * same on a phone at the back of the room as it does on the host's laptop.
 */
export function RosterPanel({ state, dispatch }: RosterPanelProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const unassigned = useMemo(() => unassignedPlayers(state.players), [state.players]);
  const parsed = useMemo(() => parseNameList(draft), [draft]);
  const newNames = useMemo(() => {
    const existing = new Set(state.players.map((p) => p.name.toLowerCase()));
    return parsed.filter((name) => !existing.has(name.toLowerCase()));
  }, [parsed, state.players]);

  const addNames = () => {
    if (newNames.length === 0) return;
    dispatch({ type: 'addPlayers', names: draft });
    setDraft('');
  };

  return (
    <section className="roster">
      <header className="roster__head">
        <button
          type="button"
          className="roster__toggle"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <span aria-hidden="true">{open ? '▾' : '▸'}</span> Roster
          <span className="roster__count">
            {state.players.length} {state.players.length === 1 ? 'player' : 'players'}
            {unassigned.length > 0 && ` · ${unassigned.length} unassigned`}
          </span>
        </button>

        {open && state.players.length > 0 && (
          <div className="roster__actions">
            <button
              type="button"
              className="btn"
              onClick={() => dispatch({ type: 'autoAssign' })}
              disabled={unassigned.length === 0}
              title="Spread unassigned players across the teams evenly"
            >
              Auto-assign
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (window.confirm('Redistribute everyone across the teams from scratch?')) {
                  dispatch({ type: 'autoAssign', includeAssigned: true });
                }
              }}
            >
              Redistribute all
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (window.confirm('Remove every player from the roster?')) {
                  dispatch({ type: 'clearRoster' });
                }
              }}
            >
              Clear roster
            </button>
          </div>
        )}
      </header>

      {open && (
        <div className="roster__body">
          <div className="roster__add">
            <label className="field">
              <span className="field__label">
                Paste names — one per line, or separated by commas
              </span>
              <textarea
                className="input roster__textarea"
                rows={4}
                value={draft}
                placeholder={'Kyle\nOD\nGodse\nNer\nAmol'}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    addNames();
                  }
                }}
              />
            </label>
            <div className="roster__add-foot">
              <button type="button" className="btn btn--accent" onClick={addNames} disabled={newNames.length === 0}>
                {newNames.length === 0
                  ? 'Add names'
                  : `Add ${newNames.length} ${newNames.length === 1 ? 'name' : 'names'}`}
              </button>
              {parsed.length > newNames.length && (
                <span className="muted small">
                  {parsed.length - newNames.length} already on the roster
                </span>
              )}
            </div>
          </div>

          {state.players.length > 0 && (
            <div className="roster__list" role="list">
              {[...unassigned, ...state.players.filter((p) => p.teamId !== null)].map((player) => (
                <PlayerRow key={player.id} player={player} state={state} dispatch={dispatch} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function PlayerRow({
  player,
  state,
  dispatch,
}: {
  player: Player;
  state: RoomState;
  dispatch: (action: BoardAction) => void;
}) {
  return (
    <div className={`player ${player.teamId ? '' : 'player--unassigned'}`} role="listitem">
      <span className="player__name" title={player.name}>
        {player.name}
      </span>
      <select
        className="player__select"
        value={player.teamId ?? ''}
        aria-label={`Team for ${player.name}`}
        onChange={(event) =>
          dispatch({
            type: 'assignPlayer',
            playerId: player.id,
            teamId: event.target.value || null,
          })
        }
      >
        <option value="">Unassigned</option>
        {state.teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="player__remove"
        onClick={() => dispatch({ type: 'removePlayer', playerId: player.id })}
        title={`Remove ${player.name}`}
        aria-label={`Remove ${player.name}`}
      >
        ×
      </button>
    </div>
  );
}
