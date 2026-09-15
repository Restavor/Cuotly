import { describe, expect, it } from "vitest";

import {
  EXPORT_SCOPES,
  ONBOARDING_STEPS,
  SPACE_LIFECYCLE_OPERATIONS,
  accountRemedyFor,
  canOwnerRestore,
  canRequestAccountDeletion,
  canStopBeingOwner,
  deletionScheduledAt,
  isOnboardingStep,
  onboardingBlocksTheSpace,
  onboardingIsComplete,
  onboardingPending,
  ownershipTransferOutcome,
  stepProgress,
  whoCanRestore,
  type OnboardingStep,
  type OnboardingStepProgress,
} from "./space-lifecycle";
import { CUOTLY_CONSTANTS, isSpaceReadOnly } from "./cuotly-subscription";

/** Un progreso donde todos los pasos están hechos por dato. */
function todoHecho(): OnboardingStepProgress[] {
  return ONBOARDING_STEPS.map((s) => stepProgress(s.step, true, false));
}

describe("RN-CIC-01 · el asistente son los diez pasos de §9 y no bloquea nada", () => {
  it("son diez, en el orden de la maestra", () => {
    expect(ONBOARDING_STEPS.map((s) => s.step)).toEqual([
      "space_details",
      "logo",
      "timezone",
      "working_hours",
      "taxes",
      "plans_and_services",
      "first_establishment",
      "first_worker",
      "notifications",
      "security",
    ]);
  });

  it("no hay ningún paso de más ni de menos", () => {
    expect(ONBOARDING_STEPS).toHaveLength(10);
    expect(isOnboardingStep("space_details")).toBe(true);
    // El Agente Cuotly está aplazado (CLAUDE.md) y no es un paso de §9.
    expect(isOnboardingStep("agent")).toBe(false);
  });

  it("el espacio funciona entero desde el primer minuto", () => {
    // §9: "completa **progresivamente**". Un espacio recién aprobado tiene
    // que poder recibir una solicitud sin haber subido un logotipo.
    expect(onboardingBlocksTheSpace()).toBe(false);
  });
});

describe("RN-CIC-02 · un paso hecho dice POR QUÉ está hecho", () => {
  it("cuatro pasos no se pueden derivar de ningún dato", () => {
    const noDerivables = ONBOARDING_STEPS.filter((s) => !s.derivable).map((s) => s.step);

    // Los cuatro que ya tienen un valor de partida: `Europe/Madrid`, el
    // 21 %, "todos los avisos activados" y la 2FA opcional. Nada en la
    // base distingue el valor por omisión de una decisión.
    expect(noDerivables).toEqual(["timezone", "taxes", "notifications", "security"]);
  });

  it("el dato manda sobre la confirmación", () => {
    // Si el logotipo está subido, el origen es el dato aunque además se
    // hubiera confirmado: enseñar "confirmado" ahí sería mentir a la baja.
    expect(stepProgress("logo", true, true).source).toBe("data");
    expect(stepProgress("logo", true, false).source).toBe("data");
  });

  it("un paso derivable también se puede confirmar, y entonces se nota", () => {
    // Un espacio que no quiere logotipo marca el paso; la pantalla dice
    // "confirmado por el propietario", no "hecho".
    const sinLogo = stepProgress("logo", false, true);

    expect(sinLogo.done).toBe(true);
    expect(sinLogo.source).toBe("confirmed");
  });

  it("un paso pendiente no inventa un origen", () => {
    // CLAUDE.md MUST NOT: si no hay dato, se dice que no lo hay.
    expect(stepProgress("first_establishment", false, false)).toEqual({
      step: "first_establishment",
      done: false,
      source: null,
    });
  });
});

describe("RN-CIC-04 · el asistente termina cuando los diez están hechos", () => {
  it("con los diez hechos, ha terminado", () => {
    expect(onboardingIsComplete(todoHecho())).toBe(true);
  });

  it("con nueve, no", () => {
    const progreso = todoHecho();
    progreso[7] = stepProgress("first_worker", false, false);

    expect(onboardingIsComplete(progreso)).toBe(false);
    expect(onboardingPending(progreso)).toEqual(["first_worker"]);
  });

  it("una lista incompleta no cuenta como terminada", () => {
    // El falso-cerrado: si el servidor devolviera ocho pasos por un error,
    // "todos hechos" sería verdad sobre una lista que no es la de §9.
    const ochoPasos = todoHecho().slice(0, 8);

    expect(onboardingIsComplete(ochoPasos)).toBe(false);
  });
});

