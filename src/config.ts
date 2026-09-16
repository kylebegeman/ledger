import { parse as parseYaml, parseDocument } from "yaml";
import { readUtf8FileLimited } from "./boundedFile.js";
import { assertSafeProjectRelativePath, normalizeProjectRelativePath } from "./projectPaths.js";
import { LedgerError } from "./machine.js";
import type {
  LedgerConfig,
  LedgerDocsAdoption,
  LedgerDocumentKind,
  LedgerSchemaFieldType,
} from "./types.js";

const documentKinds: readonly LedgerDocumentKind[] = [
  "change",
  "backlog",
  "decision",
  "release",
  "product-note",
  "feedback",
  "session",
];

const requiredSections: Record<LedgerDocumentKind, readonly string[]> = {
  change: [
    "Summary",
    "Why",
    "Changed Files",
    "Behavior And UX Impact",
    "Invariants",
    "Verification",
  ],
  backlog: [
    "Problem",
    "Desired Outcome",
    "Scope",
    "Acceptance Checks",
    "Risks",
    "Promotion Notes",
  ],
  decision: ["Context", "Decision", "Consequences", "Revisit Criteria"],
  release: ["Summary", "Public Notes", "Changes", "Verification", "Known Issues"],
  "product-note": ["Context", "Finding", "Impact", "Recommendation", "Follow-ups"],
  feedback: ["Context", "Finding", "Impact", "Recommendation", "Follow-ups"],
  session: ["Summary", "Learned", "Next"],
};

export const currentConfigVersion = 1;
const maxConfigBytes = 1_000_000;
const maxYamlAliases = 50;

export interface LedgerConfigMigration {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly description: string;
}

export interface LedgerConfigMigrationResult {
  readonly config: Record<string, unknown>;
  readonly migrations: readonly LedgerConfigMigration[];
}

export const defaultConfig: LedgerConfig = {
  version: currentConfigVersion,
  project: "ledger-project",
  source: {
    entries: ".ledger/entries",
    backlog: ".ledger/backlog",
    decisions: ".ledger/decisions",
    releases: ".ledger/releases",
    sessions: ".ledger/sessions",
  },
  ids: {
    entryPrefix: "",
    entryWidth: 4,
    backlogPrefix: "B",
    backlogWidth: 3,
    decisionPrefix: "D",
    decisionWidth: 3,
    sessionPrefix: "S",
    sessionWidth: 4,
  },
  sessions: {
    expiresInDays: 7,
  },
  agents: {
    command: "ledger",
  },
  validation: {
    profile: "standard",
    requireVerification: true,
    requireChangedFiles: true,
    requireInvariants: true,
    baseline: ".ledger/reports/validation-baseline.json",
    ignoreMissingRefsForStatuses: ["historical"],
    requiredSections,
  },
  schema: {
    allowedFrontmatterFields: [],
    extensions: {},
  },
  verification: {
    allow: [
      "npm run **",
      "npm test **",
      "npm ci",
      "npx vitest **",
      "npx tsc **",
      "node dist/cli.js ci **",
      "node dist/cli.js doctor **",
      "node dist/cli.js validate **",
      "node dist/cli.js ready **",
      "node dist/cli.js stale **",
      "node dist/cli.js coverage **",
      "ledger ci **",
      "ledger doctor **",
      "ledger validate **",
      "ledger ready **",
      "ledger stale **",
      "ledger coverage **",
    ],
    evidence: ".ledger/reports/evidence.json",
    maxAgeDays: 30,
    timeoutMs: 600_000,
  },
  indexes: {
    output: ".ledger/indexes",
  },
  reports: {
    output: ".ledger/reports",
  },
  render: {
    output: ".ledger/dist",
    budgets: {
      maxHtmlBytes: 1_000_000,
      maxSearchIndexBytes: 500_000,
      maxGraphBytes: 500_000,
      maxTotalBytes: 2_000_000,
      maxWriteMs: 3_000,
    },
  },
  performance: {
    budgets: {
      maxReadMs: 1_000,
      maxValidateMs: 1_000,
      maxIndexMs: 1_000,
      maxRenderModelMs: 1_000,
      maxSearchMs: 1_000,
      maxTotalMs: 4_000,
    },
  },
  limits: {
    maxDocuments: 10_000,
    maxDocumentBytes: 2_000_000,
    maxTotalDocumentBytes: 64_000_000,
    maxDirectoryDepth: 12,
  },
  cache: {
    backend: "auto",
    output: ".ledger/cache",
  },
  docs: {
    root: "docs",
    managed: false,
    adoption: "partial",
    routing: {
      startHere: "docs/llm/START_HERE.md",
      manifest: "docs/llm/manifest.json",
    },
  },
  git: {
    requireEntryFor: ["src/**", "test/**", "docs/**"],
    ignore: [
      ".ledger/indexes/**",
      ".ledger/reports/**",
      ".ledger/dist/**",
    ".ledger/cache/**",
      "docs/llm/manifest.json",
      "docs/llm/START_HERE.md",
      "node_modules/**",
      "dist/**",
      "build/**",
      "coverage/**",
      ".next/**",
      "out/**",
      "vendor/**",
      "generated/**",
      "**/generated/**",
    ],
    coverage: "current",
  },
};

