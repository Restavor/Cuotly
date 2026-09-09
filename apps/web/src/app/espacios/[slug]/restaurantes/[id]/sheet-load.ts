import type { CycleBag, EstablishmentIdentity } from "@/core/establishments";
import type { AttentionItem } from "@/core/home";
import { groupAttentionByEstablishment } from "@/core/establishments";
import type { EstablishmentState } from "@/core/naming";
import type { createClient } from "@/lib/supabase/server";

import { loadSpaceAttention } from "../../home-load";

/**
 * Lo que enseña la ficha del restaurante (PRD §15.2), leído del servidor.
 *
 * Una función por bloque, y no una sola que lo traiga todo: la ficha son
 * cinco pestañas y solo se pinta una cada vez. Cargar los cobros, los
 * archivos y el historial para enseñar el Resumen serían tres consultas
 * que nadie va a leer, y en la pestaña de Pagos hay además una llamada por
 * cobro para derivar su estado.
 *
 * **Aquí no hay ninguna comprobación de permisos escrita a mano.** Las
 * hacen RLS y las funciones del servidor: `charges` filtra por
 * `can_read_establishment_finance()` (un trabajador solo ve la de sus
 * restaurantes autorizados, RN-FIN-05), `files` por `can_read_file()`
 * (RN-ARC-05: la facturación nunca es visible para los trabajadores) y
 * `establishment_client_users()` comprueba la pertenencia al espacio.
 *
 * `select` enumera columnas SIEMPRE: `requests`, `subscriptions`,
 * `charges`, `files` y `file_versions` tienen privilegios de columna, así
 * que `select *` sobre ellas devuelve 403 (CLAUDE.md).
 */
type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Los datos de §15.2, tal como los guarda la migración 57. El tipo vive en
 * `src/core/establishments.ts` y se deriva de `IDENTITY_FIELDS`, la lista
 * que también ordena el formulario y la vista de lectura: así no puede
 * haber un campo guardado que ninguna pantalla enseñe.
 */
export type SheetIdentity = EstablishmentIdentity;

export interface SheetHeader {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly status: EstablishmentState;
  readonly groupId: string;
  readonly groupName: string | null;
  readonly planId: string | null;
  readonly planName: string | null;
  readonly planPriceCents: number | null;
  /** Los servicios adicionales contratados (RN-COM-13: pueden ser varios). */
  readonly services: readonly string[];
  readonly commitmentEndsAt: string | null;
  readonly cycleStart: string | null;
  readonly cycleEnd: string | null;
  /** §15.2 · la ficha de datos, que se lee en la misma fila. */
  readonly identity: SheetIdentity;
}

