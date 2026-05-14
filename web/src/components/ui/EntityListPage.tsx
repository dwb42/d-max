import type { ReactNode } from "react";

export function EntityListPage(props: { children: ReactNode; className?: string }) {
  return (
    <section className={`entity-list-page${props.className ? ` ${props.className}` : ""}`}>
      {props.children}
    </section>
  );
}

export function EntityList(props: { children: ReactNode; className?: string }) {
  return (
    <div className={`entity-list${props.className ? ` ${props.className}` : ""}`}>
      {props.children}
    </div>
  );
}

export function EntityListItem(props: {
  title: string;
  marker?: ReactNode;
  meta?: ReactNode;
  description?: ReactNode;
  stats?: Array<{ label: string; value: ReactNode }>;
  leadingAction?: ReactNode;
  actions?: ReactNode;
  onOpen?: () => void;
  openLabel?: string;
}) {
  const content = (
    <>
      {props.marker ? <div className="entity-list-item-marker">{props.marker}</div> : null}
      <div className="entity-list-item-copy">
        <strong>{props.title}</strong>
        {props.meta ? <p>{props.meta}</p> : null}
        {props.description ? <span>{props.description}</span> : null}
      </div>
      {props.stats && props.stats.length > 0 ? (
        <dl className="entity-list-item-stats">
          {props.stats.map((stat) => (
            <div key={stat.label}>
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {props.actions ? <div className="entity-list-item-actions">{props.actions}</div> : null}
    </>
  );

  if (props.onOpen && props.actions) {
    return (
      <article className={`entity-list-item entity-list-item-with-actions${props.leadingAction ? " has-leading-action" : ""}`}>
        {props.leadingAction ? <div className="entity-list-item-leading-action">{props.leadingAction}</div> : null}
        <button
          type="button"
          className={`entity-list-item-open-area${props.marker ? " with-marker" : ""}`}
          onClick={props.onOpen}
          aria-label={props.openLabel ?? `${props.title} öffnen`}
        >
          {props.marker ? <div className="entity-list-item-marker">{props.marker}</div> : null}
          <div className="entity-list-item-copy">
            <strong>{props.title}</strong>
            {props.meta ? <p>{props.meta}</p> : null}
            {props.description ? <span>{props.description}</span> : null}
          </div>
          {props.stats && props.stats.length > 0 ? (
            <dl className="entity-list-item-stats">
              {props.stats.map((stat) => (
                <div key={stat.label}>
                  <dt>{stat.label}</dt>
                  <dd>{stat.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </button>
        <div className="entity-list-item-actions">{props.actions}</div>
      </article>
    );
  }

  if (props.onOpen) {
    return (
      <button type="button" className="entity-list-item entity-list-item-button" onClick={props.onOpen}>
        {content}
      </button>
    );
  }

  return <article className="entity-list-item">{content}</article>;
}
