import "./loadEnv.js";
import { createHttpApp } from "./httpApp.js";

const bindHost = process.env.MCP_BIND_HOST || "127.0.0.1";
const app = createHttpApp();
const port = Number(process.env.MCP_PORT || process.env.PORT || 3333);

app.listen(port, bindHost, () => {
  console.log(
    `OParl MCP HTTP server listening on http://${bindHost}:${port}/mcp`
  );
});
