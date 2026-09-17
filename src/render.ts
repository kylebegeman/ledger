import { readFile, readdir, stat as statFile } from "node:fs/promises";
import path from "node:path";
import { readUtf8FileLimited } from "./boundedFile.js";
import { isCoveragePattern } from "./coverage.js";
import { normalizeDocument, normalizePath } from "./documents.js";
import { extractBullets, getSectionBody } from "./query.js";
import {
  applyFileTransaction,
  ConcurrentFileChangeError,
  hashFileContent,
  type LedgerFileChange,
} from "./fileTransaction.js";
import { LedgerError } from "./machine.js";
import { renderRecordDetails, renderStaticReaderHtml, withoutOpenCodeSpan } from "./renderHtml.js";
import { searchTermsFor } from "./searchCore.js";
import { evidenceFreshness, type LedgerEvidenceIndex, type LedgerVerificationFreshness } from "./verify.js";
import type {
  LedgerIssue,
  LedgerValidationResult,
  LedgerWorkspace,
  NormalizedLedgerDocument,
  ParsedLedgerDocument,
} from "./types.js";

export { renderStaticReaderHtml } from "./renderHtml.js";
export type { RenderStaticReaderHtmlOptions } from "./renderHtml.js";

export type LedgerRenderProfile = "internal" | "public";

export interface LedgerRenderedDocument extends NormalizedLedgerDocument {
  readonly source: string;
  readonly sourceHref: string;
  readonly summary?: string;
  readonly why?: string;
  readonly publicNotes: readonly string[];
  readonly invariants: readonly string[];
  readonly verification: readonly string[];
  readonly issues: readonly LedgerIssue[];
  readonly warningCount: number;
  readonly errorCount: number;
  readonly hasDuplicateId: boolean;
  readonly hasMissingRefs: boolean;
  readonly coverageStatus: "none" | "exact" | "pattern";
  /** Freshness of verification evidence for change entries; `none` when no evidence was supplied. */
  readonly verificationStatus: LedgerVerificationFreshness;
  readonly verifiedAt?: string;
  readonly verifiedCommit?: string;
}

export interface LedgerStaticReaderModel {
  readonly schemaVersion: 1;
  readonly profile: LedgerRenderProfile;
  readonly generatedAt: string;
  readonly project: string;
  readonly documents: readonly LedgerRenderedDocument[];
  readonly searchIndex: readonly LedgerSearchDocument[];
  readonly graph: LedgerRelationshipGraph;
  readonly facets: {
    readonly areas: readonly LedgerFacet[];
    readonly releases: readonly LedgerFacet[];
    readonly statuses: readonly LedgerFacet[];
    readonly kinds: readonly LedgerFacet[];
    readonly tags: readonly LedgerFacet[];
  };
  readonly stats: {
    readonly documents: number;
    readonly changes: number;
    readonly backlog: number;
    readonly decisions: number;
    readonly releases: number;
    readonly productNotes: number;
    readonly feedback: number;
    readonly sessions: number;
  };
}

export interface LedgerFacet {
  readonly value: string;
  readonly count: number;
}

export interface LedgerSearchDocument {
  readonly id: string;
  readonly title: string;
  readonly path: string;
  readonly kind: string;
  readonly status: string;
  readonly release?: string;
  readonly areas: readonly string[];
  readonly tags: readonly string[];
  readonly files: readonly string[];
  readonly symbols: readonly string[];
  readonly docs: readonly string[];
  readonly publicNotes: readonly string[];
  readonly summary?: string;
  readonly why?: string;
  readonly fields: LedgerSearchFields;
  readonly terms: string;
}

export interface LedgerSearchFields {
  readonly id: string;
  readonly title: string;
  readonly path: string;
  readonly metadata: string;
  readonly files: string;
  readonly symbols: string;
  readonly docs: string;
  readonly summary: string;
  readonly context: string;
}

export interface LedgerRelationshipGraph {
  readonly nodes: readonly LedgerGraphNode[];
  readonly edges: readonly LedgerGraphEdge[];
}

export interface LedgerGraphNode {
  readonly id: string;
  readonly label: string;
  readonly type:
    | "record"
    | "file"
    | "doc"
    | "symbol"
    | "area"
    | "release"
    | "invariant"
    | "verification";
}

export interface LedgerGraphEdge {
  readonly source: string;
  readonly target: string;
  readonly type:
    | "file"
    | "doc"
    | "symbol"
    | "area"
    | "release"
    | "decision"
    | "backlog"
    | "related"
    | "supersedes"
    | "invariant"
    | "verification";
}

export interface RenderStaticReaderResult {
  readonly profile: LedgerRenderProfile;
  readonly outputPath: string;
  readonly searchIndexPath: string;
  readonly graphPath: string;
  readonly documents: number;
  readonly artifacts: readonly LedgerRenderArtifact[];
  readonly totalBytes: number;
  readonly writeMs: number;
  readonly budget: LedgerRenderBudgetResult;
}

