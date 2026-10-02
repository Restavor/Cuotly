"use client";

import { useState } from "react";
import {
  Avatar,
  Button,
  ButtonLink,
  Card,
  EntityCell,
  FilterBar,
  FilterSearch,
  FilterSelect,
  PageHeader,
  PersonCell,
  ProgressBar,
  StatCard,
  TableFooter,
  Tabs,
  EmptyState,
  ErrorState,
  Field,
  TextArea,
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
import {
  AgentStateCard,
  AgentStatusPill,
  CapacityMeter,
  NewBadge,
  OriginChip,
  PinPad,
  ReservationRow,
  StatusChip,
} from "@/components/agents";

/**
 * Página interna de referencia: enseña todos los componentes base del
 * sistema en un solo sitio. No es una pantalla de producto — es la
 * evidencia de que el sistema de diseño existe y se puede probar de un
 * vistazo, tal como pide el Hito 1 del ROADMAP.
 */
export default function StyleGuidePage() {
  const [modalOpen, setModalOpen] = useState(false);
  const { showToast } = useToast();
  const [pin, setPin] = useState("");

  return (
    <main className="mx-auto max-w-6xl space-y-10 sm:p-8">
      <div>
        <h1 className="text-2xl font-bold text-primary-dark">Sistema de diseño — Emerald Control</h1>
        <p className="text-sm text-text-secondary">
          Referencia interna de los componentes base. No forma parte del producto visible para
          restaurantes ni equipos de mantenimiento.
        </p>
      </div>

      {/*
        Las piezas del diseño de escritorio (22/09/2026): la cabecera de
        página, las pestañas, la barra de filtros, la tarjeta de cifra y el
        avatar. Aquí con texto de muestra, que es lo que esta página es.
      */}
      <Card title="PageHeader, Tabs y FilterBar">
        <div className="space-y-6" data-testid="page-pieces">
          <PageHeader
            title="Restaurantes"
            subtitle="Gestiona tus establecimientos y su mantenimiento digital."
            actions={
              <>
                <ButtonLink href="#" variant="secondary">
                  Grupos
                </ButtonLink>
                <ButtonLink href="#" icon="plus">
                  Crear establecimiento
                </ButtonLink>
              </>
            }
          />
          <Tabs
            label="Ejemplo"
            active="lista"
            tabs={[
              { key: "lista", label: "Lista", href: "#" },
              { key: "tablero", label: "Tablero", href: "#", count: 3, countTone: "danger" },
              { key: "archivo", label: "Archivo", href: "#", count: 12 },
            ]}
          />
          <FilterBar action="#" hasFilters>
            <FilterSearch id="sg-buscar" name="buscar" placeholder="Buscar restaurante…" />
            <FilterSelect id="sg-grupo" name="grupo" label="Grupo" options={[{ value: "n", label: "Grupo Norte" }]} />
            <FilterSelect id="sg-estado" name="estado" label="Estado" options={[{ value: "a", label: "Activo" }]} />
            <FilterSelect id="sg-plan" name="plan" label="Plan" options={[{ value: "p", label: "Premium+" }]} />
          </FilterBar>
        </div>
      </Card>

      <Card title="StatCard, Avatar y ProgressBar">
        <div className="space-y-6" data-testid="stat-pieces">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <StatCard icon="building" tone="green" label="Restaurantes activos" value={4} hint="de 4 en total" href="#" />
            <StatCard icon="request" tone="danger" label="Solicitudes pendientes" value={6} hint="Esperando validación" />
            <StatCard icon="job" tone="green" label="Trabajos en curso" value={8} hint="4 en plazo" />
            <StatCard icon="dailyMenu" tone="info" label="Publicaciones de menú pendientes" value={3} hint="Todas con responsable" />
            <StatCard icon="clock" tone="neutral" label="Trabajos próximos a vencer" value={2} hint="En los próximos 7 días" />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Avatar name="Bosco Prieto" size={40} />
            <Avatar name="Marta" />
            <PersonCell name="Diego López" />
            <span className="w-48">
              <ProgressBar percent={72} label="72 % de la bolsa" />
            </span>
            <span className="w-48">
              <ProgressBar percent={30} tone="info" label="30 %" />
            </span>
            <span className="w-48">
              <ProgressBar percent={95} tone="danger" label="95 %" />
            </span>
          </div>
        </div>
      </Card>

      <Card title="Button">
        <div className="flex flex-wrap items-center gap-3" data-testid="buttons">
          <Button variant="primary">Primario</Button>
          <Button variant="secondary">Secundario</Button>
          <Button variant="outline">Contorno</Button>
          <Button variant="danger">Peligro</Button>
          <Button variant="primary" pending>
            Cargando…
          </Button>
          <Button variant="primary" disabled>
            Deshabilitado
          </Button>
        </div>
      </Card>

      <Card title="Field, TextArea y Select">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="fields">
          <Field label="Correo electrónico" placeholder="tu@correo.com" />
          <Field label="Con error" defaultValue="algo mal" error="Este campo no es válido." />
          <Field label="Con ayuda" hint="El texto de ayuda va enlazado con aria-describedby." />
          <TextArea
            label="Texto largo"
            hint="Misma anatomía que Field: etiqueta, ayuda y error."
            placeholder="Cuéntalo con tus palabras…"
          />
          <Select
            label="Plan"
            options={[
              { value: "basico", label: "Básico" },
              { value: "impulso", label: "Impulso" },
              { value: "impulso-plus", label: "Impulso+" },
              { value: "premium", label: "Premium" },
              { value: "premium-plus", label: "Premium+" },
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
          <Table
            footer={
              <TableFooter>
                <span>Mostrando 1 de 1 restaurantes</span>
              </TableFooter>
            }
          >
            <TableHead>
              <TableRow>
                <TableHeaderCell>Establecimiento</TableHeaderCell>
                <TableHeaderCell>Plan</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell>Responsable</TableHeaderCell>
                <TableHeaderCell>Acciones</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell>
                  <EntityCell title="Magariños" subtitle="A Coruña" />
                </TableCell>
                <TableCell>
                  <StatusBadge tone="info">Premium+</StatusBadge>
                </TableCell>
                <TableCell>
                  <StatusBadge tone="success">Activo</StatusBadge>
                </TableCell>
                <TableCell>
                  <PersonCell name="Diego López" />
                </TableCell>
                <TableCell>
                  <ButtonLink href="#" variant="outline" size="sm">
                    Ver ficha
                  </ButtonLink>
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="states">
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

      {/*
        Restavor agents (Fase B, AGT-03): las piezas de la agenda de Reservas. Datos de
        muestra, que es lo que esta página es; ninguna pantalla de producto los usa.
      */}
      <Card title="Restavor agents · origen y estado de una reserva">
        <div className="space-y-4" data-testid="agents-chips">
          <div className="flex flex-wrap items-center gap-2">
            <OriginChip origin="agent" />
            <OriginChip origin="platform" platformName="TheFork" />
            <OriginChip origin="platform" platformName="CoverManager" />
            <OriginChip origin="web" />
            <OriginChip origin="manual" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <OriginChip origin="agent" size="sm" />
            <OriginChip origin="platform" platformName="TheFork" size="sm" />
            <OriginChip origin="web" size="sm" />
            <OriginChip origin="manual" size="sm" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip kind="pending" />
            <StatusChip kind="duplicate" />
            <StatusChip kind="noShow" />
            <NewBadge />
          </div>
        </div>
      </Card>

      <Card title="Restavor agents · fila de reserva">
        <ul className="space-y-1" data-testid="agents-rows">
          <ReservationRow time="13:30" name="Lucía Fernández" partySize={2} origin="platform" platformName="TheFork" status="confirmed" />
          <ReservationRow time="14:00" name="Javier Ruiz" note="Una trona" partySize={4} origin="agent" status="confirmed" isNew />
          <ReservationRow
            time="14:30"
            name="Andrés Martínez"
            partySize={12}
            origin="agent"
            status="pending"
            largeGroup
            actions={
              <>
                <Button variant="secondary">Rechazar</Button>
                <Button>Confirmar</Button>
              </>
            }
          />
          <ReservationRow time="13:30" name="Raúl Moreno" partySize={2} origin="manual" status="no_show" />
          <ReservationRow
            time="15:00"
            name="Elena Castro"
            partySize={2}
            origin="platform"
            platformName="CoverManager"
            status="cancelled"
            cancelledNote="Cancelada por CoverManager · 14:20"
          />
        </ul>
      </Card>

      <Card title="Restavor agents · aforo de un turno">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3" data-testid="agents-meter">
          <CapacityMeter name="Comida" range="13:00 – 16:00" capacity={40} occupied={23} />
          <CapacityMeter name="Cena" range="20:00 – 23:30" capacity={60} occupied={54} />
          <CapacityMeter name="Cena" range="20:00 – 23:30" capacity={60} occupied={64} />
        </div>
      </Card>

      <Card title="Restavor agents · tarjeta de estado del agente">
        <div className="space-y-4" data-testid="agents-state">
          <AgentStateCard
            state="on"
            description="Coge las llamadas que no contestáis en 4 tonos · Horario: todo el día"
            action={<Button variant="secondary">Apagar agente</Button>}
          />
          <AgentStateCard
            state="off"
            title="Agente apagado hasta las 15:10"
            description="Las llamadas suenan en el local."
            action={<Button>Encender agente</Button>}
          />
          <div className="flex flex-wrap gap-2">
            <AgentStatusPill state="on" />
            <AgentStatusPill state="off">Agente apagado · hasta 15:10</AgentStatusPill>
          </div>
        </div>
      </Card>

      <Card title="Restavor agents · teclado de PIN">
        <div data-testid="agents-pin">
          <PinPad value={pin} onChange={setPin} onSubmit={() => setPin("")} />
        </div>
      </Card>
    </main>
  );
}
