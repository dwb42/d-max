import type { ReactNode } from "react";

export function EmptyState(props: { title: string; description?: string | null; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <strong>{props.title}</strong>
      {props.description ? <p>{props.description}</p> : null}
      {props.action ? <div className="empty-state-action">{props.action}</div> : null}
    </div>
  );
}
