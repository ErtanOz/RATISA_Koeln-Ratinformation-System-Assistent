// @vitest-environment node

import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createHttpApp } from "./httpApp";

const ENV_KEYS = [
  "MCP_BIND_HOST",
  "NETLIFY",
  "AWS_LAMBDA_FUNCTION_NAME",
  "LAMBDA_TASK_ROOT",
];

const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<string, string | undefined>;

async function withHttpApp(
  env: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>,
  callback: (baseUrl: string) => Promise<void>,
) {
  for (const key of ENV_KEYS) {
    const value = env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  const app = createHttpApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Failed to resolve test server port.");
  }

  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

async function request(
  baseUrl: string,
  path: string,
  headers: Record<string, string>,
) {
  return await new Promise<{
    status: number;
    body: string;
    headers: http.IncomingHttpHeaders;
  }>((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request(
      {
        method: "GET",
        host: url.hostname,
        port: url.port,
        path: url.pathname,
        headers,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body,
            headers: res.headers,
          });
        });
      },
    );

    req.on("error", reject);
    req.end();
  });
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("createHttpApp host validation", () => {
  it("allows localhost host headers in local mode", async () => {
    await withHttpApp({ MCP_BIND_HOST: "127.0.0.1" }, async (baseUrl) => {
      const response = await request(baseUrl, "/healthz", {
        Host: "localhost",
      });

      expect(response.status).toBe(200);
      expect(JSON.parse(response.body)).toEqual({
        status: "ok",
        service: "oparl-koeln-mcp-http",
      });
    });
  });

  it("rejects non-local hosts in local mode", async () => {
    await withHttpApp({ MCP_BIND_HOST: "127.0.0.1" }, async (baseUrl) => {
      const response = await request(baseUrl, "/healthz", {
        Host: "shiny-cuchufli-56111d.netlify.app",
      });

      expect(response.status).toBe(403);
      expect(JSON.parse(response.body)).toEqual({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Invalid Host: shiny-cuchufli-56111d.netlify.app",
        },
        id: null,
      });
    });
  });

  it("skips localhost host validation in serverless mode", async () => {
    await withHttpApp(
      {
        MCP_BIND_HOST: "127.0.0.1",
        NETLIFY: "true",
      },
      async (baseUrl) => {
        const response = await request(baseUrl, "/healthz", {
          Host: "shiny-cuchufli-56111d.netlify.app",
        });

        expect(response.status).toBe(200);
        expect(JSON.parse(response.body)).toEqual({
          status: "ok",
          service: "oparl-koeln-mcp-http",
        });
      },
    );
  });
});
