"use server";

import { revalidatePath } from "next/cache";

import { defaultReportPeriod, isReportCategory, isReportSectionKey } from "@/core/reports";
import { es } from "@/i18n/es";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { generateReportVersion } from "@/services/report-generation";
import { createSupabaseReportGateway } from "@/services/report-gateway";
import { monthName } from "@/services/report-summary";

import { type ReportActionState, IDLE_REPORT_ACTION } from "./action-state";

/**
 * Las acciones de la biblioteca de informes (§95, RN-REP).
 *
 * **Ninguna autoriza nada por su cuenta.** Quién puede preparar, aprobar,
 * programar, enviar o archivar lo deciden las funciones de la migración
 * 85, que son la única puerta: `reports` no tiene política de escritura.
 * Llamar a la RPC a pelo con otra sesión falla igual y con el mismo
 * mensaje (CLAUDE.md: ocultar un botón no es un control de acceso).
 *
 * La **generación de cifras** es el único punto que usa `service_role`, y
 * por un motivo concreto: `report_operation_dataset()` lee el espacio
 * entero de un tirón (todos los restaurantes del consolidado) sin pasar
 * por RLS. Antes de usarla se comprueba con la sesión de quien pulsa que
 * ese informe existe **para él** — si su RLS no se lo devuelve, no hay
 * nada que generar.
 */

function fallo(error: unknown): ReportActionState {
  return {
    error: error instanceof Error ? error.message : String(error),
    done: false,
    blockedByOpportunities: null,
  };
}

function texto(formData: FormData, nombre: string): string {
  const valor = formData.get(nombre);
  return typeof valor === "string" ? valor.trim() : "";
}

function revalidar(slug: string): void {
  revalidatePath(`/espacios/${slug}/informes`, "layout");
  // Decisión 78 · el informe del mes también se ve en la ficha.
  revalidatePath(`/espacios/${slug}/restaurantes`, "layout");
}

/** La clave de idempotencia de un informe: la misma en la biblioteca y en la ficha (CA-17). */
function claveDeInforme(category: string, establishmentId: string, start: string, end: string): string {
  return `${category}:${establishmentId}:${start}:${end}`;
}

/** §95.1 y §95.2 · preparar el borrador y generar sus cifras. */
export async function createReport(
  _prev: ReportActionState,
  formData: FormData,
): Promise<ReportActionState> {
  const slug = texto(formData, "slug");
  const category = texto(formData, "category");
  const establishmentId = texto(formData, "establishmentId");

  if (!isReportCategory(category)) {
    return fallo(new Error("Familia de informe desconocida"));
  }

  try {
    const supabase = await createClient();
    const { data: space } = await supabase.from("spaces").select("id").eq("slug", slug).maybeSingle();
    if (!space) return fallo(new Error("Espacio no encontrado"));

    const { data: reportId, error } = await supabase.rpc("create_report_draft", {
      p_space_id: space.id,
      p_category: category,
      p_name: texto(formData, "name"),
      p_period_start: texto(formData, "periodStart"),
      p_period_end: texto(formData, "periodEnd"),
      // Omitir vale el `default null` de la función: un informe sin
      // restaurante es el consolidado. Los tipos generados los declaran
      // opcionales, no anulables, y pasar `null` era un desajuste que la
      // frontera con `any` tapaba.
      p_establishment_id: establishmentId === "" ? undefined : establishmentId,
      // Queda como **registro de lo que se pidió**, no como algo que se
      // vuelva a aplicar: desde la decisión 29 un informe no se genera
      // filtrado —guarda las cifras de las tres familias y quien lo mira
      // elige qué ver—, así que esto es historia del borrador y nada más.
      // RN-REP-05 lo dice con esas palabras desde la misma fecha.
      p_filters: {
        period_start: texto(formData, "periodStart"),
        period_end: texto(formData, "periodEnd"),
        establishment_ids: establishmentId === "" ? [] : [establishmentId],
      },
      // CA-17 · el mismo informe del mismo periodo pulsado dos veces es uno.
      p_idempotency_key: claveDeInforme(
        category,
        establishmentId,
        texto(formData, "periodStart"),
        texto(formData, "periodEnd"),
      ),
    });

    if (error) return fallo(new Error(error.message));

    await generarCifras(String(reportId));
    revalidar(slug);
    return { ...IDLE_REPORT_ACTION, done: true };
  } catch (error) {
    return fallo(error);
  }
}

