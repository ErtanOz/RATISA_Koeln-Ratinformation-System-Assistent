import { GoogleGenAI, Type } from "@google/genai";
import { OpenRouter } from "@openrouter/sdk";

export interface Attachment {
  url: string;
  mimeType: string;
}

export interface StructuredSearch {
  resource: "all" | "meetings" | "papers" | "people" | "organizations";
  q?: string;
  minDate?: string;
  maxDate?: string;
}

interface ErrorDetails {
  status?: number;
  providerCode?: number;
  providerStatus?: string;
  message: string;
  rawMessage: string;
}

const DEFAULT_PRIMARY_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_FALLBACK_GEMINI_MODELS = ["gemini-flash-latest"];
const OPENROUTER_MODEL = "meta-llama/llama-3.3-70b-instruct:free";
const OPENROUTER_MIN_KEY_LENGTH = 60;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const DEFAULT_ALLOWED_ATTACHMENT_HOSTS = ["buergerinfo.stadt-koeln.de"];
const DEFAULT_ATTACHMENT_FETCH_TIMEOUT_MS = 5_000;
const MAX_ATTACHMENT_REDIRECTS = 3;
const LOCAL_ATTACHMENT_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const normalizeEnvSecret = (value?: string) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/^['"]|['"]$/g, "").trim();
};

