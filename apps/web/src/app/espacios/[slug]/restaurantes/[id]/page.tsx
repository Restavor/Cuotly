import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  Card,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { todayInTimeZone } from "@/core/finance";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { ExportForm } from "../../ajustes/exportacion/ExportForm";
import { createClient } from "@/lib/supabase/server";

import { Conversation } from "@/components/conversation/Conversation";
import { loadConversation } from "@/components/conversation/load";

import { PhotoForm } from "@/components/establishment/PhotoForm";
import { EstablishmentDataForm } from "@/components/establishment/DataForm";
import {
  loadDigitalData,
  loadIntegrationsView,
} from "@/components/establishment/integrations-load";
import { loadOpportunities } from "@/components/establishment/opportunities-load";
import { loadEstablishmentReports } from "@/components/report/reports-load";
import { INTEGRATION_FLASH_PARAM } from "./integraciones/action-state";
import { EstablishmentSheet } from "@/components/establishment/Sheet";
import { StatusNotice } from "@/components/establishment/StatusNotice";
import { loadBackups, loadPendingTransfer } from "./transfer-load";
import { loadStatusHistory } from "./status-history-load";
import { loadPanelInvitations } from "./usuarios/users-load";
import { loadEstablishmentNotes } from "@/app/espacios/[slug]/mensajes/[id]/notes-load";
import {
  parseDataSection,
  parseManagementBlock,
  parseOperationSection,
  parsePaymentsSection,
  parseSheetTab,
} from "@/components/establishment/tabs";
import { isStaffRole } from "@/components/shell/navigation";
import { resolveShellViewer } from "@/components/shell/viewer";

import { TerminationForm } from "./TerminationForm";
import { loadRequestDetail } from "../../solicitudes/[id]/detail-load";
import { loadEstablishmentTimezone } from "./timezone-load";
import { loadPanelHome } from "./panel-home-load";
import { PanelHome } from "@/components/panel/PanelHome";
import { TermsCard } from "@/components/panel/TermsCard";
import { loadSubscriptionTerms } from "../../planes/terms-load";
import {
  loadSheetCounts,
  loadSheetFiles,
  loadSheetHeader,
  loadSheetOperation,
  loadSheetPayments,
  loadSheetSummary,
  loadSheetAudit,
  loadSheetNextMenu,
  loadSheetManager,
  loadSheetStaff,
  loadSheetUsers,
} from "./sheet-load";
import { loadEstablishmentPhoto } from "@/services/establishment-photo";

/**
 * El restaurante, visto por su cliente (PRD §20.2). Es la pantalla a la
 * que lleva el selector de contexto de HU-02 cuando quien entra no es del
 * equipo de mantenimiento.
 *
 * Todo lo que se ve aquí lo filtra RLS: si esta página pidiera un
 * restaurante ajeno, la base de datos devolvería cero filas y la pantalla
 * sería un 404. No hay ninguna comprobación de permisos escrita en este
 * archivo, y es a propósito — la que vale está en el servidor.
 *
 * `select` enumera columnas siempre: `requests` y compañía tienen
 * privilegios de columna para que el cliente no vea la identidad del
 * equipo, así que `select *` devolvería 403 (CLAUDE.md).
 */
export const dynamic = "force-dynamic";

type FileCategoryKey = keyof typeof es.space.files.categories;

/**
 * La misma dirección sirve a los dos lados, y es a propósito: un
 * restaurante es un restaurante, y su enlace debería ser el mismo lo mire
 * quien lo mire. Lo que cambia es **qué** se enseña — al equipo la ficha
 * interna de §15.2 con sus cinco pestañas, al restaurante lo suyo — y eso
 * lo decide la membresía real del espacio, no un parámetro.
 *
 * Ramificar aquí no autoriza nada: si un cliente forzara `?vista=gestion`,
 * seguiría viendo su pantalla, y aunque no la ramificáramos, RLS y
 * `establishment_client_users()` le devolverían cero filas de todo lo
 * interno (CLAUDE.md: ocultar no es controlar).
 */
