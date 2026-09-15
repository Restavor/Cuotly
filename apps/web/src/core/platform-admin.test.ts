import { describe, expect, it } from "vitest";

import {
  PANEL_BLOCKS,
  SUPPORT_ACCESS_LEVELS,
  SUPPORT_SESSION_MINUTES,
  TWO_FACTOR_POLICY,
  type PlatformAccess,
  canApproveSpaces,
  canManageSubscriptions,
  canNamePlatformAdmins,
  canOpenSupport,
  canReadPanel,
  isPlatformPerson,
  isSupportAccessLevel,
  panelBlockHref,
  platformNeedsTwoFactor,
  supportDurationIsValid,
  supportRemainingMinutes,
  supportSessionIsActive,
  supportShellRole,
  twoFactorPolicyFor,
} from "./platform-admin";

/**
 * El panel, Modo soporte y la 2FA (PRD §32, RN-ADM). Lo que se vigila aquí
 * es lo que es dominio puro: los doce bloques, los niveles y la duración
 * de una sesión, y la cuenta de "quién es plataforma y qué le falta". Lo
 * demás —que la puerta se abra y se cierre de verdad— lo comprueba
 * `supabase/tests/plataforma_panel_soporte_y_2fa.sql` contra la base.
 */
const NADIE: PlatformAccess = {
  isOwner: false,
  isAdmin: false,
  canApproveSpaces: false,
  canManageSubscriptions: false,
  canSupport: false,
  twoFactor: true,
};
const BOSCO: PlatformAccess = { ...NADIE, isOwner: true };
const BOSCO_SIN_2FA: PlatformAccess = { ...BOSCO, twoFactor: false };
const ADMIN_SIN_PERMISOS: PlatformAccess = { ...NADIE, isAdmin: true };
const ADMIN_CON_TODO: PlatformAccess = {
  ...ADMIN_SIN_PERMISOS,
  canApproveSpaces: true,
  canManageSubscriptions: true,
  canSupport: true,
};

