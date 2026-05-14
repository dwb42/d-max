import { useEffect } from "react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";

export function EditModal(props: {
  title: string;
  description?: string | null;
  label: string;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
  footer: ReactNode;
  className?: string;
}) {
  useModalEscape(props.onCancel);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={props.onCancel}>
      <form
        className={`compact-modal${props.className ? ` ${props.className}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={props.label}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => handleModalEscape(event, props.onCancel)}
        onSubmit={props.onSubmit}
      >
        <header className="modal-title-block">
          <h2>{props.title}</h2>
          {props.description ? <p>{props.description}</p> : null}
        </header>
        {props.children}
        <footer className="modal-actions">{props.footer}</footer>
      </form>
    </div>
  );
}

export function ConfirmModal(props: {
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  extraActions?: ReactNode;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  useModalEscape(props.onCancel);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={props.onCancel}>
      <form
        className="compact-modal confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => handleModalEscape(event, props.onCancel)}
        onSubmit={(event) => {
          event.preventDefault();
          if (props.busy) return;
          void props.onConfirm();
        }}
      >
        <header className="modal-title-block">
          <h2>{props.title}</h2>
          {props.description ? <div className="confirm-modal-description">{props.description}</div> : null}
        </header>
        <footer className="modal-actions">
          <button type="submit" className="danger-button" disabled={props.busy}>{props.confirmLabel}</button>
          {props.extraActions}
          <button type="button" className="small-button" onClick={props.onCancel} disabled={props.busy}>{props.cancelLabel ?? "Abbrechen"}</button>
        </footer>
      </form>
    </div>
  );
}

export function handleModalEscape(event: ReactKeyboardEvent<HTMLElement>, onCancel: () => void) {
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.stopPropagation();
  onCancel();
}

export function useModalEscape(onCancel: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled, onCancel]);
}
