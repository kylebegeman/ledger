import { z } from "zod";
import {
  clearLedgerCatalogCache,
  inspectLedgerCatalogCache,
  readLedgerCatalog,
  type LedgerCatalogCacheInspection,
} from "../../catalogCache.js";
import { looseRecord, requireWorkspace } from "../shared.js";
import { defineOperation } from "../types.js";

const inspectionOutput = looseRecord({
  setting: z.string(),
  backend: z.string(),
  cachePath: z.string().optional(),
  exists: z.boolean(),
  entries: z.number(),
  bytes: z.number(),
  writtenAt: z.string().optional(),
  current: z.boolean(),
  note: z.string().optional(),
});

function formatInspection(data: LedgerCatalogCacheInspection): string {
  if (data.backend === "none") return `Ledger cache: disabled (${data.note ?? "no backend"}).`;
  if (!data.exists) return `Ledger cache: ${data.backend} backend, not written yet.`;
  const state = data.current ? "current" : "stale";
  const lines = [
    `Ledger cache: ${data.backend} backend, ${state}, ${data.entries} record(s), ${data.bytes} bytes at ${data.cachePath}.`,
  ];
  if (data.writtenAt) lines.push(`Written ${data.writtenAt}.`);
  if (data.note) lines.push(data.note);
  return lines.join("\n");
}

export const cacheStatusOperation = defineOperation<Record<string, never>, LedgerCatalogCacheInspection>({
  name: "cache.status",
  title: "Show catalog cache status",
  description: "Report the catalog cache backend, size, and freshness.",
  workspace: "required",
  mutates: false,
  input: z.strictObject({}),
  output: inspectionOutput,
  cli: {
    path: ["cache", "status"],
    usage: "ledger cache status [--json]",
    flags: {},
    json: true,
    help: `Reports which catalog cache backend is active, where it lives, how many records
it holds, and whether it matches the current configuration.`,
  },
  mcp: {
    tool: "ledger_cache_status",
    title: "Show catalog cache status",
    summary: (data) => ({ backend: data.backend, entries: data.entries, current: data.current }),
  },
  async run(context) {
    return { data: await inspectLedgerCatalogCache(requireWorkspace(context)) };
  },
  format: formatInspection,
});

interface CacheClearOutput {
  readonly removed: readonly string[];
}

export const cacheClearOperation = defineOperation<Record<string, never>, CacheClearOutput>({
  name: "cache.clear",
  title: "Clear the catalog cache",
  description: "Delete the catalog cache; the next read rebuilds it from source records.",
  workspace: "required",
  mutates: true,
  input: z.strictObject({}),
  output: looseRecord({ removed: z.array(z.string()) }),
  cli: {
    path: ["cache", "clear"],
    usage: "ledger cache clear [--json]",
    flags: {},
    json: true,
    help: `Deletes the catalog cache files under the configured cache directory. The
cache is a derived artifact; the next command rebuilds it from Markdown.`,
  },
  async run(context) {
    return { data: { removed: await clearLedgerCatalogCache(requireWorkspace(context)) } };
  },
  format(data) {
    return data.removed.length === 0
      ? "Ledger cache: nothing to clear."
      : `Ledger cache: removed ${data.removed.join(", ")}.`;
  },
});

interface CacheWarmOutput {
  readonly documents: number;
  readonly hits: number;
  readonly misses: number;
  readonly removed: number;
  readonly written: boolean;
  readonly backend: string;
}

export const cacheWarmOperation = defineOperation<Record<string, never>, CacheWarmOutput>({
  name: "cache.warm",
  title: "Warm the catalog cache",
  description: "Read every source record so the catalog cache is current.",
  workspace: "required",
  mutates: true,
  input: z.strictObject({}),
  output: looseRecord({
    documents: z.number(),
    hits: z.number(),
    misses: z.number(),
    removed: z.number(),
    written: z.boolean(),
    backend: z.string(),
  }),
  cli: {
    path: ["cache", "warm"],
    usage: "ledger cache warm [--json]",
    flags: {},
    json: true,
    help: "Reads every source record once so later commands and agents hit a current cache.",
  },
  async run(context) {
    const result = await readLedgerCatalog(requireWorkspace(context));
    return {
      data: {
        documents: result.documents.length,
        hits: result.cache.hits,
        misses: result.cache.misses,
        removed: result.cache.removed,
        written: result.cache.written,
        backend: result.cache.backend,
      },
    };
  },
  format(data) {
    return `Ledger cache: ${data.documents} record(s) via ${data.backend} backend (${data.hits} hit(s), ${data.misses} parsed, ${data.removed} removed${data.written ? ", written" : ""}).`;
  },
});
