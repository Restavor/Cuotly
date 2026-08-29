import { validateCredentials } from "./validate-auth-form";

describe("validateCredentials", () => {
  it("exige correo y contraseña", () => {
    expect(validateCredentials("", "")).toBe("Rellena correo y contraseña.");
    expect(validateCredentials("bosco@restavor.com", "")).toBe(
      "Rellena correo y contraseña.",
    );
    expect(validateCredentials("", "segura123")).toBe(
      "Rellena correo y contraseña.",
    );
  });

  it("no da error cuando ambos campos están rellenos", () => {
    expect(validateCredentials("bosco@restavor.com", "segura123")).toBeNull();
  });
});
