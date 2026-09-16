import { ErrorState } from "@/components/ui";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { myConversations } from "@/services/global-gateway";

import { MessagesBoard } from "./MessagesBoard";

/**
 * G07 y G08 · la bandeja global (RN-GLO-05).
 *
 * Reúne, no duplica: son **las mismas** conversaciones de RN-MSG, con las
 * mismas políticas, los mismos diez minutos de edición y la misma
 * imposibilidad de borrar. Aquí no se abre ninguna conversación nueva.
 */
export const dynamic = "force-dynamic";

export default async function GlobalMessagesPage() {
  const supabase = await createClient();
  const conversaciones = await myConversations(supabase).catch(() => null);
  const t = es.globalContext.messages;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-primary-dark">{t.title}</h1>
        <p className="text-sm text-text-secondary">{t.subtitle}</p>
      </header>

      {conversaciones === null ? (
        <ErrorState title={t.failedTitle} description={t.failedReason} />
      ) : (
        <MessagesBoard conversations={conversaciones} />
      )}

      <p className="text-sm text-text-secondary">{t.sameConversations}</p>
    </div>
  );
}
