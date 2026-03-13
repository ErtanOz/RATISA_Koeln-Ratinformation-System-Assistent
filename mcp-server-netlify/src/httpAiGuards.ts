import type {
  ErrorRequestHandler,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";

export interface ValidatedAttachment {
  url: string;
  mimeType: string;
}

const DEFAULT_AI_HTTP_BODY_LIMIT = "128kb";
const DEFAULT_AI_ASK_RATE_LIMIT_WINDOW_MS = 300_000;
const DEFAULT_AI_ASK_RATE_LIMIT_MAX = 10;
const DEFAULT_AI_PARSE_RATE_LIMIT_WINDOW_MS = 300_000;
const DEFAULT_AI_PARSE_RATE_LIMIT_MAX = 60;

const MAX_PROMPT_LENGTH = 8_000;
const MAX_QUERY_LENGTH = 500;
const MAX_ATTACHMENTS = 3;

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const rateLimitStores = new Map<string, Map<string, RateLimitBucket>>();

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function getClientKey(req: Request): string {
  const forwardedFor =
    typeof req.headers["x-forwarded-for"] === "string"
      ? req.headers["x-forwarded-for"].split(",")[0]?.trim()
      : "";

  return forwardedFor || req.ip || req.socket.remoteAddress || "unknown";
}

function pruneExpiredBuckets(store: Map<string, RateLimitBucket>, now: number) {
  if (store.size < 512) {
    return;
  }

  store.forEach((bucket, key) => {
    if (bucket.resetAt <= now) {
      store.delete(key);
    }
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function formatRetryDelay(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} Sekunde${seconds === 1 ? "" : "n"}`;
  }

  const minutes = Math.ceil(seconds / 60);
  return `${minutes} Minute${minutes === 1 ? "" : "n"}`;
}

function isValidAttachmentMimeType(value: string): boolean {
  return value === "application/pdf" || value.startsWith("image/");
}

function validateAttachment(input: unknown, index: number): ValidatedAttachment {
  if (!isPlainObject(input)) {
    throw new Error(`attachments[${index}] muss ein Objekt sein.`);
  }

  const rawUrl = typeof input.url === "string" ? input.url.trim() : "";
  if (!rawUrl) {
    throw new Error(`attachments[${index}].url ist erforderlich.`);
  }

  try {
    new URL(rawUrl);
  } catch {
    throw new Error(`attachments[${index}].url muss eine gültige URL sein.`);
  }

  const mimeType =
    typeof input.mimeType === "string" ? input.mimeType.trim().toLowerCase() : "";

  if (!mimeType) {
    throw new Error(`attachments[${index}].mimeType ist erforderlich.`);
  }

  if (!isValidAttachmentMimeType(mimeType)) {
    throw new Error(
      `attachments[${index}].mimeType muss application/pdf oder image/* sein.`,
    );
  }

  return {
    url: rawUrl,
    mimeType,
  };
}

export function getAiJsonBodyLimit(): string {
  const configured = process.env.AI_HTTP_BODY_LIMIT?.trim();
  return configured || DEFAULT_AI_HTTP_BODY_LIMIT;
}

export function createRateLimitMiddleware(
  bucketName: "ai-ask" | "ai-parse",
): RequestHandler {
  const windowMs =
    bucketName === "ai-ask"
      ? parsePositiveInteger(
          process.env.AI_ASK_RATE_LIMIT_WINDOW_MS,
          DEFAULT_AI_ASK_RATE_LIMIT_WINDOW_MS,
        )
      : parsePositiveInteger(
          process.env.AI_PARSE_RATE_LIMIT_WINDOW_MS,
          DEFAULT_AI_PARSE_RATE_LIMIT_WINDOW_MS,
        );

  const max =
    bucketName === "ai-ask"
      ? parsePositiveInteger(
          process.env.AI_ASK_RATE_LIMIT_MAX,
          DEFAULT_AI_ASK_RATE_LIMIT_MAX,
        )
      : parsePositiveInteger(
          process.env.AI_PARSE_RATE_LIMIT_MAX,
          DEFAULT_AI_PARSE_RATE_LIMIT_MAX,
        );

  const store = rateLimitStores.get(bucketName) || new Map<string, RateLimitBucket>();
  rateLimitStores.set(bucketName, store);

  return (req, res, next) => {
    const now = Date.now();
    const clientKey = getClientKey(req);

    pruneExpiredBuckets(store, now);

    const current = store.get(clientKey);
    if (!current || current.resetAt <= now) {
      store.set(clientKey, {
        count: 1,
        resetAt: now + windowMs,
      });
      next();
      return;
    }

    if (current.count >= max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        error:
          "Zu viele KI-Anfragen in kurzer Zeit. Diese Grenze ist eine temporäre " +
          "Sicherheitsmaßnahme zum Schutz vor Missbrauch. " +
          `Bitte versuchen Sie es in etwa ${formatRetryDelay(retryAfterSeconds)} erneut.`,
      });
      return;
    }

    current.count += 1;
    store.set(clientKey, current);
    next();
  };
}

export const validateAskRequest: RequestHandler = (req, res, next) => {
  if (!isPlainObject(req.body)) {
    res.status(400).json({ error: "Ungültiger JSON-Body." });
    return;
  }

  const prompt = typeof req.body.prompt === "string" ? req.body.prompt.trim() : "";
  if (!prompt) {
    res.status(400).json({ error: "prompt ist erforderlich." });
    return;
  }

  if (prompt.length > MAX_PROMPT_LENGTH) {
    res
      .status(400)
      .json({ error: `prompt darf maximal ${MAX_PROMPT_LENGTH} Zeichen enthalten.` });
    return;
  }

  const rawAttachments =
    req.body.attachments === undefined ? [] : req.body.attachments;

  if (!Array.isArray(rawAttachments)) {
    res.status(400).json({ error: "attachments muss ein Array sein." });
    return;
  }

  if (rawAttachments.length > MAX_ATTACHMENTS) {
    res.status(400).json({
      error: `attachments darf maximal ${MAX_ATTACHMENTS} Einträge enthalten.`,
    });
    return;
  }

  try {
    const attachments = rawAttachments.map(validateAttachment);
    req.body = {
      prompt,
      attachments,
    };
    next();
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Ungültige attachments.",
    });
  }
};

export const validateParseSearchRequest: RequestHandler = (req, res, next) => {
  if (!isPlainObject(req.body)) {
    res.status(400).json({ error: "Ungültiger JSON-Body." });
    return;
  }

  const query = typeof req.body.query === "string" ? req.body.query.trim() : "";
  if (!query) {
    res.status(400).json({ error: "query ist erforderlich." });
    return;
  }

  if (query.length > MAX_QUERY_LENGTH) {
    res
      .status(400)
      .json({ error: `query darf maximal ${MAX_QUERY_LENGTH} Zeichen enthalten.` });
    return;
  }

  req.body = { query };
  next();
};

export const handleAiJsonBodyParserError: ErrorRequestHandler = (
  error,
  req,
  res,
  next,
) => {
  if (!req.path.startsWith("/ai/")) {
    next(error);
    return;
  }

  const maybeBodyParserError = error as {
    type?: string;
    status?: number;
    expose?: boolean;
  };

  if (maybeBodyParserError.type === "entity.too.large") {
    res.status(413).json({
      error: `Request-Body überschreitet das Limit von ${getAiJsonBodyLimit()}.`,
    });
    return;
  }

  if (
    maybeBodyParserError instanceof SyntaxError &&
    maybeBodyParserError.status === 400 &&
    maybeBodyParserError.expose
  ) {
    res.status(400).json({ error: "Ungültiges JSON." });
    return;
  }

  next(error);
};
