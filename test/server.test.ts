import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/index.js";

function setupEnv(
  overrides: Record<string, string | undefined> = {}
): () => void {
  const defaults: Record<string, string> = {
    TETHER_CREDENTIAL_ID: "test-credential-id",
    TETHER_PRIVATE_KEY_PATH: "/tmp/test-key.der",
  };
  const merged = { ...defaults, ...overrides };
  const saved: Record<string, string | undefined> = {};

  for (const [key, val] of Object.entries(merged)) {
    saved[key] = process.env[key];
    if (val === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = val;
    }
  }

  return () => {
    for (const [key, val] of Object.entries(saved)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
  };
}

async function createTestClient() {
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const client = new Client({ name: "test-client", version: "1.0.0" });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return { client, server };
}

describe("tether-name-mcp server", () => {
  describe("tool listing", () => {
    let restore: () => void;

    beforeEach(() => {
      restore = setupEnv();
    });
    afterEach(() => restore());

    it("should list all five tools", async () => {
      const { client } = await createTestClient();
      const result = await client.listTools();

      const names = result.tools.map((t) => t.name).sort();
      expect(names).toEqual([
        "get_credential_info",
        "request_challenge",
        "sign_challenge",
        "submit_proof",
        "verify_identity",
      ]);
    });

    it("should have descriptions for all tools", async () => {
      const { client } = await createTestClient();
      const result = await client.listTools();

      for (const tool of result.tools) {
        expect(tool.description).toBeTruthy();
        expect(tool.description!.length).toBeGreaterThan(10);
      }
    });

    it("sign_challenge should require a challenge parameter", async () => {
      const { client } = await createTestClient();
      const result = await client.listTools();

      const signTool = result.tools.find((t) => t.name === "sign_challenge");
      expect(signTool).toBeDefined();
      expect(signTool!.inputSchema.required).toContain("challenge");
    });

    it("submit_proof should require challenge and proof parameters", async () => {
      const { client } = await createTestClient();
      const result = await client.listTools();

      const submitTool = result.tools.find((t) => t.name === "submit_proof");
      expect(submitTool).toBeDefined();
      expect(submitTool!.inputSchema.required).toContain("challenge");
      expect(submitTool!.inputSchema.required).toContain("proof");
    });
  });

  describe("get_credential_info", () => {
    it("should return configured credential info", async () => {
      const restore = setupEnv({
        TETHER_CREDENTIAL_ID: "my-cred-id",
        TETHER_PRIVATE_KEY_PATH: "/path/to/key.der",
        TETHER_BASE_URL: "https://custom.api.tether.name",
      });

      try {
        const { client } = await createTestClient();
        const result = await client.callTool({
          name: "get_credential_info",
          arguments: {},
        });

        const content = result.content as Array<{ type: string; text: string }>;
        const info = JSON.parse(content[0].text);
        expect(info.credentialId).toBe("my-cred-id");
        expect(info.privateKeyPath).toBe("/path/to/key.der");
        expect(info.baseUrl).toBe("https://custom.api.tether.name");
        expect(info.configured).toBe(true);
      } finally {
        restore();
      }
    });

    it("should show not-set when env vars are missing", async () => {
      const restore = setupEnv({
        TETHER_CREDENTIAL_ID: undefined,
        TETHER_PRIVATE_KEY_PATH: undefined,
        TETHER_BASE_URL: undefined,
      });

      try {
        const { client } = await createTestClient();
        const result = await client.callTool({
          name: "get_credential_info",
          arguments: {},
        });

        const content = result.content as Array<{ type: string; text: string }>;
        const info = JSON.parse(content[0].text);
        expect(info.credentialId).toBe("(not set)");
        expect(info.privateKeyPath).toBe("(not set)");
        expect(info.baseUrl).toBe("https://api.tether.name");
        expect(info.configured).toBe(false);
      } finally {
        restore();
      }
    });
  });

  describe("verify_identity", () => {
    it("should return error when TETHER_CREDENTIAL_ID is not set", async () => {
      const restore = setupEnv({
        TETHER_CREDENTIAL_ID: undefined,
      });

      try {
        const { client } = await createTestClient();
        const result = await client.callTool({
          name: "verify_identity",
          arguments: {},
        });

        const content = result.content as Array<{ type: string; text: string }>;
        expect(content[0].text).toContain("TETHER_CREDENTIAL_ID");
        expect(result.isError).toBe(true);
      } finally {
        restore();
      }
    });

    it("should return error when TETHER_PRIVATE_KEY_PATH is not set", async () => {
      const restore = setupEnv({
        TETHER_PRIVATE_KEY_PATH: undefined,
      });

      try {
        const { client } = await createTestClient();
        const result = await client.callTool({
          name: "verify_identity",
          arguments: {},
        });

        const content = result.content as Array<{ type: string; text: string }>;
        expect(content[0].text).toContain("TETHER_PRIVATE_KEY_PATH");
        expect(result.isError).toBe(true);
      } finally {
        restore();
      }
    });
  });

  describe("request_challenge", () => {
    it("should return error when credentials are not configured", async () => {
      const restore = setupEnv({
        TETHER_CREDENTIAL_ID: undefined,
        TETHER_PRIVATE_KEY_PATH: undefined,
      });

      try {
        const { client } = await createTestClient();
        const result = await client.callTool({
          name: "request_challenge",
          arguments: {},
        });

        const content = result.content as Array<{ type: string; text: string }>;
        expect(content[0].text).toContain("TETHER_CREDENTIAL_ID");
        expect(result.isError).toBe(true);
      } finally {
        restore();
      }
    });
  });

  describe("sign_challenge", () => {
    it("should return error when credentials are not configured", async () => {
      const restore = setupEnv({
        TETHER_CREDENTIAL_ID: undefined,
        TETHER_PRIVATE_KEY_PATH: undefined,
      });

      try {
        const { client } = await createTestClient();
        const result = await client.callTool({
          name: "sign_challenge",
          arguments: { challenge: "test-challenge" },
        });

        const content = result.content as Array<{ type: string; text: string }>;
        expect(content[0].text).toContain("TETHER_CREDENTIAL_ID");
        expect(result.isError).toBe(true);
      } finally {
        restore();
      }
    });
  });

  describe("submit_proof", () => {
    it("should return error when credentials are not configured", async () => {
      const restore = setupEnv({
        TETHER_CREDENTIAL_ID: undefined,
        TETHER_PRIVATE_KEY_PATH: undefined,
      });

      try {
        const { client } = await createTestClient();
        const result = await client.callTool({
          name: "submit_proof",
          arguments: { challenge: "test-challenge", proof: "test-proof" },
        });

        const content = result.content as Array<{ type: string; text: string }>;
        expect(content[0].text).toContain("TETHER_CREDENTIAL_ID");
        expect(result.isError).toBe(true);
      } finally {
        restore();
      }
    });
  });
});
