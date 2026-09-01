import { describe, expect, it } from "vitest";

import { es } from "@/i18n/es";
import {
  MAX_DELIVERY_ATTEMPTS,
  NOTIFICATION_EVENTS,
  canDisable,
  dedupeKey,
  deepLinkFor,
  deliveryStatusAfterFailure,
  isMandatoryEvent,
  jobEventClientRecipients,
  jobEventRecipients,
  nextRetryDelayMinutes,
  requestSubmittedRecipients,
  shouldDeliver,
  shouldQueueEmail,
  type NotificationEvent,
  type SpaceMemberForNotification,
} from "./notifications";

const PROPIETARIO = { userId: "u-owner", role: "owner" } as const;
const ADMIN = { userId: "u-admin", role: "admin" } as const;
const ANA = { userId: "u-ana", role: "worker" } as const;
const LUIS = { userId: "u-luis", role: "worker" } as const;

describe("RN-NOT-01 · no se avisa a trabajadores que no estén asignados", () => {
  it("el trabajador sin asignar no recibe el aviso de un trabajo", () => {
    const destinatarios = jobEventRecipients({
      assigneeId: ANA.userId,
      members: [PROPIETARIO, ADMIN, ANA, LUIS],
      supervisorIds: [],
    });

    expect(destinatarios).toContain(ANA.userId);
    expect(destinatarios).not.toContain(LUIS.userId);
  });

  it("propietario y administrador sí reciben: su inicio es el resumen de la operación (§20.4)", () => {
    const destinatarios = jobEventRecipients({
      assigneeId: ANA.userId,
      members: [PROPIETARIO, ADMIN, ANA, LUIS],
      supervisorIds: [],
    });
    expect(destinatarios).toContain(PROPIETARIO.userId);
    expect(destinatarios).toContain(ADMIN.userId);
  });

  it("un trabajo sin asignar no avisa a ningún trabajador", () => {
    const destinatarios = jobEventRecipients({
      assigneeId: null,
      members: [PROPIETARIO, ADMIN, ANA, LUIS],
      supervisorIds: [],
    });
    expect(destinatarios).not.toContain(ANA.userId);
    expect(destinatarios).not.toContain(LUIS.userId);
    expect(destinatarios).toEqual(expect.arrayContaining([PROPIETARIO.userId, ADMIN.userId]));
  });

  it("no duplica al supervisor que además es administrador", () => {
    const destinatarios = jobEventRecipients({
      assigneeId: ANA.userId,
      members: [PROPIETARIO, ADMIN, ANA],
      supervisorIds: [ADMIN.userId],
    });
    expect(destinatarios.filter((d) => d === ADMIN.userId)).toHaveLength(1);
  });
});

describe("RN-NOT-02 y RN-NOT-03 · qué se puede desactivar y qué no", () => {
  it("sin preferencia guardada, se recibe todo (RN-NOT-02)", () => {
    expect(shouldDeliver("job_assigned", "email", undefined)).toBe(true);
    expect(shouldDeliver("job_assigned", "in_app", undefined)).toBe(true);
  });

  it("un aviso secundario se puede desactivar", () => {
    const preferencia = { event: "job_assigned" as NotificationEvent, inApp: false, email: false };
    expect(shouldDeliver("job_assigned", "email", preferencia)).toBe(false);
    expect(canDisable("job_assigned")).toBe(true);
  });

  it("RN-NOT-03: los vencimientos críticos y los impagos graves no se pueden desactivar", () => {
    const apagado = { event: "t3_threshold_100" as NotificationEvent, inApp: false, email: false };
    expect(shouldDeliver("t3_threshold_100", "email", apagado)).toBe(true);
    expect(shouldDeliver("t2_threshold_100", "in_app", apagado)).toBe(true);

    for (const evento of [
      "t2_threshold_100",
      "t3_threshold_100",
      "establishment_paused_nonpayment",
      "establishment_suspended_nonpayment",
    ] as const) {
      expect(isMandatoryEvent(evento), `${evento} debería ser obligatorio`).toBe(true);
      expect(canDisable(evento)).toBe(false);
    }
  });

  it("los obligatorios son pocos: si no, RN-NOT-02 se queda sin contenido", () => {
    const obligatorios = NOTIFICATION_EVENTS.filter(isMandatoryEvent);
    expect(obligatorios.length).toBeLessThan(NOTIFICATION_EVENTS.length / 2);
  });
});

