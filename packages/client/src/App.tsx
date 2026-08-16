import { useCallback, useEffect, useState } from 'react';
import { normalizeRoomCode } from '@quizzards/shared';
import { Landing } from './components/Landing.js';
import { Scoreboard } from './components/Scoreboard.js';

interface Route {
  code: string | null;
  forceViewer: boolean;
}

/** `/b/<code>` opens a board; `?view=1` forces the read-only view. */
function readRoute(): Route {
  const match = /^\/b\/([^/?#]+)/.exec(window.location.pathname);
  const code = match?.[1] ? normalizeRoomCode(decodeURIComponent(match[1])) : '';
  return {
    code: code || null,
    forceViewer: new URLSearchParams(window.location.search).has('view'),
  };
}

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);

  useEffect(() => {
    const onPopState = () => setRoute(readRoute());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const open = useCallback((code: string, asViewer: boolean) => {
    window.history.pushState(null, '', asViewer ? `/b/${code}?view=1` : `/b/${code}`);
    setRoute({ code, forceViewer: asViewer });
  }, []);

  if (!route.code) return <Landing onOpen={open} />;
  return <Scoreboard key={route.code} code={route.code} forceViewer={route.forceViewer} />;
}