export async function loadSheetHeader(
  supabase: Supabase,
  establishmentId: string,
): Promise<SheetHeader | null> {
  const { data: establishment } = await supabase
    .from("establishments")
    // §15.2 · las trece columnas de la ficha vienen en esta misma fila, así
    // que se piden aquí y no en una segunda consulta. Enumeradas, como en
    // todo el proyecto: `establishments` no tiene privilegios de columna
    // hoy, pero la costumbre es la que evita que un `select *` se cuele en
    // una tabla que sí los tenga (CLAUDE.md).
    .select(
      "id, name, code, status, group_id, legal_name, tax_id, address, postal_code, city, contact_email, phone_primary, phone_secondary, website_url, domain, opening_hours, web_platform",
    )
    .eq("id", establishmentId)
    .maybeSingle();

  if (!establishment) return null;

  const [{ data: group }, { data: subscriptions }] = await Promise.all([
    supabase.from("groups").select("id, name").eq("id", establishment.group_id).maybeSingle(),
    supabase
      .from("subscriptions")
      .select("id, kind, plan_id, plans (name, price_cents), services (name)")
      .eq("establishment_id", establishmentId)
      .eq("status", "active"),
  ]);

  const plan = (subscriptions ?? []).find((s) => s.kind === "plan") ?? null;
  const services = (subscriptions ?? [])
    .filter((s) => s.kind === "service")
    .map((s) => s.services?.name)
    .filter((name): name is string => Boolean(name));

  // La permanencia vigente y el ciclo abierto son los del plan, así que sin
  // plan no se preguntan (RN-COM-11: el plan es opcional).
  const [{ data: commitments }, { data: cycles }] = plan
    ? await Promise.all([
        supabase
          .from("plan_commitments")
          .select("subscription_id, ends_at")
          .eq("subscription_id", plan.id)
          .order("started_at", { ascending: false })
          .limit(1),
        supabase
          .from("consumption_cycles")
          .select("cycle_start, cycle_end")
          .eq("subscription_id", plan.id)
          .order("cycle_start", { ascending: false })
          .limit(1),
      ])
    : [{ data: null }, { data: null }];

  const cycle = cycles?.[0] ?? null;

  return {
    id: establishment.id,
    name: establishment.name,
    code: establishment.code,
    status: establishment.status as EstablishmentState,
    groupId: establishment.group_id,
    groupName: group?.name ?? null,
    planId: plan?.plan_id ?? null,
    planName: plan?.plans?.name ?? null,
    planPriceCents: plan?.plans?.price_cents ?? null,
    services,
    commitmentEndsAt: commitments?.[0]?.ends_at ?? null,
    cycleStart: cycle?.cycle_start ?? null,
    cycleEnd: cycle?.cycle_end ?? null,
    identity: {
      legalName: establishment.legal_name,
      taxId: establishment.tax_id,
      address: establishment.address,
      postalCode: establishment.postal_code,
      city: establishment.city,
      contactEmail: establishment.contact_email,
      phonePrimary: establishment.phone_primary,
      phoneSecondary: establishment.phone_secondary,
      websiteUrl: establishment.website_url,
      domain: establishment.domain,
      openingHours: establishment.opening_hours,
      webPlatform: establishment.web_platform,
    },
  };
}

// ---------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------

export interface SheetSummary {
  readonly bags: readonly CycleBag[];
  readonly attention: readonly AttentionItem[];
}

export async function loadSheetSummary(
  supabase: Supabase,
  spaceId: string,
  spaceSlug: string,
  establishmentId: string,
  now: Date = new Date(),
): Promise<SheetSummary> {
  const [{ data: allowance }, attention] = await Promise.all([
    supabase.rpc("establishment_cycle_allowance", { p_establishment_id: establishmentId }),
    loadSpaceAttention(supabase, spaceId, spaceSlug, now),
  ]);

  return {
    bags: (allowance ?? []).map((line) => ({
      category: line.category as CycleBag["category"],
      included: line.included,
      remaining: line.remaining,
    })),
    attention: groupAttentionByEstablishment(attention.items).get(establishmentId) ?? [],
  };
}

// ---------------------------------------------------------------------
// Operación
// ---------------------------------------------------------------------

export interface SheetOperation {
  readonly requests: readonly {
    readonly id: string;
    readonly code: string;
    readonly description: string;
    readonly state: string;
    readonly created_at: string;
  }[];
  readonly jobs: readonly {
    readonly id: string;
    readonly code: string;
    readonly state: string;
    readonly created_at: string;
  }[];
}

/** Los estados que ya no están vivos: una solicitud cerrada no es "abierta". */
const CLOSED_REQUEST_STATES = ["closed", "rejected", "cancelled_before_start", "cancelled_after_start"];
const CLOSED_JOB_STATES = ["completed", "cancelled_before_start", "cancelled_after_start"];

