import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { InfoNote } from "@/components/panel/RequestPieces";
import { ButtonLink, Card, EmptyState, PageHeader, Tabs } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { loadEstablishmentTimezone } from "../timezone-load";
import { UploadFileCard } from "./UploadFileCard";

/**
 * R28 y R42 · los archivos del restaurante: carpetas, cuadrícula y, a la
 * derecha, el elegido con su vista previa y sus versiones (RN-ARC-03).
 *
 * Qué archivos llegan no lo decide la pantalla: `files_select` llama a
 * `can_read_file()`, que al restaurante solo le deja ver lo compartido con
 * él y lo que sube él (y la facturación solo con visibilidad financiera,
 * RN-FIN-07). Las columnas se enumeran: `files` y `file_versions` tienen
 * privilegios de columna para tapar la identidad del equipo (CLAUDE.md),
 * y por eso no hay "Subido por".
 *
 * Toda imagen y toda descarga pasa por `/api/archivos/<id>`, que comprueba
 * el permiso con la sesión de quien pide y firma una URL de minutos
 * (RN-ARC-08): no hay ninguna URL permanente.
 *
 * No hay "Marcar como principal": usar una foto en la web es un cambio, y
 * se pide como una solicitud (se dice y se enlaza).
 */
export const dynamic = "force-dynamic";

const t = es.panelFiles;
type CategoryKey = keyof typeof es.space.files.categories;

function tamano(bytes: number): string {
  return bytes >= 1024 * 1024 ? t.mb(bytes / (1024 * 1024)) : t.kb(Math.max(1, Math.round(bytes / 1024)));
}

