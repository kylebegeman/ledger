import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
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
};

export const defaultConfig: LedgerConfig = {
  version: 1,
  project: "ledger-project",
  source: {
    entries: ".ledger/entries",
    backlog: ".ledger/backlog",
    decisions: ".ledger/decisions",
    releases: ".ledger/releases",
  },
  ids: {
    entryPrefix: "",
    entryWidth: 4,
    backlogPrefix: "B",
    decisionPrefix: "D",
  },
  validation: {
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
  indexes: {
    output: ".ledger/indexes",
  },
  reports: {
    output: ".ledger/reports",
  },
  render: {
    output: ".ledger/dist",
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
  },
};

export async function readLedgerConfig(configPath: string): Promise<LedgerConfig> {
  const raw = await readFile(configPath, "utf8");
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${configPath}: invalid YAML: ${message}`);
  }
  return parseLedgerConfig(parsed, configPath);
}

export function parseLedgerConfig(parsed: unknown, configPath = "config.yaml"): LedgerConfig {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${configPath}: config must be a YAML object`);
  }
  validatePartialConfig(parsed as Record<string, unknown>, configPath);
  const config = normalizeConfigPaths(mergeConfig(defaultConfig, parsed as PartialLedgerConfig));
  validateLedgerConfig(config, configPath);
  return config;
}

type PartialLedgerConfig = {
  readonly version?: number;
  readonly project?: string;
  readonly source?: Partial<LedgerConfig["source"]>;
  readonly ids?: Partial<LedgerConfig["ids"]>;
  readonly validation?: Partial<LedgerConfig["validation"]> & {
    readonly requiredSections?: Partial<Record<LedgerDocumentKind, readonly string[]>>;
  };
  readonly schema?: Partial<LedgerConfig["schema"]>;
  readonly indexes?: Partial<LedgerConfig["indexes"]>;
  readonly reports?: Partial<LedgerConfig["reports"]>;
  readonly render?: Partial<LedgerConfig["render"]>;
  readonly docs?: Partial<LedgerConfig["docs"]> & {
    readonly routing?: Partial<LedgerConfig["docs"]["routing"]>;
  };
  readonly git?: Partial<LedgerConfig["git"]>;
};

function mergeConfig(base: LedgerConfig, override: PartialLedgerConfig): LedgerConfig {
  return {
    version: override.version ?? base.version,
    project: override.project ?? base.project,
    source: { ...base.source, ...override.source },
    ids: { ...base.ids, ...override.ids },
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
    indexes: { ...base.indexes, ...override.indexes },
    reports: { ...base.reports, ...override.reports },
    render: { ...base.render, ...override.render },
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
    },
    docs: {
      ...config.docs,
      root: normalizeConfigPath(config.docs.root),
      routing: mapStringValues(config.docs.routing, normalizeConfigPath),
    },
    validation: {
      ...config.validation,
      baseline: normalizeConfigPath(config.validation.baseline),
    },
    git: {
      requireEntryFor: config.git.requireEntryFor.map(normalizeConfigPath),
      ignore: config.git.ignore.map(normalizeConfigPath),
    },
  };
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
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function validatePartialConfig(config: Record<string, unknown>, configPath: string): void {
  optionalNumber(config, "version", configPath);
  optionalString(config, "project", configPath);
  optionalObject(config, "source", configPath, (source) => {
    optionalString(source, "entries", configPath, "source");
    optionalString(source, "backlog", configPath, "source");
    optionalString(source, "decisions", configPath, "source");
    optionalString(source, "releases", configPath, "source");
  });
  optionalObject(config, "ids", configPath, (ids) => {
    optionalString(ids, "entryPrefix", configPath, "ids");
    optionalNumber(ids, "entryWidth", configPath, "ids");
    optionalString(ids, "backlogPrefix", configPath, "ids");
    optionalString(ids, "decisionPrefix", configPath, "ids");
  });
  optionalObject(config, "validation", configPath, (validation) => {
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
  optionalObject(config, "indexes", configPath, (indexes) => {
    optionalString(indexes, "output", configPath, "indexes");
  });
  optionalObject(config, "reports", configPath, (reports) => {
    optionalString(reports, "output", configPath, "reports");
  });
  optionalObject(config, "render", configPath, (render) => {
    optionalString(render, "output", configPath, "render");
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
  });
}

function validateLedgerConfig(config: LedgerConfig, configPath: string): void {
  if (!Number.isInteger(config.version) || config.version < 1) {
    fail(configPath, "version must be a positive integer");
  }
  if (!Number.isInteger(config.ids.entryWidth) || config.ids.entryWidth < 1) {
    fail(configPath, "ids.entryWidth must be a positive integer");
  }
  for (const [label, value] of [
    ["project", config.project],
    ["source.entries", config.source.entries],
    ["source.backlog", config.source.backlog],
    ["source.decisions", config.source.decisions],
    ["source.releases", config.source.releases],
    ["indexes.output", config.indexes.output],
    ["reports.output", config.reports.output],
    ["render.output", config.render.output],
    ["validation.baseline", config.validation.baseline],
    ["docs.root", config.docs.root],
    ["docs.routing.startHere", config.docs.routing.startHere],
    ["docs.routing.manifest", config.docs.routing.manifest],
  ] as const) {
    if (value.trim().length === 0) {
      fail(configPath, `${label} must be a non-empty string`);
    }
  }
  for (const kind of documentKinds) {
    if (config.validation.requiredSections[kind].length === 0) {
      fail(configPath, `validation.requiredSections.${kind} must not be empty`);
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
  throw new Error(`${configPath}: ${message}`);
}