describe("RN-CIC-05 · transferir la propiedad la mueve, no la duplica", () => {
  it("el destinatario pasa a propietario y quien transfiere, a administrador", () => {
    expect(ownershipTransferOutcome()).toEqual({
      previousOwnerRole: "admin",
      newOwnerRole: "owner",
    });
  });

  it("quien transfiere no se queda fuera del espacio", () => {
    // Echarse a sí mismo no es lo que pidió: se queda de administrador.
    expect(ownershipTransferOutcome().previousOwnerRole).not.toBeNull();
  });
});

describe("RN-CIC-06 · siempre debe existir al menos un propietario (§127)", () => {
  it("el último propietario no puede dejar de serlo", () => {
    expect(canStopBeingOwner(1)).toBe(false);
  });

  it("con dos, sí", () => {
    expect(canStopBeingOwner(2)).toBe(true);
  });

  it("cero propietarios es un espacio ya roto, y tampoco se le quita a nadie", () => {
    expect(canStopBeingOwner(0)).toBe(false);
  });
});

describe("RN-CIC-07 · el archivado del propietario es un modo de solo lectura", () => {
  it("`archived_by_owner` congela el espacio igual que los dos de §4.6", () => {
    expect(isSpaceReadOnly("archived_by_owner")).toBe(true);
    expect(isSpaceReadOnly("archived_trial_ended")).toBe(true);
    expect(isSpaceReadOnly("archived_nonpayment")).toBe(true);
  });

  it("un espacio en prueba o activo no lo está", () => {
    expect(isSpaceReadOnly("trial")).toBe(false);
    expect(isSpaceReadOnly("active")).toBe(false);
    expect(isSpaceReadOnly(null)).toBe(false);
  });
});

describe("RN-CIC-08 · recuperable durante 30 días (§127)", () => {
  const limite = new Date("2026-10-15T10:00:00Z");

  it("dentro del plazo lo restaura su propietario", () => {
    expect(canOwnerRestore(limite, new Date("2026-10-14T23:59:00Z"))).toBe(true);
    expect(whoCanRestore(limite, new Date("2026-10-01T00:00:00Z"))).toEqual([
      "owner",
      "platform",
    ]);
  });

  it("pasado el plazo, es de la plataforma", () => {
    // Igual que la reactivación tardía de RN-SUB-09.
    expect(canOwnerRestore(limite, new Date("2026-10-15T10:00:01Z"))).toBe(false);
    expect(whoCanRestore(limite, new Date("2026-11-01T00:00:00Z"))).toEqual(["platform"]);
  });

  it("justo en el límite todavía es suyo", () => {
    expect(canOwnerRestore(limite, limite)).toBe(true);
  });
});

describe("RN-CIC-09 · después se PROGRAMA la eliminación, y nada más", () => {
  it("la fecha programada son los mismos 30 días de la recuperación", () => {
    // No hay dos plazos que recordar: §127 dice 30 días y §4.6 también, y
    // la constante es la misma.
    expect(CUOTLY_CONSTANTS.reactivation_days).toBe(30);

    const archivado = new Date("2026-09-15T12:00:00Z");
    expect(deletionScheduledAt(archivado, CUOTLY_CONSTANTS.reactivation_days)).toEqual(
      new Date("2026-10-15T12:00:00Z"),
    );
  });
});

describe("RN-CIC-10/11 · los tres alcances de una exportación (§141)", () => {
  it("son el espacio, el grupo y el establecimiento", () => {
    expect(EXPORT_SCOPES).toEqual(["space", "group", "establishment"]);
  });
});

describe("RN-CIC-12 · qué impide cerrar una cuenta (§141)", () => {
  it("sin bloqueos se puede pedir el cierre", () => {
    expect(canRequestAccountDeletion([])).toBe(true);
  });

  it("ser único propietario de un espacio lo impide, y dice qué hacer", () => {
    const bloqueo = {
      kind: "space" as const,
      entityId: "11111111-1111-1111-1111-111111111111",
      entityName: "Restavor",
      remedy: accountRemedyFor("space"),
    };

    expect(canRequestAccountDeletion([bloqueo])).toBe(false);
    // §141: "Primero transfiere propiedad o cierra entidades."
    expect(bloqueo.remedy).toBe("transfer_ownership");
  });

  it("y de un grupo, también", () => {
    expect(accountRemedyFor("group")).toBe("transfer_or_close_group");
  });
});

describe("RN-CIC-14 · el libro del ciclo de vida apunta tres cosas", () => {
  it("transferir, archivar y restaurar", () => {
    expect(SPACE_LIFECYCLE_OPERATIONS).toEqual([
      "ownership_transferred",
      "archived",
      "restored",
    ]);
  });
});

describe("los tipos no dejan escribir un paso que no existe", () => {
  it("la lista de pasos es la única fuente", () => {
    const paso: OnboardingStep = "security";
    expect(isOnboardingStep(paso)).toBe(true);
  });
});
