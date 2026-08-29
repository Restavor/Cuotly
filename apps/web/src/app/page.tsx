import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
    <main style={{ padding: "2rem" }}>
      <h1>Cuotly</h1>
      <p>Has entrado como {user.email}.</p>
      <p>
        Todavía no hay más funcionalidad — esto es la evidencia del Hito 1:
        el registro y el inicio de sesión funcionan de verdad.
      </p>
      <form action={signOut}>
        <button type="submit">Cerrar sesión</button>
      </form>
    </main>
  );
}
