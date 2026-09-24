import Link from "next/link";

import { AttentionCell } from "@/components/establishment/AttentionCell";
import { EstablishmentPhoto } from "@/components/establishment/EstablishmentPhoto";
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
 *   · La **cara** del responsable. El responsable **sí existe** desde la
 *     decisión 63 y sale en esta ficha; su foto no. Lo que no existe y
 *     sigue sin existir es un
 *     "supervisor" de un restaurante: ese nombre es una relación
 *     Administrador–Trabajador (CLAUDE.md) y por eso este campo se llama
 *     responsable.
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
  /** RN-EST-19 · quién lo lleva, o `null` si no lo lleva nadie. */
  readonly manager: { readonly id: string; readonly name: string | null } | null;
  /** RN-EST-18 · enlace firmado de su foto, o `null` si no tiene. */
  readonly photoUrl: string | null;
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
      {/* En la fila de tres del teléfono se parte en vez de cortarse
          ("Solicitudes abie…"); desde `sm` hay ancho y se recorta. */}
      <span className="block text-xs text-text-secondary sm:truncate">{label}</span>
      <span className="block break-words text-sm font-medium text-text sm:truncate">{children}</span>
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
        La fila de arriba **se parte** cuando no cabe, y el bloque del
        nombre se lleva un ancho mínimo (`basis-56`) antes de que nadie lo
        recorte.

        Sin eso, un estado largo —"Pausado por impago"— se quedaba con la
        línea entera y "Puerto Chico" salía como "Pu…". El nombre es lo que
        se busca en esta lista; la insignia es contexto. Se vio mirando la
        lista dibujada, no en el tipo ni en las pruebas.

        El mínimo era `basis-40` hasta que la foto (RN-EST-18) entró en
        este mismo bloque y le quitó 56 px: en un teléfono, "Santiago de
        Compostela" pasó a salir como "Santiago de C…". No se arregló
        recortando antes, sino subiendo el mínimo para que en ese ancho
        sean las insignias las que bajen de línea. También se vio
        mirándolo.
      */}
      <span className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        {/*
          RN-EST-18 · la foto del local, que la página 23 pone a la
          izquierda del nombre. Sin foto no se pinta un marco vacío: se
          pinta el icono de local que esta lista ya usaba, porque un hueco
          gris esperando una imagen se lee como "algo falló" (CA-20).

          Va DENTRO del bloque del nombre y no como un tercer hijo de la
          fila que se parte, para que al partirse la foto se lleve consigo
          el nombre en vez de quedarse sola en una línea.
        */}
        <span className="flex min-w-0 flex-1 basis-56 items-start gap-3">
          <EstablishmentPhoto photoUrl={row.photoUrl} size={44} />
          <span className="min-w-0 flex-1">
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

      {/*
        Página 23 del diseño móvil · Grupo, Solicitudes y Responsable en
        una fila de tres también en el teléfono; "Necesita atención" debajo,
        a lo ancho. En dos columnas cada tarjeta ocupaba el doble.
      */}
      <span className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 border-t border-border pt-3">
        <Dato label={t.groupColumn}>{row.groupName ?? t.noGroup}</Dato>
        <Dato label={t.openRequests}>{row.openRequests}</Dato>
        {/*
          RN-EST-19 · sin responsable es un estado normal y se dice así,
          sin tono de aviso: la ficha no empuja a asignar a nadie.

          Y "hay alguien cuyo nombre no puedo leer" es otra cosa distinta
          de "no lo lleva nadie": lo primero pasa cuando quien mira no
          puede resolver ese perfil, y decir "sin responsable" entonces
          sería mentir (CA-20).
        */}
        <Dato label={t.manager}>
          {row.manager === null ? (
            <span className="font-normal text-text-secondary">{t.noManager}</span>
          ) : (
            (row.manager.name ?? t.managerUnknown)
          )}
        </Dato>
        {/*
          "Necesita atención" no está en el dibujo y se queda: es lo único
          de esta ficha que pide que alguien haga algo hoy, y era ya una
          columna de la tabla que esto sustituye. Cuando no hay nada,
          `AttentionCell` lo dice; no se pinta un hueco.
        */}
        <span className="col-span-3 min-w-0">
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
