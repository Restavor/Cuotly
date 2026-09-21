import type { SheetData } from "./Sheet";

/**
 * Una ficha de restaurante vacía, para las suites que solo miran **un**
 * bloque de la ficha.
 *
 * `EstablishmentSheet` recibe la ficha entera —veintitantos campos— aunque
 * se esté mirando un solo bloque, así que cada suite tenía que escribir
 * cien líneas de relleno para llegar a las tres que le importan. Cuando un
 * campo nuevo entra en `SheetData`, esas cien líneas hay que tocarlas una a
 * una; pasó con `notes` al mover las notas internas a Gestión (RN-EST-14).
 *
 * Aquí se escriben una vez. Lo que cada suite cambia lo pone encima:
 * `{ ...sheetFixture(), notes: … }`. No se pretende que estos valores
 * signifiquen nada: son el mínimo que compila, y cualquier suite que mire
 * uno de ellos tiene que ponerlo ella.
 */
export function sheetFixture(): SheetData {
  return {
    header: {
      id: "est-1",
      name: "Magariños",
      code: "EST-0048",
      status: "active",
      groupId: "grupo-1",
      groupName: "Grupo Magariños",
      planId: "p-1",
      planName: "Premium",
      planPriceCents: 59900,
      services: [],
      commitmentEndsAt: null,
      commitmentStartedAt: null,
      planSubscriptionId: "sub-1",
      planTerms: null,
      cycleStart: null,
      cycleEnd: null,
      identity: {
        legalName: null,
        taxId: null,
        address: null,
        postalCode: null,
        city: null,
        contactName: null,
        contactEmail: null,
        phonePrimary: null,
        phoneSecondary: null,
        websiteUrl: null,
        instagram: null,
        facebookUrl: null,
        domain: null,
        openingHours: null,
        webPlatform: null,
      },
    },
    canEditData: false,
    statusReason: null,
    transfer: null,
    backups: [],
    notes: { canRead: false, canRestrict: false, notes: [] },
    storageBytes: null,
    canProposeTransfer: false,
    integrations: null,
    digital: null,
    opportunities: null,
    opportunityViewer: "approver",
    reports: [],
    canManageClients: false,
    summary: {
      bags: [],
      attention: [],
      pendingValidation: [],
      openRequests: 0,
      currentJob: null,
      liveJobs: 0,
      payment: { allowed: false, outstandingCents: 0, overdueCount: 0 },
    },
    operation: {
      requests: { shown: [], hidden: 0 },
      jobs: { shown: [], hidden: 0 },
      tasks: { shown: [], hidden: 0 },
    },
    counts: { requestsByState: [], jobsByState: [], files: 0 },
    payments: { allowed: false, charges: [], payments: [], quotes: [] },
    today: "2026-09-11",
    users: { rows: [], failed: false },
    staff: [],
    files: { files: [], selected: null, categories: [], folders: [], total: 0, category: null },
    timeZone: "Europe/Madrid",
    audit: {
      rows: [],
      actors: [],
      filters: { from: null, to: null, family: null, actorId: null, page: 1 },
      hasMore: false,
    },
    // Página 24 · "Actividad reciente" del Resumen, que llega sin los
    // filtros de Historial.
    recentActivity: [],
    nextMenu: { kind: "no_service" },
    requestDetail: null,
  };
}
