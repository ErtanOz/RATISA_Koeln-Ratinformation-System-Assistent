<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1wPCT5Ku6Jx1fouL5OvbVuH1Hq-nh3751

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Configure [.env.local](.env.local):
   - `VITE_ENABLE_AI=true` (optional, defaults to `true` in dev and `false` in production)
   - `VITE_AI_HTTP_ENDPOINT=/ai` (optional, defaults to `/ai`)
   - `VITE_OPARL_PROXY_PREFIX=/oparl` (optional, defaults to `/oparl`)
   - `VITE_OPARL_BODY_ID=stadtverwaltung_koeln` (optional, defaults to `stadtverwaltung_koeln`)
   - `VITE_MCP_HTTP_ENDPOINT=/mcp-http` (optional, defaults to `/mcp-http`)
   - Important: keep each key only once in the file. Duplicate env keys override earlier values.
3. If you want AI search or AI summaries locally, start the separate HTTP backend in `mcp-server-netlify` and set the provider keys there.
4. Run the app:
   `npm run dev`

## VPS Deployment (Nginx)

### Build and publish

1. Build the app:
   `npm run build`
2. Upload `dist/` to your VPS (for example `/var/www/ratisa/dist`).
   - Important: deploy with cleanup (`rsync --delete` or remove old files first) so stale asset hashes are not kept.
3. Use the versioned Nginx config template:
   `deploy/nginx/ratisa.conf`
4. Reload Nginx:
   `sudo nginx -t && sudo systemctl reload nginx`

### Required Nginx behavior

- `location /oparl/` must reverse proxy to:
  `https://buergerinfo.stadt-koeln.de/oparl/`
- `location /ai/` should reverse proxy to your HTTP backend service (for example `http://127.0.0.1:3333/ai/`)
- `location /` must keep SPA fallback:
  `try_files $uri /index.html`
- `/oparl/` and `/ai/` blocks must come before `/` block.

### Smoke checks after deploy

```bash
curl -I https://<your-domain>/
curl -I "https://<your-domain>/oparl/bodies/stadtverwaltung_koeln/papers?limit=1"
curl -I "https://<your-domain>/ai/healthz"
```

Expected:
- `/` returns `200`
- `/oparl/...` returns `200` with `content-type: application/json`
- `/ai/healthz` returns `200`

### Troubleshooting checklist

- If browser shows `Unexpected token '<'`, your `/oparl/*` route is returning HTML instead of JSON.
- If `/oparl/...` returns `404`, your reverse proxy block is missing or placed after SPA fallback.
- If AI requests fail with `404`, your `/ai/*` reverse proxy is missing or not routed to the HTTP backend.
- If AI features should remain off in production, keep `VITE_ENABLE_AI=false` (or unset it; production default is disabled).

## MCP Development

### HTTP backend (for `/mcp` and `/ai`)

Run the local HTTP MCP server:

```bash
npm run mcp:http:dev
```

Default endpoints:

- `http://127.0.0.1:3333/mcp`
- `http://127.0.0.1:3333/ai/ask`
- `http://127.0.0.1:3333/ai/parse-search`

The frontend dev server proxies `/mcp-http` and `/ai/*` to that backend.

### Smoke tests

Run smoke tests:

```bash
npm run mcp:smoke:stdio
npm run mcp:smoke:http
npm run ai:smoke:http
```

### `/mcp` Playground

The `/mcp` page now includes an HTTP playground with:

- endpoint input (defaults to `VITE_MCP_HTTP_ENDPOINT` or `/mcp-http`)
- optional API key input (`x-mcp-api-key`)
- `tools/list` execution
- `tools/call` execution with editable JSON arguments
- status, latency, and raw JSON-RPC response preview
