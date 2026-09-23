import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { es } from "@/i18n/es";

import { ChannelsView, type ChannelRow } from "./ChannelsView";

const t = es.teamArea.channels;

const canal = (cambios: Partial<ChannelRow> = {}): ChannelRow => ({
  id: "c1",
  name: "General",
  member_count: 4,
  unread_count: 3,
  i_am_member: true,
  archived_at: null,
  ...cambios,
});

afterEach(cleanup);

describe("M76 · los canales internos del espacio", () => {
  it("RN-CAN-02 · avisa de que el restaurante no lo ve, antes de escribir nada", () => {
    render(
      <ChannelsView slug="s" spaceName="Restavor" channels={[canal()]} selectedId={null} canManage={false} pane={{ kind: "pick" }} />,
    );
    expect(screen.getByText(t.notice)).toBeTruthy();
    expect(screen.getByText(t.listTitle("Restavor"))).toBeTruthy();
  });

  it("RN-MSG-06 · no abre ningún canal solo: abrirlo marcaría leído lo que nadie ha elegido leer", () => {
    render(
      <ChannelsView slug="s" spaceName="R" channels={[canal()]} selectedId={null} canManage={false} pane={{ kind: "pick" }} />,
    );
    expect(screen.getByText(t.pickTitle)).toBeTruthy();
    expect(screen.getByText(t.unread(3))).toBeTruthy();
  });

  it("RN-CAN-04 · solo quien administra ve crear y gestionar", () => {
    const pane = { kind: "channel" as const, channel: canal(), members: [], manage: null, conversation: <p>hola</p> };
    const { rerender } = render(
      <ChannelsView slug="s" spaceName="R" channels={[canal()]} selectedId="c1" canManage={false} pane={pane} />,
    );
    expect(screen.queryByLabelText(t.newChannel)).toBeNull();
    expect(screen.queryByLabelText(t.manage)).toBeNull();
    rerender(<ChannelsView slug="s" spaceName="R" channels={[canal()]} selectedId="c1" canManage pane={pane} />);
    expect(screen.getByLabelText(t.newChannel)).toBeTruthy();
    expect(screen.getByLabelText(t.manage)).toBeTruthy();
  });

  it("RN-CAN-08 · quien administra ve el canal, pero sin ser miembro no lee lo que se dice", () => {
    const fuera = canal({ i_am_member: false, unread_count: null });
    render(
      <ChannelsView
        slug="s"
        spaceName="R"
        channels={[fuera]}
        selectedId="c1"
        canManage
        pane={{ kind: "channel", channel: fuera, members: [], manage: null, conversation: null }}
      />,
    );
    expect(screen.getByText(t.notMemberTitle)).toBeTruthy();
    expect(screen.getByText(`${t.notMember} ${t.notMemberManage}`)).toBeTruthy();
  });

  it("RN-CAN-05 · un archivado sale aparte, se lee y dice que ya no se escribe", () => {
    const viejo = canal({ id: "c2", name: "Viejo", archived_at: "2026-09-01T10:00:00Z", unread_count: 0 });
    render(
      <ChannelsView
        slug="s"
        spaceName="R"
        channels={[canal(), viejo]}
        selectedId="c2"
        canManage={false}
        pane={{ kind: "channel", channel: viejo, members: [], manage: null, conversation: <p>lo dicho</p> }}
      />,
    );
    expect(screen.getByText(t.archivedSection(1))).toBeTruthy();
    expect(screen.getByText(t.archivedNotice)).toBeTruthy();
    expect(screen.getByText("lo dicho")).toBeTruthy();
  });

  it("RN-CAN-01 · un canal no es de ningún restaurante, así que no admite adjuntos y lo dice", () => {
    render(
      <ChannelsView
        slug="s"
        spaceName="R"
        channels={[canal()]}
        selectedId="c1"
        canManage={false}
        pane={{ kind: "channel", channel: canal(), members: [{ userId: "u", name: "Ana Ruiz" }], manage: null, conversation: <p>x</p> }}
      />,
    );
    expect(screen.getByText(t.noAttachments)).toBeTruthy();
    expect(screen.getAllByText("Ana Ruiz").length).toBeGreaterThan(0);
  });
});
