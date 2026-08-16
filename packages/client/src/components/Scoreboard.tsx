import { useEffect, useMemo } from 'react';
import {
  MAX_SUBTITLE_LENGTH,
  MAX_TEAMS,
  MAX_TITLE_LENGTH,
  displayOrder,
} from '@quizzards/shared';
import { useRoom } from '../useRoom.js';
import { EditableText } from './EditableText.js';
import { RosterPanel } from './RosterPanel.js';
import { TeamCard } from './TeamCard.js';
import { Toolbar } from './Toolbar.js';

interface ScoreboardProps {
  code: string;
  forceViewer: boolean;
}

export function Scoreboard({ code, forceViewer }: ScoreboardProps) {
  const room = useRoom(code, forceViewer);
  const { state, dispatch } = room;
  const editable = room.canControl && !forceViewer;

  const teams = useMemo(() => (state ? displayOrder(state) : []), [state]);

  const viewerUrl = useMemo(() => {
    const url = new URL(window.location.href);
    url.search = '?view=1';
    return url.toString();
  }, []);

  // Ctrl/Cmd+Z mirrors the Undo button — quiz hosts fix mistakes constantly.
  useEffect(() => {
    if (!editable) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        room.undo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editable, room]);

  if (room.status === 'error') {
    return (
      <main className="page page--centered">
        <div className="notice">
          <h1>Room not found</h1>
          <p>{room.error ?? 'That board is no longer running.'}</p>
          <a className="btn btn--accent" href="/">
            Back to start
          </a>
        </div>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="page page--centered">
        <p className="muted">Connecting to “{code}”…</p>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="page__head">
        <div className="page__titles">
          <EditableText
            className="title"
            value={state.title}
            editable={editable}
            onCommit={(title) => dispatch({ type: 'setTitle', title })}
            maxLength={MAX_TITLE_LENGTH}
            ariaLabel="Board title"
          />
          <EditableText
            className="subtitle"
            value={state.subtitle}
            editable={editable}
            onCommit={(subtitle) => dispatch({ type: 'setSubtitle', subtitle })}
            maxLength={MAX_SUBTITLE_LENGTH}
            ariaLabel="Board subtitle"
            placeholder="Add a subtitle"
          />
        </div>
        <div className="page__badges">
          <span className="pill">Room: {state.code}</span>
          {!editable && <span className="pill pill--muted">View only</span>}
        </div>
      </header>

      <Toolbar
        canControl={editable}
        canUndo={room.canUndo}
        sortByScore={state.sortByScore}
        canAddTeam={state.teams.length < MAX_TEAMS}
        viewerUrl={viewerUrl}
        onUndo={room.undo}
        onToggleSort={() => dispatch({ type: 'toggleSort' })}
        onReset={() => {
          if (window.confirm('Set every score back to zero?')) dispatch({ type: 'resetScores' });
        }}
        onAddTeam={() => dispatch({ type: 'addTeam' })}
      />

      {editable && <RosterPanel state={state} dispatch={dispatch} />}

      <section className="grid" aria-label="Team scores">
        {teams.map((team) => (
          <TeamCard
            key={team.id}
            team={team}
            editable={editable}
            removable={state.teams.length > 1}
            onAdjust={(delta) => dispatch({ type: 'adjust', teamId: team.id, delta })}
            onRename={(name) => dispatch({ type: 'renameTeam', teamId: team.id, name })}
            onRemove={() => {
              if (window.confirm(`Remove ${team.name} from the board?`)) {
                dispatch({ type: 'removeTeam', teamId: team.id });
              }
            }}
          />
        ))}
      </section>

      <footer className="page__foot">
        <StatusLine status={room.status} viewers={room.viewers} />
      </footer>

      {room.error && (
        <div className="toast" role="status" onClick={room.dismissError}>
          {room.error}
        </div>
      )}
    </main>
  );
}

function StatusLine({ status, viewers }: { status: string; viewers: number }) {
  if (status !== 'live') {
    return <span className="status status--away">Reconnecting…</span>;
  }
  return (
    <span className="status">
      <span className="status__dot" aria-hidden="true" />
      <span className="status__live">Live</span>
      <span className="muted"> • updates sync automatically</span>
      {viewers > 1 && <span className="muted"> • {viewers} connected</span>}
    </span>
  );
}
