import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button, Card } from "@/components/ui";
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
  const { data: memberships } = await supabase
    .from("space_memberships")
    .select("role, spaces(name, slug)")
    .eq("user_id", user.id)
    .eq("status", "active");

  const spaces = (memberships ?? [])
    .map((m) => m.spaces)
    .filter((s): s is { name: string; slug: string } => Boolean(s));

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
  const { data: establishments } = await supabase
    .from("establishments")
    .select("id, name, spaces(slug)")
    .order("name");

  const restaurants = (establishments ?? []).filter(
    (e): e is { id: string; name: string; spaces: { slug: string } } => Boolean(e.spaces),
  );

  if (restaurants.length > 0) {
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
              href={`/espacios/${restaurant.spaces.slug}/restaurantes/${restaurant.id}`}
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
