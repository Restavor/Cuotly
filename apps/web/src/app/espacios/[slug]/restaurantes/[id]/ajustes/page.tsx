import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EstablishmentDataForm } from "@/components/establishment/DataForm";
import { MoveToGroupForm } from "@/components/establishment/GroupForms";
import { PhotoForm } from "@/components/establishment/PhotoForm";
import { InfoNote } from "@/components/panel/RequestPieces";
import { SettingsTabs } from "@/components/panel/SettingsTabs";
import { ButtonLink, Card, EmptyState } from "@/components/ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { loadEstablishmentPhoto } from "@/services/establishment-photo";

import { loadEstablishmentTimezone } from "../timezone-load";

/**
 * R38 y R39 · "Ajustes y ayuda": los datos del restaurante y las
 * notificaciones y la seguridad. Ayuda (R40) y Fuentes de datos (R44) son
 * las pantallas de siempre con la misma barra de pestañas.
 *
 * Datos: el formulario de RN-EST-11 y la foto de RN-EST-18, los mismos que
 * había en el Inicio. Quién puede cambiarlos se le PREGUNTA al servidor
 * (`client_can_edit_establishment_data()`) y lo vuelve a comprobar
 * `set_establishment_data()`; a quien no, se le dice por qué.
 *
 * Notificaciones y seguridad son de la cuenta personal, no del
 * restaurante: se llevan a "Mi cuenta", donde existen. No hay "Cambiar
 * contraseña" (la aplicación no lo tiene) ni una zona horaria por usuario
 * (la fija el espacio, CLAUDE.md): se dice cuál es.
 *
 * RN-EST-20 · "Cambiar de grupo", para el propietario del restaurante que
 * también es propietario de otro grupo del espacio. Solo se pinta si
 * `establishment_move_targets()` le devuelve algún grupo; quien decide es
 * `move_establishment_to_group()`, que lo vuelve a comprobar.
 */
export const dynamic = "force-dynamic";

const t = es.panelSettings;

export default async function ClientSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, id } = await params;
  const { tab } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: establishment }, { data: canEditData }, photoUrl, zona, { data: destinos }] =
    await Promise.all([
    supabase
      .from("establishments")
      .select(
        "id, name, legal_name, tax_id, address, postal_code, city, contact_name, contact_email, phone_primary, phone_secondary, website_url, instagram, facebook_url, domain, opening_hours, web_platform",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.rpc("client_can_edit_establishment_data", { p_establishment_id: id }),
    loadEstablishmentPhoto(supabase, supabase.storage, id),
    loadEstablishmentTimezone(supabase, id),
    supabase.rpc("establishment_move_targets", { p_establishment_id: id }),
  ]);
  const gruposDestino = destinos ?? [];
  if (!establishment) notFound();

  const base = `/espacios/${slug}/restaurantes/${id}`;
  const activa = tab === "notificaciones" ? "notificaciones" : "datos";

  const enlace = (href: string, icono: IconName, titulo: string, cuerpo: string) => (
    <Link href={href} className="flex items-center gap-4 rounded-[10px] border border-border p-4 hover:bg-soft-surface">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-soft-surface text-cuotly-green">
        <Icon name={icono} className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-text">{titulo}</span>
        <span className="block text-sm text-text-secondary">{cuerpo}</span>
      </span>
      <Icon name="chevronRight" className="h-4 w-4 text-text-secondary" />
    </Link>
  );

  return (
    <div className="space-y-6">
      <SettingsTabs base={base} active={activa} />

      {activa === "datos" ? (
        canEditData === true ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card title={t.dataTitle}>
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
            <div className="space-y-6">
              <Card title={t.photoTitle}>
                <PhotoForm establishmentId={id} photoUrl={photoUrl} />
              </Card>
              <InfoNote title={t.notOnWebTitle}>
                <p>{t.notOnWebBody}</p>
                <div className="mt-2">
                  <ButtonLink href={`${base}/solicitudes/nueva`} variant="outline" size="sm" icon="plus">
                    {t.newRequest}
                  </ButtonLink>
                </div>
              </InfoNote>
            </div>
          </div>
        ) : (
          <Card>
            <EmptyState title={t.noEditTitle} description={t.noEditReason} />
          </Card>
        )
      ) : null}

      {activa === "datos" && gruposDestino.length > 0 ? (
        <div className="max-w-2xl">
          <Card title={es.teamArea.groups.moveTitle}>
            <p className="mb-4 text-sm text-text-secondary">{es.teamArea.groups.moveHint}</p>
            <MoveToGroupForm establishmentId={id} targets={gruposDestino} />
          </Card>
        </div>
      ) : null}

      {activa !== "datos" ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <Card title={t.notificationsTitle}>
              <p className="mb-4 text-sm text-text-secondary">{t.notificationsBody}</p>
              {enlace("/cuenta", "bell", t.notificationsLink, t.notificationsBody)}
            </Card>
            <Card title={t.timezoneTitle}>
              <p className="text-sm text-text-secondary">{t.timezoneBody(zona)}</p>
            </Card>
          </div>
          <Card title={t.securityTitle}>
            <p className="mb-4 text-sm text-text-secondary">{t.securityBody}</p>
            <div className="space-y-3">
              {enlace("/cuenta/seguridad", "lock", t.password, t.passwordBody)}
              {enlace("/cuenta/sesiones", "person", t.sessions, t.sessionsBody)}
            </div>
            <div className="mt-4">
              <InfoNote title={t.securityTitle}>{t.personalOnly}</InfoNote>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
