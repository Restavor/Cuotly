import { describe, expect, it } from "vitest";
import {
  MESSAGE_EDIT_WINDOW_MINUTES,
  READ_ONLY_REQUEST_STATES,
  canClientReply,
  canEditMessage,
  canReadInternalNote,
  isClientVisibleConversation,
  isConversationReadOnly,
  isEdited,
  resolveSenderIdentity,
  unreadCount,
} from "./messages";

const LUNES_12_00 = new Date("2026-08-31T10:00:00.000Z");
const minutosDespues = (minutes: number) => new Date(LUNES_12_00.getTime() + minutes * 60_000);

describe("messages — RN-MSG, HU-35", () => {
  describe("RN-MSG-02 · HU-35: el cliente siempre ve 'Equipo de mantenimiento'", () => {
    const trabajador = { role: "staff", profileId: "worker-1" } as const;

    it("un mensaje del equipo se presenta al cliente como el equipo, sin persona", () => {
      expect(resolveSenderIdentity(trabajador, "client")).toEqual({ kind: "maintenance_team" });
    });

    it("dos mensajes de dos personas distintas del equipo son indistinguibles para el cliente", () => {
      const otro = { role: "staff", profileId: "admin-9" } as const;
      expect(resolveSenderIdentity(trabajador, "client")).toEqual(resolveSenderIdentity(otro, "client"));
    });

    it("dentro del espacio sí se sabe quién escribió (la especificación maestra §15: 'internamente, Cuotly registra quién realizó cada acción')", () => {
      expect(resolveSenderIdentity(trabajador, "staff")).toEqual({ kind: "person", profileId: "worker-1" });
    });

    it("el propio cliente se identifica como cliente, no como equipo", () => {
      expect(resolveSenderIdentity({ role: "client", profileId: "client-3" }, "staff")).toEqual({ kind: "client" });
    });
  });

  describe("RN-MSG-04: las notas internas y la conversación interna no llegan nunca al cliente", () => {
    it("la conversación de solicitud y la general del establecimiento sí son visibles para el cliente", () => {
      expect(isClientVisibleConversation("request")).toBe(true);
      expect(isClientVisibleConversation("establishment")).toBe(true);
    });

    it("la conversación interna de trabajo no lo es", () => {
      expect(isClientVisibleConversation("job_internal")).toBe(false);
    });
  });

  describe("RN-MSG-05: Consulta lee pero no responde", () => {
    it("Consulta no puede responder", () => {
      expect(canClientReply("consulta")).toBe(false);
    });

    it("propietario global, propietario local y Editor sí", () => {
      expect(canClientReply("global_owner")).toBe(true);
      expect(canClientReply("local_owner")).toBe(true);
      expect(canClientReply("editor")).toBe(true);
    });
  });

  describe("RN-MSG-06: leído y no leído", () => {
    const mensajes = [
      { senderId: "staff-1", createdAt: minutosDespues(0) },
      { senderId: "client-1", createdAt: minutosDespues(1) },
      { senderId: "staff-1", createdAt: minutosDespues(2) },
    ];

    it("sin haber leído nunca, todo lo escrito por otros está sin leer", () => {
      expect(unreadCount(mensajes, { userId: "client-1", lastReadAt: null })).toBe(2);
    });

    it("lo propio nunca cuenta como no leído", () => {
      expect(unreadCount(mensajes, { userId: "staff-1", lastReadAt: null })).toBe(1);
    });

    it("después de leer, solo cuenta lo posterior", () => {
      expect(unreadCount(mensajes, { userId: "client-1", lastReadAt: minutosDespues(1) })).toBe(1);
    });
  });

  describe("RN-MSG-07: ventana de edición de 10 minutos y marca 'Editado'", () => {
    const mensaje = { senderId: "staff-1", createdAt: LUNES_12_00 };

    it("la ventana son exactamente 10 minutos", () => {
      expect(MESSAGE_EDIT_WINDOW_MINUTES).toBe(10);
    });

    it("el autor puede editar dentro de la ventana", () => {
      expect(
        canEditMessage({ message: mensaje, actorId: "staff-1", now: minutosDespues(9), conversationIsReadOnly: false }),
      ).toEqual({ ok: true, value: undefined });
    });

    it("en el minuto 10 exacto todavía puede", () => {
      expect(
        canEditMessage({ message: mensaje, actorId: "staff-1", now: minutosDespues(10), conversationIsReadOnly: false }).ok,
      ).toBe(true);
    });

    it("pasados los 10 minutos ya no, con motivo explícito", () => {
      expect(
        canEditMessage({
          message: mensaje,
          actorId: "staff-1",
          now: minutosDespues(10.5),
          conversationIsReadOnly: false,
        }),
      ).toEqual({ ok: false, error: "window_closed" });
    });

    it("otra persona no puede editar el mensaje de alguien, ni recién escrito", () => {
      expect(
        canEditMessage({ message: mensaje, actorId: "admin-2", now: minutosDespues(1), conversationIsReadOnly: false }),
      ).toEqual({ ok: false, error: "not_author" });
    });

    it("la marca 'Editado' aparece en cuanto existe una versión anterior", () => {
      expect(isEdited({ editCount: 0 })).toBe(false);
      expect(isEdited({ editCount: 1 })).toBe(true);
    });
  });

  describe("RN-COR-08 · §67: la conversación de la solicitud pasa a solo lectura al cerrarse", () => {
    const ventana = minutosDespues(60);

    it("mientras la ventana sigue abierta, la conversación de la solicitud admite mensajes", () => {
      expect(
        isConversationReadOnly({
          type: "request",
          requestState: "published",
          correctionWindowEndsAt: ventana,
          now: minutosDespues(30),
        }),
      ).toBe(false);
    });

    it("una vez cerrada la ventana, pasa a solo lectura y ni siquiera el autor puede editar", () => {
      expect(
        isConversationReadOnly({
          type: "request",
          requestState: "published",
          correctionWindowEndsAt: ventana,
          now: minutosDespues(61),
        }),
      ).toBe(true);
      expect(
        canEditMessage({
          message: { senderId: "staff-1", createdAt: minutosDespues(60) },
          actorId: "staff-1",
          now: minutosDespues(61),
          conversationIsReadOnly: true,
        }),
      ).toEqual({ ok: false, error: "conversation_read_only" });
    });

    it("una solicitud cerrada, rechazada o cancelada también cierra el hilo, aunque no hubiera ventana", () => {
      for (const state of READ_ONLY_REQUEST_STATES) {
        expect(
          isConversationReadOnly({ type: "request", requestState: state, correctionWindowEndsAt: null, now: minutosDespues(1) }),
        ).toBe(true);
      }
    });

    it("sin trabajo publicado todavía, no hay ventana que cerrar", () => {
      expect(
        isConversationReadOnly({
          type: "request",
          requestState: "received",
          correctionWindowEndsAt: null,
          now: minutosDespues(999),
        }),
      ).toBe(false);
    });

    it("la conversación general del establecimiento no caduca: no depende de ninguna solicitud", () => {
      expect(
        isConversationReadOnly({
          type: "establishment",
          requestState: null,
          correctionWindowEndsAt: ventana,
          now: minutosDespues(999),
        }),
      ).toBe(false);
    });
  });

  describe("RN-EST-13: quién ve las notas internas", () => {
    it("propietario y administrador ven todas", () => {
      expect(
        canReadInternalNote({ role: "owner", isAuthorizedForEstablishment: false }, { kind: "management" }),
      ).toBe(true);
      expect(
        canReadInternalNote({ role: "admin", isAuthorizedForEstablishment: false }, { kind: "management" }),
      ).toBe(true);
    });

    it("el trabajador solo las operativas de sus establecimientos autorizados", () => {
      expect(
        canReadInternalNote({ role: "worker", isAuthorizedForEstablishment: true }, { kind: "operational" }),
      ).toBe(true);
      expect(
        canReadInternalNote({ role: "worker", isAuthorizedForEstablishment: true }, { kind: "management" }),
      ).toBe(false);
      expect(
        canReadInternalNote({ role: "worker", isAuthorizedForEstablishment: false }, { kind: "operational" }),
      ).toBe(false);
    });
  });
});
