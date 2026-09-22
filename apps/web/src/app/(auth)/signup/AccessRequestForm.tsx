"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useActionState, useCallback, useEffect, useId, useState } from "react";

import {
  AccessCard,
  AccessPill,
  RequestData,
  StatusBox,
  StatusHero,
} from "@/components/access/AccessPieces";
import { Icon, type IconName } from "@/components/ui/Icon";
import { normalizeTaxId } from "@/core/access-requests";
import { es } from "@/i18n/es";
import { requestAccess } from "../actions";
import {
  accessRequestInitialState,
  type AccessRequestFormState,
  type AccessRequestValues,
} from "../form-states";

/**
 * F01 · el formulario público de solicitud de acceso (PRD §37, RN-ACC-02),
 * con el diseño definitivo: a la izquierda los seis campos —el DNI, CIF o
 * NIF lo añadió la decisión 67 y no está en el dibujo—, a la derecha
 * "¿Qué ocurre después?". Y sus cinco estados de pantalla:
 *
 *   · A09 · cada campo mal rellenado se marca en rojo con su frase debajo,
 *     todos a la vez, y junto al botón "Revisa los campos indicados".
 *   · A10 · si el envío falla, un aviso arriba y el botón "Reintentar
 *     envío". Lo escrito sigue ahí: vuelve en la respuesta de la acción y
 *     se repone, porque React 19 vacía el formulario después de enviar.
 *   · A11 · salir con cambios sin enviar abre "Tienes cambios sin enviar"
 *     con "Seguir editando" y "Salir sin enviar". Para los enlaces de la
 *     propia página; cerrar la pestaña lo pregunta el navegador, que no
 *     deja pintar un aviso propio.
 *   · A12 · sin conexión, un aviso arriba, el botón de enviar apagado y
 *     "Comprobar conexión".
 *   · A01 · al terminar, "Hemos recibido tu solicitud" con lo que la
 *     persona escribió. **Siempre lo mismo** (RN-ACC-12): nunca "ese
 *     correo ya tiene cuenta", que convertiría esto en un oráculo.
 */