describe("los doce bloques del panel (RN-ADM-04, §128)", () => {
  it("RN-ADM-04 · son los doce de §128, en su orden", () => {
    expect([...PANEL_BLOCKS]).toEqual([
      "users",
      "spaces",
      "space_requests",
      "subscriptions",
      "revenue",
      "active_trials",
      "nonpayment",
      "storage",
      "activity",
      "incidents",
      "support",
      "audit",
    ]);
  });

  it("RN-ADM-04 · los doce llevan a una pantalla del panel; las incidencias, a su bandeja desde el Hito 21 (RN-SOP-15)", () => {
    for (const block of PANEL_BLOCKS) {
      expect(panelBlockHref(block), block).toMatch(/^\/administracion\//);
    }
    expect(panelBlockHref("incidents")).toBe("/administracion/incidencias");
  });
});

describe("Modo soporte: nivel y duración (RN-ADM-06)", () => {
  it("RN-ADM-06 · los tres niveles, del menor al mayor privilegio", () => {
    expect([...SUPPORT_ACCESS_LEVELS]).toEqual(["read", "admin", "owner"]);
    expect(isSupportAccessLevel("read")).toBe(true);
    expect(isSupportAccessLevel("root")).toBe(false);
  });

  it("RN-ADM-06 · entre 15 y 240 minutos, 60 por defecto", () => {
    expect(SUPPORT_SESSION_MINUTES).toEqual({ min: 15, max: 240, default: 60 });
    expect(supportDurationIsValid(15)).toBe(true);
    expect(supportDurationIsValid(240)).toBe(true);
    expect(supportDurationIsValid(60)).toBe(true);
    expect(supportDurationIsValid(14)).toBe(false);
    expect(supportDurationIsValid(241)).toBe(false);
    expect(supportDurationIsValid(30.5)).toBe(false);
  });

  it("RN-ADM-07 · una sesión está viva mientras no se haya cerrado ni agotado", () => {
    const ahora = new Date("2026-09-15T10:00:00Z");
    expect(supportSessionIsActive({ expiresAt: "2026-09-15T11:00:00Z", endedAt: null }, ahora)).toBe(true);
    expect(supportSessionIsActive({ expiresAt: "2026-09-15T09:59:59Z", endedAt: null }, ahora)).toBe(false);
    expect(
      supportSessionIsActive({ expiresAt: "2026-09-15T11:00:00Z", endedAt: "2026-09-15T09:30:00Z" }, ahora),
    ).toBe(false);
  });

  it("RN-ADM-07 · lo que queda se cuenta en minutos enteros y nunca es negativo", () => {
    const ahora = new Date("2026-09-15T10:00:00Z");
    expect(supportRemainingMinutes("2026-09-15T10:45:30Z", ahora)).toBe(45);
    expect(supportRemainingMinutes("2026-09-15T09:00:00Z", ahora)).toBe(0);
  });

  it("RN-ADM-07 · `read` y `admin` navegan como un administrador; `owner`, como el propietario", () => {
    expect(supportShellRole("read")).toBe("admin");
    expect(supportShellRole("admin")).toBe("admin");
    expect(supportShellRole("owner")).toBe("owner");
  });
});

describe("quién es plataforma y qué le falta (RN-ADM-01, RN-ADM-02, §167)", () => {
  it("RN-ADM-01 · Bosco y los Administradores de Cuotly son plataforma; nadie más", () => {
    expect(isPlatformPerson(BOSCO)).toBe(true);
    expect(isPlatformPerson(ADMIN_SIN_PERMISOS)).toBe(true);
    expect(isPlatformPerson(NADIE)).toBe(false);
  });

  it("RN-ADM-02 · sin 2FA no hay plataforma, pero sí se sabe a quién le falta", () => {
    expect(platformNeedsTwoFactor(BOSCO_SIN_2FA)).toBe(true);
    expect(platformNeedsTwoFactor(BOSCO)).toBe(false);
    expect(platformNeedsTwoFactor({ ...NADIE, twoFactor: false })).toBe(false);

    expect(canReadPanel(BOSCO_SIN_2FA)).toBe(false);
    expect(canApproveSpaces(BOSCO_SIN_2FA)).toBe(false);
    expect(canManageSubscriptions(BOSCO_SIN_2FA)).toBe(false);
    expect(canOpenSupport(BOSCO_SIN_2FA)).toBe(false);
    expect(canNamePlatformAdmins(BOSCO_SIN_2FA)).toBe(false);
  });

  it("RN-ADM-01 · un Administrador de Cuotly lee el panel entero aunque no tenga ningún permiso", () => {
    expect(canReadPanel(ADMIN_SIN_PERMISOS)).toBe(true);
    expect(canReadPanel(NADIE)).toBe(false);
  });

  it("§167 · Bosco siempre; el Administrador, solo con cada permiso", () => {
    expect(canApproveSpaces(BOSCO)).toBe(true);
    expect(canApproveSpaces(ADMIN_SIN_PERMISOS)).toBe(false);
    expect(canApproveSpaces(ADMIN_CON_TODO)).toBe(true);

    expect(canManageSubscriptions(BOSCO)).toBe(true);
    expect(canManageSubscriptions(ADMIN_SIN_PERMISOS)).toBe(false);
    expect(canManageSubscriptions(ADMIN_CON_TODO)).toBe(true);

    expect(canOpenSupport(BOSCO)).toBe(true);
    expect(canOpenSupport(ADMIN_SIN_PERMISOS)).toBe(false);
    expect(canOpenSupport(ADMIN_CON_TODO)).toBe(true);
  });

  it("RN-ADM-03/§167 · nombrar Administradores de Cuotly es de Bosco y de nadie más", () => {
    expect(canNamePlatformAdmins(BOSCO)).toBe(true);
    expect(canNamePlatformAdmins(ADMIN_CON_TODO)).toBe(false);
  });
});

describe("para quién es obligatoria la 2FA (§136, RN-ADM-02)", () => {
  it("§136 · obligatoria para Bosco y los Administradores; recomendada para propietarios y administradores de espacio; opcional para el resto", () => {
    expect(TWO_FACTOR_POLICY.platform_owner).toBe("mandatory");
    expect(TWO_FACTOR_POLICY.platform_admin).toBe("mandatory");
    expect(TWO_FACTOR_POLICY.space_owner).toBe("recommended");
    expect(TWO_FACTOR_POLICY.space_admin).toBe("recommended");
    expect(TWO_FACTOR_POLICY.worker).toBe("optional");
    expect(TWO_FACTOR_POLICY.client).toBe("optional");
  });

  it("§136 · la plataforma manda sobre el rol de espacio: Bosco es obligatoria aunque sea propietario", () => {
    expect(twoFactorPolicyFor(BOSCO_SIN_2FA, "owner")).toBe("mandatory");
    expect(twoFactorPolicyFor(ADMIN_SIN_PERMISOS, "worker")).toBe("mandatory");
    expect(twoFactorPolicyFor(NADIE, "owner")).toBe("recommended");
    expect(twoFactorPolicyFor(NADIE, "admin")).toBe("recommended");
    expect(twoFactorPolicyFor(NADIE, "worker")).toBe("optional");
    expect(twoFactorPolicyFor(NADIE, null)).toBe("optional");
  });
});
