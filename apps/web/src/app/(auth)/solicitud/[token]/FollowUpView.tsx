import {
  AccessCard,
  AccessPill,
  BigLink,
  ContactTextLink,
  QuoteBox,
  RequestData,
  StatusBox,
  StatusHero,
} from "@/components/access/AccessPieces";
import { Icon, type IconName } from "@/components/ui/Icon";
import { contactMailto } from "@/core/contact";
import { es } from "@/i18n/es";
import { ReplyForm } from "./ReplyForm";

/** Lo que devuelve `access_request_follow_up()`, ni más ni menos. */
export type FollowUpData = {
  status: string;
  status_reason: string | null;
  applicant_reply: string | null;
  contact_name: string | null;
  business_name: string | null;
  can_reply: boolean | null;
};

/** A01 a A04 · la solicitud vista por quien la mandó, según su estado. */
export function FollowUpView({ token, data }: { token: string; data: FollowUpData }) {
  const t = es.auth.access;
  const datos: { icon: IconName; value: string }[] = [
    { icon: "person" as const, value: data.contact_name ?? "" },
    { icon: "building" as const, value: data.business_name ?? "" },
  ].filter((fila) => fila.value.trim() !== "");

  return (
    <AccessCard>
      {data.status === "needs_information" ? (
        <>
          <AccessPill tone="warning">{t.needsInfoPill}</AccessPill>
          <StatusHero tone="warning" title={t.needsInfoTitle} body={t.needsInfoBody} />
          <StatusBox kind="warning" badgeTone="warning" badge={t.needsInfoPill} body={t.needsInfoStatusBody} />
          {data.status_reason ? <QuoteBox label={t.teamMessage} text={data.status_reason} /> : null}
          {data.can_reply ? <ReplyForm token={token} /> : null}
          <RequestData rows={datos} compact />
        </>
      ) : data.status === "approved" ? (
        <>
          <AccessPill tone="success">{t.approvedPill}</AccessPill>
          <StatusHero tone="success" title={t.approvedTitle} body={t.approvedBody} />
          <StatusBox kind="success" badgeTone="success" badge={t.approvedBadge} body={t.approvedStatusBody} />
          {/* A03 · aprobar da una cuenta, no un espacio ni un panel (RN-ACC-03). */}
          <p className="mt-6 flex items-center gap-4 rounded-[12px] bg-soft-surface px-5 py-4 text-[15px] font-medium text-text">
            <Icon name="info" aria-hidden="true" className="h-7 w-7 shrink-0 text-primary-dark" strokeWidth={1.6} />
            {t.approvedNotice}
          </p>
          <RequestData rows={datos} />
          <p className="mt-7">
            <ContactTextLink />
          </p>
        </>
      ) : data.status === "rejected" ? (
        <>
          <AccessPill tone="danger">{t.rejectedPill}</AccessPill>
          <StatusHero tone="danger" title={t.rejectedTitle} body={t.rejectedBody} />
          <StatusBox kind="danger" badgeTone="danger" badge={t.rejectedBadge} body={t.rejectedStatusBody} />
          {data.status_reason ? <QuoteBox label={t.decisionReason} text={data.status_reason} /> : null}
          <RequestData rows={datos} />
          <div className="mt-7 max-w-[420px]">
            <BigLink href={contactMailto()}>{t.contactCuotly}</BigLink>
          </div>
        </>
      ) : (
        <>
          <AccessPill tone="success">{t.sentPill}</AccessPill>
          <StatusHero tone="success" title={t.sentTitle} body={t.sentBody} />
          <StatusBox kind="review" badgeTone="warning" badge={t.inReview} body={t.inReviewBody} />
          {/* RN-ACC-05 · quien ya contestó ve lo que contestó mientras se revisa. */}
          {data.applicant_reply ? <QuoteBox label={t.yourPreviousReply} text={data.applicant_reply} /> : null}
          <RequestData rows={datos} />
        </>
      )}
    </AccessCard>
  );
}
