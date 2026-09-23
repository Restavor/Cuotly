import { LoadingState } from "@/components/ui";
import { es } from "@/i18n/es";

/** La ficha de un trabajo mientras carga. Sin esto heredaría la de la bandeja (A15). */
export default function JobLoading() {
  return <LoadingState title={es.teamArea.jobs.loadingDetail} />;
}
