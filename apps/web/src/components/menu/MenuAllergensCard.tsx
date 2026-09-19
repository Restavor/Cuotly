import { Card } from "@/components/ui";
import { es } from "@/i18n/es";

const t = es.allergens;

/**
 * §39 · la nota de alérgenos de un menú, para quien lo LEE (el restaurante
 * y el equipo). El editor es otra pantalla.
 *
 * Desde la decisión 47 es **una sola nota de texto libre para todo el
 * menú** (RN-ALE-01), no una declaración plato a plato: lo manda el diseño
 * definitivo móvil, página 125.
 *
 * Dos cosas que esta tarjeta hace a propósito:
 *
 *   · **El título dice "según la información proporcionada"**, que es el
 *     del diseño y además es lo único que Cuotly puede prometer: la nota
 *     la escribe el restaurante y aquí no se comprueba (RN-ALE-03).
 *   · **Un menú sin nota no dice "no lleva alérgenos"**: dice que nadie la
 *     ha escrito. Las dos frases se parecen y significan lo contrario para
 *     quien tiene una alergia.
 */
export function MenuAllergensCard({ note }: { note: string | null }) {
  const escrita = (note ?? "").trim();

  if (escrita === "") {
    return (
      <Card title={t.title}>
        <p className="font-medium text-text">{t.empty}</p>
        <p className="mt-1 text-sm text-text-secondary">{t.emptyReason}</p>
      </Card>
    );
  }

  return (
    <Card title={t.title}>
      <p className="text-sm text-text">{escrita}</p>
      <p className="mt-4 text-sm text-text-secondary">{t.whoseResponsibility}</p>
    </Card>
  );
}
