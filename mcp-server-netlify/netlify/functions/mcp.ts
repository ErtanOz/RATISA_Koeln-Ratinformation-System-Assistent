import "../../src/loadEnv.js";
import serverless from "serverless-http";
import { createHttpApp } from "../../src/httpApp";

const app = createHttpApp();

export const handler = serverless(app);
