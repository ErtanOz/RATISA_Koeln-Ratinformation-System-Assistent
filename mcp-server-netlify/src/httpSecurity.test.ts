// @vitest-environment node

import type { Request, Response } from "express";
import { afterEach, describe, expect, it } from "vitest";
import { applyCorsAndMaybeHandlePreflight } from "./httpSecurity";

const originalAllowedOrigins = process.env.MCP_ALLOWED_ORIGINS;

interface MockResponse {
  headers: Map<string, string>;
  statusCode: number;
  jsonBody: unknown;
  sentBody: unknown;
  setHeader(name: string, value: string): MockResponse;
  getHeader(name: string): string | undefined;
  status(code: number): MockResponse;
  json(body: unknown): MockResponse;
  send(body?: unknown): MockResponse;
}

function createRequest(
  options: {
    method: string;
    origin?: string;
    host?: string;
    forwardedProto?: string;
    protocol?: string;
    encrypted?: boolean;
  },
): Request {
  return {
    method: options.method,
    headers: {
      ...(options.origin ? { origin: options.origin } : {}),
      ...(options.host ? { host: options.host } : {}),
      ...(options.forwardedProto
        ? { "x-forwarded-proto": options.forwardedProto }
        : {}),
    },
    protocol: options.protocol,
    socket: { encrypted: options.encrypted ?? false },
  } as unknown as Request;
}

function createResponse(): MockResponse & Response {
  const headers = new Map<string, string>();

  return {
    headers,
    statusCode: 200,
    jsonBody: undefined,
    sentBody: undefined,
    setHeader(name: string, value: string) {
      headers.set(name, value);
      return this;
    },
    getHeader(name: string) {
      return headers.get(name);
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.jsonBody = body;
      return this;
    },
    send(body?: unknown) {
      this.sentBody = body;
      return this;
    },
  } as MockResponse & Response;
}

afterEach(() => {
  if (originalAllowedOrigins === undefined) {
    delete process.env.MCP_ALLOWED_ORIGINS;
    return;
  }

  process.env.MCP_ALLOWED_ORIGINS = originalAllowedOrigins;
});

describe("applyCorsAndMaybeHandlePreflight", () => {
  it("allows localhost:3000 with default origins", () => {
    delete process.env.MCP_ALLOWED_ORIGINS;
    const response = createResponse();

    const handled = applyCorsAndMaybeHandlePreflight(
      createRequest({
        method: "POST",
        origin: "http://localhost:3000",
      }),
      response,
    );

    expect(handled).toBe(false);
    expect(response.getHeader("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
  });

  it("allows localhost:5173 with default origins", () => {
    delete process.env.MCP_ALLOWED_ORIGINS;
    const response = createResponse();

    const handled = applyCorsAndMaybeHandlePreflight(
      createRequest({
        method: "POST",
        origin: "http://localhost:5173",
      }),
      response,
    );

    expect(handled).toBe(false);
    expect(response.getHeader("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
  });

  it("allows same-origin production requests without explicit allowlist", () => {
    delete process.env.MCP_ALLOWED_ORIGINS;
    const response = createResponse();

    const handled = applyCorsAndMaybeHandlePreflight(
      createRequest({
        method: "POST",
        origin: "https://shiny-cuchufli-56111d.netlify.app",
        host: "shiny-cuchufli-56111d.netlify.app",
        forwardedProto: "https",
      }),
      response,
    );

    expect(handled).toBe(false);
    expect(response.getHeader("Access-Control-Allow-Origin")).toBe(
      "https://shiny-cuchufli-56111d.netlify.app",
    );
  });

  it("rejects disallowed origins", () => {
    delete process.env.MCP_ALLOWED_ORIGINS;
    const response = createResponse();

    const handled = applyCorsAndMaybeHandlePreflight(
      createRequest({
        method: "POST",
        origin: "http://evil.test",
      }),
      response,
    );

    expect(handled).toBe(true);
    expect(response.statusCode).toBe(403);
    expect(response.jsonBody).toEqual({
      error: "Origin not allowed by MCP_ALLOWED_ORIGINS.",
    });
  });

  it("answers preflight requests for localhost:5173", () => {
    delete process.env.MCP_ALLOWED_ORIGINS;
    const response = createResponse();

    const handled = applyCorsAndMaybeHandlePreflight(
      createRequest({
        method: "OPTIONS",
        origin: "http://localhost:5173",
      }),
      response,
    );

    expect(handled).toBe(true);
    expect(response.statusCode).toBe(204);
    expect(response.getHeader("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
  });

  it("rejects cross-origin production requests that are not explicitly allowed", () => {
    delete process.env.MCP_ALLOWED_ORIGINS;
    const response = createResponse();

    const handled = applyCorsAndMaybeHandlePreflight(
      createRequest({
        method: "POST",
        origin: "https://evil.test",
        host: "shiny-cuchufli-56111d.netlify.app",
        forwardedProto: "https",
      }),
      response,
    );

    expect(handled).toBe(true);
    expect(response.statusCode).toBe(403);
  });

  it("allows explicitly configured extra origins in production", () => {
    process.env.MCP_ALLOWED_ORIGINS = "https://app.example.com";
    const response = createResponse();

    const handled = applyCorsAndMaybeHandlePreflight(
      createRequest({
        method: "POST",
        origin: "https://app.example.com",
        host: "shiny-cuchufli-56111d.netlify.app",
        forwardedProto: "https",
      }),
      response,
    );

    expect(handled).toBe(false);
    expect(response.getHeader("Access-Control-Allow-Origin")).toBe(
      "https://app.example.com",
    );
  });
});
