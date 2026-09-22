import { AccessShell } from "@/components/access/AccessShell";
import { countriesForSelect } from "@/core/countries";
import { es } from "@/i18n/es";

import { AccessRequestForm } from "./AccessRequestForm";

/**
 * PRD §37 (RN-ACC-02) · el formulario de solicitud de acceso, que **ocupa
 * el lugar del registro** desde la decisión 41. Esta ruta se llama todavía
 * `/signup` a propósito: es donde va quien busca registrarse, y lo que
 * encuentra es esto.
 *
 * F01 · con la cabecera pública y la miga de pan "Cuotly / Solicitud de
 * acceso". El formulario y sus estados (A01, A09 a A12) están en
 * `AccessRequestForm`, que es lo único de la pantalla que vive en el
 * navegador.
 */
export default function SolicitarAccesoPage() {
  return (
    <AccessShell crumb={es.auth.access.crumbAccess}>
      <AccessRequestForm countries={countriesForSelect()} />
    </AccessShell>
  );
}
