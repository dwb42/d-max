import type { ReactNode } from "react";

export function SectionHeader(props: { title?: string | null; description?: string | null; actions?: ReactNode }) {
  return (
    <header className="section-block-header">
      <div>
        {props.title ? <h3>{props.title}</h3> : null}
        {props.description ? <p>{props.description}</p> : null}
      </div>
      {props.actions ? <div className="section-block-actions">{props.actions}</div> : null}
    </header>
  );
}

export function SectionBlock(props: {
  title?: string | null;
  description?: string | null;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`section-block${props.className ? ` ${props.className}` : ""}`}>
      {props.title || props.description || props.actions ? <SectionHeader title={props.title} description={props.description} actions={props.actions} /> : null}
      {props.children}
    </section>
  );
}
