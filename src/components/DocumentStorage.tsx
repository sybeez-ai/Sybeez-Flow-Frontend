import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FolderOpen,
  Folder,
  FolderPlus,
  Upload,
  Search,
  File as FileIcon,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileSpreadsheet,
  Download,
  Trash2,
  Pencil,
  MoreVertical,
  LayoutGrid,
  List as ListIcon,
  X,
  Files,
  FolderInput,
  Inbox,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  documentService,
  formatBytes,
  FOLDER_COLORS,
  DocFolder,
  DocMeta,
} from "@/services/documentService";

type SortKey = "recent" | "name" | "size";

interface DocumentStorageProps {
  onClose?: () => void;
}

const iconForType = (type: string, name: string) => {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (type.startsWith("image/")) return FileImage;
  if (type.startsWith("video/")) return FileVideo;
  if (type.startsWith("audio/")) return FileAudio;
  if (type === "application/pdf" || ext === "pdf") return FileText;
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return FileArchive;
  if (["csv", "xls", "xlsx"].includes(ext)) return FileSpreadsheet;
  if (["doc", "docx", "txt", "md", "rtf"].includes(ext)) return FileText;
  return FileIcon;
};

const DocumentStorage = ({ onClose }: DocumentStorageProps) => {
  const [folders, setFolders] = useState<DocFolder[]>([]);
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null | "all">("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(true);

  // Folder create dialog
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState(FOLDER_COLORS[0]);

  // Folder rename dialog
  const [renameFolderTarget, setRenameFolderTarget] = useState<DocFolder | null>(
    null
  );
  const [renameFolderValue, setRenameFolderValue] = useState("");

  // Folder delete confirmation
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<DocFolder | null>(
    null
  );

  const [renameTarget, setRenameTarget] = useState<DocMeta | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [preview, setPreview] = useState<{ doc: DocMeta; url: string } | null>(
    null
  );

  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const [f, d] = await Promise.all([
      documentService.listFolders(),
      documentService.listDocuments(),
    ]);
    setFolders(f);
    setDocs(d);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      const target = activeFolder === "all" ? null : activeFolder;
      try {
        await Promise.all(list.map((f) => documentService.addDocument(f, target)));
        await refresh();
        toast.success(
          list.length === 1
            ? `Uploaded “${list[0].name}”`
            : `Uploaded ${list.length} files`
        );
      } catch (e) {
        toast.error("Upload failed — the file may be too large.");
      }
    },
    [activeFolder, refresh]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
    },
    [uploadFiles]
  );

  const openFolderDialog = () => {
    setNewFolderName("");
    setNewFolderColor(FOLDER_COLORS[folders.length % FOLDER_COLORS.length]);
    setFolderDialogOpen(true);
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) {
      toast.error("Please enter a folder name");
      return;
    }
    const folder = await documentService.addFolder(newFolderName, newFolderColor);
    setFolderDialogOpen(false);
    await refresh();
    setActiveFolder(folder.id);
    toast.success(`Folder “${folder.name}” created`);
  };

  const doRenameFolder = async () => {
    if (!renameFolderTarget || !renameFolderValue.trim()) return;
    await documentService.renameFolder(renameFolderTarget.id, renameFolderValue);
    setRenameFolderTarget(null);
    await refresh();
    toast.success("Folder renamed");
  };

  const confirmDeleteFolder = async () => {
    if (!deleteFolderTarget) return;
    const id = deleteFolderTarget.id;
    await documentService.deleteFolder(id);
    if (activeFolder === id) setActiveFolder("all");
    setDeleteFolderTarget(null);
    await refresh();
    toast.success("Folder deleted");
  };

  const openPreviewOrDownload = async (doc: DocMeta, download = false) => {
    const blob = await documentService.getBlob(doc.id);
    if (!blob) {
      toast.error("File not found");
      return;
    }
    const url = URL.createObjectURL(blob);
    if (download) {
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } else {
      setPreview({ doc, url });
    }
  };

  const doRename = async () => {
    if (!renameTarget) return;
    await documentService.renameDocument(renameTarget.id, renameValue);
    setRenameTarget(null);
    await refresh();
  };

  const moveDoc = async (doc: DocMeta, folderId: string | null) => {
    await documentService.moveDocument(doc.id, folderId);
    await refresh();
    toast.success("Moved");
  };

  const deleteDoc = async (doc: DocMeta) => {
    await documentService.deleteDocument(doc.id);
    await refresh();
    toast.success("Deleted");
  };

  const visibleDocs = useMemo(() => {
    let list = docs;
    if (activeFolder !== "all") {
      list = list.filter((d) => (d.folderId ?? null) === activeFolder);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((d) => d.name.toLowerCase().includes(q));
    }
    const sorted = [...list];
    if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "size") sorted.sort((a, b) => b.size - a.size);
    else sorted.sort((a, b) => b.updatedAt - a.updatedAt);
    return sorted;
  }, [docs, activeFolder, search, sort]);

  const countFor = (folderId: string | null | "all") =>
    folderId === "all"
      ? docs.length
      : docs.filter((d) => (d.folderId ?? null) === folderId).length;

  const totalSize = useMemo(
    () => docs.reduce((s, d) => s + d.size, 0),
    [docs]
  );

  const folderName = (id: string | null) =>
    id === null ? "Unsorted" : folders.find((f) => f.id === id)?.name ?? "Folder";

  return (
    <div className="flex h-full w-full flex-col bg-background text-foreground">
      {/* Header */}
      <div
        className="flex h-16 flex-none items-center justify-between px-5"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
            <Files className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-[15px] font-semibold leading-tight">
              Document Storage
            </h1>
            <p className="text-[11px] text-muted-foreground">
              {docs.length} files · {formatBytes(totalSize)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-white/10">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "flex h-8 w-8 items-center justify-center transition-colors",
                viewMode === "grid" ? "bg-white/10 text-white" : "text-white/50"
              )}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "flex h-8 w-8 items-center justify-center transition-colors",
                viewMode === "list" ? "bg-white/10 text-white" : "text-white/50"
              )}
              aria-label="List view"
            >
              <ListIcon className="h-4 w-4" />
            </button>
          </div>
          <Button size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-1.5 h-4 w-4" /> Upload
          </Button>
          {onClose && (
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) uploadFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Folder sidebar */}
        <aside
          className="flex w-[220px] flex-none flex-col"
          style={{ borderRight: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-center justify-between px-4 pb-1.5 pt-4">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
              Folders
            </p>
            <button
              onClick={openFolderDialog}
              className="flex h-6 w-6 items-center justify-center rounded-md text-white/50 hover:bg-white/10 hover:text-white"
              aria-label="New folder"
              title="New folder"
            >
              <FolderPlus className="h-4 w-4" />
            </button>
          </div>

          <ScrollArea className="flex-1 px-3">
            <div className="space-y-0.5 pb-4">
              {/* All documents */}
              <FolderRow
                active={activeFolder === "all"}
                icon={<Inbox className="h-[17px] w-[17px]" />}
                label="All Documents"
                count={countFor("all")}
                onClick={() => setActiveFolder("all")}
              />
              {/* Unsorted */}
              <FolderRow
                active={activeFolder === null}
                icon={<Folder className="h-[17px] w-[17px]" />}
                label="Unsorted"
                count={countFor(null)}
                onClick={() => setActiveFolder(null)}
              />

              {folders.map((f) => (
                <div key={f.id} className="group relative">
                  <FolderRow
                    active={activeFolder === f.id}
                    icon={
                      <span
                        className="flex h-[17px] w-[17px] items-center justify-center"
                        style={{ color: f.color }}
                      >
                        {activeFolder === f.id ? (
                          <FolderOpen className="h-[17px] w-[17px]" />
                        ) : (
                          <Folder className="h-[17px] w-[17px]" />
                        )}
                      </span>
                    }
                    label={f.name}
                    count={countFor(f.id)}
                    onClick={() => setActiveFolder(f.id)}
                    onRename={() => {
                      setRenameFolderTarget(f);
                      setRenameFolderValue(f.name);
                    }}
                    onDelete={() => setDeleteFolderTarget(f)}
                  />
                </div>
              ))}

              {folders.length === 0 && (
                <button
                  onClick={openFolderDialog}
                  className="mt-1 flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-white/45 transition-colors hover:border-white/20 hover:text-white/70"
                >
                  <FolderPlus className="h-4 w-4" />
                  <span className="text-[11px] leading-relaxed">
                    Create a folder to organize documents
                  </span>
                </button>
              )}
            </div>
          </ScrollArea>
        </aside>

        {/* Main area */}
        <div
          className="relative flex min-w-0 flex-1 flex-col"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {/* Toolbar */}
          <div className="flex flex-none items-center gap-3 px-5 py-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search documents…"
                className="h-9 pl-9"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="h-9 rounded-md border border-white/10 bg-transparent px-2 text-sm text-white/80 outline-none"
            >
              <option value="recent">Recent</option>
              <option value="name">Name</option>
              <option value="size">Size</option>
            </select>
          </div>

          <ScrollArea className="flex-1 px-5 pb-6">
            {loading ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Loading…
              </p>
            ) : visibleDocs.length === 0 ? (
              <EmptyState
                onUpload={() => fileInputRef.current?.click()}
                searching={!!search.trim()}
              />
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 pt-1">
                {visibleDocs.map((doc) => (
                  <DocCard
                    key={doc.id}
                    doc={doc}
                    folders={folders}
                    folderName={folderName}
                    onOpen={() => openPreviewOrDownload(doc)}
                    onDownload={() => openPreviewOrDownload(doc, true)}
                    onRename={() => {
                      setRenameTarget(doc);
                      setRenameValue(doc.name);
                    }}
                    onMove={(fid) => moveDoc(doc, fid)}
                    onDelete={() => deleteDoc(doc)}
                  />
                ))}
              </div>
            ) : (
              <div className="divide-y divide-white/5 pt-1">
                {visibleDocs.map((doc) => (
                  <DocRow
                    key={doc.id}
                    doc={doc}
                    folders={folders}
                    folderName={folderName}
                    onOpen={() => openPreviewOrDownload(doc)}
                    onDownload={() => openPreviewOrDownload(doc, true)}
                    onRename={() => {
                      setRenameTarget(doc);
                      setRenameValue(doc.name);
                    }}
                    onMove={(fid) => moveDoc(doc, fid)}
                    onDelete={() => deleteDoc(doc)}
                  />
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Drag overlay */}
          {dragOver && (
            <div className="pointer-events-none absolute inset-3 z-30 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-primary/60 bg-background/80 backdrop-blur-sm">
              <Upload className="mb-2 h-8 w-8 text-primary" />
              <p className="text-sm font-medium">Drop files to upload</p>
              <p className="text-xs text-muted-foreground">
                {activeFolder === "all" || activeFolder === null
                  ? "They'll be added to Unsorted"
                  : `They'll be added to “${folderName(activeFolder)}”`}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Create folder dialog */}
      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Name
              </label>
              <Input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createFolder()}
                placeholder="e.g. Invoices, IDs, Contracts"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Color
              </label>
              <div className="flex flex-wrap gap-2">
                {FOLDER_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewFolderColor(c)}
                    className="flex h-7 w-7 items-center justify-center rounded-full transition-transform hover:scale-110"
                    style={{ backgroundColor: c }}
                    aria-label={`Color ${c}`}
                  >
                    {newFolderColor === c && (
                      <Check className="h-4 w-4 text-white" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createFolder}>
              <FolderPlus className="mr-1.5 h-4 w-4" /> Create folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename folder dialog */}
      <Dialog
        open={!!renameFolderTarget}
        onOpenChange={(o) => !o && setRenameFolderTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename folder</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={renameFolderValue}
            onChange={(e) => setRenameFolderValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doRenameFolder()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameFolderTarget(null)}>
              Cancel
            </Button>
            <Button onClick={doRenameFolder}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete folder confirmation */}
      <Dialog
        open={!!deleteFolderTarget}
        onOpenChange={(o) => !o && setDeleteFolderTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete folder?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {deleteFolderTarget && (
              <>
                “{deleteFolderTarget.name}” contains{" "}
                <span className="font-medium text-foreground">
                  {countFor(deleteFolderTarget.id)}
                </span>{" "}
                {countFor(deleteFolderTarget.id) === 1 ? "document" : "documents"}.
                Deleting the folder will permanently delete everything inside it.
                This cannot be undone.
              </>
            )}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteFolderTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteFolder}>
              <Trash2 className="mr-1.5 h-4 w-4" /> Delete folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename document</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doRename()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button onClick={doRename}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-6">{preview?.doc.name}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-auto rounded-lg bg-black/20">
            {preview && <PreviewBody doc={preview.doc} url={preview.url} />}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                preview && openPreviewOrDownload(preview.doc, true)
              }
            >
              <Download className="mr-1.5 h-4 w-4" /> Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── Sub-components ───────────────────────────────────────────────────

const FolderRow = ({
  active,
  icon,
  label,
  count,
  onClick,
  onRename,
  onDelete,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  count: number;
  onClick: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}) => {
  const hasMenu = !!(onRename || onDelete);
  return (
    <div
      className={cn(
        "group/row relative flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all",
        active
          ? "bg-white/[0.07] font-medium text-white"
          : "text-white/55 hover:bg-white/[0.05] hover:text-white/90"
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-5 -translate-y-1/2 w-0.5 rounded-full bg-foreground" />
      )}
      <button
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <span className="flex-none">{icon}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </button>
      {hasMenu ? (
        <>
          <span className="text-[11px] text-muted-foreground/70 group-hover/row:hidden">
            {count}
          </span>
          <div className="hidden group-hover/row:block">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="flex h-5 w-5 flex-none items-center justify-center rounded text-white/60 hover:bg-white/10 hover:text-white"
                  aria-label="Folder options"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                {onRename && (
                  <DropdownMenuItem onClick={onRename}>
                    <Pencil className="mr-2 h-4 w-4" /> Rename
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <DropdownMenuItem
                    onClick={onDelete}
                    className="text-red-400 focus:text-red-400"
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </>
      ) : (
        <span className="text-[11px] text-muted-foreground/70">{count}</span>
      )}
    </div>
  );
};

interface DocActionProps {
  doc: DocMeta;
  folders: DocFolder[];
  folderName: (id: string | null) => string;
  onOpen: () => void;
  onDownload: () => void;
  onRename: () => void;
  onMove: (folderId: string | null) => void;
  onDelete: () => void;
}

const ActionsMenu = ({
  folders,
  onOpen,
  onDownload,
  onRename,
  onMove,
  onDelete,
}: Omit<DocActionProps, "doc" | "folderName">) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button
        onClick={(e) => e.stopPropagation()}
        className="flex h-7 w-7 items-center justify-center rounded-md text-white/50 hover:bg-white/10 hover:text-white"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-44">
      <DropdownMenuItem onClick={onOpen}>Preview</DropdownMenuItem>
      <DropdownMenuItem onClick={onDownload}>
        <Download className="mr-2 h-4 w-4" /> Download
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onRename}>
        <Pencil className="mr-2 h-4 w-4" /> Rename
      </DropdownMenuItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <FolderInput className="mr-2 h-4 w-4" /> Move to
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuItem onClick={() => onMove(null)}>
            Unsorted
          </DropdownMenuItem>
          {folders.map((f) => (
            <DropdownMenuItem key={f.id} onClick={() => onMove(f.id)}>
              <span
                className="mr-2 h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: f.color }}
              />
              {f.name}
            </DropdownMenuItem>
          ))}
          {folders.length === 0 && (
            <DropdownMenuItem disabled>No folders</DropdownMenuItem>
          )}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={onDelete}
        className="text-red-400 focus:text-red-400"
      >
        <Trash2 className="mr-2 h-4 w-4" /> Delete
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

const DocCard = ({ doc, folderName, ...actions }: DocActionProps) => {
  const Icon = iconForType(doc.type, doc.name);
  return (
    <div
      onClick={actions.onOpen}
      className="group relative flex cursor-pointer flex-col rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition-all hover:border-white/15 hover:bg-white/[0.05]"
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/[0.06]">
          <Icon className="h-5 w-5 text-white/80" />
        </div>
        <div className="opacity-0 transition-opacity group-hover:opacity-100">
          <ActionsMenu {...actions} />
        </div>
      </div>
      <p className="truncate text-[13px] font-medium" title={doc.name}>
        {doc.name}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
        {formatBytes(doc.size)} · {folderName(doc.folderId)}
      </p>
    </div>
  );
};

const DocRow = ({ doc, folderName, ...actions }: DocActionProps) => {
  const Icon = iconForType(doc.type, doc.name);
  return (
    <div
      onClick={actions.onOpen}
      className="group flex cursor-pointer items-center gap-3 px-1 py-2.5 transition-colors hover:bg-white/[0.03]"
    >
      <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-white/[0.06]">
        <Icon className="h-[18px] w-[18px] text-white/80" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium" title={doc.name}>
          {doc.name}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {folderName(doc.folderId)}
        </p>
      </div>
      <span className="flex-none text-[11px] text-muted-foreground">
        {formatBytes(doc.size)}
      </span>
      <span className="hidden flex-none text-[11px] text-muted-foreground sm:block">
        {new Date(doc.updatedAt).toLocaleDateString()}
      </span>
      <div className="flex-none opacity-0 transition-opacity group-hover:opacity-100">
        <ActionsMenu {...actions} />
      </div>
    </div>
  );
};

const PreviewBody = ({ doc, url }: { doc: DocMeta; url: string }) => {
  if (doc.type.startsWith("image/")) {
    return <img src={url} alt={doc.name} className="mx-auto max-h-[70vh]" />;
  }
  if (doc.type.startsWith("video/")) {
    return <video src={url} controls className="mx-auto max-h-[70vh] w-full" />;
  }
  if (doc.type.startsWith("audio/")) {
    return (
      <div className="p-8">
        <audio src={url} controls className="w-full" />
      </div>
    );
  }
  if (doc.type === "application/pdf") {
    return <iframe src={url} title={doc.name} className="h-[70vh] w-full" />;
  }
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
      <FileIcon className="h-12 w-12 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        No inline preview for this file type.
      </p>
      <p className="text-xs text-muted-foreground">{formatBytes(doc.size)}</p>
    </div>
  );
};

const EmptyState = ({
  onUpload,
  searching,
}: {
  onUpload: () => void;
  searching: boolean;
}) => (
  <div className="flex flex-col items-center justify-center py-20 text-center">
    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.05]">
      <FolderOpen className="h-8 w-8 text-muted-foreground" />
    </div>
    <p className="text-sm font-medium">
      {searching ? "No matching documents" : "No documents yet"}
    </p>
    <p className="mt-1 max-w-xs text-xs text-muted-foreground">
      {searching
        ? "Try a different search term."
        : "Drag & drop files anywhere here, or upload to get started."}
    </p>
    {!searching && (
      <Button size="sm" className="mt-4" onClick={onUpload}>
        <Upload className="mr-1.5 h-4 w-4" /> Upload files
      </Button>
    )}
  </div>
);

export default DocumentStorage;
