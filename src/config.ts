import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import type { LedgerConfig, LedgerDocumentKind } from "./types.js";

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
  release: ["Summary", "Changes", "Verification", "Known Issues"],
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
    requiredSections,
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
    routing: {
      startHere: "docs/llm/START_HERE.md",
      manifest: "docs/llm/manifest.json",
    },
  },
};

export async function readLedgerConfig(configPath: string): Promise<LedgerConfig> {
  const raw = await readFile(configPath, "utf8");
  const parsed = parseYaml(raw);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${configPath}: config must be a YAML object`);
  }
  return mergeConfig(defaultConfig, parsed as PartialLedgerConfig);
}

type PartialLedgerConfig = {
  readonly version?: number;
  readonly project?: string;
  readonly source?: Partial<LedgerConfig["source"]>;
  readonly ids?: Partial<LedgerConfig["ids"]>;
  readonly validation?: Partial<LedgerConfig["validation"]> & {
    readonly requiredSections?: Partial<Record<LedgerDocumentKind, readonly string[]>>;
  };
  readonly indexes?: Partial<LedgerConfig["indexes"]>;
  readonly reports?: Partial<LedgerConfig["reports"]>;
  readonly render?: Partial<LedgerConfig["render"]>;
  readonly docs?: Partial<LedgerConfig["docs"]> & {
    readonly routing?: Partial<LedgerConfig["docs"]["routing"]>;
  };
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
    indexes: { ...base.indexes, ...override.indexes },
    reports: { ...base.reports, ...override.reports },
    render: { ...base.render, ...override.render },
    docs: {
      ...base.docs,
      ...override.docs,
      routing: {
        ...base.docs.routing,
        ...override.docs?.routing,
      },
    },
  };
}