export async function loadSheetOperation(
  supabase: Supabase,
  establishmentId: string,
): Promise<SheetOperation> {
  const [{ data: requests }, { data: jobs }] = await Promise.all([
    supabase
      .from("requests")
      .select("id, code, description, state, created_at")
      .eq("establishment_id", establishmentId)
      .not("state", "in", `(${CLOSED_REQUEST_STATES.join(",")})`)
      .order("created_at", { ascending: false }),
    supabase
      .from("jobs")
      .select("id, code, state, created_at")
      .eq("establishment_id", establishmentId)
      .not("state", "in", `(${CLOSED_JOB_STATES.join(",")})`)
      .order("created_at", { ascending: false }),
  ]);

  return { requests: requests ?? [], jobs: jobs ?? [] };
}

// ---------------------------------------------------------------------
// Informes y datos · Fase 1: "indicadores operativos propios" (§15.2)
// ---------------------------------------------------------------------

/**
 * Recuentos, no métricas. Cada número de aquí es "cuántas filas hay de
 * esto", contadas sobre lo que RLS deja ver. No hay ninguna media, ningún
 * objetivo, ninguna tendencia y ningún umbral: eso sería inventarse los
 * indicadores que la Fase 3 todavía no ha definido (CLAUDE.md).
 */
export interface SheetCounts {
  readonly requestsByState: readonly (readonly [string, number])[];
  readonly jobsByState: readonly (readonly [string, number])[];
  readonly files: number;
}

function countByState(rows: readonly { readonly state: string }[]): readonly (readonly [string, number])[] {
  const cuenta = new Map<string, number>();
  for (const row of rows) cuenta.set(row.state, (cuenta.get(row.state) ?? 0) + 1);
  // Orden determinista: el mismo recuento no puede salir en dos órdenes
  // distintos entre dos recargas.
  return [...cuenta.entries()].sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1));
}

export async function loadSheetCounts(
  supabase: Supabase,
  establishmentId: string,
): Promise<SheetCounts> {
  const [{ data: requests }, { data: jobs }, { count: files }] = await Promise.all([
    supabase.from("requests").select("state").eq("establishment_id", establishmentId),
    supabase.from("jobs").select("state").eq("establishment_id", establishmentId),
    supabase
      .from("files")
      .select("id", { count: "exact", head: true })
      .eq("establishment_id", establishmentId),
  ]);

  return {
    requestsByState: countByState(requests ?? []),
    jobsByState: countByState(jobs ?? []),
    files: files ?? 0,
  };
}

// ---------------------------------------------------------------------
// Gestión · Pagos
// ---------------------------------------------------------------------

export interface SheetCharge {
  readonly id: string;
  readonly concept: string;
  readonly totalCents: number;
  readonly dueAt: string;
  readonly status: string;
  readonly outstandingCents: number;
}

export interface SheetPayments {
  /** `false` cuando quien mira no puede ver la facturación (RN-FIN-07). */
  readonly allowed: boolean;
  readonly charges: readonly SheetCharge[];
}

export async function loadSheetPayments(
  supabase: Supabase,
  establishmentId: string,
): Promise<SheetPayments> {
  const { data: allowed } = await supabase.rpc("can_read_establishment_finance", {
    p_establishment_id: establishmentId,
  });

  if (allowed !== true) return { allowed: false, charges: [] };

  const { data: charges } = await supabase
    .from("charges")
    .select("id, concept, total_cents, due_at")
    .eq("establishment_id", establishmentId)
    .order("due_at", { ascending: false });

  // El estado y la deuda viva los deriva el servidor de los apuntes
  // (RN-FIN-02 + RN-DAT-05): aquí no se suma dinero.
  const rows = await Promise.all(
    (charges ?? []).map(async (charge) => {
      const [{ data: status }, { data: outstanding }] = await Promise.all([
        supabase.rpc("charge_status", { p_charge_id: charge.id }),
        supabase.rpc("charge_outstanding_cents", { p_charge_id: charge.id }),
      ]);
      return {
        id: charge.id,
        concept: charge.concept,
        totalCents: charge.total_cents,
        dueAt: charge.due_at,
        status: status ?? "pending",
        outstandingCents: outstanding ?? 0,
      };
    }),
  );

  return { allowed: true, charges: rows };
}

