import { BigLink, StateCard } from "@/components/access/AccessPieces";
import { AccessShell } from "@/components/access/AccessShell";
import { es } from "@/i18n/es";

/*
 * A05 a A08 · los estados de acceso, cada uno con su dibujo y su botón.
 * A05 (invitación caducada) vive en las tres pantallas de enlace —alta,
 * invitación y panel—, porque cada una sabe su propio motivo.
 */

/** A06 · "Ya no tienes acceso a este espacio". */
export function AccessRemoved() {
  const t = es.auth.access;
  return (
    <AccessShell crumb={t.crumbAccount}>
      <StateCard illustration="person" badge="xCircle" title={t.accessRemovedTitle} body={t.accessRemovedBody}>
        <BigLink href="/">{t.myAccesses}</BigLink>
      </StateCard>
    </AccessShell>
  );
}

/** A07 · "No podemos mostrar este elemento": un enlace a algo que no existe o no es tuyo. */
export function ElementUnavailable() {
  const t = es.auth.access;
  return (
    <AccessShell crumb={t.crumbLink}>
      <StateCard illustration="document" badge="xCircle" title={t.unavailableTitle} body={t.unavailableBody}>
        <BigLink href="/">{t.backHome}</BigLink>
      </StateCard>
    </AccessShell>
  );
}

/** A08 · "Tu sesión ha caducado". */
export function SessionExpired() {
  const t = es.auth.access;
  return (
    <AccessShell>
      <StateCard illustration="lock" badge="clock" title={t.sessionExpiredTitle} body={t.sessionExpiredBody}>
        <BigLink href="/login">{t.signIn}</BigLink>
      </StateCard>
    </AccessShell>
  );
}
