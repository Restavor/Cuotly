import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { es } from "@/i18n/es";

vi.mock("./actions", () => ({
  assignJob: vi.fn(),
  blockJob: vi.fn(),
  openJobCommentsHere: vi.fn(),
  publishJob: vi.fn(),
  startJob: vi.fn(),
  unblockJob: vi.fn(),
}));

import { OpenJobCommentsForm } from "./JobActions";

afterEach(cleanup);

const t = es.teamArea.jobs;

describe("§66.2 · los comentarios internos dentro de la ficha del trabajo", () => {
  it("sin conversación todavía: dice por qué no hay nada y ofrece abrirla aquí, sin salir de la ficha", () => {
    const { container } = render(<OpenJobCommentsForm jobId="job-1" />);
    expect(screen.getByText(t.commentsTitle)).toBeTruthy();
    expect(screen.getByText(t.commentsClosedTitle)).toBeTruthy();
    expect(screen.getByRole("button", { name: t.commentsOpen })).toBeTruthy();
    expect((container.querySelector('input[name="jobId"]') as HTMLInputElement).value).toBe("job-1");
    // RN-MSG-04 · quien escribe sabe que el restaurante no lo ve.
    expect(screen.getByText(es.teamArea.messages.internalNotice)).toBeTruthy();
    // No lleva a la bandeja: el formulario no manda `slug` para redirigir.
    expect(container.querySelector('input[name="slug"]')).toBeNull();
  });
});
