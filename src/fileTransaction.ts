import { createHash, randomUUID } from "node:crypto";
import { hostname } from "node:os";
import {
  mkdir,
  open,
  readdir,
  rename,
  rm,
  stat,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { readUtf8FileLimited } from "./boundedFile.js";
import { normalizePath } from "./documents.js";
import { LedgerError } from "./machine.js";
import { assertSafeProjectRelativePath, resolveSafeProjectPath } from "./projectPaths.js";
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
const maxLockBytes = 16 * 1024;
const maxOperationLength = 500;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256Pattern = /^[a-f0-9]{64}$/;

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
  validateTransactionInput(workspace, operation, changes);
  return await withWorkspaceWriteLock(workspace, operation, async () => {
    await recoverInterruptedTransactionsUnlocked(workspace);
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
        await rollbackTransaction(changed, workspace.config.limits.maxTotalDocumentBytes);
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
  await withWorkspaceWriteLock(workspace, "recover interrupted transactions", async () => {
    await recoverInterruptedTransactionsUnlocked(workspace);
  });
}

async function recoverInterruptedTransactionsUnlocked(workspace: LedgerWorkspace): Promise<void> {
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
    const expectedId = name.slice(0, -".json".length);
    const parsed = await readTransactionJournal(workspace, journalPath, expectedId);
    const changes = await Promise.all(
      parsed.changes.map((change) => hydrateJournalChange(workspace, parsed.id, change)),
    );
    if (parsed.phase !== "committed") {
      await rollbackTransaction(changes, workspace.config.limits.maxTotalDocumentBytes);
    }
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
  const lock = await readLockMetadata(lockPath);
  return {
    pendingTransactions,
    lock: lock.exists
      ? {
          operation: lock.owner?.operation,
          pid: lock.owner?.pid,
          hostname: lock.owner?.hostname,
          createdAt: lock.owner?.createdAt,
          stale: isStaleLock(lock.owner, lock.modifiedAt),
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
    const normalized = assertSafeProjectRelativePath(
      normalizePath(change.path),
      "transaction path",
    );
    const targetPath = await resolveSafeProjectPath(workspace.projectRoot, normalized, "transaction path");
    const key = process.platform === "win32" ? targetPath.toLowerCase() : targetPath;
    if (seen.has(key)) {
      throw new LedgerError("invalid-argument", `Duplicate transaction path: ${normalized}`, {
        path: normalized,
      });
    }
    seen.add(key);
    const current = await readCurrentFile(
      targetPath,
      workspace.config.limits.maxTotalDocumentBytes,
    );
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
      mode: current.mode === undefined ? undefined : current.mode & 0o777,
    });
  }
  for (const directory of new Set(prepared.map((change) => path.dirname(change.targetPath)))) {
    await mkdir(directory, { recursive: true });
  }
  return prepared;
}

async function readCurrentFile(
  filePath: string,
  maxBytes: number,
): Promise<{ hash: string | null; mode?: number }> {
  try {
    const [content, fileStats] = await Promise.all([
      readUtf8FileLimited(filePath, maxBytes, "transaction target"),
      stat(filePath),
    ]);
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

async function rollbackTransaction(
  changes: readonly PreparedChange[],
  maxBytes: number,
): Promise<void> {
  for (const change of [...changes].reverse()) {
    const backupExists = await exists(change.backupPath);
    const target = await readCurrentFile(change.targetPath, maxBytes);
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
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
  await handle.close();
  try {
    await rename(temporary, filePath);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
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
      try {
        await handle.writeFile(`${JSON.stringify(owner, null, 2)}\n`, "utf8");
        await handle.sync();
        return handle;
      } catch (error) {
        await handle.close().catch(() => undefined);
        await rm(lockPath, { force: true }).catch(() => undefined);
        throw error;
      }
    } catch (error) {
      if (!isCode(error, "EEXIST")) throw error;
      const existing = await readLockMetadata(lockPath);
      if (attempt === 0 && isStaleLock(existing.owner, existing.modifiedAt)) {
        await removeStaleLock(lockPath);
        continue;
      }
      throw new WorkspaceWriteLockedError(existing.owner);
    }
  }
  throw new WorkspaceWriteLockedError();
}

async function readLockOwner(lockPath: string): Promise<Partial<LockOwner> | undefined> {
  let content: string;
  try {
    content = await readUtf8FileLimited(lockPath, maxLockBytes, "workspace lock");
  } catch (error) {
    if (isCode(error, "ENOENT") || isCode(error, "resource-limit-exceeded")) return undefined;
    throw error;
  }
  try {
    return JSON.parse(content) as Partial<LockOwner>;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return undefined;
  }
}

function isStaleLock(
  owner: Partial<LockOwner> | undefined,
  modifiedAt?: number,
): boolean {
  if (!owner) {
    return modifiedAt !== undefined && Date.now() - modifiedAt > staleLockMs;
  }
  const created = Date.parse(owner.createdAt ?? "");
  if (!Number.isFinite(created)) {
    return modifiedAt !== undefined && Date.now() - modifiedAt > staleLockMs;
  }
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

async function readLockMetadata(lockPath: string): Promise<{
  readonly exists: boolean;
  readonly owner?: Partial<LockOwner>;
  readonly modifiedAt?: number;
}> {
  try {
    const [owner, stats] = await Promise.all([readLockOwner(lockPath), stat(lockPath)]);
    return { exists: true, owner, modifiedAt: stats.mtimeMs };
  } catch (error) {
    if (isCode(error, "ENOENT")) return { exists: false };
    throw error;
  }
}

async function removeStaleLock(lockPath: string): Promise<void> {
  const recoveryPath = `${lockPath}.recovery`;
  const handle = await acquireRecoveryLock(recoveryPath);
  try {
    const current = await readLockMetadata(lockPath);
    if (current.exists && isStaleLock(current.owner, current.modifiedAt)) {
      await rm(lockPath, { force: true });
    }
  } finally {
    await handle.close();
    await rm(recoveryPath, { force: true });
  }
}

async function acquireRecoveryLock(recoveryPath: string) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await open(recoveryPath, "wx");
    } catch (error) {
      if (!isCode(error, "EEXIST")) throw error;
      const stats = await stat(recoveryPath).catch((statError: unknown) => {
        if (isCode(statError, "ENOENT")) return undefined;
        throw statError;
      });
      if (!stats) continue;
      if (attempt === 0 && Date.now() - stats.mtimeMs > staleLockMs) {
        await rm(recoveryPath, { force: true });
        continue;
      }
      throw new WorkspaceWriteLockedError();
    }
  }
  throw new WorkspaceWriteLockedError();
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

function validateTransactionInput(
  workspace: LedgerWorkspace,
  operation: string,
  changes: readonly LedgerFileChange[],
): void {
  if (!operation.trim() || operation.length > maxOperationLength) {
    throw new LedgerError("invalid-argument", "Transaction operation must be 1 to 500 characters");
  }
  if (changes.length > workspace.config.limits.maxDocuments) {
    throw new LedgerError(
      "resource-limit-exceeded",
      `Transaction exceeds ${workspace.config.limits.maxDocuments} file changes`,
      { kind: "transaction-files", limit: workspace.config.limits.maxDocuments },
    );
  }
  let totalBytes = 0;
  for (const change of changes) {
    if (typeof change.path !== "string" || typeof change.content !== "string") {
      throw new LedgerError("invalid-argument", "Transaction changes require string paths and content");
    }
    const bytes = Buffer.byteLength(change.content, "utf8");
    if (bytes > workspace.config.limits.maxTotalDocumentBytes) {
      throw new LedgerError(
        "resource-limit-exceeded",
        `${change.path}: transaction content exceeds ${workspace.config.limits.maxTotalDocumentBytes} bytes`,
        { kind: "transaction-file-bytes", limit: workspace.config.limits.maxTotalDocumentBytes },
      );
    }
    totalBytes += bytes;
    if (totalBytes > workspace.config.limits.maxTotalDocumentBytes) {
      throw new LedgerError(
        "resource-limit-exceeded",
        `Transaction content exceeds ${workspace.config.limits.maxTotalDocumentBytes} bytes`,
        { kind: "transaction-total-bytes", limit: workspace.config.limits.maxTotalDocumentBytes },
      );
    }
    if (
      change.expectedHash !== undefined &&
      change.expectedHash !== null &&
      !sha256Pattern.test(change.expectedHash)
    ) {
      throw new LedgerError("invalid-argument", `Invalid expected hash for ${change.path}`);
    }
  }
}

async function readTransactionJournal(
  workspace: LedgerWorkspace,
  journalPath: string,
  expectedId: string,
): Promise<TransactionJournal> {
  if (!uuidPattern.test(expectedId)) throw invalidJournal(journalPath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      await readUtf8FileLimited(
        journalPath,
        workspace.config.limits.maxTotalDocumentBytes,
        "transaction journal",
      ),
    );
  } catch (error) {
    if (error instanceof SyntaxError) throw invalidJournal(journalPath);
    throw error;
  }
  if (parsed === null || typeof parsed !== "object") throw invalidJournal(journalPath);
  const value = parsed as Partial<TransactionJournal>;
  if (
    value.version !== 1 ||
    value.id !== expectedId ||
    typeof value.operation !== "string" ||
    !value.operation.trim() ||
    value.operation.length > maxOperationLength ||
    (value.phase !== "prepared" && value.phase !== "applying" && value.phase !== "committed") ||
    typeof value.createdAt !== "string" ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    !Array.isArray(value.changes) ||
    value.changes.length > workspace.config.limits.maxDocuments
  ) {
    throw invalidJournal(journalPath);
  }
  const seen = new Set<string>();
  const changes: JournalChange[] = [];
  for (const item of value.changes) {
    if (item === null || typeof item !== "object") throw invalidJournal(journalPath);
    const change = item as Partial<JournalChange>;
    if (
      typeof change.path !== "string" ||
      (change.originalHash !== null && !sha256Pattern.test(change.originalHash ?? "")) ||
      !sha256Pattern.test(change.nextHash ?? "") ||
      (change.mode !== undefined &&
        (!Number.isInteger(change.mode) || change.mode < 0 || change.mode > 0o177777))
    ) {
      throw invalidJournal(journalPath);
    }
    let canonicalPath: string;
    try {
      canonicalPath = assertSafeProjectRelativePath(change.path, "transaction journal path");
    } catch {
      throw invalidJournal(journalPath);
    }
    if (seen.has(canonicalPath)) throw invalidJournal(journalPath);
    seen.add(canonicalPath);
    changes.push({
      path: canonicalPath,
      originalHash: change.originalHash as string | null,
      nextHash: change.nextHash as string,
      mode: change.mode,
    });
  }
  return {
    version: 1,
    id: value.id,
    operation: value.operation,
    phase: value.phase,
    createdAt: value.createdAt,
    changes,
  };
}

function invalidJournal(journalPath: string): LedgerError {
  return new LedgerError(
    "invalid-transaction-journal",
    `Invalid transaction journal: ${journalPath}`,
    { path: journalPath },
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
