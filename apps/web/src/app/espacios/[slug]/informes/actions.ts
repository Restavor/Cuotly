"use server";

import { revalidatePath } from "next/cache";

import { isReportCategory, isReportSectionKey } from "@/core/reports";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { generateReportVersion } from "@/services/report-generation";
import { createSupabaseReportGateway } from "@/services/report-gateway";

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
      p_idempotency_key: `${category}:${establishmentId}:${texto(formData, "periodStart")}:${texto(formData, "periodEnd")}`,
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

  const sections = orden.map((key) => ({
    key,
    included: formData.get(`included:${key}`) === "on",
    note: texto(formData, `note:${key}`),
  }));

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_report_sections", {
      p_report_id: reportId,
      p_sections: sections,
    });
    if (error) return fallo(new Error(error.message));
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
