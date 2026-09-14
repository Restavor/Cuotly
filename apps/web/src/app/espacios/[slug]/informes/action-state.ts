/**
 * El estado que devuelven las acciones de los informes (Fase 3, Hito 16).
 * Vive aparte del archivo `"use server"` porque un módulo de servidor solo
 * puede exportar funciones asíncronas, y los tipos no lo son.
 */
export interface ReportActionState {
  readonly error: string | null;
  readonly done: boolean;
  /**
   * §95 · el envío se detuvo porque hay oportunidades pendientes
   * (RN-REP-10). No es un error de quien pulsa: es la regla funcionando, y
   * la pantalla lo dice con sus palabras.
   */
  readonly blockedByOpportunities: number | null;
}

export const IDLE_REPORT_ACTION: ReportActionState = {
  error: null,
  done: false,
  blockedByOpportunities: null,
};
