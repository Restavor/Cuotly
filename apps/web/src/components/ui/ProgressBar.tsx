/**
 * La barra de progreso del diseño ("Estado por restaurante" en M01, la
 * carga del equipo en M09, el estado de cobros en M16).
 *
 * Solo mide lo que tiene una regla escrita detrás: quien la pinta sabe
 * qué es el 100 %. Sin esa regla no se pinta una barra, porque un
 * porcentaje sin definición es un adorno que se lee como dato.
 */
export function ProgressBar({
  percent,
  tone = "green",
  label,
}: {
  /** De 0 a 100, ya calculado en el servidor. */
  percent: number;
  tone?: "green" | "info" | "danger";
  /** Lo que la barra significa, para quien no la ve. */
  label: string;
}) {
  const ancho = Math.max(0, Math.min(100, percent));
  const color = { green: "bg-cuotly-green", info: "bg-info", danger: "bg-danger" }[tone];
  return (
    <span
      role="img"
      aria-label={label}
      className="block h-2 w-full overflow-hidden rounded-full bg-soft-surface"
    >
      <span className={`block h-full rounded-full ${color}`} style={{ width: `${ancho}%` }} />
    </span>
  );
}
