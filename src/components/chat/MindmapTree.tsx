import { useMemo } from "react";

type MindNode = { label: string; children: MindNode[] };

function parseMindmap(source: string): MindNode | null {
  const lines = source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\t/g, "  "))
    .filter((l) => l.trim().length > 0);
  if (!lines.length) return null;

  const root: MindNode = { label: "Overview", children: [] };
  const stack: { depth: number; node: MindNode }[] = [{ depth: -1, node: root }];

  for (const line of lines) {
    const match = line.match(/^(\s*)(.*)$/);
    if (!match) continue;
    const spaces = match[1].length;
    const depth = Math.floor(spaces / 2);
    const label = match[2].replace(/^[-*•]\s*/, "").trim();
    if (!label) continue;
    const node: MindNode = { label, children: [] };
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    const parent = stack[stack.length - 1]?.node ?? root;
    parent.children.push(node);
    stack.push({ depth, node });
  }

  if (root.children.length === 1 && root.children[0].children.length) {
    return root.children[0];
  }
  if (!root.children.length) return null;
  return root;
}

function NodeView({ node, depth = 0 }: { node: MindNode; depth?: number }) {
  const isRoot = depth === 0;
  return (
    <li className={isRoot ? "list-none" : undefined}>
      <div
        className={
          isRoot
            ? "inline-flex rounded-xl bg-foreground px-3 py-1.5 text-[13px] font-semibold text-background"
            : "inline-flex rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-[12.5px] font-medium text-foreground"
        }
      >
        {node.label}
      </div>
      {node.children.length > 0 && (
        <ul className="mt-2 space-y-2 border-l border-border/70 pl-3 ml-1.5">
          {node.children.map((child, i) => (
            <NodeView key={`${child.label}-${i}`} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function MindmapTree({ source }: { source: string }) {
  const tree = useMemo(() => parseMindmap(source), [source]);
  if (!tree) return null;

  return (
    <div className="my-3 rounded-xl border border-border/80 bg-muted/20 px-3.5 py-3">
      <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Mindmap
      </p>
      <ul className="space-y-2">
        <NodeView node={tree} />
      </ul>
    </div>
  );
}