/** §95.1 · volver a calcular. Añade una versión; no pisa la anterior. */
export async function regenerateReport(
  _prev: ReportActionState,
  formData: FormData,
): Promise<ReportActionState> {
  const slug = texto(formData, "slug");
  const reportId = texto(formData, "reportId");

  try {
    await asegurarVisible(reportId);
    await generarCifras(reportId);
    revalidar(slug);
    return { ...IDLE_REPORT_ACTION, done: true };
  } catch (error) {
    return fallo(error);
  }
}

/** §95.5 · "selecciona, edita y ordena". */
export async function saveReportSections(
  _prev: ReportActionState,
  formData: FormData,
): Promise<ReportActionState> {
  const slug = texto(formData, "slug");
  const reportId = texto(formData, "reportId");
  const orden = formData.getAll("sectionKey").map(String).filter(isReportSectionKey);

  // RN-REP-28 · si el resumen se deja como lo escribió Cuotly, no se
  // guarda como escrito por una persona: vuelve a ser el automático y se
  // recalcula en cada versión. Vaciarlo, igual.
  const automatico = texto(formData, "autoSummary");
  const sections = orden.map((key) => {
    const note = texto(formData, `note:${key}`);
    return {
      key,
      included: formData.get(`included:${key}`) === "on",
      note: key === "executive_summary" && note === automatico ? "" : note,
    };
  });

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_report_sections", {
      p_report_id: reportId,
      p_sections: sections,
    });
    if (error) return fallo(new Error(error.message));
    // RN-REP-30 · lo que se revisa es lo que se sube: el texto nuevo del
    // resumen entra en una versión nueva, y la anterior se conserva.
    await regenerarSiSePuede(reportId);
    revalidar(slug);
    return { ...IDLE_REPORT_ACTION, done: true };
  } catch (error) {
    return fallo(error);
  }
}

/** §95.4 · aprobar, y los demás cambios de estado de §95. */
export async function setReportStatus(
  _prev: ReportActionState,
  formData: FormData,
): Promise<ReportActionState> {
  const slug = texto(formData, "slug");
  const reportId = texto(formData, "reportId");
  const status = texto(formData, "status");
  const reason = texto(formData, "reason");

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_report_status", {
      p_report_id: reportId,
      p_status: status,
      p_reason: reason === "" ? undefined : reason,
    });
    if (error) return fallo(new Error(error.message));
    revalidar(slug);
    return { ...IDLE_REPORT_ACTION, done: true };
  } catch (error) {
    return fallo(error);
  }
}

/** §95.7 · programar el envío. */
export async function scheduleReport(
  _prev: ReportActionState,
  formData: FormData,
): Promise<ReportActionState> {
  const slug = texto(formData, "slug");
  const reportId = texto(formData, "reportId");
  const fecha = texto(formData, "scheduledFor");

  if (fecha === "") return fallo(new Error("Programar un envío necesita una fecha"));

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("schedule_report", {
      p_report_id: reportId,
      // El campo del formulario es una fecha local; se manda como
      // medianoche de esa fecha en la zona del navegador, que es lo que
      // `datetime-local` produce. La zona del espacio la vuelve a aplicar
      // la cola al compararla con `now()`.
      p_scheduled_for: new Date(fecha).toISOString(),
      p_channel: formData.get("channel") === "none" ? "none" : "email",
      p_include_csv: formData.get("includeCsv") === "on",
    });
    if (error) return fallo(new Error(error.message));
    revalidar(slug);
    return { ...IDLE_REPORT_ACTION, done: true };
  } catch (error) {
    return fallo(error);
  }
}

