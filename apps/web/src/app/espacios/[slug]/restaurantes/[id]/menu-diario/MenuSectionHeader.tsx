import type { ReactNode } from "react";

import { Card, PageHeader, StatusBadge, Tabs } from "@/components/ui";
import { es } from "@/i18n/es";

import type { DailyMenuAccess } from "./section-load";

const t = es.panelMenus;

export type MenuSection = "menus" | "templates" | "service";

/**
 * La cabecera común de R13, R15 y R19: el título, de dónde le viene Menú
 * Diario a la derecha (incluido en su plan o contratado aparte, RN-CRE-21)
 * y las tres secciones. Sin contador: RN-CRE-22.
 */
export function MenuSectionHeader({
  base,
  active,
  title,
  subtitle,
  access,
  actions,
}: {
  base: string;
  active: MenuSection;
  title: string;
  subtitle: string;
  access: DailyMenuAccess | null;
  actions?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title={title} subtitle={subtitle} actions={actions} />
        {access !== null ? (
          <Card className="w-full p-4! sm:w-auto sm:min-w-[240px] sm:p-4!">
            <p className="text-sm font-semibold text-text">{t.accessTitle}</p>
            <div className="mt-2">
              <StatusBadge tone="success">{access === "plan" ? t.accessPlan : t.accessService}</StatusBadge>
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
