import { readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const functionsDir = path.resolve(
  process.cwd(),
  "mcp-server-netlify",
  "netlify",
  "functions",
);

const allowedFiles = new Set(["mcp.ts"]);

async function main() {
  const entries = await readdir(functionsDir, { withFileTypes: true });

  const invalidEntries = entries
    .filter((entry) => {
      if (!entry.isFile()) {
        return true;
      }
      return !allowedFiles.has(entry.name);
    })
    .map((entry) => entry.name)
    .sort();

  if (invalidEntries.length > 0) {
    console.error(
      [
        "Netlify functions directory contains files that must not be deployed:",
        ...invalidEntries.map((entry) => `- ${entry}`),
        "",
        "Allowed files:",
        ...Array.from(allowedFiles)
          .sort()
          .map((entry) => `- ${entry}`),
      ].join("\n"),
    );
    process.exit(1);
  }

  console.log("Netlify functions guard passed.");
}

main().catch((error) => {
  console.error("Netlify functions guard failed:", error);
  process.exit(1);
});
