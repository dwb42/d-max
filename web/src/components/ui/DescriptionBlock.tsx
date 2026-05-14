import { useEffect, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { RichText } from "./RichText.js";
import { SectionBlock } from "./SectionBlock.js";

export function DescriptionBlock(props: {
  title?: string | null;
  text: string | null | undefined;
  emptyTitle: string;
  emptyDescription?: string;
  onEdit?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const text = props.text?.trim() ?? "";
  const isLong = text.length > 1100 || text.split("\n").length > 14;
  const editInteractionProps = props.onEdit
    ? {
        role: "button",
        tabIndex: 0,
        onClick: props.onEdit,
        onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            props.onEdit?.();
          }
        }
      }
    : {};

  useEffect(() => {
    setExpanded(false);
  }, [text]);

  return (
    <SectionBlock
      title={props.title}
      className={`description-block${props.onEdit ? " description-block-editable" : ""}`}
    >
      {text ? (
        <>
          <div
            className={`description-block-content${isLong && !expanded ? " collapsed" : ""}`}
            aria-label={props.onEdit ? "Beschreibung bearbeiten" : undefined}
            {...editInteractionProps}
          >
            <RichText text={text} />
          </div>
          {isLong ? (
            <button type="button" className="small-button description-toggle" onClick={() => setExpanded((current) => !current)}>
              {expanded ? "Weniger anzeigen" : "Mehr anzeigen"}
            </button>
          ) : null}
        </>
      ) : (
        <div
          className="description-empty-surface"
          aria-label={props.onEdit ? "Beschreibung bearbeiten" : undefined}
          {...editInteractionProps}
        >
          <strong>{props.emptyTitle}</strong>
          {props.emptyDescription ? <p>{props.emptyDescription}</p> : null}
        </div>
      )}
    </SectionBlock>
  );
}
