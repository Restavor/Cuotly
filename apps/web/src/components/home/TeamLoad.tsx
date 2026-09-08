import type { LoadLevel } from "@/core/load-points";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui";
import { es } from "@/i18n/es";

/**
 * "Carga del equipo" (§20.4, §14.4).
 *
 * RN-ASG-17 prohíbe cualquier ranking público entre trabajadores, así que
 * esta lista **no ordena por puntos**: llega en el orden que da el
 * servidor y se pinta tal cual. Ordenarla por carga sería exactamente el
 * ranking que la regla prohíbe, aunque no dijera "ranking" en ninguna
 * parte.
 *
 * Los puntos miden trabajo humano activo, no consumo del plan (RN-CON-01)
 * ni productividad. El nivel —Baja, Normal, Alta, Muy alta— sale de
 * `loadLevel()`, con los cortes de §14.4.
 */
const TONO: Readonly<Record<LoadLevel, "success" | "neutral" | "warning" | "danger">> = {
  low: "success",
  normal: "neutral",
  high: "warning",
  very_high: "danger",
};

export function TeamLoad({
  members,
}: {
  members: readonly {
    readonly userId: string;
    readonly name: string;
    readonly points: number;
    readonly level: LoadLevel;
  }[];
}) {
  return (
    <ul className="flex flex-col">
      {members.map((member) => (
        <li
          key={member.userId}
          className="flex items-center gap-3 border-b border-border py-3 last:border-b-0"
        >
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-soft-surface text-text-secondary"
          >
            <Icon name="person" className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">
            {member.name}
          </span>
          <span className="shrink-0 text-sm text-text-secondary">
            {es.spaceHome.teamLoad.points(member.points)}
          </span>
          <StatusBadge tone={TONO[member.level]}>
            {es.space.jobs.loadLevels[member.level]}
          </StatusBadge>
        </li>
      ))}
    </ul>
  );
}
