import { useEffect, useState } from "react";
import { Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { es } from "../i18n/es";
import { useAuth } from "../lib/auth-context";
import { useOnline } from "../lib/connectivity";
import { listDrafts, type Draft } from "../lib/drafts";
import { useLock } from "../lib/lock";
import { usePush } from "../lib/push";
import { colors } from "../lib/theme";
import { Body, Button, Card, Title } from "./ui";

/** RN-MOV-09 · la banda de sin conexión, encima de todo. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <View style={styles.offline} accessibilityRole="alert">
      <Text style={styles.offlineText}>{es.offline.banner}</Text>
    </View>
  );
}

/** RN-MOV-06 · si se rechazó el push: aviso persistente con cómo activarlo. */
export function PushDeniedBanner() {
  const { status } = usePush();
  if (status !== "denied") return null;
  return (
    <View style={styles.denied}>
      <Text style={styles.deniedText}>{es.push.deniedBanner}</Text>
      <Pressable onPress={() => void Linking.openSettings()} accessibilityRole="button">
        <Text style={styles.deniedLink}>{es.push.openSettings}</Text>
      </Pressable>
    </View>
  );
}

/** RN-MOV-06 · la explicación va ANTES del diálogo del sistema. */
export function PushExplanation() {
  const { explanationVisible, acceptExplanation, dismissExplanation } = usePush();
  return (
    <Modal visible={explanationVisible} transparent animationType="fade" onRequestClose={dismissExplanation}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Title>{es.push.explainTitle}</Title>
          <Body>{es.push.explainBody}</Body>
          <Button label={es.push.explainAccept} onPress={() => void acceptExplanation()} />
          <Button label={es.push.explainLater} onPress={dismissExplanation} kind="secondary" />
        </View>
      </View>
    </Modal>
  );
}

/** RN-MOV-08 · el cerrojo, por encima de todo hasta desbloquear. */
export function LockOverlay() {
  const { locked, unlock } = useLock();
  useEffect(() => {
    if (locked) void unlock();
  }, [locked, unlock]);
  if (!locked) return null;
  return (
    <View style={styles.lock}>
      <Title>{es.lock.lockedTitle}</Title>
      <Button label={es.lock.unlock} onPress={() => void unlock()} />
    </View>
  );
}

/**
 * RN-MOV-09 · los borradores escritos sin conexión, al volver la
 * conexión: se enseñan y se envían **uno a uno**, solo cuando la persona
 * lo confirma. Nada se envía solo.
 */
export function useDraftList(): { drafts: readonly Draft[]; reload: () => void } {
  const { session } = useAuth();
  const [drafts, setDrafts] = useState<readonly Draft[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!session) return;
    void listDrafts(session.user.id).then(setDrafts);
  }, [session, tick]);
  return { drafts, reload: () => setTick((t) => t + 1) };
}

export function DraftsCard({ onOpen }: { onOpen: (draft: Draft) => void }) {
  const { drafts } = useDraftList();
  if (drafts.length === 0) return null;
  return (
    <Card>
      <Title>{es.offline.draftsTitle}</Title>
      <Body muted>{es.offline.draftsHint}</Body>
      {drafts.map((d) => (
        <Pressable key={d.localId} onPress={() => onOpen(d)} style={styles.draftRow} accessibilityRole="button">
          <Text style={styles.draftKind}>{d.kind === "request" ? es.offline.draftRequest : es.offline.draftMessage}</Text>
          <Text style={styles.draftText} numberOfLines={2}>
            {d.kind === "request" ? d.description : d.body}
          </Text>
        </Pressable>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  offline: { backgroundColor: colors.warning, paddingVertical: 6, paddingHorizontal: 16 },
  offlineText: { color: colors.primaryDark, fontSize: 13, fontWeight: "600", textAlign: "center" },
  denied: { backgroundColor: colors.softSurface, paddingVertical: 8, paddingHorizontal: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  deniedText: { color: colors.text, fontSize: 13, flexShrink: 1 },
  deniedLink: { color: colors.cuotlyGreen, fontSize: 13, fontWeight: "700" },
  backdrop: { flex: 1, backgroundColor: "rgba(11, 47, 42, 0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12 },
  lock: { position: "absolute", inset: 0, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", gap: 16, padding: 24 },
  draftRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, gap: 2 },
  draftKind: { fontSize: 12, color: colors.textSecondary, fontWeight: "600" },
  draftText: { fontSize: 14, color: colors.text },
});
