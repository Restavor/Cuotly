"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { MAX_FILE_SIZE_BYTES, isAllowedMimeType } from "@/core/files";
import { isIncidentCategory, isIncidentImpact, isIncidentKind, isIncidentState, pickClientContext } from "@/core/support";
import { es } from "@/i18n/es";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  openIncident,
  postIncidentMessage,
  registerIncidentAttachment,
  setIncidentStatus,
} from "@/services/support-gateway";

import type { HelpActionState } from "./action-state";

/**
 * Las acciones del centro de ayuda del espacio (Fase 4, Hito 21).
 *
 * Ninguna autoriza nada: `open_incident()` exige `contact_cuotly` y las
 * demás deciden el lado con `incident_side_of_caller()`. Aquí se recoge el
 * formulario y se traduce la negativa del servidor a un mensaje.
 */
function mensaje(fallo: unknown): string {
  return fallo instanceof Error ? fallo.message : String(fallo);
}

function texto(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

/** RN-SOP-01/02/03 · abrir una incidencia o una sugerencia. */
export async function openIncidentAction(_prev: HelpActionState, formData: FormData): Promise<HelpActionState> {
  const spaceId = texto(formData, "spaceId");
  const slug = texto(formData, "slug");
  const kind = texto(formData, "kind");
  const category = texto(formData, "category");
  const impact = texto(formData, "impact");
  const description = texto(formData, "description");
  const t = es.help.newIncident;

  if (!spaceId || !slug || !isIncidentKind(kind) || !isIncidentCategory(category) || !description) {
    return { error: t.validation, done: false };
  }
  if (kind === "error" && !isIncidentImpact(impact)) return { error: t.validation, done: false };

  let incidentId: string;
  try {
    const supabase = await createClient();
    incidentId = await openIncident(supabase, {
      spaceId,
      kind,
      category,
      description,
      impact: kind === "error" ? impact : null,
      device: texto(formData, "device") || null,
      appVersion: texto(formData, "appVersion") || null,
      // §131 · solo las cuatro claves; lo que llegue de más se descarta aquí
      // y otra vez en el servidor.
      clientContext: pickClientContext({
        browser: texto(formData, "ctxBrowser"),
        os: texto(formData, "ctxOs"),
        screen: texto(formData, "ctxScreen"),
      }),
      helpQuery: texto(formData, "helpQuery") || null,
      idempotencyKey: texto(formData, "idempotencyKey"),
    });
  } catch (fallo) {
    return { error: mensaje(fallo), done: false };
  }

  revalidatePath(`/espacios/${slug}/ayuda`);
  redirect(`/espacios/${slug}/ayuda/incidencias/${incidentId}`);
}

/** RN-SOP-08 · escribir a Cuotly. */
export async function replyFromSpace(_prev: HelpActionState, formData: FormData): Promise<HelpActionState> {
  const incidentId = texto(formData, "incidentId");
  const slug = texto(formData, "slug");
  const body = texto(formData, "body");
  if (!incidentId || !body) return { error: es.help.newIncident.validation, done: false };
  try {
    const supabase = await createClient();
    await postIncidentMessage(supabase, incidentId, body);
    revalidatePath(`/espacios/${slug}/ayuda/incidencias/${incidentId}`);
    return { error: null, done: true };
  } catch (fallo) {
    return { error: mensaje(fallo), done: false };
  }
}

/** RN-SOP-04 · de "resuelta", el espacio cierra o reabre. */
export async function moveFromSpace(_prev: HelpActionState, formData: FormData): Promise<HelpActionState> {
  const incidentId = texto(formData, "incidentId");
  const slug = texto(formData, "slug");
  const status = texto(formData, "status");
  const reason = texto(formData, "reason");
  if (!incidentId || !isIncidentState(status)) return { error: "Estado desconocido", done: false };
  try {
    const supabase = await createClient();
    await setIncidentStatus(supabase, incidentId, status, reason || null);
    revalidatePath(`/espacios/${slug}/ayuda/incidencias/${incidentId}`);
    return { error: null, done: true };
  } catch (fallo) {
    return { error: mensaje(fallo), done: false };
  }
}

/**
 * RN-SOP-08 · adjuntar. Primero la fila —que es donde el servidor dice si
 * puedes y si el formato y el tamaño valen— y solo después los bytes, con
 * la clave de servicio, al mismo bucket privado que los archivos. Si la
 * subida falla, la fila se retira: nunca tuvo bytes detrás y no es un
 * registro de negocio, es una ruta.
 */
export async function attachToIncident(_prev: HelpActionState, formData: FormData): Promise<HelpActionState> {
  const incidentId = texto(formData, "incidentId");
  const spaceId = texto(formData, "spaceId");
  const slug = texto(formData, "slug");
  const file = formData.get("file");
  const t = es.help.incidents;

  if (!(file instanceof File) || file.size === 0) return { error: t.attachMissing, done: false };
  if (!isAllowedMimeType(file.type)) return { error: t.attachWrongType, done: false };
  if (file.size > MAX_FILE_SIZE_BYTES) return { error: t.attachTooBig, done: false };

  const seguro = file.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "adjunto";
  const ruta = `incidents/${spaceId}/${incidentId}/${Date.now()}-${seguro}`;

  try {
    const supabase = await createClient();
    const attachmentId = await registerIncidentAttachment(supabase, {
      incidentId,
      name: file.name,
      contentType: file.type,
      sizeBytes: file.size,
      storagePath: ruta,
    });

    const admin = createAdminClient();
    const subida = await admin.storage.from("files").upload(ruta, file, { contentType: file.type, upsert: false });
    if (subida.error) {
      await admin.from("incident_attachments").delete().eq("id", attachmentId);
      return { error: t.attachUploadFailed, done: false };
    }

    revalidatePath(`/espacios/${slug}/ayuda/incidencias/${incidentId}`);
    return { error: null, done: true };
  } catch (fallo) {
    return { error: mensaje(fallo), done: false };
  }
}
