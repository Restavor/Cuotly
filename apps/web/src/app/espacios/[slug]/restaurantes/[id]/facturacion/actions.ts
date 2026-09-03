"use server";

import { revalidatePath } from "next/cache";

import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import type { ReceiptState } from "./action-state";

/**
 * HU-26 / RN-FIN-06 · el restaurante envía un justificante de un cobro.
 *
 * Subirlo **no salda nada**: la confirmación del cobro siempre es del
 * equipo, y `upload_payment_receipt()` escribe en `receipts` sin tocar el
 * libro de apuntes ni `payment_confirmations`. Que eso quede claro en la
 * pantalla es parte de la regla, no cortesía.
 *
 * El archivo llega ya subido y registrado; aquí solo viaja su
 * identificador. Quién puede adjuntarlo lo comprueba el servidor:
 * `register_file()` exige `can_write_file(establecimiento, 'billing')`
 * —que del lado cliente incluye `client_can_view_billing()` (RN-FIN-07)—
 * y `upload_payment_receipt()` lo vuelve a comprobar además de exigir que
 * el archivo sea de ese mismo establecimiento.
 */
export async function uploadReceipt(
  _prev: ReceiptState,
  formData: FormData,
): Promise<ReceiptState> {
  const chargeId = String(formData.get("chargeId") ?? "").trim();
  const fileId = String(formData.get("receiptFileId") ?? "").trim();

  if (!chargeId) return { error: es.clientArea.receiptMissingCharge, done: false };
  if (!fileId) return { error: es.clientArea.receiptMissingFile, done: false };

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("upload_payment_receipt", {
      p_charge_id: chargeId,
      p_file_id: fileId,
    });

    if (error) return { error: error.message, done: false };
  } catch (fallo) {
    // Una excepción aquí saldría como un 500 y `useActionState` dejaría la
    // pantalla igual que estaba, que es indistinguible de "no pasó nada".
    return { error: fallo instanceof Error ? fallo.message : String(fallo), done: false };
  }

  revalidatePath("/espacios", "layout");
  return { error: null, done: true };
}
