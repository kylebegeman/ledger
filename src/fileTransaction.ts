import { createHash, randomUUID } from "node:crypto";
import { hostname } from "node:os";
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { normalizePath } from "./documents.js";
import { LedgerError } from "./machine.js";
import { resolveSafeProjectPath } from "./projectPaths.js";
import type { LedgerWorkspace } from "./types.js";

export interface LedgerFileChange {
  readonly path: string;
  readonly content: string;
  readonly expectedHash?: string | null;
}

export interface LedgerFileTransactionResult {
  readonly id: string;
  readonly operation: string;
  readonly changedPaths: readonly string[];
}

export interface LedgerWorkspaceWriteState {
  readonly pendingTransactions: readonly string[];
  readonly lock?: {
    readonly operation?: string;
    readonly pid?: number;
    readonly hostname?: string;
    readonly createdAt?: string;
    readonly stale: boolean;
  };
}

interface PreparedChange {
  readonly path: string;
  readonly targetPath: string;
  readonly stagePath: string;
  readonly backupPath: string;
  readonly originalHash: string | null;
  readonly nextHash: string;
  readonly content: string;
  readonly mode?: number;
}

interface TransactionJournal {
  readonly version: 1;
  readonly id: string;
  readonly operation: string;
  readonly phase: "prepared" | "applying" | "committed";
  readonly createdAt: string;
  readonly changes: readonly JournalChange[];
}

interface JournalChange {
  readonly path: string;
  readonly originalHash: string | null;
  readonly nextHash: string;
  readonly mode?: number;
}

interface LockOwner {
  readonly id: string;
  readonly pid: number;
  readonly hostname: string;
  readonly operation: string;
  readonly createdAt: string;
}

const staleLockMs = 15 * 60 * 1000;

export class WorkspaceWriteLockedError extends Error {
  readonly code = "workspace-write-locked";

  constructor(readonly owner?: Partial<LockOwner>) {
    super(
      owner?.operation
        ? `Ledger workspace is locked by ${owner.operation} (pid ${owner.pid ?? "unknown"})`
        : "Ledger workspace is locked by another write operation",
    );
    this.name = "WorkspaceWriteLockedError";
  }
}

export class ConcurrentFileChangeError extends Error {
  readonly code = "concurrent-file-change";

  constructor(readonly filePath: string) {
    super(`File changed after the operation was planned: ${filePath}`);
    this.name = "ConcurrentFileChangeError";
  }
}

export async function applyFileTransaction(
  workspace: LedgerWorkspace,
  operation: string,
  changes: readonly LedgerFileChange[],
): Promise<LedgerFileTransactionResult> {
  return await withWorkspaceWriteLock(workspace, operation, async () => {
    await recoverInterruptedTransactions(workspace);
    const id = randomUUID();
    const prepared = await prepareChanges(workspace, id, changes);
    const changed = prepared.filter((change) => change.originalHash !== change.nextHash);
    if (changed.length === 0) return { id, operation, changedPaths: [] };

    const journalPath = await transactionJournalPath(workspace, id);
    await writeJournal(journalPath, journal(id, operation, "prepared", changed));
    let committed = false;
    try {
      for (const change of changed) await writeStage(change);
      await writeJournal(journalPath, journal(id, operation, "applying", changed));
      for (const change of changed) {
        if (change.originalHash !== null) await rename(change.targetPath, change.backupPath);
        await rename(change.stagePath, change.targetPath);
      }
      await writeJournal(journalPath, journal(id, operation, "committed", changed));
      committed = true;
      await cleanupTransaction(journalPath, changed);
      return {
        id,
        operation,
        changedPaths: changed.map((change) => change.path),
      };
    } catch (error) {
      if (!committed) {
        await rollbackTransaction(changed);
        await rm(journalPath, { force: true });
      }
      throw error;
    }
  });
}

