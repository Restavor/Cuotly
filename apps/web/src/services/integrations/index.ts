/**
 * Los cinco adaptadores, uno por fuente de RN-INT-01, y ninguno más.
 * Quien pida el de una fuente que no existe se lleva `undefined`, y el
 * proceso lo convierte en un fallo de configuración (RN-INT-08) en vez de
 * inventar una sincronización vacía.
 */

import type { IntegrationProvider } from "@/core/integrations";

import type { IntegrationAdapter } from "./adapter";
import { businessProfileAdapter } from "./business-profile";
import { clarityAdapter } from "./clarity";
import { ga4Adapter } from "./ga4";
import { pagespeedAdapter } from "./pagespeed";
import { searchConsoleAdapter } from "./search-console";

export type { AdapterContext, CheckResult, IntegrationAdapter, SyncResult } from "./adapter";
export { AdapterFailure, classifyHttpStatus } from "./adapter";

export const ADAPTERS: Readonly<Record<IntegrationProvider, IntegrationAdapter>> = {
  ga4: ga4Adapter,
  search_console: searchConsoleAdapter,
  business_profile: businessProfileAdapter,
  clarity: clarityAdapter,
  pagespeed: pagespeedAdapter,
};

export function adapterFor(provider: string): IntegrationAdapter | undefined {
  return (ADAPTERS as Record<string, IntegrationAdapter | undefined>)[provider];
}