export default async function ClientFilesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, id } = await params;
  const { carpeta, archivo } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: establishment }, { data: files }, zona, { data: puedeSubir }] = await Promise.all([
    supabase.from("establishments").select("id").eq("id", id).maybeSingle(),
    supabase
      .from("files")
      .select("id, name, category, created_at")
      .eq("establishment_id", id)
      // RN-ARC-07 · archivado es retirado de la circulación, no borrado.
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    loadEstablishmentTimezone(supabase, id),
    // RN-EST-15 · el permiso "Subir archivos", contestado por el servidor.
    supabase.rpc("can_write_file", { p_establishment_id: id, p_category: "photos" }),
  ]);
  if (!establishment) notFound();

  const lista = files ?? [];
  const ids = lista.map((f) => f.id);
  const { data: versiones } = ids.length
    ? await supabase
        .from("file_versions")
        .select("id, file_id, version_number, file_name, mime_type, size_bytes, created_at")
        .in("file_id", ids)
        .order("version_number", { ascending: false })
    : { data: [] };
  const versionesDe = new Map<string, NonNullable<typeof versiones>>();
  for (const v of versiones ?? []) versionesDe.set(v.file_id, [...(versionesDe.get(v.file_id) ?? []), v]);

  const carpetas = [...new Set(lista.map((f) => f.category))];
  const activa = typeof carpeta === "string" && carpetas.includes(carpeta) ? carpeta : "todos";
  const enCarpeta = activa === "todos" ? lista : lista.filter((f) => f.category === activa);
  const elegido = lista.find((f) => f.id === archivo) ?? enCarpeta[0] ?? null;
  const vigente = elegido ? (versionesDe.get(elegido.id)?.[0] ?? null) : null;

  const base = `/espacios/${slug}/restaurantes/${id}`;
  const aqui = `${base}/archivos`;
  const enlace = (c: string, a?: string) => {
    const q = new URLSearchParams();
    if (c !== "todos") q.set("carpeta", c);
    if (a) q.set("archivo", a);
    const s = q.toString();
    return `${aqui}${s ? `?${s}` : ""}`;
  };
  const fecha = (iso: string) => enZona(iso, zona, { day: "numeric", month: "short", year: "numeric" });
  const fechaHora = (iso: string) =>
    enZona(iso, zona, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const nombreCarpeta = (c: string) => es.space.files.categories[c as CategoryKey] ?? c;
  const esImagen = (fileId: string) => (versionesDe.get(fileId)?.[0]?.mime_type ?? "").startsWith("image/");

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} subtitle={t.subtitle} />

      {lista.length > 0 ? (
        <Tabs
          label={t.tabsLabel}
          active={activa}
          tabs={[
            { key: "todos", label: t.all, href: enlace("todos"), count: lista.length, countTone: "neutral" },
            ...carpetas.map((c) => ({
              key: c,
              label: nombreCarpeta(c),
              href: enlace(c),
              count: lista.filter((f) => f.category === c).length,
              countTone: "neutral" as const,
            })),
          ]}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {lista.length === 0 ? (
            <Card>
              <EmptyState title={t.emptyTitle} description={t.emptyReason} />
            </Card>
          ) : enCarpeta.length === 0 ? (
            <Card>
              <p className="text-sm text-text-secondary">{t.folderEmpty}</p>
            </Card>
          ) : (
            <Card>
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {enCarpeta.map((f) => {
                  const activo = f.id === elegido?.id;
                  return (
                    <li key={f.id}>
                      <Link
                        href={enlace(activa, f.id)}
                        aria-current={activo ? "true" : undefined}
                        className={`block rounded-[10px] border-2 p-2 hover:bg-soft-surface ${
                          activo ? "border-cuotly-green" : "border-transparent"
                        }`}
                      >
                        <span className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-soft-surface">
                          {esImagen(f.id) ? (
                            // eslint-disable-next-line @next/next/no-img-element -- la ruta firma una URL de minutos (RN-ARC-08); next/image la cachearía.
                            <img src={`/api/archivos/${f.id}`} alt="" className="h-full w-full object-cover" loading="lazy" />
                          ) : (
                            <Icon name="document" className="h-10 w-10 text-text-secondary" />
                          )}
                        </span>
                        <span className="mt-2 block truncate text-sm font-semibold text-text">{f.name}</span>
                        <span className="block text-xs text-text-secondary">
                          {nombreCarpeta(f.category)} · {fecha(f.created_at)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          {puedeSubir === true ? <UploadFileCard establishmentId={id} initialCategory={activa} /> : null}
        </div>

        <Card title={t.detailTitle}>
          {elegido === null ? (
            <p className="text-sm text-text-secondary">{t.detailEmpty}</p>
          ) : (
            <div className="space-y-4">
              <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-soft-surface">
                {esImagen(elegido.id) ? (
                  // eslint-disable-next-line @next/next/no-img-element -- la ruta firma una URL de minutos (RN-ARC-08).
                  <img src={`/api/archivos/${elegido.id}`} alt={t.preview} className="h-full w-full object-contain" />
                ) : (
                  <p className="p-4 text-center text-sm text-text-secondary">{t.noPreview}</p>
                )}
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-text-secondary">{t.name}</dt>
                <dd className="truncate text-text">{vigente?.file_name ?? elegido.name}</dd>
                {vigente ? (
                  <>
                    <dt className="text-text-secondary">{t.size}</dt>
                    <dd className="text-text">{tamano(vigente.size_bytes)}</dd>
                  </>
                ) : null}
                <dt className="text-text-secondary">{t.date}</dt>
                <dd className="text-text">{fechaHora(elegido.created_at)}</dd>
                <dt className="text-text-secondary">{t.folder}</dt>
                <dd className="text-text">{nombreCarpeta(elegido.category)}</dd>
              </dl>
              <a
                href={`/api/archivos/${elegido.id}`}
                className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] border border-cuotly-green bg-surface px-4 py-2.5 text-sm font-semibold text-cuotly-green hover:bg-cuotly-green/10"
              >
                <Icon name="download" className="h-4 w-4" />
                {t.download}
              </a>

              <div>
                <p className="mb-2 font-semibold text-text">{t.versionsTitle}</p>
                <ul className="space-y-2">
                  {(versionesDe.get(elegido.id) ?? []).map((v, i) => (
                    <li
                      key={v.id}
                      className={`flex items-center gap-3 rounded-[10px] border p-3 text-sm ${
                        i === 0 ? "border-cuotly-green bg-cuotly-green/10" : "border-border"
                      }`}
                    >
                      <span className="font-semibold text-text">
                        {t.versionLabel(v.version_number)}
                        {i === 0 ? ` (${t.current})` : ""}
                      </span>
                      <span className="flex-1 text-text-secondary">
                        {fechaHora(v.created_at)} · {tamano(v.size_bytes)}
                      </span>
                      <a
                        href={`/api/archivos/${elegido.id}?version=${v.version_number}`}
                        aria-label={t.downloadVersion}
                        className="text-text-secondary hover:text-cuotly-green"
                      >
                        <Icon name="download" className="h-4 w-4" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              <InfoNote title={t.useInRequest}>
                <p>{t.useInRequestHint}</p>
                <div className="mt-2">
                  <ButtonLink href={`${base}/solicitudes/nueva`} variant="outline" size="sm" icon="plus">
                    {es.panelRequests.newRequest}
                  </ButtonLink>
                </div>
              </InfoNote>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
