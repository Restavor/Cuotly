import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { TaskPanelActions } from "@/core/task-coordination";
import { es } from "@/i18n/es";

import { TaskDetail, type DetailTask } from "./TaskDetail";

/**
 * Maqueta 07 · el panel "Detalle de la tarea", pintado.
 *
 * `task-coordination.test.ts` comprueba **qué se decide**; esto comprueba
 * **qué se pinta con esa decisión**, que es donde se cuelan los fallos de
 * "el botón no está y nadie dice por qué". Tres casos en concreto:
 *
 *   · con una reasignación pendiente no hay desplegable de responsable, y
 *     se dice el motivo (RN-ASG-08) en vez de dejar el hueco;
 *   · quien la pidió y no puede resolverla ve en qué queda la cosa;
 *   · las reasignaciones resueltas se conservan y se enseñan, porque no se
 *     borran (CLAUDE.md MUST NOT).
 *
 * La limpieza va escrita a mano: este proyecto no usa `globals: true`, así
 * que Testing Library no la hace sola.
 */
afterEach(cleanup);

const t = es.teamArea.tasks.coordination;

const TAREA: DetailTask = {
  id: "t-1",
  title: "Comprobar enlaces y funcionamiento",
  description: "Verificar que los enlaces de la carta funcionan en la web.",
  state: "pending",
  weight: "normal",
  estimatedMinutes: 30,
  plannedDate: "2026-09-13",
  assigneeId: "ana",
  assigneeName: "Ana Torres",
};

function acciones(overrides: Partial<TaskPanelActions> = {}): TaskPanelActions {
  return {
    canAssign: false,
    canPlan: false,
    canRequestReassignment: false,
    canDecideReassignment: false,
    canAdvanceState: false,
    canCancel: false,
    ...overrides,
  };
}

const CANDIDATOS = [
  { workerId: "ana", name: "Ana Torres", loadPoints: 6 },
  { workerId: "hugo", name: "Hugo Ramos", loadPoints: 3 },
];

function pintar(props: Partial<Parameters<typeof TaskDetail>[0]> = {}) {
  return render(
    <TaskDetail
      task={TAREA}
      actions={acciones()}
      candidates={CANDIDATOS}
      pending={null}
      history={[]}
      closeHref="/espacios/restavor/trabajos/j-1/tareas"
      {...props}
    />,
  );
}

describe("TaskDetail · maqueta 07", () => {
  it("enseña la tarea con su fecha prevista", () => {
    pintar();
    expect(screen.getByText(TAREA.title)).toBeInTheDocument();
    expect(screen.getByText("2026-09-13")).toBeInTheDocument();
  });

  it("CA-20 · sin descripción dice que no la tiene, no deja el hueco", () => {
    pintar({ task: { ...TAREA, description: null } });
    expect(screen.getByText(t.descriptionEmpty)).toBeInTheDocument();
  });

  it("CA-20 · sin fecha prevista lo dice", () => {
    pintar({ task: { ...TAREA, plannedDate: null } });
    expect(screen.getAllByText(t.plannedDateEmpty).length).toBeGreaterThan(0);
  });

  it("RN-ASG-07 · a quien tiene la tarea se le ofrece pedir la reasignación con su motivo", () => {
    pintar({ actions: acciones({ canRequestReassignment: true }) });
    expect(screen.getByLabelText(t.reassignReasonLabel)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.reassignSubmit })).toBeInTheDocument();
  });

  it("RN-ASG-08 · con una reasignación pendiente no hay desplegable de responsable, y se dice por qué", () => {
    // El motivo importa tanto como la ausencia del control: un panel al
    // que le falta una opción sin explicación parece roto.
    pintar({
      actions: acciones({ canPlan: true, canAssign: false }),
      pending: {
        reason: "Estoy con la publicación del menú y no llego al jueves",
        requestedAt: "2026-09-11T12:14:00.000Z",
        requestedByName: "Ana Torres",
      },
    });

    expect(screen.queryByLabelText(es.teamArea.tasks.assigneeColumn)).not.toBeInTheDocument();
    expect(screen.getByText(t.reassignBlocksAssign)).toBeInTheDocument();
    expect(
      screen.getByText("Estoy con la publicación del menú y no llego al jueves"),
    ).toBeInTheDocument();
  });

  it("RN-ASG-08 · a quien la pidió y no la resuelve se le dice qué falta", () => {
    pintar({
      actions: acciones(),
      pending: {
        reason: "No llego",
        requestedAt: "2026-09-11T12:14:00.000Z",
        requestedByName: "Ana Torres",
      },
    });

    expect(screen.getByText(t.reassignWaitingDecision)).toBeInTheDocument();
  });

  it("RN-ASG-08 · quien decide elige a quién se la pasa, y NO se le ofrece la persona que la pidió", () => {
    // Aprobar dejando al mismo responsable lo rechaza el servidor y remite
    // a rechazarla: ofrecerlo sería ofrecer un error.
    pintar({
      actions: acciones({ canDecideReassignment: true }),
      pending: {
        reason: "No llego",
        requestedAt: "2026-09-11T12:14:00.000Z",
        requestedByName: "Ana Torres",
      },
    });

    const destinos = screen.getByLabelText(t.reassignApproveLabel);
    expect(destinos).toBeInTheDocument();
    expect(within(destinos).queryByText("Ana Torres · 6 pts")).not.toBeInTheDocument();
    expect(within(destinos).getByText("Hugo Ramos · 3 pts")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.reassignRejectSubmit })).toBeInTheDocument();
  });

  it("CLAUDE.md MUST NOT · las reasignaciones resueltas se conservan y se enseñan", () => {
    pintar({
      history: [
        {
          id: "r-1",
          state: "rejected",
          reason: "Sigo sin llegar",
          decidedAt: "2026-09-11T13:00:00.000Z",
          decidedByName: "Bosco",
          decisionReason: "Esta semana no hay a quién pasarla",
        },
      ],
    });

    expect(screen.getByText(t.reassignHistoryTitle)).toBeInTheDocument();
    expect(screen.getByText("Sigo sin llegar")).toBeInTheDocument();
    expect(screen.getByText("Esta semana no hay a quién pasarla")).toBeInTheDocument();
    expect(screen.getByText(t.reassignRejectedBadge)).toBeInTheDocument();
  });

  it("RN-JOB-01 · al trabajador no se le pinta cancelar: se le dice que lo pida", () => {
    pintar({ actions: acciones({ canAdvanceState: true, canCancel: false }) });

    expect(
      screen.queryByRole("button", { name: es.teamArea.tasks.cancelSubmit }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(es.teamArea.tasks.cancelOnlyStaff)).toBeInTheDocument();
  });

  it("sin nada que hacer se dice el motivo, no se deja el panel mudo", () => {
    pintar({ actions: acciones() });
    expect(screen.getByText(t.noActions)).toBeInTheDocument();
  });
});
