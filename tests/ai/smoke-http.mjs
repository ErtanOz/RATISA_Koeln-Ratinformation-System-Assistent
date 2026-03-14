import http from "node:http";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const LOCAL_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
].join(",");

async function waitForServerReady(childProcess, timeoutMs = 20_000) {
  let ready = false;
  let stdout = "";
  let stderr = "";

  childProcess.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    stdout += text;
    if (text.includes("listening on")) {
      ready = true;
    }
  });

  childProcess.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const startedAt = Date.now();
  while (!ready && Date.now() - startedAt < timeoutMs) {
    await sleep(200);
  }

  if (!ready) {
    throw new Error(`HTTP server did not start in time. stdout=${stdout} stderr=${stderr}`);
  }
}

async function withAiServer(env, callback) {
  const port = 3343;
  const host = "127.0.0.1";
  const child = spawn("node", ["mcp-server-netlify/build/dev-http.js"], {
    env: {
      ...process.env,
      MCP_PORT: String(port),
      MCP_BIND_HOST: host,
      MCP_ALLOWED_ORIGINS: LOCAL_ALLOWED_ORIGINS,
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForServerReady(child);
    await callback(`http://${host}:${port}`);
  } finally {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
    await new Promise((resolve) => child.once("exit", resolve));
  }
}

async function postJson(url, body, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    json: await response.json(),
  };
}

async function postRaw(url, rawBody, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...headers,
    },
    body: rawBody,
  });

  return {
    status: response.status,
    json: await response.json(),
  };
}

