import type { ReactNode } from "react";

export function RichText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);

  return (
    <div className="rich-text">
      {blocks.map((block, index) => {
        const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
        if (lines.length > 1 && /^#{1,3}\s+/.test(lines[0])) {
          return (
            <section className="rich-section" key={index}>
              <h4>{lines[0].replace(/^#{1,3}\s+/, "")}</h4>
              <RichText text={lines.slice(1).join("\n")} />
            </section>
          );
        }
        if (lines.length === 1 && /^#{1,3}\s+/.test(lines[0])) {
          return <h4 key={index}>{lines[0].replace(/^#{1,3}\s+/, "")}</h4>;
        }
        const ordered = lines.every((line) => /^\d+\.\s+/.test(line));
        const unordered = lines.every((line) => /^[-*]\s+/.test(line));
        if (ordered || unordered) {
          const Tag = ordered ? "ol" : "ul";
          return (
            <Tag key={index}>
              {lines.map((line) => (
                <li key={line}>{renderInlineMarkup(line.replace(/^\d+\.\s+|^[-*]\s+/, ""))}</li>
              ))}
            </Tag>
          );
        }
        return <p key={index}>{renderInlineMarkup(block)}</p>;
      })}
    </div>
  );
}

export function renderInlineMarkup(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s)<]+))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      nodes.push(<strong key={`${match.index}-strong`}>{match[2]}</strong>);
    } else {
      const label = match[3] ?? match[5];
      const href = match[4] ?? match[5];
      nodes.push(
        <a key={`${match.index}-link`} href={href} target="_blank" rel="noreferrer">
          {label}
        </a>
      );
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length ? nodes : [text];
}
