import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";

import { addBusinessMinutes, contractualCalendar, holidaysKnownAsOf, type HolidayRecord } from "@/core/business-clock";
import { FREE_CORRECTION_WINDOW_BUSINESS_HOURS } from "@/core/free-correction";

import { Badge, Body, Button, CacheNotice, Card, Choice, ErrorBox, Field, Loading, Notice, Row, Screen, Title } from "../../../../src/components/ui";
import { es, web } from "../../../../src/i18n/es";
import { fromError, must } from "../../../../src/lib/api";
import { pickPhoto, takePhoto, uploadImage, type PickResult } from "../../../../src/lib/files";
import { whenAt } from "../../../../src/lib/format";
import { supabase } from "../../../../src/lib/supabase";
import { useSpace } from "../../../../src/lib/space-context";
import { useAction } from "../../../../src/lib/use-action";
import { useLoader } from "../../../../src/lib/use-loader";

type Candidate = { worker_id: string; active_job_count: number; active_load_points: number; name: string };

type Detail = {
  id: string;
  code: string;
  state: string;
  category: string;
  assigned_to: string | null;
  establishment_id: string;
  request_id: string | null;
  started_at: string | null;
  published_at: string | null;
  correction_window_ends_at: string | null;
  establishmentName: string;
  description: string;
  candidates: Candidate[];
  quoteGate: { can_start: boolean; requires_payment_before_start: boolean; paid: boolean } | null;
  evidenceCount: number;
};

const BLOCK_REASONS = ["client_information", "external_incident", "authorized_pause", "financial_hold"] as const;
type BlockReason = (typeof BLOCK_REASONS)[number];

async function loadDetail(id: string): Promise<Detail> {
  const { data, error } = await supabase
    .from("jobs")
    .select("id, code, state, category, assigned_to, establishment_id, request_id, started_at, published_at, correction_window_ends_at")
    .eq("id", id)
    .maybeSingle();
  const job = must(data, error);
  const [{ data: est }, { data: req }, { data: candidates }, { data: people }, { data: gate }, evidence] = await Promise.all([
    supabase.from("establishments").select("id, name").eq("id", job.establishment_id).maybeSingle(),
    job.request_id ? supabase.from("requests").select("description").eq("id", job.request_id).maybeSingle() : Promise.resolve({ data: null }),
    job.state === "pending_assignment" ? supabase.rpc("list_job_candidates", { p_job_id: id }) : Promise.resolve({ data: [] }),
    supabase.from("profiles").select("id, full_name, email"),
    supabase.rpc("job_quote_gate", { p_job_id: id }),
    supabase.from("file_links").select("file_id", { count: "exact", head: true }).eq("entity_id", id),
  ]);
  const persons = new Map((people ?? []).map((p) => [p.id, p.full_name ?? p.email ?? ""]));
  return {
    ...job,
    establishmentName: est?.name ?? "",
    description: req?.description ?? "",
    candidates: (candidates ?? []).map((c) => ({ ...c, name: persons.get(c.worker_id) ?? c.worker_id })),
    quoteGate: gate && gate.length > 0 ? gate[0] : null,
    evidenceCount: evidence.count ?? 0,
  };
}

/**
 * §176 · asignar, comenzar, bloquear, publicar: las mismas funciones que
 * la web. La ventana de corrección se calcula aquí con el reloj laborable
 * de `src/core/business-clock.ts` (una sola definición) y la valida el
 * servidor antes de guardarla (RN-COR-02).
 */