const parseEnvList = (value?: string) =>
  (value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const dedupe = (items: string[]) => Array.from(new Set(items));
const parsePositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

const isProduction = process.env.NODE_ENV === "production";
const attachmentFetchTimeoutMs = parsePositiveInteger(
  process.env.AI_ATTACHMENT_FETCH_TIMEOUT_MS,
  DEFAULT_ATTACHMENT_FETCH_TIMEOUT_MS,
);
const allowedAttachmentHosts = dedupe([
  ...((() => {
    const configured = parseEnvList(process.env.AI_ALLOWED_ATTACHMENT_HOSTS);
    return configured.length > 0
      ? configured.map((entry) => entry.toLowerCase())
      : DEFAULT_ALLOWED_ATTACHMENT_HOSTS;
  })()),
  ...(!isProduction ? Array.from(LOCAL_ATTACHMENT_HOSTS) : []),
]);

const apiKey = normalizeEnvSecret(process.env.API_KEY || process.env.GEMINI_API_KEY);
const configuredPrimaryGeminiModel =
  process.env.GEMINI_MODEL?.trim() || DEFAULT_PRIMARY_GEMINI_MODEL;
const configuredFallbackGeminiModels = parseEnvList(
  process.env.GEMINI_FALLBACK_MODELS,
);
const geminiModelChain = dedupe([
  configuredPrimaryGeminiModel,
  ...(configuredFallbackGeminiModels.length > 0
    ? configuredFallbackGeminiModels
    : DEFAULT_FALLBACK_GEMINI_MODELS),
]);

const rawOpenRouterKey = normalizeEnvSecret(process.env.OPENROUTER_API_KEY);
const isValidOpenRouterKey = (key?: string) =>
  !!key && key.startsWith("sk-or-v1-") && key.length >= OPENROUTER_MIN_KEY_LENGTH;
const openRouterKey = isValidOpenRouterKey(rawOpenRouterKey)
  ? rawOpenRouterKey
  : undefined;

if (rawOpenRouterKey && !openRouterKey) {
  console.warn(
    `[AI] OPENROUTER_API_KEY has invalid format. Expected prefix "sk-or-v1-" and minimum length ${OPENROUTER_MIN_KEY_LENGTH}.`,
  );
}

const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
const openRouter = openRouterKey
  ? new OpenRouter({
      apiKey: openRouterKey,
    } as any)
  : null;

const toNumber = (value: unknown): number | undefined =>
  typeof value === "number" ? value : undefined;

const parseJsonObject = (text: string): Record<string, any> | null => {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const getErrorDetails = (error: unknown): ErrorDetails => {
  const input = error as any;
  let status = toNumber(input?.status);
  let providerCode = toNumber(input?.code);
  let providerStatus =
    typeof input?.providerStatus === "string" ? input.providerStatus : undefined;

  let rawMessage = "Unbekannter Fehler";
  if (typeof input?.message === "string" && input.message.trim()) {
    rawMessage = input.message;
  } else if (typeof error === "string" && error.trim()) {
    rawMessage = error;
  }

  const parsedMessage = parseJsonObject(rawMessage);
  const nestedError =
    parsedMessage?.error && typeof parsedMessage.error === "object"
      ? parsedMessage.error
      : parsedMessage;

  let message = rawMessage;
  if (nestedError && typeof nestedError === "object") {
    if (typeof nestedError.message === "string" && nestedError.message.trim()) {
      message = nestedError.message;
    }
    if (typeof nestedError.status === "string") {
      providerStatus = nestedError.status;
    }
    if (typeof nestedError.code === "number") {
      providerCode = nestedError.code;
      if (status === undefined) {
        status = nestedError.code;
      }
    }
  }

  if (typeof input?.status === "string" && !providerStatus) {
    providerStatus = input.status;
  }

  if (
    status === undefined &&
    providerCode !== undefined &&
    providerCode >= 100 &&
    providerCode <= 599
  ) {
    status = providerCode;
  }

  return {
    status,
    providerCode,
    providerStatus,
    message,
    rawMessage,
  };
};

const includesAny = (text: string, needles: string[]) =>
  needles.some((needle) => text.includes(needle));

const isModelNotFoundError = (details: ErrorDetails): boolean => {
  const haystack = `${details.message} ${details.rawMessage} ${
    details.providerStatus || ""
  }`.toLowerCase();
  const isNotFound =
    details.status === 404 ||
    details.providerCode === 404 ||
    details.providerStatus === "NOT_FOUND" ||
    haystack.includes("not_found");

  return (
    isNotFound &&
    includesAny(haystack, [
      "model",
      "no longer available to new users",
      "not found",
      "not available",
    ])
  );
};

const isRateLimitError = (details: ErrorDetails): boolean => {
  const haystack = `${details.message} ${details.rawMessage} ${
    details.providerStatus || ""
  }`.toLowerCase();
  return (
    details.status === 429 ||
    details.providerCode === 429 ||
    details.providerStatus === "RESOURCE_EXHAUSTED" ||
    includesAny(haystack, ["429", "resource_exhausted", "quota", "rate limit"])
  );
};

const isServerError = (details: ErrorDetails): boolean => {
  const statusCode = details.status ?? details.providerCode;
  if (statusCode !== undefined && statusCode >= 500 && statusCode <= 599) {
    return true;
  }
  const haystack = `${details.message} ${details.rawMessage}`.toLowerCase();
  return includesAny(haystack, ["500", "502", "503", "504", "internal"]);
};

const isRetryableGeminiError = (details: ErrorDetails): boolean =>
  isModelNotFoundError(details) || isRateLimitError(details) || isServerError(details);

const formatUserFacingAiError = (
  userMessage: string,
  details: ErrorDetails,
): string => {
  const referenceParts = [
    details.status?.toString(),
    details.providerStatus,
  ].filter(Boolean);

  const reference =
    referenceParts.length > 0
      ? `\n\n*Referenz: ${referenceParts.join(" / ")}*`
      : "";

  return `⚠️ ${userMessage}${reference}`;
};

async function generateWithGeminiFallback<T>(
  buildRequest: (model: string) => Record<string, unknown>,
  context: string,
): Promise<T> {
  if (!ai) {
    throw new Error("Gemini not configured");
  }

  let lastError: unknown = null;
  for (let index = 0; index < geminiModelChain.length; index += 1) {
    const model = geminiModelChain[index];
    try {
      return (await ai.models.generateContent(buildRequest(model) as any)) as T;
    } catch (error) {
      lastError = error;
      const details = getErrorDetails(error);
      const shouldRetry =
        index < geminiModelChain.length - 1 && isRetryableGeminiError(details);

      if (!shouldRetry) break;
      console.warn(
        `[AI] ${context}: model ${model} failed (${details.status ?? "unknown"}). Trying next configured model...`,
      );
    }
  }

  throw lastError ?? new Error("Gemini request failed");
}

async function callOpenRouter(prompt: string): Promise<string> {
  if (!openRouter) throw new Error("OpenRouter not initialized");
  const completion = await openRouter.chat.send({
    model: OPENROUTER_MODEL,
    messages: [{ role: "user", content: prompt }],
  });
  const content = completion.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) return content;
  if (Array.isArray(content)) {
    const textContent = content
      .map((item: any) => (typeof item?.text === "string" ? item.text : ""))
      .join("")
      .trim();
    if (textContent) return textContent;
  }
  return "Keine Antwort vom Modell erhalten.";
}

async function tryOpenRouterFallback(prompt: string, context: string): Promise<string | null> {
  if (!openRouter) return null;
  try {
    console.log(`[AI] ${context}: trying OpenRouter fallback...`);
    return await callOpenRouter(prompt);
  } catch (fallbackError) {
    console.error(`[AI] ${context}: OpenRouter fallback failed:`, fallbackError);
    return null;
  }
}

function fallbackParse(query: string): StructuredSearch {
  const qLower = query.toLowerCase();
  let resource: StructuredSearch["resource"] = "all";

  if (qLower.includes("sitzung") || qLower.includes("termin") || qLower.includes("wann")) {
    resource = "meetings";
  } else if (
    qLower.includes("vorlag") ||
    qLower.includes("antrag") ||
    qLower.includes("anträg") ||
    qLower.includes("beschluss")
  ) {
    resource = "papers";
  } else if (
    qLower.includes("person") ||
    qLower.includes("politiker") ||
    qLower.includes("wer")
  ) {
    resource = "people";
  } else if (
    qLower.includes("gremi") ||
    qLower.includes("ausschuss") ||
    qLower.includes("partei")
  ) {
    resource = "organizations";
  }

  let minDate: string | undefined;
  let maxDate: string | undefined;
  const yearMatch = qLower.match(/\b(20\d\d)\b/);
  if (yearMatch) {
    minDate = `${yearMatch[1]}-01-01`;
    maxDate = `${yearMatch[1]}-12-31`;
  }

  const cleanQ = query
    .replace(
      /(sitzung|termin|wann|vorlag|antrag|beschluss|person|politiker|wer|gremi|ausschuss|partei|suche|nach|zeige|mir|alle)\w*/gi,
      "",
    )
    .replace(/\b(20\d\d)\b/g, "")
    .trim();

  return { resource, q: cleanQ || undefined, minDate, maxDate };
}

function isLoopbackHost(hostname: string): boolean {
  return LOCAL_ATTACHMENT_HOSTS.has(hostname.toLowerCase());
}

function parseAttachmentUrl(rawUrl: string): URL {
  try {
    return new URL(rawUrl);
  } catch {
    throw new Error("Der Anhang verwendet keine gültige URL.");
  }
}

function assertAllowedAttachmentUrl(url: URL): void {
  const hostname = url.hostname.toLowerCase();
  const loopbackAllowed = !isProduction && isLoopbackHost(hostname);

  if (url.protocol !== "https:" && !loopbackAllowed) {
    throw new Error("Anhänge müssen per HTTPS geladen werden.");
  }

  if (!allowedAttachmentHosts.includes(hostname) && !loopbackAllowed) {
    throw new Error(`Anhänge von ${hostname} sind nicht erlaubt.`);
  }
}

function isRedirectResponse(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}

async function fetchAttachmentResponse(
  url: URL,
  redirectCount = 0,
  visited = new Set<string>(),
): Promise<Response> {
  assertAllowedAttachmentUrl(url);

  const normalizedUrl = url.toString();
  if (visited.has(normalizedUrl)) {
    throw new Error("Weiterleitungsschleife beim Laden des Anhangs erkannt.");
  }
  visited.add(normalizedUrl);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), attachmentFetchTimeoutMs);

  try {
    const response = await fetch(normalizedUrl, {
      signal: controller.signal,
      redirect: "manual",
    });

    if (isRedirectResponse(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        throw new Error("Weiterleitung ohne Ziel-URL beim Laden des Anhangs.");
      }

      if (redirectCount >= MAX_ATTACHMENT_REDIRECTS) {
        throw new Error("Zu viele Weiterleitungen beim Laden des Anhangs.");
      }

      const nextUrl = new URL(location, normalizedUrl);
      assertAllowedAttachmentUrl(nextUrl);
      return fetchAttachmentResponse(nextUrl, redirectCount + 1, visited);
    }

    return response;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        `Zeitüberschreitung beim Laden des Dokuments (${attachmentFetchTimeoutMs} ms).`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchFileAsBase64(url: string): Promise<string> {
  const response = await fetchAttachmentResponse(parseAttachmentUrl(url));
  if (!response.ok) {
    throw new Error(`Dokument konnte nicht geladen werden (${response.status}).`);
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    const declaredBytes = Number(contentLength);
    if (Number.isFinite(declaredBytes) && declaredBytes > MAX_ATTACHMENT_BYTES) {
      throw new Error(
        `Datei zu groß (${(declaredBytes / 1024 / 1024).toFixed(1)} MB). Limit: 10 MB.`,
      );
    }
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `Datei zu groß (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB). Limit: 10 MB.`,
    );
  }

  return buffer.toString("base64");
}

