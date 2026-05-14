import { useEffect, useState } from "react";

export function InlineEditableText(props: {
  value: string;
  label: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  onSave: (value: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(props.value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(props.value);
      setError(null);
    }
  }, [editing, props.value]);

  async function commit() {
    const nextValue = draft.trim();
    if (props.required && !nextValue) {
      setError("Dieses Feld darf nicht leer sein.");
      return;
    }
    if (nextValue === props.value.trim()) {
      setEditing(false);
      setError(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await props.onSave(nextValue);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Änderung konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <span className={`inline-edit-field${props.className ? ` ${props.className}` : ""}`}>
        <input
          autoFocus
          aria-label={props.label}
          value={draft}
          disabled={saving}
          onBlur={() => {
            void commit();
          }}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setDraft(props.value);
              setEditing(false);
              setError(null);
            }
          }}
        />
        {error ? <span className="inline-edit-error">{error}</span> : null}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`inline-edit-trigger${props.className ? ` ${props.className}` : ""}`}
      onClick={() => {
        if (props.disabled) return;
        setDraft(props.value);
        setEditing(true);
      }}
      disabled={props.disabled}
      title={`${props.label} bearbeiten`}
    >
      {props.value}
    </button>
  );
}
