import type { ReactNode } from "react";

export function EntityHeader(props: {
  icon?: ReactNode;
  entityType?: string;
  title?: string;
  titleContent?: ReactNode;
  subtitle?: string | null;
  subtitleContent?: ReactNode;
  facts?: Array<{ label: string; value: ReactNode; hideLabel?: boolean }>;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
}) {
  return (
    <div className="entity-header">
      <div className="entity-header-main">
        {props.icon ? <div className="entity-header-icon">{props.icon}</div> : null}
        <div className="entity-header-title-block">
          {props.entityType ? <span className="entity-header-eyebrow">{props.entityType}</span> : null}
          <h1>{props.titleContent ?? props.title}</h1>
          {props.subtitleContent ? <div className="entity-header-subtitle">{props.subtitleContent}</div> : props.subtitle ? <p>{props.subtitle}</p> : null}
          {props.facts && props.facts.length > 0 ? (
            <div className="entity-header-facts">
              {props.facts.map((fact) => (
                <span key={fact.label}>
                  {fact.hideLabel ? fact.value : <>{fact.label}: {fact.value}</>}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {props.primaryAction || props.secondaryActions ? (
        <div className="entity-header-actions">
          {props.secondaryActions}
          {props.primaryAction}
        </div>
      ) : null}
    </div>
  );
}
