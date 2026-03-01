import { GoogleGenAI, Type } from "@google/genai";
import { OpenRouter } from "@openrouter/sdk";
import { runtimeConfig } from "./runtimeConfig";

const DEFAULT_PRIMARY_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_FALLBACK_GEMINI_MODELS = ["gemini-flash-latest"];
const OPENROUTER_MODEL = "meta-llama/llama-3.3-70b-instruct:free";
const OPENROUTER_MIN_KEY_LENGTH = 60;
const normalizeEnvSecret = (value?: string) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/^['"]|['"]$/g, "").trim();
};

// Initialize with a fallback to avoid crash on init if key is missing,
// but validate before usage inside the function.
const apiKey = runtimeConfig.enableAi
  ? normalizeEnvSecret(process.env.API_KEY || process.env.GEMINI_API_KEY)
  : undefined;

const parseEnvList = (value?: string) =>
  (value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const dedupe = (items: string[]) => Array.from(new Set(items));

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

const rawOpenRouterKey = runtimeConfig.enableAi
  ? normalizeEnvSecret(process.env.OPENROUTER_API_KEY)
  : undefined;

const isValidOpenRouterKey = (key?: string) =>
  !!key && key.startsWith("sk-or-v1-") && key.length >= OPENROUTER_MIN_KEY_LENGTH;

let openRouterWarningLogged = false;
const warnInvalidOpenRouterKey = () => {
  if (openRouterWarningLogged || !rawOpenRouterKey) return;
  openRouterWarningLogged = true;
  console.warn(
    `[AI] OPENROUTER_API_KEY has invalid format. Expected prefix "sk-or-v1-" and minimum length ${OPENROUTER_MIN_KEY_LENGTH}.`,
  );
};

const openRouterKey = isValidOpenRouterKey(rawOpenRouterKey)
  ? rawOpenRouterKey
  : undefined;

if (runtimeConfig.enableAi && rawOpenRouterKey && !openRouterKey) {
  warnInvalidOpenRouterKey();
}

const ai = new GoogleGenAI({ apiKey: apiKey || "DUMMY_KEY" });

// Initialize OpenRouter SDK only for valid key format.
const openRouter = openRouterKey
  ? new OpenRouter({
      apiKey: openRouterKey,
      // Cast to any to bypass TS error since defaultHeaders is often supported by underlying fetch options
    } as any)
  : null;

interface ErrorDetails {
  status?: number;
  providerCode?: number;
  providerStatus?: string;
  message: string;
  rawMessage: string;
}

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

const formatErrorStatus = (details: ErrorDetails) =>
  details.status ?? details.providerCode ?? details.providerStatus ?? "unknown";

// Helper function to call OpenRouter with Llama 3.3 70B
async function callOpenRouter(prompt: string): Promise<string> {
  if (!openRouter) throw new Error("OpenRouter not initialized");

  const completion = await openRouter.chat.send({
    model: OPENROUTER_MODEL,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    stream: false,
  });

  const content = completion.choices[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }
  return "";
}

async function tryOpenRouterFallback(
  prompt: string,
  context: string,
): Promise<string | null> {
  if (!openRouter) {
    if (runtimeConfig.enableAi && rawOpenRouterKey && !openRouterKey) {
      warnInvalidOpenRouterKey();
    }
    return null;
  }

  try {
    console.log(`[AI] ${context}: trying OpenRouter fallback...`);
    return await callOpenRouter(prompt);
  } catch (fallbackError) {
    console.error(`[AI] ${context}: OpenRouter fallback failed:`, fallbackError);
    return null;
  }
}

async function generateWithGeminiFallback(
  buildRequest: (model: string) => any,
  context: string,
) {
  let lastError: unknown = new Error("No Gemini model available.");

  for (let index = 0; index < geminiModelChain.length; index++) {
    const model = geminiModelChain[index];
    try {
      const response = await ai.models.generateContent(buildRequest(model));
      return response;
    } catch (error) {
      lastError = error;
      const details = getErrorDetails(error);
      const hasFallbackModel = index < geminiModelChain.length - 1;

      if (hasFallbackModel && isRetryableGeminiError(details)) {
        const nextModel = geminiModelChain[index + 1];
        console.warn(
          `[AI] ${context}: Gemini model "${model}" failed (${formatErrorStatus(
            details,
          )}). Trying fallback model "${nextModel}".`,
        );
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

export interface Attachment {
  url: string;
  mimeType: string;
}

export interface StructuredSearch {
  resource: "meetings" | "papers" | "people" | "organizations" | "all";
  q?: string;
  minDate?: string; // YYYY-MM-DD
  maxDate?: string; // YYYY-MM-DD
}

// Proxy to bypass CORS restrictions on government servers for client-side demos
const CORS_PROXY = "https://corsproxy.io/?";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB Limit to prevent browser crashes

async function fetchFileAsBase64(url: string): Promise<string> {
  let response: Response | undefined;
  let fetchError: any;

  // 1. Attempt Direct Fetch (fastest, but likely to fail due to CORS on external servers)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // Short timeout for direct fetch
    response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
  } catch (e) {
    fetchError = e;
  }

  // 2. Fallback to CORS Proxy if direct fetch failed or wasn't ok (e.g. opaque response)
  if (!response || !response.ok) {
    try {
      // Encode the target URL component
      const proxyUrl = `${CORS_PROXY}${encodeURIComponent(url)}`;
      response = await fetch(proxyUrl);
    } catch (proxyError) {
      console.warn(`Proxy fetch failed for ${url}`, proxyError);
      // Throw the original error if available to keep context, or the proxy error
      throw new Error(
        `Download über Proxy fehlgeschlagen: ${fetchError?.message || "Netzwerkfehler/CORS"}`,
      );
    }
  }

  if (!response || !response.ok) {
    throw new Error(
      `Server antwortete mit Status ${response?.status || "Unknown"}`,
    );
  }

  // 3. Check Content-Length Header (if available) before downloading body
  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `Datei zu groß (${(parseInt(contentLength) / 1024 / 1024).toFixed(1)} MB). Limit: 10 MB.`,
    );
  }

  // 4. Download Blob and double check size
  const blob = await response.blob();
  if (blob.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `Datei zu groß (${(blob.size / 1024 / 1024).toFixed(1)} MB). Limit: 10 MB.`,
    );
  }

  // 5. Convert to Base64
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // result is "data:application/pdf;base64,....."
      const base64 = result.split(",")[1];
      if (base64) resolve(base64);
      else reject(new Error("Fehler bei der Base64-Konvertierung"));
    };
    reader.onerror = () => reject(new Error("Fehler beim Lesen der Datei"));
    reader.readAsDataURL(blob);
  });
}

