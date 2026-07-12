import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { LedgerError } from "./machine.js";

const chunkBytes = 64 * 1024;

export async function readUtf8FileLimited(
  filePath: string,
  maxBytes: number,
  kind: string,
): Promise<string> {
  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
  const handle = await open(filePath, constants.O_RDONLY | noFollow);
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) {
      throw new LedgerError("filesystem-error", `${filePath}: expected a regular file`, {
        path: filePath,
        kind,
      });
    }
    if (stats.size > maxBytes) throw sizeLimitError(filePath, maxBytes, kind);

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    while (true) {
      const buffer = Buffer.allocUnsafe(Math.min(chunkBytes, maxBytes - totalBytes + 1));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      totalBytes += bytesRead;
      if (totalBytes > maxBytes) throw sizeLimitError(filePath, maxBytes, kind);
      chunks.push(buffer.subarray(0, bytesRead));
    }
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, totalBytes));
    } catch (error) {
      throw new LedgerError(
        "invalid-utf8",
        `${filePath}: ${kind} is not valid UTF-8`,
        { path: filePath, kind },
        { cause: error },
      );
    }
  } finally {
    await handle.close();
  }
}

function sizeLimitError(filePath: string, maxBytes: number, kind: string): LedgerError {
  return new LedgerError(
    "resource-limit-exceeded",
    `${filePath}: ${kind} exceeds ${maxBytes} bytes`,
    { path: filePath, kind, limit: maxBytes },
  );
}
