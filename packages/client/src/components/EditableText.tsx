import { useEffect, useRef, useState } from 'react';

interface EditableTextProps {
  value: string;
  onCommit: (value: string) => void;
  editable: boolean;
  className?: string;
  maxLength: number;
  ariaLabel: string;
  placeholder?: string;
}

/**
 * Click-to-edit text. Renders as plain text until focused so the board reads
 * cleanly on a projector, then behaves like an input: Enter commits, Escape
 * reverts, blur commits.
 */
export function EditableText({
  value,
  onCommit,
  editable,
  className,
  maxLength,
  ariaLabel,
  placeholder,
}: EditableTextProps) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Adopt remote edits, but never yank the text out from under the person typing.
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  if (!editable) {
    return (
      <span className={className} title={value}>
        {value}
      </span>
    );
  }

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== value) onCommit(trimmed);
  };

  if (!editing) {
    return (
      <button
        type="button"
        className={`editable ${className ?? ''}`}
        onClick={() => setEditing(true)}
        aria-label={`${ariaLabel} (click to edit)`}
        title="Click to rename"
      >
        {value || placeholder}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      className={`editable editable--active ${className ?? ''}`}
      value={draft}
      maxLength={maxLength}
      aria-label={ariaLabel}
      placeholder={placeholder}
      autoFocus
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          setDraft(value);
          setEditing(false);
        }
      }}
    />
  );
}
