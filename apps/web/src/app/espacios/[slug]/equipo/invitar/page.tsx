import { redirect } from "next/navigation";

/**
 * HU-03 y HU-04 · la invitación vive ahora en la pestaña Invitaciones de
 * Equipo (M71), con la lista de pendientes encima. Esta ruta es el destino
 * de "Invitar a alguien al equipo" del botón Crear (§20.5) y de enlaces
 * guardados, así que se conserva y lleva allí.
 */
export default async function InvitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/espacios/${slug}/equipo?tab=invitaciones`);
}
