export const ledgerMachineSchemaVersion = 1 as const;

export type LedgerErrorCode =
  | "concurrent-file-change"
  | "filesystem-error"
  | "invalid-argument"
  | "invalid-config"
  | "invalid-markdown"
  | "invalid-release"
  | "invalid-yaml"
  | "integrity-baseline-missing"
  | "integrity-baseline-invalid"
  | "operational-error"
  | "release-exists"
  | "render-validation-failed"
  | "resource-limit-exceeded"
  | "unsafe-project-path"
  | "unknown-command"
  | "workspace-not-found"
  | "workspace-write-locked";

export interface LedgerMachineSuccess<T> {
  readonly schemaVersion: typeof ledgerMachineSchemaVersion;
  readonly ok: true;
  readonly command: string;
  readonly data: T;
}

export interface LedgerMachineFailure {
  readonly schemaVersion: typeof ledgerMachineSchemaVersion;
  readonly ok: false;
  readonly command: string;
  readonly error: {
    readonly code: LedgerErrorCode | string;
    readonly message: string;
    readonly details?: Readonly<Record<string, unknown>>;
  };
}

export type LedgerMachineResult<T> = LedgerMachineSuccess<T> | LedgerMachineFailure;

export class LedgerError extends Error {
  constructor(
    readonly code: LedgerErrorCode,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "LedgerError";
  }
}

export function machineSuccess<T>(command: string, data: T): LedgerMachineSuccess<T> {
  return { schemaVersion: ledgerMachineSchemaVersion, ok: true, command, data };
}

export function machineFailure(command: string, error: unknown): LedgerMachineFailure {
  const normalized = normalizeLedgerError(error);
  return {
    schemaVersion: ledgerMachineSchemaVersion,
    ok: false,
    command,
    error: normalized,
  };
}

export function normalizeLedgerError(error: unknown): LedgerMachineFailure["error"] {
  if (error instanceof LedgerError) {
    return omitUndefined({ code: error.code, message: error.message, details: error.details });
  }
  if (error instanceof Error) {
    const coded = error as Error & {
      readonly code?: unknown;
      readonly details?: unknown;
      readonly path?: unknown;
      readonly syscall?: unknown;
    };
    if (typeof coded.code === "string" && isLedgerCode(coded.code)) {
      return omitUndefined({
        code: coded.code,
        message: coded.message,
        details: isDetails(coded.details) ? coded.details : undefined,
      });
    }
    if (typeof coded.code === "string" && /^[A-Z][A-Z0-9_]+$/.test(coded.code)) {
      return omitUndefined({
        code: "filesystem-error",
        message: coded.message,
        details: omitUndefined({
          systemCode: coded.code,
          path: typeof coded.path === "string" ? coded.path : undefined,
          syscall: typeof coded.syscall === "string" ? coded.syscall : undefined,
        }),
      });
    }
    if (coded.name === "ZodError") {
      return { code: "invalid-argument", message: coded.message };
    }
    return { code: "operational-error", message: coded.message };
  }
  return { code: "operational-error", message: String(error) };
}

function isLedgerCode(value: string): boolean {
  return value.includes("-") && value === value.toLowerCase();
}

function isDetails(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}
