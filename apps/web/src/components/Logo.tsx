import { es } from "@/i18n/es";

export function Logo() {
  return (
    <div className="mb-8 flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-soft-surface text-lg font-bold text-primary-dark">
        C
      </div>
      <div className="text-xl font-bold text-primary-dark">{es.common.appName}</div>
    </div>
  );
}
