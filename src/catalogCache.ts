import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { readUtf8FileLimited } from "./boundedFile.js";
import { findMarkdownFiles, normalizeKind, normalizePath } from "./documents.js";
import { parseMarkdownWithFrontmatter } from "./frontmatter.js";
import { LedgerError } from "./machine.js";
import { resolveSafeProjectPath } from "./projectPaths.js";
import type {
  LedgerDocumentKind,
  LedgerFrontmatter,
  LedgerWorkspace,
  MarkdownSection,
  ParsedLedgerDocument,
} from "./types.js";

/** Bump when the cached record shape changes so older caches are ignored. */
export const ledgerCatalogCacheFormatVersion = 1 as const;

export type LedgerCatalogCacheBackendKind = "json" | "sqlite";
export type LedgerCatalogCacheSetting = LedgerCatalogCacheBackendKind | "auto" | "none";

/** Files whose mtime falls inside this window of the cache write are re-hashed. */
const racyWindowMs = 2_000;

export interface LedgerCatalogReadOptions {
  /** Set to false to bypass the cache and parse every record from disk. */
  readonly cache?: boolean;
}

export interface LedgerCatalogCacheStats {
  readonly backend: LedgerCatalogCacheBackendKind | "none";
  readonly cachePath?: string;
  /** Records served from the cache without parsing. */
  readonly hits: number;
  /** Records parsed from disk. */
  readonly misses: number;
  /** Cached records whose source file no longer exists. */
  readonly removed: number;
  /** Whether the cache was written during this read. */
  readonly written: boolean;
  /** Why the cache was not used or not written, when applicable. */
  readonly note?: string;
}

export interface LedgerCatalogReadResult {
  readonly documents: readonly ParsedLedgerDocument[];
  readonly cache: LedgerCatalogCacheStats;
}

export interface LedgerCatalogCacheInspection {
  readonly setting: LedgerCatalogCacheSetting;
  readonly backend: LedgerCatalogCacheBackendKind | "none";
  readonly cachePath?: string;
  readonly exists: boolean;
  readonly entries: number;
  readonly bytes: number;
  readonly writtenAt?: string;
  readonly current: boolean;
  readonly note?: string;
}

interface CacheHeader {
  readonly formatVersion: number;
  readonly fingerprint: string;
  readonly writtenAt: number;
}

interface CachedDocumentRecord {
  readonly path: string;
  readonly size: number;
  readonly mtimeMs: number;
  readonly hash: string;
  readonly document: {
    readonly frontmatterRaw: string;
    readonly frontmatter: LedgerFrontmatter;
    readonly body: string;
    readonly sections: readonly MarkdownSection[];
    readonly kind: LedgerDocumentKind;
    readonly raw: string;
  };
}

interface CatalogCacheBackend {
  readonly kind: LedgerCatalogCacheBackendKind;
  readonly cachePath: string;
  /** Load the cache. Returns false when it is missing, unreadable, or built for another fingerprint. */
  open(fingerprint: string): Promise<boolean>;
  header(): CacheHeader | undefined;
  get(relativePath: string): CachedDocumentRecord | undefined;
  paths(): readonly string[];
  entryCount(): number;
  /** Replace changed records, drop removed paths, and persist. */
  commit(
    header: CacheHeader,
    upserts: readonly CachedDocumentRecord[],
    removals: readonly string[],
  ): Promise<void>;
  close(): Promise<void>;
}

interface SourceFile {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly fallbackKind: LedgerDocumentKind;
  readonly size: number;
  readonly mtimeMs: number;
}

/**
 * Read every Ledger source record, serving unchanged files from the catalog
 * cache and parsing only files whose size, mtime, or content hash changed.
 */