export async function askGemini(
  prompt: string,
  attachments: Attachment[] = [],
): Promise<string> {
  if (!runtimeConfig.enableAi) {
    return "⚠️ **Hinweis**: Die KI-Funktionen sind in dieser Umgebung deaktiviert. Für Deployment setzen Sie `VITE_ENABLE_AI=true` sowie `GEMINI_API_KEY` (oder `OPENROUTER_API_KEY`).";
  }

  if (!apiKey) {
    return "⚠️ **Konfigurationsfehler**: Kein API-Key gefunden. Bitte setzen Sie `API_KEY` oder `GEMINI_API_KEY`.";
  }

  try {
    const parts: any[] = [{ text: prompt }];

    // Fetch attachments in parallel for speed, but handle failures individually
    // ensuring one failed file doesn't crash the whole request
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
        } catch (e: any) {
          console.warn(`Skipping attachment ${file.url}: ${e.message}`);
          // Add a system note so the AI knows the file is missing and why
          return {
            text: `\n> *System-Hinweis: Der Anhang [${file.url.split("/").pop()}] konnte nicht verarbeitet werden. Grund: ${e.message}*`,
          };
        }
      }
      return null;
    });

    const processedAttachments = (await Promise.all(attachmentPromises)).filter(
      Boolean,
    );
    parts.push(...processedAttachments);

    const response = await generateWithGeminiFallback(
      (model) => ({
        model,
        contents: { parts },
      }),
      "askGemini",
    );

    return response.text || "Keine Antwort vom Modell erhalten.";
  } catch (error: any) {
    console.error("Gemini Request Error:", error);

    const openRouterResult = await tryOpenRouterFallback(prompt, "askGemini");
    if (openRouterResult) {
      return openRouterResult;
    }

    const details = getErrorDetails(error);
    const normalizedMessage = `${details.message} ${details.rawMessage}`.toLowerCase();

    // User-friendly error mapping
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
      userMessage =
        "Ein oder mehrere Anhänge überschreiten das Limit von 10 MB.";
    }

    return `⚠️ **Fehler**: ${userMessage}\n\n*Technische Details: ${details.rawMessage || details.message}*`;
  }
}

