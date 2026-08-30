import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui";
import { es } from "@/i18n/es";
import { signOut } from "./(auth)/actions";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="mb-2 text-2xl font-bold text-primary-dark">{es.common.appName}</h1>
      <p className="mb-1 text-text">
        {es.home.signedInAs} {user.email}.
      </p>
      <p className="mb-6 text-sm text-text-secondary">{es.home.placeholderNote}</p>
      <form action={signOut}>
        <Button type="submit" variant="secondary">
          {es.home.signOut}
        </Button>
      </form>
    </main>
  );
}