export type LedgerRenderArtifactKind = "html" | "search-index" | "graph" | "details" | "sources";

export interface LedgerRenderArtifact {
  readonly kind: LedgerRenderArtifactKind;
  readonly path: string;
  /** Total bytes across every file of this artifact. */
  readonly bytes: number;
  /** Bytes of the largest single file; the per-artifact budget applies to it. */
  readonly largestBytes: number;
  /** Number of files that make up the artifact (shards or chunks). */
  readonly files: number;
  readonly maxBytes: number;
  readonly ok: boolean;
}

/** The search-index stub written when the index is sharded. */
export interface LedgerSearchIndexManifest {
  readonly shards: readonly string[];
  readonly documents: number;
}

export interface LedgerRenderBudgetResult {
  readonly ok: boolean;
  readonly totalBytes: number;
  readonly maxTotalBytes: number;
  readonly writeMs: number;
  readonly maxWriteMs: number;
  readonly artifacts: readonly LedgerRenderArtifact[];
}

interface LedgerSourceManifestEntry {
  readonly href: string;
  readonly hash: string;
  readonly bytes: number;
}

interface LedgerSourceManifestState {
  readonly content?: string;
  readonly hash: string | null;
  readonly sources: readonly LedgerSourceManifestEntry[];
}

const sourceManifestHref = "sources/.ledger-manifest.json";
const sourceHashPattern = /^[a-f0-9]{64}$/;
const generatedSourceHrefPattern =
  /^sources\/[A-Za-z0-9_-][A-Za-z0-9._-]{0,79}-[a-f0-9]{16}\.md$/;

export function buildStaticReaderModel(
  workspace: LedgerWorkspace,
  documents: readonly ParsedLedgerDocument[],
  options: {
    readonly validation?: LedgerValidationResult;
    readonly profile?: LedgerRenderProfile;
    readonly evidence?: LedgerEvidenceIndex;
  } = {},
): LedgerStaticReaderModel {
  const profile = options.profile ?? "internal";
  const issuesByPath = groupIssuesByPath(options.validation?.issues ?? []);
  const renderedDocuments = documents
    .filter((document) =>
      profile === "internal" ||
      (document.kind === "release" && document.frontmatter.status === "released"),
    )
    .map((document) => {
      const normalized = normalizeDocument(document);
      const issues = issuesByPath.get(document.relativePath) ?? [];
      const rendered: LedgerRenderedDocument = {
        ...normalized,
        source: document.raw,
        sourceHref: sourceHref(normalized.id, document.relativePath),
        summary: compactSection(getSectionBody(document, "Summary"), { codeSpans: true }),
        why: compactSection(getSectionBody(document, "Why")),
        publicNotes: extractBullets(getSectionBody(document, "Public Notes")),
        invariants: extractBullets(getSectionBody(document, "Invariants")),
        verification: extractBullets(getSectionBody(document, "Verification")),
        issues,
        warningCount: issues.filter((issue) => issue.level === "warning").length,
        errorCount: issues.filter((issue) => issue.level === "error").length,
        hasDuplicateId: issues.some((issue) => issue.code === "duplicate-id"),
        hasMissingRefs: issues.some((issue) => issue.code === "missing-reference"),
        coverageStatus: coverageStatus(normalized.files),
        ...verificationFields(workspace, document.kind, normalized.id, options.evidence),
      };
      return profile === "public" ? publicDocument(rendered) : rendered;
    })
    .sort(
      (left, right) =>
        right.date.localeCompare(left.date) ||
        right.id.localeCompare(left.id, undefined, { numeric: true }),
    );

  return {
    schemaVersion: 1,
    profile,
    generatedAt: new Date().toISOString(),
    project: workspace.config.project,
    documents: renderedDocuments,
    searchIndex: buildSearchIndex(renderedDocuments),
    graph: buildRelationshipGraph(renderedDocuments),
    facets: {
      areas: countFacet(renderedDocuments.flatMap((document) => document.areas)),
      releases: countFacet(
        renderedDocuments.map((document) => document.release ?? "__none"),
      ),
      statuses: countFacet(renderedDocuments.map((document) => document.status)),
      kinds: countFacet(renderedDocuments.map((document) => document.kind)),
      tags: countFacet(renderedDocuments.flatMap((document) => document.tags)),
    },
    stats: {
      documents: renderedDocuments.length,
      changes: renderedDocuments.filter((document) => document.kind === "change").length,
      backlog: renderedDocuments.filter((document) => document.kind === "backlog").length,
      decisions: renderedDocuments.filter((document) => document.kind === "decision").length,
      releases: renderedDocuments.filter((document) => document.kind === "release").length,
      productNotes: renderedDocuments.filter((document) => document.kind === "product-note").length,
      feedback: renderedDocuments.filter((document) => document.kind === "feedback").length,
      sessions: renderedDocuments.filter((document) => document.kind === "session").length,
    },
  };
}

