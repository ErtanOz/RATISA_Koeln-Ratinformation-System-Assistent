const DEFAULT_OPARL_PROXY_PREFIX = "/oparl";
const DEFAULT_OPARL_BODY_ID = "stadtverwaltung_koeln";
const DEFAULT_AI_HTTP_ENDPOINT = "/ai";

const truthyValues = new Set(["1", "true", "yes", "on"]);

function normalizeBooleanString(value?: string): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  return truthyValues.has(normalized);
}

function normalizeProxyPrefix(value?: string): string {
  const raw = (value || DEFAULT_OPARL_PROXY_PREFIX).trim();
  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, "/");
  const withoutTrailingSlash = collapsed.replace(/\/+$/, "");
  return withoutTrailingSlash || DEFAULT_OPARL_PROXY_PREFIX;
}

function normalizeBodyId(value?: string): string {
  const raw = (value || DEFAULT_OPARL_BODY_ID).trim();
  const trimmed = raw.replace(/^\/+|\/+$/g, "");
  return trimmed || DEFAULT_OPARL_BODY_ID;
}

function normalizeHttpEndpoint(value?: string): string {
  const raw = (value || DEFAULT_AI_HTTP_ENDPOINT).trim();
  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, "/");
  return collapsed.replace(/\/+$/, "") || DEFAULT_AI_HTTP_ENDPOINT;
}

const parsedEnableAi = normalizeBooleanString(process.env.VITE_ENABLE_AI);
const oparlProxyPrefix = normalizeProxyPrefix(process.env.VITE_OPARL_PROXY_PREFIX);
const oparlBodyId = normalizeBodyId(process.env.VITE_OPARL_BODY_ID);
const aiHttpEndpoint = normalizeHttpEndpoint(process.env.VITE_AI_HTTP_ENDPOINT);

export const runtimeConfig = {
  enableAi: parsedEnableAi ?? true,
  aiHttpEndpoint,
  oparlProxyPrefix,
  oparlBodyId,
  oparlBaseUrl: `${oparlProxyPrefix}/bodies/${oparlBodyId}`,
};
