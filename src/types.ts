export type LedgerDocumentKind = "change" | "backlog" | "decision" | "release";

export type LedgerIssueLevel = "error" | "warning";

export interface LedgerConfig {
  readonly version: number;
  readonly project: string;
  readonly source: {
    readonly entries: string;
    readonly backlog: string;
    readonly decisions: string;
    readonly releases: string;
  };
  readonly ids: {
    readonly entryPrefix: string;
    readonly entryWidth: number;
    readonly backlogPrefix: string;
    readonly decisionPrefix: string;
  };
  readonly validation: {
    readonly requireVerification: boolean;
    readonly requireChangedFiles: boolean;
    readonly requireInvariants: boolean;
    readonly requiredSections: Record<LedgerDocumentKind, readonly string[]>;
  };
  readonly indexes: {
    readonly output: string;
  };
  readonly reports: {
    readonly output: string;
  };
  readonly render: {
    readonly output: string;
  };
  readonly docs: {
    readonly root: string;
    readonly managed: boolean;
    readonly routing: {
      readonly startHere: string;
      readonly manifest: string;
    };
  };
  readonly git: {
    readonly requireEntryFor: readonly string[];
    readonly ignore: readonly string[];
  };
}

export interface LedgerWorkspace {
  readonly projectRoot: string;
  readonly ledgerRoot: string;
  readonly configPath: string;
  readonly config: LedgerConfig;
}

export interface LedgerFrontmatter {
  readonly id?: unknown;
  readonly kind?: unknown;
  readonly title?: unknown;
  readonly date?: unknown;
  readonly updated?: unknown;
  readonly status?: unknown;
  readonly areas?: unknown;
  readonly files?: unknown;
  readonly symbols?: unknown;
  readonly commits?: unknown;
  readonly prs?: unknown;
  readonly release?: unknown;
  readonly decisions?: unknown;
  readonly backlog?: unknown;
  readonly supersedes?: unknown;
  readonly related?: unknown;
  readonly docs?: unknown;
  readonly entries?: unknown;
  readonly [key: string]: unknown;
}

export interface MarkdownSection {
  readonly title: string;
  readonly body: string;
  readonly line: number;
}

export interface ParsedLedgerDocument {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly raw: string;
  readonly frontmatterRaw: string;
  readonly frontmatter: LedgerFrontmatter;
  readonly body: string;
  readonly sections: readonly MarkdownSection[];
  readonly kind: LedgerDocumentKind;
}

export interface NormalizedLedgerDocument {
  readonly id: string;
  readonly kind: LedgerDocumentKind;
  readonly title: string;
  readonly status: string;
  readonly date: string;
  readonly updated?: string;
  readonly areas: readonly string[];
  readonly files: readonly string[];
  readonly symbols: readonly string[];
  readonly commits: readonly string[];
  readonly prs: readonly string[];
  readonly release?: string;
  readonly decisions: readonly string[];
  readonly backlog: readonly string[];
  readonly supersedes: readonly string[];
  readonly related: readonly string[];
  readonly docs: readonly string[];
  readonly path: string;
  readonly sections: readonly string[];
}

export interface LedgerIssue {
  readonly level: LedgerIssueLevel;
  readonly path?: string;
  readonly message: string;
}

export interface LedgerValidationResult {
  readonly issues: readonly LedgerIssue[];
  readonly errors: readonly LedgerIssue[];
  readonly warnings: readonly LedgerIssue[];
}

export interface LedgerManifest {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly project: string;
  readonly projectRoot: string;
  readonly documents: readonly NormalizedLedgerDocument[];
}

export interface LedgerIndexes {
  readonly manifest: LedgerManifest;
  readonly byFile: Record<string, readonly string[]>;
  readonly byArea: Record<string, readonly string[]>;
  readonly byRelease: Record<string, readonly string[]>;
  readonly bySymbol: Record<string, readonly string[]>;
}

export type LedgerDocsClassification =
  | "durable"
  | "routing"
  | "scratch"
  | "generated"
  | "unknown";

export interface LedgerDocsFile {
  readonly path: string;
  readonly classification: LedgerDocsClassification;
}

export interface LedgerDocsAudit {
  readonly docsRoot: string;
  readonly files: readonly LedgerDocsFile[];
  readonly referencedDocs: readonly string[];
  readonly missingReferences: readonly string[];
  readonly unreferencedDocs: readonly string[];
}

export interface LedgerDocsImpact {
  readonly docsRoot: string;
  readonly changedFiles: readonly string[];
  readonly sourceFiles: readonly string[];
  readonly docsFiles: readonly string[];
  readonly ledgerFiles: readonly string[];
  readonly changedEntries: readonly string[];
  readonly referencedDocs: readonly string[];
  readonly missingDocsImpact: readonly string[];
}

export interface LedgerCoverageResult {
  readonly changedFiles: readonly string[];
  readonly requiredFiles: readonly string[];
  readonly coveredFiles: readonly string[];
  readonly missingFiles: readonly string[];
}
