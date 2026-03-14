import type { RequestHandler, Response } from "express";

function respondWithInvalidJson(res: Response) {
  res.status(400).json({ error: "Ungültiges JSON." });
}

function parseJsonValue(rawBody: string): unknown {
  const trimmed = rawBody.trim();
  if (!trimmed) {
    return {};
  }

  return JSON.parse(trimmed);
}

export const normalizeJsonRequestBody: RequestHandler = (req, res, next) => {
  try {
    if (Buffer.isBuffer(req.body)) {
      req.body = parseJsonValue(req.body.toString("utf8"));
    } else if (typeof req.body === "string") {
      req.body = parseJsonValue(req.body);
    }
  } catch {
    respondWithInvalidJson(res);
    return;
  }

  next();
};
