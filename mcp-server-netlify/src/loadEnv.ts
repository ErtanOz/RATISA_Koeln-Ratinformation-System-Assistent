import { config as loadDotEnv } from "dotenv";
import { resolveEnvFileCandidates } from "./runtimePaths.js";

for (const envFile of resolveEnvFileCandidates({ moduleUrl: import.meta.url })) {
  loadDotEnv({
    path: envFile,
    override: false,
  });
}
