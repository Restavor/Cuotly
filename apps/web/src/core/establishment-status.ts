/**
 * `src/core/establishment-status.ts` — qué significa cada estado de un
 * restaurante (maqueta 20, PRD §15.1).
 *
 * **Esto no autoriza nada y no debe parecerlo.** Quien decide de verdad es
 * `assert_establishment_service_running()` en el servidor, que llaman las
 * diez funciones que crean o mueven trabajo. Lo que hay aquí es la
 * traducción de esa guarda a una frase, para que la pantalla pueda decirle
 * a alguien por qué no puede hacer algo **antes** de que lo intente. Si las
 * dos discreparan, mandaría el servidor y la pantalla estaría mintiendo,
 * así que se escriben juntas a propósito:
 *
 *     if v_status in ('paused', 'suspended') then  -- servicio detenido
 *     if v_status = 'read_only'             then  -- consultar sí, cambiar no
 *     if v_status = 'archived'              then  -- ni solicitudes ni trabajos
 *
 * De ahí salen los tres estados que detienen el servicio y los tres que no.
 * `ending` no lo detiene, y no es un descuido: RN-EST-09 dice que "el
 * servicio sigue activo hasta el final del periodo pagado o de la
 * permanencia vigente".
 */

/** PRD §15.1 · los siete, en el orden en que se atraviesan. */
export const ESTABLISHMENT_STATUSES = [
  "configuring",
  "active",
  "paused",
  "ending",
  "read_only",
  "suspended",
  "archived",
] as const;

export type EstablishmentStatusKey = (typeof ESTABLISHMENT_STATUSES)[number];

export interface StatusEffects {
  /**
   * Si el servidor deja crear o mover trabajo. Es literalmente lo contrario
   * de lo que rechaza `assert_establishment_service_running()`.
   */
  readonly serviceRunning: boolean;
  /**
   * RN-EST-08 · "en `paused` se puede consultar". Consultar se puede
   * siempre: ningún estado cierra la lectura, ni siquiera el archivado —
   * los datos no se eliminan (RN-EST-10).
   */
  readonly canConsult: true;
  /** Si merece un aviso en la cabecera. `active` es el curso normal y no. */
  readonly needsNotice: boolean;
  readonly tone: "success" | "warning" | "danger" | "info" | "neutral";
}

const EFECTOS: Readonly<Record<EstablishmentStatusKey, StatusEffects>> = {
  configuring: { serviceRunning: true, canConsult: true, needsNotice: true, tone: "neutral" },
  active: { serviceRunning: true, canConsult: true, needsNotice: false, tone: "success" },
  // RN-FIN-10/12 · a las 24 h se detienen trabajos, publicaciones y
  // contadores. "Pausado" no es "un poco activo".
  paused: { serviceRunning: false, canConsult: true, needsNotice: true, tone: "warning" },
  // RN-EST-09 · ha comunicado la baja y el servicio SIGUE corriendo hasta
  // el final del periodo pagado.
  ending: { serviceRunning: true, canConsult: true, needsNotice: true, tone: "info" },
  // RN-EST-10 · las 24 h de solo lectura antes de suspender.
  read_only: { serviceRunning: false, canConsult: true, needsNotice: true, tone: "info" },
  suspended: { serviceRunning: false, canConsult: true, needsNotice: true, tone: "danger" },
  archived: { serviceRunning: false, canConsult: true, needsNotice: true, tone: "neutral" },
};

export function isEstablishmentStatus(value: string): value is EstablishmentStatusKey {
  return (ESTABLISHMENT_STATUSES as readonly string[]).includes(value);
}

/**
 * Un estado que no se reconozca se trata como **detenido**. Es la
 * dirección segura: decirle a alguien que puede pedir un cambio y que el
 * servidor se lo rechace después es peor que avisarle de más, y un estado
 * desconocido en esta columna significa que algo va mal, no que todo vaya
 * bien.
 */
export function statusEffects(status: string): StatusEffects {
  if (!isEstablishmentStatus(status)) {
    return { serviceRunning: false, canConsult: true, needsNotice: true, tone: "neutral" };
  }
  return EFECTOS[status];
}
