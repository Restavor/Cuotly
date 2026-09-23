import { redirect } from "next/navigation";

/**
 * Maqueta 13 · el catálogo de condiciones vive ahora en la pestaña
 * Versiones de Planes y servicios (M55), con el historial de cada plan y
 * servicio y el formulario para publicar la siguiente. Esta ruta se
 * conserva por los enlaces guardados y lleva allí.
 */
export default async function ConditionsCataloguePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/espacios/${slug}/planes?tab=versiones`);
}
