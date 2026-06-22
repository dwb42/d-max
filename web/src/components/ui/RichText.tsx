import { Fragment, type ReactNode } from "react";

export function RichText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);

  return (
    <div className="rich-text">
      {blocks.map((block, index) => renderRichTextBlock(block, index))}
    </div>
  );
}

function renderRichTextBlock(block: string, blockIndex: number): ReactNode {
  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length > 1 && /^#{1,3}\s+/.test(lines[0])) {
    return (
      <section className="rich-section" key={blockIndex}>
        <h4>{lines[0].replace(/^#{1,3}\s+/, "")}</h4>
        <RichText text={lines.slice(1).join("\n")} />
      </section>
    );
  }
  if (lines.length === 1 && /^#{1,3}\s+/.test(lines[0])) {
    return <h4 key={blockIndex}>{lines[0].replace(/^#{1,3}\s+/, "")}</h4>;
  }
  const ordered = lines.every((line) => /^\d+\.\s+/.test(line));
  const unordered = lines.every((line) => /^[-*]\s+/.test(line));
  if (ordered || unordered) {
    const Tag = ordered ? "ol" : "ul";
    return (
      <Tag key={blockIndex}>
        {lines.map((line) => (
          <li key={line}>{renderInlineMarkup(line.replace(/^\d+\.\s+|^[-*]\s+/, ""))}</li>
        ))}
      </Tag>
    );
  }

  const elements: ReactNode[] = [];
  let paragraphLines: string[] = [];
  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    elements.push(<p key={`${blockIndex}-p-${elements.length}`}>{renderInlineMarkup(paragraphLines.join("\n"))}</p>);
    paragraphLines = [];
  };

  for (let index = 0; index < lines.length;) {
    const table = parseMarkdownTable(lines, index);
    if (table) {
      flushParagraph();
      elements.push(renderMarkdownTable(table, `${blockIndex}-table-${elements.length}`));
      index = table.nextIndex;
    } else {
      paragraphLines.push(lines[index]);
      index += 1;
    }
  }
  flushParagraph();

  return elements.length === 1 ? <Fragment key={blockIndex}>{elements}</Fragment> : <div key={blockIndex} className="rich-text-block">{elements}</div>;
}

type MarkdownTable = {
  headers: string[];
  rows: string[][];
  nextIndex: number;
};

function parseMarkdownTable(lines: string[], startIndex: number): MarkdownTable | null {
  const headerLine = lines[startIndex];
  const separatorLine = lines[startIndex + 1];
  if (!headerLine || !separatorLine || !isTableRow(headerLine) || !isTableSeparator(separatorLine)) {
    return null;
  }

  const headers = splitTableRow(headerLine);
  if (headers.length < 2) return null;

  const separatorCells = splitTableRow(separatorLine);
  if (separatorCells.length < headers.length || !separatorCells.every((cell) => /^:?-{3,}:?$/.test(cell))) {
    return null;
  }

  const rows: string[][] = [];
  let nextIndex = startIndex + 2;
  while (nextIndex < lines.length && isTableRow(lines[nextIndex])) {
    const cells = splitTableRow(lines[nextIndex]);
    rows.push(headers.map((_, cellIndex) => cells[cellIndex] ?? ""));
    nextIndex += 1;
  }

  return { headers, rows, nextIndex };
}

function isTableRow(line: string): boolean {
  return line.includes("|") && splitTableRow(line).length >= 2;
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function renderMarkdownTable(table: MarkdownTable, key: string): ReactNode {
  return (
    <div className="rich-table-wrap" key={key}>
      <table className="rich-table">
        <thead>
          <tr>
            {table.headers.map((header, index) => (
              <th key={`${key}-h-${index}`}>{renderInlineMarkup(header)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={`${key}-r-${rowIndex}`}>
              {table.headers.map((_, cellIndex) => (
                <td key={`${key}-r-${rowIndex}-c-${cellIndex}`}>{renderInlineMarkup(row[cellIndex] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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