export async function writeStaticReader(
  workspace: LedgerWorkspace,
  model: LedgerStaticReaderModel,
): Promise<RenderStaticReaderResult> {
  const startedAt = Date.now();
  const outputDirectory = renderOutputDirectory(workspace, model.profile);
  const outputPath = path.join(outputDirectory, "index.html");
  const searchIndexPath = path.join(outputDirectory, "search-index.json");
  const graphPath = path.join(outputDirectory, "graph.json");
  const iconSvg = await readIconSvg();
  const budgets = workspace.config.render.budgets;
  let html = renderStaticReaderHtml(model, { iconSvg });
  let detailFiles: readonly { readonly href: string; readonly content: string }[] = [];
  if (model.profile === "internal" && Buffer.byteLength(html, "utf8") > budgets.maxHtmlBytes) {
    const chunked = chunkRecordDetails(renderRecordDetails(model), Math.min(detailChunkTargetBytes, budgets.maxHtmlBytes));
    html = renderStaticReaderHtml(model, { iconSvg, detailChunks: chunked.hrefById });
    detailFiles = chunked.files;
  }
  const search = shardSearchIndex(serializedSearchIndex(model), budgets.maxSearchIndexBytes);
  const chunks = chunkRelationshipGraph(model.graph);
  const graph = `${JSON.stringify(chunks.records, null, 2)}\n`;
  // The public profile strips invariants and verification, so it has no contracts chunk.
  const contracts = model.profile === "internal" ? `${JSON.stringify(chunks.contracts, null, 2)}\n` : undefined;
  const sources = await sourceSidecars(workspace, model, outputDirectory);
  const staleShards = await staleChunkFiles(outputDirectory, searchShardDirectory, search.files.map((file) => file.href));
  const staleDetails = await staleChunkFiles(outputDirectory, detailChunkDirectory, detailFiles.map((file) => file.href));
  await applyFileTransaction(workspace, `render ${model.profile} reader`, [
    { path: normalizeOutputPath(workspace, outputPath), content: html },
    ...search.files.map((file) => ({
      path: normalizeOutputPath(workspace, path.join(outputDirectory, file.href)),
      content: file.content,
    })),
    ...staleShards.map((href) => ({ path: normalizeOutputPath(workspace, path.join(outputDirectory, href)), delete: true as const })),
    ...detailFiles.map((file) => ({
      path: normalizeOutputPath(workspace, path.join(outputDirectory, file.href)),
      content: file.content,
    })),
    ...staleDetails.map((href) => ({ path: normalizeOutputPath(workspace, path.join(outputDirectory, href)), delete: true as const })),
    { path: normalizeOutputPath(workspace, graphPath), content: graph },
    ...(contracts === undefined
      ? []
      : [{ path: normalizeOutputPath(workspace, path.join(outputDirectory, graphContractsHref)), content: contracts }]),
    ...sources,
  ]);
  const writeMs = Date.now() - startedAt;
  const budget = await checkRenderBudgets(workspace, writeMs, model.profile);
  return {
    profile: model.profile,
    outputPath: normalizeOutputPath(workspace, outputPath),
    searchIndexPath: normalizeOutputPath(workspace, searchIndexPath),
    graphPath: normalizeOutputPath(workspace, graphPath),
    documents: model.documents.length,
    artifacts: budget.artifacts,
    totalBytes: budget.totalBytes,
    writeMs,
    budget,
  };
}

/**
 * The search index as written to disk. `terms` is omitted because Node and
 * the browser both derive it from `fields` with `searchTermsFor`, which keeps
 * the artifact about 40% smaller with identical ranking.
 */
function serializedSearchIndex(model: LedgerStaticReaderModel): readonly unknown[] {
  if (model.profile === "internal") {
    return model.searchIndex.map(({ terms: _terms, ...document }) => document);
  }
  return model.documents.map((document) => {
    const metadata = [document.kind, document.status].join(" ");
    const context = document.publicNotes.join(" ");
    return {
      id: document.id,
      title: document.title,
      kind: "release",
      status: "released",
      publicNotes: document.publicNotes,
      fields: {
        id: document.id,
        title: document.title,
        metadata,
        context,
      },
    };
  });
}

const searchShardDirectory = "search";
const detailChunkDirectory = "details";
const graphContractsHref = "graph/contracts.json";
/** Target size of one detail chunk; small enough to fetch quickly when a record opens. */
const detailChunkTargetBytes = 250_000;

/**
 * Group record detail HTML into JSON chunk files (`details/NNN.json`, each an
 * object of record id to HTML) no larger than the target, in reader order.
 */
