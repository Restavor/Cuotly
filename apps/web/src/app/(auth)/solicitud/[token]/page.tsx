import { BigLink, StateCard } from "@/components/access/AccessPieces";
import { AccessShell } from "@/components/access/AccessShell";
import { createClient } from "@/lib/supabase/server";
import { es } from "@/i18n/es";
import { FollowUpView } from "./FollowUpView";

/**
 * RN-ACC-12 · el seguimiento de quien todavía **no tiene cuenta**, con el
 * diseño de A01 a A04.
 *
 * Es el único sitio del producto donde alguien consulta algo sin sesión, y
 * por eso la barrera es la clave del enlace: `access_request_follow_up()`
 * filtra por ella y no acepta un identificador de solicitud, así que no se
 * puede pasear por las solicitudes de otros cambiando un número.
 *
 * RN-ACC-07 · aquí no sale nunca quién la revisó. Ni el nombre, ni la
 * inicial: el estado, el mensaje y el motivo.
 *
 * **"Datos de tu solicitud" enseña dos datos y no cinco.** El diseño pinta
 * también el teléfono, el correo y los comentarios, pero la función del
 * seguimiento solo devuelve el nombre y el negocio: un enlace con clave se
 * reenvía y se pega en sitios, y con él no se regalan el teléfono ni el
 * correo de nadie. Se pinta lo que hay; no se rellena lo que falta.
 *
 * Los botones "Ver solicitud" y "Contactar con Cuotly" del diseño no
 * están: el primero trae aquí mismo, y el segundo no tiene todavía una
 * dirección de contacto decidida a la que llevar.
 */
export default async function SeguimientoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .rpc("access_request_follow_up", { p_token: token })
    .maybeSingle();

  const t = es.auth.access;

  if (!data) {
    return (
      <AccessShell crumb={t.crumbLink}>
        <StateCard
          illustration="document"
          badge="xCircle"
          title={es.auth.followUp.notFound}
          body={es.auth.followUp.notFoundBody}
        >
          <BigLink href="/signup">{t.title}</BigLink>
        </StateCard>
      </AccessShell>
    );
  }

  return (
    <AccessShell crumb={t.crumbAccess}>
      <FollowUpView token={token} data={data} />
    </AccessShell>
  );
}
