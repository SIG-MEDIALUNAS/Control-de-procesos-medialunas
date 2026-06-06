"use client";

// ═══════════════════════════════════════════════════════════════
// CONTROL VOLANTE — SABORES EXPRESS
// App de control de calidad · Archivo autónomo · v1.0
// Stack: Next.js + Firebase Firestore + Recharts
// Reemplaza: components/checklist-medialunas.tsx
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef, useCallback } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, doc, setDoc, getDocs, query, orderBy, deleteDoc } from "firebase/firestore";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

// ─────────────────────────────────────────────────────────────
// FIREBASE
// ─────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db  = getFirestore(app);

// ─────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────
type Turno       = "TM" | "TT" | "TN";
type RolUsuario  = "calidad" | "control_volante";
type TipoRegistro = "temperaturas" | "pesos" | "bpm" | "recepcion" | "despacho" | "nc" | "decomiso" | "limpieza";

interface Usuario  { nombre: string; rol: RolUsuario; turno: Turno; }
interface FotoMeta { id: string; nombre: string; sector: string; timestamp: string; w: number; h: number; }

interface BaseRegistro {
  id: string; tipo: TipoRegistro; turno: Turno;
  responsable: string; fecha: string; hora: string;
  timestamp: string; alertas: Record<string, boolean>; fotos: FotoMeta[];
}
interface RegistroTemperaturas extends BaseRegistro {
  tipo: "temperaturas"; sector: string;
  t_camara_mp: string; t_camara_pt: string;
  t_coccion: string; t_recalentamiento: string;
  t_transporte: string; equipo_num: string; observaciones: string;
}
interface RegistroPesos extends BaseRegistro {
  tipo: "pesos"; producto: string; lote: string;
  peso_declarado: string; peso_1: string; peso_2: string; peso_3: string;
  promedio: number; desvio_pct: number; ajustado: string; observaciones: string;
}
interface RegistroBPM extends BaseRegistro {
  tipo: "bpm"; sector: string; personal_auditado: string;
  lavado_manos: boolean; uniforme_completo: boolean; sin_joyas: boolean;
  sin_celular: boolean; sin_alimentos: boolean;
  estado_salud: string; personal_lesiones: string; observaciones: string;
}
interface RegistroRecepcion extends BaseRegistro {
  tipo: "recepcion"; proveedor: string; producto: string; remito_lote: string;
  t_ingreso: string; estado_envase: string;
  rotulado_ok: boolean; fifo_ok: boolean; resultado: string; observaciones: string;
}
interface RegistroDespacho extends BaseRegistro {
  tipo: "despacho"; local_destino: string; producto: string; lote: string;
  cantidad: string; t_despacho: string; t_transporte: string;
  etiquetado_ok: boolean; estado_embalaje: string; observaciones: string;
}
interface RegistroNC extends BaseRegistro {
  tipo: "nc"; tipo_nc: string; descripcion: string; lote_afectado: string;
  causa_raiz: string; accion_inmediata: string;
  requiere_nc_formal: boolean; responsable_sector: string;
}
interface RegistroDecomiso extends BaseRegistro {
  tipo: "decomiso"; producto: string; lote: string; cantidad_kg: string;
  motivo: string; etapa_deteccion: string; destino: string; observaciones: string;
}
interface RegistroLimpieza extends BaseRegistro {
  tipo: "limpieza"; sector: string;
  superficies_contacto: boolean; pisos_desagues: boolean; equipos: boolean; camaras: boolean;
  sanitizante: string; concentracion: string; atp_nivel: string;
  responsable_limpieza: string; observaciones: string;
}
type RegistroAny =
  | RegistroTemperaturas | RegistroPesos | RegistroBPM | RegistroRecepcion
  | RegistroDespacho | RegistroNC | RegistroDecomiso | RegistroLimpieza;

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function fechaHoy()   { return new Date().toISOString().split("T")[0]; }
function horaAhora()  { return new Date().toTimeString().slice(0, 5); }
function fechaDisplay(iso: string) {
  const [y, m, d] = iso.split("-"); return `${d}/${m}/${y.slice(2)}`;
}
function generarId(p: string) {
  return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}
function contarAlertas(a: Record<string, boolean>) {
  return Object.values(a).filter(Boolean).length;
}
function saveFotoLocal(id: string, dataUrl: string) {
  try { localStorage.setItem(`sv_foto_${id}`, dataUrl); } catch {}
}
function loadFotoLocal(id: string): string | null {
  try { return localStorage.getItem(`sv_foto_${id}`); } catch { return null; }
}
async function comprimirFoto(file: File): Promise<{ dataUrl: string; w: number; h: number }> {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 800;
      const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.7), w, h });
    };
    img.src = url;
  });
}
function sanitizarParaFirestore(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === "fotos" && Array.isArray(v)) {
      out[k] = (v as FotoMeta[]).map(({ id, nombre, sector, timestamp, w, h }) =>
        ({ id, nombre, sector, timestamp, w, h })
      );
    } else { out[k] = v; }
  }
  return out;
}

interface KPIs {
  total_registros: number; total_alertas: number;
  total_nc: number; total_decomisos: number; kg_decomisados: number;
  pct_cumplimiento_bpm: number; registros_por_tipo: Record<string, number>;
}
function calcularKPIs(registros: RegistroAny[]): KPIs {
  let total_alertas = 0, total_nc = 0, total_decomisos = 0, kg_decomisados = 0;
  let bpm_ok = 0, bpm_total = 0;
  const por_tipo: Record<string, number> = {};
  for (const r of registros) {
    por_tipo[r.tipo] = (por_tipo[r.tipo] || 0) + 1;
    total_alertas += contarAlertas(r.alertas);
    if (r.tipo === "nc") total_nc++;
    if (r.tipo === "decomiso") { total_decomisos++; kg_decomisados += parseFloat((r as RegistroDecomiso).cantidad_kg) || 0; }
    if (r.tipo === "bpm") {
      bpm_total++;
      const b = r as RegistroBPM;
      if ([b.lavado_manos, b.uniforme_completo, b.sin_joyas, b.sin_celular, b.sin_alimentos].every(Boolean) && b.estado_salud === "apto") bpm_ok++;
    }
  }
  return {
    total_registros: registros.length, total_alertas, total_nc, total_decomisos,
    kg_decomisados: Math.round(kg_decomisados * 10) / 10,
    pct_cumplimiento_bpm: bpm_total > 0 ? Math.round(bpm_ok / bpm_total * 100) : 100,
    registros_por_tipo: por_tipo,
  };
}

function generarReporteTxt(registros: RegistroAny[], fecha: string): string {
  const kpis = calcularKPIs(registros);
  let txt = `REPORTE DIARIO — CONTROL VOLANTE\nSabores Express · Cocina Central\n`;
  txt += `Fecha: ${fechaDisplay(fecha)}\nGenerado: ${new Date().toLocaleString("es-AR")}\n`;
  txt += `${"─".repeat(40)}\n\nRESUMEN\n`;
  txt += `Registros: ${kpis.total_registros} | Alertas PCC: ${kpis.total_alertas}\n`;
  txt += `NC: ${kpis.total_nc} | Decomisos: ${kpis.total_decomisos} (${kpis.kg_decomisados}kg)\n`;
  txt += `Cumplimiento BPM: ${kpis.pct_cumplimiento_bpm}%\n\n`;
  for (const turno of TURNOS) {
    const recs = registros.filter(r => r.turno === turno.id);
    if (!recs.length) continue;
    txt += `${"─".repeat(40)}\nTURNO ${turno.label.toUpperCase()}\n${"─".repeat(40)}\n`;
    for (const r of recs) {
      const m = TIPOS_MODULO.find(x => x.id === r.tipo);
      const al = contarAlertas(r.alertas);
      txt += `\n[${r.hora}] ${m?.icon} ${m?.label}${al > 0 ? ` ⚠ ${al} ALERTA(S)` : " ✓"}\n`;
      txt += `  Responsable: ${r.responsable}\n`;
      if (r.tipo === "nc") { txt += `  ${r.tipo_nc?.toUpperCase()} — ${r.descripcion}\n  Acción: ${r.accion_inmediata}\n`; }
      else if (r.tipo === "decomiso") { txt += `  ${r.producto} | ${r.cantidad_kg}kg | ${r.motivo} → ${r.destino}\n`; }
      else if (r.tipo === "temperaturas") {
        if (r.t_camara_mp) txt += `  Cámara MP: ${r.t_camara_mp}°C\n`;
        if (r.t_coccion)   txt += `  Cocción: ${r.t_coccion}°C\n`;
        if (r.observaciones) txt += `  Obs: ${r.observaciones}\n`;
      }
    }
  }
  return txt;
}