export function chunkRecordDetails(
  details: ReadonlyMap<string, string>,
  targetBytes: number,
): { readonly files: readonly { readonly href: string; readonly content: string }[]; readonly hrefById: ReadonlyMap<string, string> } {
  const groups: [string, string][][] = [];
  let current: [string, string][] = [];
  let currentBytes = 2;
  for (const [id, html] of details) {
    const bytes = Buffer.byteLength(JSON.stringify(id), "utf8") + Buffer.byteLength(JSON.stringify(html), "utf8") + 2;
    if (current.length > 0 && currentBytes + bytes > targetBytes) {
      groups.push(current);
      current = [];
      currentBytes = 2;
    }
    current.push([id, html]);
    currentBytes += bytes;
  }
  if (current.length > 0) groups.push(current);
  const hrefById = new Map<string, string>();
  const files = groups.map((group, index) => {
    const href = `${detailChunkDirectory}/${String(index).padStart(3, "0")}.json`;
    for (const [id] of group) hrefById.set(id, href);
    return { href, content: `${JSON.stringify(Object.fromEntries(group))}\n` };
  });
  return { files, hrefById };
}

/**
 * Split the serialized search index into shard files no larger than the
 * per-artifact budget. Returns a single `search-index.json` when it fits.
 */
export function shardSearchIndex(
  documents: readonly unknown[],
  maxBytes: number,
): { readonly files: readonly { readonly href: string; readonly content: string }[]; readonly manifest?: LedgerSearchIndexManifest } {
  const whole = `${JSON.stringify(documents, null, 2)}\n`;
  if (Buffer.byteLength(whole, "utf8") <= maxBytes || documents.length <= 1) {
    return { files: [{ href: "search-index.json", content: whole }] };
  }
  const shards: unknown[][] = [];
  let current: unknown[] = [];
  let currentBytes = 4;
  for (const document of documents) {
    const bytes = Buffer.byteLength(JSON.stringify(document, null, 2), "utf8") + 4;
    if (current.length > 0 && currentBytes + bytes > maxBytes) {
      shards.push(current);
      current = [];
      currentBytes = 4;
    }
    current.push(document);
    currentBytes += bytes;
  }
  if (current.length > 0) shards.push(current);
  const files = shards.map((shard, index) => ({
    href: `${searchShardDirectory}/${String(index).padStart(3, "0")}.json`,
    content: `${JSON.stringify(shard, null, 2)}\n`,
  }));
  const manifest: LedgerSearchIndexManifest = { shards: files.map((file) => file.href), documents: documents.length };
  return {
    files: [{ href: "search-index.json", content: `${JSON.stringify(manifest, null, 2)}\n` }, ...files],
    manifest,
  };
}

/**
 * Split the relationship graph into the record graph (records, files, docs,
 * symbols, areas, releases, and relationship edges) and the contracts chunk
 * (invariant and verification nodes with their edges).
 */
export function chunkRelationshipGraph(graph: LedgerRelationshipGraph): {
  readonly records: LedgerRelationshipGraph;
  readonly contracts: LedgerRelationshipGraph;
} {
  const contractTypes = new Set(["invariant", "verification"]);
  return {
    records: {
      nodes: graph.nodes.filter((node) => !contractTypes.has(node.type)),
      edges: graph.edges.filter((edge) => !contractTypes.has(edge.type)),
    },
    contracts: {
      nodes: graph.nodes.filter((node) => contractTypes.has(node.type)),
      edges: graph.edges.filter((edge) => contractTypes.has(edge.type)),
    },
  };
}

export async function checkRenderBudgets(
  workspace: LedgerWorkspace,
  writeMs = 0,
  profile: LedgerRenderProfile = "internal",
): Promise<LedgerRenderBudgetResult> {
  const outputDirectory = renderOutputDirectory(workspace, profile);
  const budgets = workspace.config.render.budgets;
  const artifactChecks: Promise<LedgerRenderArtifact>[] = [
    renderArtifact(workspace, "html", path.join(outputDirectory, "index.html"), budgets.maxHtmlBytes),
    renderSearchArtifact(workspace, outputDirectory, budgets.maxSearchIndexBytes),
    renderChunkedArtifact(
      workspace,
      "graph",
      outputDirectory,
      profile === "internal" ? ["graph.json", graphContractsHref] : ["graph.json"],
      budgets.maxGraphBytes,
    ),
  ];
  if (profile === "internal") {
    const detailHrefs = await listChunkFiles(outputDirectory, detailChunkDirectory);
    artifactChecks.push(
      renderChunkedArtifact(workspace, "details", outputDirectory, detailHrefs, budgets.maxHtmlBytes, { optional: true }),
    );
  }
  if (profile === "internal") {
    artifactChecks.push(renderSourcesArtifact(workspace, outputDirectory, budgets.maxTotalBytes));
  }
  const artifacts = await Promise.all(artifactChecks);
  const totalBytes = artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0);
  return {
    ok:
      artifacts.every((artifact) => artifact.ok) &&
      totalBytes <= budgets.maxTotalBytes &&
      writeMs <= budgets.maxWriteMs,
    totalBytes,
    maxTotalBytes: budgets.maxTotalBytes,
    writeMs,
    maxWriteMs: budgets.maxWriteMs,
    artifacts,
  };
}