describe("RN-NOT-04 · enlace profundo", () => {
  it("apunta al elemento exacto y nunca lleva credenciales", () => {
    const enlace = deepLinkFor("restavor", "job", "j-1");
    expect(enlace).toBe("/espacios/restavor/trabajos/j-1");
    expect(enlace).not.toMatch(/token|key|secret/i);
  });

  it("todas las entidades tienen enlace dentro del espacio", () => {
    for (const entidad of ["request", "job", "establishment", "charge", "absence"] as const) {
      expect(deepLinkFor("restavor", entidad, "x")).toMatch(/^\/espacios\/restavor\//);
    }
  });
});

describe("RN-NOT-05 · cola con reintentos e idempotencia", () => {
  it("la clave de deduplicación es determinista (CA-17)", () => {
    expect(dedupeKey("job_published", "j-1")).toBe(dedupeKey("job_published", "j-1"));
    expect(dedupeKey("t3_threshold_75", "j-1", 75)).not.toBe(dedupeKey("t3_threshold_90", "j-1", 90));
  });

  it("la espera crece y tiene techo", () => {
    expect(nextRetryDelayMinutes(1)).toBe(1);
    expect(nextRetryDelayMinutes(2)).toBe(2);
    expect(nextRetryDelayMinutes(3)).toBe(4);
    expect(nextRetryDelayMinutes(99)).toBe(60);
  });

  it("deja de reintentar en vez de hacerlo para siempre", () => {
    expect(deliveryStatusAfterFailure(1)).toBe("pending");
    expect(deliveryStatusAfterFailure(MAX_DELIVERY_ATTEMPTS)).toBe("dead");
  });
});

describe("CA-21 · cada evento tiene su nombre en el único diccionario", () => {
  it("no hay evento sin texto ni texto sin evento", () => {
    const nombrados = Object.keys(es.notifications.events).sort();
    expect(nombrados).toEqual([...NOTIFICATION_EVENTS].sort());
  });
});

describe("§18 · el lado del cliente y el canal de cada fila", () => {
  const equipo: SpaceMemberForNotification[] = [
    { userId: "duena", role: "owner" },
    { userId: "admin", role: "admin" },
    { userId: "ana", role: "worker" },
    { userId: "luis", role: "worker" },
  ];

  it("§18: el cliente ve el inicio y la publicación de su trabajo, y nada más", () => {
    expect(jobEventClientRecipients("job_started", ["cliente"])).toEqual(["cliente"]);
    expect(jobEventClientRecipients("job_published", ["cliente"])).toEqual(["cliente"]);
    expect(jobEventClientRecipients("job_assigned", ["cliente"])).toEqual([]);
    expect(jobEventClientRecipients("correction_requested", ["cliente"])).toEqual([]);
  });

  it("§18: el inicio se ve dentro de Cuotly pero no sale por correo para el cliente", () => {
    expect(shouldQueueEmail("job_started", "client")).toBe(false);
    // Para el equipo, el mismo evento sí sale por correo.
    expect(shouldQueueEmail("job_started", "staff")).toBe(true);
    // Y la publicación sale por correo para los dos lados.
    expect(shouldQueueEmail("job_published", "client")).toBe(true);
    expect(shouldQueueEmail("job_published", "staff")).toBe(true);
  });

  it("§18/RN-NOT-01: una solicitud sin asignar va a propietario y administradores, no a los trabajadores", () => {
    expect([...requestSubmittedRecipients(equipo)].sort()).toEqual(["admin", "duena"]);
  });
});
