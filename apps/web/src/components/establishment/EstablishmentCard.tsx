import Link from "next/link";

import { AttentionCell } from "@/components/establishment/AttentionCell";
import { StatusBadge } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import type { AttentionItem } from "@/core/home";
import type { EstablishmentState } from "@/core/naming";
import { es } from "@/i18n/es";

/**
 * Página 23 del diseño definitivo móvil · una ficha de la lista de
 * "Restaurantes" (§20.2).
 *
 * **Era una tabla de cinco columnas.** En un teléfono eso se lee mal por
 * definición: o se recorta, o se desborda, o hay que moverla de lado. El
 * diseño dibuja fichas, y una ficha cabe entera en cualquier ancho.
 *
 * **Lo que el diseño dibuja y aquí NO está**, por orden de importancia:
 *
 *   · La **foto del local**. No existe: `establishments` no tiene ninguna
 *     columna de imagen y nadie ha subido ninguna. La casilla gris del
 *     dibujo es una foto de archivo, y poner una inventada sería enseñar
 *     un dato falso (CLAUDE.md MUST NOT). Está anotada como pendiente en
 *     `docs/diseno/MAPA-DEL-DISENO-MOVIL.md` §5.5.
 *   · El **supervisor con su cara**. "Supervisor" en Cuotly no es un
 *     cargo de un restaurante: es una relación Administrador–Trabajador
 *     (CLAUDE.md, decisión que no debe reaparecer), y `supervisions`
 *     enlaza dos personas, no una persona con un local. No hay nadie a
 *     quien nombrar aquí sin inventárselo.
 *   · Los nombres de plan "Estándar" y "Profesional" del dibujo. Los
 *     planes son Básico, Impulso, Impulso+, Premium y Premium+ (decisión
 *     39); la insignia enseña el que de verdad tiene contratado.
 *   · El **menú de tres puntos**. No hay ninguna acción decidida para él,
 *     y un menú que se abre vacío es peor que no estar.
 *
 * **Un solo control por ficha**, como el resto del proyecto (§20.1): la
 * ficha entera es el enlace, y el galón de la derecha es decoración. El
 * botón "Ver ficha" del dibujo sería una segunda parada de tabulador para
 * el mismo destino.
 */
export type EstablishmentCardData = {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly city: string | null;
  readonly status: EstablishmentState;
  readonly groupName: string | null;
  readonly planName: string | null;
  readonly openRequests: number;
  readonly attention: readonly AttentionItem[];
};

export function statusTone(
  status: EstablishmentState,
): "success" | "warning" | "danger" | "neutral" {
  if (status === "active") return "success";
  if (status === "suspended" || status === "archived") return "danger";
  if (status === "paused" || status === "ending" || status === "read_only") return "warning";
  return "neutral";
}

/** Uno de los tres datos de abajo: su rótulo y su valor, uno sobre otro. */
function Dato({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="block truncate text-xs text-text-secondary">{label}</span>
      <span className="block truncate text-sm font-medium text-text">{children}</span>
    </div>
  );
}

export function EstablishmentCard({
  row,
  href,
}: {
  readonly row: EstablishmentCardData;
  readonly href: string;
}) {
  const t = es.teamArea.establishments;

  return (
    <Link
      href={href}
      className="block rounded-[16px] border border-border bg-surface p-4 transition-colors hover:border-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green"
    >
      {/*
        La fila de arriba **se parte** cuando no cabe, y el nombre se lleva
        un ancho mínimo (`basis-40`) antes de que nadie lo recorte.

        Sin eso, un estado largo —"Pausado por impago"— se quedaba con la
        línea entera y "Puerto Chico" salía como "Pu…". El nombre es lo que
        se busca en esta lista; la insignia es contexto. Se vio mirando la
        lista dibujada, no en el tipo ni en las pruebas.
      */}
      <span className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <span className="min-w-0 flex-1 basis-40">
          <span className="block truncate text-base font-semibold text-primary-dark">
            {row.name}
          </span>
          {/*
            La ciudad si la hay, y el código si no. El código identifica al
            restaurante igual, y una línea en blanco no dice nada (P6).
          */}
          <span className="block truncate text-sm text-text-secondary">
            {row.city ?? row.code}
          </span>
        </span>

        <span className="flex flex-wrap items-center gap-1.5">
          {row.planName === null ? (
            <span className="text-xs text-text-secondary">{t.noPlan}</span>
          ) : (
            <StatusBadge tone="info">{row.planName}</StatusBadge>
          )}
          <StatusBadge tone={statusTone(row.status)}>
            {es.naming.states.establishment[row.status]}
          </StatusBadge>
        </span>
      </span>

      <span className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border pt-3 sm:grid-cols-3">
        <Dato label={t.groupColumn}>{row.groupName ?? t.noGroup}</Dato>
        <Dato label={t.openRequests}>{row.openRequests}</Dato>
        {/*
          "Necesita atención" no está en el dibujo y se queda: es lo único
          de esta ficha que pide que alguien haga algo hoy, y era ya una
          columna de la tabla que esto sustituye. Cuando no hay nada,
          `AttentionCell` lo dice; no se pinta un hueco.
        */}
        <span className="col-span-2 min-w-0 sm:col-span-1">
          <span className="block truncate text-xs text-text-secondary">{t.attentionColumn}</span>
          <span className="flex items-center justify-between gap-3">
            <AttentionCell items={row.attention} />
            <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-text-secondary" />
          </span>
        </span>
      </span>
    </Link>
  );
}
