"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { db } from "@/lib/firebase";
import {
  collection, doc, setDoc, getDocs, query, orderBy, deleteDoc,
} from "firebase/firestore";
import type {
  Usuario, Turno, RolUsuario, TipoRegistro, RegistroAny,
  RegistroTemperaturas, RegistroPesos, RegistroBPM,
  RegistroRecepcion, RegistroDespacho, RegistroNC,
  RegistroDecomiso, RegistroLimpieza, FotoMeta,
} from "@/lib/types";
import {
  calcularAlerta, contarAlertas, saveFotoLocal, loadFotoLocal,
  comprimirFoto, sanitizarParaFirestore, fechaHoy, horaAhora,
  fechaDisplay, mesId, generarId, calcularKPIs,
} from "@/lib/helpers";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from "recharts";

// ─────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────
const TURNOS: { id: Turno; label: string; color: string }[] = [
  { id: "TM", label: "Mañana",  color: "#f59e0b" },
  { id: "TT", label: "Tarde",   color: "#3b82f6" },
  { id: "TN", label: "Noche",   color: "#6366f1" },
];

const TIPOS_MODULO: { id: TipoRegistro; label: string; icon: string; badge: string }[] = [
  { id: "temperaturas", label: "Temperaturas",   icon: "🌡️", badge: "PCC" },
  { id: "pesos",        label: "Pesos",          icon: "⚖️", badge: "PC"  },
  { id: "bpm",          label: "BPM Personal",   icon: "👤", badge: "BPM" },
  { id: "recepcion",    label: "Recepción MP",   icon: "🚚", badge: "PCC" },
  { id: "despacho",     label: "Despacho",       icon: "📦", badge: "PC"  },
  { id: "nc",           label: "No Conformidad", icon: "⚠️", badge: "ISO" },
  { id: "decomiso",     label: "Decomiso",       icon: "🗑️", badge: "HACCP"},
  { id: "limpieza",     label: "Limpieza POES",  icon: "🧹", badge: "POES"},
];

const USUARIOS_KEY = "sv_usuarios";
const PIN_CALIDAD = "1234";

// ─────────────────────────────────────────────────────────────
// HELPERS UI
// ─────────────────────────────────────────────────────────────
function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