export function hashFileContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export async function recoverInterruptedTransactions(workspace: LedgerWorkspace): Promise<void> {
  const directory = await resolveSafeProjectPath(
    workspace.projectRoot,
    ".ledger/transactions",
    "transaction directory",
  );
  let names: readonly string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if (isCode(error, "ENOENT")) return;
    throw error;
  }

  for (const name of names.filter((value) => value.endsWith(".json")).sort()) {
    const journalPath = path.join(directory, name);
    const parsed = JSON.parse(await readFile(journalPath, "utf8")) as TransactionJournal;
    const changes = await Promise.all(
      parsed.changes.map((change) => hydrateJournalChange(workspace, parsed.id, change)),
    );
    if (parsed.phase !== "committed") await rollbackTransaction(changes);
    await cleanupTransaction(journalPath, changes);
  }
}

export async function inspectWorkspaceWriteState(
  workspace: LedgerWorkspace,
): Promise<LedgerWorkspaceWriteState> {
  const directory = await resolveSafeProjectPath(
    workspace.projectRoot,
    ".ledger/transactions",
    "transaction directory",
  );
  let pendingTransactions: readonly string[] = [];
  try {
    pendingTransactions = (await readdir(directory))
      .filter((name) => name.endsWith(".json"))
      .sort();
  } catch (error) {
    if (!isCode(error, "ENOENT")) throw error;
  }
  const lockPath = await resolveSafeProjectPath(
    workspace.projectRoot,
    ".ledger/write.lock",
    "workspace lock",
  );
  const lockExists = await exists(lockPath);
  const owner = await readLockOwner(lockPath);
  return {
    pendingTransactions,
    lock: lockExists
      ? {
          operation: owner?.operation,
          pid: owner?.pid,
          hostname: owner?.hostname,
          createdAt: owner?.createdAt,
          stale: isStaleLock(owner),
        }
      : undefined,
  };
}

async function prepareChanges(
  workspace: LedgerWorkspace,
  id: string,
  changes: readonly LedgerFileChange[],
): Promise<readonly PreparedChange[]> {
  const seen = new Set<string>();
  const prepared: PreparedChange[] = [];
  for (const change of changes) {
    const normalized = normalizePath(change.path);
    if (seen.has(normalized)) {
      throw new LedgerError("invalid-argument", `Duplicate transaction path: ${normalized}`, {
        path: normalized,
      });
    }
    seen.add(normalized);
    const targetPath = await resolveSafeProjectPath(workspace.projectRoot, normalized, "transaction path");
    await mkdir(path.dirname(targetPath), { recursive: true });
    const current = await readCurrentFile(targetPath);
    if (change.expectedHash !== undefined && change.expectedHash !== current.hash) {
      throw new ConcurrentFileChangeError(normalized);
    }
    const suffix = `.ledger-${id}`;
    prepared.push({
      path: normalized,
      targetPath,
      stagePath: `${targetPath}${suffix}.stage`,
      backupPath: `${targetPath}${suffix}.backup`,
      originalHash: current.hash,
      nextHash: hashFileContent(change.content),
      content: change.content,
      mode: current.mode,
    });
  }
  return prepared;
}

async function readCurrentFile(filePath: string): Promise<{ hash: string | null; mode?: number }> {
  try {
    const [content, fileStats] = await Promise.all([readFile(filePath, "utf8"), stat(filePath)]);
    return { hash: hashFileContent(content), mode: fileStats.mode };
  } catch (error) {
    if (isCode(error, "ENOENT")) return { hash: null };
    throw error;
  }
}

