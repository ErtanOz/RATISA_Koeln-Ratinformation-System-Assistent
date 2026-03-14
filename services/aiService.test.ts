import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;

const createJsonResponse = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  }) as Response;

const createTextResponse = (status: number, body: string) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  }) as Response;

describe("aiService", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.VITE_ENABLE_AI;
    delete process.env.VITE_AI_HTTP_ENDPOINT;
    global.fetch = vi.fn() as any;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    global.fetch = ORIGINAL_FETCH;
  });

  it("posts ask requests to the configured AI endpoint", async () => {
    process.env.VITE_AI_HTTP_ENDPOINT = "/custom-ai";
    vi.mocked(global.fetch).mockResolvedValue(
      createJsonResponse(200, { text: "Summary ok." }),
    );

    const { askGemini } = await import("./aiService");
    const result = await askGemini("ping");

    expect(result).toBe("Summary ok.");
    expect(global.fetch).toHaveBeenCalledWith(
      "/custom-ai/ask",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("returns backend error messages for failed ask requests", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      createJsonResponse(503, {
        error: "Kein serverseitiger AI-Provider konfiguriert.",
      }),
    );

    const { askGemini } = await import("./aiService");
    const result = await askGemini("ping");

    expect(result).toContain("Kein serverseitiger AI-Provider konfiguriert.");
  });

  it("maps HTML 404 responses to a deployment-focused error message", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      createTextResponse(
        404,
        "<!DOCTYPE html><html><head><title>Page not found</title></head><body>Missing</body></html>",
      ),
    );

    const { askGemini } = await import("./aiService");
    const result = await askGemini("ping");

    expect(result).toContain("nicht erreichbar (404)");
    expect(result).not.toContain("<!DOCTYPE html>");
  });

  it("uses structured parse results from the AI endpoint", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      createJsonResponse(200, {
        resource: "meetings",
        q: "radverkehr",
        minDate: "2026-01-01",
      }),
    );

    const { parseSearchQuery } = await import("./aiService");
    const result = await parseSearchQuery("Wann ist Radverkehr?");

    expect(result).toEqual({
      resource: "meetings",
      q: "radverkehr",
      minDate: "2026-01-01",
    });
  });

  it("falls back to deterministic parsing when the AI endpoint is unreachable", async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error("connect ECONNREFUSED"));

    const { parseSearchQuery } = await import("./aiService");
    const result = await parseSearchQuery("Zeige mir Anträge aus 2024");

    expect(result).toEqual(
      expect.objectContaining({
        resource: "papers",
        minDate: "2024-01-01",
        maxDate: "2024-12-31",
      }),
    );
  });

  it("keeps AI disabled when VITE_ENABLE_AI is false", async () => {
    process.env.VITE_ENABLE_AI = "false";

    const { askGemini, parseSearchQuery } = await import("./aiService");
    const askResult = await askGemini("ping");
    const parseResult = await parseSearchQuery("Zeige mir Anträge aus 2024");

    expect(askResult).toContain("deaktiviert");
    expect(parseResult).toEqual(
      expect.objectContaining({
        resource: "papers",
        minDate: "2024-01-01",
        maxDate: "2024-12-31",
      }),
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
