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
  actions?: ReactNode;
}) {
  const content = (
    <>
      <div className="entity-icon">{props.icon}</div>
      <div className="relation-item-copy">
        <strong>{props.title}</strong>
        {props.meta ? <p>{props.meta}</p> : null}
        {props.detail ? <span>{props.detail}</span> : null}
      </div>
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
