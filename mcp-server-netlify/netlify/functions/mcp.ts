import "../../src/loadEnv.js";
import serverless from "serverless-http";
import { createHttpApp } from "../../src/httpApp";

const NETLIFY_FUNCTION_BASE_PATH = "/.netlify/functions/mcp";
const app = createHttpApp();

export const handler = serverless(app, {
  basePath: NETLIFY_FUNCTION_BASE_PATH,
});
