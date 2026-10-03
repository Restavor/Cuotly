"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import {
  parseChange,
  REALTIME_EVENT,
  shouldAnnounce,
  shouldReload,
  type ReservationsChange,
} from "@/core/reservations/realtime";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/client";

import { LOCAL_CHANGE_EVENT, localBusName } from "./local-change";

/** Un pitido corto. Si el navegador no deja sonar sin un gesto previo, no pasa nada: queda la barra. */
function beep(): void {
  try {
    const AudioCtx = window.AudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
    window.setTimeout(() => void ctx.close(), 400);
  } catch {
    /* sin sonido */
  }
}

/**
 * Tiempo real de la agenda (RES-11, RN-RES-13). Escucha el canal secreto del restaurante
 * —Supabase Broadcast— y, cuando avisa de un cambio en la fecha que se mira, vuelve a
 * pedir los datos al servidor: el canal no lleva datos, solo el aviso. Una reserva nueva
 * enseña la barra «Hay una reserva nueva» con un pitido corto.
 *
 * Sin canal (`channel === null`, la versión falsa en local) usa `BroadcastChannel` del
 * navegador: avisa a las demás pestañas del mismo navegador y nada más.
 */
export function RealtimeRefresh({
  establishmentId,
  channel,
  viewingDate,
}: {
  establishmentId: string;
  /** El nombre secreto del canal, o `null` sin clave del servidor. */
  channel: string | null;
  /** La fecha que se mira, o `null` si la pantalla depende de todas (el calendario). */
  viewingDate: string | null;
}) {
  const router = useRouter();
  const t = es.agents.agenda.realtime;
  const [announcement, setAnnouncement] = useState(false);
  const busRef = useRef<BroadcastChannel | null>(null);

  const handle = useCallback(
    (change: ReservationsChange | null) => {
      if (change === null) return;
      if (shouldReload(change, viewingDate)) router.refresh();
      if (shouldAnnounce(change, viewingDate)) {
        setAnnouncement(true);
        beep();
      }
    },
    [router, viewingDate],
  );

  useEffect(() => {
    if (channel !== null) {
      const supabase = createClient();
      const sub = supabase
        .channel(channel)
        .on("broadcast", { event: REALTIME_EVENT }, ({ payload }) => handle(parseChange(payload)))
        .subscribe();
      const onLocal = (event: Event) => {
        // Con canal, el servidor ya avisó a todos; aquí solo se refresca quien actuó.
        const detail = (event as CustomEvent<ReservationsChange>).detail;
        if (shouldReload(detail, viewingDate)) router.refresh();
      };
      window.addEventListener(LOCAL_CHANGE_EVENT, onLocal);
      return () => {
        window.removeEventListener(LOCAL_CHANGE_EVENT, onLocal);
        void supabase.removeChannel(sub);
      };
    }

    // Versión falsa: BroadcastChannel entre pestañas del mismo navegador.
    if (typeof BroadcastChannel === "undefined") return;
    const bus = new BroadcastChannel(localBusName(establishmentId));
    busRef.current = bus;
    bus.onmessage = (message: MessageEvent) => handle(parseChange(message.data));
    const onLocal = (event: Event) => {
      // El aviso a las demás pestañas ya lo hizo `announceLocalChange`; aquí solo se refresca esta.
      const detail = (event as CustomEvent<ReservationsChange>).detail;
      if (shouldReload(detail, viewingDate)) router.refresh();
    };
    window.addEventListener(LOCAL_CHANGE_EVENT, onLocal);
    return () => {
      window.removeEventListener(LOCAL_CHANGE_EVENT, onLocal);
      bus.close();
      busRef.current = null;
    };
  }, [channel, establishmentId, handle, router, viewingDate]);

  if (!announcement) return null;
  return (
    <div
      role="status"
      className="mb-4 flex items-center gap-3 rounded-xl border border-agent-on-border bg-agent-on-bg px-4 py-3 text-sm text-agent-on-text"
    >
      <Icon name="bell" className="h-5 w-5 shrink-0" />
      <span className="flex-1 font-semibold">{t.newReservation}</span>
      <button
        type="button"
        onClick={() => {
          setAnnouncement(false);
          router.refresh();
        }}
        className="min-h-[44px] rounded-field px-3 font-semibold underline"
      >
        {t.view}
      </button>
      <button
        type="button"
        aria-label={t.close}
        onClick={() => setAnnouncement(false)}
        className="flex h-11 w-11 items-center justify-center rounded-field"
      >
        <Icon name="close" className="h-4 w-4" />
      </button>
    </div>
  );
}
