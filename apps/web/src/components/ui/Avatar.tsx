import { es } from "@/i18n/es";

/**
 * La cara de una persona del equipo, en las tablas (M09, M11, M19) y en
 * las listas de carga (M01). Cuotly no guarda fotos de perfil, así que lo
 * que se pinta son las **iniciales** sobre un círculo verde suave: no un
 * retrato de archivo, que sería un dato de adorno (CLAUDE.md MUST NOT).
 *
 * Nunca se pinta para el cliente: el cliente no ve la identidad de nadie
 * del equipo (CLAUDE.md MUST NOT), así que en sus pantallas no hay
 * avatar que pintar. Esto es para las pantallas del equipo.
 */
export function initials(name: string): string {
  const partes = name
    .trim()
    .split(/\s+/)
    .filter((parte) => parte !== "");
  if (partes.length === 0) return "?";
  const primera = partes[0]?.[0] ?? "";
  const segunda = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? "") : "";
  return `${primera}${segunda}`.toUpperCase();
}

export function Avatar({
  name,
  size = 32,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={es.ui.avatarOf(name)}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) }}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full bg-primary/10 font-semibold leading-none text-primary-dark ${className}`}
    >
      {initials(name)}
    </span>
  );
}

/** Avatar y nombre al lado, como en una celda de tabla. */
export function PersonCell({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-2">
      <Avatar name={name} size={size} />
      <span className="truncate text-sm text-text">{name}</span>
    </span>
  );
}
