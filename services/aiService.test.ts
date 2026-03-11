import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const googleGenerateContentMock = vi.fn();
const openRouterSendMock = vi.fn();
const openRouterCtorMock = vi.fn();

vi.mock("@google/genai", () => {
  class GoogleGenAI {
    models = {
      generateContent: (request: any) => googleGenerateContentMock(request),
    };

    constructor(_options: any) {}
  }

  const Type = {
    OBJECT: "OBJECT",
    STRING: "STRING",
  };

  return { GoogleGenAI, Type };
});

vi.mock("@openrouter/sdk", () => {
  class OpenRouter {
    chat = {
      send: (request: any) => openRouterSendMock(request),
    };

    constructor(options: any) {
      openRouterCtorMock(options);
    }
  }

  return { OpenRouter };
});

const ORIGINAL_ENV = { ...process.env };

const resetTestEnv = () => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_MODEL;
  delete process.env.GEMINI_FALLBACK_MODELS;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.VITE_ENABLE_AI;
  delete process.env.VITE_OPARL_PROXY_PREFIX;
  delete process.env.VITE_OPARL_BODY_ID;
};

const makeGeminiError = (
  code: number,
  message: string,
  status = "UNKNOWN",
) => {
  const error = new Error(
    JSON.stringify({
      error: {
        code,
        message,
        status,
      },
    }),
  ) as Error & { status?: number };
  error.status = code;
  return error;
};

describe("aiService", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    resetTestEnv();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("falls back to the next Gemini model when the primary model returns 404", async () => {
    process.env.GEMINI_API_KEY = "gemini-test-key";

    googleGenerateContentMock
      .mockRejectedValueOnce(
        makeGeminiError(
          404,
          "This model models/gemini-2.5-flash is no longer available to new users.",
          "NOT_FOUND",
        ),
      )
      .mockResolvedValueOnce({ text: "Fallback works." });

    const { askGemini } = await import("./aiService");
    const result = await askGemini("ping");

    expect(result).toBe("Fallback works.");
    expect(googleGenerateContentMock).toHaveBeenCalledTimes(2);
    expect(googleGenerateContentMock.mock.calls[0][0].model).toBe(
      "gemini-2.5-flash",
    );
    expect(googleGenerateContentMock.mock.calls[1][0].model).toBe(
      "gemini-flash-latest",
    );
  });

  it("uses OpenRouter fallback after Gemini models fail", async () => {
    process.env.GEMINI_API_KEY = "gemini-test-key";
    process.env.OPENROUTER_API_KEY = `sk-or-v1-${"a".repeat(64)}`;

    googleGenerateContentMock.mockRejectedValue(
      makeGeminiError(503, "Service temporarily unavailable", "UNAVAILABLE"),
    );
    openRouterSendMock.mockResolvedValue({
      choices: [{ message: { content: "OpenRouter fallback success." } }],
    });

    const { askGemini } = await import("./aiService");
    const result = await askGemini("ping");

    expect(result).toBe("OpenRouter fallback success.");
    expect(googleGenerateContentMock).toHaveBeenCalledTimes(2);
    expect(openRouterCtorMock).toHaveBeenCalledTimes(1);
    expect(openRouterSendMock).toHaveBeenCalledTimes(1);
  });

  it("does not initialize OpenRouter when OPENROUTER_API_KEY format is invalid", async () => {
    process.env.GEMINI_API_KEY = "gemini-test-key";
    process.env.OPENROUTER_API_KEY = "sk-or-v1-short";

    googleGenerateContentMock.mockRejectedValue(
      makeGeminiError(503, "Service temporarily unavailable", "UNAVAILABLE"),
    );

    const { askGemini } = await import("./aiService");
    const result = await askGemini("ping");

    expect(openRouterCtorMock).not.toHaveBeenCalled();
    expect(openRouterSendMock).not.toHaveBeenCalled();
    expect(result).toContain("Der AI-Dienst ist derzeit nicht erreichbar.");
  });

  it("returns sanitized user-facing errors without raw provider JSON", async () => {
    process.env.GEMINI_API_KEY = "gemini-test-key";

    googleGenerateContentMock.mockRejectedValue(
      makeGeminiError(
        400,
        "API key not valid. Please pass a valid API key.",
        "INVALID_ARGUMENT",
      ),
    );

    const { askGemini } = await import("./aiService");
    const result = await askGemini("ping");

    expect(result).toContain("Der API-Schlüssel ist ungültig oder hat keine Berechtigung.");
    expect(result).toContain("Referenz: 400 / INVALID_ARGUMENT");
    expect(result).not.toContain("Technische Details");
    expect(result).not.toContain("google.rpc");
    expect(result).not.toContain('"error"');
  });

  it("falls back to deterministic parsing when Gemini and OpenRouter both fail", async () => {
    process.env.GEMINI_API_KEY = "gemini-test-key";
    process.env.OPENROUTER_API_KEY = `sk-or-v1-${"a".repeat(64)}`;

    googleGenerateContentMock.mockRejectedValue(
      makeGeminiError(
        404,
        "This model models/gemini-2.5-flash is no longer available to new users.",
        "NOT_FOUND",
      ),
    );
    openRouterSendMock.mockRejectedValue(new Error("User not found."));

    const { parseSearchQuery } = await import("./aiService");
    const result = await parseSearchQuery("Zeige mir Anträge aus 2024");

    expect(googleGenerateContentMock).toHaveBeenCalledTimes(2);
    expect(openRouterSendMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      expect.objectContaining({
        minDate: "2024-01-01",
        maxDate: "2024-12-31",
      }),
    );
    expect(result).not.toBeNull();
  });

  it("keeps AI disabled when VITE_ENABLE_AI is false", async () => {
    process.env.VITE_ENABLE_AI = "false";
    process.env.GEMINI_API_KEY = "gemini-test-key";
    process.env.OPENROUTER_API_KEY = `sk-or-v1-${"a".repeat(64)}`;

    const { askGemini, parseSearchQuery } = await import("./aiService");
    const askResult = await askGemini("ping");
    const parseResult = await parseSearchQuery("Zeige mir Anträge aus 2024");

    expect(askResult).toContain("deaktiviert");
    expect(parseResult).toEqual(
      expect.objectContaining({
        minDate: "2024-01-01",
        maxDate: "2024-12-31",
      }),
    );
    expect(googleGenerateContentMock).not.toHaveBeenCalled();
    expect(openRouterSendMock).not.toHaveBeenCalled();
  });
});
