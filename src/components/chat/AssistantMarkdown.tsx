import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { MindmapTree } from "./MindmapTree";

const components: Components = {
  h1: ({ children }) => (
    <h1 className="mb-2.5 mt-4 text-[16px] font-bold leading-snug text-foreground first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-4 text-[15px] font-bold leading-snug text-foreground first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1.5 mt-3 text-[14px] font-semibold leading-snug text-foreground first:mt-0">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="mb-2.5 text-[13.5px] leading-relaxed text-foreground/90 last:mb-0">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  ul: ({ children }) => (
    <ul className="my-2.5 list-none space-y-2.5 pl-0 [&_li]:relative [&_li]:pl-4 [&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:top-[0.55em] [&_li]:before:h-1.5 [&_li]:before:w-1.5 [&_li]:before:rounded-full [&_li]:before:bg-foreground/55">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2.5 list-decimal space-y-2.5 pl-5 marker:font-semibold">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-[13.5px] leading-relaxed">{children}</li>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="break-words font-medium text-sky-300 underline underline-offset-2 hover:text-sky-200"
      onClick={(e) => {
        // Always open externally — never navigate the SPA away from chat
        if (href) {
          e.preventDefault();
          window.open(href, "_blank", "noopener,noreferrer");
        }
      }}
    >
      {children}
    </a>
  ),
  hr: () => <hr className="my-3.5 border-border" />,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full text-left text-[12.5px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-border py-1.5 pr-2 font-semibold">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-b border-border/50 py-1.5 pr-2 align-top">{children}</td>
  ),
  code: ({ className, children, ...props }) => {
    const text = String(children ?? "").replace(/\n$/, "");
    const lang = /language-([\w-]+)/.exec(className || "")?.[1]?.toLowerCase();
    const isBlock = Boolean(lang) || text.includes("\n");

    if (isBlock && (lang === "mindmap" || lang === "mind-map")) {
      return <MindmapTree source={text} />;
    }

    if (isBlock) {
      return (
        <pre className="my-2.5 overflow-x-auto rounded-xl border border-border bg-muted/30 p-3 text-[12px] leading-relaxed">
          <code {...props}>{text}</code>
        </pre>
      );
    }

    return (
      <code
        className="rounded-md bg-muted/50 px-1 py-0.5 text-[12.5px] font-medium"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => <>{children}</>,
};

export function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="assistant-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
