import type { ReactNode } from "react";
import { EmptyState } from "./EmptyState.js";
import { SectionBlock } from "./SectionBlock.js";

export function MetadataGrid(props: { items: Array<{ label: string; value: ReactNode | null | undefined }> }) {
  const items = props.items.filter((item) => item.value !== null && item.value !== undefined && item.value !== "");
  return (
    <SectionBlock title="Metadaten" className="metadata-section">
      {items.length === 0 ? (
        <EmptyState title="Keine Metadaten vorhanden" />
      ) : (
        <dl className="metadata-grid">
          {items.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </SectionBlock>
  );
}
