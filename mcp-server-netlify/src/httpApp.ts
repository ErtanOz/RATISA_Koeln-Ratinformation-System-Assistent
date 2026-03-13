import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { localhostHostValidation } from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js";
import { askGemini, Attachment, parseSearchQuery } from "./aiService.js";
import { createOparlServer } from "./server.js";
import {
  createRateLimitMiddleware,
  getAiJsonBodyLimit,
  handleAiJsonBodyParserError,
  validateAskRequest,
  validateParseSearchRequest,
} from "./httpAiGuards.js";
import {
  applyCorsAndMaybeHandlePreflight,
  applySecurityHeaders,
  isApiKeyAuthorized,
} from "./httpSecurity.js";

function createSecureHttpApp(bindHost: string) {
  const app = express();

  if (bindHost === "127.0.0.1" || bindHost === "localhost" || bindHost === "::1") {
    app.use(localhostHostValidation());
  } else if (bindHost === "0.0.0.0" || bindHost === "::") {
    console.warn(
      `Warning: Server is binding to ${bindHost} without DNS rebinding protection. ` +
        "Consider using authentication or a trusted reverse proxy in front of the service.",
    );
  }

  return app;
}

export function createHttpApp() {
  const bindHost = process.env.MCP_BIND_HOST || "127.0.0.1";
  const app = createSecureHttpApp(bindHost);

  app.use((req, res, next) => {
    applySecurityHeaders(req, res);
    if (applyCorsAndMaybeHandlePreflight(req, res)) {
      return;
    }
    next();
  });

  app.use("/ai", express.json({ limit: getAiJsonBodyLimit() }));
  app.use("/mcp", express.json());

  app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok", service: "oparl-koeln-mcp-http" });
  });

  app.post(
    "/ai/ask",
    createRateLimitMiddleware("ai-ask"),
    validateAskRequest,
    async (req, res) => {
      const { prompt, attachments } = req.body as {
        prompt: string;
        attachments: Attachment[];
      };

      try {
        const text = await askGemini(prompt, attachments);
        res.status(200).json({ text });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "AI-Anfrage fehlgeschlagen.";
        res.status(503).json({ error: message });
      }
    },
  );

  app.post(
    "/ai/parse-search",
    createRateLimitMiddleware("ai-parse"),
    validateParseSearchRequest,
    async (req, res) => {
      const { query } = req.body as { query: string };

      try {
        const result = await parseSearchQuery(query);
        res.status(200).json(result);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Search-Parsing fehlgeschlagen.";
        res.status(503).json({ error: message });
      }
    },
  );

  app.all("/mcp", async (req, res) => {
    if (!isApiKeyAuthorized(req, res)) {
      return;
    }

    const server = createOparlServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error: unknown) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    } finally {
      res.on("close", () => {
        transport.close();
        server.close();
      });
    }
  });

  app.use(handleAiJsonBodyParserError);

  return app;
}