export function buildSearchIndex(
  documents: readonly LedgerRenderedDocument[],
): readonly LedgerSearchDocument[] {
  return documents.map((document) => {
    const fields = searchFields(document);
    const terms = searchTermsFor(fields);
    return {
      id: document.id,
      title: document.title,
      path: document.path,
      kind: document.kind,
      status: document.status,
      release: document.release,
      areas: document.areas,
      tags: document.tags,
      files: document.files,
      symbols: document.symbols,
      docs: document.docs,
      publicNotes: document.publicNotes,
      summary: document.summary,
      why: document.why,
      fields,
      terms,
    };
  });
}

function searchFields(document: LedgerRenderedDocument): LedgerSearchFields {
  return {
    id: document.id,
    title: document.title,
    path: document.path,
    metadata: [
      document.kind,
      document.status,
      document.release ?? "",
      ...document.areas,
      ...document.tags,
      ...document.decisions,
      ...document.backlog,
      ...document.supersedes,
      ...document.related,
    ].join(" "),
    files: document.files.join(" "),
    symbols: document.symbols.join(" "),
    docs: document.docs.join(" "),
    summary: [document.summary ?? "", document.why ?? ""].join(" "),
    context: [
      ...document.publicNotes,
      ...document.invariants,
      ...document.verification,
      ...document.issues.map((issue) => issue.message),
    ].join(" "),
  };
}



export function buildRelationshipGraph(
  documents: readonly LedgerRenderedDocument[],
): LedgerRelationshipGraph {
  const nodes = new Map<string, LedgerGraphNode>();
  const edges: LedgerGraphEdge[] = [];

  const addNode = (node: LedgerGraphNode) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  };
  const addEdge = (source: string, target: string, type: LedgerGraphEdge["type"]) => {
    edges.push({ source, target, type });
  };

  for (const document of documents) {
    const recordId = `record:${document.id}`;
    addNode({ id: recordId, label: document.id, type: "record" });
    for (const file of document.files) {
      const target = `file:${file}`;
      addNode({ id: target, label: file, type: "file" });
      addEdge(recordId, target, "file");
    }
    for (const doc of document.docs) {
      const target = `doc:${doc}`;
      addNode({ id: target, label: doc, type: "doc" });
      addEdge(recordId, target, "doc");
    }
    for (const symbol of document.symbols) {
      const target = `symbol:${symbol}`;
      addNode({ id: target, label: symbol, type: "symbol" });
      addEdge(recordId, target, "symbol");
    }
    for (const area of document.areas) {
      const target = `area:${area}`;
      addNode({ id: target, label: area, type: "area" });
      addEdge(recordId, target, "area");
    }
    document.invariants.forEach((invariant, index) => {
      const target = `invariant:${document.id}:${index + 1}`;
      addNode({ id: target, label: invariant, type: "invariant" });
      addEdge(recordId, target, "invariant");
    });
    document.verification.forEach((verification, index) => {
      const target = `verification:${document.id}:${index + 1}`;
      addNode({ id: target, label: verification, type: "verification" });
      addEdge(recordId, target, "verification");
    });
    if (document.release) {
      const target = `release:${document.release}`;
      addNode({ id: target, label: document.release, type: "release" });
      addEdge(recordId, target, "release");
    }
    for (const decision of document.decisions) addEdge(recordId, `record:${decision}`, "decision");
    for (const backlog of document.backlog) addEdge(recordId, `record:${backlog}`, "backlog");
    for (const related of document.related) addEdge(recordId, `record:${related}`, "related");
    for (const superseded of document.supersedes) addEdge(recordId, `record:${superseded}`, "supersedes");
  }

  return {
    nodes: [...nodes.values()].sort((left, right) => left.id.localeCompare(right.id)),
    edges: edges.sort((left, right) =>
      left.source.localeCompare(right.source) ||
      left.target.localeCompare(right.target) ||
      left.type.localeCompare(right.type),
    ),
  };
}

function groupIssuesByPath(issues: readonly LedgerIssue[]): ReadonlyMap<string, readonly LedgerIssue[]> {
  const grouped = new Map<string, LedgerIssue[]>();
  for (const issue of issues) {
    if (!issue.path) continue;
    grouped.set(issue.path, [...(grouped.get(issue.path) ?? []), issue]);
  }
  return grouped;
}

function coverageStatus(files: readonly string[]): "none" | "exact" | "pattern" {
  if (files.length === 0) return "none";
  return files.some(isCoveragePattern) ? "pattern" : "exact";
}

