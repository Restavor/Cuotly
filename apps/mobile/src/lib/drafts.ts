import AsyncStorage from "@react-native-async-storage/async-storage";

import { newIdempotencyKey, newLocalId } from "./ids";

/**
 * RN-MOV-09 y RN-MOV-10 · los borradores que se redactan sin conexión.
 *
 * Solo dos clases: solicitudes y mensajes (§144). Cada borrador nace con
 * su **clave de idempotencia** en el momento de crearse, y una solicitud
 * guarda además el identificador que devolvió `create_request_draft` en
 * cuanto lo tiene: así un corte entre "crear el borrador en el servidor" y
 * "enviarlo" no crea una segunda solicitud al reintentar (RN-MOV-10).
 *
 * Al volver la conexión no se envía nada solo: la pantalla enseña los
 * borradores y pide confirmación **uno a uno** (RN-MOV-09).
 */
export type RequestDraft = {
  readonly kind: "request";
  readonly localId: string;
  readonly idempotencyKey: string;
  readonly createdAt: string;
  readonly spaceSlug: string;
  readonly establishmentId: string;
  readonly description: string;
  readonly context: string;
  /** El id del borrador en el servidor, en cuanto `create_request_draft` lo devuelve. */
  readonly serverRequestId: string | null;
};

export type MessageDraft = {
  readonly kind: "message";
  readonly localId: string;
  readonly idempotencyKey: string;
  readonly createdAt: string;
  readonly spaceSlug: string;
  readonly conversationId: string;
  readonly body: string;
};

export type Draft = RequestDraft | MessageDraft;

const PREFIX = "cuotly:drafts:";

function keyFor(userId: string): string {
  return `${PREFIX}${userId}`;
}

export async function listDrafts(userId: string): Promise<readonly Draft[]> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    return raw ? (JSON.parse(raw) as Draft[]) : [];
  } catch {
    return [];
  }
}

async function persist(userId: string, drafts: readonly Draft[]): Promise<void> {
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify(drafts));
}

export function newRequestDraft(input: {
  spaceSlug: string;
  establishmentId: string;
  description: string;
  context: string;
}): RequestDraft {
  return {
    kind: "request",
    localId: newLocalId(),
    idempotencyKey: newIdempotencyKey("request"),
    createdAt: new Date().toISOString(),
    spaceSlug: input.spaceSlug,
    establishmentId: input.establishmentId,
    description: input.description,
    context: input.context,
    serverRequestId: null,
  };
}

export function newMessageDraft(input: { spaceSlug: string; conversationId: string; body: string }): MessageDraft {
  return {
    kind: "message",
    localId: newLocalId(),
    idempotencyKey: newIdempotencyKey("message"),
    createdAt: new Date().toISOString(),
    spaceSlug: input.spaceSlug,
    conversationId: input.conversationId,
    body: input.body,
  };
}

export async function saveDraft(userId: string, draft: Draft): Promise<void> {
  const current = await listDrafts(userId);
  const others = current.filter((d) => d.localId !== draft.localId);
  await persist(userId, [...others, draft]);
}

export async function removeDraft(userId: string, localId: string): Promise<void> {
  const current = await listDrafts(userId);
  await persist(
    userId,
    current.filter((d) => d.localId !== localId),
  );
}

export async function clearDrafts(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(userId));
  } catch {
    // Nada que borrar.
  }
}

/**
 * El envío de un borrador de solicitud en dos pasos, con el id del primero
 * guardado antes de dar el segundo (RN-MOV-10). `create` y `submit` son
 * las dos llamadas al servidor; `persist` guarda el borrador con el id
 * entre una y otra. Es puro respecto del transporte para que tenga test.
 */
export async function sendRequestDraft(
  draft: RequestDraft,
  deps: {
    create: (draft: RequestDraft) => Promise<string>;
    submit: (requestId: string) => Promise<void>;
    persist: (draft: RequestDraft) => Promise<void>;
  },
): Promise<string> {
  let requestId = draft.serverRequestId;
  if (requestId === null) {
    requestId = await deps.create(draft);
    await deps.persist({ ...draft, serverRequestId: requestId });
  }
  await deps.submit(requestId);
  return requestId;
}
