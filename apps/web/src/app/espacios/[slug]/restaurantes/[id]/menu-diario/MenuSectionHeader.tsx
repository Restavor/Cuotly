import type { ReactNode } from "react";

import { Card, PageHeader, ProgressBar, Tabs } from "@/components/ui";
import { es } from "@/i18n/es";

const t = es.panelMenus;

export type MenuSection = "menus" | "templates" | "service";

/**
 * La cabecera común de R13, R15 y R19: el título, el consumo del ciclo a la
 * derecha (el de `menu_update_balance()`, que suma el libro: aquí solo se
 * resta para decir cuántas se han usado) y las tres secciones.
 */
export function MenuSectionHeader({
  base,
  active,
  title,
  subtitle,
  balance,
  cycleLabel,
  actions,
}: {
  base: string;
  active: MenuSection;
  title: string;
  subtitle: string;
  balance: { readonly available: number; readonly included_updates: number } | null;
  cycleLabel: string | null;
  actions?: ReactNode;
}) {
  const usadas = balance === null ? 0 : Math.max(0, balance.included_updates - balance.available);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title={title} subtitle={subtitle} actions={actions} />
        {balance !== null ? (
          <Card className="w-full p-4! sm:w-auto sm:min-w-[280px] sm:p-4!">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:divide-x sm:divide-border">
              <div>
                <p className="text-sm font-semibold text-text">{t.usageTitle}</p>
                <div className="my-2">
                  <ProgressBar
                    percent={balance.included_updates > 0 ? Math.round((usadas / balance.included_updates) * 100) : 0}
                    label={t.usageTitle}
                  />
                </div>
                <p className="text-sm text-text">{t.usageLine(usadas, balance.included_updates)}</p>
              </div>
              {cycleLabel ? (
                <div className="sm:pl-4">
                  <p className="text-sm font-semibold text-text">{t.cycleTitle}</p>
                  <p className="mt-2 text-sm text-text-secondary">{cycleLabel}</p>
                </div>
              ) : null}
            </div>
          </Card>
        ) : null}
      </div>
      <Tabs
        label={t.tabsLabel}
        active={active}
        tabs={[
          { key: "menus", label: t.tabs.menus, href: base },
          { key: "templates", label: t.tabs.templates, href: `${base}/plantillas` },
          { key: "service", label: t.tabs.service, href: `${base}/servicio` },
        ]}
      />
    </div>
  );
}