async function renderArtifact(
  workspace: LedgerWorkspace,
  kind: LedgerRenderArtifactKind,
  filePath: string,
  maxBytes: number,
): Promise<LedgerRenderArtifact> {
  let bytes = 0;
  try {
    bytes = (await statFile(filePath)).size;
  } catch (error) {
    if (!isCode(error, "ENOENT")) throw error;
  }
  return {
    kind,
    path: normalizeOutputPath(workspace, filePath),
    bytes,
    largestBytes: bytes,
    files: bytes > 0 ? 1 : 0,
    maxBytes,
    ok: bytes > 0 && bytes <= maxBytes,
  };
}

/** Search index accounting: the stub plus every shard it lists, or the single file. */
async function renderSearchArtifact(
  workspace: LedgerWorkspace,
  outputDirectory: string,
  maxBytes: number,
): Promise<LedgerRenderArtifact> {
  const stubPath = path.join(outputDirectory, "search-index.json");
  let hrefs: string[] = ["search-index.json"];
  try {
    const parsed: unknown = JSON.parse(
      await readUtf8FileLimited(stubPath, workspace.config.limits.maxTotalDocumentBytes, "search index"),
    );
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Array.isArray((parsed as LedgerSearchIndexManifest).shards)) {
      hrefs = ["search-index.json", ...(parsed as LedgerSearchIndexManifest).shards.filter((href) => typeof href === "string")];
    }
  } catch (error) {
    if (!isCode(error, "ENOENT") && !(error instanceof SyntaxError)) throw error;
  }
  return renderChunkedArtifact(workspace, "search-index", outputDirectory, hrefs, maxBytes);
}

/** Accounting for an artifact made of several files: total bytes, largest file, per-file budget. */
async function renderChunkedArtifact(
  workspace: LedgerWorkspace,
  kind: LedgerRenderArtifactKind,
  outputDirectory: string,
  hrefs: readonly string[],
  maxBytes: number,
  options: { readonly optional?: boolean } = {},
): Promise<LedgerRenderArtifact> {
  let bytes = 0;
  let largestBytes = 0;
  let files = 0;
  for (const href of hrefs) {
    try {
      const size = (await statFile(path.join(outputDirectory, href))).size;
      bytes += size;
      largestBytes = Math.max(largestBytes, size);
      files += 1;
    } catch (error) {
      if (!isCode(error, "ENOENT")) throw error;
    }
  }
  return {
    kind,
    path: normalizeOutputPath(workspace, path.join(outputDirectory, hrefs[0] ?? kind)),
    bytes,
    largestBytes,
    files,
    maxBytes,
    ok: (files > 0 || Boolean(options.optional)) && largestBytes <= maxBytes,
  };
}

/** Numbered chunk files (`NNN.json`) currently in a chunk directory, as hrefs. */
async function listChunkFiles(outputDirectory: string, chunkDirectory: string): Promise<readonly string[]> {
  let names: string[];
  try {
    names = await readdir(path.join(outputDirectory, chunkDirectory));
  } catch (error) {
    if (isCode(error, "ENOENT")) return [];
    throw error;
  }
  return names
    .filter((name) => /^\d{3}\.json$/.test(name))
    .sort()
    .map((name) => `${chunkDirectory}/${name}`);
}

/** Chunk files left over from an earlier render that the new render no longer writes. */
async function staleChunkFiles(
  outputDirectory: string,
  chunkDirectory: string,
  current: readonly string[],
): Promise<readonly string[]> {
  const keep = new Set(current);
  return (await listChunkFiles(outputDirectory, chunkDirectory)).filter((href) => !keep.has(href));
}

function sourceHref(id: string, documentPath: string): string {
  const stem = id
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 80) || "record";
  const pathHash = hashFileContent(normalizePath(documentPath)).slice(0, 16);
  return `sources/${stem}-${pathHash}.md`;
}