function fallbackParse(query: string): StructuredSearch {
  const qLower = query.toLowerCase();
  let resource: "all" | "meetings" | "papers" | "people" | "organizations" = "all";
  
  if (qLower.includes("sitzung") || qLower.includes("termin") || qLower.includes("wann")) resource = "meetings";
  else if (qLower.includes("vorlag") || qLower.includes("antrag") || qLower.includes("beschluss")) resource = "papers";
  else if (qLower.includes("person") || qLower.includes("politiker") || qLower.includes("wer")) resource = "people";
  else if (qLower.includes("gremi") || qLower.includes("ausschuss") || qLower.includes("partei")) resource = "organizations";
  
  let minDate, maxDate;
  const yearMatch = qLower.match(/\b(20\d\d)\b/);
  if (yearMatch) {
     minDate = `${yearMatch[1]}-01-01`;
     maxDate = `${yearMatch[1]}-12-31`;
  }
  
  // Clean query of known keywords
  const cleanQ = query.replace(/(sitzung|termin|wann|vorlag|antrag|beschluss|person|politiker|wer|gremi|ausschuss|partei|suche|nach|zeige|mir|alle)\w*/gi, '')
                      .replace(/\b(20\d\d)\b/g, '')
                      .trim();
                      
  return { resource, q: cleanQ || undefined, minDate, maxDate };
}

export async function parseSearchQuery(
  query: string,
): Promise<StructuredSearch | null> {
  if (!runtimeConfig.enableAi) return fallbackParse(query);
  if (!apiKey) return fallbackParse(query);

  try {
    const response = await generateWithGeminiFallback(
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
            - Das heutige Datum ist: ${new Date().toISOString().split("T")[0]}
            - Zielsystem: OParl API

            **Analyse-Anweisungen:**
            1. **Resource (resource)**: Worums geht es primär?
               - "Sitzungen", "Termine", "Wann" -> 'meetings'
               - "Anträge", "Dokumente", "Beschlüsse", "PDFs" -> 'papers'
               - "Personen", "Politiker", "Wer" -> 'people'
               - "Gremien", "Ausschüsse", "Parteien" -> 'organizations'
               - Standard/Unsicher -> 'all'

            2. **Suchbegriff (q)**: 
               - Extrahiere das KERNTHEMA.
               - Entferne Füllwörter ("suche nach", "finde", "über", "etwas zu").
               - Wenn der Nutzer nach Synonymen sucht (z.B. "Kita"), nutze den offiziellen Begriff (z.B. "Kindertagesstätte"), oder behalte den Begriff bei wenn er spezifisch ist. Gib nur den/die Begriffe zurück.

            3. **Zeitraum (minDate / maxDate)**:
               - Berechne relative Zeitangaben basierend auf dem heutigen Datum!
               - "Letzte Woche" -> minDate = (heute - 7 Tage), maxDate = (heute).
               - "Diesen Monat" -> minDate = (Anfang d. Monats), maxDate = (Ende d. Monats).
               - "2023" -> minDate = "2023-01-01", maxDate = "2023-12-31".
               - Gib Daten IMMER im Format YYYY-MM-DD an.

            **Input:** "${query}"
            
            **Output:** Gib NUR ein valides JSON-Objekt zurück.`,
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
  } catch (e: any) {
    console.error("Failed to parse search query with Gemini", e);

    const prompt = `Du bist ein intelligenter Suchassistent für das Ratsinformationssystem der Stadt Köln.
Analysiere die Suchanfrage und gib ein JSON-Objekt zurück mit:
- resource: 'meetings', 'papers', 'people', 'organizations' oder 'all'
- q: Suchbegriff (ohne Füllwörter)
- minDate: Startdatum (YYYY-MM-DD) falls erwähnt
- maxDate: Enddatum (YYYY-MM-DD) falls erwähnt

Heutiges Datum: ${new Date().toISOString().split("T")[0]}
Suchanfrage: "${query}"

Gib NUR das JSON zurück, keine Erklärungen.`;

    const openRouterResult = await tryOpenRouterFallback(prompt, "parseSearchQuery");
    if (openRouterResult) {
      // Extract JSON from response (in case model adds extra text)
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
