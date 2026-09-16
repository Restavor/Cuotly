import Link from "next/link";
import { Logo } from "@/components/Logo";
import { createClient } from "@/lib/supabase/server";
import { es } from "@/i18n/es";
import { ReplyForm } from "./ReplyForm";

/**
 * RN-ACC-12 · el seguimiento de quien todavía **no tiene cuenta**.
 *
 * Es el único sitio del producto donde alguien consulta algo sin sesión, y
 * por eso la barrera es la clave del enlace: `access_request_follow_up()`
 * filtra por ella y no acepta un identificador de solicitud, así que no se
 * puede pasear por las solicitudes de otros cambiando un número.
 *
 * RN-ACC-07 · aquí no sale nunca quién la revisó. Ni el nombre, ni la
 * inicial: el estado, el mensaje y el motivo.
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

  const t = es.auth.followUp;

  if (!data) {
    return (
      <div>
        <Logo />
        <h1 className="mb-1.5 text-2xl font-bold text-primary-dark">{t.notFound}</h1>
        <p className="mb-7 text-sm text-text-secondary">{t.notFoundBody}</p>
        <Link
          href="/signup"
          className="block w-full rounded-[10px] bg-primary px-4 py-2.5 text-center text-[15px] font-semibold text-white"
        >
          {es.auth.signup.submit}
        </Link>
      </div>
    );
  }

  const estado = data.status as keyof typeof t.states;
  const cuerpo =
    estado === "submitted"
      ? t.submittedBody
      : estado === "needs_information"
        ? t.needsInformationBody
        : estado === "approved"
          ? t.approvedBody
          : t.rejectedBody;

  const fecha = (valor: string | null) =>
    valor ? new Date(valor).toLocaleDateString("es-ES") : null;

  return (
    <div>
      <Logo />

      <h1 className="mb-1.5 text-2xl font-bold text-primary-dark">{t.title}</h1>
      <p className="mb-5 text-sm text-text-secondary">{data.business_name}</p>

      <dl className="mb-5 space-y-1.5 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-text-secondary">{t.statusLabel}</dt>
          <dd className="font-semibold text-text">{t.states[estado]}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-text-secondary">{t.sentOn}</dt>
          <dd className="text-text">{fecha(data.created_at)}</dd>
        </div>
        {data.decided_at ? (
          <div className="flex justify-between gap-4">
            <dt className="text-text-secondary">{t.decidedOn}</dt>
            <dd className="text-text">{fecha(data.decided_at)}</dd>
          </div>
        ) : null}
      </dl>

      <p className="mb-3 text-sm text-text">{cuerpo}</p>

      {data.status_reason ? (
        <p className="mb-5 rounded-lg bg-surface-muted px-3 py-2.5 text-sm text-text">
          {data.status_reason}
        </p>
      ) : null}

      {data.applicant_reply ? (
        <div className="mb-5">
          <p className="mb-1.5 text-sm font-semibold text-text">{t.yourReply}</p>
          <p className="rounded-lg bg-surface-muted px-3 py-2.5 text-sm text-text">
            {data.applicant_reply}
          </p>
        </div>
      ) : null}

      {data.can_reply ? <ReplyForm token={token} /> : null}
    </div>
  );
}
