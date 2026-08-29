import { describe, expect, it } from "vitest";
import { CUOTLY_SHARED_PACKAGE_READY } from "./index";

describe("@cuotly/shared", () => {
  it("existe y se puede importar desde web y móvil", () => {
    expect(CUOTLY_SHARED_PACKAGE_READY).toBe(true);
  });
});
