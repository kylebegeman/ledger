export type LedgerDocumentKind =
  | "change"
  | "backlog"
  | "decision"
  | "release"
  | "product-note"
  | "feedback";

export type LedgerIssueLevel = "error" | "warning";

export type LedgerSchemaFieldType =
  | "string"
  | "string[]"
  | "number"
  | "boolean"
  | "date"
  | "object"
  | "array";

export type LedgerDocsAdoption = "none" | "partial" | "managed";

export type LedgerValidationProfile = "standard" | "strict";

export type LedgerIssueCode =
  | "duplicate-id"
  | "missing-frontmatter"
  | "missing-section"
  | "missing-reference"
  | "unknown-frontmatter"
  | "invalid-extension"
  | "quality";

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
    readonly profile: LedgerValidationProfile;
    readonly requireVerification: boolean;
    readonly requireChangedFiles: boolean;
    readonly requireInvariants: boolean;
    readonly baseline: string;
    readonly ignoreMissingRefsForStatuses: readonly string[];
    readonly requiredSections: Record<LedgerDocumentKind, readonly string[]>;
  };
  readonly schema: {
    readonly allowedFrontmatterFields: readonly string[];
    readonly extensions: Readonly<Record<string, LedgerSchemaFieldType>>;
  };
  readonly indexes: {
    readonly output: string;
  };
  readonly reports: {
    readonly output: string;
  };
  readonly render: {
    readonly output: string;
    readonly budgets: {
      readonly maxHtmlBytes: number;
      readonly maxSearchIndexBytes: number;
      readonly maxGraphBytes: number;
      readonly maxTotalBytes: number;
      readonly maxWriteMs: number;
    };
  };
  readonly performance: {
    readonly budgets: {
      readonly maxReadMs: number;
      readonly maxValidateMs: number;
      readonly maxIndexMs: number;
      readonly maxRenderModelMs: number;
      readonly maxSearchMs: number;
      readonly maxTotalMs: number;
    };
  };
  readonly docs: {
    readonly root: string;
    readonly managed: boolean;
    readonly adoption: LedgerDocsAdoption;
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
  readonly tags?: unknown;
  readonly decisions?: unknown;
  readonly backlog?: unknown;
  readonly supersedes?: unknown;
  readonly related?: unknown;
  readonly docs?: unknown;
  readonly docsImpact?: unknown;
  readonly entries?: unknown;
  readonly staleRefs?: unknown;
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
  readonly tags: readonly string[];
  readonly decisions: readonly string[];
  readonly backlog: readonly string[];
  readonly supersedes: readonly string[];
  readonly related: readonly string[];
  readonly docs: readonly string[];
  readonly extensions: Readonly<Record<string, unknown>>;
  readonly path: string;
  readonly sections: readonly string[];
}

export interface LedgerIssue {
  readonly level: LedgerIssueLevel;
  readonly code?: LedgerIssueCode;
  readonly path?: string;
  readonly field?: string;
  readonly target?: string;
  readonly message: string;
}

export interface LedgerValidationResult {
  readonly issues: readonly LedgerIssue[];
  readonly errors: readonly LedgerIssue[];
  readonly warnings: readonly LedgerIssue[];
  readonly suppressed: readonly LedgerIssue[];
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
  readonly byDecision: Record<string, readonly string[]>;
  readonly byBacklog: Record<string, readonly string[]>;
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
  readonly adoption: LedgerDocsAdoption;
  readonly files: readonly LedgerDocsFile[];
  readonly referencedDocs: readonly string[];
  readonly missingReferences: readonly string[];
  readonly unreferencedDocs: readonly string[];
  readonly scratchDocs: readonly string[];
  readonly generatedDocs: readonly string[];
  readonly unknownDocs: readonly string[];
}

export interface LedgerDocsRoute {
  readonly path: string;
  readonly classification: LedgerDocsClassification;
}

export interface LedgerDocsRoutingManifest {
  readonly version: 1;
  readonly generatedBy: "ledger";
  readonly generatedAt: string;
  readonly docsRoot: string;
  readonly routes: readonly LedgerDocsRoute[];
}

export interface LedgerDocsImpact {
  readonly docsRoot: string;
  readonly changedFiles: readonly string[];
  readonly sourceFiles: readonly string[];
  readonly docsFiles: readonly string[];
  readonly ledgerFiles: readonly string[];
  readonly changedEntries: readonly string[];
  readonly referencedDocs: readonly string[];
  readonly declarations: readonly LedgerDocsImpactDeclaration[];
  readonly missingDocsImpact: readonly string[];
}

export type LedgerDocsImpactStatus = "updated" | "not-needed" | "none";

export interface LedgerDocsImpactDeclaration {
  readonly entry: string;
  readonly status: LedgerDocsImpactStatus;
  readonly reason?: string;
  readonly docs: readonly string[];
}

export interface LedgerCoverageResult {
  readonly changedFiles: readonly string[];
  readonly requiredFiles: readonly string[];
  readonly coveredFiles: readonly string[];
  readonly missingFiles: readonly string[];
  readonly files: readonly LedgerCoverageFile[];
}

export interface LedgerCoverageFile {
  readonly path: string;
  readonly required: boolean;
  readonly covered: boolean;
  readonly status: "ignored" | "not-required" | "covered" | "missing";
  readonly requiredBy?: string;
  readonly ignoredBy?: string;
  readonly coveredBy: readonly string[];
}