function Badge({ text, color }: { text: string; color: "red" | "amber" | "blue" | "green" | "purple" | "gray" }) {
  const map = {
    red:    "bg-red-100 text-red-700",
    amber:  "bg-amber-100 text-amber-700",
    blue:   "bg-blue-100 text-blue-700",
    green:  "bg-green-100 text-green-700",
    purple: "bg-purple-100 text-purple-700",
    gray:   "bg-gray-100 text-gray-600",
  };
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${map[color]}`}>{text}</span>;
}

function AlertaBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{count}</span>;
}

function Spinner() {
  return <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />;
}

function InputNum({
  label, value, onChange, alerta, spec, required,
}: { label: string; value: string; onChange: (v: string) => void; alerta?: boolean; spec?: string; required?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs text-gray-500">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</label>
      {spec && <span className="text-[10px] text-gray-400">{spec}</span>}
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={e => onChange(e.target.value)}
        className={cn(
          "h-10 rounded-lg border px-3 text-sm font-mono transition-colors",
          alerta
            ? "border-red-400 bg-red-50 text-red-700"
            : "border-gray-200 bg-white focus:border-blue-400"
        )}
      />
      {alerta && <span className="text-[10px] text-red-500 font-medium">⚠ Fuera de rango</span>}
    </div>
  );
}

function InputTxt({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs text-gray-500">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm"
      />
    </div>
  );
}

function SelectField({
  label, value, onChange, options, alerta,
}: { label: string; value: string; onChange: (v: string) => void; options: { v: string; l: string }[]; alerta?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs text-gray-500">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={cn(
          "h-10 rounded-lg border px-3 text-sm bg-white",
          alerta ? "border-red-400 bg-red-50" : "border-gray-200"
        )}
      >
        <option value="">Seleccionar…</option>
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
      {alerta && <span className="text-[10px] text-red-500 font-medium">⚠ Requiere acción</span>}
    </div>
  );
}

function CheckItem({
  label, value, onChange,
}: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={cn(
        "flex items-center gap-2 p-2.5 rounded-lg border text-sm text-left transition-colors",
        value ? "border-green-400 bg-green-50 text-green-800" : "border-gray-200 bg-white text-gray-700"
      )}
    >
      <span className={cn("w-5 h-5 rounded flex items-center justify-center flex-shrink-0 text-xs border transition-colors",
        value ? "bg-green-500 border-green-500 text-white" : "border-gray-300"
      )}>
        {value ? "✓" : ""}
      </span>
      {label}
    </button>
  );
}

function TextArea({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs text-gray-500">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm resize-none"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// FOTO COMPONENT
// ─────────────────────────────────────────────────────────────
function FotoCaptura({
  fotos, onAdd, onRemove,
}: { fotos: FotoMeta[]; onAdd: (meta: FotoMeta) => void; onRemove: (id: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [cargando, setCargando] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCargando(true);
    try {
      const { dataUrl, w, h } = await comprimirFoto(file);
      const id = generarId("foto");
      saveFotoLocal(id, dataUrl);
      onAdd({ id, nombre: file.name, sector: "Control Volante", timestamp: new Date().toISOString(), w, h });
    } finally {
      setCargando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-gray-500">Fotos de evidencia</label>
      <div className="flex flex-wrap gap-2">
        {fotos.map(f => {
          const url = loadFotoLocal(f.id);
          return (
            <div key={f.id} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
              {url ? (
                <img src={url} alt={f.nombre} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gray-100 flex items-center justify-center text-[10px] text-gray-400 text-center px-1">Solo este dispositivo</div>
              )}
              <button
                onClick={() => onRemove(f.id)}
                className="absolute top-0 right-0 bg-red-500 text-white w-4 h-4 rounded-bl text-[9px] flex items-center justify-center"
              >✕</button>
            </div>
          );
        })}
        <button
          onClick={() => inputRef.current?.click()}
          className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-blue-400 transition-colors"
        >
          {cargando ? <Spinner /> : <><span className="text-xl">📷</span><span className="text-[10px]">Foto</span></>}
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// LOGIN SCREEN
// ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: (u: Usuario) => void }) {
  const [nombre, setNombre] = useState("");
  const [turno, setTurno] = useState<Turno>("TM");
  const [rol, setRol] = useState<RolUsuario>("control_volante");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const [recientes, setRecientes] = useState<Usuario[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(USUARIOS_KEY);
      if (stored) setRecientes(JSON.parse(stored).slice(0, 5));
    } catch {}
  }, []);

  function guardarUsuario(u: Usuario) {
    const nueva = [u, ...recientes.filter(r => r.nombre !== u.nombre || r.rol !== u.rol)].slice(0, 5);
    localStorage.setItem(USUARIOS_KEY, JSON.stringify(nueva));
  }

  function handleLogin() {
    if (!nombre.trim()) return;
    if (rol === "calidad" && pin !== PIN_CALIDAD) { setPinError(true); return; }
    const u: Usuario = { nombre: nombre.trim(), rol, turno };
    guardarUsuario(u);
    onLogin(u);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🍽️</div>
          <h1 className="text-2xl font-bold text-gray-800">Sabores Express</h1>
          <p className="text-sm text-gray-500 mt-1">Control de Calidad · Cocina Central</p>
        </div>

        {recientes.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">Acceso rápido</p>
            <div className="flex flex-col gap-1.5">
              {recientes.map((u, i) => (
                <button key={i} onClick={() => onLogin(u)}
                  className="flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-200 hover:border-blue-400 transition-colors text-sm"
                >
                  <span className="text-base">{u.rol === "calidad" ? "🔑" : "👷"}</span>
                  <div className="text-left flex-1">
                    <span className="font-medium text-gray-800">{u.nombre}</span>
                    <span className="text-gray-400 mx-1.5">·</span>
                    <span className="text-gray-500">{TURNOS.find(t => t.id === u.turno)?.label}</span>
                  </div>
                  <Badge text={u.rol === "calidad" ? "Calidad" : "CV"} color="blue" />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm flex flex-col gap-4">
          <InputTxt label="Nombre y apellido" value={nombre} onChange={setNombre} placeholder="Tu nombre completo" />

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Turno</label>
            <div className="flex gap-2">
              {TURNOS.map(t => (
                <button key={t.id} onClick={() => setTurno(t.id)}
                  className={cn("flex-1 py-2 rounded-lg text-sm font-medium border transition-colors",
                    turno === t.id ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-600 border-gray-200"
                  )}
                >{t.label}</button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Rol</label>
            <div className="flex gap-2">
              {(["control_volante", "calidad"] as RolUsuario[]).map(r => (
                <button key={r} onClick={() => setRol(r)}
                  className={cn("flex-1 py-2 rounded-lg text-sm font-medium border transition-colors",
                    rol === r ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-600 border-gray-200"
                  )}
                >{r === "calidad" ? "🔑 Calidad" : "👷 Control Volante"}</button>
              ))}
            </div>
          </div>

          {rol === "calidad" && (
            <div className="flex flex-col gap-0.5">
              <label className="text-xs text-gray-500">PIN de calidad</label>
              <input
                type="password"
                maxLength={4}
                value={pin}
                onChange={e => { setPin(e.target.value); setPinError(false); }}
                placeholder="••••"
                className={cn("h-10 rounded-lg border px-3 text-sm text-center tracking-widest",
                  pinError ? "border-red-400 bg-red-50" : "border-gray-200"
                )}
              />
              {pinError && <span className="text-xs text-red-500">PIN incorrecto</span>}
            </div>
          )}

          <button
            onClick={handleLogin}
            className="h-11 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold text-sm transition-colors"
          >Ingresar →</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// FORMULARIO: TEMPERATURAS
// ─────────────────────────────────────────────────────────────
function FormTemperaturas({ usuario, onSave, onCancel }: {
  usuario: Usuario; onSave: (r: RegistroAny) => void; onCancel: () => void;
}) {
  const [d, setD] = useState<Partial<RegistroTemperaturas>>({
    t_camara_mp: "", t_camara_pt: "", t_coccion: "", t_recalentamiento: "",
    t_transporte: "", equipo_num: "", sector: "", observaciones: "", fotos: [],
  });
  const [guardando, setGuardando] = useState(false);

  function al(campo: string, val?: string) {
    return calcularAlerta(campo, val ?? (d as Record<string, string>)[campo] ?? "");
  }

  async function guardar() {
    setGuardando(true);
    const alertas: Record<string, boolean> = {
      t_camara_mp: al("t_camara_mp"),
      t_camara_pt: parseFloat(d.t_camara_pt || "0") > -18 && d.t_camara_pt !== "",
      t_coccion: al("t_coccion"),
      t_recalentamiento: al("t_recalentamiento"),
    };
    const rec: RegistroTemperaturas = {
      id: generarId("tmp"),
      tipo: "temperaturas",
      turno: usuario.turno,
      responsable: usuario.nombre,
      fecha: fechaHoy(),
      hora: horaAhora(),
      timestamp: new Date().toISOString(),
      alertas,
      fotos: d.fotos ?? [],
      ...d,
    } as RegistroTemperaturas;
    onSave(rec);
    setGuardando(false);
  }

  return (
    <FormWrapper titulo="🌡️ Temperaturas" subtitulo="Cámaras y producto — HACCP PCC" onCancel={onCancel} onSave={guardar} guardando={guardando}>
      <InputTxt label="Sector" value={d.sector ?? ""} onChange={v => setD(p => ({ ...p, sector: v }))} placeholder="ej: Cámara 1, Línea caliente" />
      <div className="text-xs font-semibold text-red-600 uppercase tracking-wide mt-1">Puntos Críticos (PCC)</div>
      <InputNum label="T° cámara de MP" spec="Límite: ≤ 4°C" value={d.t_camara_mp ?? ""} onChange={v => setD(p => ({ ...p, t_camara_mp: v }))} alerta={al("t_camara_mp")} />
      <InputNum label="T° cámara PT" spec="≤ -18°C congelado / ≤ 4°C frío" value={d.t_camara_pt ?? ""} onChange={v => setD(p => ({ ...p, t_camara_pt: v }))} alerta={parseFloat(d.t_camara_pt || "99") > 4} />
      <InputNum label="T° núcleo de cocción" spec="Mínimo: ≥ 75°C" value={d.t_coccion ?? ""} onChange={v => setD(p => ({ ...p, t_coccion: v }))} alerta={al("t_coccion")} />
      <InputNum label="T° recalentamiento" spec="Mínimo: ≥ 65°C" value={d.t_recalentamiento ?? ""} onChange={v => setD(p => ({ ...p, t_recalentamiento: v }))} alerta={al("t_recalentamiento")} />
      <div className="text-xs font-semibold text-amber-600 uppercase tracking-wide mt-1">Puntos de Control (PC)</div>
      <InputNum label="T° transporte" value={d.t_transporte ?? ""} onChange={v => setD(p => ({ ...p, t_transporte: v }))} />
      <InputTxt label="N° equipo / termómetro" value={d.equipo_num ?? ""} onChange={v => setD(p => ({ ...p, equipo_num: v }))} />
      <FotoCaptura fotos={d.fotos ?? []} onAdd={f => setD(p => ({ ...p, fotos: [...(p.fotos ?? []), f] }))} onRemove={id => setD(p => ({ ...p, fotos: p.fotos?.filter(f => f.id !== id) ?? [] }))} />
      <TextArea label="Observaciones / acción correctiva" value={d.observaciones ?? ""} onChange={v => setD(p => ({ ...p, observaciones: v }))} placeholder="Describir desvío y acción tomada si corresponde" />
    </FormWrapper>
  );
}

// ─────────────────────────────────────────────────────────────
// FORMULARIO: PESOS
// ─────────────────────────────────────────────────────────────
function FormPesos({ usuario, onSave, onCancel }: {
  usuario: Usuario; onSave: (r: RegistroAny) => void; onCancel: () => void;
}) {
  const [d, setD] = useState<Partial<RegistroPesos>>({
    producto: "", lote: "", peso_declarado: "", peso_1: "", peso_2: "", peso_3: "",
    ajustado: "", observaciones: "", fotos: [],
  });
  const [guardando, setGuardando] = useState(false);

  const promedio = [d.peso_1, d.peso_2, d.peso_3].map(v => parseFloat(v ?? "")).filter(v => !isNaN(v));
  const prom = promedio.length > 0 ? promedio.reduce((a, b) => a + b, 0) / promedio.length : 0;
  const decl = parseFloat(d.peso_declarado ?? "");
  const desvio = decl > 0 && prom > 0 ? Math.abs((prom - decl) / decl * 100) : 0;
  const alertaPeso = desvio > 5;

  async function guardar() {
    setGuardando(true);
    const rec: RegistroPesos = {
      id: generarId("pso"),
      tipo: "pesos",
      turno: usuario.turno,
      responsable: usuario.nombre,
      fecha: fechaHoy(),
      hora: horaAhora(),
      timestamp: new Date().toISOString(),
      promedio: Math.round(prom * 10) / 10,
      desvio_pct: Math.round(desvio * 10) / 10,
      alertas: { desvio_pct: alertaPeso },
      fotos: d.fotos ?? [],
      ...d,
    } as RegistroPesos;
    onSave(rec);
    setGuardando(false);
  }

  return (
    <FormWrapper titulo="⚖️ Pesos y porciones" subtitulo="Control de gramaje — ISO 9001" onCancel={onCancel} onSave={guardar} guardando={guardando}>
      <InputTxt label="Producto" value={d.producto ?? ""} onChange={v => setD(p => ({ ...p, producto: v }))} placeholder="Nombre del producto" />
      <InputTxt label="N° de lote" value={d.lote ?? ""} onChange={v => setD(p => ({ ...p, lote: v }))} />
      <InputNum label="Peso declarado (g)" spec="Según especificación del producto" value={d.peso_declarado ?? ""} onChange={v => setD(p => ({ ...p, peso_declarado: v }))} />
      <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide mt-1">3 muestras</div>
      <div className="grid grid-cols-3 gap-2">
        {(["peso_1", "peso_2", "peso_3"] as const).map((k, i) => (
          <InputNum key={k} label={`Muestra ${i + 1} (g)`} value={d[k] ?? ""} onChange={v => setD(p => ({ ...p, [k]: v }))} />
        ))}
      </div>
      {prom > 0 && (
        <div className={cn("rounded-xl p-3 text-sm flex items-center justify-between", alertaPeso ? "bg-red-50 border border-red-300" : "bg-green-50 border border-green-300")}>
          <div>
            <div className="font-semibold">{alertaPeso ? "⚠ Desvío detectado" : "✓ Dentro de rango"}</div>
            <div className="text-xs text-gray-500 mt-0.5">Promedio: {prom.toFixed(1)} g</div>
          </div>
          <div className={cn("text-xl font-bold", alertaPeso ? "text-red-600" : "text-green-600")}>
            {desvio.toFixed(1)}%
          </div>
        </div>
      )}
      <SelectField label="¿Se ajustó?" value={d.ajustado ?? ""} onChange={v => setD(p => ({ ...p, ajustado: v }))}
        options={[{ v: "si", l: "Sí, se ajustó" }, { v: "no", l: "No se ajustó" }, { v: "retirado", l: "Producto retirado" }]}
        alerta={alertaPeso && !d.ajustado}
      />
      <FotoCaptura fotos={d.fotos ?? []} onAdd={f => setD(p => ({ ...p, fotos: [...(p.fotos ?? []), f] }))} onRemove={id => setD(p => ({ ...p, fotos: p.fotos?.filter(f => f.id !== id) ?? [] }))} />
      <TextArea label="Observaciones" value={d.observaciones ?? ""} onChange={v => setD(p => ({ ...p, observaciones: v }))} />
    </FormWrapper>
  );
}

// ─────────────────────────────────────────────────────────────
// FORMULARIO: BPM
// ─────────────────────────────────────────────────────────────
function FormBPM({ usuario, onSave, onCancel }: {
  usuario: Usuario; onSave: (r: RegistroAny) => void; onCancel: () => void;
}) {
  const [d, setD] = useState<Partial<RegistroBPM>>({
    sector: "", personal_auditado: "", lavado_manos: false, uniforme_completo: false,
    sin_joyas: false, sin_celular: false, sin_alimentos: false,
    estado_salud: "apto", personal_lesiones: "", observaciones: "", fotos: [],
  });
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    const alertas = {
      estado_salud: d.estado_salud === "no_apto",
      bpm_incompleto: !d.lavado_manos || !d.uniforme_completo,
    };
    const rec: RegistroBPM = {
      id: generarId("bpm"),
      tipo: "bpm",
      turno: usuario.turno,
      responsable: usuario.nombre,
      fecha: fechaHoy(),
      hora: horaAhora(),
      timestamp: new Date().toISOString(),
      alertas,
      fotos: d.fotos ?? [],
      ...d,
    } as RegistroBPM;
    onSave(rec);
    setGuardando(false);
  }

  const pct = [d.lavado_manos, d.uniforme_completo, d.sin_joyas, d.sin_celular, d.sin_alimentos].filter(Boolean).length * 20;

  return (
    <FormWrapper titulo="👤 BPM del personal" subtitulo="Higiene y manipulación — BPM/POES" onCancel={onCancel} onSave={guardar} guardando={guardando}>
      <InputTxt label="Sector auditado" value={d.sector ?? ""} onChange={v => setD(p => ({ ...p, sector: v }))} placeholder="ej: Producción, Frío, Despacho" />
      <InputTxt label="Personal auditado" value={d.personal_auditado ?? ""} onChange={v => setD(p => ({ ...p, personal_auditado: v }))} placeholder="Nombre/s" />

      <div className="flex items-center justify-between mb-1">
        <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Checklist BPM</div>
        <div className={cn("text-sm font-bold", pct === 100 ? "text-green-600" : pct >= 60 ? "text-amber-600" : "text-red-600")}>{pct}%</div>
      </div>
      <div className="flex flex-col gap-1.5">
        <CheckItem label="Lavado de manos al ingresar" value={d.lavado_manos ?? false} onChange={v => setD(p => ({ ...p, lavado_manos: v }))} />
        <CheckItem label="Uniforme completo (cofia, delantal, guantes)" value={d.uniforme_completo ?? false} onChange={v => setD(p => ({ ...p, uniforme_completo: v }))} />
        <CheckItem label="Sin joyas ni maquillaje" value={d.sin_joyas ?? false} onChange={v => setD(p => ({ ...p, sin_joyas: v }))} />
        <CheckItem label="Sin celular en zona de trabajo" value={d.sin_celular ?? false} onChange={v => setD(p => ({ ...p, sin_celular: v }))} />
        <CheckItem label="Sin alimentos ni bebidas fuera del área" value={d.sin_alimentos ?? false} onChange={v => setD(p => ({ ...p, sin_alimentos: v }))} />
      </div>

      <SelectField label="Estado de salud del personal" value={d.estado_salud ?? "apto"} onChange={v => setD(p => ({ ...p, estado_salud: v }))}
        options={[{ v: "apto", l: "✓ Apto para manipular" }, { v: "con_lesion", l: "⚠ Con lesión / herida" }, { v: "no_apto", l: "✕ No apto (no manipula)" }]}
        alerta={d.estado_salud === "no_apto" || d.estado_salud === "con_lesion"}
      />
      {(d.estado_salud === "con_lesion" || d.estado_salud === "no_apto") && (
        <InputTxt label="Descripción de la situación" value={d.personal_lesiones ?? ""} onChange={v => setD(p => ({ ...p, personal_lesiones: v }))} placeholder="Nombre del operario y situación" />
      )}
      <FotoCaptura fotos={d.fotos ?? []} onAdd={f => setD(p => ({ ...p, fotos: [...(p.fotos ?? []), f] }))} onRemove={id => setD(p => ({ ...p, fotos: p.fotos?.filter(f => f.id !== id) ?? [] }))} />
      <TextArea label="Observaciones / capacitación realizada" value={d.observaciones ?? ""} onChange={v => setD(p => ({ ...p, observaciones: v }))} />
    </FormWrapper>
  );
}

// ─────────────────────────────────────────────────────────────
// FORMULARIO: RECEPCIÓN MP
// ─────────────────────────────────────────────────────────────
function FormRecepcion({ usuario, onSave, onCancel }: {
  usuario: Usuario; onSave: (r: RegistroAny) => void; onCancel: () => void;
}) {
  const [d, setD] = useState<Partial<RegistroRecepcion>>({
    proveedor: "", producto: "", remito_lote: "", t_ingreso: "",
    estado_envase: "", rotulado_ok: false, fifo_ok: false,
    resultado: "", observaciones: "", fotos: [],
  });
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    const alertas = {
      t_ingreso: calcularAlerta("t_camara_mp", d.t_ingreso ?? ""),
      estado_envase: d.estado_envase === "rechazado" || d.estado_envase === "danado",
      resultado: d.resultado === "rechazado" || d.resultado === "observado",
    };
    const rec: RegistroRecepcion = {
      id: generarId("rec"),
      tipo: "recepcion",
      turno: usuario.turno,
      responsable: usuario.nombre,
      fecha: fechaHoy(),
      hora: horaAhora(),
      timestamp: new Date().toISOString(),
      alertas,
      fotos: d.fotos ?? [],
      ...d,
    } as RegistroRecepcion;
    onSave(rec);
    setGuardando(false);
  }

  return (
    <FormWrapper titulo="🚚 Recepción de MP" subtitulo="Ingreso de materias primas — PCC" onCancel={onCancel} onSave={guardar} guardando={guardando}>
      <InputTxt label="Proveedor" value={d.proveedor ?? ""} onChange={v => setD(p => ({ ...p, proveedor: v }))} />
      <InputTxt label="Producto / descripción" value={d.producto ?? ""} onChange={v => setD(p => ({ ...p, producto: v }))} />
      <InputTxt label="N° remito / lote" value={d.remito_lote ?? ""} onChange={v => setD(p => ({ ...p, remito_lote: v }))} placeholder="Para trazabilidad" />
      <InputNum label="T° al ingreso (°C)" spec="PCC — verificar según categoría de producto" value={d.t_ingreso ?? ""} onChange={v => setD(p => ({ ...p, t_ingreso: v }))} alerta={calcularAlerta("t_camara_mp", d.t_ingreso ?? "")} />
      <SelectField label="Estado del envase" value={d.estado_envase ?? ""} onChange={v => setD(p => ({ ...p, estado_envase: v }))}
        options={[{ v: "integro", l: "✓ Íntegro" }, { v: "danado", l: "⚠ Dañado (observar)" }, { v: "rechazado", l: "✕ Rechazado" }]}
        alerta={d.estado_envase === "rechazado"}
      />
      <div className="flex flex-col gap-1.5">
        <CheckItem label="Rotulado correcto (fecha, lote, denominación)" value={d.rotulado_ok ?? false} onChange={v => setD(p => ({ ...p, rotulado_ok: v }))} />
        <CheckItem label="FIFO/FEFO aplicado" value={d.fifo_ok ?? false} onChange={v => setD(p => ({ ...p, fifo_ok: v }))} />
      </div>
      <SelectField label="Resultado final" value={d.resultado ?? ""} onChange={v => setD(p => ({ ...p, resultado: v }))}
        options={[{ v: "aprobado", l: "✓ Aprobado" }, { v: "observado", l: "⚠ Aprobado con observación" }, { v: "rechazado", l: "✕ Rechazado y devuelto" }]}
        alerta={d.resultado === "rechazado"}
      />
      <FotoCaptura fotos={d.fotos ?? []} onAdd={f => setD(p => ({ ...p, fotos: [...(p.fotos ?? []), f] }))} onRemove={id => setD(p => ({ ...p, fotos: p.fotos?.filter(f => f.id !== id) ?? [] }))} />
      <TextArea label="Observaciones" value={d.observaciones ?? ""} onChange={v => setD(p => ({ ...p, observaciones: v }))} />
    </FormWrapper>
  );
}

// ─────────────────────────────────────────────────────────────
// FORMULARIO: DESPACHO
// ─────────────────────────────────────────────────────────────
function FormDespacho({ usuario, onSave, onCancel }: {
  usuario: Usuario; onSave: (r: RegistroAny) => void; onCancel: () => void;
}) {
  const [d, setD] = useState<Partial<RegistroDespacho>>({
    local_destino: "", producto: "", lote: "", cantidad: "",
    t_despacho: "", t_transporte: "", etiquetado_ok: false,
    estado_embalaje: "", observaciones: "", fotos: [],
  });
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    const tDesp = parseFloat(d.t_despacho ?? "99");
    const tTrans = parseFloat(d.t_transporte ?? "99");
    const alertas = {
      t_despacho: tDesp > 4,
      t_transporte: tTrans > 7,
      etiquetado: !d.etiquetado_ok,
    };
    const rec: RegistroDespacho = {
      id: generarId("dsp"),
      tipo: "despacho",
      turno: usuario.turno,
      responsable: usuario.nombre,
      fecha: fechaHoy(),
      hora: horaAhora(),
      timestamp: new Date().toISOString(),
      alertas,
      fotos: d.fotos ?? [],
      ...d,
    } as RegistroDespacho;
    onSave(rec);
    setGuardando(false);
  }

  return (
    <FormWrapper titulo="📦 Despacho" subtitulo="Producto terminado a locales — PCC" onCancel={onCancel} onSave={guardar} guardando={guardando}>
      <InputTxt label="Local destino (N° o nombre)" value={d.local_destino ?? ""} onChange={v => setD(p => ({ ...p, local_destino: v }))} />
      <InputTxt label="Producto" value={d.producto ?? ""} onChange={v => setD(p => ({ ...p, producto: v }))} />
      <InputTxt label="N° de lote" value={d.lote ?? ""} onChange={v => setD(p => ({ ...p, lote: v }))} />
      <InputNum label="Cantidad / unidades" value={d.cantidad ?? ""} onChange={v => setD(p => ({ ...p, cantidad: v }))} />
      <InputNum label="T° producto al despacho (°C)" spec="PCC — ≤ 4°C frío / ≤ -18°C congelado" value={d.t_despacho ?? ""} onChange={v => setD(p => ({ ...p, t_despacho: v }))} alerta={parseFloat(d.t_despacho ?? "99") > 4} />
      <InputNum label="T° transporte (°C)" spec="PCC — ≤ 7°C" value={d.t_transporte ?? ""} onChange={v => setD(p => ({ ...p, t_transporte: v }))} alerta={parseFloat(d.t_transporte ?? "99") > 7} />
      <CheckItem label="Etiquetado correcto (fecha elaboración, vencimiento, lote)" value={d.etiquetado_ok ?? false} onChange={v => setD(p => ({ ...p, etiquetado_ok: v }))} />
      <SelectField label="Estado del embalaje" value={d.estado_embalaje ?? ""} onChange={v => setD(p => ({ ...p, estado_embalaje: v }))}
        options={[{ v: "integro", l: "✓ Íntegro" }, { v: "con_dano", l: "⚠ Con daño" }]}
      />
      <FotoCaptura fotos={d.fotos ?? []} onAdd={f => setD(p => ({ ...p, fotos: [...(p.fotos ?? []), f] }))} onRemove={id => setD(p => ({ ...p, fotos: p.fotos?.filter(f => f.id !== id) ?? [] }))} />
      <TextArea label="Observaciones" value={d.observaciones ?? ""} onChange={v => setD(p => ({ ...p, observaciones: v }))} />
    </FormWrapper>
  );
}

// ─────────────────────────────────────────────────────────────
// FORMULARIO: NC
// ─────────────────────────────────────────────────────────────
function FormNC({ usuario, onSave, onCancel }: {
  usuario: Usuario; onSave: (r: RegistroAny) => void; onCancel: () => void;
}) {
  const [d, setD] = useState<Partial<RegistroNC>>({
    tipo_nc: "", descripcion: "", lote_afectado: "", causa_raiz: "",
    accion_inmediata: "", requiere_nc_formal: false,
    responsable_sector: "", fotos: [],
  });
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    const rec: RegistroNC = {
      id: generarId("nc"),
      tipo: "nc",
      turno: usuario.turno,
      responsable: usuario.nombre,
      fecha: fechaHoy(),
      hora: horaAhora(),
      timestamp: new Date().toISOString(),
      alertas: { sin_accion: !d.accion_inmediata },
      fotos: d.fotos ?? [],
      ...d,
    } as RegistroNC;
    onSave(rec);
    setGuardando(false);
  }

  return (
    <FormWrapper titulo="⚠️ No Conformidad" subtitulo="Desvíos y acciones correctivas — ISO 9001" onCancel={onCancel} onSave={guardar} guardando={guardando}>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
        Registrá todos los desvíos, incluso los menores. El historial es tu evidencia.
      </div>
      <SelectField label="Tipo de NC" value={d.tipo_nc ?? ""} onChange={v => setD(p => ({ ...p, tipo_nc: v }))}
        options={[
          { v: "proceso", l: "Proceso / operación" },
          { v: "producto", l: "Calidad del producto" },
          { v: "bpm", l: "Incumplimiento BPM" },
          { v: "proveedor", l: "Materia prima / proveedor" },
          { v: "infraestructura", l: "Infraestructura / equipo" },
        ]}
      />
      <TextArea label="Descripción del desvío" value={d.descripcion ?? ""} onChange={v => setD(p => ({ ...p, descripcion: v }))} placeholder="Qué ocurrió, dónde, a qué hora. Ser específico." />
      <InputTxt label="Producto / lote afectado" value={d.lote_afectado ?? ""} onChange={v => setD(p => ({ ...p, lote_afectado: v }))} />
      <SelectField label="Causa raíz (preliminar)" value={d.causa_raiz ?? ""} onChange={v => setD(p => ({ ...p, causa_raiz: v }))}
        options={[
          { v: "humano", l: "Factor humano" },
          { v: "equipo", l: "Equipo / maquinaria" },
          { v: "metodo", l: "Método / procedimiento" },
          { v: "insumo", l: "Materia prima / insumo" },
          { v: "ambiente", l: "Ambiente / infraestructura" },
        ]}
      />
      <TextArea label="Acción inmediata tomada" value={d.accion_inmediata ?? ""} onChange={v => setD(p => ({ ...p, accion_inmediata: v }))} placeholder="Qué se hizo para solucionar en el momento" />
      <CheckItem label="Requiere apertura de NC formal (documentación interna)" value={d.requiere_nc_formal ?? false} onChange={v => setD(p => ({ ...p, requiere_nc_formal: v }))} />
      <InputTxt label="Responsable del sector" value={d.responsable_sector ?? ""} onChange={v => setD(p => ({ ...p, responsable_sector: v }))} />
      <FotoCaptura fotos={d.fotos ?? []} onAdd={f => setD(p => ({ ...p, fotos: [...(p.fotos ?? []), f] }))} onRemove={id => setD(p => ({ ...p, fotos: p.fotos?.filter(f => f.id !== id) ?? [] }))} />
    </FormWrapper>
  );
}

// ─────────────────────────────────────────────────────────────
// FORMULARIO: DECOMISO
// ─────────────────────────────────────────────────────────────
function FormDecomiso({ usuario, onSave, onCancel }: {
  usuario: Usuario; onSave: (r: RegistroAny) => void; onCancel: () => void;
}) {
  const [d, setD] = useState<Partial<RegistroDecomiso>>({
    producto: "", lote: "", cantidad_kg: "", motivo: "",
    etapa_deteccion: "", destino: "", observaciones: "", fotos: [],
  });
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    const rec: RegistroDecomiso = {
      id: generarId("dec"),
      tipo: "decomiso",
      turno: usuario.turno,
      responsable: usuario.nombre,
      fecha: fechaHoy(),
      hora: horaAhora(),
      timestamp: new Date().toISOString(),
      alertas: { sin_foto: (d.fotos ?? []).length === 0 },
      fotos: d.fotos ?? [],
      ...d,
    } as RegistroDecomiso;
    onSave(rec);
    setGuardando(false);
  }

  return (
    <FormWrapper titulo="🗑️ Decomiso" subtitulo="Producto rechazado — HACCP obligatorio" onCancel={onCancel} onSave={guardar} guardando={guardando}>
      <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 font-medium">
        La foto es obligatoria. Documentar antes de retirar el producto.
      </div>
      <InputTxt label="Producto decomisado" value={d.producto ?? ""} onChange={v => setD(p => ({ ...p, producto: v }))} />
      <InputTxt label="N° de lote" value={d.lote ?? ""} onChange={v => setD(p => ({ ...p, lote: v }))} />
      <InputNum label="Cantidad (kg)" value={d.cantidad_kg ?? ""} onChange={v => setD(p => ({ ...p, cantidad_kg: v }))} />
      <SelectField label="Motivo del decomiso" value={d.motivo ?? ""} onChange={v => setD(p => ({ ...p, motivo: v }))}
        options={[
          { v: "vencido", l: "Producto vencido" },
          { v: "temperatura", l: "Ruptura de cadena de frío" },
          { v: "dano", l: "Daño físico del producto" },
          { v: "contaminacion", l: "Contaminación (cruzada / visual)" },
          { v: "rotulado", l: "Error de rotulado / etiqueta" },
          { v: "otro", l: "Otro (especificar en obs.)" },
        ]}
      />
      <SelectField label="Etapa de detección" value={d.etapa_deteccion ?? ""} onChange={v => setD(p => ({ ...p, etapa_deteccion: v }))}
        options={[
          { v: "mp", l: "Recepción de MP" },
          { v: "produccion", l: "Durante producción" },
          { v: "pt", l: "Producto terminado" },
          { v: "despacho", l: "En despacho / transporte" },
        ]}
      />
      <SelectField label="Destino del producto" value={d.destino ?? ""} onChange={v => setD(p => ({ ...p, destino: v }))}
        options={[
          { v: "destruccion", l: "Destrucción / descarte" },
          { v: "devolucion", l: "Devolución al proveedor" },
          { v: "reproceso", l: "Reproceso (si aplica)" },
        ]}
      />
      <FotoCaptura fotos={d.fotos ?? []} onAdd={f => setD(p => ({ ...p, fotos: [...(p.fotos ?? []), f] }))} onRemove={id => setD(p => ({ ...p, fotos: p.fotos?.filter(f => f.id !== id) ?? [] }))} />
      <TextArea label="Observaciones" value={d.observaciones ?? ""} onChange={v => setD(p => ({ ...p, observaciones: v }))} />
    </FormWrapper>
  );
}

// ─────────────────────────────────────────────────────────────
// FORMULARIO: LIMPIEZA POES
// ─────────────────────────────────────────────────────────────
function FormLimpieza({ usuario, onSave, onCancel }: {
  usuario: Usuario; onSave: (r: RegistroAny) => void; onCancel: () => void;
}) {
  const [d, setD] = useState<Partial<RegistroLimpieza>>({
    sector: "", superficies_contacto: false, pisos_desagues: false,
    equipos: false, camaras: false, sanitizante: "", concentracion: "",
    atp_nivel: "", responsable_limpieza: "", observaciones: "", fotos: [],
  });
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    const alertas = {
      superficies_no_ok: !d.superficies_contacto,
    };
    const rec: RegistroLimpieza = {
      id: generarId("lim"),
      tipo: "limpieza",
      turno: usuario.turno,
      responsable: usuario.nombre,
      fecha: fechaHoy(),
      hora: horaAhora(),
      timestamp: new Date().toISOString(),
      alertas,
      fotos: d.fotos ?? [],
      ...d,
    } as RegistroLimpieza;
    onSave(rec);
    setGuardando(false);
  }

  const checks = [d.superficies_contacto, d.pisos_desagues, d.equipos, d.camaras];
  const pct = checks.filter(Boolean).length * 25;

  return (
    <FormWrapper titulo="🧹 Limpieza POES" subtitulo="Verificación sanitaria — POES/BPM" onCancel={onCancel} onSave={guardar} guardando={guardando}>
      <SelectField label="Sector verificado" value={d.sector ?? ""} onChange={v => setD(p => ({ ...p, sector: v }))}
        options={[
          { v: "cocina_caliente", l: "Cocina caliente" },
          { v: "cocina_fria", l: "Cocina fría" },
          { v: "camara", l: "Cámara frigorífica" },
          { v: "despacho", l: "Área de despacho" },
          { v: "sanitarios", l: "Sanitarios / vestuarios" },
          { v: "almacen", l: "Almacén / depósito" },
        ]}
      />
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Verificación</div>
        <div className={cn("text-sm font-bold", pct === 100 ? "text-green-600" : "text-amber-600")}>{pct}%</div>
      </div>
      <div className="flex flex-col gap-1.5">
        <CheckItem label="Superficies en contacto con alimentos (PCC)" value={d.superficies_contacto ?? false} onChange={v => setD(p => ({ ...p, superficies_contacto: v }))} />
        <CheckItem label="Pisos y desagües sin residuos" value={d.pisos_desagues ?? false} onChange={v => setD(p => ({ ...p, pisos_desagues: v }))} />
        <CheckItem label="Equipos (hornos, freidoras, etc.)" value={d.equipos ?? false} onChange={v => setD(p => ({ ...p, equipos: v }))} />
        <CheckItem label="Cámaras frigoríficas (paredes, pisos, estantes)" value={d.camaras ?? false} onChange={v => setD(p => ({ ...p, camaras: v }))} />
      </div>
      <InputTxt label="Sanitizante utilizado" value={d.sanitizante ?? ""} onChange={v => setD(p => ({ ...p, sanitizante: v }))} placeholder="Nombre del producto" />
      <InputTxt label="Concentración" value={d.concentracion ?? ""} onChange={v => setD(p => ({ ...p, concentracion: v }))} placeholder="ej: 200 ppm de cloro" />
      <InputNum label="Nivel ATP (si aplica)" spec="Umbral de aprobación según protocolo" value={d.atp_nivel ?? ""} onChange={v => setD(p => ({ ...p, atp_nivel: v }))} />
      <InputTxt label="Responsable de limpieza" value={d.responsable_limpieza ?? ""} onChange={v => setD(p => ({ ...p, responsable_limpieza: v }))} />
      <FotoCaptura fotos={d.fotos ?? []} onAdd={f => setD(p => ({ ...p, fotos: [...(p.fotos ?? []), f] }))} onRemove={id => setD(p => ({ ...p, fotos: p.fotos?.filter(f => f.id !== id) ?? [] }))} />
      <TextArea label="Observaciones" value={d.observaciones ?? ""} onChange={v => setD(p => ({ ...p, observaciones: v }))} />
    </FormWrapper>
  );
}

// ─────────────────────────────────────────────────────────────
// WRAPPER DE FORMULARIO
// ─────────────────────────────────────────────────────────────
function FormWrapper({ titulo, subtitulo, onCancel, onSave, guardando, children }: {
  titulo: string; subtitulo: string; onCancel: () => void;
  onSave: () => void; guardando: boolean; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-4 border-b border-gray-100 bg-white sticky top-0 z-10">
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 p-1">←</button>
        <div className="flex-1">
          <div className="font-semibold text-gray-800 text-sm">{titulo}</div>
          <div className="text-xs text-gray-400">{subtitulo}</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 pb-24">
        {children}
      </div>
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 flex gap-3 max-w-lg mx-auto">
        <button onClick={onCancel} className="flex-1 h-11 rounded-xl border border-gray-200 text-sm text-gray-600 font-medium">Cancelar</button>
        <button
          onClick={onSave}
          disabled={guardando}
          className="flex-2 flex-grow h-11 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
        >
          {guardando ? <Spinner /> : "Guardar registro ✓"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CARD DE REGISTRO
// ─────────────────────────────────────────────────────────────
function RegistroCard({ reg, onDelete, isCalidad }: {
  reg: RegistroAny; onDelete?: () => void; isCalidad: boolean;
}) {
  const [expandido, setExpandido] = useState(false);
  const alertas = contarAlertas(reg.alertas);
  const modulo = TIPOS_MODULO.find(m => m.id === reg.tipo);

  function renderDetalle() {
    switch (reg.tipo) {
      case "temperaturas": return (
        <div className="grid grid-cols-2 gap-1 text-xs mt-2">
          {reg.t_camara_mp && <span>Cámara MP: <b>{reg.t_camara_mp}°C</b></span>}
          {reg.t_camara_pt && <span>Cámara PT: <b>{reg.t_camara_pt}°C</b></span>}
          {reg.t_coccion && <span>Cocción: <b>{reg.t_coccion}°C</b></span>}
          {reg.t_recalentamiento && <span>Recalent.: <b>{reg.t_recalentamiento}°C</b></span>}
          {reg.observaciones && <span className="col-span-2 text-gray-500 mt-1">{reg.observaciones}</span>}
        </div>
      );
      case "pesos": return (
        <div className="text-xs mt-2 flex flex-col gap-0.5">
          <span>{reg.producto} — Lote: {reg.lote}</span>
          <span>Declarado: {reg.peso_declarado}g · Promedio: <b>{reg.promedio}g</b> · Desvío: <b className={reg.desvio_pct > 5 ? "text-red-600" : "text-green-600"}>{reg.desvio_pct}%</b></span>
        </div>
      );
      case "bpm": return (
        <div className="text-xs mt-2">
          <span>{reg.sector} — {reg.personal_auditado}</span>
          <span className={cn("ml-2 font-medium", reg.estado_salud === "apto" ? "text-green-600" : "text-red-600")}>
            {reg.estado_salud === "apto" ? "✓ Apto" : "⚠ " + reg.estado_salud}
          </span>
          {reg.observaciones && <p className="text-gray-500 mt-1">{reg.observaciones}</p>}
        </div>
      );
      case "recepcion": return (
        <div className="text-xs mt-2">
          <p>{reg.proveedor} — {reg.producto}</p>
          <p>T°: {reg.t_ingreso}°C · Resultado: <b>{reg.resultado}</b></p>
        </div>
      );
      case "despacho": return (
        <div className="text-xs mt-2">
          <p>Local {reg.local_destino} — {reg.producto} ({reg.cantidad} u.)</p>
          <p>T° despacho: {reg.t_despacho}°C · Transporte: {reg.t_transporte}°C</p>
        </div>
      );
      case "nc": return (
        <div className="text-xs mt-2">
          <p className="font-medium text-amber-700">{reg.tipo_nc?.toUpperCase()}</p>
          <p>{reg.descripcion}</p>
          {reg.accion_inmediata && <p className="text-green-700 mt-0.5">Acción: {reg.accion_inmediata}</p>}
        </div>
      );
      case "decomiso": return (
        <div className="text-xs mt-2">
          <p>{reg.producto} — Lote: {reg.lote}</p>
          <p className="text-red-600 font-medium">{reg.cantidad_kg} kg — {reg.motivo} → {reg.destino}</p>
        </div>
      );
      case "limpieza": return (
        <div className="text-xs mt-2">
          <p>Sector: {reg.sector}</p>
          <p>Sanitizante: {reg.sanitizante} {reg.concentracion}</p>
        </div>
      );
      default: return null;
    }
  }

  return (
    <div
      className={cn(
        "rounded-xl border bg-white overflow-hidden transition-colors",
        alertas > 0 ? "border-red-300" : "border-gray-200"
      )}
    >
      <div className="flex items-center gap-2 p-3 cursor-pointer" onClick={() => setExpandido(!expandido)}>
        <span className="text-xl">{modulo?.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-800">{modulo?.label}</span>
            <AlertaBadge count={alertas} />
            {reg.fotos.length > 0 && <span className="text-xs text-gray-400">📷 {reg.fotos.length}</span>}
          </div>
          <div className="text-xs text-gray-400">{reg.hora} · {reg.responsable}</div>
        </div>
        <span className="text-gray-300 text-xs">{expandido ? "▲" : "▼"}</span>
      </div>
      {expandido && (
        <div className="px-3 pb-3 border-t border-gray-100">
          {renderDetalle()}
          {isCalidad && onDelete && (
            <button onClick={onDelete} className="mt-2 text-xs text-red-400 hover:text-red-600">Eliminar registro</button>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────
function Dashboard({ registros }: { registros: RegistroAny[] }) {
  const kpis = calcularKPIs(registros);

  const barData = TIPOS_MODULO.map(m => ({
    name: m.label.split(" ")[0],
    cantidad: kpis.registros_por_tipo[m.id] ?? 0,
  }));

  const alertasPorTurno = TURNOS.map(t => ({
    turno: t.label,
    alertas: registros.filter(r => r.turno === t.id).reduce((a, r) => a + contarAlertas(r.alertas), 0),
    registros: registros.filter(r => r.turno === t.id).length,
  }));

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Registros hoy", value: kpis.total_registros, color: "text-blue-600" },
          { label: "Alertas PCC", value: kpis.total_alertas, color: kpis.total_alertas > 0 ? "text-red-600" : "text-green-600" },
          { label: "No conformidades", value: kpis.total_nc, color: kpis.total_nc > 0 ? "text-amber-600" : "text-green-600" },
          { label: "Decomisos (kg)", value: kpis.kg_decomisados, color: "text-gray-700" },
          { label: "BPM cumplimiento", value: `${kpis.pct_cumplimiento_bpm}%`, color: kpis.pct_cumplimiento_bpm >= 80 ? "text-green-600" : "text-red-600" },
          { label: "Decomisos (cant.)", value: kpis.total_decomisos, color: "text-gray-700" },
        ].map((k, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-3">
            <div className="text-xs text-gray-400">{k.label}</div>
            <div className={`text-2xl font-bold mt-0.5 ${k.color}`}>{k.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Registros por módulo</div>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={barData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey="cantidad" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Alertas por turno (hoy)</div>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={alertasPorTurno} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <XAxis dataKey="turno" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey="registros" fill="#93c5fd" radius={[4, 4, 0, 0]} name="Registros" />
            <Bar dataKey="alertas" fill="#f87171" radius={[4, 4, 0, 0]} name="Alertas" />
            <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// REPORTE DIARIO TXT
// ─────────────────────────────────────────────────────────────
function generarReporteTxt(registros: RegistroAny[], fecha: string): string {
  const kpis = calcularKPIs(registros);
  let txt = `REPORTE DIARIO — CONTROL VOLANTE\n`;
  txt += `Sabores Express · Cocina Central\n`;
  txt += `Fecha: ${fechaDisplay(fecha)}\n`;
  txt += `Generado: ${new Date().toLocaleString("es-AR")}\n`;
  txt += `${"─".repeat(40)}\n\n`;

  txt += `RESUMEN DEL DÍA\n`;
  txt += `Total registros: ${kpis.total_registros}\n`;
  txt += `Alertas PCC: ${kpis.total_alertas}\n`;
  txt += `No conformidades: ${kpis.total_nc}\n`;
  txt += `Decomisos: ${kpis.total_decomisos} (${kpis.kg_decomisados} kg)\n`;
  txt += `Cumplimiento BPM: ${kpis.pct_cumplimiento_bpm}%\n\n`;

  for (const turno of TURNOS) {
    const recs = registros.filter(r => r.turno === turno.id);
    if (recs.length === 0) continue;
    txt += `${"─".repeat(40)}\n`;
    txt += `TURNO ${turno.label.toUpperCase()} (${turno.id})\n`;
    txt += `${"─".repeat(40)}\n`;
    for (const r of recs) {
      const modulo = TIPOS_MODULO.find(m => m.id === r.tipo);
      const alertas = contarAlertas(r.alertas);
      txt += `\n[${r.hora}] ${modulo?.icon} ${modulo?.label}`;
      txt += alertas > 0 ? ` ⚠ ${alertas} ALERTA(S)` : " ✓";
      txt += `\n  Responsable: ${r.responsable}\n`;
      if (r.tipo === "nc") {
        txt += `  Tipo: ${r.tipo_nc} | Causa: ${r.causa_raiz}\n`;
        txt += `  Descripción: ${r.descripcion}\n`;
        txt += `  Acción: ${r.accion_inmediata}\n`;
      } else if (r.tipo === "decomiso") {
        txt += `  Producto: ${r.producto} | ${r.cantidad_kg}kg | ${r.motivo}\n`;
        txt += `  Destino: ${r.destino}\n`;
      } else if (r.tipo === "temperaturas") {
        if (r.t_camara_mp) txt += `  Cámara MP: ${r.t_camara_mp}°C\n`;
        if (r.t_coccion) txt += `  Cocción: ${r.t_coccion}°C\n`;
        if (r.observaciones) txt += `  Obs: ${r.observaciones}\n`;
      }
    }
    txt += "\n";
  }
  return txt;
}

// ─────────────────────────────────────────────────────────────
// VISTA PRINCIPAL
// ─────────────────────────────────────────────────────────────
type Vista = "home" | "form" | "lista" | "dashboard";

export default function ControlVolante() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [vista, setVista] = useState<Vista>("home");
  const [modulo, setModulo] = useState<TipoRegistro | null>(null);
  const [filtroTurno, setFiltroTurno] = useState<Turno | "todos">("todos");
  const [registros, setRegistros] = useState<RegistroAny[]>([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tipo: "ok" | "err" } | null>(null);
  const fecha = fechaHoy();

  const mostrarToast = useCallback((msg: string, tipo: "ok" | "err" = "ok") => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3000);
  }, []);

  async function cargarRegistros() {
    if (!usuario) return;
    setCargando(true);
    try {
      const colRef = collection(db, `registros/${fecha.replace(/-/g, "")}/items`);
      const snap = await getDocs(query(colRef, orderBy("timestamp", "desc")));
      setRegistros(snap.docs.map(d => d.data() as RegistroAny));
    } catch {
      mostrarToast("Error al cargar registros", "err");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { if (usuario) cargarRegistros(); }, [usuario]);

  async function guardarRegistro(rec: RegistroAny) {
    setGuardando(true);
    try {
      const sanitized = sanitizarParaFirestore(rec as unknown as Record<string, unknown>);
      await setDoc(doc(db, `registros/${fecha.replace(/-/g, "")}/items/${rec.id}`), sanitized);
      setRegistros(prev => [rec, ...prev.filter(r => r.id !== rec.id)]);
      mostrarToast(`✓ Registro guardado — ${contarAlertas(rec.alertas) > 0 ? "⚠ con alertas" : "sin desvíos"}`);
      setVista("home");
      setModulo(null);
    } catch {
      mostrarToast("Error al guardar. Verificá conexión.", "err");
    } finally {
      setGuardando(false);
    }
  }

  async function eliminarRegistro(id: string) {
    try {
      await deleteDoc(doc(db, `registros/${fecha.replace(/-/g, "")}/items/${id}`));
      setRegistros(prev => prev.filter(r => r.id !== id));
      mostrarToast("Registro eliminado");
    } catch {
      mostrarToast("Error al eliminar", "err");
    }
  }

  function exportarTxt() {
    const txt = generarReporteTxt(registros, fecha);
    const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `reporte_${fecha}_CV.txt`;
    a.click();
  }

  if (!usuario) return <LoginScreen onLogin={setUsuario} />;

  const registrosFiltrados = filtroTurno === "todos"
    ? registros
    : registros.filter(r => r.turno === filtroTurno);

  const alertasHoy = registros.reduce((a, r) => a + contarAlertas(r.alertas), 0);

  // ── RENDER FORMULARIO ──
  if (vista === "form" && modulo) {
    const props = { usuario, onSave: guardarRegistro, onCancel: () => { setVista("home"); setModulo(null); } };
    return (
      <div className="min-h-screen bg-gray-50 max-w-lg mx-auto">
        {modulo === "temperaturas" && <FormTemperaturas {...props} />}
        {modulo === "pesos"        && <FormPesos {...props} />}
        {modulo === "bpm"          && <FormBPM {...props} />}
        {modulo === "recepcion"    && <FormRecepcion {...props} />}
        {modulo === "despacho"     && <FormDespacho {...props} />}
        {modulo === "nc"           && <FormNC {...props} />}
        {modulo === "decomiso"     && <FormDecomiso {...props} />}
        {modulo === "limpieza"     && <FormLimpieza {...props} />}
      </div>
    );
  }

  // ── RENDER LISTA ──
  if (vista === "lista") {
    return (
      <div className="min-h-screen bg-gray-50 max-w-lg mx-auto pb-20">
        <div className="bg-white border-b border-gray-100 p-4 sticky top-0 z-10 flex items-center gap-3">
          <button onClick={() => setVista("home")} className="text-gray-400 p-1">←</button>
          <span className="font-semibold text-gray-800 flex-1">Registros de hoy</span>
          {usuario.rol === "calidad" && (
            <button onClick={exportarTxt} className="text-xs text-blue-500 font-medium">Exportar .txt</button>
          )}
        </div>
        <div className="p-3 flex gap-2 overflow-x-auto pb-1">
          {(["todos", ...TURNOS.map(t => t.id)] as (Turno | "todos")[]).map(t => (
            <button key={t} onClick={() => setFiltroTurno(t)}
              className={cn("px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors",
                filtroTurno === t ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-600 border-gray-200"
              )}
            >{t === "todos" ? "Todos" : TURNOS.find(tt => tt.id === t)?.label}</button>
          ))}
        </div>
        {cargando ? (
          <div className="flex items-center justify-center p-12"><Spinner /></div>
        ) : registrosFiltrados.length === 0 ? (
          <div className="text-center p-12 text-gray-400">
            <div className="text-4xl mb-2">📋</div>
            <p className="text-sm">Sin registros{filtroTurno !== "todos" ? ` en turno ${filtroTurno}` : ""}</p>
          </div>
        ) : (
          <div className="p-3 flex flex-col gap-2">
            {registrosFiltrados.map(r => (
              <RegistroCard key={r.id} reg={r} isCalidad={usuario.rol === "calidad"}
                onDelete={usuario.rol === "calidad" ? () => eliminarRegistro(r.id) : undefined}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── RENDER DASHBOARD ──
  if (vista === "dashboard") {
    return (
      <div className="min-h-screen bg-gray-50 max-w-lg mx-auto pb-20">
        <div className="bg-white border-b border-gray-100 p-4 sticky top-0 z-10 flex items-center gap-3">
          <button onClick={() => setVista("home")} className="text-gray-400 p-1">←</button>
          <span className="font-semibold text-gray-800">Dashboard · {fechaDisplay(fecha)}</span>
        </div>
        <Dashboard registros={registros} />
      </div>
    );
  }

  // ── HOME ──
  return (
    <div className="min-h-screen bg-gray-50 max-w-lg mx-auto pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400">Sabores Express · Control Volante</p>
            <p className="text-base font-bold text-gray-800">{usuario.nombre}</p>
          </div>
          <div className="flex items-center gap-2">
            {alertasHoy > 0 && <AlertaBadge count={alertasHoy} />}
            <div className={cn("text-xs font-semibold px-2 py-1 rounded-full",
              usuario.turno === "TM" ? "bg-amber-100 text-amber-700" :
              usuario.turno === "TT" ? "bg-blue-100 text-blue-700" :
              "bg-indigo-100 text-indigo-700"
            )}>
              {TURNOS.find(t => t.id === usuario.turno)?.label}
            </div>
            <button onClick={() => setUsuario(null)} className="text-xs text-gray-400 hover:text-gray-600 ml-1">Salir</button>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-xs text-gray-400">{fechaDisplay(fecha)}</span>
          <span className="text-xs text-gray-300">·</span>
          <span className="text-xs text-gray-400">{registros.length} registros</span>
          {cargando && <Spinner />}
        </div>
      </div>

      {/* Acciones rápidas */}
      <div className="flex gap-2 px-4 pt-3">
        <button onClick={() => { setVista("lista"); }} className="flex-1 h-10 rounded-xl bg-white border border-gray-200 text-xs font-medium text-gray-700 flex items-center justify-center gap-1.5 hover:border-blue-400 transition-colors">
          📋 Ver registros ({registros.length})
        </button>
        <button onClick={() => setVista("dashboard")} className="flex-1 h-10 rounded-xl bg-white border border-gray-200 text-xs font-medium text-gray-700 flex items-center justify-center gap-1.5 hover:border-blue-400 transition-colors">
          📊 Dashboard
        </button>
      </div>

      {/* Grid de módulos */}
      <div className="px-4 pt-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Nuevo registro</p>
        <div className="grid grid-cols-2 gap-2.5">
          {TIPOS_MODULO.map(m => (
            <button
              key={m.id}
              onClick={() => { setModulo(m.id); setVista("form"); }}
              className="bg-white rounded-2xl border border-gray-200 p-4 text-left hover:border-blue-400 hover:shadow-sm transition-all active:scale-95"
            >
              <div className="text-2xl mb-2">{m.icon}</div>
              <div className="text-sm font-semibold text-gray-800 leading-tight">{m.label}</div>
              <div className="mt-2">
                <Badge
                  text={m.badge}
                  color={m.badge === "PCC" ? "red" : m.badge === "PC" ? "amber" : m.badge === "BPM" ? "green" : m.badge === "POES" ? "purple" : m.badge === "HACCP" ? "red" : "blue"}
                />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Últimos registros preview */}
      {registros.length > 0 && (
        <div className="px-4 pt-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Últimos registros</p>
          <div className="flex flex-col gap-2">
            {registros.slice(0, 3).map(r => (
              <RegistroCard key={r.id} reg={r} isCalidad={usuario.rol === "calidad"}
                onDelete={usuario.rol === "calidad" ? () => eliminarRegistro(r.id) : undefined}
              />
            ))}
            {registros.length > 3 && (
              <button onClick={() => setVista("lista")} className="text-xs text-blue-500 font-medium text-center py-1">
                Ver todos los {registros.length} registros →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={cn(
          "fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-white text-sm font-medium shadow-lg z-50 transition-all",
          toast.tipo === "ok" ? "bg-gray-800" : "bg-red-500"
        )}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
