import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_DIRNAME = "mcp-server-netlify";
const PAPER_SEARCH_INDEX_RELATIVE_PATH = path.join(
  "data",
  "paper-search.index.json",
);

export interface RuntimePathOptions {
  moduleDirHint?: string;
  moduleUrl?: string;
  cwd?: string;
}

function uniquePaths(paths: Array<string | undefined>): string[] {
  return Array.from(
    new Set(
      paths
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => path.resolve(value)),
    ),
  );
}

function getModuleDirFromUrl(moduleUrl?: string): string | undefined {
  if (!moduleUrl) return undefined;

  try {
    return path.dirname(fileURLToPath(moduleUrl));
  } catch {
    return undefined;
  }
}

function getStartDirectories(options: RuntimePathOptions): string[] {
  return uniquePaths([
    options.moduleDirHint,
    getModuleDirFromUrl(options.moduleUrl),
    options.cwd ?? process.cwd(),
    typeof __dirname === "string" ? __dirname : undefined,
  ]);
}

function findAncestorPackageRoot(startDir: string): string | undefined {
  let currentDir = path.resolve(startDir);

  while (true) {
    if (path.basename(currentDir) === PACKAGE_DIRNAME) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return undefined;
    }
    currentDir = parentDir;
  }
}

function getWorkspaceRoots(options: RuntimePathOptions): string[] {
  const packageRoot = resolveMcpServerNetlifyRoot(options);
  return uniquePaths([packageRoot, path.dirname(packageRoot), options.cwd ?? process.cwd()]);
}

export function resolveMcpServerNetlifyRoot(options: RuntimePathOptions = {}): string {
  for (const startDir of getStartDirectories(options)) {
    const ancestorMatch = findAncestorPackageRoot(startDir);
    if (ancestorMatch) {
      return ancestorMatch;
    }

    const nestedMatch = path.join(startDir, PACKAGE_DIRNAME);
    if (existsSync(nestedMatch)) {
      return nestedMatch;
    }
  }

  return path.resolve(options.cwd ?? process.cwd());
}

export function resolveEnvFileCandidates(options: RuntimePathOptions = {}): string[] {
  const packageRoot = resolveMcpServerNetlifyRoot(options);
  const workspaceRoots = getWorkspaceRoots(options);

  return uniquePaths([
    path.join(packageRoot, ".env"),
    path.join(packageRoot, ".env.local"),
    ...workspaceRoots.flatMap((root) => [
      path.join(root, ".env"),
      path.join(root, ".env.local"),
      path.join(root, ".env.local2.local"),
    ]),
  ]).filter((candidate) => existsSync(candidate));
}

export function resolvePaperSearchIndexPath(options: RuntimePathOptions = {}): string {
  const workspaceRoots = getWorkspaceRoots(options);
  const candidates = uniquePaths([
    ...workspaceRoots.map((root) =>
      path.join(root, "public", PAPER_SEARCH_INDEX_RELATIVE_PATH),
    ),
    ...workspaceRoots.map((root) =>
      path.join(root, "dist", PAPER_SEARCH_INDEX_RELATIVE_PATH),
    ),
  ]);

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}
