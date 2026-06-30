import { Children } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { EmptyState } from "./EmptyState.js";
import { SectionHeader } from "./SectionBlock.js";

export type RelationEmptyMode = "card" | "inline" | "none";

export function RelationList(props: { children: ReactNode; emptyTitle?: string; emptyDescription?: string; emptyMode?: RelationEmptyMode }) {
  const hasChildren = Children.count(props.children) > 0;
  if (hasChildren) return <div className="relation-list">{props.children}</div>;
  if (props.emptyMode === "none") return <div className="relation-list relation-list-empty" />;
  if (props.emptyMode === "inline") return <p className="relation-empty-inline">{props.emptyTitle}</p>;
  return <div className="relation-list"><EmptyState title={props.emptyTitle ?? "Keine Einträge"} description={props.emptyDescription} /></div>;
}

export function RelationGroup(props: { title: string; description?: string | null; actions?: ReactNode; children: ReactNode; emptyTitle?: string; emptyDescription?: string; emptyMode?: RelationEmptyMode }) {
  return (
    <section className="relation-group">
      <SectionHeader title={props.title} description={props.description} actions={props.actions} />
      <RelationList emptyTitle={props.emptyTitle} emptyDescription={props.emptyDescription} emptyMode={props.emptyMode}>
        {props.children}
      </RelationList>
    </section>
  );
}

export function RelationItem(props: {
  icon: ReactNode;
  title: string;
  meta?: string | null;
  detail?: string | null;
  onOpen?: () => void;
  href?: string;
  target?: string;
  rel?: string;
  openLabel?: string;
  actions?: ReactNode;
}) {
  const copy = (
    <>
      <div className="entity-icon">{props.icon}</div>
      <div className="relation-item-copy">
        <strong>{props.title}</strong>
        {props.meta ? <p>{props.meta}</p> : null}
        {props.detail ? <span>{props.detail}</span> : null}
      </div>
    </>
  );
  const content = (
    <>
      {copy}
      {props.actions ? (
        <div
          className="relation-item-actions"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {props.actions}
        </div>
      ) : null}
    </>
  );

  if (props.href && !props.actions) {
    return (
      <a className="relation-item relation-button" href={props.href} target={props.target} rel={props.rel} aria-label={props.openLabel}>
        {content}
      </a>
    );
  }

  if (props.href) {
    return (
      <div className="relation-item relation-button relation-item-linked">
        <a className="relation-item-open-link" href={props.href} target={props.target} rel={props.rel} aria-label={props.openLabel}>
          {copy}
        </a>
        <div
          className="relation-item-actions"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {props.actions}
        </div>
      </div>
    );
  }

  if (props.onOpen && !props.actions) {
    return (
      <button type="button" className="relation-item relation-button" onClick={props.onOpen}>
        {content}
      </button>
    );
  }

  if (props.onOpen) {
    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      props.onOpen?.();
    };
    return (
      <div
        className="relation-item relation-button"
        role="button"
        tabIndex={0}
        onClick={props.onOpen}
        onKeyDown={onKeyDown}
      >
        {content}
      </div>
    );
  }

  return <div className="relation-item">{content}</div>;
}
