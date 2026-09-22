import type { AccessRequestFormState, AccessRequestValues } from "@/app/(auth)/form-states";
import { accessRequestFieldProblems, accessRequestSubmitFailure } from "@/core/access-requests";
import { isCountryCode } from "@/core/countries";
import {
  VIES_COUNTRY_CODES,
  checkTaxIdLocally,
  decideTaxId,
  isViesCountry,
  normalizeTaxId,
  viesNumber,
  type TaxIdVerification,
  type ViesAnswer,
} from "@/core/tax-id";
import { es } from "@/i18n/es";

/**
 * RN-ACC-02 y decisión 68 · enviar una solicitud de acceso, con el
 * documento comprobado **en el servidor**.
 *
 * Es el único camino: lo usan la acción del formulario web y
 * `/api/movil/solicitud-acceso` para el teléfono. La función de la base
 * (`submit_access_request()`) solo la puede llamar `service_role` desde la
 * migración 126, así que nadie se salta esto llamándola por RPC con un
 * documento falso "ya comprobado".
 *
 * En orden:
 *   1. A09 · los campos obligatorios y el correo, todos a la vez.
 *   2. El cálculo de control del país elegido. Si dice que es falso, se
 *      rechaza y se marca el campo.
 *   3. VIES, si el país es de la UE y no es España.
 *   4. `decideTaxId()` junta las dos cosas: comprobado, o marcado para el
 *      equipo.
 *   5. La base, que vuelve a exigir lo suyo.
 *
 * RN-ACC-12 · pase lo que pase en el paso 5 (el correo ya tiene cuenta,
 * ya hay una abierta), la respuesta es la misma. Lo único que cambia la
 * pantalla es un dato mal escrito, que es cosa de quien lo escribe.
 */
export type SubmitAccessRequestArgs = {
  p_contact_name: string;
  p_business_name: string;
  p_phone: string;
  p_email: string;
  p_tax_id: string;
  p_tax_id_country: string;
  p_tax_id_verification: TaxIdVerification;
  p_tax_id_registry_name?: string;
  p_comments?: string;
};

export type AccessRequestDeps = {
  /** La llamada a `submit_access_request()` con `service_role`. */
  submit: (args: SubmitAccessRequestArgs) => Promise<{ error: { message: string } | null }>;
  /** La consulta a VIES (`src/services/vies.ts`). */
  vies: (viesCountryCode: string, vatNumber: string) => Promise<ViesAnswer>;
};

export function readAccessRequestValues(get: (key: string) => unknown): AccessRequestValues {
  const texto = (clave: string) => {
    const valor = get(clave);
    return typeof valor === "string" ? valor.trim() : "";
  };
  return {
    contact_name: texto("contact_name"),
    business_name: texto("business_name"),
    phone: texto("phone"),
    email: texto("email"),
    tax_id: texto("tax_id"),
    tax_country: texto("tax_country").toUpperCase(),
    comments: texto("comments"),
  };
}

export async function submitAccessRequest(
  values: AccessRequestValues,
  deps: AccessRequestDeps,
): Promise<AccessRequestFormState> {
  const t = es.auth.signup;
  const conProblemas = (
    problems: AccessRequestFormState["problems"],
    error: string,
  ): AccessRequestFormState => ({ error, fields: Object.keys(problems), problems, done: false, values });

  // 1 · A09.
  const problems: AccessRequestFormState["problems"] = accessRequestFieldProblems({
    contactName: values.contact_name,
    businessName: values.business_name,
    phone: values.phone,
    email: values.email,
    taxId: values.tax_id,
  });
  if (!isCountryCode(values.tax_country)) problems.tax_country = "missing";
  if (Object.keys(problems).length > 0) {
    const soloCorreo = Object.keys(problems).length === 1 && problems.email === "invalid";
    return conProblemas(problems, soloCorreo ? t.validationEmail : t.validationRequired);
  }

  // 2 · el cálculo de control.
  const documento = normalizeTaxId(values.tax_id);
  const local = checkTaxIdLocally(values.tax_country, documento);
  if (local.kind === "invalid") {
    return conProblemas({ tax_id: "invalid" }, es.auth.access.fieldErrors.taxIdInvalid);
  }

  // 3 · VIES, para la UE fuera de España.
  const vies =
    values.tax_country !== "ES" && isViesCountry(values.tax_country)
      ? await deps.vies(VIES_COUNTRY_CODES[values.tax_country], viesNumber(values.tax_country, documento))
      : null;

  // 4 · la decisión.
  const decision = decideTaxId(local, vies);
  if (!decision.ok) {
    return conProblemas({ tax_id: "invalid" }, es.auth.access.fieldErrors.taxIdInvalid);
  }

  // 5 · la base.
  let resultado: { error: { message: string } | null };
  try {
    resultado = await deps.submit({
      p_contact_name: values.contact_name,
      p_business_name: values.business_name,
      p_phone: values.phone,
      p_email: values.email,
      p_tax_id: documento,
      p_tax_id_country: values.tax_country,
      p_tax_id_verification: decision.verification,
      p_tax_id_registry_name: decision.registryName ?? undefined,
      p_comments: values.comments === "" ? undefined : values.comments,
    });
  } catch (error) {
    resultado = { error: { message: error instanceof Error ? error.message : "" } };
  }

  if (resultado.error) {
    // A10 · si el envío falla, lo escrito no se pierde y se puede reintentar.
    const motivo = accessRequestSubmitFailure(resultado.error.message);
    return {
      error: motivo === "unreachable" ? t.unreachable : t.unknownError,
      fields: [],
      problems: {},
      done: false,
      values,
    };
  }

  return { error: null, fields: [], problems: {}, done: true, values };
}
