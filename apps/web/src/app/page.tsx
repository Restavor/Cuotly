import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button, Card } from "@/components/ui";
import { CreateRestavorCard } from "@/components/CreateRestavorCard";
import { es } from "@/i18n/es";
import { signOut } from "./(auth)/actions";

/**
 * Selector de contexto (PRD §20.1). Con un solo espacio, entra
 * directamente. Con varios, se elige. Con ninguno, solo el Propietario de
 * Cuotly ve el botón para crear el primero (Restavor).
 */
export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: memberships } = await supabase
    .from("space_memberships")
    .select("role, spaces(name, slug)")
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
