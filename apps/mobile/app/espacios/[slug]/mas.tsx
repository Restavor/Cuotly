import { useRouter } from "expo-router";

import { moreDestinations } from "@/components/shell/navigation";

import { Body, Button, Card, Loading, Screen, Title } from "../../../src/components/ui";
import { es } from "../../../src/i18n/es";
import { useAuth } from "../../../src/lib/auth-context";
import { useSpace } from "../../../src/lib/space-context";

/**
 * §21 · "Más" es lo que no cabe en los cinco: se deriva de la misma
 * función que en la web (RN-MOV-02), y no se escribe a mano.
 */
export default function MoreScreen() {
  const { viewer } = useSpace();
  const { session, signOut } = useAuth();
  const router = useRouter();
  if (!viewer) return <Loading />;

  const destinations = moreDestinations(viewer.slug, viewer.role, viewer.establishmentId);
  return (
    <Screen title={es.more.title}>
      {destinations.map((d) => (
        <Card key={d.key} onPress={() => router.push(d.href as never)} testID={`mas-${d.key}`}>
          <Title>{d.label}</Title>
        </Card>
      ))}
      <Card>
        <Title>{es.more.account}</Title>
        <Body muted>{es.common.signedInAs(session?.user.email ?? "")}</Body>
        <Button label={es.common.signOut} onPress={() => void signOut().then(() => router.replace("/login"))} kind="secondary" />
      </Card>
    </Screen>
  );
}
