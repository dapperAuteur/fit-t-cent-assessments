import { describe, expect, it } from "vitest";
import { boundaryStrings } from "./boundary-strings";

describe("boundaryStrings", () => {
  it("returns the requested locale", () => {
    expect(boundaryStrings("es").lang).toBe("es");
    expect(boundaryStrings("es").notFound.title).toBe("Página no encontrada");
  });

  it("falls back to English for unknown or missing locales", () => {
    expect(boundaryStrings("fr").lang).toBe("en");
    expect(boundaryStrings(undefined).lang).toBe("en");
    expect(boundaryStrings(["en", "x"]).lang).toBe("en");
  });
});
