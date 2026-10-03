"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui";

/**
 * El botón «Cancelar mi reserva». Se desactiva mientras se envía: pulsar dos veces no manda dos peticiones (y aunque
 * las mandara, la base de datos lo trata como una sola cancelación).
 */
export function CancelButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" pending={pending} className="min-h-12 w-full text-base">
      {pending ? pendingLabel : label}
    </Button>
  );
}
