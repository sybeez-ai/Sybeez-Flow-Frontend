/**
 * Document Storage — production S3 vault (per authenticated user).
 *
 * When signed in, ALL reads/writes go through the backend → S3.
 * Local IndexedDB is only used to migrate old offline files once, then cleared.
 *
 * S3 layout:
 *   users/{user_id}/_profile.json
 *   users/{user_id}/folders/...
 *   users/{user_id}/files/{id}/...
 */

import { getApiBase } from "@/services/apiBase";
import { authHeaders, currentUserId } from "@/services/userStorage";
import { USER_SCOPE_CHANGED_EVENT } from "@/services/persistSync";

export interface DocFolder {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

export interface DocMeta {
  id: string;
  name: string;
  type: string;
  size: number;
  folderId: string | null;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  ownerEmail?: string;
  ownerName?: string;
}

export interface DocumentsCloudStatus {
  configured: boolean;
  reachable: boolean;
  bucket?: string | null;
  prefix?: string;
  owner?: { user_id: string; email: string; name: string };
  error?: string;
}

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

const DB_VERSION = 1;
const META_STORE = "meta";
const BLOB_STORE = "blobs";
const FOLDER_STORE = "folders";
const MIGRATED_KEY = "sybeez_docs_s3_migrated_v1";

let dbPromise: Promise<IDBDatabase> | null = null;
let dbOwnerKey: string | null = null;
let openDbHandle: IDBDatabase | null = null;
let lastStatus: DocumentsCloudStatus | null = null;
let migratePromise: Promise<void> | null = null;
let readyCache: { at: number; uid: string; status: DocumentsCloudStatus } | null = null;
const READY_TTL_MS = 45_000;

function scopeKey(): string {
  return (currentUserId() || "anon").trim() || "anon";
}

function sanitizeDbSegment(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 96) || "anon";
}

function dbNameForScope(owner = scopeKey()): string {
  return `sybeez_documents_v2__${sanitizeDbSegment(owner)}`;
}

function apiBase(): string {
  return `${getApiBase()}/api/documents`;
}

function detailFromError(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const d = (body as { detail?: unknown }).detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) {
    const parts = d.map((item) => {
      if (!item || typeof item !== "object") return String(item);
      const row = item as { msg?: string; loc?: unknown[] };
      const loc = Array.isArray(row.loc) ? row.loc.join(".") : "";
      if (loc.includes("file") && /required|missing/i.test(String(row.msg || ""))) {
        return "Upload failed — file was not received by the server.";
      }
      return row.msg || JSON.stringify(item);
    });
    return parts.filter(Boolean).join("; ") || fallback;
  }
  return fallback;
}