export async function readLedgerCatalog(
  workspace: LedgerWorkspace,
  options: LedgerCatalogReadOptions = {},
): Promise<LedgerCatalogReadResult> {
  const files = await scanSourceFiles(workspace);
  const useCache = options.cache !== false && workspace.config.cache.backend !== "none";
  const backend = useCache ? await openBackend(workspace) : undefined;
  const fingerprint = cacheFingerprint(workspace);
  const cacheValid = backend ? await backend.open(fingerprint) : false;
  const header = cacheValid ? backend?.header() : undefined;

  const documents: ParsedLedgerDocument[] = [];
  const upserts: CachedDocumentRecord[] = [];
  let hits = 0;
  let misses = 0;
  let totalBytes = 0;

  for (const file of files) {
    totalBytes += file.size;
    if (totalBytes > workspace.config.limits.maxTotalDocumentBytes) {
      throw new LedgerError(
        "resource-limit-exceeded",
        `Ledger document bytes exceed ${workspace.config.limits.maxTotalDocumentBytes}`,
        { limit: workspace.config.limits.maxTotalDocumentBytes, kind: "total-document-bytes" },
      );
    }

    const cached = cacheValid ? backend?.get(file.relativePath) : undefined;
    const racy = header !== undefined && file.mtimeMs >= header.writtenAt - racyWindowMs;
    if (cached && cached.size === file.size && cached.mtimeMs === file.mtimeMs && !racy) {
      documents.push(reviveDocument(file, cached));
      hits += 1;
      continue;
    }

    const raw = await readUtf8FileLimited(
      file.absolutePath,
      workspace.config.limits.maxDocumentBytes,
      "document",
    );
    const hash = hashContent(raw);
    if (cached && cached.hash === hash) {
      const refreshed: CachedDocumentRecord = { ...cached, size: file.size, mtimeMs: file.mtimeMs };
      documents.push(reviveDocument(file, refreshed));
      if (cached.size !== file.size || cached.mtimeMs !== file.mtimeMs) upserts.push(refreshed);
      hits += 1;
      continue;
    }

    const parsed = parseMarkdownWithFrontmatter(raw, file.relativePath);
    const kind = normalizeKind(parsed.frontmatter.kind) ?? file.fallbackKind;
    const record: CachedDocumentRecord = {
      path: file.relativePath,
      size: file.size,
      mtimeMs: file.mtimeMs,
      hash,
      document: {
        frontmatterRaw: parsed.frontmatterRaw,
        frontmatter: parsed.frontmatter,
        body: parsed.body,
        sections: parsed.sections,
        kind,
        raw,
      },
    };
    documents.push(reviveDocument(file, record));
    upserts.push(record);
    misses += 1;
  }

  documents.sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  let written = false;
  let removed = 0;
  let note: string | undefined;
  if (backend) {
    const present = new Set(files.map((file) => file.relativePath));
    const removals = cacheValid ? backend.paths().filter((item) => !present.has(item)) : [];
    removed = removals.length;
    if (!cacheValid || upserts.length > 0 || removals.length > 0) {
      try {
        await backend.commit(
          { formatVersion: ledgerCatalogCacheFormatVersion, fingerprint, writtenAt: Date.now() },
          upserts,
          removals,
        );
        written = true;
      } catch (error) {
        note = `cache not written: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    await backend.close();
  } else if (!useCache) {
    note = options.cache === false ? "cache bypassed" : "cache disabled by config";
  }

  return {
    documents,
    cache: {
      backend: backend?.kind ?? "none",
      cachePath: backend
        ? normalizePath(path.relative(workspace.projectRoot, backend.cachePath))
        : undefined,
      hits,
      misses,
      removed,
      written,
      note,
    },
  };
}

/** Describe the on-disk cache without reading source records. */
export async function inspectLedgerCatalogCache(
  workspace: LedgerWorkspace,
): Promise<LedgerCatalogCacheInspection> {
  const setting = workspace.config.cache.backend;
  if (setting === "none") {
    return { setting, backend: "none", exists: false, entries: 0, bytes: 0, current: false, note: "disabled by config" };
  }
  const backend = await openBackend(workspace);
  if (!backend) {
    return { setting, backend: "none", exists: false, entries: 0, bytes: 0, current: false, note: "no backend available" };
  }
  const fingerprint = cacheFingerprint(workspace);
  const current = await backend.open(fingerprint);
  const header = backend.header();
  let bytes = 0;
  let exists = false;
  try {
    const stats = await stat(backend.cachePath);
    bytes = stats.size;
    exists = true;
  } catch {
    exists = false;
  }
  const entries = current ? backend.entryCount() : 0;
  await backend.close();
  return {
    setting,
    backend: backend.kind,
    cachePath: normalizePath(path.relative(workspace.projectRoot, backend.cachePath)),
    exists,
    entries,
    bytes,
    writtenAt: header ? new Date(header.writtenAt).toISOString() : undefined,
    current,
    note: exists && !current ? "cache was built for a different configuration or format" : undefined,
  };
}

/** Delete every catalog cache artifact. Returns the removed paths. */
export async function clearLedgerCatalogCache(workspace: LedgerWorkspace): Promise<readonly string[]> {
  const directory = await cacheDirectory(workspace);
  const removed: string[] = [];
  for (const name of ["catalog.json", "catalog.sqlite", "catalog.sqlite-journal", "catalog.sqlite-wal", "catalog.sqlite-shm"]) {
    const target = path.join(directory, name);
    try {
      await rm(target, { force: false });
      removed.push(normalizePath(path.relative(workspace.projectRoot, target)));
    } catch (error) {
      if (!isCode(error, "ENOENT")) throw error;
    }
  }
  return removed;
}

/** Decide which backend a workspace uses right now. */
export async function resolveCatalogCacheBackend(
  setting: LedgerCatalogCacheSetting,
): Promise<LedgerCatalogCacheBackendKind | "none"> {
  if (setting === "none") return "none";
  if (setting === "json") return "json";
  if (setting === "sqlite") return (await loadSqlite()) ? "sqlite" : "json";
  return nodeSupportsStableSqlite() && (await loadSqlite()) ? "sqlite" : "json";
}

export function cacheFingerprint(workspace: LedgerWorkspace): string {
  return hashContent(
    JSON.stringify({
      formatVersion: ledgerCatalogCacheFormatVersion,
      source: workspace.config.source,
      limits: workspace.config.limits,
    }),
  );
}

async function scanSourceFiles(workspace: LedgerWorkspace): Promise<readonly SourceFile[]> {
  const sourceDirectories: Array<[LedgerDocumentKind, string]> = [
    ["change", workspace.config.source.entries],
    ["backlog", workspace.config.source.backlog],
    ["decision", workspace.config.source.decisions],
    ["release", workspace.config.source.releases],
  ];
  const files: SourceFile[] = [];
  for (const [fallbackKind, relativeDirectory] of sourceDirectories) {
    const absoluteDirectory = await resolveSafeProjectPath(
      workspace.projectRoot,
      relativeDirectory,
      `source.${fallbackKind}`,
    );
    const found = await findMarkdownFiles(absoluteDirectory, {
      maxDepth: workspace.config.limits.maxDirectoryDepth,
      maxFiles: workspace.config.limits.maxDocuments - files.length,
    });
    for (const absolutePath of found) {
      if (files.length >= workspace.config.limits.maxDocuments) {
        throw new LedgerError(
          "resource-limit-exceeded",
          `Ledger document limit exceeded (${workspace.config.limits.maxDocuments})`,
          { kind: "documents", limit: workspace.config.limits.maxDocuments },
        );
      }
      const stats = await stat(absolutePath);
      if (!stats.isFile()) continue;
      if (stats.size > workspace.config.limits.maxDocumentBytes) {
        throw new LedgerError(
          "resource-limit-exceeded",
          `${absolutePath}: document exceeds ${workspace.config.limits.maxDocumentBytes} bytes`,
          { path: absolutePath, kind: "document", limit: workspace.config.limits.maxDocumentBytes },
        );
      }
      files.push({
        absolutePath,
        relativePath: normalizePath(path.relative(workspace.projectRoot, absolutePath)),
        fallbackKind,
        size: stats.size,
        mtimeMs: stats.mtimeMs,
      });
    }
  }
  return files;
}

function reviveDocument(file: SourceFile, record: CachedDocumentRecord): ParsedLedgerDocument {
  return {
    absolutePath: file.absolutePath,
    relativePath: file.relativePath,
    raw: record.document.raw,
    frontmatterRaw: record.document.frontmatterRaw,
    frontmatter: record.document.frontmatter,
    body: record.document.body,
    sections: record.document.sections,
    kind: record.document.kind,
  };
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

async function cacheDirectory(workspace: LedgerWorkspace): Promise<string> {
  return resolveSafeProjectPath(workspace.projectRoot, workspace.config.cache.output, "cache.output");
}

async function openBackend(workspace: LedgerWorkspace): Promise<CatalogCacheBackend | undefined> {
  const kind = await resolveCatalogCacheBackend(workspace.config.cache.backend);
  if (kind === "none") return undefined;
  const directory = await cacheDirectory(workspace);
  if (kind === "sqlite") {
    const sqlite = await loadSqlite();
    if (sqlite) return new SqliteCacheBackend(path.join(directory, "catalog.sqlite"), sqlite);
  }
  return new JsonCacheBackend(path.join(directory, "catalog.json"));
}

interface JsonCacheFile {
  readonly header: CacheHeader;
  readonly records: readonly CachedDocumentRecord[];
}

class JsonCacheBackend implements CatalogCacheBackend {
  readonly kind = "json" as const;
  private records = new Map<string, CachedDocumentRecord>();
  private loadedHeader: CacheHeader | undefined;

  constructor(readonly cachePath: string) {}

  async open(fingerprint: string): Promise<boolean> {
    let raw: string;
    try {
      raw = await readFile(this.cachePath, "utf8");
    } catch {
      return false;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<JsonCacheFile>;
      const header = parsed.header;
      if (
        !header ||
        header.formatVersion !== ledgerCatalogCacheFormatVersion ||
        header.fingerprint !== fingerprint ||
        !Array.isArray(parsed.records)
      ) {
        return false;
      }
      this.loadedHeader = header;
      for (const record of parsed.records) {
        if (isCachedRecord(record)) this.records.set(record.path, record);
      }
      return true;
    } catch {
      return false;
    }
  }

  header(): CacheHeader | undefined {
    return this.loadedHeader;
  }

  get(relativePath: string): CachedDocumentRecord | undefined {
    return this.records.get(relativePath);
  }

  paths(): readonly string[] {
    return [...this.records.keys()];
  }

  entryCount(): number {
    return this.records.size;
  }

  async commit(
    header: CacheHeader,
    upserts: readonly CachedDocumentRecord[],
    removals: readonly string[],
  ): Promise<void> {
    for (const relativePath of removals) this.records.delete(relativePath);
    for (const record of upserts) this.records.set(record.path, record);
    const records = [...this.records.values()].sort((left, right) => left.path.localeCompare(right.path));
    const payload: JsonCacheFile = { header, records };
    await mkdir(path.dirname(this.cachePath), { recursive: true });
    const temporary = `${this.cachePath}.${process.pid}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(payload), "utf8");
      await rename(temporary, this.cachePath);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  async close(): Promise<void> {
    this.records.clear();
  }
}

type SqliteModule = typeof import("node:sqlite");

class SqliteCacheBackend implements CatalogCacheBackend {
  readonly kind = "sqlite" as const;
  private database: InstanceType<SqliteModule["DatabaseSync"]> | undefined;
  private loadedHeader: CacheHeader | undefined;
  private valid = false;

  constructor(
    readonly cachePath: string,
    private readonly sqlite: SqliteModule,
  ) {}

  async open(fingerprint: string): Promise<boolean> {
    await mkdir(path.dirname(this.cachePath), { recursive: true });
    this.database = new this.sqlite.DatabaseSync(this.cachePath);
    this.database.exec(
      "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);" +
        "CREATE TABLE IF NOT EXISTS documents (path TEXT PRIMARY KEY, size INTEGER NOT NULL, mtime REAL NOT NULL, hash TEXT NOT NULL, record TEXT NOT NULL);",
    );
    const row = this.database.prepare("SELECT value FROM meta WHERE key = 'header'").get() as
      | { readonly value: string }
      | undefined;
    if (!row) return false;
    try {
      const header = JSON.parse(row.value) as CacheHeader;
      if (header.formatVersion !== ledgerCatalogCacheFormatVersion || header.fingerprint !== fingerprint) {
        return false;
      }
      this.loadedHeader = header;
      this.valid = true;
      return true;
    } catch {
      return false;
    }
  }

  header(): CacheHeader | undefined {
    return this.loadedHeader;
  }

  get(relativePath: string): CachedDocumentRecord | undefined {
    if (!this.database || !this.valid) return undefined;
    const row = this.database
      .prepare("SELECT path, size, mtime, hash, record FROM documents WHERE path = ?")
      .get(relativePath) as
      | { readonly path: string; readonly size: number; readonly mtime: number; readonly hash: string; readonly record: string }
      | undefined;
    if (!row) return undefined;
    try {
      const document = JSON.parse(row.record) as CachedDocumentRecord["document"];
      return { path: row.path, size: row.size, mtimeMs: row.mtime, hash: row.hash, document };
    } catch {
      return undefined;
    }
  }

  paths(): readonly string[] {
    if (!this.database || !this.valid) return [];
    const rows = this.database.prepare("SELECT path FROM documents").all() as unknown as readonly { readonly path: string }[];
    return rows.map((row) => row.path);
  }

  entryCount(): number {
    if (!this.database || !this.valid) return 0;
    const row = this.database.prepare("SELECT COUNT(*) AS count FROM documents").get() as { readonly count: number };
    return row.count;
  }

  async commit(
    header: CacheHeader,
    upserts: readonly CachedDocumentRecord[],
    removals: readonly string[],
  ): Promise<void> {
    const database = this.database;
    if (!database) throw new Error("sqlite cache is not open");
    database.exec("BEGIN");
    try {
      if (!this.valid) database.exec("DELETE FROM documents");
      const remove = database.prepare("DELETE FROM documents WHERE path = ?");
      for (const relativePath of removals) remove.run(relativePath);
      const upsert = database.prepare(
        "INSERT INTO documents (path, size, mtime, hash, record) VALUES (?, ?, ?, ?, ?) " +
          "ON CONFLICT(path) DO UPDATE SET size = excluded.size, mtime = excluded.mtime, hash = excluded.hash, record = excluded.record",
      );
      for (const record of upserts) {
        upsert.run(record.path, record.size, record.mtimeMs, record.hash, JSON.stringify(record.document));
      }
      database
        .prepare("INSERT INTO meta (key, value) VALUES ('header', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .run(JSON.stringify(header));
      database.exec("COMMIT");
      this.valid = true;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  async close(): Promise<void> {
    this.database?.close();
    this.database = undefined;
  }
}

let sqliteModule: SqliteModule | null | undefined;

async function loadSqlite(): Promise<SqliteModule | undefined> {
  if (sqliteModule !== undefined) return sqliteModule ?? undefined;
  try {
    sqliteModule = await import("node:sqlite");
  } catch {
    sqliteModule = null;
  }
  return sqliteModule ?? undefined;
}

/** node:sqlite reached release-candidate stability in Node 24.15; earlier lines warn on import. */
export function nodeSupportsStableSqlite(version = process.versions.node): boolean {
  const [major = 0, minor = 0] = version.split(".").map((part) => Number.parseInt(part, 10));
  if (major > 24) return true;
  return major === 24 && minor >= 15;
}

function isCachedRecord(value: unknown): value is CachedDocumentRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<CachedDocumentRecord>;
  return (
    typeof record.path === "string" &&
    typeof record.size === "number" &&
    typeof record.mtimeMs === "number" &&
    typeof record.hash === "string" &&
    record.document !== undefined &&
    typeof record.document === "object" &&
    typeof record.document.raw === "string" &&
    Array.isArray(record.document.sections)
  );
}

function isCode(error: unknown, code: string): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === code
  );
}
