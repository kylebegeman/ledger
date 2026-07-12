import { describe, expect, it } from "vitest";
import * as api from "../src/index.js";
import * as unstable from "../src/unstable.js";

describe("public API boundary", () => {
  it("exports stable high-level APIs from the package root", () => {
    expect(api).toMatchObject({
      buildAgentPacket: expect.any(Function),
      buildSearchAgentPacket: expect.any(Function),
      buildStaticReaderModel: expect.any(Function),
      findWorkspace: expect.any(Function),
      readLedgerDocuments: expect.any(Function),
      runLedgerPacketCommand: expect.any(Function),
      runLedgerQueryCommand: expect.any(Function),
      runLedgerSearchPacketCommand: expect.any(Function),
      searchLedgerIndex: expect.any(Function),
      closeStaticReader: expect.any(Function),
      serveStaticReader: expect.any(Function),
      validateDocuments: expect.any(Function),
    });
  });

  it("keeps internals behind the unstable entrypoint", () => {
    const publicApi = api as Record<string, unknown>;
    const unstableApi = unstable as Record<string, unknown>;

    expect(publicApi.parseMarkdownWithFrontmatter).toBeUndefined();
    expect(publicApi.staticReaderRuntime).toBeUndefined();
    expect(unstableApi.parseMarkdownWithFrontmatter).toEqual(expect.any(Function));
    expect(unstableApi.staticReaderRuntime).toEqual(expect.any(String));
  });
});
