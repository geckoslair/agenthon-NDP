import { describe, expect, it } from "vitest";
import { currentUser, DEFAULT_DEMO_USER } from "./session";

describe("currentUser", () => {
  it("defaults to the invented demo user", () => {
    expect(currentUser(undefined)).toEqual({ name: DEFAULT_DEMO_USER, simulated: true });
    expect(DEFAULT_DEMO_USER).toBe("Giulia Ferraris");
  });
  it("takes the name from the environment value", () => {
    expect(currentUser("  Marco   Bianchi ").name).toBe("Marco Bianchi");
  });
  it("falls back when the value is blank", () => {
    expect(currentUser("").name).toBe(DEFAULT_DEMO_USER);
    expect(currentUser("   ").name).toBe(DEFAULT_DEMO_USER);
  });
});