/**
 * §95.7 · enviar ahora. El freno de las oportunidades pendientes lo aplica
 * `send_report()`: devuelve -1 y deja el informe en revisión, y aquí solo
 * se traduce a algo que la pantalla pueda decir (RN-REP-10).
 */
export async function sendReport(
  _prev: ReportActionState,
  formData: FormData,
): Promise<ReportActionState> {
  const slug = texto(formData, "slug");
  const reportId = texto(formData, "reportId");

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("send_report", { p_report_id: reportId });
    if (error) return fallo(new Error(error.message));

    revalidar(slug);

    if (typeof data === "number" && data < 0) {
      const { data: pending } = await supabase.rpc("report_pending_opportunities", {
        p_report_id: reportId,
      });
      return {
        error: null,
        done: false,
        blockedByOpportunities: typeof pending === "number" ? pending : 1,
      };
    }

    return { ...IDLE_REPORT_ACTION, done: true };
  } catch (error) {
    return fallo(error);
  }
}

/** Renombrar: lo escribe una persona, así que se guarda tal cual. */
export async function renameReport(
  _prev: ReportActionState,
  formData: FormData,
): Promise<ReportActionState> {
  const slug = texto(formData, "slug");

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("rename_report", {
      p_report_id: texto(formData, "reportId"),
      p_name: texto(formData, "name"),
    });
    if (error) return fallo(new Error(error.message));
    revalidar(slug);
    return { ...IDLE_REPORT_ACTION, done: true };
  } catch (error) {
    return fallo(error);
  }
}

/**
 * Decisión 78 (RN-REP-27) · "Generar informe" desde la ficha de un
 * restaurante: el informe de operación del **último mes natural cerrado**,
 * sin nada que rellenar.
 *
 * La clave de idempotencia es la de la biblioteca, así que pulsar dos veces
 * —o generarlo aquí después de prepararlo allí— encuentra el mismo informe.
 * Si no se ha subido, se le añade una versión con las cifras al día; si ya
 * se subió, no se toca.
 */
export async function generateMonthlyReport(
  _prev: ReportActionState,
  formData: FormData,
): Promise<ReportActionState> {
  const slug = texto(formData, "slug");
  const establishmentId = texto(formData, "establishmentId");
  if (establishmentId === "") return fallo(new Error("Falta el restaurante"));

  try {
    const supabase = await createClient();
    const { data: space } = await supabase.from("spaces").select("id, timezone").eq("slug", slug).maybeSingle();
    if (!space) return fallo(new Error("Espacio no encontrado"));

    // CLAUDE.md · el mes se calcula en la zona del espacio.
    const period = defaultReportPeriod(new Date(), space.timezone);

    const { data: reportId, error } = await supabase.rpc("create_report_draft", {
      p_space_id: space.id,
      p_category: "operation",
      p_name: es.reportsPage.monthly.name(monthName(period)),
      p_period_start: period.start,
      p_period_end: period.end,
      p_establishment_id: establishmentId,
      p_filters: {
        period_start: period.start,
        period_end: period.end,
        establishment_ids: [establishmentId],
      },
      p_idempotency_key: claveDeInforme("operation", establishmentId, period.start, period.end),
    });
    if (error) return fallo(new Error(error.message));

    const id = String(reportId);
    const { data: fila } = await supabase.from("reports").select("status").eq("id", id).maybeSingle();
    if (!fila) return fallo(new Error("Informe no encontrado"));

    // Lo subido no se regenera: es lo que el restaurante ya leyó (P4).
    if (fila.status === "sent" || fila.status === "archived") {
      revalidar(slug);
      return { ...IDLE_REPORT_ACTION, done: true };
    }

    // RN-REP-09 · unas cifras nuevas ya no son lo que se aprobó.
    if (fila.status === "approved" || fila.status === "scheduled") {
      const { error: statusError } = await supabase.rpc("set_report_status", {
        p_report_id: id,
        p_status: "pending_review",
        p_reason: es.reportsPage.monthly.regeneratedReason,
      });
      if (statusError) return fallo(new Error(statusError.message));
    }

    await generarCifras(id);
    revalidar(slug);
    return { ...IDLE_REPORT_ACTION, done: true };
  } catch (error) {
    return fallo(error);
  }
}

