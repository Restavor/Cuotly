"use client";

import { useState } from "react";

import { Card, Select } from "@/components/ui";
import { MenuDiffView } from "@/components/menu/MenuDiffView";
import { diffMenuVersions, type MenuVersionContent } from "@/core/menu-diff";
import { es } from "@/i18n/es";

const t = es.menuDiff;

export interface ComparableVersion extends MenuVersionContent {
  readonly id: string;
  readonly version: number;
}

/**
 * R18 · comparar dos versiones del menú.
 *
 * Las versiones ya las tiene la pantalla —`menu_versions` viene entera con
 * su contenido— así que comparar no pide nada al servidor: es cálculo, y el
 * cálculo está en `src/core/menu-diff.ts` con sus tests.
 *
 * Empieza comparando **las dos últimas**, que es la pregunta que trae aquí
 * a casi todo el mundo ("¿qué cambió en el último guardado?"). Los dos
 * desplegables están para lo demás.
 *
 * Con una sola versión no hay comparación posible y se dice: un selector de
 * un elemento y un panel vacío harían pensar que algo falla.
 */
export function VersionComparison({ versions }: { versions: readonly ComparableVersion[] }) {
  // Llegan de más reciente a más antigua. Lo natural es comparar la
  // anterior con la última, en ese orden: "de esto a esto".
  const [antesId, setAntesId] = useState(versions[1]?.id ?? "");
  const [despuesId, setDespuesId] = useState(versions[0]?.id ?? "");

  if (versions.length < 2) {
    return (
      <Card title={t.compareTitle}>
        <p className="text-sm text-text-secondary">{t.compareNeedTwo}</p>
      </Card>
    );
  }

  const antes = versions.find((v) => v.id === antesId) ?? versions[1];
  const despues = versions.find((v) => v.id === despuesId) ?? versions[0];
  const opciones = versions.map((v) => ({ value: v.id, label: t.compareOption(v.version) }));

  return (
    <Card title={t.compareTitle}>
      <p className="mb-3 text-sm text-text-secondary">{t.compareHint}</p>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Select
          label={t.compareFrom}
          name="antes"
          value={antesId}
          onChange={(e) => setAntesId(e.target.value)}
          options={opciones}
        />
        <Select
          label={t.compareTo}
          name="despues"
          value={despuesId}
          onChange={(e) => setDespuesId(e.target.value)}
          options={opciones}
        />
      </div>

      {antes.id === despues.id ? (
        <p className="text-sm text-text-secondary">{t.compareSameVersion}</p>
      ) : (
        <MenuDiffView diff={diffMenuVersions(antes, despues)} />
      )}
    </Card>
  );
}
