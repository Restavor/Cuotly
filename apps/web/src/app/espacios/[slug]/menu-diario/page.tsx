import { Card, EmptyState } from "@/components/ui";
import { es } from "@/i18n/es";

/**
 * §20.2, la otra mitad de la misma frase: Menú Diario enseña su estructura
 * con el estado vacío.
 *
 * Los números que se citan en el texto —30 actualizaciones por ciclo,
 * tres plantillas iniciales— son RN-COM-09 y RN-COM-10, no invenciones, y
 * se cuentan en prosa: un contador a cero parecería un dato real cuando no
 * hay nada que contar.
 */
export const dynamic = "force-static";

export default function DailyMenuPage() {
  const bloques = [
    { title: es.dailyMenuPage.menusTitle, empty: es.dailyMenuPage.menusEmpty },
    { title: es.dailyMenuPage.templatesTitle, empty: es.dailyMenuPage.templatesEmpty },
    { title: es.dailyMenuPage.calendarTitle, empty: es.dailyMenuPage.calendarEmpty },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-bold text-primary-dark">{es.dailyMenuPage.title}</h1>
        <p className="text-sm text-text-secondary">{es.dailyMenuPage.subtitle}</p>
      </header>

      <Card title={es.dailyMenuPage.phaseTitle}>
        <p className="text-sm text-text-secondary">{es.dailyMenuPage.phaseReason}</p>
      </Card>

      {bloques.map((bloque) => (
        <Card key={bloque.title} title={bloque.title}>
          <EmptyState title={bloque.empty} description={es.dailyMenuPage.notBuiltReason} />
        </Card>
      ))}
    </div>
  );
}