async function sourceSidecars(
  workspace: LedgerWorkspace,
  model: LedgerStaticReaderModel,
  outputDirectory: string,
): Promise<readonly LedgerFileChange[]> {
  if (model.profile !== "internal") return [];
  if (model.documents.length > workspace.config.limits.maxDocuments) {
    throw new LedgerError(
      "resource-limit-exceeded",
      `Rendered sources exceed ${workspace.config.limits.maxDocuments} documents`,
      { kind: "render-source-documents", limit: workspace.config.limits.maxDocuments },
    );
  }
  let totalBytes = 0;
  const sourceChanges: LedgerFileChange[] = [];
  const sources = new Map<string, LedgerSourceManifestEntry>();
  const sourceContents = new Map<string, string>();
  for (const document of model.documents) {
    const bytes = Buffer.byteLength(document.source, "utf8");
    if (bytes > workspace.config.limits.maxDocumentBytes) {
      throw new LedgerError(
        "resource-limit-exceeded",
        `${document.path}: rendered source exceeds ${workspace.config.limits.maxDocumentBytes} bytes`,
        { kind: "render-source-bytes", limit: workspace.config.limits.maxDocumentBytes },
      );
    }
    totalBytes += bytes;
    if (totalBytes > workspace.config.limits.maxTotalDocumentBytes) {
      throw new LedgerError(
        "resource-limit-exceeded",
        `Rendered sources exceed ${workspace.config.limits.maxTotalDocumentBytes} bytes`,
        { kind: "render-source-total-bytes", limit: workspace.config.limits.maxTotalDocumentBytes },
      );
    }
    const href = sourceHref(document.id, document.path);
    if (sources.has(href)) {
      throw new LedgerError(
        "render-validation-failed",
        `Multiple records resolve to the rendered source path ${href}`,
        { path: href },
      );
    }
    const hash = hashFileContent(document.source);
    sources.set(href, { href, hash, bytes });
    sourceContents.set(href, document.source);
  }

  const manifestPath = path.join(outputDirectory, sourceManifestHref);
  const previous = await readSourceManifest(workspace, manifestPath);
  const previousSources = new Map(previous.sources.map((source) => [source.href, source]));
  for (const [href, content] of sourceContents) {
    const sourcePath = path.join(outputDirectory, href);
    const source = sources.get(href)!;
    sourceChanges.push({
      path: normalizeOutputPath(workspace, sourcePath),
      content,
      expectedHash: await activeSourceExpectedHash(
        workspace,
        sourcePath,
        source.hash,
        previous,
        previousSources.get(href),
      ),
    });
  }
  for (const source of previous.sources) {
    if (sources.has(source.href)) continue;
    const sourcePath = path.join(outputDirectory, source.href);
    let content: string;
    try {
      content = await readUtf8FileLimited(
        sourcePath,
        workspace.config.limits.maxDocumentBytes,
        "rendered source",
      );
    } catch (error) {
      if (isCode(error, "ENOENT")) continue;
      throw error;
    }
    const normalizedPath = normalizeOutputPath(workspace, sourcePath);
    if (hashFileContent(content) !== source.hash) {
      throw new ConcurrentFileChangeError(normalizedPath);
    }
    sourceChanges.push({
      path: normalizedPath,
      delete: true,
      expectedHash: source.hash,
    });
  }

  const manifest = `${JSON.stringify({
    schemaVersion: 1,
    sources: [...sources.values()].sort((left, right) => left.href.localeCompare(right.href)),
  }, null, 2)}\n`;
  sourceChanges.push({
    path: normalizeOutputPath(workspace, manifestPath),
    content: manifest,
    expectedHash: previous.hash,
  });
  return sourceChanges;
}

async function activeSourceExpectedHash(
  workspace: LedgerWorkspace,
  sourcePath: string,
  nextHash: string,
  manifest: LedgerSourceManifestState,
  previous?: LedgerSourceManifestEntry,
): Promise<string | null> {
  if (!previous && manifest.hash !== null) return null;
  let currentHash: string | null;
  try {
    currentHash = hashFileContent(
      await readUtf8FileLimited(
        sourcePath,
        workspace.config.limits.maxDocumentBytes,
        "rendered source",
      ),
    );
  } catch (error) {
    if (isCode(error, "ENOENT")) return null;
    throw error;
  }
  const expectedHash = previous?.hash ?? nextHash;
  if (currentHash !== expectedHash) {
    throw new ConcurrentFileChangeError(normalizeOutputPath(workspace, sourcePath));
  }
  return currentHash;
}

async function readSourceManifest(
  workspace: LedgerWorkspace,
  manifestPath: string,
): Promise<LedgerSourceManifestState> {
  let content: string;
  try {
    content = await readUtf8FileLimited(
      manifestPath,
      workspace.config.limits.maxTotalDocumentBytes,
      "rendered source manifest",
    );
  } catch (error) {
    if (isCode(error, "ENOENT")) return { hash: null, sources: [] };
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw invalidSourceManifest(manifestPath, error);
  }
  if (parsed === null || typeof parsed !== "object") {
    throw invalidSourceManifest(manifestPath);
  }
  const value = parsed as {
    readonly schemaVersion?: unknown;
    readonly sources?: unknown;
  };
  if (
    value.schemaVersion !== 1 ||
    !Array.isArray(value.sources) ||
    value.sources.length > workspace.config.limits.maxDocuments
  ) {
    throw invalidSourceManifest(manifestPath);
  }

  const seen = new Set<string>();
  const sources: LedgerSourceManifestEntry[] = [];
  for (const item of value.sources) {
    if (item === null || typeof item !== "object") throw invalidSourceManifest(manifestPath);
    const source = item as Partial<LedgerSourceManifestEntry>;
    if (
      typeof source.href !== "string" ||
      !generatedSourceHrefPattern.test(source.href) ||
      typeof source.hash !== "string" ||
      !sourceHashPattern.test(source.hash) ||
      !Number.isSafeInteger(source.bytes) ||
      (source.bytes ?? -1) < 0 ||
      seen.has(source.href)
    ) {
      throw invalidSourceManifest(manifestPath);
    }
    seen.add(source.href);
    sources.push({ href: source.href, hash: source.hash, bytes: source.bytes! });
  }
  return { content, hash: hashFileContent(content), sources };
}