function getMockMode() {
  return process.env.AI_MOCK_MODE?.trim().toLowerCase();
}

async function runMockAsk(prompt: string, attachments: Attachment[]) {
  const mode = getMockMode();
  if (!mode) return null;
  if (mode === "openrouter-fallback") return "Mock OpenRouter fallback success.";
  if (mode === "gemini-success") return "Mock Gemini success.";

  const parts: string[] = [prompt];
  for (const attachment of attachments) {
    if (
      attachment.mimeType === "application/pdf" ||
      attachment.mimeType.startsWith("image/")
    ) {
      try {
        await fetchFileAsBase64(attachment.url);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Fehler beim Lesen der Datei";
        parts.push(
          `System-Hinweis: Der Anhang konnte nicht verarbeitet werden. Grund: ${message}`,
        );
      }
    }
  }

  return parts.join("\n");
}

function runMockParse(query: string) {
  const mode = getMockMode();
  if (!mode) return null;
  if (mode === "parse-success") {
    return {
      resource: "papers",
      q: query.trim() || undefined,
    } satisfies StructuredSearch;
  }
  return fallbackParse(query);
}

export async function askGemini(
  prompt: string,
  attachments: Attachment[] = [],
): Promise<string> {
  const mockResponse = await runMockAsk(prompt, attachments);
  if (mockResponse) return mockResponse;

  if (!ai && !openRouter) {
    throw new Error(
      "Kein serverseitiger AI-Provider konfiguriert. Setzen Sie GEMINI_API_KEY oder OPENROUTER_API_KEY im HTTP-Service.",
    );
  }

  try {
    if (!ai) {
      const openRouterOnlyResult = await tryOpenRouterFallback(prompt, "askGemini");
      if (openRouterOnlyResult) return openRouterOnlyResult;
      throw new Error("OpenRouter fallback unavailable");
    }

    const parts: any[] = [{ text: prompt }];

    const attachmentPromises = attachments.map(async (file) => {
      if (
        file.mimeType === "application/pdf" ||
        file.mimeType.startsWith("image/")
      ) {
        try {
          const base64Data = await fetchFileAsBase64(file.url);
          return {
            inlineData: {
              mimeType: file.mimeType,
              data: base64Data,
            },
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Fehler beim Lesen der Datei";
          console.warn(`Skipping attachment ${file.url}: ${message}`);
          return {
            text: `\n> *System-Hinweis: Der Anhang [${
              file.url.split("/").pop() || "Dokument"
            }] konnte nicht verarbeitet werden. Grund: ${message}*`,
          };
        }
      }
      return null;
    });

    const processedAttachments = (await Promise.all(attachmentPromises)).filter(Boolean);
    parts.push(...processedAttachments);

    const response = await generateWithGeminiFallback<any>(
      (model) => ({
        model,
        contents: { parts },
      }),
      "askGemini",
    );

    return response.text || "Keine Antwort vom Modell erhalten.";
  } catch (error) {
    console.error("Gemini Request Error:", error);

    const openRouterResult = await tryOpenRouterFallback(prompt, "askGemini");
    if (openRouterResult) return openRouterResult;

    const details = getErrorDetails(error);
    const normalizedMessage = `${details.message} ${details.rawMessage}`.toLowerCase();

    let userMessage = "Es ist ein unerwarteter Fehler aufgetreten.";
    if (isModelNotFoundError(details)) {
      userMessage =
        "Das konfigurierte Gemini-Modell ist nicht mehr verfügbar. Bitte aktualisieren Sie die Modellkonfiguration.";
    } else if (
      details.status === 403 ||
      details.providerCode === 403 ||
      includesAny(normalizedMessage, ["403", "api key", "permission"])
    ) {
      userMessage =
        "Der API-Schlüssel ist ungültig oder hat keine Berechtigung.";
    } else if (isRateLimitError(details)) {
      userMessage =
        "Das Anfragelimit wurde erreicht (Quota Exceeded). Bitte versuchen Sie es später erneut.";
    } else if (isServerError(details)) {
      userMessage =
        "Der AI-Dienst ist derzeit nicht erreichbar. Bitte versuchen Sie es später erneut.";
    } else if (includesAny(normalizedMessage, ["fetch", "download"])) {
      userMessage =
        "Verbindungsfehler beim Abrufen der Dokumente. Möglicherweise blockiert der Server den Zugriff.";
    } else if (includesAny(normalizedMessage, ["datei zu groß", "too large"])) {
      userMessage = "Ein oder mehrere Anhänge überschreiten das Limit von 10 MB.";
    }

    return formatUserFacingAiError(userMessage, details);
  }
}

export async function parseSearchQuery(query: string): Promise<StructuredSearch | null> {
  const mockResult = runMockParse(query);
  if (mockResult) return mockResult;

  if (!ai && !openRouter) return fallbackParse(query);

  const today = new Date().toISOString().split("T")[0];

  try {
    if (!ai) {
      const openRouterResult = await tryOpenRouterFallback(
        `Heutiges Datum: ${today}\nSuchanfrage: "${query}"\nGib nur JSON zurück.`,
        "parseSearchQuery",
      );
      if (!openRouterResult) return fallbackParse(query);
      const jsonMatch = openRouterResult.match(/\{[\s\S]*\}/);
      return jsonMatch ? (JSON.parse(jsonMatch[0]) as StructuredSearch) : fallbackParse(query);
    }

    const response = await generateWithGeminiFallback<any>(
      (model) => ({
        model,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Du bist ein intelligenter Suchassistent für das Ratsinformationssystem der Stadt Köln.
Deine Aufgabe ist es, natürliche Suchanfragen in strukturierte Datenbank-Abfragen umzuwandeln.

**Kontext:**
- Das heutige Datum ist: ${today}
- Zielsystem: OParl API

**Analyse-Anweisungen:**
1. **Resource (resource)**:
   - "Sitzungen", "Termine", "Wann" -> 'meetings'
   - "Anträge", "Dokumente", "Beschlüsse", "PDFs" -> 'papers'
   - "Personen", "Politiker", "Wer" -> 'people'
   - "Gremien", "Ausschüsse", "Parteien" -> 'organizations'
   - Standard/Unsicher -> 'all'

2. **Suchbegriff (q)**:
   - Extrahiere das Kernthema ohne Füllwörter.

3. **Zeitraum (minDate / maxDate)**:
   - Berechne relative Zeitangaben basierend auf dem heutigen Datum.
   - Gib Daten immer im Format YYYY-MM-DD an.

**Input:** "${query}"

**Output:** Gib nur ein valides JSON-Objekt zurück.`,
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              resource: {
                type: Type.STRING,
                enum: ["meetings", "papers", "people", "organizations", "all"],
              },
              q: { type: Type.STRING },
              minDate: { type: Type.STRING },
              maxDate: { type: Type.STRING },
            },
            required: ["resource"],
          },
        },
      }),
      "parseSearchQuery",
    );

    const text = response.text;
    if (!text) throw new Error("Empty model response");
    return JSON.parse(text) as StructuredSearch;
  } catch (error) {
    console.error("Failed to parse search query with Gemini", error);

    const prompt = `Du bist ein intelligenter Suchassistent für das Ratsinformationssystem der Stadt Köln.
Analysiere die Suchanfrage und gib ein JSON-Objekt zurück mit:
- resource: 'meetings', 'papers', 'people', 'organizations' oder 'all'
- q: Suchbegriff (ohne Füllwörter)
- minDate: Startdatum (YYYY-MM-DD) falls erwähnt
- maxDate: Enddatum (YYYY-MM-DD) falls erwähnt

Heutiges Datum: ${today}
Suchanfrage: "${query}"

Gib nur das JSON zurück, keine Erklärungen.`;

    const openRouterResult = await tryOpenRouterFallback(prompt, "parseSearchQuery");
    if (openRouterResult) {
      const jsonMatch = openRouterResult.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]) as StructuredSearch;
        } catch (jsonError) {
          console.warn("OpenRouter response could not be parsed as JSON:", jsonError);
        }
      }
    }

    console.log("Falling back to deterministic regex parser");
    return fallbackParse(query);
  }
}