export async function readLedgerConfig(configPath: string): Promise<LedgerConfig> {
  const raw = await readUtf8FileLimited(configPath, maxConfigBytes, "config");
  let parsed: unknown;
  try {
    parsed = parseYaml(raw, { maxAliasCount: maxYamlAliases });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new LedgerError("invalid-yaml", `${configPath}: invalid YAML: ${message}`, {
      configPath,
    }, { cause: error });
  }
  return parseLedgerConfig(parsed, configPath);
}

/**
 * The raw config with `agents.command` set, preserving comments, quoting, and
 * key order. Returns the input unchanged when the value already matches.
 */
export function renderConfigWithAgentsCommand(raw: string, command: string): string {
  // parseDocument never expands aliases, so the alias limit applied by parse does not apply here.
  const doc = parseDocument(raw);
  if (doc.getIn(["agents", "command"]) === command) return raw;
  doc.setIn(["agents", "command"], command);
  const rendered = doc.toString({ lineWidth: 0 });
  // The document renders with LF; keep CRLF when the file uses it.
  return raw.includes("\r\n") ? rendered.replace(/\r?\n/g, "\r\n") : rendered;
}

/** The rule `agents.command` and `hooks install --command` must satisfy. */
export const agentsCommandRule =
  "must be a non-empty single-line command without backticks or surrounding whitespace";

