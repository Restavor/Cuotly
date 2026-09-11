import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  Card,
  EmptyState,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { todayInTimeZone } from "@/core/finance";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { Conversation } from "@/components/conversation/Conversation";
import { loadConversation } from "@/components/conversation/load";

import { EstablishmentDataForm } from "@/components/establishment/DataForm";
import { EstablishmentSheet } from "@/components/establishment/Sheet";
import { parseManagementBlock, parseSheetTab } from "@/components/establishment/tabs";
import { resolveShellViewer } from "@/components/shell/viewer";

import { AcceptRequestButton } from "./AcceptRequestButton";
import { NewRequestForm } from "./NewRequestForm";
import {
  loadSheetCounts,
  loadSheetFiles,
  loadSheetHeader,
  loadSheetHistory,
  loadSheetOperation,
  loadSheetPayments,
  loadSheetSummary,
  loadSheetUsers,
} from "./sheet-load";

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

const SERVICE_STOPPED = ["paused", "suspended", "read_only", "archived"];

type StatusKey = keyof typeof es.space.statuses;
type RequestStateKey = keyof typeof es.naming.states.request;
type CategoryKey = keyof typeof es.naming.categories;
type FileCategoryKey = keyof typeof es.space.files.categories;

function toneForState(state: string): "success" | "warning" | "info" | "neutral" | "danger" {
  if (state === "published" || state === "closed" || state === "accepted") return "success";
  if (state === "pending_client_acceptance" || state === "needs_information") return "warning";
  if (state.startsWith("cancelled") || state === "rejected") return "danger";
  if (state === "in_progress" || state === "in_correction") return "info";
  return "neutral";
}

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

  if (role !== "client") {
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
    const [summary, operation, counts, payments, users, files, history] = await Promise.all([
      loadSheetSummary(supabase, space.id, slug, id),
      loadSheetOperation(supabase, slug, id),
      loadSheetCounts(supabase, id),
      loadSheetPayments(supabase, id),
      loadSheetUsers(supabase, id),
      loadSheetFiles(supabase, id, soloUno(query.archivo), soloUno(query.tipo)),
      loadSheetHistory(supabase, slug, id),
    ]);

    return (
      <EstablishmentSheet
        base={base}
        slug={slug}
        tab={parseSheetTab(soloUno(query.vista))}
        block={parseManagementBlock(soloUno(query.bloque))}
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
          summary,
          operation,
          counts,
          payments,
          today: hoy,
          users,
          files,
          history,
        }}
      />
    );
  }

  const { data: establishment } = await supabase
    .from("establishments")
    // Las columnas de §15.2 vienen aquí porque RN-EST-11 le deja editarlas
    // a él: el propietario de un restaurante corrige su propia razón
    // social y su propio teléfono. Enumeradas, como en todo el proyecto.
    .select(
      "id, name, code, status, legal_name, tax_id, address, postal_code, city, contact_name, contact_email, phone_primary, phone_secondary, website_url, instagram, facebook_url, domain, opening_hours, web_platform",
    )
    .eq("id", id)
    .maybeSingle();

  if (!establishment) {
    notFound();
  }

  const [{ data: allowance }, { data: canEditData }, { data: requests }, { data: sharedFiles }] =
    await Promise.all([
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
  ]);

  const rows = requests ?? [];
  const archivos = sharedFiles ?? [];
  const pending = rows.filter((r) => r.state === "pending_client_acceptance");
  const serviceStopped = SERVICE_STOPPED.includes(establishment.status);
  const statusKey = establishment.status as StatusKey;

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

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <header>
        <p className="text-sm text-text-secondary">{establishment.code}</p>
        <h1 className="text-2xl font-bold text-primary-dark">{establishment.name}</h1>
        <p className="mt-2 flex items-center gap-2 text-sm text-text-secondary">
          {es.clientArea.statusLabel}:{" "}
          <StatusBadge tone={serviceStopped ? "warning" : "success"}>
            {es.space.statuses[statusKey] ?? establishment.status}
          </StatusBadge>
        </p>
        <p className="mt-3 text-sm">
          <Link
            href={`/espacios/${slug}/restaurantes/${id}/facturacion`}
            className="text-cuotly-green underline"
          >
            {es.clientArea.billingLink}
          </Link>
        </p>
      </header>

      {serviceStopped ? (
        <Card title={es.clientArea.serviceStoppedTitle}>
          <p className="text-sm text-text-secondary">{es.clientArea.serviceStoppedReason}</p>
        </Card>
      ) : null}

      {pending.length > 0 ? (
        <Card title={es.clientArea.acceptTitle}>
          <div className="space-y-4">
            {pending.map((request) => (
              <div key={request.id} className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-text">{request.description}</p>
                  {request.validated_category ? (
                    <p className="text-sm text-text-secondary">
                      {es.clientArea.acceptCategory(
                        es.naming.categories[request.validated_category as CategoryKey] ??
                          request.validated_category,
                      )}
                    </p>
                  ) : null}
                </div>
                <AcceptRequestButton requestId={request.id} />
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card title={es.clientArea.allowanceTitle}>
        {allowance && allowance.length > 0 ? (
          <>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {allowance.map((line) => (
                <li key={line.category} className="rounded-lg bg-soft-surface p-3">
                  <p className="text-xs text-text-secondary">
                    {es.naming.categories[line.category as CategoryKey] ?? line.category}
                  </p>
                  <p className="text-lg font-semibold text-primary-dark">
                    {line.remaining}{" "}
                    <span className="text-sm font-normal text-text-secondary">
                      {es.clientArea.allowanceOf(line.included)}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-text-secondary">
              {es.clientArea.allowanceRenews(
                new Intl.DateTimeFormat("es-ES", { dateStyle: "long" }).format(
                  new Date(allowance[0].renews_at),
                ),
              )}
            </p>
          </>
        ) : (
          <EmptyState
            title={es.clientArea.allowanceEmptyTitle}
            description={es.clientArea.allowanceEmptyReason}
          />
        )}
      </Card>

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
      {canEditData === true ? (
        <Card title={es.clientArea.dataTitle}>
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

      {serviceStopped ? null : <NewRequestForm establishmentId={id} />}

      <Card title={es.clientArea.requestsTitle}>
        {rows.length === 0 ? (
          <EmptyState
            title={es.clientArea.requestsEmptyTitle}
            description={es.clientArea.requestsEmptyReason}
          />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{es.clientArea.codeColumn}</TableHeaderCell>
                <TableHeaderCell>{es.clientArea.descriptionColumn}</TableHeaderCell>
                <TableHeaderCell>{es.clientArea.stateColumn}</TableHeaderCell>
                <TableHeaderCell>{es.clientArea.dateColumn}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((request) => (
                <TableRow key={request.id}>
                  <TableCell>
                    <Link
                      href={`/espacios/${slug}/restaurantes/${id}/solicitudes/${request.id}`}
                      className="text-cuotly-green underline"
                    >
                      {request.code}
                    </Link>
                  </TableCell>
                  <TableCell>{request.description}</TableCell>
                  <TableCell>
                    <StatusBadge tone={toneForState(request.state)}>
                      {es.naming.states.request[request.state as RequestStateKey] ?? request.state}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    {new Intl.DateTimeFormat("es-ES", { dateStyle: "short" }).format(
                      new Date(request.created_at),
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

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
                      {new Intl.DateTimeFormat("es-ES", { dateStyle: "short" }).format(
                        new Date(file.created_at),
                      )}
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
      {conversationId && conversation ? (
        <Conversation
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
    </div>
  );
}
