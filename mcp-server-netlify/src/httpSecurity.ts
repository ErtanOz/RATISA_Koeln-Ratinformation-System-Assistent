import type { Request, Response } from "express";

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

const ALLOW_METHODS = "GET,POST,OPTIONS";
const ALLOW_HEADERS =
  "Content-Type,Accept,Authorization,x-mcp-api-key,mcp-session-id,last-event-id";

const SECURITY_HEADERS: Record<string, string> = {
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

function parseAllowedOrigins(): string[] {
  const raw = process.env.MCP_ALLOWED_ORIGINS;
  if (!raw || !raw.trim()) {
    return DEFAULT_ALLOWED_ORIGINS;
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function extractBearerToken(authorizationHeader?: string): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token.trim();
}

export function applyCorsAndMaybeHandlePreflight(
  req: Request,
  res: Response
): boolean {
  const allowedOrigins = parseAllowedOrigins();
  const allowAnyOrigin = allowedOrigins.includes("*");
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";

  res.setHeader("Access-Control-Allow-Methods", ALLOW_METHODS);
  res.setHeader("Access-Control-Allow-Headers", ALLOW_HEADERS);
  res.setHeader("Access-Control-Max-Age", "600");

  const isAllowedOrigin = !origin || allowAnyOrigin || allowedOrigins.includes(origin);

  if (origin && isAllowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowAnyOrigin ? "*" : origin);
    res.setHeader("Vary", "Origin");
  }

  if (origin && !isAllowedOrigin) {
    res.status(403).json({ error: "Origin not allowed by MCP_ALLOWED_ORIGINS." });
    return true;
  }

  if (req.method === "OPTIONS") {
    res.status(204).send();
    return true;
  }

  return false;
}

export function applySecurityHeaders(req: Request, res: Response): void {
  Object.entries(SECURITY_HEADERS).forEach(([header, value]) => {
    res.setHeader(header, value);
  });

  if (req.path.startsWith("/ai/") || req.path === "/mcp") {
    res.setHeader("Cache-Control", "no-store");
  }
}

export function isApiKeyAuthorized(req: Request, res: Response): boolean {
  const expectedApiKey = process.env.MCP_API_KEY?.trim();
  if (!expectedApiKey) {
    return true;
  }

  const headerApiKey =
    typeof req.headers["x-mcp-api-key"] === "string"
      ? req.headers["x-mcp-api-key"].trim()
      : "";

  const bearerToken = extractBearerToken(
    typeof req.headers.authorization === "string"
      ? req.headers.authorization
      : undefined
  );

  if (headerApiKey === expectedApiKey || bearerToken === expectedApiKey) {
    return true;
  }

  res.status(401).json({
    error:
      "Unauthorized. Provide x-mcp-api-key or Authorization: Bearer <key>.",
  });
  return false;
}
