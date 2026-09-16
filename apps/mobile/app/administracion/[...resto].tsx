import { Body, Card, Screen, Title } from "../../src/components/ui";
import { es } from "../../src/i18n/es";

/**
 * RN-MOV-08 · el panel de Administración de Cuotly y Modo soporte no
 * están en la app: son de escritorio. Un enlace profundo de un aviso de
 * plataforma acaba aquí y lo dice.
 */
export default function AdminNotInApp() {
  return (
    <Screen title={es.notInApp.title}>
      <Card>
        <Title>{es.notInApp.title}</Title>
        <Body muted>{es.notInApp.adminPanel}</Body>
      </Card>
    </Screen>
  );
}
