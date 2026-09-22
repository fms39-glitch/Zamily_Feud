import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";

describe("loadConfig", () => {
  it("applies sane defaults when nothing is set", () => {
    const config = loadConfig({});
    expect(config.PORT).toBe(4000);
    expect(config.ROOM_TTL_SECONDS).toBe(3600);
    expect(config.NODE_ENV).toBe("development");
  });

  it("throws on an invalid value instead of silently coercing", () => {
    expect(() => loadConfig({ CLIENT_ORIGIN: "not-a-url" })).toThrow(/Invalid environment configuration/);
  });

  it("respects explicit overrides", () => {
    const config = loadConfig({ PORT: "5001", ROOM_TTL_SECONDS: "60" });
    expect(config.PORT).toBe(5001);
    expect(config.ROOM_TTL_SECONDS).toBe(60);
  });
});
