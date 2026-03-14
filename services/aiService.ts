import { runtimeConfig } from "./runtimeConfig";

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

type JsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; data: unknown };

const DISABLED_MESSAGE =
  "⚠️ **Hinweis**: Die KI-Funktionen sind in dieser Umgebung deaktiviert. Aktivieren Sie `VITE_ENABLE_AI=true`, um die HTTP-basierte KI-Integration zu nutzen.";

const SERVICE_UNAVAILABLE_MESSAGE =
  "Der AI-Dienst ist derzeit nicht erreichbar. Bitte versuchen Sie es später erneut.";

const NOT_FOUND_MESSAGE =
  "Der AI-Dienst ist unter diesem Pfad nicht erreichbar (404). Prüfen Sie `VITE_AI_HTTP_ENDPOINT` oder die Weiterleitung für `/ai/*`.";

const NETLIFY_FUNCTIONS_AI_ENDPOINT = "/.netlify/functions/mcp/ai";

const looksLikeHtmlDocument = (value: string): boolean =>
  /<(!doctype|html)\b/i.test(value);

const parseMaybeJson = (text: string): unknown => {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const toErrorMessage = (status: number, data: unknown): string => {
  if (data && typeof data === "object") {
    const maybeMessage = (data as { error?: unknown; message?: unknown }).error;
    const maybeFallback = (data as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) return maybeMessage;
    if (typeof maybeFallback === "string" && maybeFallback.trim()) return maybeFallback;
  }
  if (typeof data === "string" && data.trim()) {
    if (looksLikeHtmlDocument(data)) {
      return status === 404 ? NOT_FOUND_MESSAGE : SERVICE_UNAVAILABLE_MESSAGE;
    }
    return data;
  }
  if (status === 404) return NOT_FOUND_MESSAGE;
  if (status >= 500) return SERVICE_UNAVAILABLE_MESSAGE;
  return `AI request failed with status ${status}.`;
};

const shouldTryNetlifyFallback = (endpoint: string, result: JsonResult<unknown>): boolean =>
  endpoint === "/ai" &&
  result.ok === false &&
  (result.status === 0 || result.status === 404);

async function postJsonOnce<T>(
  endpoint: string,
  path: string,
  body: Record<string, unknown>,
): Promise<JsonResult<T>> {
  try {
    const response = await fetch(`${endpoint}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    const rawText = await response.text();
    const data = parseMaybeJson(rawText);

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: toErrorMessage(response.status, data),
        data,
      };
    }

    return {
      ok: true,
      data: data as T,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error:
        error instanceof Error && error.message
          ? `${SERVICE_UNAVAILABLE_MESSAGE} (${error.message})`
          : SERVICE_UNAVAILABLE_MESSAGE,
      data: error,
    };
  }
}

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<JsonResult<T>> {
  const primaryResult = await postJsonOnce<T>(runtimeConfig.aiHttpEndpoint, path, body);
  if (!shouldTryNetlifyFallback(runtimeConfig.aiHttpEndpoint, primaryResult)) {
    return primaryResult;
  }

  return postJsonOnce<T>(NETLIFY_FUNCTIONS_AI_ENDPOINT, path, body);
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

const isStructuredSearch = (value: unknown): value is StructuredSearch =>
  Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as StructuredSearch).resource === "string",
  );

export async function askGemini(
  prompt: string,
  attachments: Attachment[] = [],
): Promise<string> {
  if (!runtimeConfig.enableAi) return DISABLED_MESSAGE;

  const response = await postJson<{ text?: string }>("/ask", {
    prompt,
    attachments,
  });

  if (response.ok === false) return response.error;

  const text = response.data?.text;
  return typeof text === "string" && text.trim()
    ? text
    : "Keine Antwort vom Modell erhalten.";
}

export async function parseSearchQuery(
  query: string,
): Promise<StructuredSearch | null> {
  if (!runtimeConfig.enableAi) return fallbackParse(query);

  const response = await postJson<StructuredSearch | null>("/parse-search", {
    query,
  });

  if (response.ok === false) {
    console.warn("AI parse request failed, using deterministic fallback:", response.error);
    return fallbackParse(query);
  }

  if (!response.data) return fallbackParse(query);
  return isStructuredSearch(response.data) ? response.data : fallbackParse(query);
}
