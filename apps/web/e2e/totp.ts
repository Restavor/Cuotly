import { createHmac } from "node:crypto";

/**
 * El código de seis cifras de una app autenticadora (RFC 6238: HMAC-SHA1, pasos de 30 segundos), para entrar con el
 * segundo paso en los e2e. El secreto es el de PRUEBA que siembra `supabase/seed/reservas-demo.sql` para
 * `soporte@cuotly.test`; no es de ninguna cuenta real.
 */
export const SECRETO_SOPORTE = "RESTAVORSOPORTEPRUEBASSEGUNDOPAS";

function base32(texto: string): Buffer {
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of texto.replace(/=+$/, "").toUpperCase()) bits += alfabeto.indexOf(c).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function codigoTotp(secreto: string = SECRETO_SOPORTE, ahora: number = Date.now()): string {
  const paso = Math.floor(ahora / 1000 / 30);
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(paso));
  const h = createHmac("sha1", base32(secreto)).update(contador).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}
