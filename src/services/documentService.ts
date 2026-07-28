/**
 * Document Storage Service
 * ------------------------
 * IndexedDB-backed storage for user documents. Files can be large, so blobs are
 * stored in a dedicated object store while lightweight metadata lives in another
 * store — this keeps folder/list rendering fast without loading every blob.
 */

export interface DocFolder {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

export interface DocMeta {
  id: string;
  name: string;
  type: string; // MIME type
  size: number; // bytes
  folderId: string | null;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

const DB_NAME = "stabee_documents";
const DB_VERSION = 1;
const META_STORE = "meta";
const BLOB_STORE = "blobs";
const FOLDER_STORE = "folders";

export const FOLDER_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9",
];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(FOLDER_STORE)) {
        db.createObjectStore(FOLDER_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(
  store: string | string[],
  mode: IDBTransactionMode,
  run: (t: IDBTransaction) => Promise<T> | T
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        let result: T;
        Promise.resolve(run(t))
          .then((r) => {
            result = r;
          })
          .catch(reject);
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

function reqToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

export const documentService = {
  // ── Folders ──────────────────────────────────────────────────────
  async listFolders(): Promise<DocFolder[]> {
    const folders = await tx(FOLDER_STORE, "readonly", (t) =>
      reqToPromise<DocFolder[]>(t.objectStore(FOLDER_STORE).getAll())
    );
    return folders.sort((a, b) => a.createdAt - b.createdAt);
  },

  async addFolder(name: string, color?: string): Promise<DocFolder> {
    const folder: DocFolder = {
      id: uid(),
      name: name.trim() || "Untitled folder",
      color: color || FOLDER_COLORS[Math.floor(Math.random() * FOLDER_COLORS.length)],
      createdAt: Date.now(),
    };
    await tx(FOLDER_STORE, "readwrite", (t) =>
      reqToPromise(t.objectStore(FOLDER_STORE).put(folder))
    );
    return folder;
  },

  async renameFolder(id: string, name: string): Promise<void> {
    await tx(FOLDER_STORE, "readwrite", async (t) => {
      const store = t.objectStore(FOLDER_STORE);
      const folder = await reqToPromise<DocFolder | undefined>(store.get(id));
      if (folder) {
        folder.name = name.trim() || folder.name;
        await reqToPromise(store.put(folder));
      }
    });
  },

  async deleteFolder(id: string): Promise<void> {
    // Delete folder + all documents inside it.
    const docs = await this.listDocuments(id);
    await Promise.all(docs.map((d) => this.deleteDocument(d.id)));
    await tx(FOLDER_STORE, "readwrite", (t) =>
      reqToPromise(t.objectStore(FOLDER_STORE).delete(id))
    );
  },

  // ── Documents ────────────────────────────────────────────────────
  async listDocuments(folderId?: string | null): Promise<DocMeta[]> {
    const all = await tx(META_STORE, "readonly", (t) =>
      reqToPromise<DocMeta[]>(t.objectStore(META_STORE).getAll())
    );
    const filtered =
      folderId === undefined
        ? all
        : all.filter((d) => (d.folderId ?? null) === (folderId ?? null));
    return filtered.sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async addDocument(file: File, folderId: string | null = null): Promise<DocMeta> {
    const meta: DocMeta = {
      id: uid(),
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      folderId,
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await tx([META_STORE, BLOB_STORE], "readwrite", async (t) => {
      await reqToPromise(t.objectStore(META_STORE).put(meta));
      await reqToPromise(
        t.objectStore(BLOB_STORE).put({ id: meta.id, blob: file })
      );
    });
    return meta;
  },

  async getBlob(id: string): Promise<Blob | null> {
    const record = await tx(BLOB_STORE, "readonly", (t) =>
      reqToPromise<{ id: string; blob: Blob } | undefined>(
        t.objectStore(BLOB_STORE).get(id)
      )
    );
    return record?.blob ?? null;
  },

  async renameDocument(id: string, name: string): Promise<void> {
    await tx(META_STORE, "readwrite", async (t) => {
      const store = t.objectStore(META_STORE);
      const meta = await reqToPromise<DocMeta | undefined>(store.get(id));
      if (meta) {
        meta.name = name.trim() || meta.name;
        meta.updatedAt = Date.now();
        await reqToPromise(store.put(meta));
      }
    });
  },

  async moveDocument(id: string, folderId: string | null): Promise<void> {
    await tx(META_STORE, "readwrite", async (t) => {
      const store = t.objectStore(META_STORE);
      const meta = await reqToPromise<DocMeta | undefined>(store.get(id));
      if (meta) {
        meta.folderId = folderId;
        meta.updatedAt = Date.now();
        await reqToPromise(store.put(meta));
      }
    });
  },

  async deleteDocument(id: string): Promise<void> {
    await tx([META_STORE, BLOB_STORE], "readwrite", async (t) => {
      await reqToPromise(t.objectStore(META_STORE).delete(id));
      await reqToPromise(t.objectStore(BLOB_STORE).delete(id));
    });
  },

  async stats(): Promise<{ count: number; totalSize: number }> {
    const all = await this.listDocuments();
    return {
      count: all.length,
      totalSize: all.reduce((sum, d) => sum + d.size, 0),
    };
  },
};

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
