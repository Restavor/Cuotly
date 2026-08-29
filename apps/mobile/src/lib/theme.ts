// Identidad visual "Emerald Control" — Especificación Maestra §146.
// Mismos valores que apps/web/src/app/globals.css, para que web y móvil se
// vean coherentes. Un único modo claro por ahora (§147: "sin modo oscuro
// inicial").
export const colors = {
  primaryDark: "#0B2F2A",
  primary: "#145C4E",
  cuotlyGreen: "#1D8A6A",
  accentGreen: "#32B889",

  background: "#F5F7F4",
  surface: "#FFFFFF",
  softSurface: "#EAF0EC",
  text: "#17211F",
  textSecondary: "#66736E",
  border: "#DDE5E1",

  success: "#168A6D",
  warning: "#D89524",
  danger: "#C84C4C",
  info: "#3976D4",
} as const;
