import { Tabs } from "@/components/ui";
import { es } from "@/i18n/es";

const t = es.teamArea.finance;

export type FinanceSection = "resumen" | "cobros" | "pagos" | "presupuestos" | "facturas" | "vencimientos";

/**
 * Las pestañas de Finanzas, iguales en todas sus pantallas (M16, M49 a
 * M52). Presupuestos tiene su propia ruta —y su ficha—; las demás son la
 * misma página con `?tab=`. "Vencimientos" vive dentro de "Facturas", como
 * en el dibujo (M52), y se elige con la segunda fila.
 */
export function FinanceTabs({
  slug,
  active,
  month,
}: {
  slug: string;
  active: FinanceSection;
  /** El mes elegido en el resumen, para no perderlo al cambiar de pestaña. */
  month?: string | null;
}) {
  const base = `/espacios/${slug}/finanzas`;
  const href = (tab: string) => {
    const q = new URLSearchParams();
    if (tab !== "resumen") q.set("tab", tab);
    if (month) q.set("mes", month);
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  const enFacturas = active === "facturas" || active === "vencimientos";

  return (
    <div className="space-y-3">
      <Tabs
        label={t.title}
        active={enFacturas ? "facturas" : active}
        tabs={[
          { key: "resumen", label: t.tabSummary, href: href("resumen") },
          { key: "cobros", label: t.tabCharges, href: href("cobros") },
          { key: "pagos", label: t.tabPayments, href: href("pagos") },
          { key: "presupuestos", label: t.tabQuotes, href: `${base}/presupuestos` },
          { key: "facturas", label: t.tabInvoices, href: href("facturas") },
        ]}
      />
      {enFacturas ? (
        <Tabs
          label={t.tabInvoices}
          active={active}
          tabs={[
            { key: "facturas", label: t.tabInvoices, href: href("facturas") },
            { key: "vencimientos", label: t.tabDue, href: href("vencimientos") },
          ]}
        />
      ) : null}
    </div>
  );
}
