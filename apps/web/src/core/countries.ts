/**
 * Decisión 68 · los países que se pueden elegir como "País del documento"
 * en la solicitud de acceso: los códigos ISO 3166-1 alfa-2.
 *
 * Solo los códigos. El nombre en español lo pone el navegador o el
 * servidor con `Intl.DisplayNames` (`countryName()`), que es la lista
 * oficial y no una traducción escrita a mano que se quede vieja.
 */
export const COUNTRY_CODES = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR " +
  "BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ " +
  "EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW " +
  "GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY " +
  "KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV " +
  "MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY " +
  "QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG " +
  "TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" ");

const CODIGOS = new Set(COUNTRY_CODES);

export function isCountryCode(value: string): boolean {
  return CODIGOS.has(value);
}

/** El país por defecto del formulario: casi todos los que piden acceso son de aquí. */
export const DEFAULT_TAX_COUNTRY = "ES";

/** El nombre del país en español, o el código si el entorno no lo sabe. */
export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["es"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Los países ordenados por su nombre en español, España primero. */
export function countriesForSelect(): readonly { code: string; name: string }[] {
  const todos = COUNTRY_CODES.map((code) => ({ code, name: countryName(code) }));
  const espana = todos.find((c) => c.code === DEFAULT_TAX_COUNTRY);
  const resto = todos
    .filter((c) => c.code !== DEFAULT_TAX_COUNTRY)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  return espana === undefined ? resto : [espana, ...resto];
}
