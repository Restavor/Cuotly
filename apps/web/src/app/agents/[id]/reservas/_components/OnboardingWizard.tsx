"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button, EmptyState } from "@/components/ui";
import { es } from "@/i18n/es";
import type { RestaurantSchedule } from "@/services/reservations-gateway";

import { completeOnboardingAction, saveSettingsAction, saveShiftsAction } from "../actions";
import { draftIssues, emptyDraft, ShiftCard, Stepper, toDraft, toInputs, type DraftShift } from "./ScheduleParts";
import { withSavedIds } from "./schedule-draft";

/**
 * Primer uso (RES-13; PRD de agents §5.1 y §11.1, `PrimerUso`): días y turnos → aforo y
 * grupos → equipo y tablet → agente. Los dos primeros pasos configuran de verdad; el equipo
 * con PIN y la tablet (Fase D) y el agente (Fase G) todavía no existen y el paso lo dice, no
 * los simula. Al terminar queda `onboarding_completed_at` y Hoy deja de mandar aquí.
 */
export function OnboardingWizard({
  establishmentId,
  schedule,
  todayHref,
}: {
  establishmentId: string;
  schedule: RestaurantSchedule;
  todayHref: string;
}) {
  const t = es.agents.agenda.onboarding;
  const h = es.agents.agenda.hours;
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [step, setStep] = useState(0);
  const [shifts, setShifts] = useState<readonly DraftShift[]>(() => schedule.shifts.filter((s) => s.active).map(toDraft));
  const [threshold, setThreshold] = useState(schedule.largeGroupThreshold);
  const [error, setError] = useState<string | null>(null);
  const total = t.steps.length;

  function update(key: string, next: DraftShift) {
    setShifts((current) => current.map((s) => (s.key === key ? next : s)));
  }

  function next() {
    setError(null);
    if (step === 0) {
      if (shifts.length === 0) return setError(t.needShift);
      // El aforo se pide en el paso siguiente: aquí se valida lo demás con un aforo de relleno.
      const issues = draftIssues(shifts.map((s) => ({ ...s, capacity: s.capacity || "1" })));
      if (issues.length > 0) return setError(issues[0]);
      setStep(1);
      return;
    }
    if (step === 1) {
      if (shifts.some((s) => !(Number(s.capacity) > 0))) return setError(t.needCapacity);
      startTransition(async () => {
        const shiftsResult = await saveShiftsAction({ establishmentId, shifts: toInputs(shifts) });
        if (!shiftsResult.ok) return setError(shiftsResult.message);
        // Si se vuelve «Atrás» y se guarda otra vez, los turnos nuevos ya existen: se actualizan, no se crean de nuevo.
        setShifts((current) => withSavedIds(current, shiftsResult.shiftIds));
        const settingsResult = await saveSettingsAction({
          establishmentId,
          settings: {
            slotInterval: schedule.slotInterval,
            largeGroupThreshold: threshold,
            minNoticeMinutes: schedule.minNoticeMinutes,
            maxAdvanceDays: schedule.maxAdvanceDays,
            customerCancelLimitMinutes: schedule.customerCancelLimitMinutes,
          },
        });
        if (!settingsResult.ok) return setError(settingsResult.message);
        router.refresh();
        setStep(2);
      });
      return;
    }
    setStep(step + 1);
  }

  function finish() {
    setError(null);
    startTransition(async () => {
      const result = await completeOnboardingAction({ establishmentId });
      if (!result.ok) return setError(result.message);
      router.push(todayHref);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-sm font-semibold text-text-secondary">
          {t.title} · {t.step(step + 1, total)}
        </p>
        <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-soft-surface">
          <span className="block h-full rounded-full bg-primary" style={{ width: `${((step + 1) / total) * 100}%` }} />
        </div>
        <ol aria-label={t.stepsLabel} className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {t.steps.map((label, index) => (
            <li key={label} aria-current={index === step ? "step" : undefined} className={index === step ? "font-semibold text-primary" : index < step ? "text-text" : "text-text-secondary"}>
              <b className="mr-1.5">{index < step ? "✓" : index + 1}</b>
              {label}
            </li>
          ))}
        </ol>
      </div>

      {step === 0 ? (
        <section className="space-y-4" aria-labelledby="ob-0">
          <h1 id="ob-0" className="text-[22px] font-bold text-primary-dark sm:text-[28px]">{t.daysTitle}</h1>
          {shifts.map((shift) => (
            <ShiftCard
              key={shift.key}
              shift={shift}
              withCapacity={false}
              onChange={(nextShift) => update(shift.key, nextShift)}
              onRemove={() => setShifts((c) => c.filter((s) => s.key !== shift.key))}
            />
          ))}
          <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => setShifts((c) => [...c, emptyDraft(h.newShiftName)])}>
            {h.addShift}
          </Button>
          <p className="text-sm text-text-secondary">{t.daysHint}</p>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="space-y-4" aria-labelledby="ob-1">
          <h1 id="ob-1" className="text-[22px] font-bold text-primary-dark sm:text-[28px]">{t.capacityTitle}</h1>
          {shifts.map((shift) => (
            <div key={shift.key} className="space-y-2">
              <h2 className="text-base font-semibold">{shift.name}</h2>
              <ShiftCard shift={shift} withDays={false} withTimes={false} onChange={(nextShift) => update(shift.key, nextShift)} />
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-4">
            <span className="text-sm font-semibold">{h.groupThreshold}</span>
            <Stepper label={h.groupThreshold} value={threshold} onChange={setThreshold} min={2} />
          </div>
          <p className="text-sm text-text-secondary">{h.groupHint(threshold)}</p>
          <p className="text-sm text-text-secondary">{t.capacityHint}</p>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="space-y-4" aria-labelledby="ob-2">
          <h1 id="ob-2" className="text-[22px] font-bold text-primary-dark sm:text-[28px]">{t.teamTitle}</h1>
          <EmptyState title={t.teamTitle} description={t.teamReason} />
        </section>
      ) : null}

      {step === 3 ? (
        <section className="space-y-4" aria-labelledby="ob-3">
          <h1 id="ob-3" className="text-[22px] font-bold text-primary-dark sm:text-[28px]">{t.agentTitle}</h1>
          <EmptyState title={t.agentTitle} description={t.agentReason} />
          <p className="text-sm text-text-secondary">{t.finishHint}</p>
        </section>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex justify-between gap-3">
        <Button type="button" variant="secondary" className="min-h-[48px]" disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>
          {t.back}
        </Button>
        {step < total - 1 ? (
          <Button type="button" className="min-h-[48px]" pending={busy} onClick={next}>
            {t.next}
          </Button>
        ) : (
          <Button type="button" className="min-h-[48px]" pending={busy} onClick={finish}>
            {t.finish}
          </Button>
        )}
      </div>
    </div>
  );
}
