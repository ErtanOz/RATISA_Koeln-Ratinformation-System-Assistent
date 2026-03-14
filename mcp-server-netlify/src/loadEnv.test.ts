// @vitest-environment node

import { expect, it } from "vitest";

it("imports loadEnv without throwing", async () => {
  await expect(import("./loadEnv")).resolves.toBeDefined();
});