async function renderSourcesArtifact(
  workspace: LedgerWorkspace,
  outputDirectory: string,
  maxBytes: number,
): Promise<LedgerRenderArtifact> {
  const manifestPath = path.join(outputDirectory, sourceManifestHref);
  const manifest = await readSourceManifest(workspace, manifestPath);
  let bytes = manifest.content === undefined ? 0 : Buffer.byteLength(manifest.content, "utf8");
  let complete = manifest.content !== undefined;
  for (const source of manifest.sources) {
    try {
      const content = await readUtf8FileLimited(
        path.join(outputDirectory, source.href),
        workspace.config.limits.maxDocumentBytes,
        "rendered source",
      );
      const sourceBytes = Buffer.byteLength(content, "utf8");
      bytes += sourceBytes;
      if (sourceBytes !== source.bytes || hashFileContent(content) !== source.hash) complete = false;
    } catch (error) {
      if (!isCode(error, "ENOENT")) throw error;
      complete = false;
    }
  }
  return {
    kind: "sources",
    path: normalizeOutputPath(workspace, path.join(outputDirectory, "sources")),
    bytes,
    largestBytes: bytes,
    files: manifest.sources.length + 1,
    maxBytes,
    ok: complete && bytes <= maxBytes,
  };
}

function invalidSourceManifest(manifestPath: string, cause?: unknown): LedgerError {
  return new LedgerError(
    "render-validation-failed",
    `Invalid rendered source manifest: ${manifestPath}`,
    { path: manifestPath },
    cause === undefined ? undefined : { cause },
  );
}

function countFacet(values: readonly string[]): readonly LedgerFacet[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}

/**
 * One line of a section, shortened to an excerpt. `codeSpans` keeps the cut
 * from landing inside a Markdown code span, for text the reader renders as
 * prose; search-only text such as `why` keeps every character it can.
 */
function compactSection(value: string | undefined, options: { readonly codeSpans?: boolean } = {}): string | undefined {
  const compacted = value?.replace(/\s+/g, " ").trim();
  if (!compacted) return undefined;
  if (compacted.length <= 320) return compacted;
  const cut = compacted.slice(0, 317);
  return `${(options.codeSpans ? withoutOpenCodeSpan(cut) : cut).trimEnd()}...`;
}

function verificationFields(
  workspace: LedgerWorkspace,
  kind: string,
  id: string,
  evidence: LedgerEvidenceIndex | undefined,
): Pick<LedgerRenderedDocument, "verificationStatus" | "verifiedAt" | "verifiedCommit"> {
  if (!evidence || kind !== "change") return { verificationStatus: "none" };
  const entry = evidence.entries[id];
  return {
    verificationStatus: evidenceFreshness(entry, workspace.config.verification.maxAgeDays),
    ...(entry ? { verifiedAt: entry.ranAt, verifiedCommit: entry.commit } : {}),
  };
}

function publicDocument(document: LedgerRenderedDocument): LedgerRenderedDocument {
  return {
    id: document.id,
    kind: "release",
    title: document.title,
    status: "released",
    date: document.date,
    updated: document.updated,
    publicNotes: document.publicNotes,
    source: "",
    sourceHref: "",
    summary: undefined,
    why: undefined,
    areas: [],
    files: [],
    symbols: [],
    commits: [],
    prs: [],
    release: undefined,
    tags: [],
    decisions: [],
    backlog: [],
    supersedes: [],
    related: [],
    docs: [],
    extensions: {},
    path: "",
    sections: [],
    invariants: [],
    verification: [],
    verificationStatus: "none",
    issues: [],
    warningCount: 0,
    errorCount: 0,
    hasDuplicateId: false,
    hasMissingRefs: false,
    coverageStatus: "none",
  };
}

function renderOutputDirectory(
  workspace: LedgerWorkspace,
  profile: LedgerRenderProfile,
): string {
  const output = path.join(workspace.projectRoot, workspace.config.render.output);
  return profile === "public" ? path.join(output, "public") : output;
}

function normalizeOutputPath(workspace: LedgerWorkspace, outputPath: string): string {
  return normalizePath(path.relative(workspace.projectRoot, outputPath));
}

async function readIconSvg(): Promise<string | undefined> {
  try {
    return await readFile(new URL("../assets/ledger.svg", import.meta.url), "utf8");
  } catch {
    return undefined;
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
