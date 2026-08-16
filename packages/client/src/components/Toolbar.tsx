import { useCallback, useEffect, useState } from 'react';

interface ToolbarProps {
  canControl: boolean;
  canUndo: boolean;
  sortByScore: boolean;
  canAddTeam: boolean;
  viewerUrl: string;
  onUndo: () => void;
  onToggleSort: () => void;
  onReset: () => void;
  onAddTeam: () => void;
}

export function Toolbar({
  canControl,
  canUndo,
  sortByScore,
  canAddTeam,
  viewerUrl,
  onUndo,
  onToggleSort,
  onReset,
  onAddTeam,
}: ToolbarProps) {
  const [copied, setCopied] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const copyViewerLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(viewerUrl);
      setCopied(true);
    } catch {
      // Clipboard API needs a secure context; fall back to a prompt.
      window.prompt('Copy the viewer link:', viewerUrl);
    }
  }, [viewerUrl]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  }, []);

  return (
    <div className="toolbar">
      {canControl && (
        <>
          <button type="button" className="btn" onClick={onUndo} disabled={!canUndo} title="Undo the last change">
            <span aria-hidden="true">↶</span> Undo
          </button>
          <button
            type="button"
            className={`btn ${sortByScore ? 'btn--on' : ''}`}
            onClick={onToggleSort}
            aria-pressed={sortByScore}
            title="Toggle between entry order and standings order"
          >
            <span aria-hidden="true">↕</span> Sort by score
          </button>
          <button type="button" className="btn" onClick={onReset} title="Set every score back to zero">
            Reset scores
          </button>
        </>
      )}

      <button type="button" className="btn btn--accent" onClick={copyViewerLink}>
        {copied ? 'Link copied' : 'Copy viewer link'}
      </button>

      <button type="button" className="btn" onClick={toggleFullscreen}>
        <span aria-hidden="true">⛶</span> {fullscreen ? 'Exit full screen' : 'Full screen'}
      </button>

      {canControl && (
        <button type="button" className="btn" onClick={onAddTeam} disabled={!canAddTeam} title="Add another team">
          + Add team
        </button>
      )}
    </div>
  );
}
