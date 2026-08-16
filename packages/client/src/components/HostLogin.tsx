import { useState } from 'react';

interface HostLoginProps {
  onSubmit: (password: string) => Promise<string | null>;
}

/**
 * Lets the quiz host claim control of a board from a device that has never
 * hosted it — a second laptop, or the same PC after clearing site data.
 * Viewers never need this; they just watch.
 */
export function HostLogin({ onSubmit }: HostLoginProps) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        Take control
      </button>
    );
  }

  const submit = async () => {
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    const message = await onSubmit(password);
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    setPassword('');
    setOpen(false);
  };

  return (
    <form
      className="host-login"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <input
        className="input"
        type="password"
        value={password}
        autoFocus
        placeholder="Host password"
        aria-label="Host password"
        onChange={(event) => setPassword(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false);
            setError(null);
          }
        }}
      />
      <button type="submit" className="btn btn--accent" disabled={!password || busy}>
        {busy ? 'Checking…' : 'Unlock'}
      </button>
      {error && <span className="host-login__error">{error}</span>}
    </form>
  );
}
