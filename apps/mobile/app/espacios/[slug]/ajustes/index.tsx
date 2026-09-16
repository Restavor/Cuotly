import { useRouter } from "expo-router";
import { useState } from "react";
import { Switch, View } from "react-native";

import { NOTIFICATION_EVENTS, isMandatoryEvent, type NotificationEvent } from "@/core/notifications";

import { Body, Button, CacheNotice, Card, ErrorBox, Loading, Notice, Row, Screen, Title } from "../../../../src/components/ui";
import { es, web } from "../../../../src/i18n/es";
import { fromError } from "../../../../src/lib/api";
import { useLock } from "../../../../src/lib/lock";
import { usePush } from "../../../../src/lib/push";
import { supabase } from "../../../../src/lib/supabase";
import { useSpace } from "../../../../src/lib/space-context";
import { colors } from "../../../../src/lib/theme";
import { useAction } from "../../../../src/lib/use-action";
import { useLoader } from "../../../../src/lib/use-loader";

type Preference = { event_type: string; in_app: boolean; email: boolean; push: boolean };

async function loadPreferences(spaceId: string, userId: string): Promise<Map<string, Preference>> {
  const { data } = await supabase
    .from("notification_preferences")
    .select("event_type, in_app, email, push")
    .eq("space_id", spaceId)
    .eq("profile_id", userId);
  return new Map((data ?? []).map((p) => [p.event_type, p]));
}

/**
 * §176 · "ajustes permitidos": las preferencias de avisos por evento con
 * el tercer canal (RN-MOV-06), el estado del push en este teléfono
 * (RN-MOV-05) y el cerrojo biométrico (RN-MOV-08). Los obligatorios de
 * RN-NOT-03 no se pueden apagar por ningún canal, y el servidor lo
 * rechaza aunque el interruptor se moviera.
 */
export default function SettingsScreen() {
  const { viewer } = useSpace();
  const router = useRouter();
  const push = usePush();
  const lock = useLock();
  const prefs = useLoader(viewer?.userId ?? null, `prefs:${viewer?.spaceId}`, () => loadPreferences(viewer?.spaceId as string, viewer?.userId as string), [viewer?.spaceId]);
  const save = useAction("set_preference");
  const [lockError, setLockError] = useState<string | null>(null);
  if (!viewer) return <Loading />;

  const isStaff = viewer.spaceId !== null && viewer.role !== "client" && viewer.role !== "client_daily_menu";

  function current(event: NotificationEvent): Preference {
    return prefs.data?.get(event) ?? { event_type: event, in_app: true, email: true, push: true };
  }

  async function set(event: NotificationEvent, channel: "in_app" | "email" | "push", value: boolean) {
    const p = current(event);
    const next = { ...p, [channel]: value };
    await save.run(
      async () =>
        fromError(
          (await supabase.rpc("set_notification_preference", { p_space_id: viewer?.spaceId as string, p_event_type: event, p_in_app: next.in_app, p_email: next.email, p_push: next.push }))
            .error,
        ),
      prefs.reload,
      es.settings.saved,
    );
  }

  const pushStatusLabel = es.push.status[push.status];

  return (
    <Screen title={es.settings.title} refreshing={prefs.loading} onRefresh={prefs.reload}>
      {prefs.fromCache ? <CacheNotice fetchedAt={prefs.fetchedAt} /> : null}
      <Card>
        <Title>{es.push.status.title}</Title>
        <Row label={es.push.preferenceLabel} value={pushStatusLabel} />
        <Body muted>{push.registeredToken ? es.push.status.registered : es.push.status.notRegistered}</Body>
        {push.reason === "no_project" ? <Notice tone="warning">{es.push.notConfigured}</Notice> : null}
        {push.reason === "simulator" ? <Notice tone="warning">{es.push.unavailable}</Notice> : null}
        {push.status === "unknown" ? <Button label={es.push.explainAccept} kind="secondary" onPress={push.askWithExplanation} /> : null}
      </Card>

      <Card>
        <Title>{es.lock.title}</Title>
        <Body muted>{es.lock.hint}</Body>
        {!lock.available ? <Body muted>{es.lock.notAvailable}</Body> : null}
        {lockError ? <Notice tone="danger">{lockError}</Notice> : null}
        <Button
          label={lock.enabled ? es.lock.disable : es.lock.enable}
          kind="secondary"
          disabled={!lock.available}
          onPress={() => void lock.setEnabled(!lock.enabled).then((ok) => setLockError(ok ? null : es.lock.notAvailable))}
        />
      </Card>

      {isStaff ? (
        <Card>
          <Title>{es.settings.notifications}</Title>
          <Body muted>{es.settings.notificationsHint}</Body>
          {prefs.error ? <ErrorBox message={prefs.error} onRetry={prefs.reload} /> : null}
          {save.error ? <Notice tone="danger">{save.error}</Notice> : null}
          {save.notice ? <Notice tone="success">{save.notice}</Notice> : null}
          {NOTIFICATION_EVENTS.map((event) => {
            const p = current(event);
            const mandatory = isMandatoryEvent(event);
            return (
              <View key={event} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, gap: 4 }}>
                <Body>{web.notifications.events[event]}</Body>
                {mandatory ? <Body muted>{es.push.mandatoryHint}</Body> : null}
                {(["in_app", "email", "push"] as const).map((channel) => (
                  <View key={channel} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Body muted>{channel === "in_app" ? es.settings.inApp : channel === "email" ? es.settings.email : es.push.preferenceLabel}</Body>
                    <Switch
                      value={p[channel]}
                      disabled={mandatory || !save.enabled || save.pending}
                      onValueChange={(value) => void set(event, channel, value)}
                      trackColor={{ true: colors.cuotlyGreen, false: colors.border }}
                      accessibilityLabel={`${web.notifications.events[event]} · ${channel}`}
                    />
                  </View>
                ))}
              </View>
            );
          })}
          {!save.enabled ? <Body muted>{es.offline.buttonReason}</Body> : null}
        </Card>
      ) : null}

      <Card>
        <Title>{es.settings.account}</Title>
        <Button label={es.settings.sessions} kind="secondary" onPress={() => router.push("/cuenta/sesiones" as never)} />
      </Card>
    </Screen>
  );
}