export default async function EstablishmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, id } = await params;
  const query = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const soloUno = (valor: string | string[] | undefined): string | undefined =>
    Array.isArray(valor) ? valor[0] : valor;

  const { role } = await resolveShellViewer(supabase, user.id, slug);

  // La ficha interna de §15.2 es del equipo. El restaurante —con Menú
  // Diario contratado o sin él— ve su propia pantalla, más abajo.
  if (isStaffRole(role)) {
    const header = await loadSheetHeader(supabase, id);
    if (header === null) notFound();

    const { data: space } = await supabase
      .from("spaces")
      .select("id, timezone")
      .eq("slug", slug)
      .maybeSingle();
    if (!space) notFound();

    // El día que propone el formulario de registrar un pago es hoy **en la
    // zona del espacio**, calculado en el servidor: el navegador de quien
    // lo registra puede estar en otro huso y quien manda es el espacio
    // (CLAUDE.md MUST). Es el mismo criterio que en Finanzas.
    const hoy = todayInTimeZone(new Date(), space.timezone);

    const base = `/espacios/${slug}/restaurantes/${id}`;
    /*
      Maqueta 19 · los filtros del historial viven en la dirección, igual
      que la pestaña y el bloque: así "el historial de Magariños en
      septiembre" se comparte con un enlace y el botón de volver deshace el
      filtro (CA-22).
    */
    const filtrosAuditoria = {
      from: soloUno(query.desde) ?? null,
      to: soloUno(query.hasta) ?? null,
      family: soloUno(query.familia) ?? null,
      actorId: soloUno(query.persona) ?? null,
      page: Number(soloUno(query.pagina) ?? "1"),
    };

    const [
      summary, operation, counts, payments, users, staff, files, audit, recentActivity, nextMenu,
      manager, photoUrl,
    ] = await Promise.all([
      loadSheetSummary(supabase, space.id, slug, id),
      loadSheetOperation(supabase, slug, id),
      loadSheetCounts(supabase, id),
      loadSheetPayments(supabase, id),
      loadSheetUsers(supabase, id),
      loadSheetStaff(supabase, space.id, id),
      loadSheetFiles(supabase, id, soloUno(query.archivo), soloUno(query.tipo)),
      loadSheetAudit(supabase, id, space.timezone, filtrosAuditoria),
      /*
        Página 24 · "Actividad reciente" del Resumen. Se pide **sin
        filtros**, y no se reaprovecha `audit`: los filtros de la pestaña
        Historial viven en la dirección y siguen puestos aunque se vuelva
        al Resumen, así que ese bloque enseñaría lo último *de lo
        filtrado* sin decirlo. Una consulta más es más barata que un
        bloque que miente.

        Mismas filas que Historial en todo lo demás:
        `establishment_audit()` es SECURITY INVOKER y la política de
        `audit_log` decide qué ve cada quien (§21.2).
      */
      loadSheetAudit(supabase, id, space.timezone, {
        from: null,
        to: null,
        family: null,
        actorId: null,
        page: 1,
      }),
      // Página 24 · "Próxima publicación de menú" del Resumen.
      loadSheetNextMenu(supabase, id, space.timezone),
      // RN-EST-19 · quién lo lleva y a quién se le puede asignar.
      loadSheetManager(supabase, space.id, id),
      // RN-EST-18 · su foto, ya firmada. `null` si no tiene, que es un
      // estado normal y la ficha lo pinta sin foto (CA-20).
      loadEstablishmentPhoto(supabase, supabase.storage, id),
    ]);

    /*
      RN-EST-08 · "el motivo concreto se muestra junto al estado". La
      función que lo sirve existe desde el Hito 7 y no la llamaba ninguna
      pantalla: lo que se enseñaba era una frase genérica igual para las
      cuatro maneras de tener el servicio detenido.
    */
    const { data: statusReason } = await supabase.rpc("establishment_status_reason", {
      p_establishment_id: id,
    });

    // M74 · la línea de tiempo de los estados, que solo se pinta en solo
    // lectura. No se pide en los demás: nadie la va a ver.
    const statusHistory =
      header.status === "read_only" ? await loadStatusHistory(supabase, space.id, id) : null;

    // §38 · la propuesta de transferencia abierta, si la hay, y las copias
    // de seguridad. Las dos las filtra su política: si vuelven vacías es
    // que no había nada que enseñarle a quien preguntó.
    const [
      transfer, backups, notes, { data: soyPropietario }, { data: bytesOcupados }, invitations,
    ] =
      await Promise.all([
      loadPendingTransfer(supabase, id, space.id),
      loadBackups(supabase, id),
      // RN-EST-14 · las notas internas, que desde el diseño definitivo son
      // un bloque de Gestión. Quién las lee lo decide
      // `can_read_establishment_notes()` dentro del cargador, no esta
      // pantalla (RN-EST-13).
      loadEstablishmentNotes(supabase, id, space.id, user.id),
      supabase.rpc("space_owner_is_me", { p_space_id: space.id }),
      // RN-ARC-10 · cuánto ocupa este restaurante. La función devuelve
      // `null` a quien no puede ver todos sus archivos, y ese `null` se
      // pasa tal cual: la pantalla dice el motivo en vez de pintar un cero
      // (CLAUDE.md MUST NOT).
      supabase.rpc("establishment_storage_bytes", { p_establishment_id: id }),
      // M43 · las invitaciones vivas del panel (RN-PAN-14), las mismas que
      // lista la pantalla de Usuarios y accesos del restaurante.
      loadPanelInvitations(supabase, id),
    ]);

    /*
      Maqueta 17 · las integraciones y el resumen de analítica digital
      (Fase 3, Hito 14). El actor se dice para decidir qué botones se
      PINTAN (RN-INT-05); quién puede de verdad lo comprueba cada función
      de la base con la sesión. Si la lectura falla se pasa `null` y la
      ficha dice que no pudo leerlas, en vez de enseñar "ninguna conectada".
    */
    const integrations = await loadIntegrationsView(supabase, {
      establishmentId: id,
      actor: { kind: "staff", role: role === "owner" ? "owner" : role === "admin" ? "admin" : "worker" },
      establishmentStatus: header.status,
      websiteUrl: header.identity.websiteUrl,
      webPlatform: header.identity.webPlatform,
      domain: header.identity.domain,
      timezone: space.timezone,
      flash: soloUno(query[INTEGRATION_FLASH_PARAM]),
    }).catch((fallo: unknown) => {
      console.error("[ficha] no se pudieron leer las integraciones", { id, message: String(fallo) });
      return null;
    });
    const digital =
      integrations === null
        ? null
        : await loadDigitalData(supabase, {
            establishmentId: id,
            rows: integrations.rows,
            todayIso: hoy,
            timezone: space.timezone,
            now: new Date(),
          }).catch((fallo: unknown) => {
            console.error("[ficha] no se pudo leer la analítica digital", { id, message: String(fallo) });
            return null;
          });

    /*
      §96 a §101 · las oportunidades (Hito 15). Se leen solo cuando se está
      mirando esa sección: son tres consultas y las otras cinco secciones
      de la pestaña no las necesitan.

      Quién ve cuáles no se decide aquí: la política de `opportunities` ya
      filtra. Lo que sí se decide aquí es qué se le OFRECE a quien mira, y
      aprobar o descartar es del propietario y de los administradores con
      "Aprobar informes" (§97). Se pregunta por la CAPACIDAD, no por el
      rol: un administrador sin ella recomienda, como un trabajador.
    */
    const vista = parseSheetTab(soloUno(query.vista));
    const seccion = parseDataSection(soloUno(query.seccion));
    /*
      Las dos pestañas con subsecciones —"Operación" e "Informes y datos"—
      comparten el mismo hueco de la dirección (`?seccion=`). Cada una lo
      lee con su propia lista, así que un valor de la otra no rompe nada:
      cae en la primera sección, como cualquier dirección escrita a mano.
    */
    const seccionOperacion = parseOperationSection(soloUno(query.seccion));

    /*
      Página 25 · la solicitud abierta dentro de la ficha (`?solicitud=`).

      Se carga **solo** cuando se está mirando esa sección: en cualquier
      otra pestaña el parámetro sobra y pedir el detalle sería una consulta
      por nada.

      Y se comprueba que la solicitud sea **de este restaurante**. RLS ya
      impide ver las de otro espacio, pero dentro del mismo espacio un id
      pegado a mano enseñaría la solicitud de otro restaurante bajo el
      encabezado de este, que es decir algo falso aunque todo lo demás
      esté bien.
    */
    const solicitudAbierta = soloUno(query.solicitud);
    const detalleSolicitud =
      vista.key !== "operation" ||
      seccionOperacion.key !== "requests" ||
      solicitudAbierta === undefined
        ? null
        : await loadRequestDetail(supabase, solicitudAbierta);
    const detalleDeEsteRestaurante =
      detalleSolicitud !== null && detalleSolicitud.request.establishment_id === id
        ? detalleSolicitud
        : null;
    const mirandoOportunidades = vista.key === "data" && seccion.key === "opportunities";

    const { data: puedeAprobar } = mirandoOportunidades
      ? await supabase.rpc("has_capability", { p_space_id: space.id, p_capability: "approve_reports" })
      : { data: false };
    const opportunities = mirandoOportunidades
      ? await loadOpportunities(supabase, id).catch((fallo: unknown) => {
          console.error("[ficha] no se pudieron leer las oportunidades", { id, message: String(fallo) });
          return null;
        })
      : null;

    /*
      Maqueta 09 · "Informes generados" (§89, Hito 16). Como las
      oportunidades, solo cuando se mira el Resumen de la pestaña de datos:
      es donde la maqueta los pone.
    */
    const reports =
      vista.key === "data" && seccion.key === "summary"
        ? await loadEstablishmentReports(supabase, id).catch((fallo: unknown) => {
            console.error("[ficha] no se pudieron leer los informes", { id, message: String(fallo) });
            return [];
          })
        : [];

    return (
      <EstablishmentSheet
        base={base}
        slug={slug}
        tab={vista}
        block={parseManagementBlock(soloUno(query.bloque))}
        section={seccion}
        operationSection={seccionOperacion}
        paymentsSection={parsePaymentsSection(soloUno(query.pagos))}
        integrationSource={soloUno(query.fuente) ?? null}
        // M48 · el evento del historial abierto al lado de la lista.
        auditEventId={soloUno(query.evento) ?? null}
        // M83 · la copia de seguridad abierta en el panel de detalle.
        backupId={soloUno(query.copia) ?? null}
        data={{
          header,
          /*
            RN-EST-11 del lado del equipo: `manage_clients`, que tienen el
            propietario y los administradores. Un trabajador consulta la
            ficha y no la edita.

            Esto decide qué se PINTA y nada más. La regla la hace cumplir
            `set_establishment_data()`, que desde la migración 57 es la
            única puerta —`establishments` se quedó sin política de UPDATE
            y un disparador rechaza el resto—, así que equivocarse aquí
            enseñaría un formulario que el servidor rechazaría, no un
            permiso concedido (CLAUDE.md).
          */
          canEditData: role === "owner" || role === "admin",
          /*
            Maqueta 15 · quién puede retirar un acceso: `manage_clients`,
            que tienen el propietario y los administradores. Igual que
            arriba, esto solo decide qué se pinta —
            `revoke_establishment_access()` lo comprueba por su cuenta.
          */
          canManageClients: role === "owner" || role === "admin",
          summary,
          operation,
          counts,
          payments,
          today: hoy,
          users,
          invitations,
          staff,
          files,
          audit,
          recentActivity: recentActivity.rows,
          nextMenu,
          requestDetail: detalleDeEsteRestaurante,
          manager,
          photoUrl,
          statusReason: statusReason ?? null,
          statusHistory,
          transfer,
          backups,
          notes,
          storageBytes: bytesOcupados ?? null,
          canProposeTransfer: soyPropietario === true,
          integrations,
          digital,
          opportunities,
          opportunityViewer: puedeAprobar === true ? "approver" : "worker",
          reports,
          // CLAUDE.md · la zona del espacio, que esta pantalla ya lee para
          // proponer el día del pago. La ficha entera pinta con ella.
          timeZone: space.timezone,
        }}
      />
    );
  }

  const { data: establishment } = await supabase
    .from("establishments")
    // Las columnas de §15.2 vienen aquí porque RN-EST-11 le deja editarlas
    // a él: el propietario de un restaurante corrige su propia razón
    // social y su propio teléfono. Enumeradas, como en todo el proyecto.
    // `space_id` viene para la exportación de §141 (RN-CIC-11): el
    // restaurante no puede leer `spaces`, pero su propia ficha sí dice a
    // qué espacio pertenece.
    .select(
      "id, space_id, name, code, status, legal_name, tax_id, address, postal_code, city, contact_name, contact_email, phone_primary, phone_secondary, website_url, instagram, facebook_url, domain, opening_hours, web_platform",
    )
    .eq("id", id)
    .maybeSingle();

  if (!establishment) {
    notFound();
  }

  const [
    { data: allowance },
    { data: canEditData },
    { data: requests },
    { data: sharedFiles },
    photoUrl,
  ] = await Promise.all([
    supabase.rpc("establishment_cycle_allowance", { p_establishment_id: id }),
    // RN-EST-11 · se le PREGUNTA al servidor, no se deduce del rol aquí:
    // el reparto tiene cuatro casos (propietario global, propietario
    // local, editor con el permiso y editor sin él) y esta pantalla no
    // conoce ninguno. Y aunque contestara mal, el "no" que vale lo da
    // `set_establishment_data()` (CLAUDE.md).
    supabase.rpc("client_can_edit_establishment_data", { p_establishment_id: id }),
    supabase
      .from("requests")
      .select("id, code, description, state, created_at, validated_category")
      .eq("establishment_id", id)
      .order("created_at", { ascending: false }),
    // RN-ARC-04 · el catálogo del restaurante. No hay ningún filtro de
    // visibilidad escrito aquí, y es a propósito: `files_select` llama a
    // `can_read_file()`, que al cliente solo le devuelve lo marcado
    // "Compartido con el restaurante" —y la facturación solo con
    // visibilidad financiera (RN-FIN-07)—. Filtrarlo también en la
    // pantalla sería una segunda regla que puede discrepar de la del
    // servidor, y la que ganaría el día que discrepen sería la peor.
    //
    // Las columnas van enumeradas porque `files` tiene privilegios de
    // columna para tapar la identidad del equipo: `select *` devuelve
    // 403 (CLAUDE.md).
    supabase
      .from("files")
      .select("id, name, category, created_at")
      .eq("establishment_id", id)
      // Un archivo archivado está retirado de la circulación (RN-ARC-07:
      // "se archiva, no se borra"), así que no se le ofrece al
      // restaurante. Sigue existiendo, con sus versiones, para el equipo.
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    // RN-EST-18 · la foto de su local, ya firmada. `null` si no tiene.
    loadEstablishmentPhoto(supabase, supabase.storage, id),
  ]);

  const rows = requests ?? [];
  const archivos = sharedFiles ?? [];
  // §66.3 · la conversación general del restaurante. Se crea al abrir la
  // pantalla, igual que la de una solicitud: hay exactamente una por
  // restaurante y es el destino de "Mensajes" en su menú, así que siempre
  // acaba usándose. `get_or_create_establishment_conversation()` comprueba
  // el acceso por su cuenta y devuelve error a quien no lo tenga; aquí eso
  // se traduce en no pintar el bloque, no en un permiso concedido.
  const { data: conversationId } = await supabase.rpc(
    "get_or_create_establishment_conversation",
    { p_establishment_id: id },
  );

  const conversation = conversationId ? await loadConversation(supabase, conversationId) : null;

  // RN-EST-08 · el motivo concreto, para el aviso de estado.
  const { data: statusReasonCliente } = await supabase.rpc("establishment_status_reason", {
    p_establishment_id: id,
  });

  /*
    Maqueta 13 · las condiciones de lo que tiene contratado, con su
    estado, y si quien mira puede aceptarlas (el propietario: se le
    PREGUNTA al servidor, `client_can_accept_terms()`, igual que con
    editar los datos). Un Editor las lee y ve por qué no hay botón.
  */
  const [{ data: suscripciones }, { data: canAcceptTerms }, { data: canWrite }, zonaDelEspacio] =
    await Promise.all([
      supabase
        .from("subscriptions")
        .select("id, kind")
        .eq("establishment_id", id)
        .eq("status", "active")
        .order("kind", { ascending: true }),
      supabase.rpc("client_can_accept_terms", { p_establishment_id: id }),
      // R24 · quién puede comunicar la baja es quien puede escribir en el
      // restaurante, y se le PREGUNTA al servidor en vez de deducirlo de un
      // rol leído aquí. `request_service_termination()` lo vuelve a
      // comprobar; esto solo elige entre el formulario y el motivo.
      supabase.rpc("can_write_establishment", { p_establishment_id: id }),
      // CLAUDE.md · la zona del espacio. El restaurante no puede leer
      // `spaces`, así que sale de `establishment_timezone()` (migración 83).
      loadEstablishmentTimezone(supabase, id),
    ]);
  const condiciones = await Promise.all(
    (suscripciones ?? []).map(async (s) => ({
      subscriptionId: s.id,
      terms: await loadSubscriptionTerms(supabase, s.id),
    })),
  );

  // R01 a R04 · el Inicio del panel con el diseño definitivo. Reutiliza
  // lo ya leído arriba; `loadPanelHome()` solo añade lo que le falta.
  const inicio = await loadPanelHome(supabase, {
    slug,
    establishmentId: id,
    userId: user.id,
    role,
    establishment: { name: establishment.name, code: establishment.code, city: establishment.city },
    photoUrl,
    requests: rows,
    files: archivos,
    messages: conversation?.messages ?? [],
    allowance: allowance ?? [],
    planNames: condiciones
      .map(({ terms }) => terms?.subjectName ?? null)
      .filter((nombre): nombre is string => nombre !== null && nombre.trim() !== ""),
    timeZone: zonaDelEspacio,
  });

  return (
    <div className="space-y-6">
      {/*
        Maqueta 20 y R43 · el MISMO aviso que ve el equipo, con el motivo
        concreto (RN-EST-08), arriba del todo: con el servicio detenido es
        lo primero que hay que saber. El motivo sale de
        `establishment_status_reason()`, que comprueba el acceso por su
        cuenta y le devuelve nulo a quien no lo tenga.
      */}
      <StatusNotice status={establishment.status} reason={statusReasonCliente ?? null} />

      <PanelHome data={inicio} />

      {/*
        Lo demás del panel, debajo, hasta que cada parte tenga su propia
        pantalla (partes 11 y 12 del plan de escritorio). La barra del
        panel sigue llevando aquí con sus anclas (RN-PAN-07).
      */}
      <h2 className="border-t border-border pt-6 text-[20px] font-bold text-primary-dark">
        {es.panelHome.moreTitle}
      </h2>

      {/*
        R24 · RN-EST-09 — comunicar la baja. Va al final del panel, después
        del plan y de las condiciones, porque es lo último que alguien hace
        y no lo primero que tiene que ver al entrar.
      */}
      <TerminationForm
        establishmentId={id}
        status={establishment.status}
        canWrite={canWrite === true}
      />

      <TermsCard conditions={condiciones} canAccept={canAcceptTerms === true} timeZone={zonaDelEspacio} />

      {/*
        RN-EST-11 · "el propietario puede editar contacto y datos
        fiscales". Es la otra mitad de la regla: la ficha del equipo tiene
        su formulario desde la migración 57 y el propietario del
        restaurante no tenía dónde corregir su propio teléfono.

        Se enseña según lo que ha contestado el servidor
        (`client_can_edit_establishment_data()`), no según un rol leído
        aquí. Y se ofrece con el servicio detenido igual que sin él: RN-EST-08
        impide crear solicitudes y menús, no corregir un CIF mal escrito
        —que es justo lo que hace falta poder hacer cuando el restaurante
        está parado por un impago—.

        RN-EST-12 lo dice el propio formulario, arriba: esto no cambia la
        web.
      */}
      {/*
        RN-EST-18 · la foto de su propio local, que el restaurante también
        sube (decisión 62): es su cara, no material interno del equipo.
        Misma puerta que corregir sus datos —`client_can_edit_establishment_data()`,
        contestada por el servidor— y la misma que vuelve a comprobar
        `set_establishment_photo()` por su cuenta (CLAUDE.md).
      */}
      {canEditData === true ? (
        <Card title={es.teamArea.establishments.photo}>
          <PhotoForm establishmentId={id} photoUrl={photoUrl} />
        </Card>
      ) : null}

      {canEditData === true ? (
        <Card title={es.clientArea.dataCardTitle}>
          <EstablishmentDataForm
            establishmentId={id}
            name={establishment.name}
            identity={{
              legalName: establishment.legal_name,
              taxId: establishment.tax_id,
              address: establishment.address,
              postalCode: establishment.postal_code,
              city: establishment.city,
              contactName: establishment.contact_name,
              contactEmail: establishment.contact_email,
              phonePrimary: establishment.phone_primary,
              phoneSecondary: establishment.phone_secondary,
              websiteUrl: establishment.website_url,
              instagram: establishment.instagram,
              facebookUrl: establishment.facebook_url,
              domain: establishment.domain,
              openingHours: establishment.opening_hours,
              webPlatform: establishment.web_platform,
            }}
          />
        </Card>
      ) : null}


      {/*
        Fase 3 · Hito 14 · los datos del restaurante y la autorización de
        sus fuentes son dos pantallas propias (vistas 22 y 25.03), no dos
        bloques de su inicio. Desde aquí solo se llega a ellas.
      */}
      <Card title={es.clientArea.dataCardTitle}>
        <p className="mb-3 text-sm text-text-secondary">{es.clientArea.dataCardHint}</p>
        <p className="flex flex-wrap gap-4 text-sm">
          <Link href={`/espacios/${slug}/restaurantes/${id}/datos`} className="text-cuotly-green underline">
            {es.clientArea.dataLink}
          </Link>
          <Link href={`/espacios/${slug}/restaurantes/${id}/fuentes`} className="text-cuotly-green underline">
            {es.clientArea.sourcesLink}
          </Link>
          {/*
            Páginas 152 y 153 del diseño móvil · "Usuarios y accesos"
            (RN-EST-15/16/17). El enlace se enseña a todo el que entra en
            el panel: la pantalla se LEE sin "Usuarios y accesos" —ver
            quién más entra en tu restaurante no es gestionarlo— y quien
            no pueda cambiar nada no verá los botones. Esconder el enlace
            tampoco sería un control: la barrera está en
            `establishment_panel_users()` y en las tres funciones que
            escriben (CLAUDE.md).
          */}
          <Link
            href={`/espacios/${slug}/restaurantes/${id}/usuarios`}
            className="text-cuotly-green underline"
          >
            {es.panelUsers.title}
          </Link>
          {/*
            RN-INT-10 (migración 117) · las reseñas de Google. El enlace
            se enseña siempre, también cuando el plan no las vigila: la
            pantalla dice cuál es el motivo, y esconder el enlace dejaría
            al restaurante sin saber que eso existe. Quien no pueda leer
            el restaurante no ve ni una fila — lo decide la RLS de
            `reviews`, no este enlace (CLAUDE.md).
          */}
          <Link
            href={`/espacios/${slug}/restaurantes/${id}/resenas`}
            className="text-cuotly-green underline"
          >
            {es.reviewsPage.title}
          </Link>
        </p>
      </Card>

      {/* R05 y R06 · las solicitudes y la nueva solicitud son ya pantallas
          propias (`PANEL_ROUTES`); desde el Inicio se llega a ellas. */}

      {/*
        RN-ARC-04, el otro extremo del botón "Compartir con el
        restaurante" de la ficha del equipo: hasta ahora se podía marcar
        un archivo como compartido y el restaurante no tenía **dónde
        verlo** — su pantalla no enseñaba archivos por ninguna parte.

        Aquí está lo que puede ver, que no lo decide esta pantalla: la
        consulta no lleva ni un filtro de visibilidad, y lo que llega es
        lo que `can_read_file()` deja pasar.
      */}
      <Card title={es.clientArea.filesTitle}>
        {archivos.length === 0 ? (
          <EmptyState
            title={es.clientArea.filesEmptyTitle}
            description={es.clientArea.filesEmptyReason}
          />
        ) : (
          <>
            <p className="mb-3 text-sm text-text-secondary">{es.clientArea.filesHint}</p>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>{es.clientArea.filesNameColumn}</TableHeaderCell>
                  <TableHeaderCell>{es.clientArea.filesCategoryColumn}</TableHeaderCell>
                  <TableHeaderCell>{es.clientArea.filesDateColumn}</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {archivos.map((file) => (
                  <TableRow key={file.id}>
                    <TableCell>
                      {/*
                        RN-ARC-08 · el enlace no es al objeto del bucket,
                        que es privado, sino a la ruta que comprueba
                        `can_read_file()` con la sesión de quien pulsa y
                        firma una URL de cinco minutos. Sin `?version=`
                        sirve la vigente, que es la que quiere quien
                        descarga desde una lista.
                      */}
                      <a href={`/api/archivos/${file.id}`} className="text-cuotly-green underline">
                        {file.name}
                      </a>
                    </TableCell>
                    <TableCell>
                      {es.space.files.categories[file.category as FileCategoryKey] ?? file.category}
                    </TableCell>
                    <TableCell>
                      {enZona(file.created_at, zonaDelEspacio, { dateStyle: "short" })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </Card>

      {/*
        §66.3 · la conversación general del restaurante: lo que todavía no
        es una solicitud. Es a donde lleva "Mensajes" en el menú del
        restaurante (src/components/shell/navigation.ts), que hasta ahora
        traía aquí y aquí no había ninguna conversación.

        Quién puede escribir lo decide `post_message()`, que pasa por
        `can_write_conversation()`: el rol Consulta lee y no responde
        (RN-MSG-05). Esta pantalla no lo comprueba — si lo hiciera, sería
        una segunda regla que podría discrepar de la del servidor.
      */}
      {/* RN-PAN-07 · el ancla de "Mensajes" de la barra del panel. */}
      <section id="mensajes" className="scroll-mt-20">
        {conversationId && conversation ? (
          <Conversation
            timeZone={zonaDelEspacio}
            conversationId={conversationId}
            establishmentId={id}
            messages={conversation.messages}
            readOnly={conversation.readOnly}
            title={es.clientArea.establishmentConversationTitle}
            notice={es.clientArea.establishmentConversationHint}
            emptyTitle={es.clientArea.establishmentConversationEmptyTitle}
            emptyReason={es.clientArea.establishmentConversationEmptyReason}
          />
        ) : null}
      </section>

      {/*
        §68 · RN-MSG-10 · "Convertir en solicitud". Cuelga de la
        conversación general porque es de ella de la que sale: elegir los
        mensajes relevantes pasa a su propia pantalla, y lo que se crea es
        un BORRADOR que hay que revisar antes de enviarlo.

        Se ofrece con el servicio detenido igual que sin él: lo que decide
        es el servidor, y aquí no hay nada que ocultar — convertir no
        envía nada ni arranca ningún contador.
      */}
      {conversationId ? (
        <p>
          <Link
            href={`/espacios/${slug}/restaurantes/${id}/convertir`}
            className="text-cuotly-green underline"
          >
            {es.clientArea.convertLink}
          </Link>
        </p>
      ) : null}

      {/*
        §141 · RN-CIC-11 · "Propietario de restaurante exporta grupo o
        establecimientos propios". Se ofrece aquí porque es donde el
        restaurante está mirando lo suyo.

        Quién puede lo decide `can_export_scope()` en el servidor —solo el
        propietario local o el global del grupo; Editor y Consulta no—, y
        qué se lleva lo deciden su RLS y sus privilegios de columna: la
        identidad del equipo no sale, ni aquí ni en el archivo (P7).
      */}
      <Card title={es.spaceExport.clientTitle}>
        <p className="mb-4 text-sm text-text-secondary">{es.spaceExport.clientHint}</p>
        <ExportForm
          spaceId={establishment.space_id}
          scope="establishment"
          establishmentId={id}
          label={es.spaceExport.submit}
        />
      </Card>
    </div>
  );
}
