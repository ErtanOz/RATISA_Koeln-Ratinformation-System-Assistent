# OParl Köln MCP – HTTP/Netlify

This folder contains the HTTP-compatible MCP server variant (Streamable HTTP with JSON response mode).

## Local development

```powershell
cd mcp-server-netlify
npm.cmd install
npm.cmd run dev:http
```

Default dev endpoints:

- `http://127.0.0.1:3333/mcp`
- `http://127.0.0.1:3333/ai/ask`
- `http://127.0.0.1:3333/ai/parse-search`
- health check: `http://127.0.0.1:3333/healthz`

## Environment variables

- `MCP_PORT` (default `3333`)
- `MCP_BIND_HOST` (default `127.0.0.1`)
- `MCP_ALLOWED_ORIGINS` (comma-separated, default `http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173`)
- `MCP_API_KEY` (optional)
- `GEMINI_API_KEY` or `API_KEY` (optional for `/ai/*`, primary provider)
- `GEMINI_MODEL` (optional override, default `gemini-2.5-flash`)
- `GEMINI_FALLBACK_MODELS` (optional comma-separated fallback chain)
- `OPENROUTER_API_KEY` (optional `/ai/*` fallback provider)
- `AI_MOCK_MODE` (optional local/smoke-test mode: `gemini-success`, `openrouter-fallback`, `parse-fallback`, `parse-success`, `echo`)

### Optional API key protection

If `MCP_API_KEY` is set, requests must include either:

- `x-mcp-api-key: <key>`
- `Authorization: Bearer <key>`

If not set, the endpoint remains open (backwards compatible behavior).

## CORS

CORS and preflight handling are built in for browser-based playground usage.

- Allowed origins come from `MCP_ALLOWED_ORIGINS`.
- Local browser usage officially supports frontend dev servers on `3000` and `5173`.
- `OPTIONS` preflight requests return `204` when origin is allowed.
- If you change the frontend port, add the exact browser origin to `MCP_ALLOWED_ORIGINS`.

## Deploy to Netlify

1. Create a new Netlify site.
2. Set **Base directory** to `mcp-server-netlify`.
3. Build command: `npm run build`
4. Functions directory: `netlify/functions`

After deploy, your MCP endpoint is:

`https://<your-site>.netlify.app/.netlify/functions/mcp`

Health endpoint (same function mount):

`https://<your-site>.netlify.app/.netlify/functions/mcp/healthz`

AI endpoints on the same function mount:

- `https://<your-site>.netlify.app/.netlify/functions/mcp/ai/ask`
- `https://<your-site>.netlify.app/.netlify/functions/mcp/ai/parse-search`

## Notes / limitations

- Stateless JSON response mode is used (no long-lived SSE sessions).
- All tools map to the Cologne OParl API and apply server-side filtering/pagination.
- `/ai/*` centralizes Gemini/OpenRouter access so provider secrets never need to be shipped to the browser bundle.
