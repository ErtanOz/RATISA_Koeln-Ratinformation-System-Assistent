// @vitest-environment node

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const redirectsPath = path.join(process.cwd(), "public", "_redirects");

function readSources(): string[] {
  return readFileSync(redirectsPath, "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/)[0]);
}

describe("Netlify redirects", () => {
  it("keeps AI and MCP rewrites ahead of the SPA fallback", () => {
    const sources = readSources();
    const spaFallbackIndex = sources.indexOf("/*");

    expect(sources.indexOf("/mcp-http")).toBeGreaterThanOrEqual(0);
    expect(sources.indexOf("/mcp-http/*")).toBeGreaterThanOrEqual(0);
    expect(sources.indexOf("/ai/*")).toBeGreaterThanOrEqual(0);
    expect(spaFallbackIndex).toBeGreaterThanOrEqual(0);
    expect(sources.indexOf("/mcp-http")).toBeLessThan(spaFallbackIndex);
    expect(sources.indexOf("/mcp-http/*")).toBeLessThan(spaFallbackIndex);
    expect(sources.indexOf("/ai/*")).toBeLessThan(spaFallbackIndex);
    expect(sources.indexOf("/oparl/*")).toBeLessThan(spaFallbackIndex);
  });
});
