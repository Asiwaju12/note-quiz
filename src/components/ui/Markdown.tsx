/**
 * Minimal, safe Markdown renderer for AI and generated notes.
 * Builds React elements directly (never innerHTML), so model output cannot inject markup.
 * Supports: headings, paragraphs, bullet/numbered lists (one nesting level),
 * blockquotes, fenced code, tables, bold, italic, inline code and page refs.
 */
import { Fragment, memo, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: Array<{ text: string; children: string[] }> }
  | { type: "quote"; text: string }
  | { type: "code"; text: string }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "rule" };

function parse(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (line.trim().startsWith("```")) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) code.push(lines[index++]);
      index += 1;
      blocks.push({ type: "code", text: code.join("\n") });
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
      index += 1;
      continue;
    }
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) quote.push(lines[index++].replace(/^\s*>\s?/, ""));
      blocks.push({ type: "quote", text: quote.join(" ") });
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-{2,}/.test(lines[index + 1] ?? "")) {
      const split = (row: string) => row.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
      const header = split(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index])) rows.push(split(lines[index++]));
      blocks.push({ type: "table", header, rows });
      continue;
    }
    const listMatch = line.match(/^(\s*)([-*•]|\d+[.)])\s+(.*)$/);
    if (listMatch) {
      const ordered = /\d/.test(listMatch[2]);
      const items: Array<{ text: string; children: string[] }> = [];
      const baseIndent = listMatch[1].length;
      while (index < lines.length) {
        const current = lines[index].match(/^(\s*)([-*•]|\d+[.)])\s+(.*)$/);
        if (!current) {
          if (lines[index].trim() && /^\s{2,}/.test(lines[index]) && items.length) {
            items[items.length - 1].text += ` ${lines[index].trim()}`;
            index += 1;
            continue;
          }
          break;
        }
        if (current[1].length > baseIndent && items.length) items[items.length - 1].children.push(current[3]);
        else items.push({ text: current[3], children: [] });
        index += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^(#{1,4}\s|\s*>|\s*([-*•]|\d+[.)])\s|```)/.test(lines[index])) {
      paragraph.push(lines[index++].trim());
    }
    if (paragraph.length) blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    else index += 1;
  }
  return blocks;
}

function inline(text: string, onPage?: (page: number) => void): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_|\((?:p|pp)\.\s?\d+(?:[–-]\d+)?\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("**") || token.startsWith("__")) out.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`")) out.push(<code key={key++}>{token.slice(1, -1)}</code>);
    else if (token.startsWith("(p")) {
      const page = Number(token.match(/\d+/)?.[0]);
      out.push(
        onPage ? (
          <button key={key++} type="button" onClick={() => onPage(page)} className="mx-0.5 rounded-md bg-accent-soft px-1.5 py-px align-baseline font-mono text-[11.5px] font-medium text-accent-text hover:underline" title={`Open page ${page}`}>
            {token.slice(1, -1)}
          </button>
        ) : (
          <span key={key++} className="mx-0.5 rounded-md bg-accent-soft px-1.5 py-px font-mono text-[11.5px] text-accent-text">
            {token.slice(1, -1)}
          </span>
        ),
      );
    } else out.push(<em key={key++}>{token.slice(1, -1)}</em>);
    last = match.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export const Markdown = memo(function Markdown({ text, className, onPage }: { text: string; className?: string; onPage?: (page: number) => void }) {
  const blocks = parse(text);
  return (
    <div className={cn("prose-study", className)}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case "heading": {
            const Tag = (block.level <= 2 ? "h2" : "h3") as "h2" | "h3";
            return <Tag key={index}>{inline(block.text, onPage)}</Tag>;
          }
          case "paragraph":
            return <p key={index}>{inline(block.text, onPage)}</p>;
          case "quote":
            return <blockquote key={index}>{inline(block.text, onPage)}</blockquote>;
          case "code":
            return (
              <pre key={index}>
                <code>{block.text}</code>
              </pre>
            );
          case "rule":
            return <hr key={index} className="my-5 border-border" />;
          case "table":
            return (
              <table key={index}>
                <thead>
                  <tr>{block.header.map((cell, i) => <th key={i}>{inline(cell, onPage)}</th>)}</tr>
                </thead>
                <tbody>
                  {block.rows.map((row, r) => (
                    <tr key={r}>{row.map((cell, c) => <td key={c}>{inline(cell, onPage)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            );
          case "list": {
            const List = block.ordered ? "ol" : "ul";
            return (
              <List key={index}>
                {block.items.map((item, i) => (
                  <li key={i}>
                    {inline(item.text, onPage)}
                    {item.children.length > 0 && (
                      <ul>
                        {item.children.map((child, c) => (
                          <Fragment key={c}>
                            <li>{inline(child, onPage)}</li>
                          </Fragment>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </List>
            );
          }
        }
      })}
    </div>
  );
});
