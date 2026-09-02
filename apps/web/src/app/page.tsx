import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button, Card, ErrorState } from "@/components/ui";
import { CreateRestavorCard } from "@/components/CreateRestavorCard";
import { es } from "@/i18n/es";
import { signOut } from "./(auth)/actions";

/**
 * Selector de contexto (PRD §20.1, HU-02).
 *
 * Tiene DOS lados, y hasta la tercera revisión solo estaba hecho uno. El
 * equipo de mantenimiento entra por `space_memberships`; el cliente no
 * pertenece a ningún espacio —sus accesos viven en
 * `establishment_memberships` y `group_memberships`— así que miraba su
 * lista de espacios, la encontraba vacía y aterrizaba en "todavía no
 * tienes espacio", que es la pantalla del Propietario de Cuotly sin
 * espacios. HU-02 dice "usuario con varios contextos": para un cliente,
 * sus contextos son sus restaurantes.
 *
 * Qué restaurantes ve no lo decide esta pantalla: lo decide RLS con
 * `can_read_establishment()`. Aquí solo se pinta lo que la base de datos
 * devuelve.
 */
// Lo que se ve aquí depende de QUIÉN entra, así que esta pantalla no se
// cachea nunca. Era la única de todas las que leen datos de sesión que no
// lo declaraba; el resto (solicitudes, trabajos, finanzas, el restaurante
// del cliente…) sí.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // `user_id` va explícito, y no es redundante con RLS: la política de
  // `space_memberships` es `is_space_member(space_id)`, que deja ver a
  // TODO el equipo del espacio — tiene que hacerlo, o la pantalla de
  // equipo de HU-08 no funcionaría. Filtra por acceso, no por pertenencia
  // propia, que es lo que hace falta aquí.
  //
  // Sin esta línea, esta consulta devolvía una fila por cada miembro del
  // espacio, `spaces` salía con el mismo espacio repetido, y un espacio
  // con dos personas nunca redirigía: caía en la rama de "más de un
  // espacio" y pintaba el selector con el mismo nombre dos veces. Se
  // dispara con cualquier espacio real; no se vio antes porque el
  // proyecto no tenía datos.
  const { data: memberships, error: membershipsError } = await supabase
    .from("space_memberships")
    .select("role, spaces(name, slug)")
    .eq("user_id", user.id)
    .eq("status", "active");

  const spaces = (memberships ?? [])
    .map((m) => m.spaces)
    .filter((s): s is { name: string; slug: string } => Boolean(s));

  // Esta pantalla decide A DÓNDE ENTRA cada persona, así que equivocarse
  // aquí no es un detalle: es no poder entrar. Y hasta ahora se podía
  // equivocar en silencio de dos formas, las dos indistinguibles de "no
  // tienes nada":
  //
  //   · que la consulta fallara —una sesión que no cuaja, la base
  //     inalcanzable— y `memberships` viniera null;
  //   · que la consulta fuera bien pero el embed `spaces(...)` viniera
  //     null, que es lo que devuelve PostgREST cuando RLS tapa la tabla
  //     enlazada. Ya pasó una vez, con el cliente y su slug.
  //
  // En ambos casos se caía a la rama del cliente, se pintaba un selector
  // de restaurantes o "todavía no perteneces a ningún espacio", y ahí se
  // quedaba: sin redirigir, sin error y sin pista. CLAUDE.md lo prohíbe
  // con todas las letras — si no hay dato, se dice el motivo.
  const contextosIlegibles =
    Boolean(membershipsError) || ((memberships?.length ?? 0) > 0 && spaces.length === 0);

  if (contextosIlegibles) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <ErrorState
          title={es.contextSelector.loadErrorTitle}
          description={membershipsError?.message ?? es.contextSelector.loadErrorReason}
        />
      </main>
    );
  }

  if (spaces.length === 1) {
    redirect(`/espacios/${spaces[0].slug}`);
  }

  if (spaces.length > 1) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <h1 className="mb-1 text-2xl font-bold text-primary-dark">{es.contextSelector.title}</h1>
        <p className="mb-6 text-sm text-text-secondary">{es.contextSelector.subtitle}</p>
        <div className="space-y-3">
          {spaces.map((space) => (
            <Link key={space.slug} href={`/espacios/${space.slug}`}>
              <Card className="cursor-pointer hover:border-cuotly-green">{space.name}</Card>
            </Link>
          ))}
        </div>
        <p className="mt-6 text-center text-sm">
          <Link href="/cuenta/sesiones" className="text-cuotly-green underline">
            {es.contextSelector.sessionsLink}
          </Link>
        </p>
      </main>
    );
  }

  // El otro lado de HU-02: sin espacio de mantenimiento, los contextos son
  // los restaurantes a los que se tiene acceso.
  //
  // El slug del espacio NO puede salir de un embed `spaces(slug)`: la
  // política `spaces_select` exige ser MIEMBRO del espacio y el cliente no
  // lo es —sus accesos viven en `establishment_memberships`—, así que el
  // embed venía null, el filtro que lo exigía descartaba todas las filas y
  // esta pantalla, que existe precisamente para el cliente, no le enseñaba
  // ni un restaurante: caía en "todavía no tienes espacio".
  //
  // Se resuelve con `space_slug()`, la función SECURITY DEFINER que la
  // migración 20260830000036 creó para este mismo problema en la búsqueda
  // global. El slug no es un dato sensible: es el segmento de URL por el
  // que el cliente ya navega.
  const { data: establishments, error: establishmentsError } = await supabase
    .from("establishments")
    .select("id, name, space_id")
    .order("name");

  // Mismo motivo que arriba: sin esto, un error de red aquí le dice a un
  // cliente que no tiene restaurantes.
  if (establishmentsError) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <ErrorState
          title={es.contextSelector.loadErrorTitle}
          description={establishmentsError.message}
        />
      </main>
    );
  }

  const restaurants = await Promise.all(
    (establishments ?? []).map(async (e) => {
      const { data: slug } = await supabase.rpc("space_slug", { p_space_id: e.space_id });
      return slug ? { id: e.id, name: e.name, slug } : null;
    }),
  ).then((rows) => rows.filter((r): r is { id: string; name: string; slug: string } => r !== null));

  // PRD §20.1: "Con un solo contexto accesible se entra directamente. Con
  // varios, aparece un selector". Vale igual para los restaurantes del
  // cliente que para los espacios del equipo — antes se le enseñaba el
  // selector aunque tuviera uno solo, con un subtítulo que además le decía
  // que tenía acceso a más de uno.
  if (restaurants.length === 1) {
    redirect(`/espacios/${restaurants[0].slug}/restaurantes/${restaurants[0].id}`);
  }

  if (restaurants.length > 1) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <h1 className="mb-1 text-2xl font-bold text-primary-dark">
          {es.contextSelector.clientTitle}
        </h1>
        <p className="mb-6 text-sm text-text-secondary">{es.contextSelector.clientSubtitle}</p>
        <div className="space-y-3">
          {restaurants.map((restaurant) => (
            <Link
              key={restaurant.id}
              href={`/espacios/${restaurant.slug}/restaurantes/${restaurant.id}`}
            >
              <Card className="cursor-pointer hover:border-cuotly-green">{restaurant.name}</Card>
            </Link>
          ))}
        </div>
        <p className="mt-6 text-center text-sm">
          <Link href="/cuenta/sesiones" className="text-cuotly-green underline">
            {es.contextSelector.sessionsLink}
          </Link>
        </p>
      </main>
    );
  }

  const { data: isPlatformOwner } = await supabase.rpc("is_platform_owner");

  return (
    <main className="mx-auto max-w-xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <span className="text-sm text-text-secondary">
          {es.home.signedInAs} {user.email}
        </span>
        <form action={signOut}>
          <Button type="submit" variant="secondary">
            {es.home.signOut}
          </Button>
        </form>
      </div>

      {isPlatformOwner ? (
        <CreateRestavorCard />
      ) : (
        <Card title={es.platform.noSpaceYet.title} className="mt-16 text-center">
          <p className="text-sm text-text-secondary">{es.platform.noSpaceYet.description}</p>
        </Card>
      )}
    </main>
  );
}
