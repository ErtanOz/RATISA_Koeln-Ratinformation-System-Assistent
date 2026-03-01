import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

const resetConfigEnv = () => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.VITE_ENABLE_AI;
  delete process.env.VITE_OPARL_PROXY_PREFIX;
  delete process.env.VITE_OPARL_BODY_ID;
};

describe("runtimeConfig", () => {
  beforeEach(() => {
    vi.resetModules();
    resetConfigEnv();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("uses safe defaults when env values are missing", async () => {
    const { runtimeConfig } = await import("./runtimeConfig");

    expect(runtimeConfig.enableAi).toBe(true);
    expect(runtimeConfig.oparlProxyPrefix).toBe("/oparl");
    expect(runtimeConfig.oparlBodyId).toBe("stadtverwaltung_koeln");
    expect(runtimeConfig.oparlBaseUrl).toBe(
      "/oparl/bodies/stadtverwaltung_koeln",
    );
  });

  it("parses VITE_ENABLE_AI=false as disabled", async () => {
    process.env.VITE_ENABLE_AI = "false";

    const { runtimeConfig } = await import("./runtimeConfig");
    expect(runtimeConfig.enableAi).toBe(false);
  });

  it("normalizes proxy prefix and body id", async () => {
    process.env.VITE_OPARL_PROXY_PREFIX = "///custom-oparl//";
    process.env.VITE_OPARL_BODY_ID = "/custom_body/";

    const { runtimeConfig } = await import("./runtimeConfig");
    expect(runtimeConfig.oparlProxyPrefix).toBe("/custom-oparl");
    expect(runtimeConfig.oparlBodyId).toBe("custom_body");
    expect(runtimeConfig.oparlBaseUrl).toBe("/custom-oparl/bodies/custom_body");
  });
});