// ─────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────
const TURNOS = [
  { id: "TM" as Turno, label: "Mañana",  color: "#f59e0b" },
  { id: "TT" as Turno, label: "Tarde",   color: "#3b82f6" },
  { id: "TN" as Turno, label: "Noche",   color: "#6366f1" },
];
const TIPOS_MODULO: { id: TipoRegistro; label: string; icon: string; badge: string }[] = [
  { id: "temperaturas", label: "Temperaturas",   icon: "🌡️", badge: "PCC"  },
  { id: "pesos",        label: "Pesos",          icon: "⚖️", badge: "PC"   },
  { id: "bpm",          label: "BPM Personal",   icon: "👤", badge: "BPM"  },
  { id: "recepcion",    label: "Recepción MP",   icon: "🚚", badge: "PCC"  },
  { id: "despacho",     label: "Despacho",       icon: "📦", badge: "PC"   },
  { id: "nc",           label: "No Conformidad", icon: "⚠️", badge: "ISO"  },
  { id: "decomiso",     label: "Decomiso",       icon: "🗑️", badge: "HACCP"},
  { id: "limpieza",     label: "Limpieza POES",  icon: "🧹", badge: "POES" },
];
const USUARIOS_KEY = "sv_usuarios";
const PIN_CALIDAD  = "1234";

// ─────────────────────────────────────────────────────────────
// UI PRIMITIVOS
// ─────────────────────────────────────────────────────────────
function cn(...c: (string | false | undefined)[]) { return c.filter(Boolean).join(" "); }

