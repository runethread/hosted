import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("Hosted Worker shell", () => {
  it("fails closed for every request", async () => {
    const response = await exports.default.fetch("https://runethread.invalid/");

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    await expect(response.json()).resolves.toEqual({ error: "not_operational" });
  });
});