async function apiJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || "GET").toUpperCase();
  const headers: Record<string, string> = { ...authHeaders() };
  // JSON body only — never set Content-Type for multipart uploads
  if (method !== "GET" && method !== "HEAD" && init?.body && typeof init.body === "string") {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    body: init?.body,
    headers,
    signal: init?.signal,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      detail = detailFromError(await res.json(), detail);
    } catch {
      /* ignore */
    }
    if (res.status === 401) {
      throw new Error("Sign in required to use cloud document storage.");
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Multipart upload — must NOT set Content-Type (browser adds boundary). */
async function apiUpload<T>(file: File, folderId: string | null): Promise<T> {
  const form = new FormData();
  form.append("file", file, file.name || "upload.bin");
  if (folderId) form.append("folderId", folderId);

  const headers = authHeaders();
  // Strip any Content-Type so fetch can set multipart boundary
  delete headers["Content-Type"];
  delete headers["content-type"];

  const res = await fetch(`${apiBase()}/upload`, {
    method: "POST",
    headers,
    body: form,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      detail = detailFromError(await res.json(), detail);
    } catch {
      /* ignore */
    }
    if (res.status === 401) {
      throw new Error("Sign in required to use cloud document storage.");
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

function requireSignedIn(): void {
  const uid = currentUserId();
  if (!uid || uid === "anon") {
    throw new Error("Sign in to store documents in the cloud.");
  }
}

/** Permanently drop this user's local document vault (account deletion). */
export function deleteUserDocumentsDatabase(userId: string): void {
  const uid = (userId || "").trim();
  if (!uid) return;
  try {
    if (dbOwnerKey === uid || scopeKey() === uid) {
      resetDocumentDbConnection();
    }
    indexedDB.deleteDatabase(dbNameForScope(uid));
  } catch {
    /* ignore */
  }
  lastStatus = null;
  migratePromise = null;
  readyCache = null;
}

export function resetDocumentDbConnection(): void {
  try {
    openDbHandle?.close();
  } catch {
    /* ignore */
  }
  openDbHandle = null;
  dbPromise = null;
  dbOwnerKey = null;
  lastStatus = null;
  migratePromise = null;
  readyCache = null;
}

if (typeof window !== "undefined") {
  window.addEventListener(USER_SCOPE_CHANGED_EVENT, () => {
    resetDocumentDbConnection();
  });
  try {
    if (!localStorage.getItem("sybeez_docs_legacy_cleared_v1")) {
      indexedDB.deleteDatabase("stabee_documents");
      localStorage.setItem("sybeez_docs_legacy_cleared_v1", "1");
    }
  } catch {
    /* ignore */
  }
}

function openDB(): Promise<IDBDatabase> {
  const owner = scopeKey();
  if (dbPromise && dbOwnerKey === owner) return dbPromise;
  resetDocumentDbConnection();
  dbOwnerKey = owner;
  const name = dbNameForScope(owner);
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(name, DB_VERSION);
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
    req.onsuccess = () => {
      openDbHandle = req.result;
      openDbHandle.onversionchange = () => {
        try {
          openDbHandle?.close();
        } catch {
          /* ignore */
        }
        openDbHandle = null;
        dbPromise = null;
        dbOwnerKey = null;
      };
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(
  store: string | string[],
  mode: IDBTransactionMode,
  run: (t: IDBTransaction) => Promise<T> | T,
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
      }),
  );
}

function reqToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function normalizeMeta(raw: Record<string, unknown>): DocMeta {
  return {
    id: String(raw.id),
    name: String(raw.name || "file"),
    type: String(raw.type || "application/octet-stream"),
    size: Number(raw.size || 0),
    folderId: (raw.folderId as string | null) ?? null,
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    createdAt: Number(raw.createdAt || Date.now()),
    updatedAt: Number(raw.updatedAt || Date.now()),
    ownerEmail: raw.ownerEmail ? String(raw.ownerEmail) : undefined,
    ownerName: raw.ownerName ? String(raw.ownerName) : undefined,
  };
}

function normalizeFolder(raw: Record<string, unknown>): DocFolder {
  return {
    id: String(raw.id),
    name: String(raw.name || "Untitled folder"),
    color: String(raw.color || FOLDER_COLORS[0]),
    createdAt: Number(raw.createdAt || Date.now()),
  };
}

function migratedFlagKey(): string {
  return `${MIGRATED_KEY}:${scopeKey()}`;
}

async function migrateLocalToCloud(): Promise<void> {
  if (migratePromise) return migratePromise;
  migratePromise = doMigrateLocalToCloud();
  return migratePromise;
}

async function doMigrateLocalToCloud(): Promise<void> {
  try {
    if (localStorage.getItem(migratedFlagKey()) === "1") return;

    const folders = await tx(FOLDER_STORE, "readonly", (t) =>
      reqToPromise<DocFolder[]>(t.objectStore(FOLDER_STORE).getAll()),
    );
    const metas = await tx(META_STORE, "readonly", (t) =>
      reqToPromise<DocMeta[]>(t.objectStore(META_STORE).getAll()),
    );
    if (folders.length === 0 && metas.length === 0) {
      localStorage.setItem(migratedFlagKey(), "1");
      return;
    }

    const folderIdMap = new Map<string, string>();
    for (const f of folders) {
      try {
        const created = await apiJSON<{ folder: Record<string, unknown> }>("/folders", {
          method: "POST",
          body: JSON.stringify({ name: f.name, color: f.color }),
        });
        folderIdMap.set(f.id, String(created.folder.id));
      } catch (err) {
        console.warn("Folder migrate failed", f.name, err);
      }
    }

    for (const meta of metas) {
      try {
        const blobRecord = await tx(BLOB_STORE, "readonly", (t) =>
          reqToPromise<{ id: string; blob: Blob } | undefined>(
            t.objectStore(BLOB_STORE).get(meta.id),
          ),
        );
        if (!blobRecord?.blob) continue;
        const file = new File([blobRecord.blob], meta.name, {
          type: meta.type || "application/octet-stream",
        });
        const mappedFolder = meta.folderId
          ? folderIdMap.get(meta.folderId) || null
          : null;
        await apiUpload<{ document: Record<string, unknown> }>(file, mappedFolder);
      } catch (err) {
        console.warn("File migrate failed", meta.name, err);
      }
    }

    await tx([META_STORE, BLOB_STORE, FOLDER_STORE], "readwrite", async (t) => {
      await reqToPromise(t.objectStore(META_STORE).clear());
      await reqToPromise(t.objectStore(BLOB_STORE).clear());
      await reqToPromise(t.objectStore(FOLDER_STORE).clear());
    });
    localStorage.setItem(migratedFlagKey(), "1");
  } catch (err) {
    console.warn("Local→S3 migration skipped", err);
  }
}

async function ensureCloudReady(force = false): Promise<DocumentsCloudStatus> {
  requireSignedIn();
  const uid = scopeKey();
  if (
    !force &&
    readyCache &&
    readyCache.uid === uid &&
    Date.now() - readyCache.at < READY_TTL_MS
  ) {
    return readyCache.status;
  }
  const data = await apiJSON<DocumentsCloudStatus>("/status");
  if (!data.configured) {
    throw new Error(
      "Cloud document storage is not configured (DOCUMENTS_S3_BUCKET).",
    );
  }
  if (data.reachable === false) {
    throw new Error(
      data.error ||
        "Cannot reach the documents S3 bucket. Check AWS credentials / IAM.",
    );
  }
  lastStatus = data;
  readyCache = { at: Date.now(), uid, status: data };
  await migrateLocalToCloud();
  return data;
}

export const documentService = {
  ownerId(): string {
    return scopeKey();
  },

  lastCloudStatus(): DocumentsCloudStatus | null {
    return lastStatus;
  },

  async cloudStatus(): Promise<DocumentsCloudStatus> {
    return ensureCloudReady();
  },

  async listFolders(): Promise<DocFolder[]> {
    await ensureCloudReady();
    const data = await apiJSON<{ folders: Record<string, unknown>[] }>("/folders");
    return (data.folders || [])
      .map(normalizeFolder)
      .sort((a, b) => a.createdAt - b.createdAt);
  },

  async addFolder(name: string, color?: string): Promise<DocFolder> {
    await ensureCloudReady();
    const data = await apiJSON<{ folder: Record<string, unknown> }>("/folders", {
      method: "POST",
      body: JSON.stringify({
        name: name.trim() || "Untitled folder",
        color: color || FOLDER_COLORS[Math.floor(Math.random() * FOLDER_COLORS.length)],
      }),
    });
    return normalizeFolder(data.folder);
  },

  async renameFolder(id: string, name: string): Promise<void> {
    await ensureCloudReady();
    await apiJSON(`/folders/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ name: name.trim() || "Untitled folder" }),
    });
  },

  async deleteFolder(id: string): Promise<void> {
    await ensureCloudReady();
    await apiJSON(`/folders/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  async listDocuments(folderId?: string | null): Promise<DocMeta[]> {
    await ensureCloudReady();
    const path =
      folderId === undefined
        ? "/"
        : `/?folderId=${encodeURIComponent(folderId ?? "")}`;
    const data = await apiJSON<{ documents: Record<string, unknown>[] }>(path);
    return (data.documents || [])
      .map(normalizeMeta)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async addDocument(file: File, folderId: string | null = null): Promise<DocMeta> {
    // Warm vault once (cached); skip re-hitting /status on every file in a batch
    await ensureCloudReady();
    const data = await apiUpload<{ document: Record<string, unknown> }>(file, folderId);
    return normalizeMeta(data.document);
  },

  /** Upload many files with a single cloud readiness check. */
  async addDocuments(files: File[], folderId: string | null = null): Promise<DocMeta[]> {
    await ensureCloudReady();
    const out: DocMeta[] = [];
    for (const file of files) {
      const data = await apiUpload<{ document: Record<string, unknown> }>(file, folderId);
      out.push(normalizeMeta(data.document));
    }
    return out;
  },

  async getBlob(id: string): Promise<Blob | null> {
    await ensureCloudReady();
    const res = await fetch(`${apiBase()}/${encodeURIComponent(id)}/download`, {
      headers: authHeaders(),
    });
    if (!res.ok) return null;
    return await res.blob();
  },

  async renameDocument(id: string, name: string): Promise<void> {
    await ensureCloudReady();
    await apiJSON(`/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ name: name.trim() || "file" }),
    });
  },

  async moveDocument(id: string, folderId: string | null): Promise<void> {
    await ensureCloudReady();
    await apiJSON(`/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(
        folderId ? { folderId } : { folderId: null, clearFolder: true },
      ),
    });
  },

  async deleteDocument(id: string): Promise<void> {
    await ensureCloudReady();
    await apiJSON(`/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  async clearAllForCurrentUser(): Promise<void> {
    // Server-side purge is on account delete; clear local cache only
    try {
      await tx([META_STORE, BLOB_STORE, FOLDER_STORE], "readwrite", async (t) => {
        await reqToPromise(t.objectStore(META_STORE).clear());
        await reqToPromise(t.objectStore(BLOB_STORE).clear());
        await reqToPromise(t.objectStore(FOLDER_STORE).clear());
      });
    } catch {
      /* ignore */
    }
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
