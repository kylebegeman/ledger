import { describe, expect, it } from "vitest";
import {
  LedgerError,
  machineFailure,
  machineSuccess,
  normalizeLedgerError,
} from "../src/machine.js";

describe("machine envelopes", () => {
  it("wraps success data with a stable schema version and command", () => {
    expect(machineSuccess("search", { total: 2 })).toEqual({
      schemaVersion: 1,
      ok: true,
      command: "search",
      data: { total: 2 },
    });
  });

  it("preserves typed error codes and safe details", () => {
    expect(
      machineFailure(
        "release",
        new LedgerError("release-exists", "Release exists", { path: ".ledger/releases/v1.md" }),
      ),
    ).toEqual({
      schemaVersion: 1,
      ok: false,
      command: "release",
      error: {
        code: "release-exists",
        message: "Release exists",
        details: { path: ".ledger/releases/v1.md" },
      },
    });
  });

  it("normalizes system failures without exposing arbitrary object fields", () => {
    const error = Object.assign(new Error("permission denied"), {
      code: "EACCES",
      path: "/tmp/file",
      syscall: "open",
      secret: "do-not-emit",
    });
    expect(normalizeLedgerError(error)).toEqual({
      code: "filesystem-error",
      message: "permission denied",
      details: {
        systemCode: "EACCES",
        path: "/tmp/file",
        syscall: "open",
      },
    });
  });

  it("does not misclassify Node argument errors as filesystem failures", () => {
    const error = Object.assign(new TypeError("invalid argument"), {
      code: "ERR_INVALID_ARG_TYPE",
    });

    expect(normalizeLedgerError(error)).toEqual({
      code: "operational-error",
      message: "invalid argument",
    });
  });
});