export function AccessRequestForm() {
  const [state, formAction, pending] = useActionState<AccessRequestFormState, FormData>(
    requestAccess,
    accessRequestInitialState,
  );
  const [tocado, setTocado] = useState(false);
  const [enLinea, setEnLinea] = useState(true);
  const [salirA, setSalirA] = useState<string | null>(null);
  const router = useRouter();
  const t = es.auth.access;

  const pendienteDeEnviar = tocado && !state.done;

  // A12 · el navegador sabe si hay red y avisa cuando cambia.
  useEffect(() => {
    const leer = () => setEnLinea(navigator.onLine);
    leer();
    window.addEventListener("online", leer);
    window.addEventListener("offline", leer);
    return () => {
      window.removeEventListener("online", leer);
      window.removeEventListener("offline", leer);
    };
  }, []);

  // A11 · cerrar la pestaña o recargar con algo escrito: lo pregunta el navegador.
  useEffect(() => {
    if (!pendienteDeEnviar) return;
    const avisar = (evento: BeforeUnloadEvent) => evento.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [pendienteDeEnviar]);

  // A11 · y un enlace de la propia página (la marca, la miga de pan,
  // "Iniciar sesión"): se detiene y se pregunta con el aviso del diseño.
  useEffect(() => {
    if (!pendienteDeEnviar) return;
    const interceptar = (evento: MouseEvent) => {
      if (evento.defaultPrevented || evento.button !== 0) return;
      if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;
      const enlace = (evento.target as Element | null)?.closest?.("a[href]");
      if (!(enlace instanceof HTMLAnchorElement) || enlace.target === "_blank") return;
      const destino = new URL(enlace.href, window.location.href);
      if (destino.origin !== window.location.origin) return;
      evento.preventDefault();
      setSalirA(destino.pathname + destino.search + destino.hash);
    };
    document.addEventListener("click", interceptar, true);
    return () => document.removeEventListener("click", interceptar, true);
  }, [pendienteDeEnviar]);

  const cerrarAviso = useCallback(() => setSalirA(null), []);

  if (state.done) return <Received values={state.values} />;

  const problemas = state.problems;
  const fallo = state.error !== null && state.fields.length === 0;
  const mensaje = (campo: keyof typeof problemas): string | undefined => {
    const problema = problemas[campo];
    if (problema === undefined) return undefined;
    if (campo === "email") {
      return problema === "invalid" ? t.fieldErrors.emailInvalid : t.fieldErrors.emailMissing;
    }
    return t.fieldErrors[campo];
  };

  return (
    <AccessCard>
      {/* A12 · sin conexión. Va antes que el fallo: explica por qué fallaría. */}
      {!enLinea ? (
        <Banner tone="warning" icon="warning">
          {t.offline}
        </Banner>
      ) : fallo ? (
        <Banner tone="danger" icon="alert">
          {t.sendFailed}
        </Banner>
      ) : null}

      <AccessPill>{t.firstAccess}</AccessPill>
      <h1 className="mt-4 text-[34px] font-bold leading-tight tracking-tight text-text">{t.title}</h1>
      <p className="mt-1 text-[17px] text-text-secondary">{t.subtitle}</p>

      <form action={formAction} onChange={() => setTocado(true)} noValidate className="mt-7">
        <DesignInput
          name="contact_name"
          label={t.contactNameLabel}
          placeholder={t.contactNamePlaceholder}
          autoComplete="name"
          defaultValue={state.values.contact_name}
          error={mensaje("contact_name")}
        />
        <DesignInput
          name="business_name"
          label={t.businessNameLabel}
          placeholder={t.businessNamePlaceholder}
          autoComplete="organization"
          defaultValue={state.values.business_name}
          error={mensaje("business_name")}
        />
        <div className="grid gap-x-5 sm:grid-cols-2">
          <DesignInput
            name="phone"
            type="tel"
            label={t.phoneLabel}
            placeholder={t.phonePlaceholder}
            autoComplete="tel"
            defaultValue={state.values.phone}
            error={mensaje("phone")}
          />
          <DesignInput
            name="email"
            type="email"
            label={t.emailLabel}
            placeholder={t.emailPlaceholder}
            autoComplete="email"
            defaultValue={state.values.email}
            error={mensaje("email")}
          />
        </div>
        <DesignInput
          name="tax_id"
          label={t.taxIdLabel}
          placeholder={t.taxIdPlaceholder}
          autoComplete="off"
          defaultValue={state.values.tax_id}
          error={mensaje("tax_id")}
        />

        <div className="mb-3">
          <label htmlFor="comments" className="mb-2 block text-[15px] font-semibold text-text">
            {t.commentsLabel}
          </label>
          <textarea
            id="comments"
            name="comments"
            rows={3}
            placeholder={t.commentsPlaceholder}
            defaultValue={state.values.comments}
            className="w-full rounded-[10px] border border-border bg-surface px-4 py-3 text-[15px] text-text outline-none transition-colors placeholder:text-text-secondary/70 focus:border-cuotly-green focus:ring-3 focus:ring-cuotly-green/15"
          />
        </div>

        <p className="mb-5 text-sm text-text-secondary">{t.requiredNote}</p>

        <button
          type="submit"
          disabled={pending || !enLinea}
          aria-busy={pending || undefined}
          className="w-full rounded-[10px] bg-primary px-4 py-3.5 text-[17px] font-semibold text-surface transition-colors hover:bg-primary-dark focus:outline focus:outline-2 focus:outline-cuotly-green disabled:cursor-not-allowed disabled:bg-text-secondary/60"
        >
          {pending ? t.submitPending : fallo ? t.retry : t.submit}
        </button>

        {state.fields.length > 0 ? (
          <p
            role="alert"
            className="mt-3 flex items-center justify-center gap-2 rounded-[10px] bg-danger/10 px-4 py-3 text-[15px] text-text"
          >
            <Icon name="alert" aria-hidden="true" className="h-5 w-5 shrink-0 text-danger" strokeWidth={2} />
            {t.reviewFields}
          </p>
        ) : null}

        {!enLinea ? (
          <>
            <button
              type="button"
              onClick={() => setEnLinea(navigator.onLine)}
              className="mt-3 w-full rounded-[10px] border border-border bg-surface px-4 py-3 text-[16px] font-semibold text-text transition-colors hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
            >
              {t.checkConnection}
            </button>
            <p className="mt-3 text-center text-sm text-text-secondary">{t.offlineNote}</p>
          </>
        ) : state.fields.length === 0 && !fallo ? (
          <p className="mt-3 text-center text-sm text-text-secondary">{t.submitNote}</p>
        ) : null}
      </form>

      <p className="mt-6 text-center text-sm text-text-secondary">
        {t.hasAccount}{" "}
        <Link href="/login" className="font-semibold text-primary">
          {t.signIn}
        </Link>
      </p>

      {salirA !== null ? (
        <LeaveDialog
          onStay={cerrarAviso}
          onLeave={() => {
            setTocado(false);
            router.push(salirA);
          }}
        />
      ) : null}
    </AccessCard>
  );
}

/** A01 · lo que se ve al terminar. Los datos son los que la persona acaba de escribir. */
function Received({ values }: { values: AccessRequestValues }) {
  const t = es.auth.access;
  const filas: { icon: IconName; value: string }[] = [
    { icon: "person", value: values.contact_name },
    { icon: "building", value: values.business_name },
    { icon: "phone", value: values.phone },
    { icon: "mail", value: values.email },
    { icon: "idCard", value: normalizeTaxId(values.tax_id) },
    { icon: "document", value: values.comments },
  ].filter((fila): fila is { icon: IconName; value: string } => fila.value !== "");

  return (
    <AccessCard>
      <div role="status">
        <AccessPill tone="success">{t.sentPill}</AccessPill>
        <StatusHero tone="success" title={t.sentTitle} body={t.sentBody} />
      </div>
      <StatusBox kind="review" badgeTone="warning" badge={t.inReview} body={t.inReviewBody} />
      <RequestData rows={filas} />
      {/*
        RN-ACC-12 · el diseño pone aquí "Ver solicitud". El enlace de
        seguimiento lleva una clave y solo viaja por correo: enseñarlo en
        pantalla daría el seguimiento a quien escribió una dirección ajena.
        Se dice dónde está en vez de pintar un botón que no puede llevar a
        ningún sitio.
      */}
      <p className="mt-7 flex items-start gap-3 rounded-[12px] bg-soft-surface px-5 py-4 text-[15px] text-text">
        <Icon name="mail" aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary-dark" />
        {t.followUpByMail(values.email)}
      </p>
    </AccessCard>
  );
}

function DesignInput({
  name,
  label,
  error,
  type = "text",
  ...rest
}: {
  name: string;
  label: string;
  error?: string;
  type?: string;
  placeholder: string;
  autoComplete: string;
  defaultValue: string;
}) {
  const errorId = `${name}-error`;
  return (
    <div className="mb-5">
      <label htmlFor={name} className="mb-2 block text-[15px] font-semibold text-text">
        {label} <span aria-hidden="true">*</span>
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required
        aria-invalid={error !== undefined}
        aria-describedby={error === undefined ? undefined : errorId}
        className={`w-full rounded-[10px] border bg-surface px-4 py-3 text-[15px] text-text outline-none transition-colors placeholder:text-text-secondary/70 focus:ring-3 ${
          error === undefined
            ? "border-border focus:border-cuotly-green focus:ring-cuotly-green/15"
            : "border-danger focus:border-danger focus:ring-danger/15"
        }`}
        {...rest}
      />
      {error === undefined ? null : (
        <p id={errorId} className="mt-2 flex items-center gap-2 text-[15px] text-danger">
          <Icon name="alert" aria-hidden="true" className="h-5 w-5 shrink-0" strokeWidth={2} />
          {error}
        </p>
      )}
    </div>
  );
}

function Banner({
  tone,
  icon,
  children,
}: {
  tone: "warning" | "danger";
  icon: IconName;
  children: ReactNode;
}) {
  return (
    <p
      role="alert"
      className={`mb-6 flex items-center gap-3 rounded-[12px] px-4 py-3 text-[15px] font-medium text-text ${
        tone === "warning" ? "bg-warning/25" : "bg-danger/10"
      }`}
    >
      <Icon
        name={icon}
        aria-hidden="true"
        className={`h-6 w-6 shrink-0 ${tone === "warning" ? "text-primary-dark" : "text-danger"}`}
        strokeWidth={2}
      />
      {children}
    </p>
  );
}

/** A11 · "Tienes cambios sin enviar", centrado y con el fondo oscurecido. */
function LeaveDialog({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  const t = es.auth.access;
  const tituloId = useId();

  useEffect(() => {
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") onStay();
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [onStay]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div aria-hidden="true" onClick={onStay} className="absolute inset-0 bg-primary-dark/45" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className="relative w-full max-w-[560px] rounded-card bg-surface px-8 py-10 text-center shadow-2xl"
      >
        <button
          type="button"
          onClick={onStay}
          aria-label={es.common.close}
          className="absolute right-5 top-5 text-text hover:text-primary"
        >
          <Icon name="close" className="h-6 w-6" strokeWidth={2} />
        </button>
        <span
          aria-hidden="true"
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-warning/25 text-primary-dark"
        >
          <Icon name="alert" className="h-11 w-11" strokeWidth={1.8} />
        </span>
        <h2 id={tituloId} className="mt-5 text-[26px] font-bold tracking-tight text-text">
          {t.leaveTitle}
        </h2>
        <p className="mx-auto mt-2 max-w-[420px] text-[17px] text-text-secondary">{t.leaveBody}</p>
        <div className="mx-auto mt-7 max-w-[340px] space-y-3">
          <button
            type="button"
            autoFocus
            onClick={onStay}
            className="w-full rounded-[10px] bg-primary px-4 py-3.5 text-[17px] font-semibold text-surface transition-colors hover:bg-primary-dark focus:outline focus:outline-2 focus:outline-cuotly-green"
          >
            {t.leaveStay}
          </button>
          <button
            type="button"
            onClick={onLeave}
            className="w-full rounded-[10px] border border-border bg-surface px-4 py-3.5 text-[17px] font-semibold text-text transition-colors hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
          >
            {t.leaveGo}
          </button>
        </div>
      </div>
    </div>
  );
}