async function withAttachmentServer(callback) {
  const host = "127.0.0.1";
  const port = 3344;
  const largeBuffer = Buffer.alloc(11 * 1024 * 1024, 7);
  const smallBuffer = Buffer.alloc(128, 1);

  const server = http.createServer((req, res) => {
    if (req.url === "/large.pdf") {
      res.writeHead(200, { "Content-Type": "application/pdf" });
      res.end(largeBuffer);
      return;
    }
    if (req.url === "/small.pdf") {
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Length": String(smallBuffer.byteLength),
      });
      res.end(smallBuffer);
      return;
    }
    if (req.url === "/redirect-external") {
      res.writeHead(302, { Location: "https://example.com/escape.pdf" });
      res.end();
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => server.listen(port, host, resolve));
  try {
    await callback({
      largeAssetUrl: `http://${host}:${port}/large.pdf`,
      smallAssetUrl: `http://${host}:${port}/small.pdf`,
      redirectEscapeUrl: `http://${host}:${port}/redirect-external`,
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

async function run() {
  await withAiServer({ AI_MOCK_MODE: "gemini-success" }, async (baseUrl) => {
    const response = await postJson(
      `${baseUrl}/ai/ask`,
      { prompt: "ping" },
      { Origin: "http://localhost:5173" },
    );
    assert(response.status === 200, "Expected 200 for gemini-success mock mode.");
    assert(response.json.text === "Mock Gemini success.", "Expected mock Gemini response.");
  });

  await withAiServer({ AI_MOCK_MODE: "openrouter-fallback" }, async (baseUrl) => {
    const response = await postJson(`${baseUrl}/ai/ask`, { prompt: "ping" });
    assert(response.status === 200, "Expected 200 for openrouter-fallback mock mode.");
    assert(
      response.json.text === "Mock OpenRouter fallback success.",
      "Expected mock OpenRouter fallback response.",
    );
  });

  await withAiServer({ AI_MOCK_MODE: "parse-fallback" }, async (baseUrl) => {
    const response = await postJson(`${baseUrl}/ai/parse-search`, {
      query: "Zeige mir Anträge aus 2024",
    });
    assert(response.status === 200, "Expected 200 for parse fallback.");
    assert(response.json.resource === "papers", "Expected deterministic fallback resource.");
    assert(response.json.minDate === "2024-01-01", "Expected deterministic fallback minDate.");
    assert(response.json.maxDate === "2024-12-31", "Expected deterministic fallback maxDate.");
  });

  await withAiServer({ AI_MOCK_MODE: "echo" }, async (baseUrl) => {
    const longPromptResponse = await postJson(`${baseUrl}/ai/ask`, {
      prompt: "x".repeat(8001),
    });
    assert(longPromptResponse.status === 400, "Expected 400 for prompt over 8000 chars.");
    assert(
      longPromptResponse.json.error.includes("8000"),
      "Expected prompt length validation message.",
    );

    const tooManyAttachmentsResponse = await postJson(`${baseUrl}/ai/ask`, {
      prompt: "ping",
      attachments: [
        { url: "https://buergerinfo.stadt-koeln.de/a.pdf", mimeType: "application/pdf" },
        { url: "https://buergerinfo.stadt-koeln.de/b.pdf", mimeType: "application/pdf" },
        { url: "https://buergerinfo.stadt-koeln.de/c.pdf", mimeType: "application/pdf" },
        { url: "https://buergerinfo.stadt-koeln.de/d.pdf", mimeType: "application/pdf" },
      ],
    });
    assert(
      tooManyAttachmentsResponse.status === 400,
      "Expected 400 for more than 3 attachments.",
    );

    const invalidMimeTypeResponse = await postJson(`${baseUrl}/ai/ask`, {
      prompt: "ping",
      attachments: [
        { url: "https://buergerinfo.stadt-koeln.de/a.txt", mimeType: "text/plain" },
      ],
    });
    assert(invalidMimeTypeResponse.status === 400, "Expected 400 for invalid attachment mime type.");

    const longQueryResponse = await postJson(`${baseUrl}/ai/parse-search`, {
      query: "q".repeat(501),
    });
    assert(longQueryResponse.status === 400, "Expected 400 for query over 500 chars.");
    assert(
      longQueryResponse.json.error.includes("500"),
      "Expected query length validation message.",
    );

    const oversizedBodyResponse = await postRaw(
      `${baseUrl}/ai/ask`,
      JSON.stringify({ prompt: "x".repeat(140 * 1024) }),
    );
    assert(oversizedBodyResponse.status === 413, "Expected 413 for oversized JSON body.");
  });

  await withAttachmentServer(async ({ largeAssetUrl, redirectEscapeUrl, smallAssetUrl }) => {
    await withAiServer({ AI_MOCK_MODE: "echo" }, async (baseUrl) => {
      const response = await postJson(`${baseUrl}/ai/ask`, {
        prompt: "attachment-check",
        attachments: [{ url: largeAssetUrl, mimeType: "application/pdf" }],
      });

      assert(response.status === 200, "Expected 200 for attachment guardrail mock.");
      assert(
        typeof response.json.text === "string" &&
          response.json.text.includes("Datei zu groß"),
        "Expected attachment guardrail note in mock response.",
      );

      const disallowedHostResponse = await postJson(`${baseUrl}/ai/ask`, {
        prompt: "attachment-check",
        attachments: [{ url: "https://example.com/evil.pdf", mimeType: "application/pdf" }],
      });
      assert(disallowedHostResponse.status === 200, "Expected 200 for disallowed attachment host guardrail.");
      assert(
        typeof disallowedHostResponse.json.text === "string" &&
          disallowedHostResponse.json.text.includes("nicht erlaubt"),
        "Expected disallowed host note in response text.",
      );

      const redirectEscapeResponse = await postJson(`${baseUrl}/ai/ask`, {
        prompt: "attachment-check",
        attachments: [{ url: redirectEscapeUrl, mimeType: "application/pdf" }],
      });
      assert(redirectEscapeResponse.status === 200, "Expected 200 for redirect escape guardrail.");
      assert(
        typeof redirectEscapeResponse.json.text === "string" &&
          redirectEscapeResponse.json.text.includes("nicht erlaubt"),
        "Expected redirect escape note in response text.",
      );

      const allowedSmallAttachmentResponse = await postJson(`${baseUrl}/ai/ask`, {
        prompt: "attachment-check",
        attachments: [{ url: smallAssetUrl, mimeType: "application/pdf" }],
      });
      assert(allowedSmallAttachmentResponse.status === 200, "Expected 200 for allowed local attachment in dev/test.");
    });
  });

  await withAiServer(
    {
      AI_MOCK_MODE: "gemini-success",
      AI_ASK_RATE_LIMIT_MAX: "1",
      AI_ASK_RATE_LIMIT_WINDOW_MS: "60000",
    },
    async (baseUrl) => {
      const firstResponse = await postJson(`${baseUrl}/ai/ask`, { prompt: "ping" });
      const secondResponse = await postJson(`${baseUrl}/ai/ask`, { prompt: "ping" });

      assert(firstResponse.status === 200, "Expected first ask request to succeed before rate limiting.");
      assert(secondResponse.status === 429, "Expected second ask request to hit rate limit.");
      assert(
        typeof secondResponse.json.error === "string" &&
          secondResponse.json.error.includes("Sicherheitsmaßnahme"),
        "Expected user-facing security explanation for ask rate limiting.",
      );
    },
  );

  await withAiServer(
    {
      AI_MOCK_MODE: "parse-fallback",
      AI_PARSE_RATE_LIMIT_MAX: "1",
      AI_PARSE_RATE_LIMIT_WINDOW_MS: "60000",
    },
    async (baseUrl) => {
      const firstResponse = await postJson(`${baseUrl}/ai/parse-search`, {
        query: "Zeige mir Anträge aus 2024",
      });
      const secondResponse = await postJson(`${baseUrl}/ai/parse-search`, {
        query: "Zeige mir Anträge aus 2024",
      });

      assert(firstResponse.status === 200, "Expected first parse request to succeed before rate limiting.");
      assert(secondResponse.status === 429, "Expected second parse request to hit rate limit.");
      assert(
        typeof secondResponse.json.error === "string" &&
          secondResponse.json.error.includes("Sicherheitsmaßnahme"),
        "Expected user-facing security explanation for parse rate limiting.",
      );
    },
  );

  console.log("AI HTTP smoke test passed.");
}

run().catch((error) => {
  console.error("AI HTTP smoke test failed:", error);
  process.exit(1);
});
