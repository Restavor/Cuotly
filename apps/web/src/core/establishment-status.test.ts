import { describe, expect, it } from "vitest";

import {
  ESTABLISHMENT_STATUSES,
  isEstablishmentStatus,
  statusEffects,
} from "./establishment-status";

/**
 * Maqueta 20 · lo que cada estado significa.
 *
 * La comprobación que importa es la última: estos efectos son la
 * traducción a una frase de lo que rechaza
 * `assert_establishment_service_running()` en el servidor. Si alguien
 * cambia uno sin cambiar el otro, la pantalla empieza a decirle a la gente
 * que puede hacer cosas que el servidor le va a negar.
 */
describe("efectos del estado de un restaurante (PRD §15.1)", () => {
  it("los siete estados del PRD están, y solo esos", () => {
    expect([...ESTABLISHMENT_STATUSES]).toEqual([
      "configuring",
      "active",
      "paused",
      "ending",
      "read_only",
      "suspended",
      "archived",
    ]);
  });

  it("los tres que detienen el servicio son los tres que el servidor rechaza", () => {
    // `assert_establishment_service_running()`: paused, suspended,
    // read_only y archived lanzan; los demás pasan.
    const detenidos = ESTABLISHMENT_STATUSES.filter(
      (status) => !statusEffects(status).serviceRunning,
    );
    expect([...detenidos]).toEqual(["paused", "read_only", "suspended", "archived"]);
  });

  it("`ending` NO detiene el servicio (RN-EST-09)", () => {
    // "El servicio sigue activo hasta el final del periodo pagado o de la
    // permanencia vigente." Tratarlo como una baja inmediata sería cortarle
    // a alguien un servicio que ha pagado.
    expect(statusEffects("ending").serviceRunning).toBe(true);
  });

  it("consultar se puede en todos, incluido el archivado (RN-EST-10)", () => {
    // "Los datos NO se eliminan automáticamente."
    for (const status of ESTABLISHMENT_STATUSES) {
      expect(statusEffects(status).canConsult).toBe(true);
    }
  });

  it("solo `active` se queda sin aviso: es el curso normal", () => {
    const conAviso = ESTABLISHMENT_STATUSES.filter((status) => statusEffects(status).needsNotice);
    expect(conAviso).not.toContain("active");
    expect(conAviso).toHaveLength(6);
  });

  it("un estado desconocido se trata como DETENIDO, no como activo", () => {
    // Avisar de más es mejor que prometer algo que el servidor va a negar.
    expect(statusEffects("lo_que_sea").serviceRunning).toBe(false);
    expect(statusEffects("lo_que_sea").needsNotice).toBe(true);
    expect(isEstablishmentStatus("lo_que_sea")).toBe(false);
  });
});