/**
 * Decisión 78 (RN-REP-29) · "Subir informe": aprobar y enviar en una
 * transacción. Quién puede y si hace falta confirmar lo decide
 * `publish_report()`; aquí solo se le pasa la confirmación que dio la
 * alerta y se traduce el freno de las oportunidades.
 */
export async function publishReport(
  _prev: ReportActionState,
  formData: FormData,
): Promise<ReportActionState> {
  const slug = texto(formData, "slug");
  const reportId = texto(formData, "reportId");

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("publish_report", {
      p_report_id: reportId,
      p_confirm_unreviewed: formData.get("confirmUnreviewed") === "true",
    });
    if (error) return fallo(new Error(error.message));

    revalidar(slug);

    if (typeof data === "number" && data < 0) {
      const { data: pending } = await supabase.rpc("report_pending_opportunities", {
        p_report_id: reportId,
      });
      return {
        error: null,
        done: false,
        blockedByOpportunities: typeof pending === "number" ? pending : 1,
      };
    }

    return { ...IDLE_REPORT_ACTION, done: true };
  } catch (error) {
    return fallo(error);
  }
}

/**
 * Decisión 78 (RN-REP-30) · los textos editables de "Lo que ha pasado este
 * mes". Cada cosa llega con su texto y con el original que se le enseñó;
 * si no cambió, o se vació, vuelve al original (`null`).
 *
 * Después se genera una versión nueva: lo que se revisa es lo que se sube.
 */
export async function saveReportTexts(
  _prev: ReportActionState,
  formData: FormData,
): Promise<ReportActionState> {
  const slug = texto(formData, "slug");
  const reportId = texto(formData, "reportId");

  const editado = (campo: string, key: string): string | null => {
    const valor = texto(formData, `${campo}:${key}`);
    const original = texto(formData, `${campo}Original:${key}`);
    return valor === "" || valor === original ? null : valor;
  };

  const entries = formData
    .getAll("entryKey")
    .map(String)
    .filter((key) => /^(change|entry):/.test(key))
    .map((key) => ({ key, title: editado("title", key), body: editado("body", key) }));

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_report_entry_texts", {
      p_report_id: reportId,
      p_entries: entries,
    });
    if (error) return fallo(new Error(error.message));
    await regenerarSiSePuede(reportId);
    revalidar(slug);
    return { ...IDLE_REPORT_ACTION, done: true };
  } catch (error) {
    return fallo(error);
  }
}

/**
 * Una versión nueva con lo que se acaba de guardar, si el informe todavía
 * se puede regenerar. Un informe sin ninguna versión se queda sin ella: el
 * primero lo genera quien pulsa "Generar", no una edición.
 */
async function regenerarSiSePuede(reportId: string): Promise<void> {
  const supabase = await createClient();
  const { data: fila } = await supabase.from("reports").select("status").eq("id", reportId).maybeSingle();
  if (!fila || fila.status === "sent" || fila.status === "archived") return;
  const { count } = await supabase
    .from("report_versions")
    .select("id", { count: "exact", head: true })
    .eq("report_id", reportId);
  if (!count) return;
  await generarCifras(reportId);
}

/**
 * Que el informe exista **para quien pulsa**. Se comprueba con su sesión,
 * no con `service_role`: es lo que impide que la generación —que sí usa la
 * clave de servicio— sirva para tocar un informe de otro espacio.
 */
async function asegurarVisible(reportId: string): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.from("reports").select("id").eq("id", reportId).maybeSingle();
  if (!data) throw new Error("Informe no encontrado");
}

async function generarCifras(reportId: string): Promise<void> {
  await generateReportVersion(
    {
      gateway: createSupabaseReportGateway(createAdminClient()),
      now: () => new Date(),
    },
    reportId,
  );
}
