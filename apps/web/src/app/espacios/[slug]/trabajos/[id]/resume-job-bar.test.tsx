import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { es } from "@/i18n/es";

vi.mock("./actions", () => ({
  assignJob: vi.fn(),
  blockJob: vi.fn(),
  openJobInternalConversation: vi.fn(),
  publishJob: vi.fn(),
  startJob: vi.fn(),
  unblockJob: vi.fn(),
}));

import { ResumeJobBar } from "./JobActions";

afterEach(cleanup);

describe("M78 · trabajo bloqueado", () => {
  it("RN-JOB-08 · «Reanudar trabajo» manda el trabajo a desbloquear y dice qué falta", () => {
    const { container } = render(<ResumeJobBar jobId="job-1" hint={es.teamArea.jobs.resumeHintClient} />);
    expect(screen.getByRole("button", { name: es.teamArea.jobs.resumeSubmit })).toBeTruthy();
    expect(screen.getByText(es.teamArea.jobs.resumeHintClient)).toBeTruthy();
    expect((container.querySelector('input[name="jobId"]') as HTMLInputElement).value).toBe("job-1");
  });
});
