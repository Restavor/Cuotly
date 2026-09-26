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
  // Fase 4 · Hito 21 · el centro de ayuda (§133): un interrogante en su círculo.
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.5 9.5a2.5 2.5 0 1 1 3.6 2.25c-.7.35-1.1.9-1.1 1.6v.4M12 17h.01",
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
  arrowLeft: "M19.5 12h-15M10.5 6l-6 6 6 6",
  arrowUp: "M12 19.5v-15M6 10.5l6-6 6 6",
  arrowDown: "M12 4.5v15M6 13.5l6 6 6-6",
  // La flecha de bajar, que es la de `upload` del revés. No se reutiliza
  // aquella girada con una clase: subir y descargar aparecen en la misma
  // pantalla (los adjuntos de una solicitud) y dos flechas que solo se
  // distinguen por una rotación se leen igual de rápido que ninguna.
  download: "M12 3.5v12M8 11.5l4 4 4-4M4.5 14.5v4a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4",
  switchSpace: "M4 8h13l-3-3M20 16H7l3 3",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.5V12l3 1.8",
  alert: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.5V13M12 16.2v.1",
  check: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8.2 12.3l2.6 2.6 5-5.4",
  person: "M12 12.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.5a7.5 7.5 0 0 1 15 0",
  // La chincheta de la ciudad, en el encabezado de la ficha (página 24).
  location:
    "M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  crown: "M4 19h16M4 19V8l4.5 3.5L12 4.5l3.5 7L20 8v11",
  document:
    "M13 3H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8Zm0 0v5h5M9.5 13h5M9.5 16.5h3",
  upload: "M12 15.5v-12M8 7.5 12 3.5l4 4M4.5 14.5v4a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4",
  database:
    "M12 7.5c4.1 0 7.5-1 7.5-2.25S16.1 3 12 3 4.5 4 4.5 5.25 7.9 7.5 12 7.5ZM4.5 5.25v13.5C4.5 20 7.9 21 12 21s7.5-1 7.5-2.25V5.25M4.5 12c0 1.25 3.4 2.25 7.5 2.25s7.5-1 7.5-2.25",
  image:
    "M5 5h14a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5v-11A1.5 1.5 0 0 1 5 5ZM9 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM3.5 16.5 8 12.5l3.5 3 3-2.5 4.5 4",
  close: "M6.5 6.5l11 11M17.5 6.5l-11 11",
  // Los tres nodos enlazados de "compartir" (RN-ARC-04). No se reutiliza
  // `upload`, que es la flecha de subir: subir un archivo y compartirlo
  // con el restaurante son dos operaciones distintas y en el mismo bloque.
  share:
    "M17.5 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM6.5 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM17.5 20.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM8.7 10.8l6.6-3.6M8.7 13.2l6.6 3.6",
  // La flecha que sale del recuadro: "esto se va de Cuotly". Se usa en el
  // enlace al sitio web del restaurante (§15.2), que abre una web ajena en
  // otra pestaña. No se reutiliza `arrowRight`, que es navegación dentro
  // de la aplicación.
  externalLink: "M14 4.5h5.5V10M19 5 12 12M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10",
  // El candado de "no te corresponde ver esto" (§20.7). Sustituye al emoji
  // 🔒 que pintaba `NoPermissionState`: cada sistema operativo lo dibuja a
  // su manera y desafinaba junto a los iconos de trazo del sistema.
  lock: "M7 10.5V8a5 5 0 0 1 10 0v2.5M6 10.5h12a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5v-7A1.5 1.5 0 0 1 6 10.5ZM12 14.5v2.5",
  /*
   * "Más", el quinto de la barra de móvil: los tres puntos del diseño.
   *
   * Existe porque hasta hoy ese destino pedía prestado el icono de "Crear"
   * (`plus`), y en la barra los dos salían uno al lado del otro: dos `+`
   * seguidos que significaban cosas distintas. Tres puntos son lo que
   * dibuja el diseño y lo que todo el mundo lee como "hay más aquí".
   */
  more: "M6 12h.01M12 12h.01M18 12h.01",
  /*
   * Los de la puerta de entrada (F01, A01 a A12): el sobre y el teléfono
   * de "Datos de tu solicitud", la "i" del aviso de A03, el triángulo de
   * "sin conexión" (A12), la marca suelta del círculo grande de A01 y A03,
   * y el círculo con aspa de "no aprobada" (A04).
   */
  mail: "M4.5 5.5h15A1.5 1.5 0 0 1 21 7v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17V7a1.5 1.5 0 0 1 1.5-1.5ZM3.5 6.5l8.5 6.5 8.5-6.5",
  phone:
    "M5.5 3.5h3l1.5 4.5-2 1.3a11 11 0 0 0 6.7 6.7l1.3-2 4.5 1.5v3a2 2 0 0 1-2 2A16.5 16.5 0 0 1 3.5 5.5a2 2 0 0 1 2-2Z",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5.5M12 7.8v.1",
  warning: "M10.3 4.2 2.8 17.5A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0ZM12 9.5V14M12 17.2v.1",
  tick: "M5 12.5l4.5 4.5L19 7",
  xCircle: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9 9l6 6M15 9l-6 6",
  // Decisión 67 · el DNI, CIF o NIF en "Datos de tu solicitud": la tarjeta
  // con la cara a un lado y dos líneas de texto al otro.
  idCard:
    "M4.5 5.5h15A1.5 1.5 0 0 1 21 7v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17V7a1.5 1.5 0 0 1 1.5-1.5ZM8.5 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM5.5 15.5a3 3 0 0 1 6 0M14 10h4M14 13.5h3",
  // La impresora del botón Imprimir del Menú Diario: la bandeja arriba, el
  // cuerpo y la hoja que sale por abajo.
  printer:
    "M7 8.5V3.5h10v5M7 17H5a1.5 1.5 0 0 1-1.5-1.5v-5.5A1.5 1.5 0 0 1 5 8.5h14a1.5 1.5 0 0 1 1.5 1.5v5.5A1.5 1.5 0 0 1 19 17h-2M7 13.5h10v7H7v-7Z",
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