// ---------------------------------------------------------------------
// Gestión · Usuarios
// ---------------------------------------------------------------------

export interface SheetUser {
  readonly userId: string;
  readonly displayName: string | null;
  readonly email: string;
  readonly source: "group" | "establishment";
  readonly role: string;
  readonly canEditData: boolean;
  readonly canViewBilling: boolean;
  readonly grantedAt: string;
}

export interface SheetUsers {
  readonly rows: readonly SheetUser[];
  /**
   * `true` cuando la consulta falló. §20.7 pide distinguirlo de "no hay
   * nadie": una lista vacía por un error afirmaría que este restaurante no
   * tiene usuarios, y eso, sin haber podido mirar, no lo sabe nadie.
   */
  readonly failed: boolean;
}

export async function loadSheetUsers(
  supabase: Supabase,
  establishmentId: string,
): Promise<SheetUsers> {
  const { data, error } = await supabase.rpc("establishment_client_users", {
    p_establishment_id: establishmentId,
  });

  if (error !== null) return { rows: [], failed: true };

  return {
    failed: false,
    rows: (data ?? []).map((row) => ({
      userId: row.user_id,
      displayName: row.display_name,
      email: row.email,
      source: row.source === "group" ? "group" : "establishment",
      role: row.role,
      canEditData: row.edit_establishment_data,
      canViewBilling: row.view_billing,
      grantedAt: row.granted_at,
    })),
  };
}

// ---------------------------------------------------------------------
// Gestión · Archivos (RN-ARC-01 a RN-ARC-04)
// ---------------------------------------------------------------------

export interface SheetFileVersion {
  readonly id: string;
  readonly versionNumber: number;
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly variant: string | null;
  readonly createdAt: string;
  /**
   * Para saber si de esta versión se puede enseñar una miniatura. Se pide
   * el tipo real guardado al registrar el archivo, no se adivina por la
   * extensión del nombre: un `.jpg` que en realidad es un PDF no se pinta.
   */
  readonly mimeType: string;
}

export interface SheetFile {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly visibility: string;
  readonly archivedAt: string | null;
  readonly lastVersion: number;
}

export interface SheetFiles {
  readonly files: readonly SheetFile[];
  /** Las versiones del archivo elegido en la dirección (`?archivo=`). */
  readonly selected: { readonly file: SheetFile; readonly versions: readonly SheetFileVersion[] } | null;
  /**
   * Las categorías que este restaurante TIENE, para el desplegable de
   * "Categoría". No las ocho de RN-ARC-01: ofrecer un filtro que devuelve
   * cero filas se lee como un error de la pantalla, no como un filtro bien
   * aplicado (el mismo criterio que los filtros del listado, §20.2).
   *
   * Se calculan sobre el catálogo entero, antes de filtrar: si salieran de
   * las filas ya filtradas, elegir "Menús" dejaría el desplegable con
   * "Menús" como única opción y no habría forma de volver.
   */
  readonly categories: readonly string[];
  /** La categoría por la que se está filtrando, o `null` si no hay filtro. */
  readonly category: string | null;
}

