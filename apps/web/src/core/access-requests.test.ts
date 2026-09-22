import { describe, expect, it } from "vitest";

import {
  ACCESS_DOORS,
  ACCESS_REQUEST_ACTORS,
  ACCESS_REQUEST_STATES,
  ACCESS_REQUEST_SUBMIT_OUTCOME,
  PLATFORM_EMAIL_KINDS,
  SETUP_LINK_STATES,
  accessRequestFieldProblems,
  accessRequestNeedsReason,
  accessRequestSubmitFailure,
  accessRequestTransitionAllowed,
  invitationSignupStep,
  isAccessRequestFinal,
  isAccessRequestState,
  setupLinkAcceptsPassword,
  validateAccessRequest,
} from "./access-requests";

describe("cómo se entra en Cuotly (PRD §37, RN-ACC)", () => {
  it("RN-ACC-01: hay dos puertas y ninguna más", () => {
    expect([...ACCESS_DOORS]).toEqual(["approved_request", "invitation"]);
    expect(ACCESS_DOORS).toHaveLength(2);
  });

  it("RN-ACC-05: los cuatro estados, y ninguno más", () => {
    expect([...ACCESS_REQUEST_STATES]).toEqual([
      "submitted",
      "needs_information",
      "approved",
      "rejected",
    ]);
    // No hay borrador: el formulario es público y un borrador sin dueño no
    // tiene dónde guardarse. Tampoco "en revisión": son cinco campos.
    expect(isAccessRequestState("draft")).toBe(false);
    expect(isAccessRequestState("in_review")).toBe(false);
  });

  it("RN-ACC-05: solo Cuotly decide, y solo desde `submitted`", () => {
    for (const destino of ["needs_information", "approved", "rejected"] as const) {
      expect(accessRequestTransitionAllowed("submitted", destino, "platform")).toBe(true);
      expect(accessRequestTransitionAllowed("submitted", destino, "applicant")).toBe(false);
    }
  });

  it("RN-ACC-05: de «necesita información» vuelve quien solicita, y nadie más", () => {
    expect(accessRequestTransitionAllowed("needs_information", "submitted", "applicant")).toBe(true);
    expect(accessRequestTransitionAllowed("needs_information", "submitted", "platform")).toBe(false);
    expect(accessRequestTransitionAllowed("needs_information", "approved", "platform")).toBe(false);
  });

  it("RN-ACC-05: aprobada y no aprobada son finales, para todos los actores", () => {
    for (const final of ["approved", "rejected"] as const) {
      expect(isAccessRequestFinal(final)).toBe(true);
      for (const destino of ACCESS_REQUEST_STATES) {
        for (const actor of ACCESS_REQUEST_ACTORS) {
          expect(
            accessRequestTransitionAllowed(final, destino, actor),
            `${final} -> ${destino} como ${actor}`,
          ).toBe(false);
        }
      }
    }
  });

  it("RN-ACC-05: pedir información y rechazar exigen motivo escrito", () => {
    expect(accessRequestNeedsReason("needs_information")).toBe(true);
    expect(accessRequestNeedsReason("rejected")).toBe(true);
    expect(accessRequestNeedsReason("approved")).toBe(false);
    expect(accessRequestNeedsReason("submitted")).toBe(false);
  });

  it("RN-ACC-04: solo un enlace vivo acepta contraseña", () => {
    expect([...SETUP_LINK_STATES]).toEqual(["valid", "used", "expired"]);
    expect(setupLinkAcceptsPassword("valid")).toBe(true);
    expect(setupLinkAcceptsPassword("used")).toBe(false);
    expect(setupLinkAcceptsPassword("expired")).toBe(false);
  });

  it("RN-ACC-04: los cinco correos a direcciones sin cuenta, y ninguno más", () => {
    expect([...PLATFORM_EMAIL_KINDS]).toEqual([
      "access_request_received",
      "access_request_needs_information",
      "access_request_approved",
      "access_request_rejected",
      "access_request_already_registered",
    ]);
  });

  it("RN-ACC-09: la invitación pide contraseña solo si ese correo no tiene cuenta", () => {
    expect(invitationSignupStep("valid", false)).toBe("set_password");
    // Una persona, una cuenta, un correo (maestra §7.1): quien ya la tiene
    // acepta entrando, que es HU-04 vista desde el otro lado.
    expect(invitationSignupStep("valid", true)).toBe("sign_in");
    for (const estado of ["expired", "accepted", "cancelled"]) {
      expect(invitationSignupStep(estado, false)).toBe("unusable");
      expect(invitationSignupStep(estado, true)).toBe("unusable");
    }
  });

  it("RN-ACC-12: el formulario público tiene una sola respuesta posible", () => {
    // Si algún día esto deja de ser una constante y pasa a depender de lo
    // que conteste el servidor, el formulario se convierte en un oráculo
    // de correos. El test está aquí para que ese cambio duela.
    expect(ACCESS_REQUEST_SUBMIT_OUTCOME).toBe("received");
  });
});

