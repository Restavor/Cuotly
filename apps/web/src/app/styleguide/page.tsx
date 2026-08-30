"use client";

import { useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Modal,
  NoPermissionState,
  Select,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  useToast,
} from "@/components/ui";

/**
 * Página interna de referencia: enseña todos los componentes base del
 * sistema en un solo sitio. No es una pantalla de producto — es la
 * evidencia de que el sistema de diseño existe y se puede probar de un
 * vistazo, tal como pide el Hito 1 del ROADMAP.
 */
export default function StyleGuidePage() {
  const [modalOpen, setModalOpen] = useState(false);
  const { showToast } = useToast();

  return (
    <main className="mx-auto max-w-4xl space-y-10 p-8">
      <div>
        <h1 className="text-2xl font-bold text-primary-dark">Sistema de diseño — Emerald Control</h1>
        <p className="text-sm text-text-secondary">
          Referencia interna de los componentes base. No forma parte del producto visible para
          restaurantes ni equipos de mantenimiento.
        </p>
      </div>

      <Card title="Button">
        <div className="flex flex-wrap items-center gap-3" data-testid="buttons">
          <Button variant="primary">Primario</Button>
          <Button variant="secondary">Secundario</Button>
          <Button variant="danger">Peligro</Button>
          <Button variant="primary" pending>
            Cargando…
          </Button>
          <Button variant="primary" disabled>
            Deshabilitado
          </Button>
        </div>
      </Card>

      <Card title="Field y Select">
        <div className="grid gap-4 sm:grid-cols-2" data-testid="fields">
          <Field label="Correo electrónico" placeholder="tu@correo.com" />
          <Field label="Con error" defaultValue="algo mal" error="Este campo no es válido." />
          <Select
            label="Plan"
            options={[
              { value: "basico", label: "Básico" },
              { value: "impulso", label: "Impulso" },
              { value: "premium", label: "Premium" },
            ]}
          />
        </div>
      </Card>

      <Card title="StatusBadge">
        <div className="flex flex-wrap gap-2" data-testid="badges">
          <StatusBadge tone="success">Activo</StatusBadge>
          <StatusBadge tone="warning">Pausado</StatusBadge>
          <StatusBadge tone="danger">Suspendido</StatusBadge>
          <StatusBadge tone="info">Configurando</StatusBadge>
          <StatusBadge tone="neutral">Archivado</StatusBadge>
        </div>
      </Card>

      <Card title="Table">
        <div data-testid="table">
          <Table>
            <TableHead>
              <TableHeaderCell>Establecimiento</TableHeaderCell>
              <TableHeaderCell>Plan</TableHeaderCell>
              <TableHeaderCell>Estado</TableHeaderCell>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell>Magariños</TableCell>
                <TableCell>Premium</TableCell>
                <TableCell>
                  <StatusBadge tone="success">Activo</StatusBadge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card title="Modal y Toast">
        <div className="flex flex-wrap gap-3" data-testid="overlays">
          <Button onClick={() => setModalOpen(true)}>Abrir modal</Button>
          <Button variant="secondary" onClick={() => showToast("Cambios guardados.", "success")}>
            Lanzar toast
          </Button>
        </div>
        <Modal open={modalOpen} title="Ejemplo de modal" onClose={() => setModalOpen(false)}>
          <p className="text-sm text-text">Este es el contenido del modal de ejemplo.</p>
        </Modal>
      </Card>

      <Card title="Estados: cargando / sin datos / error / sin permisos">
        <div className="grid gap-4 sm:grid-cols-2" data-testid="states">
          <div className="rounded-lg border border-border">
            <LoadingState />
          </div>
          <div className="rounded-lg border border-border">
            <EmptyState />
          </div>
          <div className="rounded-lg border border-border">
            <ErrorState />
          </div>
          <div className="rounded-lg border border-border">
            <NoPermissionState />
          </div>
        </div>
      </Card>
    </main>
  );
}
