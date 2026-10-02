/**
 * `src/core/reservations/booking-input.ts` · lo que el formulario de Nueva reserva y de
 * Editar tiene que cumplir antes de llegar al servidor (RES-02, RES-04; PRD de agents §11.1):
 * nombre, teléfono o email, teléfono válido, personas, fecha y hora, nota de 300 como mucho.
 *
 * Es la primera comprobación, la que da el mensaje junto al campo. No autoriza nada: el
 * servidor la repite y `book_reservation` la repite otra vez en SQL.
 *
 * Lógica de dominio pura: sin Supabase, sin Next.js, sin React.
 */
import { isValidLocalDate, isValidLocalTime } from "./dates";
import type { LocalDate, LocalTime } from "./dates";
import { normalizePhoneE164 } from "./phone";

/** Un tope de cordura para que un número tecleado de más no llegue a la base de datos (no es una regla del PRD). */
export const MAX_PARTY_SIZE = 500;
export const MAX_NAME_LENGTH = 120;
export const MAX_NOTES_LENGTH = 300;

export type BookingField = "name" | "contact" | "phone" | "email" | "party" | "date" | "time" | "notes";

export interface RawReservationInput {
  readonly date: string;
  readonly time: string;
  readonly partySize: number | string;
  readonly name: string;
  readonly phone: string;
  readonly email: string;
  readonly notes: string;
  readonly language: string;
}

export interface ValidReservationInput {
  readonly date: LocalDate;
  readonly time: LocalTime;
  readonly partySize: number;
  readonly name: string;
  readonly phoneE164: string | null;
  readonly email: string | null;
  readonly notes: string | null;
  readonly language: "es" | "en";
}

/** Un email razonable: algo, una arroba, algo, un punto, algo. La verdad la dice quien lo recibe. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateReservationInput(raw: RawReservationInput): { readonly ok: true; readonly value: ValidReservationInput } | { readonly ok: false; readonly errors: Partial<Record<BookingField, true>> } {
  const errors: Partial<Record<BookingField, true>> = {};

  if (!isValidLocalDate(raw.date)) errors.date = true;
  if (!isValidLocalTime(raw.time)) errors.time = true;

  const party = typeof raw.partySize === "number" ? raw.partySize : Number(String(raw.partySize).trim());
  if (!Number.isInteger(party) || party < 1 || party > MAX_PARTY_SIZE) errors.party = true;

  const name = raw.name.trim();
  if (name === "" || name.length > MAX_NAME_LENGTH) errors.name = true;

  const phoneText = raw.phone.trim();
  const emailText = raw.email.trim();
  let phoneE164: string | null = null;
  if (phoneText !== "") {
    const phone = normalizePhoneE164(phoneText);
    if (phone.ok) phoneE164 = phone.value;
    else errors.phone = true;
  }
  if (emailText !== "" && !EMAIL.test(emailText)) errors.email = true;
  // El contacto es obligatorio: teléfono o email (RES-02). Si ya hay un error en uno de los dos, no se añade otro.
  if (phoneText === "" && emailText === "") errors.contact = true;

  const notes = raw.notes.trim();
  if (notes.length > MAX_NOTES_LENGTH) errors.notes = true;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      date: raw.date,
      time: raw.time,
      partySize: party,
      name,
      phoneE164,
      email: emailText === "" ? null : emailText,
      notes: notes === "" ? null : notes,
      language: raw.language === "en" ? "en" : "es",
    },
  };
}
