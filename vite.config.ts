import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on']);

const parseBooleanEnv = (value: string | undefined, fallback: boolean) => {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  return TRUTHY_VALUES.has(normalized);
};

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const aiEnabled = parseBooleanEnv(env.VITE_ENABLE_AI, mode !== 'production');
    const geminiApiKey = aiEnabled ? env.GEMINI_API_KEY || '' : '';
    const openRouterApiKey = aiEnabled ? env.OPENROUTER_API_KEY || '' : '';
    const oparlProxyPrefix = env.VITE_OPARL_PROXY_PREFIX || '/oparl';
    const oparlBodyId = env.VITE_OPARL_BODY_ID || 'stadtverwaltung_koeln';

    return {
      publicDir: 'public',
      build: {
        emptyOutDir: true,
      },
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          // Proxy all /oparl/* requests to the actual OParl server to bypass CORS
          '/oparl': {
            target: 'https://buergerinfo.stadt-koeln.de',
            changeOrigin: true,
            secure: true,
            // No rewrite needed: /oparl/... maps directly to the target path
          },
          '/mcp-http': {
            target: 'http://127.0.0.1:3333',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/mcp-http/, '/mcp'),
          }
        }
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(geminiApiKey),
        'process.env.GEMINI_API_KEY': JSON.stringify(geminiApiKey),
        'process.env.OPENROUTER_API_KEY': JSON.stringify(openRouterApiKey),
        'process.env.GEMINI_MODEL': JSON.stringify(env.GEMINI_MODEL),
        'process.env.GEMINI_FALLBACK_MODELS': JSON.stringify(env.GEMINI_FALLBACK_MODELS),
        'process.env.VITE_ENABLE_AI': JSON.stringify(aiEnabled ? 'true' : 'false'),
        'process.env.VITE_OPARL_PROXY_PREFIX': JSON.stringify(oparlProxyPrefix),
        'process.env.VITE_OPARL_BODY_ID': JSON.stringify(oparlBodyId),
        'process.env.VITE_MCP_HTTP_ENDPOINT': JSON.stringify(env.VITE_MCP_HTTP_ENDPOINT || '/mcp-http'),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