export async function loadSheetFiles(
  supabase: Supabase,
  establishmentId: string,
  selectedFileId: string | undefined,
  category: string | undefined,
): Promise<SheetFiles> {
  // Ni `files.created_by` ni `file_versions.created_by` están concedidas
  // (migraciones 26 y 28): quien subió el archivo es identidad del equipo y
  // no sale de una tabla. Pedirlas devolvería 403.
  const { data: files } = await supabase
    .from("files")
    .select("id, name, category, visibility, archived_at, created_at")
    .eq("establishment_id", establishmentId)
    .order("created_at", { ascending: false });

  const ids = (files ?? []).map((file) => file.id);

  // RN-ARC-03 · sustituir un archivo crea una versión nueva y la anterior
  // permanece. La columna "Versión" enseña la última, que es la vigente.
  const { data: versions } = ids.length
    ? await supabase
        .from("file_versions")
        .select("id, file_id, version_number, file_name, size_bytes, variant, mime_type, created_at")
        .in("file_id", ids)
        .order("version_number", { ascending: false })
    : { data: [] };

  const porArchivo = new Map<string, SheetFileVersion[]>();
  for (const version of versions ?? []) {
    const suyas = porArchivo.get(version.file_id) ?? [];
    suyas.push({
      id: version.id,
      versionNumber: version.version_number,
      fileName: version.file_name,
      sizeBytes: version.size_bytes,
      variant: version.variant,
      createdAt: version.created_at,
      mimeType: version.mime_type,
    });
    porArchivo.set(version.file_id, suyas);
  }

  const rows: SheetFile[] = (files ?? []).map((file) => ({
    id: file.id,
    name: file.name,
    category: file.category,
    visibility: file.visibility,
    archivedAt: file.archived_at,
    lastVersion: porArchivo.get(file.id)?.[0]?.versionNumber ?? 1,
  }));

  const categories = [...new Set(rows.map((file) => file.category))].sort();

  // Una categoría que no existe en este restaurante no filtra: se ignora y
  // se enseña el catálogo entero. Filtrar por ella dejaría la tabla vacía
  // y parecería que no hay archivos (CA-20).
  const filtro = category !== undefined && categories.includes(category) ? category : null;
  const visibles = filtro === null ? rows : rows.filter((file) => file.category === filtro);

  // El archivo elegido se busca sobre el catálogo entero, no sobre lo
  // filtrado: el enlace de "los archivos de Magariños con este abierto"
  // debe seguir abriéndolo aunque el filtro lo esconda de la tabla.
  const elegido = rows.find((file) => file.id === selectedFileId) ?? null;

  return {
    files: visibles,
    categories,
    category: filtro,
    selected:
      elegido === null
        ? null
        : { file: elegido, versions: porArchivo.get(elegido.id) ?? [] },
  };
}

// ---------------------------------------------------------------------
// Historial
// ---------------------------------------------------------------------

export interface SheetHistoryEntry {
  readonly id: string;
  readonly entityType: "job" | "task";
  readonly toState: string;
  readonly occurredAt: string;
  readonly jobCode: string | null;
  readonly deepLink: string | null;
}

/**
 * El historial de estados del restaurante, desde `state_events` (RN-DAT-05).
 *
 * Solo los eventos de SUS trabajos: `state_events` es del espacio entero y
 * no tiene columna de establecimiento, así que se acota por los trabajos
 * que este restaurante tiene. Lo que no se dice es quién los hizo — la
 * identidad del equipo sale de la auditoría, no de una pantalla
 * (CLAUDE.md).
 */
export async function loadSheetHistory(
  supabase: Supabase,
  spaceSlug: string,
  establishmentId: string,
  limit = 30,
): Promise<readonly SheetHistoryEntry[]> {
  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, code")
    .eq("establishment_id", establishmentId);

  const jobIds = (jobs ?? []).map((job) => job.id);
  if (jobIds.length === 0) return [];

  const codigo = new Map((jobs ?? []).map((job) => [job.id, job.code]));

  const { data: events } = await supabase
    .from("state_events")
    .select("id, entity_type, entity_id, to_state, occurred_at")
    .in("entity_id", jobIds)
    .eq("entity_type", "job")
    .order("occurred_at", { ascending: false })
    .limit(limit);

  return (events ?? []).map((event) => ({
    id: event.id,
    entityType: "job" as const,
    toState: event.to_state,
    occurredAt: event.occurred_at,
    jobCode: codigo.get(event.entity_id) ?? null,
    deepLink: `/espacios/${spaceSlug}/trabajos/${event.entity_id}`,
  }));
}
