/**
 * CA-22 · "Contraste WCAG AA verificado".
 *
 * "Verificado" no puede significar que alguien lo miró: significa que hay
 * un número y una comprobación. Esto implementa la fórmula de WCAG 2.1
 * (luminancia relativa y razón de contraste) para poder afirmarlo con un
 * test sobre la paleta real de Emerald Control, en vez de confiar en que
 * los colores del PRD "se ven bien".
 *
 * Lógica pura, sin dependencias (CLAUDE.md: `src/core` no importa de
 * Supabase, Next ni React).
 */

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export function parseHex(hex: string): Rgb {
  const limpio = hex.trim().replace(/^#/, "");
  const completo =
    limpio.length === 3
      ? limpio
          .split("")
          .map((c) => c + c)
          .join("")
      : limpio;

  if (!/^[0-9a-fA-F]{6}$/.test(completo)) {
    throw new Error(`Color no válido: "${hex}"`);
  }

  return {
    r: parseInt(completo.slice(0, 2), 16),
    g: parseInt(completo.slice(2, 4), 16),
    b: parseInt(completo.slice(4, 6), 16),
  };
}

/** Luminancia relativa, WCAG 2.1 §Relative luminance. */
export function relativeLuminance(color: Rgb): number {
  const canal = (valor: number): number => {
    const s = valor / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(color.r) + 0.7152 * canal(color.g) + 0.0722 * canal(color.b);
}

/** Razón de contraste entre dos colores: de 1 (idénticos) a 21 (negro sobre blanco). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(parseHex(a));
  const lb = relativeLuminance(parseHex(b));
  const claro = Math.max(la, lb);
  const oscuro = Math.min(la, lb);
  return (claro + 0.05) / (oscuro + 0.05);
}

/**
 * Umbrales de WCAG 2.1 nivel AA: 4,5:1 para texto normal y 3:1 para texto
 * grande (a partir de 18,66 px en negrita o 24 px normal) y para
 * componentes de interfaz.
 */
export const AA_NORMAL_TEXT = 4.5;
export const AA_LARGE_TEXT = 3;

export function meetsAA(foreground: string, background: string, largeText = false): boolean {
  return contrastRatio(foreground, background) >= (largeText ? AA_LARGE_TEXT : AA_NORMAL_TEXT);
}
