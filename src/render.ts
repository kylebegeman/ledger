import { readFile, stat as statFile } from "node:fs/promises";
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
import { renderStaticReaderHtml } from "./renderHtml.js";
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

export type LedgerRenderArtifactKind = "html" | "search-index" | "graph" | "sources";

export interface LedgerRenderArtifact {
  readonly kind: LedgerRenderArtifactKind;
  readonly path: string;
  readonly bytes: number;
  readonly maxBytes: number;
  readonly ok: boolean;
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
        summary: compactSection(getSectionBody(document, "Summary")),
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
  const html = renderStaticReaderHtml(model, { iconSvg: await readIconSvg() });
  const searchIndex = `${JSON.stringify(serializedSearchIndex(model), null, 2)}\n`;
  const graph = `${JSON.stringify(model.graph, null, 2)}\n`;
  const sources = await sourceSidecars(workspace, model, outputDirectory);
  await applyFileTransaction(workspace, `render ${model.profile} reader`, [
    { path: normalizeOutputPath(workspace, outputPath), content: html },
    { path: normalizeOutputPath(workspace, searchIndexPath), content: searchIndex },
    { path: normalizeOutputPath(workspace, graphPath), content: graph },
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

function serializedSearchIndex(model: LedgerStaticReaderModel): readonly unknown[] {
  if (model.profile === "internal") return model.searchIndex;
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
      terms: [document.id, document.title, metadata, context].join(" "),
    };
  });
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
    renderArtifact(
      workspace,
      "search-index",
      path.join(outputDirectory, "search-index.json"),
      budgets.maxSearchIndexBytes,
    ),
    renderArtifact(workspace, "graph", path.join(outputDirectory, "graph.json"), budgets.maxGraphBytes),
  ];
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
    const terms = searchTerms(document);
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

function searchTerms(document: LedgerRenderedDocument): string {
  return [
    document.id,
    document.title,
    document.kind,
    document.status,
    document.release ?? "",
    document.path,
    ...document.areas,
    ...document.tags,
    ...document.files,
    ...document.symbols,
    ...document.docs,
    ...document.decisions,
    ...document.backlog,
    ...document.supersedes,
    ...document.related,
    document.summary ?? "",
    document.why ?? "",
    ...document.publicNotes,
    ...document.invariants,
    ...document.verification,
    ...document.issues.map((issue) => issue.message),
  ].join(" ");
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
    maxBytes,
    ok: bytes > 0 && bytes <= maxBytes,
  };
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

function compactSection(value: string | undefined): string | undefined {
  const compacted = value?.replace(/\s+/g, " ").trim();
  if (!compacted) return undefined;
  if (compacted.length <= 320) return compacted;
  return `${compacted.slice(0, 317).trimEnd()}...`;
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
