// @vitest-environment node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

describe("CSP-compatible theme bootstrap", () => {
  it("loads the theme initializer from a same-origin script instead of inline HTML", async () => {
    const indexHtml = await readFile(path.join(repoRoot, "index.html"), "utf-8");

    expect(indexHtml).toContain('<script src="/theme-init.js"></script>');
    expect(indexHtml).not.toContain("window.localStorage.getItem");
    expect(indexHtml).not.toContain("document.documentElement.dataset.theme");
  });

  it("keeps a strict script policy and allows the production embedding host", async () => {
    const [netlifyConfig, nginxConfig] = await Promise.all([
      readFile(path.join(repoRoot, "netlify.toml"), "utf-8"),
      readFile(path.join(repoRoot, "deploy", "nginx", "ratisa.conf"), "utf-8"),
    ]);

    expect(netlifyConfig).toContain("script-src 'self'");
    expect(netlifyConfig).not.toContain("script-src 'self' 'unsafe-inline'");

    expect(nginxConfig).toContain("script-src 'self'");
    expect(nginxConfig).not.toContain("script-src 'self' 'unsafe-inline'");

    expect(netlifyConfig).toContain("frame-ancestors 'self' https://digitalheritagelab.com");
    expect(netlifyConfig).not.toContain("X-Frame-Options");

    expect(nginxConfig).toContain("frame-ancestors 'self' https://digitalheritagelab.com");
    expect(nginxConfig).not.toContain("X-Frame-Options");
  });
});