describe("A09 · el formulario público señala los campos uno a uno", () => {
  const lleno = {
    contactName: "Bosco",
    businessName: "Restavor",
    phone: "600000000",
    email: "bosco@restavor.com",
  };

  it("los cuatro obligatorios se devuelven por su nombre, no como un cartel", () => {
    const r = validateAccessRequest({ contactName: "", businessName: "", phone: "", email: "" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problem).toBe("missing");
    expect([...r.fields]).toEqual(["contact_name", "business_name", "phone", "email"]);
  });

  it("solo el que falta se señala", () => {
    const r = validateAccessRequest({ ...lleno, phone: "   " });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect([...r.fields]).toEqual(["phone"]);
  });

  it("un correo sin forma de correo es su propio problema, distinto de faltar", () => {
    const r = validateAccessRequest({ ...lleno, email: "bosco@restavor" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problem).toBe("email");
    expect([...r.fields]).toEqual(["email"]);
  });

  it("los cuatro rellenos y el correo con forma pasan", () => {
    expect(validateAccessRequest(lleno).ok).toBe(true);
    // Los comentarios son opcionales (RN-ACC-02): no entran en la revisión.
    expect(validateAccessRequest({ ...lleno, email: " bosco@restavor.com " }).ok).toBe(true);
  });
});

describe("A09 · RN-ACC-02 · el diseño señala todos los campos a la vez", () => {
  const lleno = {
    contactName: "Bosco",
    businessName: "Restavor",
    phone: "600000000",
    email: "bosco@restavor.com",
  };

  it("RN-ACC-02 · el nombre vacío y el correo mal escrito salen juntos, como en A09", () => {
    expect(accessRequestFieldProblems({ ...lleno, contactName: " ", email: "ana@" })).toEqual({
      contact_name: "missing",
      email: "invalid",
    });
  });

  it("RN-ACC-02 · un correo vacío falta; no es un correo mal escrito", () => {
    expect(accessRequestFieldProblems({ ...lleno, email: "" })).toEqual({ email: "missing" });
  });

  it("RN-ACC-02 · coincide con validateAccessRequest: lo que una deja pasar, la otra también", () => {
    expect(accessRequestFieldProblems(lleno)).toEqual({});
    expect(accessRequestFieldProblems({ ...lleno, email: " bosco@restavor.com " })).toEqual({});
    expect(validateAccessRequest({ ...lleno, email: "bosco@restavor" }).ok).toBe(false);
    expect(accessRequestFieldProblems({ ...lleno, email: "bosco@restavor" })).toEqual({
      email: "invalid",
    });
  });
});

describe("A11 · un envío que no llega no se cuenta como un dato mal escrito", () => {
  it("la falta de red se dice como falta de red", () => {
    for (const mensaje of ["", "Failed to fetch", "network request failed", "timeout of 5000ms"]) {
      expect(accessRequestSubmitFailure(mensaje)).toBe("unreachable");
    }
  });

  it("lo demás no se adivina", () => {
    expect(accessRequestSubmitFailure("Faltan el nombre, el negocio, el teléfono o el correo")).toBe(
      "unknown",
    );
  });
});
