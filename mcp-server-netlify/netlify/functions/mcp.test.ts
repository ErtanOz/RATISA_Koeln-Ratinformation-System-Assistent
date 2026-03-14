// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "AI_MOCK_MODE",
  "MCP_ALLOWED_ORIGINS",
  "MCP_BIND_HOST",
  "NETLIFY",
] as const;

const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof ENV_KEYS)[number], string | undefined>;

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function createEvent(
  overrides: Partial<{
    body: string;
    headers: Record<string, string>;
    httpMethod: string;
    path: string;
  }> = {},
) {
  const { headers: overrideHeaders, ...eventOverrides } = overrides;

  return {
    httpMethod: "GET",
    path: "/healthz",
    headers: {
      host: "shiny-cuchufli-56111d.netlify.app",
      "x-forwarded-proto": "https",
      ...overrideHeaders,
    },
    requestContext: {
      identity: {
        sourceIp: "127.0.0.1",
      },
      requestId: "test-request",
    },
    body: "",
    isBase64Encoded: false,
    ...eventOverrides,
  };
}

async function loadHandler() {
  vi.resetModules();
  const module = await import("./mcp");
  return module.handler as (
    event: ReturnType<typeof createEvent>,
    context: unknown,
  ) => Promise<{
    body?: string;
    statusCode?: number;
  }>;
}

afterEach(() => {
  restoreEnv();
  vi.resetModules();
});

describe("Netlify MCP handler", () => {
  it("parses JSON bodies for rewritten AI routes", async () => {
    process.env.NETLIFY = "true";
    process.env.AI_MOCK_MODE = "gemini-success";

    const handler = await loadHandler();
    const response = await handler(
      createEvent({
        httpMethod: "POST",
        path: "/ai/ask",
        headers: {
          "content-type": "application/json",
          origin: "https://shiny-cuchufli-56111d.netlify.app",
        },
        body: JSON.stringify({ prompt: "ping" }),
      }),
      {},
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body ?? "")).toEqual({
      text: "Mock Gemini success.",
    });
  });

  it("strips the Netlify function base path for direct AI function URLs", async () => {
    process.env.NETLIFY = "true";
    process.env.AI_MOCK_MODE = "parse-fallback";

    const handler = await loadHandler();
    const response = await handler(
      createEvent({
        httpMethod: "POST",
        path: "/.netlify/functions/mcp/ai/parse-search",
        headers: {
          "content-type": "application/json",
          origin: "https://shiny-cuchufli-56111d.netlify.app",
        },
        body: JSON.stringify({ query: "Antrag 2024" }),
      }),
      {},
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body ?? "")).toEqual({
      resource: "papers",
      minDate: "2024-01-01",
      maxDate: "2024-12-31",
    });
  });

  it("serves health checks on the direct Netlify function path", async () => {
    process.env.NETLIFY = "true";

    const handler = await loadHandler();
    const response = await handler(
      createEvent({
        path: "/.netlify/functions/mcp/healthz",
      }),
      {},
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body ?? "")).toEqual({
      status: "ok",
      service: "oparl-koeln-mcp-http",
    });
  });
});