async function writeStage(change: PreparedChange): Promise<void> {
  const handle = await open(change.stagePath, "wx", change.mode);
  try {
    await handle.writeFile(change.content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function rollbackTransaction(changes: readonly PreparedChange[]): Promise<void> {
  for (const change of [...changes].reverse()) {
    const backupExists = await exists(change.backupPath);
    const target = await readCurrentFile(change.targetPath);
    if (backupExists) {
      if (target.hash !== null && target.hash !== change.nextHash) {
        throw new ConcurrentFileChangeError(change.path);
      }
      await rm(change.targetPath, { force: true });
      await rename(change.backupPath, change.targetPath);
    } else if (change.originalHash === null && target.hash === change.nextHash) {
      await rm(change.targetPath, { force: true });
    }
    await rm(change.stagePath, { force: true });
  }
}

async function cleanupTransaction(
  journalPath: string,
  changes: readonly PreparedChange[],
): Promise<void> {
  for (const change of changes) {
    await rm(change.stagePath, { force: true });
    await rm(change.backupPath, { force: true });
  }
  await rm(journalPath, { force: true });
}

async function hydrateJournalChange(
  workspace: LedgerWorkspace,
  id: string,
  change: JournalChange,
): Promise<PreparedChange> {
  const targetPath = await resolveSafeProjectPath(workspace.projectRoot, change.path, "transaction path");
  const suffix = `.ledger-${id}`;
  return {
    ...change,
    targetPath,
    stagePath: `${targetPath}${suffix}.stage`,
    backupPath: `${targetPath}${suffix}.backup`,
    content: "",
  };
}

function journal(
  id: string,
  operation: string,
  phase: TransactionJournal["phase"],
  changes: readonly PreparedChange[],
): TransactionJournal {
  return {
    version: 1,
    id,
    operation,
    phase,
    createdAt: new Date().toISOString(),
    changes: changes.map((change) => ({
      path: change.path,
      originalHash: change.originalHash,
      nextHash: change.nextHash,
      mode: change.mode,
    })),
  };
}

async function transactionJournalPath(workspace: LedgerWorkspace, id: string): Promise<string> {
  const directory = await resolveSafeProjectPath(
    workspace.projectRoot,
    ".ledger/transactions",
    "transaction directory",
  );
  await mkdir(directory, { recursive: true });
  return path.join(directory, `${id}.json`);
}

async function writeJournal(filePath: string, value: TransactionJournal): Promise<void> {
  const temporary = `${filePath}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "w" });
  await rename(temporary, filePath);
}

async function withWorkspaceWriteLock<T>(
  workspace: LedgerWorkspace,
  operation: string,
  body: () => Promise<T>,
): Promise<T> {
  const lockPath = await resolveSafeProjectPath(
    workspace.projectRoot,
    ".ledger/write.lock",
    "workspace lock",
  );
  await mkdir(path.dirname(lockPath), { recursive: true });
  const owner: LockOwner = {
    id: randomUUID(),
    pid: process.pid,
    hostname: hostname(),
    operation,
    createdAt: new Date().toISOString(),
  };
  const handle = await acquireLock(lockPath, owner);
  try {
    return await body();
  } finally {
    await handle.close();
    await releaseOwnedLock(lockPath, owner.id);
  }
}

async function acquireLock(lockPath: string, owner: LockOwner) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx");
      await handle.writeFile(`${JSON.stringify(owner, null, 2)}\n`, "utf8");
      await handle.sync();
      return handle;
    } catch (error) {
      if (!isCode(error, "EEXIST")) throw error;
      const existing = await readLockOwner(lockPath);
      if (attempt === 0 && isStaleLock(existing)) {
        await rm(lockPath, { force: true });
        continue;
      }
      throw new WorkspaceWriteLockedError(existing);
    }
  }
  throw new WorkspaceWriteLockedError();
}

async function readLockOwner(lockPath: string): Promise<Partial<LockOwner> | undefined> {
  try {
    return JSON.parse(await readFile(lockPath, "utf8")) as Partial<LockOwner>;
  } catch {
    return undefined;
  }
}

function isStaleLock(owner: Partial<LockOwner> | undefined): boolean {
  if (!owner) return false;
  const created = Date.parse(owner.createdAt ?? "");
  if (!Number.isFinite(created)) return false;
  if (owner.hostname === hostname() && typeof owner.pid === "number") {
    try {
      process.kill(owner.pid, 0);
      return false;
    } catch (error) {
      return isCode(error, "ESRCH");
    }
  }
  return Date.now() - created > staleLockMs;
}

async function releaseOwnedLock(lockPath: string, ownerId: string): Promise<void> {
  const existing = await readLockOwner(lockPath);
  if (existing?.id === ownerId) await rm(lockPath, { force: true });
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (isCode(error, "ENOENT")) return false;
    throw error;
  }
}

function isCode(error: unknown, code: string): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === code
  );
}
