import type { ReactNode } from "react";

export function EntityDetailPage(props: { children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <section className={`entity-detail-page${props.className ? ` ${props.className}` : ""}`}>
      <div className="entity-detail-primary">{props.children}</div>
      {props.aside ? <aside className="entity-detail-aside">{props.aside}</aside> : null}
    </section>
  );
}