export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { viewer } = useSpace();
  const router = useRouter();
  const detail = useLoader(viewer?.userId ?? null, `job:${id}`, () => loadDetail(String(id)), [id]);

  const [candidate, setCandidate] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState<BlockReason | null>(null);
  const [blockNote, setBlockNote] = useState("");
  const [evidenceNotice, setEvidenceNotice] = useState<string | null>(null);
  const assign = useAction("assign_job");
  const start = useAction("start_job");
  const block = useAction("block_job");
  const unblock = useAction("unblock_job");
  const evidence = useAction("publish_job");
  const publish = useAction("publish_job");

  if (!viewer || detail.loading) return <Loading />;
  if (detail.error || !detail.data) return <ErrorBox message={detail.error ?? web.states.errorDescription} onRetry={detail.reload} />;
  const j = detail.data;
  const isStaff = viewer.role === "owner" || viewer.role === "admin";
  const isAssignee = j.assigned_to === viewer.userId;

  async function attachEvidence(pick: () => Promise<PickResult>) {
    await evidence.run(async () => {
      const picked = await pick();
      if (!picked.ok) return picked.reason === "cancelled" ? { ok: true } : { ok: false, error: picked.message };
      const uploaded = await uploadImage({ establishmentId: j.establishment_id, category: "requests_and_jobs", image: picked.image });
      if (!uploaded.ok) return uploaded;
      const { error } = await supabase.rpc("attach_job_evidence", { p_job_id: j.id, p_file_id: uploaded.fileId });
      if (!error) setEvidenceNotice(es.jobs.evidenceAttached);
      return fromError(error);
    }, detail.reload);
  }

  async function publishNow() {
    await publish.run(async () => {
      if (!viewer) return { ok: false, error: web.states.errorDescription };
      const { data: holidayRows } = await supabase.from("holidays").select("holiday_date, created_at").eq("space_id", viewer.spaceId ?? "");
      const now = new Date();
      const holidays: HolidayRecord[] = (holidayRows ?? []).map((h) => ({ date: h.holiday_date, configuredAt: new Date(h.created_at) }));
      const calendar = contractualCalendar(viewer.timezone, holidaysKnownAsOf(holidays, now));
      const windowEndsAt = addBusinessMinutes(now, FREE_CORRECTION_WINDOW_BUSINESS_HOURS * 60, calendar);
      return fromError((await supabase.rpc("publish_job", { p_job_id: j.id, p_correction_window_ends_at: windowEndsAt.toISOString() })).error);
    }, detail.reload);
  }

  return (
    <Screen title={`${es.jobs.detail} ${j.code}`} refreshing={detail.loading} onRefresh={detail.reload}>
      {detail.fromCache ? <CacheNotice fetchedAt={detail.fetchedAt} /> : null}
      <Card>
        <Badge tone={j.state === "published" || j.state === "completed" ? "success" : "info"}>
          {web.naming.states.job[j.state as keyof typeof web.naming.states.job] ?? j.state}
        </Badge>
        <Title>{j.establishmentName}</Title>
        <Body>{j.description}</Body>
        <Row label={es.requests.categoryLabel} value={web.naming.categories[j.category as keyof typeof web.naming.categories] ?? j.category} />
        {j.started_at ? <Body muted>{es.jobs.startedAt(whenAt(j.started_at, viewer.timezone))}</Body> : null}
        {j.published_at ? <Body muted>{es.jobs.publishedAt(whenAt(j.published_at, viewer.timezone))}</Body> : null}
        {j.correction_window_ends_at ? <Body muted>{es.jobs.correctionWindow(whenAt(j.correction_window_ends_at, viewer.timezone))}</Body> : null}
      </Card>

      {j.request_id ? <Button label={web.naming.entities.request} kind="secondary" onPress={() => router.push(`/espacios/${viewer.slug}/solicitudes/${j.request_id}` as never)} /> : null}

      {isStaff && j.state === "pending_assignment" ? (
        <Card>
          <Title>{es.jobs.assign}</Title>
          {j.candidates.length === 0 ? <Body muted>{es.jobs.noCandidates}</Body> : null}
          <Choice
            label={es.jobs.assignTo}
            options={j.candidates.map((c) => ({ value: c.worker_id, label: `${c.name} · ${es.jobs.load(c.active_load_points)}` }))}
            value={candidate}
            onChange={setCandidate}
          />
          {assign.error ? <Notice tone="danger">{assign.error}</Notice> : null}
          {assign.notice ? <Notice tone="success">{assign.notice}</Notice> : null}
          <Button
            label={es.jobs.assign}
            pending={assign.pending}
            disabled={!assign.enabled || !candidate}
            disabledReason={assign.disabledReason}
            onPress={() => void assign.run(async () => fromError((await supabase.rpc("assign_job", { p_job_id: j.id, p_worker_id: candidate as string })).error), detail.reload)}
          />
        </Card>
      ) : null}

      {(isAssignee || isStaff) && j.state === "assigned" ? (
        <Card>
          {j.quoteGate && j.quoteGate.requires_payment_before_start && !j.quoteGate.can_start ? <Notice tone="warning">{es.jobs.startBlockedByQuote}</Notice> : null}
          {start.error ? <Notice tone="danger">{start.error}</Notice> : null}
          <Button
            label={es.jobs.start}
            pending={start.pending}
            disabled={!start.enabled}
            disabledReason={start.disabledReason}
            onPress={() => void start.run(async () => fromError((await supabase.rpc("start_job", { p_job_id: j.id })).error), detail.reload)}
          />
        </Card>
      ) : null}

      {(isAssignee || isStaff) && j.state === "in_progress" ? (
        <>
          <Card>
            <Title>{es.jobs.evidence}</Title>
            <Body muted>{es.jobs.publishHint}</Body>
            <Body muted>
              {j.evidenceCount} {web.files.attachmentsTitle.toLowerCase()}
            </Body>
            {evidenceNotice ? <Notice tone="success">{evidenceNotice}</Notice> : null}
            {evidence.error ? <Notice tone="danger">{evidence.error}</Notice> : null}
            <Button label={es.media.takePhoto} kind="secondary" pending={evidence.pending} disabled={!evidence.enabled} disabledReason={evidence.disabledReason} onPress={() => void attachEvidence(takePhoto)} />
            <Button label={es.media.pickPhoto} kind="secondary" pending={evidence.pending} disabled={!evidence.enabled} disabledReason={evidence.disabledReason} onPress={() => void attachEvidence(pickPhoto)} />
            {publish.error ? <Notice tone="danger">{publish.error}</Notice> : null}
            <Button label={es.jobs.publish} pending={publish.pending} disabled={!publish.enabled} disabledReason={publish.disabledReason} onPress={() => void publishNow()} />
          </Card>
          <Card>
            <Title>{es.jobs.block}</Title>
            <Choice label={es.jobs.blockReason} options={BLOCK_REASONS.map((r) => ({ value: r, label: web.teamArea.blockReasons[r] }))} value={blockReason} onChange={setBlockReason} />
            <Field label={es.jobs.blockNote} value={blockNote} onChangeText={setBlockNote} />
            {block.error ? <Notice tone="danger">{block.error}</Notice> : null}
            <Button
              label={es.jobs.block}
              kind="secondary"
              pending={block.pending}
              disabled={!block.enabled || !blockReason}
              disabledReason={block.disabledReason}
              onPress={() =>
                void block.run(
                  async () => fromError((await supabase.rpc("block_job", { p_job_id: j.id, p_reason_type: blockReason as string, p_note: blockNote.trim() || undefined })).error),
                  detail.reload,
                )
              }
            />
          </Card>
        </>
      ) : null}

      {(isAssignee || isStaff) && (j.state === "blocked_by_client" || j.state === "authorized_pause") ? (
        <Card>
          {unblock.error ? <Notice tone="danger">{unblock.error}</Notice> : null}
          <Button
            label={es.jobs.unblock}
            pending={unblock.pending}
            disabled={!unblock.enabled}
            disabledReason={unblock.disabledReason}
            onPress={() => void unblock.run(async () => fromError((await supabase.rpc("unblock_job", { p_job_id: j.id, p_reverted: false })).error), detail.reload)}
          />
        </Card>
      ) : null}
    </Screen>
  );
}