function Badge({ text, color }: { text: string; color: "red"|"amber"|"blue"|"green"|"purple"|"gray" }) {
  const map = { red:"bg-red-100 text-red-700", amber:"bg-amber-100 text-amber-700", blue:"bg-blue-100 text-blue-700", green:"bg-green-100 text-green-700", purple:"bg-purple-100 text-purple-700", gray:"bg-gray-100 text-gray-600" };
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${map[color]}`}>{text}</span>;
}
function AlertaBadge({ count }: { count: number }) {
  if (!count) return null;
  return <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{count}</span>;
}
function Spinner() {
  return <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />;
}

function InputNum({ label, value, onChange, alerta, spec }: { label:string; value:string; onChange:(v:string)=>void; alerta?:boolean; spec?:string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs text-gray-500">{label}</label>
      {spec && <span className="text-[10px] text-gray-400">{spec}</span>}
      <input type="number" inputMode="decimal" value={value} onChange={e=>onChange(e.target.value)}
        className={cn("h-10 rounded-lg border px-3 text-sm font-mono transition-colors",
          alerta ? "border-red-400 bg-red-50 text-red-700" : "border-gray-200 bg-white focus:border-blue-400")} />
      {alerta && <span className="text-[10px] text-red-500 font-medium">⚠ Fuera de rango</span>}
    </div>
  );
}
function InputTxt({ label, value, onChange, placeholder }: { label:string; value:string; onChange:(v:string)=>void; placeholder?:string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs text-gray-500">{label}</label>
      <input type="text" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm" />
    </div>
  );
}
function SelectField({ label, value, onChange, options, alerta }: { label:string; value:string; onChange:(v:string)=>void; options:{v:string;l:string}[]; alerta?:boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs text-gray-500">{label}</label>
      <select value={value} onChange={e=>onChange(e.target.value)}
        className={cn("h-10 rounded-lg border px-3 text-sm bg-white", alerta ? "border-red-400 bg-red-50" : "border-gray-200")}>
        <option value="">Seleccionar…</option>
        {options.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
      {alerta && <span className="text-[10px] text-red-500 font-medium">⚠ Requiere acción</span>}
    </div>
  );
}
function CheckItem({ label, value, onChange }: { label:string; value:boolean; onChange:(v:boolean)=>void }) {
  return (
    <button onClick={()=>onChange(!value)} className={cn("flex items-center gap-2 p-2.5 rounded-lg border text-sm text-left transition-colors",
      value ? "border-green-400 bg-green-50 text-green-800" : "border-gray-200 bg-white text-gray-700")}>
      <span className={cn("w-5 h-5 rounded flex items-center justify-center flex-shrink-0 text-xs border transition-colors",
        value ? "bg-green-500 border-green-500 text-white" : "border-gray-300")}>{value ? "✓" : ""}</span>
      {label}
    </button>
  );
}
function TextArea({ label, value, onChange, placeholder }: { label:string; value:string; onChange:(v:string)=>void; placeholder?:string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs text-gray-500">{label}</label>
      <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={3}
        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm resize-none" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// FOTO
// ─────────────────────────────────────────────────────────────
function FotoCaptura({ fotos, onAdd, onRemove }: { fotos:FotoMeta[]; onAdd:(m:FotoMeta)=>void; onRemove:(id:string)=>void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [cargando, setCargando] = useState(false);
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setCargando(true);
    try {
      const { dataUrl, w, h } = await comprimirFoto(file);
      const id = generarId("foto");
      saveFotoLocal(id, dataUrl);
      onAdd({ id, nombre: file.name, sector: "CV", timestamp: new Date().toISOString(), w, h });
    } finally { setCargando(false); if (inputRef.current) inputRef.current.value = ""; }
  }
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-gray-500">Fotos de evidencia</label>
      <div className="flex flex-wrap gap-2">
        {fotos.map(f => {
          const url = loadFotoLocal(f.id);
          return (
            <div key={f.id} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
              {url ? <img src={url} alt={f.nombre} className="w-full h-full object-cover" />
                : <div className="w-full h-full bg-gray-100 flex items-center justify-center text-[10px] text-gray-400 text-center px-1">Solo este dispositivo</div>}
              <button onClick={()=>onRemove(f.id)} className="absolute top-0 right-0 bg-red-500 text-white w-4 h-4 rounded-bl text-[9px] flex items-center justify-center">✕</button>
            </div>
          );
        })}
        <button onClick={()=>inputRef.current?.click()}
          className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-blue-400">
          {cargando ? <Spinner /> : <><span className="text-xl">📷</span><span className="text-[10px]">Foto</span></>}
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// WRAPPER FORMULARIO
// ─────────────────────────────────────────────────────────────
function FormWrapper({ titulo, subtitulo, onCancel, onSave, guardando, children }: {
  titulo:string; subtitulo:string; onCancel:()=>void; onSave:()=>void; guardando:boolean; children:React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-4 border-b border-gray-100 bg-white sticky top-0 z-10">
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 p-1 text-lg">←</button>
        <div className="flex-1">
          <div className="font-semibold text-gray-800 text-sm">{titulo}</div>
          <div className="text-xs text-gray-400">{subtitulo}</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 pb-28">{children}</div>
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 flex gap-3 max-w-lg mx-auto">
        <button onClick={onCancel} className="flex-1 h-11 rounded-xl border border-gray-200 text-sm text-gray-600 font-medium">Cancelar</button>
        <button onClick={onSave} disabled={guardando}
          className="flex-[2] h-11 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors">
          {guardando ? <Spinner /> : "Guardar ✓"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// FORMULARIOS
// ─────────────────────────────────────────────────────────────
function FormTemperaturas({ usuario, onSave, onCancel }: { usuario:Usuario; onSave:(r:RegistroAny)=>void; onCancel:()=>void }) {
  const [d, setD] = useState({ sector:"", t_camara_mp:"", t_camara_pt:"", t_coccion:"", t_recalentamiento:"", t_transporte:"", equipo_num:"", observaciones:"", fotos:[] as FotoMeta[] });
  const [guardando, setGuardando] = useState(false);
  const al_mp  = d.t_camara_mp  !== "" && parseFloat(d.t_camara_mp)  > 4;
  const al_pt  = d.t_camara_pt  !== "" && parseFloat(d.t_camara_pt)  > 4;
  const al_coc = d.t_coccion    !== "" && parseFloat(d.t_coccion)    < 75;
  const al_rec = d.t_recalentamiento !== "" && parseFloat(d.t_recalentamiento) < 65;
  async function guardar() {
    setGuardando(true);
    onSave({ id:generarId("tmp"), tipo:"temperaturas", turno:usuario.turno, responsable:usuario.nombre, fecha:fechaHoy(), hora:horaAhora(), timestamp:new Date().toISOString(), alertas:{ t_camara_mp:al_mp, t_camara_pt:al_pt, t_coccion:al_coc, t_recalentamiento:al_rec }, ...d } as RegistroTemperaturas);
    setGuardando(false);
  }
  return (
    <FormWrapper titulo="🌡️ Temperaturas" subtitulo="Cámaras y producto — HACCP PCC" onCancel={onCancel} onSave={guardar} guardando={guardando}>
      <InputTxt label="Sector" value={d.sector} onChange={v=>setD(p=>({...p,sector:v}))} placeholder="ej: Cámara 1, Línea caliente" />
      <div className="text-xs font-semibold text-red-600 uppercase tracking-wide">Puntos Críticos — PCC</div>
      <InputNum label="T° cámara de MP (°C)" spec="Límite: ≤ 4°C" value={d.t_camara_mp} onChange={v=>setD(p=>({...p,t_camara_mp:v}))} alerta={al_mp} />
      <InputNum label="T° cámara de PT (°C)" spec="≤ 4°C frío / ≤ -18°C congelado" value={d.t_camara_pt} onChange={v=>setD(p=>({...p,t_camara_pt:v}))} alerta={al_pt} />
      <InputNum label="T° núcleo cocción (°C)" spec="Mínimo ≥ 75°C" value={d.t_coccion} onChange={v=>setD(p=>({...p,t_coccion:v}))} alerta={al_coc} />
      <InputNum label="T° recalentamiento (°C)" spec="Mínimo ≥ 65°C" value={d.t_recalentamiento} onChange={v=>setD(p=>({...p,t_recalentamiento:v}))} alerta={al_rec} />
      <div className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Puntos de Control — PC</div>
      <InputNum label="T° transporte (°C)" value={d.t_transporte} onChange={v=>setD(p=>({...p,t_transporte:v}))} />
      <InputTxt label="N° termómetro / equipo" value={d.equipo_num} onChange={v=>setD(p=>({...p,equipo_num:v}))} />
      <FotoCaptura fotos={d.fotos} onAdd={f=>setD(p=>({...p,fotos:[...p.fotos,f]}))} onRemove={id=>setD(p=>({...p,fotos:p.fotos.filter(f=>f.id!==id)}))} />
      <TextArea label="Observaciones / acción correctiva" value={d.observaciones} onChange={v=>setD(p=>({...p,observaciones:v}))} />
    </FormWrapper>
  );
}

function FormPesos({ usuario, onSave, onCancel }: { usuario:Usuario; onSave:(r:RegistroAny)=>void; onCancel:()=>void }) {
  const [d, setD] = useState({ producto:"", lote:"", peso_declarado:"", peso_1:"", peso_2:"", peso_3:"", ajustado:"", observaciones:"", fotos:[] as FotoMeta[] });
  const [guardando, setGuardando] = useState(false);
  const vals = [d.peso_1,d.peso_2,d.peso_3].map(v=>parseFloat(v)).filter(v=>!isNaN(v));
  const prom = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0;
  const decl = parseFloat(d.peso_declarado);
  const desvio = decl>0&&prom>0 ? Math.abs((prom-decl)/decl*100) : 0;
  const alPeso = desvio > 5;
  async function guardar() {
    setGuardando(true);
    onSave({ id:generarId("pso"), tipo:"pesos", turno:usuario.turno, responsable:usuario.nombre, fecha:fechaHoy(), hora:horaAhora(), timestamp:new Date().toISOString(), promedio:Math.round(prom*10)/10, desvio_pct:Math.round(desvio*10)/10, alertas:{desvio_pct:alPeso}, ...d } as RegistroPesos);
    setGuardando(false);
  }
  return (
    <FormWrapper titulo="⚖️ Pesos y porciones" subtitulo="Control de gramaje — ISO 9001" onCancel={onCancel} onSave={guardar} guardando={guardando}>
      <InputTxt label="Producto" value={d.producto} onChange={v=>setD(p=>({...p,producto:v}))} />
      <InputTxt label="N° de lote" value={d.lote} onChange={v=>setD(p=>({...p,lote:v}))} />
      <InputNum label="Peso declarado (g)" spec="Según especificación" value={d.peso_declarado} onChange={v=>setD(p=>({...p,peso_declarado:v}))} />
      <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide">3 muestras</div>
      <div className="grid grid-cols-3 gap-2">
        {(["peso_1","peso_2","peso_3"] as const).map((k,i)=>(
          <InputNum key={k} label={`Muestra ${i+1} (g)`} value={d[k]} onChange={v=>setD(p=>({...p,[k]:v}))} />
        ))}
      </div>
      {prom>0 && (
        <div className={cn("rounded-xl p-3 text-sm flex items-center justify-between", alPeso?"bg-red-50 border border-red-300":"bg-green-50 border border-green-300")}>
          <div><div className="font-semibold">{alPeso?"⚠ Desvío detectado":"✓ Dentro de rango"}</div><div className="text-xs text-gray-500">Promedio: {prom.toFixed(1)}g</div></div>
          <div className={cn("text-xl font-bold",alPeso?"text-red-600":"text-green-600")}>{desvio.toFixed(1)}%</div>
        </div>
      )}
      <SelectField label="¿Se ajustó?" value={d.ajustado} onChange={v=>setD(p=>({...p,ajustado:v}))} alerta={alPeso&&!d.ajustado}
        options={[{v:"si",l:"✓ Sí, se ajustó"},{v:"no",l:"No se ajustó"},{v:"retirado",l:"Producto retirado"}]} />
      <FotoCaptura fotos={d.fotos} onAdd={f=>setD(p=>({...p,fotos:[...p.fotos,f]}))} onRemove={id=>setD(p=>({...p,fotos:p.fotos.filter(f=>f.id!==id)}))} />
      <TextArea label="Observaciones" value={d.observaciones} onChange={v=>setD(p=>({...p,observaciones:v}))} />
    </FormWrapper>
  );
}

function FormBPM({ usuario, onSave, onCancel }: { usuario:Usuario; onSave:(r:RegistroAny)=>void; onCancel:()=>void }) {
  const [d, setD] = useState({ sector:"", personal_auditado:"", lavado_manos:false, uniforme_completo:false, sin_joyas:false, sin_celular:false, sin_alimentos:false, estado_salud:"apto", personal_lesiones:"", observaciones:"", fotos:[] as FotoMeta[] });
  const [guardando, setGuardando] = useState(false);
  const pct = [d.lavado_manos,d.uniforme_completo,d.sin_joyas,d.sin_celular,d.sin_alimentos].filter(Boolean).length*20;
  async function guardar() {
    setGuardando(true);
    onSave({ id:generarId("bpm"), tipo:"bpm", turno:usuario.turno, responsable:usuario.nombre, fecha:fechaHoy(), hora:horaAhora(), timestamp:new Date().toISOString(), alertas:{ estado_no_apto:d.estado_salud==="no_apto", bpm_incompleto:!d.lavado_manos||!d.uniforme_completo }, ...d } as RegistroBPM);
    setGuardando(false);
  }
  return (
    <FormWrapper titulo="👤 BPM Personal" subtitulo="Higiene y manipulación — BPM/POES" onCancel={onCancel} onSave={guardar} guardando={guardando}>
      <InputTxt label="Sector auditado" value={d.sector} onChange={v=>setD(p=>({...p,sector:v}))} placeholder="ej: Producción, Frío, Despacho" />
      <InputTxt label="Personal auditado" value={d.personal_auditado} onChange={v=>setD(p=>({...p,personal_auditado:v}))} placeholder="Nombre/s del personal" />
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Checklist BPM</div>
        <div className={cn("text-sm font-bold",pct===100?"text-green-600":pct>=60?"text-amber-600":"text-red-600")}>{pct}%</div>
      </div>
      <div className="flex flex-col gap-1.5">
        <CheckItem label="Lavado de manos al ingresar" value={d.lavado_manos} onChange={v=>setD(p=>({...p,lavado_manos:v}))} />
        <CheckItem label="Uniforme completo (cofia, delantal, guantes)" value={d.uniforme_completo} onChange={v=>setD(p=>({...p,uniforme_completo:v}))} />
        <CheckItem label="Sin joyas ni maquillaje" value={d.sin_joyas} onChange={v=>setD(p=>({...p,sin_joyas:v}))} />
        <CheckItem label="Sin celular en zona de trabajo" value={d.sin_celular} onChange={v=>setD(p=>({...p,sin_celular:v}))} />
        <CheckItem label="Sin alimentos ni bebidas fuera del área" value={d.sin_alimentos} onChange={v=>setD(p=>({...p,sin_alimentos:v}))} />
      </div>
      <SelectField label="Estado de salud" value={d.estado_salud} onChange={v=>setD(p=>({...p,estado_salud:v}))} alerta={d.estado_salud!=="apto"}
        options={[{v:"apto",l:"✓ Apto para manipular"},{v:"con_lesion",l:"⚠ Con lesión / herida"},{v:"no_apto",l:"✕ No apto (no manipula)"}]} />
      {d.estado_salud!=="apto" && <InputTxt label="Descripción de la situación" value={d.personal_lesiones} onChange={v=>setD(p=>({...p,personal_lesiones:v}))} placeholder="Nombre del operario y situación" />}
      <FotoCaptura fotos={d.fotos} onAdd={f=>setD(p=>({...p,fotos:[...p.fotos,f]}))} onRemove={id=>setD(p=>({...p,fotos:p.fotos.filter(f=>f.id!==id)}))} />
      <TextArea label="Observaciones / capacitación realizada" value={d.observaciones} onChange={v=>setD(p=>({...p,observaciones:v}))} />
    </FormWrapper>
  );
}

function FormRecepcion({ usuario, onSave, onCancel }: { usuario:Usuario; onSave:(r:RegistroAny)=>void; onCancel:()=>void }) {
  const [d, setD] = useState({ proveedor:"", producto:"", remito_lote:"", t_ingreso:"", estado_envase:"", rotulado_ok:false, fifo_ok:false, resultado:"", observaciones:"", fotos:[] as FotoMeta[] });
  const [guardando, setGuardando] = useState(false);
  const al_t = d.t_ingreso!==""&&parseFloat(d.t_ingreso)>7;
  async function guardar() {
    setGuardando(true);
    onSave({ id:generarId("rec"), tipo:"recepcion", turno:usuario.turno, responsable:usuario.nombre, fecha:fechaHoy(), hora:horaAhora(), timestamp:new Date().toISOString(), alertas:{ t_ingreso:al_t, envase_rechazado:d.estado_envase==="rechazado", resultado_rechazado:d.resultado==="rechazado" }, ...d } as RegistroRecepcion);
    setGuardando(false);
  }
  return (
    <FormWrapper titulo="🚚 Recepción de MP" subtitulo="Ingreso de materias primas — PCC" onCancel={onCancel} onSave={guardar} guardando={guardando}>
      <InputTxt label="Proveedor" value={d.proveedor} onChange={v=>setD(p=>({...p,proveedor:v}))} />
      <InputTxt label="Producto / descripción" value={d.producto} onChange={v=>setD(p=>({...p,producto:v}))} />
      <InputTxt label="N° remito / lote" value={d.remito_lote} onChange={v=>setD(p=>({...p,remito_lote:v}))} placeholder="Para trazabilidad" />
      <InputNum label="T° al ingreso (°C)" spec="PCC — ≤ 7°C refrigerado / ≤ -18°C congelado" value={d.t_ingreso} onChange={v=>setD(p=>({...p,t_ingreso:v}))} alerta={al_t} />
      <SelectField label="Estado del envase" value={d.estado_envase} onChange={v=>setD(p=>({...p,estado_envase:v}))} alerta={d.estado_envase==="rechazado"}
        options={[{v:"integro",l:"✓ Íntegro"},{v:"danado",l:"⚠ Dañado (observar)"},{v:"rechazado",l:"✕ Rechazado"}]} />
      <CheckItem label="Rotulado correcto (fecha, lote, denominación)" value={d.rotulado_ok} onChange={v=>setD(p=>({...p,rotulado_ok:v}))} />
      <CheckItem label="FIFO/FEFO aplicado" value={d.fifo_ok} onChange={v=>setD(p=>({...p,fifo_ok:v}))} />
      <SelectField label="Resultado final" value={d.resultado} onChange={v=>setD(p=>({...p,resultado:v}))} alerta={d.resultado==="rechazado"}
        options={[{v:"aprobado",l:"✓ Aprobado"},{v:"observado",l:"⚠ Aprobado con observación"},{v:"rechazado",l:"✕ Rechazado y devuelto"}]} />
      <FotoCaptura fotos={d.fotos} onAdd={f=>setD(p=>({...p,fotos:[...p.fotos,f]}))} onRemove={id=>setD(p=>({...p,fotos:p.fotos.filter(f=>f.id!==id)}))} />
      <TextArea label="Observaciones" value={d.observaciones} onChange={v=>setD(p=>({...p,observaciones:v}))} />
    </FormWrapper>
  );
}

function FormDespacho({ usuario, onSave, onCancel }: { usuario:Usuario; onSave:(r:RegistroAny)=>void; onCancel:()=>void }) {
  const [d, setD] = useState({ local_destino:"", producto:"", lote:"", cantidad:"", t_despacho:"", t_transporte:"", etiquetado_ok:false, estado_embalaje:"", observaciones:"", fotos:[] as FotoMeta[] });
  const [guardando, setGuardando] = useState(false);
  const al_td = d.t_despacho!==""&&parseFloat(d.t_despacho)>4;
  const al_tt = d.t_transporte!==""&&parseFloat(d.t_transporte)>7;
  async function guardar() {
    setGuardando(true);
    onSave({ id:generarId("dsp"), tipo:"despacho", turno:usuario.turno, responsable:usuario.nombre, fecha:fechaHoy(), hora:horaAhora(), timestamp:new Date().toISOString(), alertas:{ t_despacho:al_td, t_transporte:al_tt, sin_etiqueta:!d.etiquetado_ok }, ...d } as RegistroDespacho);
    setGuardando(false);
  }
  return (
    <FormWrapper titulo="📦 Despacho" subtitulo="Producto terminado a locales — PCC" onCancel={onCancel} onSave={guardar} guardando={guardando}>
      <InputTxt label="Local destino (N° o nombre)" value={d.local_destino} onChange={v=>setD(p=>({...p,local_destino:v}))} />
      <InputTxt label="Producto" value={d.producto} onChange={v=>setD(p=>({...p,producto:v}))} />
      <InputTxt label="N° de lote" value={d.lote} onChange={v=>setD(p=>({...p,lote:v}))} />
      <InputNum label="Cantidad / unidades" value={d.cantidad} onChange={v=>setD(p=>({...p,cantidad:v}))} />
      <InputNum label="T° producto al despacho (°C)" spec="PCC — ≤ 4°C frío / ≤ -18°C congelado" value={d.t_despacho} onChange={v=>setD(p=>({...p,t_despacho:v}))} alerta={al_td} />
      <InputNum label="T° transporte (°C)" spec="PCC — ≤ 7°C" value={d.t_transporte} onChange={v=>setD(p=>({...p,t_transporte:v}))} alerta={al_tt} />
      <CheckItem label="Etiquetado correcto (fecha elaboración, vencimiento, lote)" value={d.etiquetado_ok} onChange={v=>setD(p=>({...p,etiquetado_ok:v}))} />
      <SelectField label="Estado del embalaje" value={d.estado_embalaje} onChange={v=>setD(p=>({...p,estado_embalaje:v}))}
        options={[{v:"integro",l:"✓ Íntegro"},{v:"con_dano",l:"⚠ Con daño"}]} />
      <FotoCaptura fotos={d.fotos} onAdd={f=>setD(p=>({...p,fotos:[...p.fotos,f]}))} onRemove={id=>setD(p=>({...p,fotos:p.fotos.filter(f=>f.id!==id)}))} />
      <TextArea label="Observaciones" value={d.observaciones} onChange={v=>setD(p=>({...p,observaciones:v}))} />
    </FormWrapper>
  );
}

function FormNC({ usuario, onSave, onCancel }: { usuario:Usuario; onSave:(r:RegistroAny)=>void; onCancel:()=>void }) {
  const [d, setD] = useState({ tipo_nc:"", descripcion:"", lote_afectado:"", causa_raiz:"", accion_inmediata:"", requiere_nc_formal:false, responsable_sector:"", fotos:[] as FotoMeta[] });
  const [guardando, setGuardando] = useState(false);
  async function guardar() {
    setGuardando(true);
    onSave({ id:generarId("nc"), tipo:"nc", turno:usuario.turno, responsable:usuario.nombre, fecha:fechaHoy(), hora:horaAhora(), timestamp:new Date().toISOString(), alertas:{ sin_accion:!d.accion_inmediata }, ...d } as RegistroNC);
    setGuardando(false);
  }
  return (
    <FormWrapper titulo="⚠️ No Conformidad" subtitulo="Desvíos y acciones correctivas — ISO 9001" onCancel={onCancel} onSave={guardar} guardando={guardando}>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">Registrá todos los desvíos, incluso los menores. El historial es tu evidencia.</div>
      <SelectField label="Tipo de NC" value={d.tipo_nc} onChange={v=>setD(p=>({...p,tipo_nc:v}))}
        options={[{v:"proceso",l:"Proceso / operación"},{v:"producto",l:"Calidad del producto"},{v:"bpm",l:"Incumplimiento BPM"},{v:"proveedor",l:"Materia prima / proveedor"},{v:"infraestructura",l:"Infraestructura / equipo"}]} />
      <TextArea label="Descripción del desvío" value={d.descripcion} onChange={v=>setD(p=>({...p,descripcion:v}))} placeholder="Qué ocurrió, dónde, a qué hora. Ser específico." />
      <InputTxt label="Producto / lote afectado" value={d.lote_afectado} onChange={v=>setD(p=>({...p,lote_afectado:v}))} />
      <SelectField label="Causa raíz (preliminar)" value={d.causa_raiz} onChange={v=>setD(p=>({...p,causa_raiz:v}))}
        options={[{v:"humano",l:"Factor humano"},{v:"equipo",l:"Equipo / maquinaria"},{v:"metodo",l:"Método / procedimiento"},{v:"insumo",l:"Materia prima / insumo"},{v:"ambiente",l:"Ambiente / infraestructura"}]} />
      <TextArea label="Acción inmediata tomada" value={d.accion_inmediata} onChange={v=>setD(p=>({...p,accion_inmediata:v}))} placeholder="Qué se hizo para solucionar en el momento" />
      <CheckItem label="Requiere apertura de NC formal (documentación interna)" value={d.requiere_nc_formal} onChange={v=>setD(p=>({...p,requiere_nc_formal:v}))} />
      <InputTxt label="Responsable del sector" value={d.responsable_sector} onChange={v=>setD(p=>({...p,responsable_sector:v}))} />
      <FotoCaptura fotos={d.fotos} onAdd={f=>setD(p=>({...p,fotos:[...p.fotos,f]}))} onRemove={id=>setD(p=>({...p,fotos:p.fotos.filter(f=>f.id!==id)}))} />
    </FormWrapper>
  );
}

function FormDecomiso({ usuario, onSave, onCancel }: { usuario:Usuario; onSave:(r:RegistroAny)=>void; onCancel:()=>void }) {
  const [d, setD] = useState({ producto:"", lote:"", cantidad_kg:"", motivo:"", etapa_deteccion:"", destino:"", observaciones:"", fotos:[] as FotoMeta[] });
  const [guardando, setGuardando] = useState(false);
  async function guardar() {
    setGuardando(true);
    onSave({ id:generarId("dec"), tipo:"decomiso", turno:usuario.turno, responsable:usuario.nombre, fecha:fechaHoy(), hora:horaAhora(), timestamp:new Date().toISOString(), alertas:{ sin_foto:d.fotos.length===0 }, ...d } as RegistroDecomiso);
    setGuardando(false);
  }
  return (
    <FormWrapper titulo="🗑️ Decomiso" subtitulo="Producto rechazado — HACCP obligatorio" onCancel={onCancel} onSave={guardar} guardando={guardando}>
      <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 font-medium">Foto obligatoria. Documentar antes de retirar el producto.</div>
      <InputTxt label="Producto decomisado" value={d.producto} onChange={v=>setD(p=>({...p,producto:v}))} />
      <InputTxt label="N° de lote" value={d.lote} onChange={v=>setD(p=>({...p,lote:v}))} />
      <InputNum label="Cantidad (kg)" value={d.cantidad_kg} onChange={v=>setD(p=>({...p,cantidad_kg:v}))} />
      <SelectField label="Motivo del decomiso" value={d.motivo} onChange={v=>setD(p=>({...p,motivo:v}))}
        options={[{v:"vencido",l:"Producto vencido"},{v:"temperatura",l:"Ruptura cadena de frío"},{v:"dano",l:"Daño físico"},{v:"contaminacion",l:"Contaminación"},{v:"rotulado",l:"Error de rotulado"},{v:"otro",l:"Otro (ver observaciones)"}]} />
      <SelectField label="Etapa de detección" value={d.etapa_deteccion} onChange={v=>setD(p=>({...p,etapa_deteccion:v}))}
        options={[{v:"mp",l:"Recepción MP"},{v:"produccion",l:"Durante producción"},{v:"pt",l:"Producto terminado"},{v:"despacho",l:"En despacho"}]} />
      <SelectField label="Destino del producto" value={d.destino} onChange={v=>setD(p=>({...p,destino:v}))}
        options={[{v:"destruccion",l:"Destrucción / descarte"},{v:"devolucion",l:"Devolución al proveedor"},{v:"reproceso",l:"Reproceso (si aplica)"}]} />
      <FotoCaptura fotos={d.fotos} onAdd={f=>setD(p=>({...p,fotos:[...p.fotos,f]}))} onRemove={id=>setD(p=>({...p,fotos:p.fotos.filter(f=>f.id!==id)}))} />
      <TextArea label="Observaciones" value={d.observaciones} onChange={v=>setD(p=>({...p,observaciones:v}))} />
    </FormWrapper>
  );
}

function FormLimpieza({ usuario, onSave, onCancel }: { usuario:Usuario; onSave:(r:RegistroAny)=>void; onCancel:()=>void }) {
  const [d, setD] = useState({ sector:"", superficies_contacto:false, pisos_desagues:false, equipos:false, camaras:false, sanitizante:"", concentracion:"", atp_nivel:"", responsable_limpieza:"", observaciones:"", fotos:[] as FotoMeta[] });
  const [guardando, setGuardando] = useState(false);
  const pct = [d.superficies_contacto,d.pisos_desagues,d.equipos,d.camaras].filter(Boolean).length*25;
  async function guardar() {
    setGuardando(true);
    onSave({ id:generarId("lim"), tipo:"limpieza", turno:usuario.turno, responsable:usuario.nombre, fecha:fechaHoy(), hora:horaAhora(), timestamp:new Date().toISOString(), alertas:{ superficies_no_ok:!d.superficies_contacto }, ...d } as RegistroLimpieza);
    setGuardando(false);
  }
  return (
    <FormWrapper titulo="🧹 Limpieza POES" subtitulo="Verificación sanitaria — POES/BPM" onCancel={onCancel} onSave={guardar} guardando={guardando}>
      <SelectField label="Sector verificado" value={d.sector} onChange={v=>setD(p=>({...p,sector:v}))}
        options={[{v:"cocina_caliente",l:"Cocina caliente"},{v:"cocina_fria",l:"Cocina fría"},{v:"camara",l:"Cámara frigorífica"},{v:"despacho",l:"Área de despacho"},{v:"sanitarios",l:"Sanitarios / vestuarios"},{v:"almacen",l:"Almacén / depósito"}]} />
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Verificación</div>
        <div className={cn("text-sm font-bold",pct===100?"text-green-600":"text-amber-600")}>{pct}%</div>
      </div>
      <div className="flex flex-col gap-1.5">
        <CheckItem label="Superficies en contacto con alimentos (PCC)" value={d.superficies_contacto} onChange={v=>setD(p=>({...p,superficies_contacto:v}))} />
        <CheckItem label="Pisos y desagües sin residuos" value={d.pisos_desagues} onChange={v=>setD(p=>({...p,pisos_desagues:v}))} />
        <CheckItem label="Equipos (hornos, freidoras, etc.)" value={d.equipos} onChange={v=>setD(p=>({...p,equipos:v}))} />
        <CheckItem label="Cámaras frigoríficas" value={d.camaras} onChange={v=>setD(p=>({...p,camaras:v}))} />
      </div>
      <InputTxt label="Sanitizante utilizado" value={d.sanitizante} onChange={v=>setD(p=>({...p,sanitizante:v}))} placeholder="Nombre del producto" />
      <InputTxt label="Concentración" value={d.concentracion} onChange={v=>setD(p=>({...p,concentracion:v}))} placeholder="ej: 200 ppm de cloro" />
      <InputNum label="Nivel ATP (si aplica)" spec="Umbral según protocolo" value={d.atp_nivel} onChange={v=>setD(p=>({...p,atp_nivel:v}))} />
      <InputTxt label="Responsable de limpieza" value={d.responsable_limpieza} onChange={v=>setD(p=>({...p,responsable_limpieza:v}))} />
      <FotoCaptura fotos={d.fotos} onAdd={f=>setD(p=>({...p,fotos:[...p.fotos,f]}))} onRemove={id=>setD(p=>({...p,fotos:p.fotos.filter(f=>f.id!==id)}))} />
      <TextArea label="Observaciones" value={d.observaciones} onChange={v=>setD(p=>({...p,observaciones:v}))} />
    </FormWrapper>
  );
}

// ─────────────────────────────────────────────────────────────
// CARD DE REGISTRO
// ─────────────────────────────────────────────────────────────
function RegistroCard({ reg, onDelete, isCalidad }: { reg:RegistroAny; onDelete?:()=>void; isCalidad:boolean }) {
  const [exp, setExp] = useState(false);
  const alertas = contarAlertas(reg.alertas);
  const mod = TIPOS_MODULO.find(m=>m.id===reg.tipo);
  function detalle() {
    if (reg.tipo==="temperaturas") return <div className="grid grid-cols-2 gap-1 text-xs mt-2">{reg.t_camara_mp&&<span>Cámara MP: <b>{reg.t_camara_mp}°C</b></span>}{reg.t_camara_pt&&<span>Cámara PT: <b>{reg.t_camara_pt}°C</b></span>}{reg.t_coccion&&<span>Cocción: <b>{reg.t_coccion}°C</b></span>}{reg.observaciones&&<span className="col-span-2 text-gray-500">{reg.observaciones}</span>}</div>;
    if (reg.tipo==="pesos") return <div className="text-xs mt-2"><p>{reg.producto} — Lote: {reg.lote}</p><p>Declarado: {reg.peso_declarado}g · Prom: <b>{reg.promedio}g</b> · Desvío: <b className={reg.desvio_pct>5?"text-red-600":"text-green-600"}>{reg.desvio_pct}%</b></p></div>;
    if (reg.tipo==="bpm") return <div className="text-xs mt-2"><p>{reg.sector} — {reg.personal_auditado}</p><span className={cn("font-medium",reg.estado_salud==="apto"?"text-green-600":"text-red-600")}>{reg.estado_salud==="apto"?"✓ Apto":"⚠ "+reg.estado_salud}</span></div>;
    if (reg.tipo==="recepcion") return <div className="text-xs mt-2"><p>{reg.proveedor} — {reg.producto}</p><p>T°: {reg.t_ingreso}°C · <b>{reg.resultado}</b></p></div>;
    if (reg.tipo==="despacho") return <div className="text-xs mt-2"><p>Local {reg.local_destino} — {reg.producto}</p><p>T° despacho: {reg.t_despacho}°C · Transporte: {reg.t_transporte}°C</p></div>;
    if (reg.tipo==="nc") return <div className="text-xs mt-2"><p className="font-medium text-amber-700">{reg.tipo_nc?.toUpperCase()}</p><p>{reg.descripcion}</p>{reg.accion_inmediata&&<p className="text-green-700">Acción: {reg.accion_inmediata}</p>}</div>;
    if (reg.tipo==="decomiso") return <div className="text-xs mt-2"><p>{reg.producto} — Lote: {reg.lote}</p><p className="text-red-600 font-medium">{reg.cantidad_kg}kg — {reg.motivo} → {reg.destino}</p></div>;
    if (reg.tipo==="limpieza") return <div className="text-xs mt-2"><p>Sector: {reg.sector}</p><p>{reg.sanitizante} {reg.concentracion}</p></div>;
    return null;
  }
  return (
    <div className={cn("rounded-xl border bg-white overflow-hidden", alertas>0?"border-red-300":"border-gray-200")}>
      <div className="flex items-center gap-2 p-3 cursor-pointer" onClick={()=>setExp(!exp)}>
        <span className="text-xl">{mod?.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-800">{mod?.label}</span>
            <AlertaBadge count={alertas} />
            {reg.fotos.length>0&&<span className="text-xs text-gray-400">📷{reg.fotos.length}</span>}
          </div>
          <div className="text-xs text-gray-400">{reg.hora} · {reg.responsable}</div>
        </div>
        <span className="text-gray-300 text-xs">{exp?"▲":"▼"}</span>
      </div>
      {exp&&<div className="px-3 pb-3 border-t border-gray-100">{detalle()}{isCalidad&&onDelete&&<button onClick={onDelete} className="mt-2 text-xs text-red-400 hover:text-red-600">Eliminar registro</button>}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────
function Dashboard({ registros }: { registros:RegistroAny[] }) {
  const kpis = calcularKPIs(registros);
  const barData = TIPOS_MODULO.map(m=>({ name:m.label.split(" ")[0], cant:kpis.registros_por_tipo[m.id]??0 }));
  const turnoData = TURNOS.map(t=>({
    turno: t.label,
    registros: registros.filter(r=>r.turno===t.id).length,
    alertas: registros.filter(r=>r.turno===t.id).reduce((a,r)=>a+contarAlertas(r.alertas),0),
  }));
  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        {[
          { l:"Registros hoy",     v:kpis.total_registros,              c:"text-blue-600" },
          { l:"Alertas PCC",       v:kpis.total_alertas,                c:kpis.total_alertas>0?"text-red-600":"text-green-600" },
          { l:"No conformidades",  v:kpis.total_nc,                     c:kpis.total_nc>0?"text-amber-600":"text-green-600" },
          { l:"Decomisos (kg)",    v:kpis.kg_decomisados,               c:"text-gray-700" },
          { l:"Cumplim. BPM",      v:`${kpis.pct_cumplimiento_bpm}%`,   c:kpis.pct_cumplimiento_bpm>=80?"text-green-600":"text-red-600" },
          { l:"Decomisos (cant.)", v:kpis.total_decomisos,              c:"text-gray-700" },
        ].map((k,i)=>(
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-3">
            <div className="text-xs text-gray-400">{k.l}</div>
            <div className={`text-2xl font-bold mt-0.5 ${k.c}`}>{k.v}</div>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Registros por módulo</div>
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={barData} margin={{top:0,right:0,left:-20,bottom:0}}>
            <XAxis dataKey="name" tick={{fontSize:10}} /><YAxis tick={{fontSize:10}} /><Tooltip />
            <Bar dataKey="cant" fill="#3b82f6" radius={[4,4,0,0]} name="Registros" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Alertas vs registros por turno</div>
        <ResponsiveContainer width="100%" height={130}>
          <BarChart data={turnoData} margin={{top:0,right:0,left:-20,bottom:0}}>
            <XAxis dataKey="turno" tick={{fontSize:10}} /><YAxis tick={{fontSize:10}} /><Tooltip />
            <Bar dataKey="registros" fill="#93c5fd" radius={[4,4,0,0]} name="Registros" />
            <Bar dataKey="alertas"   fill="#f87171" radius={[4,4,0,0]} name="Alertas" />
            <Legend iconSize={8} wrapperStyle={{fontSize:11}} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin:(u:Usuario)=>void }) {
  const [nombre, setNombre] = useState("");
  const [turno, setTurno]   = useState<Turno>("TM");
  const [rol, setRol]       = useState<RolUsuario>("control_volante");
  const [pin, setPin]       = useState("");
  const [pinErr, setPinErr] = useState(false);
  const [recientes, setRecientes] = useState<Usuario[]>([]);
  useEffect(()=>{ try { const s=localStorage.getItem(USUARIOS_KEY); if(s) setRecientes(JSON.parse(s).slice(0,5)); } catch {} },[]);
  function handleLogin() {
    if (!nombre.trim()) return;
    if (rol==="calidad"&&pin!==PIN_CALIDAD) { setPinErr(true); return; }
    const u:Usuario = { nombre:nombre.trim(), rol, turno };
    try { const prev=JSON.parse(localStorage.getItem(USUARIOS_KEY)||"[]"); localStorage.setItem(USUARIOS_KEY,JSON.stringify([u,...prev.filter((r:Usuario)=>r.nombre!==u.nombre||r.rol!==u.rol)].slice(0,5))); } catch {}
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
        {recientes.length>0&&(
          <div className="mb-4">
            <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">Acceso rápido</p>
            {recientes.map((u,i)=>(
              <button key={i} onClick={()=>onLogin(u)} className="w-full flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-200 hover:border-blue-400 transition-colors text-sm mb-1.5">
                <span className="text-base">{u.rol==="calidad"?"🔑":"👷"}</span>
                <span className="font-medium text-gray-800 flex-1 text-left">{u.nombre} <span className="text-gray-400 font-normal">· {TURNOS.find(t=>t.id===u.turno)?.label}</span></span>
                <Badge text={u.rol==="calidad"?"Calidad":"CV"} color="blue" />
              </button>
            ))}
          </div>
        )}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm flex flex-col gap-4">
          <InputTxt label="Nombre y apellido" value={nombre} onChange={setNombre} placeholder="Tu nombre completo" />
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Turno</label>
            <div className="flex gap-2">{TURNOS.map(t=><button key={t.id} onClick={()=>setTurno(t.id)} className={cn("flex-1 py-2 rounded-lg text-sm font-medium border transition-colors",turno===t.id?"bg-blue-500 text-white border-blue-500":"bg-white text-gray-600 border-gray-200")}>{t.label}</button>)}</div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Rol</label>
            <div className="flex gap-2">{(["control_volante","calidad"] as RolUsuario[]).map(r=><button key={r} onClick={()=>setRol(r)} className={cn("flex-1 py-2 rounded-lg text-sm font-medium border transition-colors",rol===r?"bg-blue-500 text-white border-blue-500":"bg-white text-gray-600 border-gray-200")}>{r==="calidad"?"🔑 Calidad":"👷 Control Volante"}</button>)}</div>
          </div>
          {rol==="calidad"&&(
            <div className="flex flex-col gap-0.5">
              <label className="text-xs text-gray-500">PIN de calidad</label>
              <input type="password" maxLength={4} value={pin} onChange={e=>{setPin(e.target.value);setPinErr(false);}} placeholder="••••"
                className={cn("h-10 rounded-lg border px-3 text-sm text-center tracking-widest",pinErr?"border-red-400 bg-red-50":"border-gray-200")} />
              {pinErr&&<span className="text-xs text-red-500">PIN incorrecto</span>}
            </div>
          )}
          <button onClick={handleLogin} className="h-11 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold text-sm transition-colors">Ingresar →</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// APP PRINCIPAL
// ─────────────────────────────────────────────────────────────
type Vista = "home" | "form" | "lista" | "dashboard";

export default function ControlVolante() {
  const [usuario, setUsuario]         = useState<Usuario|null>(null);
  const [vista, setVista]             = useState<Vista>("home");
  const [modulo, setModulo]           = useState<TipoRegistro|null>(null);
  const [filtroTurno, setFiltroTurno] = useState<Turno|"todos">("todos");
  const [registros, setRegistros]     = useState<RegistroAny[]>([]);
  const [cargando, setCargando]       = useState(false);
  const [toast, setToast]             = useState<{msg:string;tipo:"ok"|"err"}|null>(null);
  const fecha = fechaHoy();

  const mostrarToast = useCallback((msg:string, tipo:"ok"|"err"="ok")=>{
    setToast({msg,tipo}); setTimeout(()=>setToast(null),3000);
  },[]);

  async function cargarRegistros() {
    if (!usuario) return;
    setCargando(true);
    try {
      const snap = await getDocs(query(collection(db,`registros/${fecha.replace(/-/g,"")}/items`),orderBy("timestamp","desc")));
      setRegistros(snap.docs.map(d=>d.data() as RegistroAny));
    } catch { mostrarToast("Error al cargar","err"); }
    finally { setCargando(false); }
  }

  useEffect(()=>{ if(usuario) cargarRegistros(); },[usuario]);

  async function guardarRegistro(rec:RegistroAny) {
    try {
      await setDoc(doc(db,`registros/${fecha.replace(/-/g,"")}/items/${rec.id}`), sanitizarParaFirestore(rec as unknown as Record<string,unknown>));
      setRegistros(prev=>[rec,...prev.filter(r=>r.id!==rec.id)]);
      mostrarToast(`✓ Guardado${contarAlertas(rec.alertas)>0?" — ⚠ con alertas":""}`);
      setVista("home"); setModulo(null);
    } catch { mostrarToast("Error al guardar. Verificá conexión.","err"); }
  }

  async function eliminarRegistro(id:string) {
    try {
      await deleteDoc(doc(db,`registros/${fecha.replace(/-/g,"")}/items/${id}`));
      setRegistros(prev=>prev.filter(r=>r.id!==id));
      mostrarToast("Registro eliminado");
    } catch { mostrarToast("Error al eliminar","err"); }
  }

  function exportarTxt() {
    const blob = new Blob([generarReporteTxt(registros,fecha)],{type:"text/plain;charset=utf-8"});
    const a = document.createElement("a"); a.href=URL.createObjectURL(blob);
    a.download=`reporte_${fecha}_CV.txt`; a.click();
  }

  if (!usuario) return <LoginScreen onLogin={setUsuario} />;

  const alertasHoy = registros.reduce((a,r)=>a+contarAlertas(r.alertas),0);
  const regFiltrados = filtroTurno==="todos" ? registros : registros.filter(r=>r.turno===filtroTurno);
  const formProps = { usuario, onSave:guardarRegistro, onCancel:()=>{setVista("home");setModulo(null);} };

  // ── FORM ──
  if (vista==="form"&&modulo) return (
    <div className="min-h-screen bg-gray-50 max-w-lg mx-auto">
      {modulo==="temperaturas" && <FormTemperaturas {...formProps} />}
      {modulo==="pesos"        && <FormPesos        {...formProps} />}
      {modulo==="bpm"          && <FormBPM          {...formProps} />}
      {modulo==="recepcion"    && <FormRecepcion    {...formProps} />}
      {modulo==="despacho"     && <FormDespacho     {...formProps} />}
      {modulo==="nc"           && <FormNC           {...formProps} />}
      {modulo==="decomiso"     && <FormDecomiso     {...formProps} />}
      {modulo==="limpieza"     && <FormLimpieza     {...formProps} />}
    </div>
  );

  // ── LISTA ──
  if (vista==="lista") return (
    <div className="min-h-screen bg-gray-50 max-w-lg mx-auto pb-20">
      <div className="bg-white border-b border-gray-100 p-4 sticky top-0 z-10 flex items-center gap-3">
        <button onClick={()=>setVista("home")} className="text-gray-400 p-1">←</button>
        <span className="font-semibold text-gray-800 flex-1">Registros de hoy</span>
        {usuario.rol==="calidad"&&<button onClick={exportarTxt} className="text-xs text-blue-500 font-medium">Exportar .txt</button>}
      </div>
      <div className="p-3 flex gap-2 overflow-x-auto">
        {(["todos",...TURNOS.map(t=>t.id)] as (Turno|"todos")[]).map(t=>(
          <button key={t} onClick={()=>setFiltroTurno(t)}
            className={cn("px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors",
              filtroTurno===t?"bg-blue-500 text-white border-blue-500":"bg-white text-gray-600 border-gray-200")}>
            {t==="todos"?"Todos":TURNOS.find(tt=>tt.id===t)?.label}
          </button>
        ))}
      </div>
      {cargando ? <div className="flex justify-center p-12"><Spinner /></div>
        : regFiltrados.length===0 ? <div className="text-center p-12 text-gray-400"><div className="text-4xl mb-2">📋</div><p className="text-sm">Sin registros</p></div>
        : <div className="p-3 flex flex-col gap-2">{regFiltrados.map(r=><RegistroCard key={r.id} reg={r} isCalidad={usuario.rol==="calidad"} onDelete={usuario.rol==="calidad"?()=>eliminarRegistro(r.id):undefined} />)}</div>}
    </div>
  );

  // ── DASHBOARD ──
  if (vista==="dashboard") return (
    <div className="min-h-screen bg-gray-50 max-w-lg mx-auto pb-20">
      <div className="bg-white border-b border-gray-100 p-4 sticky top-0 z-10 flex items-center gap-3">
        <button onClick={()=>setVista("home")} className="text-gray-400 p-1">←</button>
        <span className="font-semibold text-gray-800">Dashboard · {fechaDisplay(fecha)}</span>
      </div>
      <Dashboard registros={registros} />
    </div>
  );

  // ── HOME ──
  return (
    <div className="min-h-screen bg-gray-50 max-w-lg mx-auto pb-24">
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400">Sabores Express · Cocina Central</p>
            <p className="text-base font-bold text-gray-800">{usuario.nombre}</p>
          </div>
          <div className="flex items-center gap-2">
            {alertasHoy>0&&<AlertaBadge count={alertasHoy} />}
            <div className={cn("text-xs font-semibold px-2 py-1 rounded-full",
              usuario.turno==="TM"?"bg-amber-100 text-amber-700":usuario.turno==="TT"?"bg-blue-100 text-blue-700":"bg-indigo-100 text-indigo-700")}>
              {TURNOS.find(t=>t.id===usuario.turno)?.label}
            </div>
            <button onClick={()=>setUsuario(null)} className="text-xs text-gray-400 hover:text-gray-600">Salir</button>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-xs text-gray-400">{fechaDisplay(fecha)}</span>
          <span className="text-xs text-gray-300">·</span>
          <span className="text-xs text-gray-400">{registros.length} registros</span>
          {cargando&&<Spinner />}
        </div>
      </div>

      <div className="flex gap-2 px-4 pt-3">
        <button onClick={()=>setVista("lista")} className="flex-1 h-10 rounded-xl bg-white border border-gray-200 text-xs font-medium text-gray-700 flex items-center justify-center gap-1.5 hover:border-blue-400 transition-colors">
          📋 Registros ({registros.length})
        </button>
        <button onClick={()=>setVista("dashboard")} className="flex-1 h-10 rounded-xl bg-white border border-gray-200 text-xs font-medium text-gray-700 flex items-center justify-center gap-1.5 hover:border-blue-400 transition-colors">
          📊 Dashboard
        </button>
      </div>

      <div className="px-4 pt-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Nuevo registro</p>
        <div className="grid grid-cols-2 gap-2.5">
          {TIPOS_MODULO.map(m=>(
            <button key={m.id} onClick={()=>{setModulo(m.id);setVista("form");}}
              className="bg-white rounded-2xl border border-gray-200 p-4 text-left hover:border-blue-400 hover:shadow-sm transition-all active:scale-95">
              <div className="text-2xl mb-2">{m.icon}</div>
              <div className="text-sm font-semibold text-gray-800 leading-tight">{m.label}</div>
              <div className="mt-2">
                <Badge text={m.badge} color={m.badge==="PCC"?"red":m.badge==="PC"?"amber":m.badge==="BPM"?"green":m.badge==="POES"?"purple":m.badge==="HACCP"?"red":"blue"} />
              </div>
            </button>
          ))}
        </div>
      </div>

      {registros.length>0&&(
        <div className="px-4 pt-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Últimos registros</p>
          <div className="flex flex-col gap-2">
            {registros.slice(0,3).map(r=><RegistroCard key={r.id} reg={r} isCalidad={usuario.rol==="calidad"} onDelete={usuario.rol==="calidad"?()=>eliminarRegistro(r.id):undefined} />)}
            {registros.length>3&&<button onClick={()=>setVista("lista")} className="text-xs text-blue-500 font-medium text-center py-1">Ver todos los {registros.length} registros →</button>}
          </div>
        </div>
      )}

      {toast&&(
        <div className={cn("fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-white text-sm font-medium shadow-lg z-50",toast.tipo==="ok"?"bg-gray-800":"bg-red-500")}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
