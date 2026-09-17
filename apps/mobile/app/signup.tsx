import { Link } from "expo-router";
import { useState } from "react";

import { accessRequestSubmitFailure, validateAccessRequest } from "@/core/access-requests";

import { Body, Button, Card, Field, Notice, Screen, Title } from "../src/components/ui";
import { es, web } from "../src/i18n/es";
import { useOnline } from "../src/lib/connectivity";
import { supabase } from "../src/lib/supabase";
import { colors } from "../src/lib/theme";

/**
 * PRD §37 (RN-ACC-02) · solicitar acceso a Cuotly, **en el sitio donde
 * estaba el registro**.
 *
 * Esta pantalla llamaba a `supabase.auth.signUp()`. La decisión 41 acabó
 * con el registro abierto el 16/09/2026 y la web lo sustituyó por este
 * formulario, pero el teléfono se quedó con la puerta pintada: `login.tsx`
 * decía "¿No tienes cuenta? Regístrate", llevaba aquí, y aquí GoTrue
 * contestaba que no —`enable_signup = false` en `supabase/config.toml`
 * cerró la puerta de verdad, así que no era un agujero, pero sí un
 * formulario que pedía una contraseña para una cuenta que no se iba a
 * crear—.
 *
 * Los cuatro estados del diseño (A09 a A12) valen aquí menos uno:
 *
 *   · A09 · cada campo mal rellenado se señala **donde está**, con la
 *     misma comprobación que la web (`core/access-requests.ts`).
 *   · A10 · el botón dice qué está pasando mientras envía.
 *   · A11 · si el envío falla, **lo escrito no se pierde**: el estado del
 *     formulario no se toca en el camino de error.
 *   · A12 · avisar al salir con cambios sin enviar es del navegador
 *     (`beforeunload`). Aquí **no se finge**: lo que hace el teléfono es
 *     no perder lo escrito si se vuelve, y eso ya lo da el propio estado.
 *
 * Y RN-ACC-12, que no es un estado sino la regla: al terminar dice
 * **siempre lo mismo**, pase lo que pase por detrás. `submit_access_request()`
 * devuelve `void` justamente para que esta pantalla no pueda ser un
 * oráculo de direcciones.
 */
export default function SolicitarAccesoScreen() {
  const t = web.auth.signup;
  const online = useOnline();
  const [contactName, setContactName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [comments, setComments] = useState("");
  const [malos, setMalos] = useState<readonly string[]>([]);
  const [problema, setProblema] = useState<"missing" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const fallo = (campo: string) =>
    malos.includes(campo) ? (problema === "email" ? t.validationEmail : t.validationRequired) : undefined;

  async function enviar() {
    const revision = validateAccessRequest({ contactName, businessName, phone, email });
    if (!revision.ok) {
      setMalos(revision.fields);
      setProblema(revision.problem);
      setError(null);
      return;
    }
    setMalos([]);
    setProblema(null);
    setError(null);
    setPending(true);
    const { error: problemaEnvio } = await supabase.rpc("submit_access_request", {
      p_contact_name: contactName.trim(),
      p_business_name: businessName.trim(),
      p_phone: phone.trim(),
      p_email: email.trim(),
      p_comments: comments.trim() === "" ? undefined : comments.trim(),
    });
    setPending(false);
    if (problemaEnvio) {
      // A11 · lo escrito sigue aquí y se puede volver a pulsar.
      setError(
        accessRequestSubmitFailure(problemaEnvio.message) === "unreachable" ? t.unreachable : t.unknownError,
      );
      return;
    }
    setDone(true);
  }

  // RN-ACC-12 · el mismo final siempre.
  if (done) {
    return (
      <Screen title={t.doneTitle}>
        <Card>
          <Body>{t.doneBody}</Body>
        </Card>
        <Link href="/login" style={{ color: colors.primary, marginTop: 16 }}>
          {t.doneBack}
        </Link>
      </Screen>
    );
  }

  return (
    <Screen title={t.title}>
      <Body muted>{t.subtitle}</Body>
      <Field
        label={t.contactNameLabel}
        value={contactName}
        onChangeText={setContactName}
        error={fallo("contact_name")}
        testID="contact-name-input"
      />
      <Field
        label={t.businessNameLabel}
        value={businessName}
        onChangeText={setBusinessName}
        error={fallo("business_name")}
        testID="business-name-input"
      />
      <Field
        label={t.phoneLabel}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        error={fallo("phone")}
        testID="phone-input"
      />
      <Field
        label={t.emailLabel}
        help={t.emailHelp}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        error={fallo("email")}
        testID="email-input"
      />
      <Field
        label={t.commentsLabel}
        help={t.commentsHelp}
        value={comments}
        onChangeText={setComments}
        multiline
        testID="comments-input"
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Button
        label={pending ? t.submitPending : t.submit}
        onPress={() => void enviar()}
        pending={pending}
        disabled={!online}
        disabledReason={es.offline.buttonReason}
        testID="submit-button"
      />
      <Card>
        <Title>{t.hasAccount}</Title>
        <Link href="/login" style={{ color: colors.primary }}>
          {t.loginLink}
        </Link>
      </Card>
    </Screen>
  );
}