/** A command prefix agents can run and Markdown can quote in a code span. */
export function isValidAgentsCommand(command: string): boolean {
  return command.trim().length > 0 && command === command.trim() && !/[`\r\n]/.test(command);
}

export function parseLedgerConfig(parsed: unknown, configPath = "config.yaml"): LedgerConfig {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new LedgerError("invalid-config", `${configPath}: config must be a YAML object`, {
      configPath,
    });
  }
  const source = parsed as Record<string, unknown>;
  validatePartialConfig(source, configPath);
  const migrated = migrateLedgerConfigObject(source, configPath);
  const config = normalizeConfigPaths(mergeConfig(defaultConfig, migrated.config as PartialLedgerConfig));
  validateLedgerConfig(config, configPath);
  return config;
}

export function migrateLedgerConfigObject(
  config: Record<string, unknown>,
  configPath = "config.yaml",
): LedgerConfigMigrationResult {
  const version = rawConfigVersion(config, configPath);
  if (version > currentConfigVersion) {
    fail(configPath, `version ${version} is newer than supported version ${currentConfigVersion}`);
  }
  if (version === currentConfigVersion) {
    return {
      config: { ...config },
      migrations: [],
    };
  }
  if (version === 0) {
    return {
      config: migrateConfigV0ToV1(config),
      migrations: [
        {
          fromVersion: 0,
          toVersion: 1,
          description: "Add explicit config version and docs adoption defaults.",
        },
      ],
    };
  }
  fail(configPath, `version ${version} cannot be migrated`);
}

type PartialLedgerConfig = {
  readonly version?: number;
  readonly project?: string;
  readonly source?: Partial<LedgerConfig["source"]>;
  readonly ids?: Partial<LedgerConfig["ids"]>;
  readonly sessions?: Partial<LedgerConfig["sessions"]>;
  readonly agents?: Partial<LedgerConfig["agents"]>;
  readonly validation?: Partial<LedgerConfig["validation"]> & {
    readonly requiredSections?: Partial<Record<LedgerDocumentKind, readonly string[]>>;
  };
  readonly schema?: Partial<LedgerConfig["schema"]>;
  readonly verification?: Partial<LedgerConfig["verification"]>;
  readonly indexes?: Partial<LedgerConfig["indexes"]>;
  readonly reports?: Partial<LedgerConfig["reports"]>;
  readonly render?: Partial<LedgerConfig["render"]>;
  readonly performance?: Partial<LedgerConfig["performance"]>;
  readonly limits?: Partial<LedgerConfig["limits"]>;
  readonly cache?: Partial<LedgerConfig["cache"]>;
  readonly docs?: Partial<LedgerConfig["docs"]> & {
    readonly routing?: Partial<LedgerConfig["docs"]["routing"]>;
  };
  readonly git?: Partial<LedgerConfig["git"]>;
};

function rawConfigVersion(config: Record<string, unknown>, configPath: string): number {
  const version = config.version ?? currentConfigVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 0) {
    fail(configPath, "version must be a non-negative integer");
  }
  return version;
}

function migrateConfigV0ToV1(config: Record<string, unknown>): Record<string, unknown> {
  const migrated: Record<string, unknown> = {
    ...config,
    version: 1,
  };
  if (isRecord(config.docs) && !("adoption" in config.docs)) {
    migrated.docs = {
      ...config.docs,
      adoption: config.docs.managed === true ? "managed" : "partial",
    };
  }
  return migrated;
}

function mergeConfig(base: LedgerConfig, override: PartialLedgerConfig): LedgerConfig {
  return {
    version: override.version ?? base.version,
    project: override.project ?? base.project,
    source: { ...base.source, ...override.source },
    ids: { ...base.ids, ...override.ids },
    sessions: { ...base.sessions, ...override.sessions },
    agents: { ...base.agents, ...override.agents },
    validation: {
      ...base.validation,
      ...override.validation,
      requiredSections: {
        ...base.validation.requiredSections,
        ...override.validation?.requiredSections,
      },
    },
    schema: {
      ...base.schema,
      ...override.schema,
      extensions: {
        ...base.schema.extensions,
        ...override.schema?.extensions,
      },
    },
    verification: { ...base.verification, ...override.verification },
    indexes: { ...base.indexes, ...override.indexes },
    reports: { ...base.reports, ...override.reports },
    render: {
      ...base.render,
      ...override.render,
      budgets: {
        ...base.render.budgets,
        ...override.render?.budgets,
      },
    },
    performance: {
      ...base.performance,
      ...override.performance,
      budgets: {
        ...base.performance.budgets,
        ...override.performance?.budgets,
      },
    },
    limits: { ...base.limits, ...override.limits },
    cache: { ...base.cache, ...override.cache },
    docs: {
      ...base.docs,
      ...override.docs,
      adoption: override.docs?.adoption ?? adoptionFromManaged(override.docs?.managed, base.docs.adoption),
      routing: {
        ...base.docs.routing,
        ...override.docs?.routing,
      },
    },
    git: {
      ...base.git,
      ...override.git,
    },
  };
}

function normalizeConfigPaths(config: LedgerConfig): LedgerConfig {
  return {
    ...config,
    source: mapStringValues(config.source, normalizeConfigPath),
    indexes: {
      output: normalizeConfigPath(config.indexes.output),
    },
    reports: {
      output: normalizeConfigPath(config.reports.output),
    },
    render: {
      output: normalizeConfigPath(config.render.output),
      budgets: config.render.budgets,
    },
    performance: config.performance,
    cache: { ...config.cache, output: normalizeConfigPath(config.cache.output) },
    docs: {
      ...config.docs,
      root: normalizeConfigPath(config.docs.root),
      routing: mapStringValues(config.docs.routing, normalizeConfigPath),
    },
    validation: {
      ...config.validation,
      baseline: normalizeConfigPath(config.validation.baseline),
    },
    verification: {
      ...config.verification,
      evidence: normalizeConfigPath(config.verification.evidence),
    },
    git: {
      ...config.git,
      requireEntryFor: config.git.requireEntryFor.map(normalizeConfigPath),
      ignore: config.git.ignore.map(normalizeConfigPath),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mapStringValues<T extends Record<string, string>>(
  values: T,
  transform: (value: string) => string,
): T {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, transform(value)]),
  ) as T;
}

function normalizeConfigPath(value: string): string {
  return normalizeProjectRelativePath(value);
}

function validatePartialConfig(config: Record<string, unknown>, configPath: string): void {
  optionalNumber(config, "version", configPath);
  optionalString(config, "project", configPath);
  optionalObject(config, "source", configPath, (source) => {
    optionalString(source, "entries", configPath, "source");
    optionalString(source, "backlog", configPath, "source");
    optionalString(source, "decisions", configPath, "source");
    optionalString(source, "releases", configPath, "source");
    optionalString(source, "sessions", configPath, "source");
  });
  optionalObject(config, "ids", configPath, (ids) => {
    optionalString(ids, "entryPrefix", configPath, "ids");
    optionalNumber(ids, "entryWidth", configPath, "ids");
    optionalString(ids, "backlogPrefix", configPath, "ids");
    optionalNumber(ids, "backlogWidth", configPath, "ids");
    optionalString(ids, "decisionPrefix", configPath, "ids");
    optionalNumber(ids, "decisionWidth", configPath, "ids");
    optionalString(ids, "sessionPrefix", configPath, "ids");
    optionalNumber(ids, "sessionWidth", configPath, "ids");
  });
  optionalObject(config, "sessions", configPath, (sessions) => {
    optionalNumber(sessions, "expiresInDays", configPath, "sessions");
  });
  optionalObject(config, "agents", configPath, (agents) => {
    optionalString(agents, "command", configPath, "agents");
  });
  optionalObject(config, "validation", configPath, (validation) => {
    optionalValidationProfile(validation, "profile", configPath, "validation");
    optionalBoolean(validation, "requireVerification", configPath, "validation");
    optionalBoolean(validation, "requireChangedFiles", configPath, "validation");
    optionalBoolean(validation, "requireInvariants", configPath, "validation");
    optionalString(validation, "baseline", configPath, "validation");
    optionalStringArray(validation, "ignoreMissingRefsForStatuses", configPath, "validation");
    optionalObject(validation, "requiredSections", configPath, (requiredSections) => {
      for (const kind of documentKinds) {
        optionalStringArray(requiredSections, kind, configPath, "validation.requiredSections");
      }
    }, "validation");
  });
  optionalObject(config, "schema", configPath, (schema) => {
    optionalStringArray(schema, "allowedFrontmatterFields", configPath, "schema");
    optionalObject(schema, "extensions", configPath, (extensions) => {
      for (const [field, value] of Object.entries(extensions)) {
        if (!isSchemaFieldType(value)) {
          fail(
            configPath,
            `schema.extensions.${field} must be one of string, string[], number, boolean, date, object, array`,
          );
        }
      }
    }, "schema");
  });
  optionalObject(config, "verification", configPath, (verification) => {
    optionalStringArray(verification, "allow", configPath, "verification");
    optionalString(verification, "evidence", configPath, "verification");
    optionalNumber(verification, "maxAgeDays", configPath, "verification");
    optionalNumber(verification, "timeoutMs", configPath, "verification");
  });
  optionalObject(config, "indexes", configPath, (indexes) => {
    optionalString(indexes, "output", configPath, "indexes");
  });
  optionalObject(config, "reports", configPath, (reports) => {
    optionalString(reports, "output", configPath, "reports");
  });
  optionalObject(config, "render", configPath, (render) => {
    optionalString(render, "output", configPath, "render");
    optionalObject(render, "budgets", configPath, (budgets) => {
      optionalNumber(budgets, "maxHtmlBytes", configPath, "render.budgets");
      optionalNumber(budgets, "maxSearchIndexBytes", configPath, "render.budgets");
      optionalNumber(budgets, "maxGraphBytes", configPath, "render.budgets");
      optionalNumber(budgets, "maxTotalBytes", configPath, "render.budgets");
      optionalNumber(budgets, "maxWriteMs", configPath, "render.budgets");
    }, "render");
  });
  optionalObject(config, "performance", configPath, (performance) => {
    optionalObject(performance, "budgets", configPath, (budgets) => {
      optionalNumber(budgets, "maxReadMs", configPath, "performance.budgets");
      optionalNumber(budgets, "maxValidateMs", configPath, "performance.budgets");
      optionalNumber(budgets, "maxIndexMs", configPath, "performance.budgets");
      optionalNumber(budgets, "maxRenderModelMs", configPath, "performance.budgets");
      optionalNumber(budgets, "maxSearchMs", configPath, "performance.budgets");
      optionalNumber(budgets, "maxTotalMs", configPath, "performance.budgets");
    }, "performance");
  });
  optionalObject(config, "cache", configPath, (cache) => {
    optionalCacheBackend(cache, "backend", configPath, "cache");
    optionalString(cache, "output", configPath, "cache");
  });
  optionalObject(config, "limits", configPath, (limits) => {
    optionalNumber(limits, "maxDocuments", configPath, "limits");
    optionalNumber(limits, "maxDocumentBytes", configPath, "limits");
    optionalNumber(limits, "maxTotalDocumentBytes", configPath, "limits");
    optionalNumber(limits, "maxDirectoryDepth", configPath, "limits");
  });
  optionalObject(config, "docs", configPath, (docs) => {
    optionalString(docs, "root", configPath, "docs");
    optionalBoolean(docs, "managed", configPath, "docs");
    optionalDocsAdoption(docs, "adoption", configPath, "docs");
    optionalObject(docs, "routing", configPath, (routing) => {
      optionalString(routing, "startHere", configPath, "docs.routing");
      optionalString(routing, "manifest", configPath, "docs.routing");
    }, "docs");
  });
  optionalObject(config, "git", configPath, (git) => {
    optionalStringArray(git, "requireEntryFor", configPath, "git");
    optionalStringArray(git, "ignore", configPath, "git");
    if (git.coverage !== undefined && git.coverage !== "current" && git.coverage !== "any") {
      fail(configPath, "git.coverage must be current or any");
    }
  });
}

function validateLedgerConfig(config: LedgerConfig, configPath: string): void {
  if (!Number.isInteger(config.version) || config.version < 1) {
    fail(configPath, "version must be a positive integer");
  }
  for (const [label, value] of [
    ["ids.entryWidth", config.ids.entryWidth],
    ["ids.backlogWidth", config.ids.backlogWidth],
    ["ids.decisionWidth", config.ids.decisionWidth],
    ["ids.sessionWidth", config.ids.sessionWidth],
    ["sessions.expiresInDays", config.sessions.expiresInDays],
    ["verification.maxAgeDays", config.verification.maxAgeDays],
    ["verification.timeoutMs", config.verification.timeoutMs],
  ] as const) {
    if (!Number.isInteger(value) || value < 1) {
      fail(configPath, `${label} must be a positive integer`);
    }
  }
  if (config.project.trim().length === 0) {
    fail(configPath, "project must be a non-empty string");
  }
  if (!isValidAgentsCommand(config.agents.command)) {
    fail(configPath, `agents.command ${agentsCommandRule}`);
  }
  for (const [label, value] of [
    ["source.entries", config.source.entries],
    ["source.backlog", config.source.backlog],
    ["source.decisions", config.source.decisions],
    ["source.releases", config.source.releases],
    ["source.sessions", config.source.sessions],
    ["indexes.output", config.indexes.output],
    ["reports.output", config.reports.output],
    ["render.output", config.render.output],
    ["validation.baseline", config.validation.baseline],
    ["verification.evidence", config.verification.evidence],
    ["docs.root", config.docs.root],
    ["docs.routing.startHere", config.docs.routing.startHere],
    ["docs.routing.manifest", config.docs.routing.manifest],
  ] as const) {
    if (value.trim().length === 0) {
      fail(configPath, `${label} must be a non-empty string`);
    }
    try {
      assertSafeProjectRelativePath(value, label);
    } catch (error) {
      fail(configPath, error instanceof Error ? error.message : String(error));
    }
  }
  for (const kind of documentKinds) {
    if (config.validation.requiredSections[kind].length === 0) {
      fail(configPath, `validation.requiredSections.${kind} must not be empty`);
    }
  }
  for (const [label, value] of Object.entries(config.render.budgets)) {
    if (!Number.isFinite(value) || value < 1) {
      fail(configPath, `render.budgets.${label} must be a positive number`);
    }
  }
  for (const [label, value] of Object.entries(config.performance.budgets)) {
    if (!Number.isFinite(value) || value < 1) {
      fail(configPath, `performance.budgets.${label} must be a positive number`);
    }
  }
  for (const [label, value] of Object.entries(config.limits)) {
    if (!Number.isInteger(value) || value < 1) {
      fail(configPath, `limits.${label} must be a positive integer`);
    }
  }
  for (const [group, patterns] of [
    ["git.requireEntryFor", config.git.requireEntryFor],
    ["git.ignore", config.git.ignore],
  ] as const) {
    for (const pattern of patterns) {
      try {
        assertSafeProjectRelativePath(pattern, group);
      } catch (error) {
        fail(configPath, error instanceof Error ? error.message : String(error));
      }
    }
  }
}

function adoptionFromManaged(
  managed: boolean | undefined,
  fallback: LedgerDocsAdoption,
): LedgerDocsAdoption {
  if (managed === true) return "managed";
  if (managed === false) return fallback;
  return fallback;
}

function optionalObject(
  source: Record<string, unknown>,
  key: string,
  configPath: string,
  validate: (value: Record<string, unknown>) => void,
  prefix?: string,
): void {
  const value = source[key];
  if (value === undefined) return;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(configPath, `${fieldPath(key, prefix)} must be an object`);
  }
  validate(value as Record<string, unknown>);
}

function optionalString(
  source: Record<string, unknown>,
  key: string,
  configPath: string,
  prefix?: string,
): void {
  const value = source[key];
  if (value !== undefined && typeof value !== "string") {
    fail(configPath, `${fieldPath(key, prefix)} must be a string`);
  }
}

function optionalNumber(
  source: Record<string, unknown>,
  key: string,
  configPath: string,
  prefix?: string,
): void {
  const value = source[key];
  if (value !== undefined && typeof value !== "number") {
    fail(configPath, `${fieldPath(key, prefix)} must be a number`);
  }
}

function optionalBoolean(
  source: Record<string, unknown>,
  key: string,
  configPath: string,
  prefix?: string,
): void {
  const value = source[key];
  if (value !== undefined && typeof value !== "boolean") {
    fail(configPath, `${fieldPath(key, prefix)} must be a boolean`);
  }
}

function optionalCacheBackend(
  source: Record<string, unknown>,
  key: string,
  configPath: string,
  prefix?: string,
): void {
  const value = source[key];
  if (
    value !== undefined &&
    value !== "auto" &&
    value !== "json" &&
    value !== "sqlite" &&
    value !== "none"
  ) {
    fail(configPath, `${fieldPath(key, prefix)} must be auto, json, sqlite, or none`);
  }
}

function optionalDocsAdoption(
  source: Record<string, unknown>,
  key: string,
  configPath: string,
  prefix?: string,
): void {
  const value = source[key];
  if (
    value !== undefined &&
    value !== "none" &&
    value !== "partial" &&
    value !== "managed"
  ) {
    fail(configPath, `${fieldPath(key, prefix)} must be none, partial, or managed`);
  }
}

function optionalValidationProfile(
  source: Record<string, unknown>,
  key: string,
  configPath: string,
  prefix?: string,
): void {
  const value = source[key];
  if (
    value !== undefined &&
    value !== "standard" &&
    value !== "strict"
  ) {
    fail(configPath, `${fieldPath(key, prefix)} must be standard or strict`);
  }
}

function optionalStringArray(
  source: Record<string, unknown>,
  key: string,
  configPath: string,
  prefix?: string,
): void {
  const value = source[key];
  if (value === undefined) return;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    fail(configPath, `${fieldPath(key, prefix)} must be an array of strings`);
  }
}

function fieldPath(key: string, prefix?: string): string {
  return prefix ? `${prefix}.${key}` : key;
}

function isSchemaFieldType(value: unknown): value is LedgerSchemaFieldType {
  return (
    value === "string" ||
    value === "string[]" ||
    value === "number" ||
    value === "boolean" ||
    value === "date" ||
    value === "object" ||
    value === "array"
  );
}

function fail(configPath: string, message: string): never {
  throw new LedgerError("invalid-config", `${configPath}: ${message}`, { configPath });
}
