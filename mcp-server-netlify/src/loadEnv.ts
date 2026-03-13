import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotEnv } from "dotenv";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(currentDir, "..");
const repoRoot = path.resolve(packageRoot, "..");

const envFiles = [
  path.join(packageRoot, ".env"),
  path.join(packageRoot, ".env.local"),
  path.join(repoRoot, ".env"),
  path.join(repoRoot, ".env.local"),
  path.join(repoRoot, ".env.local2.local"),
];

for (const envFile of envFiles) {
  if (!existsSync(envFile)) continue;
  loadDotEnv({
    path: envFile,
    override: false,
  });
}
