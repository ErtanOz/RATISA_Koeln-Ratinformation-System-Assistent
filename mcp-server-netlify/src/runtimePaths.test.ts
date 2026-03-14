// @vitest-environment node

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  resolveEnvFileCandidates,
  resolveMcpServerNetlifyRoot,
  resolvePaperSearchIndexPath,
} from "./runtimePaths";

const tempDirectories: string[] = [];

function createFixture() {
  const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), "ratisa-runtime-paths-"));
  tempDirectories.push(workspaceRoot);

  const packageRoot = path.join(workspaceRoot, "mcp-server-netlify");
  const functionDir = path.join(packageRoot, "netlify", "functions");
  mkdirSync(functionDir, { recursive: true });
  writeFileSync(path.join(packageRoot, "package.json"), '{"name":"oparl-koeln-mcp-netlify"}');

  return {
    workspaceRoot,
    packageRoot,
    functionDir,
  };
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("runtimePaths", () => {
  it("resolves the package root without relying on import.meta.url", () => {
    const fixture = createFixture();

    expect(
      resolveMcpServerNetlifyRoot({
        cwd: fixture.workspaceRoot,
        moduleDirHint: fixture.functionDir,
      }),
    ).toBe(fixture.packageRoot);
  });

  it("collects env files from the package and workspace roots", () => {
    const fixture = createFixture();
    const packageEnv = path.join(fixture.packageRoot, ".env");
    const workspaceEnv = path.join(fixture.workspaceRoot, ".env.local");

    writeFileSync(packageEnv, "PACKAGE_ENV=1");
    writeFileSync(workspaceEnv, "WORKSPACE_ENV=1");

    const candidates = resolveEnvFileCandidates({
      cwd: fixture.workspaceRoot,
      moduleDirHint: fixture.functionDir,
    });

    expect(candidates).toEqual(expect.arrayContaining([packageEnv, workspaceEnv]));
    expect(candidates).toHaveLength(2);
  });

  it("finds the paper search index in the published dist folder", () => {
    const fixture = createFixture();
    const distDataDir = path.join(fixture.workspaceRoot, "dist", "data");
    const distIndexPath = path.join(distDataDir, "paper-search.index.json");

    mkdirSync(distDataDir, { recursive: true });
    writeFileSync(distIndexPath, '{"metadata":{"generatedAt":"","itemCount":0,"source":"","isPartial":false},"items":[]}');

    expect(
      resolvePaperSearchIndexPath({
        cwd: fixture.workspaceRoot,
        moduleDirHint: fixture.functionDir,
      }),
    ).toBe(distIndexPath);
  });
});
