"use client";
import { useEffect, useState } from "react";
import type { Registro } from "@/lib/mock/types";
import { instalarTag, darBaja, reponerTag } from "@/lib/mock/api";
import ConfirmDialog from "@/components/ConfirmDialog";

// Acciones de TI (Momento 3: instalar/activar, reposición y baja) sobre el registro
// seleccionado. La cola, el expediente y el estado global viven en AdminPanel; aquí
// solo viven los formularios de cada acción y su diálogo de confirmación.
export default function VistaTi({ selected, busy, run }: {
  selected: Registro;
  busy: boolean;
  run: (fn: () => Promise<Registro>, ok: string) => Promise<void>;
}) {
  const [tagNum, setTagNum] = useState("");
  const [tiNombre, setTiNombre] = useState("");
  const [bajaMotivo, setBajaMotivo] = useState("");
  const [repoNum, setRepoNum] = useState("");
  const [repoMotivo, setRepoMotivo] = useState("");
  const [confirm, setConfirm] = useState<
    { title: string; message: string; confirmLabel: string; danger: boolean; action: () => Promise<Registro>; ok: string } | null
  >(null);

  // Al cambiar de registro se limpian los formularios; el nombre de TI se conserva
  // para no teclearlo en cada instalación.
  useEffect(() => {
    setTagNum(""); setBajaMotivo(""); setRepoNum(""); setRepoMotivo("");
  }, [selected.id]);

  return (
    <>
      <div className="panel">
        <p className="panel-title">Instalar y activar TAG</p>
        <div className="grid-2">
          <div className="field"><span>No. de TAG (6–11 dígitos)</span><input className="input" value={tagNum} onChange={(e) => setTagNum(e.target.value)} placeholder="Ej. 9426780" /></div>
          <div className="field"><span>Instalado por</span><input className="input" value={tiNombre} onChange={(e) => setTiNombre(e.target.value)} placeholder="Nombre de TI" /></div>
        </div>
        <button className="primary-action" disabled={busy} onClick={() => run(() => instalarTag(selected.id, tagNum, tiNombre), "TAG instalado y activado.")}>
          Instalar y activar
        </button>
      </div>
      <div className="panel">
        <p className="panel-title">Reposición de TAG</p>
        <div className="grid-2">
          <div className="field"><span>Nuevo No. de TAG</span><input className="input" value={repoNum} onChange={(e) => setRepoNum(e.target.value)} /></div>
          <div className="field"><span>Motivo</span><input className="input" value={repoMotivo} onChange={(e) => setRepoMotivo(e.target.value)} placeholder="Ej. daño, pérdida" /></div>
        </div>
        <button className="ghost-action" disabled={busy || !selected.noDispositivo} onClick={() => setConfirm({
          title: "Reposición de TAG",
          message: `Se reemplazará el TAG actual (${selected.noDispositivo}) por ${repoNum || "el nuevo número"} y el anterior quedará inactivo. ¿Continuar?`,
          confirmLabel: "Reponer", danger: true,
          action: () => reponerTag(selected.id, repoNum, repoMotivo, tiNombre),
          ok: "Reposición registrada (inactiva el anterior).",
        })}>
          Reponer (inactiva el anterior)
        </button>
      </div>
      <div className="panel">
        <p className="panel-title">Dar de baja</p>
        <div className="field"><span>Motivo de baja</span><input className="input" value={bajaMotivo} onChange={(e) => setBajaMotivo(e.target.value)} placeholder="Ej. egreso, cambio de vehículo" /></div>
        <button className="ghost-action" disabled={busy || selected.estado === "baja"} onClick={() => setConfirm({
          title: "Dar de baja",
          message: `Se dará de baja el registro ${selected.folio} y su TAG quedará inactivo. ¿Continuar?`,
          confirmLabel: "Dar de baja", danger: true,
          action: () => darBaja(selected.id, bajaMotivo, tiNombre),
          ok: "Registro dado de baja.",
        })}>
          Dar de baja
        </button>
      </div>
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          onCancel={() => setConfirm(null)}
          onConfirm={() => { const c = confirm; setConfirm(null); run(c.action, c.ok); }}
        />
      )}
    </>
  );
}
