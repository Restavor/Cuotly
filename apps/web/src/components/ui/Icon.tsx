import type { SVGProps } from "react";

/**
 * El juego de iconos del sistema, dibujado aquí y no traído de una
 * librería.
 *
 * Por qué propio: son veintitantos trazos: una dependencia de iconos
 * entera pesa más que este archivo, y sobre todo obliga a que cada
 * pantalla elija el suyo de un catálogo de miles, que es como acaban
 * conviviendo tres iconos distintos para "solicitud". Aquí el catálogo es
 * cerrado y la lista de nombres es un tipo: un icono que no existe no
 * compila.
 *
 * Todos comparten rejilla de 24, trazo de 1.5 y `currentColor`, así que el
 * color lo pone siempre la clase de texto de quien lo usa —nunca un
 * hexadecimal— y el icono hereda la paleta Emerald Control sin saber nada
 * de ella (CLAUDE.md, regla de estilo).
 *
 * Son decoración: van con `aria-hidden` salvo que quien lo pinte le dé un
 * `<title>`. El significado lo lleva siempre el texto de al lado (PRD
 * §21.4: el estado se expresa con texto e icono, nunca solo con color).
 */
const PATHS = {
  home: "M3 10.5 12 3l9 7.5M5.25 9.75V20a1 1 0 0 0 1 1h3.5v-5.5h4.5V21h3.5a1 1 0 0 0 1-1V9.75",
  building:
    "M4 21V5.5A1.5 1.5 0 0 1 5.5 4h6A1.5 1.5 0 0 1 13 5.5V21M13 10h5.5A1.5 1.5 0 0 1 20 11.5V21M3 21h18M7 8h2M7 12h2M7 16h2M16 14h1M16 17.5h1",
  request:
    "M9 4.5H7.5A1.5 1.5 0 0 0 6 6v13.5A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H15M9 4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5v.75a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 9 5.25ZM9 11h6M9 15h4",
  job: "M14.5 3.5a4.5 4.5 0 0 0-5.9 5.8L3.7 14.2a1.8 1.8 0 0 0 2.5 2.5l4.9-4.9a4.5 4.5 0 0 0 5.8-5.9l-2.7 2.7-2.2-.6-.6-2.2ZM14 14l5.5 5.5M16.5 11.5 21 16",
  task: "M4 6.5 6 8.5 9.5 5M4 12.5l2 2L9.5 11M4 18.5l2 2 3.5-3.5M13 6.5h7M13 13h7M13 19.5h7",
  dailyMenu:
    "M6 3v7a2 2 0 0 0 4 0V3M8 10v11M17.5 3c-1.4 1-2.2 2.7-2.2 4.6 0 1.6.6 2.7 1.7 3.2V21",
  messages:
    "M20 13.5a2.5 2.5 0 0 1-2.5 2.5H9l-4 3.5V6.5A2.5 2.5 0 0 1 7.5 4h10A2.5 2.5 0 0 1 20 6.5Z",
  calendar:
    "M4.5 8.5h15M6.5 4.5v-2M17.5 4.5v-2M6 21h12a2 2 0 0 0 2-2V6.5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2ZM8.5 12.5h2M8.5 16.5h2M13.5 12.5h2",
  finance:
    "M15.5 8A5 5 0 1 0 15.5 16M6.5 10.5h6M6.5 13.5h6",
  reports: "M4 20h16M7.5 20v-6M12 20V6M16.5 20v-9",
  team: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20.5a6.5 6.5 0 0 1 13 0M16 4.7a3.5 3.5 0 0 1 0 6.6M18 14.5a6.5 6.5 0 0 1 3.5 6",
  plans:
    "M12 2.5 21 7l-9 4.5L3 7ZM3 12l9 4.5L21 12M3 17l9 4.5L21 17",
  agent:
    "M12 3.5 13.6 8 18 9.6 13.6 11.2 12 15.6 10.4 11.2 6 9.6 10.4 8ZM18.5 15.5l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7ZM5.5 14l.6 1.5 1.5.6-1.5.6L5.5 18l-.6-1.3-1.5-.6 1.5-.6Z",
  settings:
    "M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM19.6 14.4a1.4 1.4 0 0 0 .3 1.6l.1.1a1.7 1.7 0 1 1-2.4 2.4l-.1-.1a1.4 1.4 0 0 0-2.4 1v.3a1.7 1.7 0 1 1-3.4 0v-.2a1.4 1.4 0 0 0-2.4-1l-.1.1a1.7 1.7 0 1 1-2.4-2.4l.1-.1a1.4 1.4 0 0 0-1-2.4h-.3a1.7 1.7 0 1 1 0-3.4h.2a1.4 1.4 0 0 0 1-2.4l-.1-.1a1.7 1.7 0 1 1 2.4-2.4l.1.1a1.4 1.4 0 0 0 1.6.3h.1a1.4 1.4 0 0 0 .9-1.3v-.3a1.7 1.7 0 1 1 3.4 0v.2a1.4 1.4 0 0 0 2.4 1l.1-.1a1.7 1.7 0 1 1 2.4 2.4l-.1.1a1.4 1.4 0 0 0 1 2.4h.3a1.7 1.7 0 1 1 0 3.4h-.2a1.4 1.4 0 0 0-1.3.9Z",
  search: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM20 20l-4.9-4.9",
  bell: "M18 9a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16S18 14 18 9ZM10.3 19a2 2 0 0 0 3.4 0",
  plus: "M12 5.5v13M5.5 12h13",
  chevronDown: "m7 10 5 5 5-5",
  chevronRight: "m10 6 6 6-6 6",
  arrowRight: "M4.5 12h15M13.5 6l6 6-6 6",
  switchSpace: "M4 8h13l-3-3M20 16H7l3 3",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.5V12l3 1.8",
  alert: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.5V13M12 16.2v.1",
  check: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8.2 12.3l2.6 2.6 5-5.4",
  person: "M12 12.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.5a7.5 7.5 0 0 1 15 0",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  className = "h-5 w-5",
  title,
  ...rest
}: { name: IconName; title?: string } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title === undefined ? true : undefined}
      role={title === undefined ? undefined : "img"}
      {...rest}
    >
      {title === undefined ? null : <title>{title}</title>}
      <path d={PATHS[name]} />
    </svg>
  );
}
