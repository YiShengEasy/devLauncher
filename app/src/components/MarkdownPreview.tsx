import type { CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const previewStyle: CSSProperties = {
  height: "100%",
  minHeight: 0,
  overflow: "auto",
  color: "rgba(248,250,252,0.92)",
  fontSize: 13,
  lineHeight: 1.58,
  overflowWrap: "anywhere",
};

const codeStyle: CSSProperties = {
  padding: "2px 5px",
  borderRadius: 5,
  background: "rgba(7,12,22,0.34)",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: "0.9em",
};

export function MarkdownPreview({
  content,
  expanded = false,
  onOpen,
}: {
  content: string;
  expanded?: boolean;
  onOpen?: () => void;
}) {
  return (
    <div
      className={`markdown-preview${expanded ? " markdown-preview--selectable" : ""}`}
      title={onOpen ? "点击放大查看并选择复制" : undefined}
      style={{
        ...previewStyle,
        fontSize: expanded ? 15 : previewStyle.fontSize,
        lineHeight: expanded ? 1.68 : previewStyle.lineHeight,
        cursor: onOpen ? "zoom-in" : "text",
        userSelect: expanded ? "text" : undefined,
        WebkitUserSelect: expanded ? "text" : undefined,
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (onOpen) {
          event.preventDefault();
          onOpen();
        }
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 style={{ margin: "0 0 10px", fontSize: 22, lineHeight: 1.25 }}>{children}</h1>,
          h2: ({ children }) => <h2 style={{ margin: "14px 0 8px", fontSize: 18, lineHeight: 1.3 }}>{children}</h2>,
          h3: ({ children }) => <h3 style={{ margin: "12px 0 7px", fontSize: 15, lineHeight: 1.35 }}>{children}</h3>,
          p: ({ children }) => <p style={{ margin: "0 0 9px" }}>{children}</p>,
          ul: ({ children }) => <ul style={{ margin: "0 0 10px", paddingLeft: 22 }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ margin: "0 0 10px", paddingLeft: 22 }}>{children}</ol>,
          li: ({ children }) => <li style={{ margin: "3px 0" }}>{children}</li>,
          blockquote: ({ children }) => (
            <blockquote
              style={{
                margin: "8px 0 10px",
                padding: "4px 10px",
                borderLeft: "3px solid rgba(116,166,255,0.72)",
                color: "rgba(226,232,240,0.76)",
                background: "rgba(82,125,190,0.10)",
              }}
            >
              {children}
            </blockquote>
          ),
          pre: ({ children }) => (
            <pre
              style={{
                margin: "8px 0 10px",
                padding: 10,
                overflow: "auto",
                borderRadius: 8,
                background: "rgba(7,12,22,0.48)",
                border: "1px solid rgba(255,255,255,0.09)",
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              {children}
            </pre>
          ),
          code: ({ children, className }) => (
            <code className={className} style={className ? undefined : codeStyle}>
              {children}
            </code>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              style={{ color: "#9bc1ff", textDecoration: "underline" }}
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div style={{ maxWidth: "100%", overflowX: "auto", margin: "8px 0 10px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th style={{ padding: "6px 8px", border: "1px solid rgba(255,255,255,0.16)", textAlign: "left" }}>{children}</th>
          ),
          td: ({ children }) => (
            <td style={{ padding: "6px 8px", border: "1px solid rgba(255,255,255,0.12)" }}>{children}</td>
          ),
          hr: () => <hr style={{ border: 0, borderTop: "1px solid rgba(255,255,255,0.16)", margin: "12px 0" }} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
