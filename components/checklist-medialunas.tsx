"use client";
// ═══════════════════════════════════════════════════════════════════════════
// CONTROL VOLANTE — SABORES EXPRESS · TAPAS v2.0
// Procedimientos integrados:
//   P251 / I500   — Tapas Criollas
//   P250 / I1219  — Tapas Integrales
//   P252 / I1217  — Tapas Pastelitos
// Correcciones v2:
//   • Criollas: tubos/cajón corregido a 4 tubos × 48u = 192u (I500 Fig D)
//   • Pastelitos: peso tapa 25±2g; 9 tubos × 48u = 432u (I1217 Fig C)
//   • Pastelitos: cortadora 3 tandas × 16u = 48u/tubo; T° 18°C (I1217)
//   • Pastelitos: laminadora usa solo amasijo recuperado (I1217 §1)
//   • Integrales: agua chiller 15–17°C; T°masa 21–24°C (I1219)
//   • Integrales: cortadora 4 tandas × 16u; cajones ≤21°C ambiente (I1219)
//   • Sensorial: dimensiones por variedad (Fig A de cada instructivo)
//   • Descriptivo de puesto Calidad integrado en funciones de supervisión
// ═══════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef, useCallback } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore, collection, doc, setDoc,
  getDocs, query, orderBy, deleteDoc, getDoc,
} from "firebase/firestore";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// ── FIREBASE ──────────────────────────────────────────────────────────────
const _app = getApps().length === 0
  ? initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    })
  : getApps()[0];
const db = getFirestore(_app);

// ── TIPOS ─────────────────────────────────────────────────────────────────
type Turno = "TM" | "TT" | "TN";
type Rol = "calidad" | "control_volante";
type TipoTapa = "criollas" | "integrales" | "pastelitos" | "";
type Tipo = "temperaturas" | "tapas" | "bpm" | "recepcion" | "despacho" | "nc" | "decomiso" | "limpieza";

interface Usuario { nombre: string; rol: Rol; turno: Turno; }
interface FotoMeta { id: string; nombre: string; sector: string; timestamp: string; w: number; h: number; }
interface Base {
  id: string; tipo: Tipo; turno: Turno; responsable: string;
  fecha: string; hora: string; timestamp: string;
  alertas: Record<string, boolean>; fotos: FotoMeta[];
}

// Temperaturas — cámaras y ambiente
interface RTemp extends Base {
  tipo: "temperaturas";
  t_camara_masas: string; t_ambiente: string; t_camara_pt: string;
  equipo_num: string; observaciones: string;
}

// Tapas — proceso completo P251/P250/P252
interface RTapas extends Base {
  tipo: "tapas";
  variedad: TipoTapa; lote_amasijo: string;
  operario_amasado: string; operario_laminado: string;
  operario_cortadora: string; operario_envasado: string;
  // S0 — Fraccionado
  dosificado_ok: boolean; rotulado_fraccionado_ok: boolean;
  // S1 — Amasado
  t_agua_chiller: string; peso_baston: string; t_masa_salida: string; tiempo_amasado: string;
  // S2 — Trazabilidad cámara (criollas e integrales)
  num_tacho: string;
  fecha_ingreso_camara: string; hora_ingreso_camara: string;
  fecha_salida_camara: string; hora_salida_camara: string;
  // S3 — Laminado
  textura_masa_ok: boolean; color_masa_ok: boolean; virgen_sobre_recupero: boolean;
  // S4 — Cortadora + pesos
  muestras_peso: string[]; prom_peso: number; desvio_pct: number;
  t_cortadora: string; ajustado: string;
  // S5 — Sobadora / recupero
  recupero_cajones: string; recupero_ok: boolean;
  // S6 — Envasado
  tubos_por_cajon: string; unidades_por_tubo: string;
  cajones_etiquetados: boolean;
  etiqueta_fecha_ok: boolean; etiqueta_lote_ok: boolean; etiqueta_tipo_ok: boolean;
  bolsa_integra_ok: boolean; obs_envasado: string;
  // S7 — Cámara PT
  fifo_ok: boolean; identificacion_cajones_ok: boolean; orden_camara_obs: string;
  // S8 — Sensorial
  forma_ok: boolean; textura_ok: boolean; color_ok: boolean; sensorial_obs: string;
  // Controles extras
  mantenimiento_preventivo_ok: boolean; desperdicios_obs: string;
  observaciones: string;
}

interface RBPM extends Base {
  tipo: "bpm"; sector: string; operario: string;
  incumplimientos: string[]; accion_tomada: string;
  responsable_sector: string; observaciones: string;
}
interface RRecep extends Base {
  tipo: "recepcion"; proveedor_id: string; proveedor_nombre: string;
  producto: string; remito_lote: string; cantidad_kg: string; vto: string;
  t_ingreso: string; estado_envase: string; rotulado_ok: boolean;
  fifo_ok: boolean; resultado: string; observaciones: string;
}
interface RDesp extends Base {
  tipo: "despacho"; local_destino: string; producto: string;
  lote: string; cantidad: string; t_despacho: string;
  etiquetado_ok: boolean; estado_embalaje: string;
  chofer: string; patente: string; observaciones: string;
}
interface RNC extends Base {
  tipo: "nc"; tipo_nc: string; descripcion: string; lote_afectado: string;
  causa_raiz: string; accion_inmediata: string;
  requiere_nc_formal: boolean; responsable_sector: string;
}
interface RDecom extends Base {
  tipo: "decomiso"; producto: string; lote: string; cantidad_kg: string;
  motivo: string; etapa_deteccion: string; destino: string; observaciones: string;
}
interface RLimp extends Base {
  tipo: "limpieza"; sector: string;
  superficies_contacto: boolean; pisos_desagues: boolean;
  equipos: boolean; camaras: boolean;
  sanitizante: string; concentracion: string;
  responsable_limpieza: string; observaciones: string;
}
type Reg = RTemp | RTapas | RBPM | RRecep | RDesp | RNC | RDecom | RLimp;

interface Proveedor { id: string; nombre: string; cuit: string; contacto: string; productos: string; activo: boolean; }

interface RAuditoria {
  id: string; fecha: string; hora: string; responsable: string; turno: Turno;
  pct_recepcion: string; pct_amasado: string; pct_laminado: string;
  pct_cortadora: string; pct_envasado: string; pct_camara_pt: string;
  pct_bpm: string; pct_limpieza: string;
  pct_total: number; observaciones: string; acciones: string;
}

interface TrazAmasijo {
  num_tacho: string; variedad: TipoTapa; lote_amasijo: string;
  etapas: TrazEtapa[]; ultimo_update: string;
}
interface TrazEtapa {
  etapa: string; fecha: string; hora: string; operario: string;
  turno: Turno; datos: Record<string, string>;
}

// ── PARÁMETROS POR VARIEDAD ───────────────────────────────────────────────
// Fuentes: P251/I500 (criollas), P250/I1219 (integrales), P252/I1217 (pastelitos)
const PARAMS = {
  criollas: {
    label: "Tapas Criollas",
    proc: "P251",
    instructivo: "I500",
    // Amasado (I500 §1, P251 §3)
    tAgua: { min: 13, max: 16 },      // I500: 13°C a 16°C
    tMasa: { min: 22, max: 24 },       // P251 §3.3
    tiempoAmasado: "8 min + 1.5 min inicial",
    // Formadora / bastón (I500 §2, P251 §4)
    pesoBaston: { min: 17.5, max: 18, ideal: 18 }, // I500: 17.5–18 kg, ideal 18 kg
    // Laminado: 2 vueltas (P251 §5)
    vueltas: 2,
    // Cortadora (I500 §3, P251 §6)
    pesoTapa: 48, pesoTol: 2,          // I500 Fig A: 48 ± 2 g
    dimAlto: "13.9 cm", dimAncho: "13.4 cm", // I500 Fig A: forma ovalada
    tandas: 3, uPorTanda: 16,          // I500 Fig B: 3 tandas de 16 = 48 / tubo
    tCortadora: 18,                    // I500 §3: temperatura 18°C
    // Envasado (I500 §4, P251 §8)
    tubos: 4, uPorTubo: 48,           // I500 Fig D: 4 tubos × 48u
    cajones: 192,                       // 4 × 48 = 192 unid/cajón
    pesoTubo: { min: 2.2, max: 2.4 }, // I500 Fig C
    pesoCajon: { min: 8.83, max: 9.6 }, // I500 Fig D (sin peso cajón)
    // Laminado usa virgen sobre recupero
    soloRecupero: false,
    // Último recupero al cierre
    recuperoMax: 4,
    notaRecupero: "Identificar en cámara. Usar de inmediato en turno siguiente. Máx 4 cajones.",
    // Ambiente
    tAmbienteMax: null as number | null,
  },
  integrales: {
    label: "Tapas Integrales",
    proc: "P250",
    instructivo: "I1219",
    // Amasado (I1219 §1, P250 §3)
    tAgua: { min: 15, max: 17 },      // I1219: 15°C a 17°C
    tMasa: { min: 21, max: 24 },       // I1219: 21°C a 24°C
    tiempoAmasado: "9 min + 2 min inicial",
    // Bastón (P250 §4)
    pesoBaston: { min: 17.5, max: 18, ideal: 18 },
    // Laminado: 3 vueltas (P250 §5)
    vueltas: 3,
    // Cortadora (I1219 §3, P250 §8)
    pesoTapa: 48, pesoTol: 2,          // I1219: 48 ± 2 g
    dimAlto: "13.5 cm", dimAncho: "12.3 cm", // I1219 Fig A: forma ovalada
    tandas: 4, uPorTanda: 16,          // I1219 §3: 4 tandas de 16 unidades
    tCortadora: 18,                    // I1219 §3: temperatura 18°C
    // Envasado (I1219 §4, P250 §9)
    tubos: 4, uPorTubo: 48,           // P250 §9: 4 tubos × 48u = 192
    cajones: 192,                       // I1219 Fig B: 192 unidades/cajón
    pesoTubo: { min: 2.1, max: 2.4 }, // I1219 Fig C
    pesoCajon: { min: 8.83, max: 9.6 }, // I1219 Fig B
    // Laminado: virgen arriba sobre recupero (I1219 §2)
    soloRecupero: false,
    // Último recupero del turno: SE PESA Y DECOMISA (P250 §6.6)
    recuperoMax: 4,
    notaRecupero: "Integrales: el ÚLTIMO recorte del turno se PESA y DECOMISA. No se guarda para el siguiente turno.",
    // T° ambiente: ≤21°C — área de producción (I1219 NOTA)
    tAmbienteMax: 21 as number | null,
  },
  pastelitos: {
    label: "Tapas Pastelitos",
    proc: "P252",
    instructivo: "I1217",
    // Amasado (P252 §3)
    tAgua: { min: 13, max: 16 },      // Misma base que criollas (P252 §3)
    tMasa: { min: 22, max: 24 },       // P252 §3.3
    tiempoAmasado: "8 min + 1.5 min inicial",
    // Bastón (P252 §4)
    pesoBaston: { min: 17.5, max: 18, ideal: 18 },
    // Laminado: 2 vueltas (P252 §5)
    vueltas: 2,
    // Cortadora (I1217 §2, P252 §6)
    pesoTapa: 25, pesoTol: 2,          // I1217: 25 ± 2 g
    dimAlto: "8.5 cm", dimAncho: "9 cm",  // I1217 Fig A: rectangular
    tandas: 3, uPorTanda: 16,          // I1217 §2: 3 tandas de 16 = 48 / tubo
    tCortadora: 18,                    // I1217 §2: temperatura 18°C
    // Envasado (I1217 §3, P252 §8)
    tubos: 9, uPorTubo: 48,           // P252 §8.2: 9 tubos × 48u
    cajones: 432,                       // I1217 Fig C: 432 tapas/cajón
    pesoTubo: null,
    pesoCajon: { min: 9.94, max: 11.66 }, // I1217 Fig C
    // Laminado usa SOLO amasijo recuperado (I1217 §1: "se utilizan solo amasijos de masas recuperadas")
    soloRecupero: true,
    recuperoMax: 4,
    notaRecupero: "Identificar en cámara. Usar de inmediato en turno siguiente. Máx 4 cajones.",
    tAmbienteMax: null as number | null,
  },
} as const;

// ── CALENDARIO ────────────────────────────────────────────────────────────
const MN = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DN = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];

interface DiaI { fecha: string; dayOfMonth: number; diaSem: number; }
interface SemI { semana: number; dias: DiaI[]; }
interface MesI { anio: number; mes: number; label: string; id: string; semanas: SemI[]; }

function buildCal(): MesI[] {
  const r: MesI[] = [];
  for (const y of [2026, 2027]) {
    for (let m = 0; m < 12; m++) {
      const id = `${y}_${String(m + 1).padStart(2, "0")}`;
      const sems: SemI[] = [];
      let ds = (new Date(y, m, 1).getDay() + 6) % 7;
      const dim = new Date(y, m + 1, 0).getDate();
      let cur: DiaI[] = [];
      let ns = 1;
      for (let p = 0; p < ds; p++) cur.push({ fecha: "", dayOfMonth: -1, diaSem: p });
      for (let d = 1; d <= dim; d++) {
        cur.push({ fecha: `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`, dayOfMonth: d, diaSem: ds });
        ds++;
        if (ds === 7) { sems.push({ semana: ns++, dias: cur }); cur = []; ds = 0; }
      }
      if (cur.length > 0) {
        while (cur.length < 7) cur.push({ fecha: "", dayOfMonth: -1, diaSem: cur.length });
        sems.push({ semana: ns, dias: cur });
      }
      r.push({ anio: y, mes: m, label: `${MN[m]} ${y}`, id, semanas: sems });
    }
  }
  return r;
}
const CAL = buildCal();

// ── FIREBASE PATHS ────────────────────────────────────────────────────────
function fsPath(mid: string, sem: number, fecha: string) {
  return `cv_tapas_registros/${mid}/sem_${sem}/${fecha.replace(/-/g, "")}/items`;
}
async function loadDia(mid: string, sem: number, fecha: string): Promise<Reg[]> {
  try {
    const s = await getDocs(query(collection(db, fsPath(mid, sem, fecha)), orderBy("timestamp", "desc")));
    return s.docs.map(d => d.data() as Reg);
  } catch { return []; }
}
async function saveReg(mid: string, sem: number, fecha: string, r: Reg) {
  await setDoc(doc(db, fsPath(mid, sem, fecha), r.id), san(r as unknown as Record<string, unknown>));
}
async function deleteReg(mid: string, sem: number, fecha: string, id: string) {
  await deleteDoc(doc(db, fsPath(mid, sem, fecha), id));
}
async function loadProveedores(): Promise<Proveedor[]> {
  try { const s = await getDocs(collection(db, "cv_proveedores")); return s.docs.map(d => d.data() as Proveedor); }
  catch { return []; }
}
async function saveProveedor(p: Proveedor) { await setDoc(doc(db, "cv_proveedores", p.id), p); }
async function deleteProveedor(id: string) { await deleteDoc(doc(db, "cv_proveedores", id)); }
async function saveAuditoria(a: RAuditoria) {
  await setDoc(doc(db, `cv_tapas_auditorias/${a.fecha}_${a.id}`), a as unknown as Record<string, unknown>);
}
async function loadAuditorias(desde: string, hasta: string): Promise<RAuditoria[]> {
  try {
    const s = await getDocs(collection(db, "cv_tapas_auditorias"));
    return s.docs.map(d => d.data() as RAuditoria)
      .filter(a => a.fecha >= desde && a.fecha <= hasta)
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  } catch { return []; }
}
async function saveTrazAmasijo(t: TrazAmasijo) {
  await setDoc(doc(db, `cv_tapas_amasijos/${t.num_tacho}`), t as unknown as Record<string, unknown>);
}
async function loadTrazAmasijo(num: string): Promise<TrazAmasijo | null> {
  try { const d = await getDoc(doc(db, `cv_tapas_amasijos/${num}`)); return d.exists() ? d.data() as TrazAmasijo : null; }
  catch { return null; }
}
async function loadTrazAmasijosSemana(desde: string, hasta: string): Promise<TrazAmasijo[]> {
  try {
    const s = await getDocs(collection(db, "cv_tapas_amasijos"));
    return s.docs.map(d => d.data() as TrazAmasijo)
      .filter(c => { const ul = c.etapas[c.etapas.length - 1]?.fecha || ""; return ul >= desde && ul <= hasta; })
      .sort((a, b) => b.ultimo_update.localeCompare(a.ultimo_update));
  } catch { return []; }
}
async function agregarEtapaAmasijo(num_tacho: string, etapa: TrazEtapa, variedad: TipoTapa, lote: string) {
  const prev = await loadTrazAmasijo(num_tacho) || { num_tacho, variedad, lote_amasijo: lote, etapas: [], ultimo_update: "" };
  const etapas = [...prev.etapas.filter(e => e.etapa !== etapa.etapa), etapa];
  await saveTrazAmasijo({ ...prev, etapas, ultimo_update: new Date().toISOString() });
}

// ── HELPERS ───────────────────────────────────────────────────────────────
const hoy = () => new Date().toISOString().split("T")[0];
const ahora = () => new Date().toTimeString().slice(0, 5);
function fd(iso: string) { if (!iso) return ""; const [y, m, d] = iso.split("-"); return `${d}/${m}/${y.slice(2)}`; }
function gid(p: string) { return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }
function cAl(a: Record<string, boolean>) { return Object.values(a).filter(Boolean).length; }
function saveFoto(id: string, u: string) { try { localStorage.setItem(`sv_foto_${id}`, u); } catch {} }
function loadFoto(id: string): string | null { try { return localStorage.getItem(`sv_foto_${id}`); } catch { return null; } }
async function compFoto(f: File): Promise<{ dataUrl: string; w: number; h: number }> {
  return new Promise(r => {
    const i = new Image(); const u = URL.createObjectURL(f);
    i.onload = () => {
      const M = 800; const rt = Math.min(M / i.width, M / i.height, 1);
      const w = Math.round(i.width * rt); const h = Math.round(i.height * rt);
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d")!.drawImage(i, 0, 0, w, h);
      URL.revokeObjectURL(u); r({ dataUrl: c.toDataURL("image/jpeg", 0.7), w, h });
    };
    i.src = u;
  });
}
function san(o: Record<string, unknown>): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === "fotos" && Array.isArray(v))
      r[k] = (v as FotoMeta[]).map(({ id, nombre, sector, timestamp, w, h }) => ({ id, nombre, sector, timestamp, w, h }));
    else r[k] = v;
  }
  return r;
}
function promedioArr(arr: string[]): number {
  const vs = arr.map(v => parseFloat(v)).filter(v => !isNaN(v));
  return vs.length ? Math.round(vs.reduce((a, b) => a + b, 0) / vs.length * 10) / 10 : 0;
}
function calcHorasReposo(hi: string, di: string, hs: string, ds: string): number {
  if (!hi || !di || !hs || !ds) return 0;
  try {
    const ini = new Date(`${di}T${hi}`);
    const sal = new Date(`${ds}T${hs}`);
    return Math.round((sal.getTime() - ini.getTime()) / 36000) / 100;
  } catch { return 0; }
}

// ── CONSTANTES UI ─────────────────────────────────────────────────────────
const MODS: { id: Tipo; label: string; icon: string }[] = [
  { id: "temperaturas", label: "Temperaturas", icon: "🌡️" },
  { id: "tapas",        label: "Control Tapas", icon: "🫓" },
  { id: "bpm",          label: "BPM NC",        icon: "👤" },
  { id: "recepcion",    label: "Recepción MP",   icon: "🚚" },
  { id: "despacho",     label: "Despacho",       icon: "📦" },
  { id: "nc",           label: "No Conformidad", icon: "⚠️" },
  { id: "decomiso",     label: "Decomiso",       icon: "🗑️" },
  { id: "limpieza",     label: "Limpieza POES",  icon: "🧹" },
];
const TURNOS = [
  { id: "TM" as Turno, label: "Mañana" },
  { id: "TT" as Turno, label: "Tarde" },
  { id: "TN" as Turno, label: "Noche" },
];
const UK = "sv_tapas_usuarios_v2";
const PIN = "1234";
const BPM_ITEMS = [
  "Lavado de manos", "Uniforme completo", "Sin joyas/maquillaje",
  "Sin celular en zona", "Sin alimentos fuera de área",
  "Cofia colocada correctamente", "Calzado adecuado",
  "Uñas cortas y sin esmalte", "Sin heridas descubiertas",
  "Manipulación correcta de alimentos",
];

// ── KPIs ──────────────────────────────────────────────────────────────────
interface KPI { total: number; alertas: number; nc: number; decomisos: number; kg: number; bpm_inc: number; tapas: number; por_tipo: Record<string, number>; }
function kpis(rs: Reg[]): KPI {
  let al = 0, nc = 0, dec = 0, kg = 0, binc = 0, tap = 0;
  const pt: Record<string, number> = {};
  for (const r of rs) {
    pt[r.tipo] = (pt[r.tipo] || 0) + 1;
    al += cAl(r.alertas);
    if (r.tipo === "nc") nc++;
    if (r.tipo === "decomiso") { dec++; kg += parseFloat((r as RDecom).cantidad_kg) || 0; }
    if (r.tipo === "bpm") binc++;
    if (r.tipo === "tapas") tap++;
  }
  return { total: rs.length, alertas: al, nc, decomisos: dec, kg: Math.round(kg * 10) / 10, bpm_inc: binc, tapas: tap, por_tipo: pt };
}

interface AlertaItem { campo: string; valor: string; limite: string; tipo: string; registro: Reg; }
function extraerAlertas(rs: Reg[]): AlertaItem[] {
  const labels: Record<string, { limite: string; tipo: string }> = {
    t_agua_nc:         { limite: "Criollas: 13–16°C / Integrales: 15–17°C", tipo: "T° agua chiller NC" },
    t_masa_nc:         { limite: "Criollas/Past.: 22–24°C / Integrales: 21–24°C", tipo: "T° masa salida NC" },
    peso_nc:           { limite: "Criollas/Integ.: 48±2g / Pastelitos: 25±2g", tipo: "Peso tapa NC" },
    recupero_exc:      { limite: "≤4 cajones al cierre", tipo: "Recupero excedido" },
    t_ambiente_nc:     { limite: "≤21°C (crítico integrales)", tipo: "T° ambiente NC" },
    t_camara_masas_nc: { limite: "≤8°C", tipo: "T° cámara masas NC" },
    t_camara_pt_nc:    { limite: "≤-18°C", tipo: "T° cámara PT NC" },
    sin_accion:        { limite: "Sin acción", tipo: "NC sin acción" },
    sin_foto:          { limite: "Sin foto", tipo: "Decomiso sin foto" },
    superficies_no_ok: { limite: "No verificado", tipo: "Superficies PCC" },
    bpm_nc:            { limite: "Incumplimiento", tipo: "BPM" },
    t_ingreso:         { limite: "≤7°C", tipo: "T° recepción MP" },
    rechazado:         { limite: "Rechazado", tipo: "Rechazo MP" },
    fifo_nc:           { limite: "FIFO/FEFO", tipo: "FIFO no aplicado" },
  };
  const out: AlertaItem[] = [];
  for (const r of rs)
    for (const [k, v] of Object.entries(r.alertas))
      if (v) {
        const l = labels[k] || { limite: "—", tipo: k };
        const val = (r as Record<string, unknown>)[k];
        out.push({ campo: k, valor: typeof val === "string" ? val : "—", limite: l.limite, tipo: l.tipo, registro: r });
      }
  return out;
}
function extraerObs(rs: Reg[]): Array<{ texto: string; registro: Reg }> {
  const out: Array<{ texto: string; registro: Reg }> = [];
  for (const r of rs) {
    const o = (r as Record<string, unknown>).observaciones;
    if (typeof o === "string" && o.trim()) out.push({ texto: o.trim(), registro: r });
    if (r.tipo === "nc") { const d = (r as RNC).descripcion; if (d) out.push({ texto: `NC: ${d}`, registro: r }); }
  }
  return out;
}
function calcReincidencias(rs: Reg[]): Array<{ tipo: string; count: number; critico: boolean }> {
  const map: Record<string, number> = {};
  for (const a of extraerAlertas(rs)) map[a.tipo] = (map[a.tipo] || 0) + 1;
  return Object.entries(map).filter(([, c]) => c > 1)
    .map(([k, c]) => ({ tipo: k, count: c, critico: c >= 3 }))
    .sort((a, b) => b.count - a.count);
}

// ── EXPORT TXT ────────────────────────────────────────────────────────────
function buildTxt(rs: Reg[], titulo: string, notas: Record<string, string>, elim: Set<string>): string {
  const vis = rs.filter(r => !elim.has(r.id));
  const k = kpis(vis); const als = extraerAlertas(vis);
  const rein = calcReincidencias(vis); const obs = extraerObs(vis);
  let t = `REPORTE — CONTROL VOLANTE TAPAS v2\nSabores Express\n${titulo}\nGenerado: ${new Date().toLocaleString("es-AR")}\n${"─".repeat(46)}\n\n`;
  t += `RESUMEN\nRegistros: ${k.total} | Alertas: ${k.alertas} | NC: ${k.nc} | Decomisos: ${k.decomisos} (${k.kg}kg) | BPM NC: ${k.bpm_inc} | Controles tapas: ${k.tapas}\n\n`;
  if (als.length) {
    t += `ALERTAS (${als.length})\n`;
    for (const a of als) t += `  [${fd(a.registro.fecha)} ${a.registro.hora}] ⚠ ${a.tipo} — ${a.valor} (límite ${a.limite}) · ${a.registro.responsable}\n`;
  }
  if (rein.length) { t += `\nREINCIDENCIAS\n`; for (const r of rein) t += `  ${r.critico ? "🔴 CRÍTICO" : "🟡"} ${r.tipo}: ${r.count} veces\n`; }
  if (obs.length) {
    t += `\nOBSERVACIONES\n`;
    for (const o of obs) {
      t += `  [${fd(o.registro.fecha)} ${o.registro.hora}] ${o.texto}\n`;
      const n = notas[o.registro.id]; if (n) t += `    Nota: ${n}\n`;
    }
  }
  t += `\n${"─".repeat(46)}\nDETALLE POR TURNO\n`;
  for (const tr of TURNOS) {
    const trs = vis.filter(r => r.turno === tr.id);
    if (!trs.length) continue;
    t += `\nTURNO ${tr.label.toUpperCase()}\n`;
    for (const r of trs) {
      const m = MODS.find(x => x.id === r.tipo);
      t += `  [${r.hora}] ${m?.icon} ${m?.label}${cAl(r.alertas) > 0 ? " ⚠" : ""} · ${r.responsable}\n`;
      if (r.tipo === "tapas") {
        const tp = r as RTapas;
        const pp = PARAMS[tp.variedad as keyof typeof PARAMS];
        t += `    ${pp?.label || tp.variedad} | Lote: ${tp.lote_amasijo} | Prom.peso: ${tp.prom_peso}g | Desvío: ${tp.desvio_pct}%\n`;
      }
      if (r.tipo === "bpm") {
        const b = r as RBPM;
        t += `    Operario: ${b.operario} | Sector: ${b.sector}\n    Incumplimientos: ${b.incumplimientos.join(", ")}\n    Acción: ${b.accion_tomada}\n`;
      }
      const n = notas[r.id]; if (n) t += `    Nota calidad: ${n}\n`;
    }
  }
  return t;
}
function dlTxt(content: string, name: string) {
  const b = new Blob([content], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; a.click();
}

// ── UI BASE ───────────────────────────────────────────────────────────────
function cn(...c: (string | false | undefined)[]) { return c.filter(Boolean).join(" "); }

function Badge({ t, c }: { t: string; c: "red" | "amber" | "blue" | "green" | "purple" | "gray" }) {
  const m = {
    red: "bg-red-100 text-red-700", amber: "bg-amber-100 text-amber-700",
    blue: "bg-blue-100 text-blue-700", green: "bg-green-100 text-green-700",
    purple: "bg-purple-100 text-purple-700", gray: "bg-gray-100 text-gray-600",
  };
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${m[c]}`}>{t}</span>;
}
function ABadge({ n }: { n: number }) {
  if (!n) return null;
  return <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{n}</span>;
}
function Spin() { return <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />; }

function Num({ label, value, onChange, al, spec }: { label: string; value: string; onChange: (v: string) => void; al?: boolean; spec?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs text-gray-500">{label}</label>
      {spec && <span className="text-[10px] text-blue-400">{spec}</span>}
      <input type="number" inputMode="decimal" value={value} onChange={e => onChange(e.target.value)}
        className={cn("h-10 rounded-lg border px-3 text-sm font-mono", al ? "border-red-400 bg-red-50 text-red-700" : "border-gray-200 bg-white")} />
      {al && <span className="text-[10px] text-red-500 font-medium">⚠ Fuera de rango</span>}
    </div>
  );
}
function Txt({ label, value, onChange, ph }: { label: string; value: string; onChange: (v: string) => void; ph?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs text-gray-500">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={ph}
        className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm" />
    </div>
  );
}
function Sel({ label, value, onChange, opts, al }: { label: string; value: string; onChange: (v: string) => void; opts: { v: string; l: string }[]; al?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs text-gray-500">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className={cn("h-10 rounded-lg border px-3 text-sm bg-white", al ? "border-red-400 bg-red-50" : "border-gray-200")}>
        <option value="">Seleccionar…</option>
        {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
      {al && <span className="text-[10px] text-red-500 font-medium">⚠ Requiere acción</span>}
    </div>
  );
}
function Chk({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      className={cn("flex items-center gap-2 p-2.5 rounded-lg border text-sm text-left", value ? "border-green-400 bg-green-50 text-green-800" : "border-gray-200 bg-white text-gray-700")}>
      <span className={cn("w-5 h-5 rounded flex items-center justify-center flex-shrink-0 text-xs border", value ? "bg-green-500 border-green-500 text-white" : "border-gray-300")}>{value ? "✓" : ""}</span>
      {label}
    </button>
  );
}
function TA({ label, value, onChange, ph }: { label: string; value: string; onChange: (v: string) => void; ph?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs text-gray-500">{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={ph} rows={3}
        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm resize-none" />
    </div>
  );
}
function Fotos({ fotos, onAdd, onRemove }: { fotos: FotoMeta[]; onAdd: (m: FotoMeta) => void; onRemove: (id: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [cg, setCg] = useState(false);
  async function h(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return; setCg(true);
    try {
      const { dataUrl, w, h } = await compFoto(f);
      const id = gid("foto"); saveFoto(id, dataUrl);
      onAdd({ id, nombre: f.name, sector: "CV", timestamp: new Date().toISOString(), w, h });
    } finally { setCg(false); if (ref.current) ref.current.value = ""; }
  }
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-gray-500">Fotos de evidencia</label>
      <div className="flex flex-wrap gap-2">
        {fotos.map(f => {
          const u = loadFoto(f.id);
          return (
            <div key={f.id} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
              {u ? <img src={u} alt={f.nombre} className="w-full h-full object-cover" />
                  : <div className="w-full h-full bg-gray-100 flex items-center justify-center text-[10px] text-gray-400 text-center px-1">Solo este disp.</div>}
              <button onClick={() => onRemove(f.id)} className="absolute top-0 right-0 bg-red-500 text-white w-4 h-4 rounded-bl text-[9px] flex items-center justify-center">✕</button>
            </div>
          );
        })}
        <button onClick={() => ref.current?.click()} className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400">
          {cg ? <Spin /> : <><span className="text-xl">📷</span><span className="text-[10px]">Foto</span></>}
        </button>
      </div>
      <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden" onChange={h} />
    </div>
  );
}

function FW({ titulo, sub, onCancel, onSave, g, ch }: { titulo: string; sub: string; onCancel: () => void; onSave: () => void; g: boolean; ch: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex items-center gap-3 p-4 border-b border-gray-100 bg-white sticky top-0 z-10">
        <button onClick={onCancel} className="text-gray-400 p-1 text-lg">←</button>
        <div className="flex-1">
          <div className="font-semibold text-gray-800 text-sm">{titulo}</div>
          <div className="text-xs text-gray-400">{sub}</div>
        </div>
      </div>
      <div className="flex-1 p-4 flex flex-col gap-4 pb-28">{ch}</div>
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 flex gap-3 max-w-lg mx-auto">
        <button onClick={onCancel} className="flex-1 h-11 rounded-xl border border-gray-200 text-sm text-gray-600 font-medium">Cancelar</button>
        <button onClick={onSave} disabled={g} className="flex-[2] h-11 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2">
          {g ? <Spin /> : "Guardar ✓"}
        </button>
      </div>
    </div>
  );
}

// ── LOGIN ──────────────────────────────────────────────────────────────────
function Login({ onLogin }: { onLogin: (u: Usuario) => void }) {
  const [n, sN] = useState("");
  const [t, sT] = useState<Turno>("TM");
  const [r, sR] = useState<Rol>("control_volante");
  const [pin, sPin] = useState("");
  const [err, sErr] = useState("");
  useEffect(() => {
    try { const s = localStorage.getItem(UK); if (s) { const u = JSON.parse(s) as Usuario; onLogin(u); } } catch {}
  }, []);
  function ok() {
    if (!n.trim()) { sErr("Ingresá tu nombre"); return; }
    if (r === "calidad" && pin !== PIN) { sErr("PIN incorrecto"); return; }
    const u: Usuario = { nombre: n.trim(), rol: r, turno: t };
    try { localStorage.setItem(UK, JSON.stringify(u)); } catch {}
    onLogin(u);
  }
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-6 w-full max-w-sm flex flex-col gap-4">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Sabores Express</p>
          <p className="text-xl font-bold text-gray-800 mt-0.5">Control Volante 🫓</p>
          <p className="text-xs text-gray-400 mt-0.5">Tapas — P251 / P250 / P252</p>
        </div>
        <div className="flex flex-col gap-3">
          <Txt label="Tu nombre" value={n} onChange={sN} ph="Nombre y apellido" />
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-500">Turno</label>
            <div className="flex gap-2">
              {TURNOS.map(x => (
                <button key={x.id} onClick={() => sT(x.id)}
                  className={cn("flex-1 h-10 rounded-lg border text-sm font-medium", t === x.id ? "bg-blue-500 border-blue-500 text-white" : "border-gray-200 text-gray-600")}>
                  {x.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-gray-500">Rol</label>
            <div className="flex gap-2">
              {([{ id: "control_volante", l: "Control Volante" }, { id: "calidad", l: "Calidad" }] as const).map(x => (
                <button key={x.id} onClick={() => sR(x.id)}
                  className={cn("flex-1 h-10 rounded-lg border text-sm font-medium", r === x.id ? "bg-blue-500 border-blue-500 text-white" : "border-gray-200 text-gray-600")}>
                  {x.l}
                </button>
              ))}
            </div>
          </div>
          {r === "calidad" && <Txt label="PIN Calidad" value={pin} onChange={sPin} ph="····" />}
          {err && <p className="text-xs text-red-500">{err}</p>}
          <button onClick={ok} className="h-11 rounded-xl bg-blue-500 text-white font-semibold text-sm">Ingresar</button>
        </div>
      </div>
    </div>
  );
}

// ── FORM TEMPERATURAS ─────────────────────────────────────────────────────
function FTemp({ u, onSave, onCancel }: { u: Usuario; onSave: (r: Reg) => void; onCancel: () => void }) {
  const [d, sD] = useState({ t_camara_masas: "", t_ambiente: "", t_camara_pt: "", equipo_num: "", observaciones: "", fotos: [] as FotoMeta[] });
  const [g, sG] = useState(false);
  const aCamaraMasas = d.t_camara_masas !== "" && parseFloat(d.t_camara_masas) > 8;
  const aAmbiente = d.t_ambiente !== "" && parseFloat(d.t_ambiente) > 21;
  const aCamaraPT = d.t_camara_pt !== "" && parseFloat(d.t_camara_pt) > -18;
  async function sv() {
    sG(true);
    onSave({
      id: gid("tmp"), tipo: "temperaturas", turno: u.turno, responsable: u.nombre,
      fecha: hoy(), hora: ahora(), timestamp: new Date().toISOString(),
      alertas: { t_camara_masas_nc: aCamaraMasas, t_ambiente_nc: aAmbiente, t_camara_pt_nc: aCamaraPT },
      ...d,
    } as unknown as Reg);
    sG(false);
  }
  return (
    <FW titulo="🌡️ Temperaturas — Cámaras" sub="PC · Registro único de cámaras" onCancel={onCancel} onSave={sv} g={g} ch={<>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700 leading-relaxed">
        Registrá una sola vez por turno. T° de proceso (masa, cortadora) van en <b>🫓 Control Tapas</b>.
      </div>
      <Num label="T° cámara de masas / fraccionado (°C)" spec="PC — ≤8°C" value={d.t_camara_masas} onChange={v => sD(p => ({ ...p, t_camara_masas: v }))} al={aCamaraMasas} />
      {aCamaraMasas && <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">⚠ T° cámara masas fuera de rango — verificar equipo</div>}
      <Num label="T° ambiente área de producción (°C)" spec="PC — ≤21°C (crítico para integrales, I1219)" value={d.t_ambiente} onChange={v => sD(p => ({ ...p, t_ambiente: v }))} al={aAmbiente} />
      {aAmbiente && <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-700">⚠ T° ambiente elevada — impacta especialmente en tapas integrales (límite 21°C según I1219)</div>}
      <Num label="T° cámara de PT (°C)" spec="PC — ≤-18°C" value={d.t_camara_pt} onChange={v => sD(p => ({ ...p, t_camara_pt: v }))} al={aCamaraPT} />
      {aCamaraPT && <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">⚠ Cámara PT fuera de rango — cadena de frío comprometida</div>}
      <Txt label="N° termómetro / equipo calibrado" value={d.equipo_num} onChange={v => sD(p => ({ ...p, equipo_num: v }))} ph="ej: TM-03" />
      <Fotos fotos={d.fotos} onAdd={f => sD(p => ({ ...p, fotos: [...p.fotos, f] }))} onRemove={id => sD(p => ({ ...p, fotos: p.fotos.filter(f => f.id !== id) }))} />
      <TA label="Observaciones / acción correctiva" value={d.observaciones} onChange={v => sD(p => ({ ...p, observaciones: v }))} />
    </>} />
  );
}

// ── FORM TAPAS — Proceso completo P251/P250/P252 ─────────────────────────
function FTapas({ u, onSave, onCancel }: { u: Usuario; onSave: (r: Reg) => void; onCancel: () => void }) {
  const [d, sD] = useState({
    variedad: "" as TipoTapa, lote_amasijo: "",
    operario_amasado: "", operario_laminado: "", operario_cortadora: "", operario_envasado: "",
    // S0 — Fraccionado
    dosificado_ok: false, rotulado_fraccionado_ok: false,
    // S1 — Amasado
    t_agua_chiller: "", peso_baston: "", t_masa_salida: "", tiempo_amasado: "",
    // S2 — Trazabilidad cámara
    num_tacho: "", fecha_ingreso_camara: hoy(), hora_ingreso_camara: "",
    fecha_salida_camara: hoy(), hora_salida_camara: "",
    // S3 — Laminado
    textura_masa_ok: false, color_masa_ok: false, virgen_sobre_recupero: false,
    // S4 — Cortadora
    muestras_peso: ["","","","","","","","","",""] as string[],
    t_cortadora: "", ajustado: "",
    // S5 — Sobadora / recupero
    recupero_cajones: "", recupero_ok: false,
    // S6 — Envasado
    tubos_por_cajon: "", unidades_por_tubo: "",
    cajones_etiquetados: false,
    etiqueta_fecha_ok: false, etiqueta_lote_ok: false, etiqueta_tipo_ok: false,
    bolsa_integra_ok: false, obs_envasado: "",
    // S7 — Cámara PT
    fifo_ok: false, identificacion_cajones_ok: false, orden_camara_obs: "",
    // S8 — Sensorial
    forma_ok: false, textura_ok: false, color_ok: false, sensorial_obs: "",
    // Controles extras
    mantenimiento_preventivo_ok: false, desperdicios_obs: "",
    observaciones: "", fotos: [] as FotoMeta[],
  });
  const [g, sG] = useState(false);

  const p = d.variedad ? PARAMS[d.variedad as keyof typeof PARAMS] : null;
  const pesoObj = p?.pesoTapa ?? 48;
  const pesoTol = p?.pesoTol ?? 2;

  // Cálculos pesos
  const prom = promedioArr(d.muestras_peso);
  const dv = pesoObj > 0 && prom > 0 ? Math.round(Math.abs(prom - pesoObj) / pesoObj * 100 * 10) / 10 : 0;

  // Alertas PCC
  const aAgua = p && d.t_agua_chiller !== "" && (parseFloat(d.t_agua_chiller) < p.tAgua.min || parseFloat(d.t_agua_chiller) > p.tAgua.max);
  const aTMasa = p && d.t_masa_salida !== "" && (parseFloat(d.t_masa_salida) < p.tMasa.min || parseFloat(d.t_masa_salida) > p.tMasa.max);
  const aPeso = prom > 0 && Math.abs(prom - pesoObj) > pesoTol;
  const aTCort = d.t_cortadora !== "" && (parseFloat(d.t_cortadora) < 16 || parseFloat(d.t_cortadora) > 20);
  const aRecupero = d.recupero_cajones !== "" && parseFloat(d.recupero_cajones) > 4;
  const horasReposo = calcHorasReposo(d.hora_ingreso_camara, d.fecha_ingreso_camara, d.hora_salida_camara, d.fecha_salida_camara);

  function setMuestra(i: number, v: string) {
    sD(prev => { const a = [...prev.muestras_peso]; a[i] = v; return { ...prev, muestras_peso: a }; });
  }

  async function sv() {
    sG(true);
    if (d.num_tacho) {
      await agregarEtapaAmasijo(d.num_tacho, {
        etapa: "amasado", fecha: d.fecha_ingreso_camara, hora: d.hora_ingreso_camara || ahora(),
        operario: u.nombre, turno: u.turno,
        datos: { t_agua: d.t_agua_chiller, t_masa: d.t_masa_salida, tiempo: d.tiempo_amasado, lote: d.lote_amasijo },
      }, d.variedad, d.lote_amasijo);
      if (d.hora_salida_camara) {
        await agregarEtapaAmasijo(d.num_tacho, {
          etapa: "laminado", fecha: d.fecha_salida_camara, hora: d.hora_salida_camara,
          operario: u.nombre, turno: u.turno,
          datos: { virgen_sobre_recupero: d.virgen_sobre_recupero ? "ok" : "nc", textura: d.textura_masa_ok ? "ok" : "nc" },
        }, d.variedad, d.lote_amasijo);
      }
      await agregarEtapaAmasijo(d.num_tacho, {
        etapa: "cortadora", fecha: hoy(), hora: ahora(),
        operario: u.nombre, turno: u.turno,
        datos: { prom_peso: `${prom}g`, desvio: `${dv}%`, t_cortadora: d.t_cortadora },
      }, d.variedad, d.lote_amasijo);
      await agregarEtapaAmasijo(d.num_tacho, {
        etapa: "envasado", fecha: hoy(), hora: ahora(),
        operario: u.nombre, turno: u.turno,
        datos: { tubos: d.tubos_por_cajon, cajones_ok: d.cajones_etiquetados ? "ok" : "nc", fifo: d.fifo_ok ? "ok" : "nc" },
      }, d.variedad, d.lote_amasijo);
    }
    onSave({
      id: gid("tap"), tipo: "tapas", turno: u.turno, responsable: u.nombre,
      fecha: hoy(), hora: ahora(), timestamp: new Date().toISOString(),
      prom_peso: prom, desvio_pct: dv,
      alertas: { t_agua_nc: !!aAgua, t_masa_nc: !!aTMasa, peso_nc: aPeso, recupero_exc: aRecupero, fifo_nc: !d.fifo_ok },
      ...d,
    } as unknown as Reg);
    sG(false);
  }

  return (
    <FW titulo="🫓 Control Tapas" sub="P251 Criollas · P250 Integrales · P252 Pastelitos" onCancel={onCancel} onSave={sv} g={g} ch={<>

      {/* ── SELECCIÓN VARIEDAD ────────────────────────────────── */}
      <div className="flex gap-2">
        {(["criollas", "integrales", "pastelitos"] as const).map(x => (
          <button key={x} onClick={() => sD(p => ({ ...p, variedad: x }))}
            className={cn("flex-1 py-3 rounded-xl text-xs font-bold border-2",
              d.variedad === x ? "border-amber-500 bg-amber-50 text-amber-700" : "border-gray-200 bg-white text-gray-500")}>
            {x === "criollas" ? "🫓 Criollas" : x === "integrales" ? "🌾 Integrales" : "🟡 Pastelitos"}
          </button>
        ))}
      </div>
      {p && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[10px] text-amber-700 leading-relaxed">
          <b>{p.label}</b> · {p.proc}/{p.instructivo} · Peso: {pesoObj}g ±{pesoTol}g · {p.cajones} und/cajón
          {" "}· {p.tubos} tubos × {p.uPorTubo}u · Forma: {p.dimAlto} × {p.dimAncho}
          {p.vueltas === 3 && " · Laminado: 3 vueltas"}
          {p.soloRecupero && " · ⚠ Laminado: SOLO recupero"}
        </div>
      )}
      <Txt label="N° lote / amasijo" value={d.lote_amasijo} onChange={v => sD(p => ({ ...p, lote_amasijo: v }))} ph="Obligatorio — trazabilidad" />

      {/* ══════════════════════════════════════════════════════
          S0 — FRACCIONADO / DOSIFICADO
          §2 — Todos los procedimientos
      ══════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border-2 border-gray-200 overflow-hidden">
        <div className="bg-gray-100 px-4 py-2 flex items-center justify-between">
          <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">📦 S0 — Fraccionado</span>
          <span className="text-[10px] text-gray-400">§2 todos los proc.</span>
        </div>
        <div className="p-4 flex flex-col gap-3 bg-white">
          <div className="text-[10px] text-gray-400 leading-relaxed">
            Dosificar aditivos (sorbato, propionato, sal, almidón, gluten{d.variedad === "integrales" ? ", superbread" : ""}),
            fraccionar grasa y margarina{d.variedad === "integrales" ? ". Integrales: también fraccionar salvado+azúcar+avena, extracto de malta y colorante caramelo separados" : ""}.
            Rotular con fecha de elaboración.
          </div>
          <Chk label="✓ Dosificado de aditivos completo y correcto" value={d.dosificado_ok} onChange={v => sD(p => ({ ...p, dosificado_ok: v }))} />
          <Chk label="✓ Fracciones rotuladas con fecha de elaboración" value={d.rotulado_fraccionado_ok} onChange={v => sD(p => ({ ...p, rotulado_fraccionado_ok: v }))} />
          <Txt label="Operario amasado" value={d.operario_amasado} onChange={v => sD(p => ({ ...p, operario_amasado: v }))} ph="Nombre y apellido" />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          S1 — AMASADO
          PC: T° agua chiller · T° masa salida · Peso bastón
      ══════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border-2 border-indigo-200 overflow-hidden">
        <div className="bg-indigo-50 px-4 py-2 flex items-center justify-between">
          <span className="text-xs font-bold text-indigo-700 uppercase tracking-wide">🫱 S1 — Amasado</span>
          <span className="text-[10px] text-indigo-400">§3 · PC</span>
        </div>
        <div className="p-4 flex flex-col gap-3 bg-white">
          {p && (
            <div className="text-[10px] text-indigo-400">
              Agua chiller: {p.tAgua.min}–{p.tAgua.max}°C · T° masa salida: {p.tMasa.min}–{p.tMasa.max}°C
              · Bastón: {p.pesoBaston.min}–{p.pesoBaston.max}kg (ideal {p.pesoBaston.ideal}kg)
              · Tiempo: {p.tiempoAmasado}
            </div>
          )}
          {d.variedad === "integrales" && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-2 text-[10px] text-indigo-700">
              ℹ️ Integrales (P250 §3.1): hidratar salvado+avena+azúcar 3–6 min antes de incorporar. Agregar colorante caramelo y extracto de malta separados. Tiempo total: ~9 min.
            </div>
          )}
          <Num label="T° agua chiller (°C)" spec={p ? `PC — ${p.tAgua.min}°C a ${p.tAgua.max}°C` : ""}
            value={d.t_agua_chiller} onChange={v => sD(p => ({ ...p, t_agua_chiller: v }))} al={!!aAgua} />
          {aAgua && <div className="bg-red-50 border border-red-200 rounded-xl p-2 text-xs text-red-700">⚠ T° agua fuera de rango — ajustar proporción agua/hielo antes de amasar</div>}
          <Num label="T° masa al salir amasadora (°C)" spec={p ? `PC — ${p.tMasa.min}°C a ${p.tMasa.max}°C` : ""}
            value={d.t_masa_salida} onChange={v => sD(p => ({ ...p, t_masa_salida: v }))} al={!!aTMasa} />
          {aTMasa && <div className="bg-red-50 border border-red-200 rounded-xl p-2 text-xs text-red-700">⚠ T° masa NC — fraccionar en tachos y reposar. Documentar acción.</div>}
          <Num label="Peso del bastón (kg)" spec="PC — 17.5 a 18 kg (ideal 18 kg)"
            value={d.peso_baston} onChange={v => sD(p => ({ ...p, peso_baston: v }))}
            al={d.peso_baston !== "" && (parseFloat(d.peso_baston) < 17.5 || parseFloat(d.peso_baston) > 18)} />
          <Num label="Tiempo total de amasado (min)" spec={p ? `Ref: ${p.tiempoAmasado}` : ""}
            value={d.tiempo_amasado} onChange={v => sD(p => ({ ...p, tiempo_amasado: v }))} />

          {/* Trazabilidad — Ingreso a cámara (criollas e integrales) */}
          {(d.variedad === "criollas" || d.variedad === "integrales") && (
            <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-3 flex flex-col gap-2.5">
              <span className="text-[10px] font-bold text-cyan-700 uppercase tracking-wide">🚛 Trazabilidad — Ingreso a cámara</span>
              <div className="text-[9px] text-cyan-500">N° tacho asignado · Registrá el ingreso para calcular tiempo de reposo</div>
              <Txt label="N° de tacho asignado" value={d.num_tacho} onChange={v => sD(p => ({ ...p, num_tacho: v }))} ph="ej: T-01 — único por amasijo" />
              <div className="grid grid-cols-2 gap-2">
                <Txt label="Fecha ingreso" value={d.fecha_ingreso_camara} onChange={v => sD(p => ({ ...p, fecha_ingreso_camara: v }))} ph={hoy()} />
                <Txt label="Hora ingreso" value={d.hora_ingreso_camara} onChange={v => sD(p => ({ ...p, hora_ingreso_camara: v }))} ph="HH:MM" />
              </div>
              {d.num_tacho && d.hora_ingreso_camara && (
                <div className="bg-cyan-100 rounded-lg px-3 py-1.5 text-xs text-cyan-800 font-medium">
                  Tacho {d.num_tacho} · Ingresó {fd(d.fecha_ingreso_camara)} a las {d.hora_ingreso_camara}h
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          S2 — LAMINADO
          PC: textura · color · orden de amasijos
          Vueltas: criollas/pastelitos = 2, integrales = 3
      ══════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border-2 border-violet-200 overflow-hidden">
        <div className="bg-violet-50 px-4 py-2 flex items-center justify-between">
          <span className="text-xs font-bold text-violet-700 uppercase tracking-wide">📋 S2 — Laminado</span>
          <span className="text-[10px] text-violet-400">§4–5 · PC</span>
        </div>
        <div className="p-4 flex flex-col gap-3 bg-white">
          {/* Salida de cámara para criollas/integrales */}
          {(d.variedad === "criollas" || d.variedad === "integrales") && (
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 flex flex-col gap-2.5">
              <span className="text-[10px] font-bold text-violet-700 uppercase tracking-wide">🚛 Salida de cámara (trazabilidad)</span>
              <div className="grid grid-cols-2 gap-2">
                <Txt label="Fecha salida cámara" value={d.fecha_salida_camara} onChange={v => sD(p => ({ ...p, fecha_salida_camara: v }))} ph={hoy()} />
                <Txt label="Hora salida cámara" value={d.hora_salida_camara} onChange={v => sD(p => ({ ...p, hora_salida_camara: v }))} ph="HH:MM" />
              </div>
              {horasReposo > 0 && (
                <div className={cn("rounded-xl px-3 py-2 text-sm font-bold text-center border-2",
                  horasReposo >= 12 ? "border-blue-300 bg-blue-50 text-blue-700" : "border-green-300 bg-green-50 text-green-700")}>
                  ⏱ Reposo: {horasReposo}h {horasReposo >= 12 ? "✓ Óptimo (12h)" : "✓ Listo para laminar"}
                </div>
              )}
            </div>
          )}
          <Txt label="Operario laminado" value={d.operario_laminado} onChange={v => sD(p => ({ ...p, operario_laminado: v }))} ph="Nombre y apellido" />
          <Chk label="✓ Textura y color de masa uniformes" value={d.textura_masa_ok} onChange={v => sD(p => ({ ...p, textura_masa_ok: v }))} />
          <Chk label="✓ Color uniforme de la masa" value={d.color_masa_ok} onChange={v => sD(p => ({ ...p, color_masa_ok: v }))} />

          {/* Orden de amasijos — diferente según variedad */}
          {d.variedad === "pastelitos" ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-700">
              ⚠ <b>Pastelitos (I1217 §1):</b> En laminadora se usa <b>SOLO amasijo de masa recuperada</b>. No se agrega masa virgen en esta etapa.
            </div>
          ) : d.variedad ? (
            <>
              <Chk label="✓ Masa virgen arriba / recupero abajo (PC crítico)" value={d.virgen_sobre_recupero} onChange={v => sD(p => ({ ...p, virgen_sobre_recupero: v }))} />
              {!d.virgen_sobre_recupero && <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">⚠ PC — Verificar orden: masa virgen arriba, recupero abajo</div>}
            </>
          ) : null}

          {p && (
            <div className="text-[10px] text-gray-400">
              {d.variedad === "integrales"
                ? "Integrales: 3 vueltas (1ra: 15→10mm, 2da: 15→8mm, 3ra: 15→6mm). Verificar limpieza."
                : "Criollas/Pastelitos: 2 vueltas (15→10mm). Verificar limpieza de maquinaria."}
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          S3 — CORTADORA + PESOS
          PC: peso objetivo · temperatura 18°C
          Tandas: 3×16=48 (criollas/pastelitos) · 4×16=64 (integrales)
      ══════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border-2 border-orange-200 overflow-hidden">
        <div className="bg-orange-50 px-4 py-2 flex items-center justify-between">
          <span className="text-xs font-bold text-orange-700 uppercase tracking-wide">✂️ S3 — Cortadora + Pesos</span>
          <span className="text-[10px] text-orange-400">§6 · PC pesos y T°</span>
        </div>
        <div className="p-4 flex flex-col gap-3 bg-white">
          {p && (
            <div className="bg-orange-50 border border-orange-100 rounded-lg p-2 text-[10px] text-orange-700">
              {p.tandas} tandas × {p.uPorTanda} unidades = {p.tandas * p.uPorTanda} und/tubo
              · T° cortadora: {p.tCortadora}°C · Forma: {p.dimAlto} × {p.dimAncho}
            </div>
          )}
          <Txt label="Operario cortadora" value={d.operario_cortadora} onChange={v => sD(p => ({ ...p, operario_cortadora: v }))} ph="Nombre y apellido" />
          <Num label="T° cortadora / ambiente (°C)" spec={`PC — ref ${p?.tCortadora ?? 18}°C · rango 16–20°C`}
            value={d.t_cortadora} onChange={v => sD(p => ({ ...p, t_cortadora: v }))} al={aTCort} />
          {aTCort && <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-700">⚠ T° ambiente en cortadora NC — puede afectar peso y textura</div>}

          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
            <div className="text-[10px] font-bold text-orange-700 uppercase tracking-wide mb-2">⚖️ PC — Pesos · Objetivo: {pesoObj}g ±{pesoTol}g</div>
            <div className="text-[9px] text-orange-500 mb-3">10 muestras por amasijo · Valor unitario por tapa</div>
            <div className="grid grid-cols-5 gap-1.5 mb-3">
              {d.muestras_peso.map((v, i) => (
                <div key={i} className="flex flex-col gap-0.5">
                  <span className="text-[9px] text-gray-400 text-center">{i + 1}</span>
                  <input type="number" inputMode="decimal" value={v} onChange={e => setMuestra(i, e.target.value)} placeholder="—"
                    className={cn("h-10 rounded-lg border text-center text-xs font-mono",
                      v !== "" && Math.abs(parseFloat(v) - pesoObj) > pesoTol ? "border-red-400 bg-red-50 text-red-700" : "border-gray-200 bg-white")} />
                </div>
              ))}
            </div>
            {prom > 0 && (
              <div className={cn("rounded-xl p-3 flex items-center justify-between border-2 mb-2", aPeso ? "border-red-400 bg-red-50" : "border-green-400 bg-green-50")}>
                <div>
                  <div className={cn("text-sm font-bold", aPeso ? "text-red-700" : "text-green-700")}>{aPeso ? "⚠ Peso fuera de rango" : "✓ Peso en rango"}</div>
                  <div className="text-[10px] text-gray-500">Promedio: {prom}g · Objetivo: {pesoObj}g ±{pesoTol}g</div>
                </div>
                <div className={cn("text-2xl font-black", aPeso ? "text-red-600" : "text-green-600")}>{dv}%</div>
              </div>
            )}
            {aPeso && (
              <Sel label="Acción correctiva" value={d.ajustado} onChange={v => sD(p => ({ ...p, ajustado: v }))} al={!d.ajustado}
                opts={[{ v: "si", l: "✓ Calibre corregido" }, { v: "no", l: "Sin corrección — documentar" }, { v: "retirado", l: "Lote retirado de línea" }]} />
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          S4 — SOBADORA / RECUPERO
          PC: ≤4 cajones al cierre
          Integrales: último recupero → decomiso (P250 §6.6)
      ══════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border-2 border-yellow-200 overflow-hidden">
        <div className="bg-yellow-50 px-4 py-2 flex items-center justify-between">
          <span className="text-xs font-bold text-yellow-700 uppercase tracking-wide">♻️ S4 — Sobadora / Recupero</span>
          <span className="text-[10px] text-yellow-600">§7 · PC</span>
        </div>
        <div className="p-4 flex flex-col gap-3 bg-white">
          <div className="text-[10px] text-gray-400">Recortes de cortadora → sobadora → se incorporan al siguiente ciclo. Al cierre de turno: máximo 4 cajones identificados en cámara.</div>
          {p && (
            <div className={cn("border rounded-lg p-2 text-xs", d.variedad === "integrales" ? "bg-red-50 border-red-200 text-red-700" : "bg-yellow-50 border-yellow-200 text-yellow-700")}>
              {d.variedad === "integrales"
                ? "⚠ Integrales (P250 §6.6): el ÚLTIMO recorte del turno se PESA y DECOMISA. No se guarda para el turno siguiente."
                : `ℹ️ ${p.notaRecupero}`}
            </div>
          )}
          <Num label="Cajones de recupero al cierre de turno" spec="PC — Máximo 4 cajones"
            value={d.recupero_cajones} onChange={v => sD(p => ({ ...p, recupero_cajones: v }))} al={aRecupero} />
          {aRecupero && <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">⚠ Recupero excede límite (4 cajones) — documentar acción correctiva</div>}
          <Chk label="✓ Recupero identificado con fecha y lote en cámara" value={d.recupero_ok} onChange={v => sD(p => ({ ...p, recupero_ok: v }))} />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          S5 — ENVASADO
          PC: cajones completos · etiqueta correcta · bolsa íntegra
      ══════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border-2 border-teal-200 overflow-hidden">
        <div className="bg-teal-50 px-4 py-2 flex items-center justify-between">
          <span className="text-xs font-bold text-teal-700 uppercase tracking-wide">📦 S5 — Envasado</span>
          <span className="text-[10px] text-teal-500">§8 · PC</span>
        </div>
        <div className="p-4 flex flex-col gap-3 bg-white">
          {p && (
            <div className="text-[10px] text-teal-600 mb-1 leading-relaxed">
              {p.tubos} tubos × {p.uPorTubo} und = <b>{p.cajones} und/cajón</b> · 32 cajones/carro
              {p.pesoTubo && ` · Peso tubo: ${p.pesoTubo.min}–${p.pesoTubo.max} kg`}
              {p.pesoCajon && ` · Peso cajón: ${p.pesoCajon.min}–${p.pesoCajon.max} kg (sin cajón)`}
            </div>
          )}
          <Txt label="Operario envasado" value={d.operario_envasado} onChange={v => sD(p => ({ ...p, operario_envasado: v }))} ph="Nombre y apellido" />
          <div className="grid grid-cols-2 gap-2">
            <Num label="Tubos por cajón" spec={p ? `${p.tubos} tubos/cajón` : ""}
              value={d.tubos_por_cajon} onChange={v => sD(p => ({ ...p, tubos_por_cajon: v }))}
              al={!!p && d.tubos_por_cajon !== "" && parseInt(d.tubos_por_cajon) !== p.tubos} />
            <Num label="Unidades por tubo" spec="48 und/tubo"
              value={d.unidades_por_tubo} onChange={v => sD(p => ({ ...p, unidades_por_tubo: v }))}
              al={d.unidades_por_tubo !== "" && parseInt(d.unidades_por_tubo) !== 48} />
          </div>
          <Chk label="✓ Columna de tapas uniforme en el tubo" value={d.cajones_etiquetados} onChange={v => sD(p => ({ ...p, cajones_etiquetados: v }))} />
          <Chk label="✓ Cajón limpio, bolsa sin aberturas y limpia" value={d.bolsa_integra_ok} onChange={v => sD(p => ({ ...p, bolsa_integra_ok: v }))} />
          <div className="text-xs font-semibold text-gray-600 mt-1">Etiqueta — verificar los 3 campos:</div>
          <Chk label="✓ Etiqueta con fecha de elaboración correcta" value={d.etiqueta_fecha_ok} onChange={v => sD(p => ({ ...p, etiqueta_fecha_ok: v }))} />
          <Chk label="✓ Etiqueta con N° de lote visible" value={d.etiqueta_lote_ok} onChange={v => sD(p => ({ ...p, etiqueta_lote_ok: v }))} />
          <Chk label="✓ Etiqueta con tipo de tapa correcto" value={d.etiqueta_tipo_ok} onChange={v => sD(p => ({ ...p, etiqueta_tipo_ok: v }))} />
          <TA label="Obs. envasado" value={d.obs_envasado} onChange={v => sD(p => ({ ...p, obs_envasado: v }))} ph="Novedades, cantidades, incidencias…" />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          S6 — CÁMARA PRODUCTO TERMINADO
          PC: FIFO · identificación cajones · orden por fecha
      ══════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border-2 border-blue-200 overflow-hidden">
        <div className="bg-blue-50 px-4 py-2 flex items-center justify-between">
          <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">❄️ S6 — Cámara PT</span>
          <span className="text-[10px] text-blue-400">PC · FIFO/FEFO</span>
        </div>
        <div className="p-4 flex flex-col gap-3 bg-white">
          <div className="text-[10px] text-blue-400">
            FIFO estricto: lo más antiguo cerca de la puerta de salida. 32 cajones/carro. Pallets: 64 cajones (8 col × 7 + 1 col × 8).
          </div>
          <Chk label="✓ FIFO/FEFO aplicado — lo más antiguo cerca de la puerta" value={d.fifo_ok} onChange={v => sD(p => ({ ...p, fifo_ok: v }))} />
          {!d.fifo_ok && <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-700">⚠ Verificar y corregir el orden de cajones en cámara PT</div>}
          <Chk label="✓ Cajones identificados con fecha y lote" value={d.identificacion_cajones_ok} onChange={v => sD(p => ({ ...p, identificacion_cajones_ok: v }))} />
          <TA label="Obs. orden cámara" value={d.orden_camara_obs} onChange={v => sD(p => ({ ...p, orden_camara_obs: v }))} ph="Novedades, cajones reubicados, desvíos de FIFO…" />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          S7 — EVALUACIÓN SENSORIAL
          Dimensiones por variedad (Fig A de cada instructivo)
      ══════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border-2 border-purple-200 overflow-hidden">
        <div className="bg-purple-50 px-4 py-2">
          <span className="text-xs font-bold text-purple-700 uppercase tracking-wide">👅 S7 — Sensorial</span>
        </div>
        <div className="p-4 flex flex-col gap-2 bg-white">
          {p && (
            <div className="text-[10px] text-purple-400 mb-1">
              {d.variedad === "pastelitos"
                ? `Pastelitos (I1217 Fig A): forma rectangular · ${p.dimAlto} × ${p.dimAncho} · harina suelta sobre la tapa`
                : d.variedad === "integrales"
                  ? `Integrales (I1219 Fig A): forma ovalada · alto ${p.dimAlto} × ancho ${p.dimAncho}`
                  : `Criollas (I500 Fig A): forma ovalada · alto ${p.dimAlto} × ancho ${p.dimAncho}`}
            </div>
          )}
          <Chk
            label={d.variedad === "pastelitos" ? "✓ Forma rectangular uniforme (8.5 × 9 cm aprox)" : "✓ Forma ovalada uniforme"}
            value={d.forma_ok} onChange={v => sD(p => ({ ...p, forma_ok: v }))} />
          <Chk label="✓ Textura correcta — lisa, sin rasgaduras" value={d.textura_ok} onChange={v => sD(p => ({ ...p, textura_ok: v }))} />
          <Chk label="✓ Color adecuado — uniforme" value={d.color_ok} onChange={v => sD(p => ({ ...p, color_ok: v }))} />
          <TA label="Obs. sensorial" value={d.sensorial_obs} onChange={v => sD(p => ({ ...p, sensorial_obs: v }))} ph="Desvíos de forma, color, textura, cuerpos extraños…" />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          S8 — CONTROLES EXTRAS
      ══════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border-2 border-gray-200 overflow-hidden">
        <div className="bg-gray-100 px-4 py-2">
          <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">🔧 S8 — Controles extras</span>
        </div>
        <div className="p-4 flex flex-col gap-3 bg-white">
          <Chk label="✓ Cumplimiento de mantenimiento preventivo de maquinaria" value={d.mantenimiento_preventivo_ok} onChange={v => sD(p => ({ ...p, mantenimiento_preventivo_ok: v }))} />
          <TA label="Obs. desperdicios generados" value={d.desperdicios_obs} onChange={v => sD(p => ({ ...p, desperdicios_obs: v }))} ph="Cantidad estimada de desperdicios del turno…" />
        </div>
      </div>

      <Fotos fotos={d.fotos} onAdd={f => sD(p => ({ ...p, fotos: [...p.fotos, f] }))} onRemove={id => sD(p => ({ ...p, fotos: p.fotos.filter(f => f.id !== id) }))} />
      <TA label="Observaciones generales / acciones correctivas" value={d.observaciones} onChange={v => sD(p => ({ ...p, observaciones: v }))} />
    </>} />
  );
}

// ── FORM BPM ──────────────────────────────────────────────────────────────
function FBPM({ u, onSave, onCancel }: { u: Usuario; onSave: (r: Reg) => void; onCancel: () => void }) {
  const [d, sD] = useState({ sector: "", operario: "", incumplimientos: [] as string[], accion_tomada: "", responsable_sector: "", observaciones: "", fotos: [] as FotoMeta[] });
  const [g, sG] = useState(false);
  function toggle(item: string) {
    sD(p => ({ ...p, incumplimientos: p.incumplimientos.includes(item) ? p.incumplimientos.filter(x => x !== item) : [...p.incumplimientos, item] }));
  }
  async function sv() {
    sG(true);
    onSave({ id: gid("bpm"), tipo: "bpm", turno: u.turno, responsable: u.nombre, fecha: hoy(), hora: ahora(), timestamp: new Date().toISOString(), alertas: { bpm_nc: d.incumplimientos.length > 0 }, ...d } as RBPM);
    sG(false);
  }
  return (
    <FW titulo="👤 BPM — Incumplimiento" sub="Registrar operario y desvío" onCancel={onCancel} onSave={sv} g={g} ch={<>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">Registrá solo cuando hay incumplimiento. El historial acumulado aparece en reportes.</div>
      <Sel label="Sector" value={d.sector} onChange={v => sD(p => ({ ...p, sector: v }))}
        opts={[{ v: "amasado", l: "Amasado" }, { v: "laminado", l: "Laminado" }, { v: "cortadora", l: "Cortadora" }, { v: "sobadora", l: "Sobadora" }, { v: "envasado", l: "Envasado" }, { v: "camara_pt", l: "Cámara PT" }, { v: "recepcion_mp", l: "Recepción MP" }]} />
      <Txt label="Operario en incumplimiento" value={d.operario} onChange={v => sD(p => ({ ...p, operario: v }))} ph="Nombre y apellido" />
      <div className="flex flex-col gap-0.5">
        <label className="text-xs text-gray-500">Ítems incumplidos ({d.incumplimientos.length})</label>
        <div className="flex flex-col gap-1.5">
          {BPM_ITEMS.map(item => (
            <button key={item} onClick={() => toggle(item)}
              className={cn("flex items-center gap-2 p-2.5 rounded-lg border text-sm text-left", d.incumplimientos.includes(item) ? "border-red-400 bg-red-50 text-red-800" : "border-gray-200 bg-white text-gray-700")}>
              <span className={cn("w-5 h-5 rounded flex items-center justify-center flex-shrink-0 text-xs border", d.incumplimientos.includes(item) ? "bg-red-500 border-red-500 text-white" : "border-gray-300")}>
                {d.incumplimientos.includes(item) ? "✕" : ""}
              </span>
              {item}
            </button>
          ))}
        </div>
      </div>
      <TA label="Acción tomada" value={d.accion_tomada} onChange={v => sD(p => ({ ...p, accion_tomada: v }))} ph="Corrección inmediata realizada" />
      <Txt label="Responsable de sector" value={d.responsable_sector} onChange={v => sD(p => ({ ...p, responsable_sector: v }))} />
      <Fotos fotos={d.fotos} onAdd={f => sD(p => ({ ...p, fotos: [...p.fotos, f] }))} onRemove={id => sD(p => ({ ...p, fotos: p.fotos.filter(f => f.id !== id) }))} />
      <TA label="Observaciones" value={d.observaciones} onChange={v => sD(p => ({ ...p, observaciones: v }))} />
    </>} />
  );
}

// ── FORM RECEPCIÓN MP ─────────────────────────────────────────────────────
function FRecep({ u, onSave, onCancel }: { u: Usuario; onSave: (r: Reg) => void; onCancel: () => void }) {
  const [d, sD] = useState({ proveedor_id: "", proveedor_nombre: "", producto: "", remito_lote: "", cantidad_kg: "", vto: "", t_ingreso: "", estado_envase: "", rotulado_ok: false, fifo_ok: false, resultado: "", observaciones: "", fotos: [] as FotoMeta[] });
  const [provs, setProvs] = useState<Proveedor[]>([]);
  const [g, sG] = useState(false);
  useEffect(() => { loadProveedores().then(setProvs); }, []);
  const at = d.t_ingreso !== "" && parseFloat(d.t_ingreso) > 7;
  async function sv() {
    sG(true);
    onSave({ id: gid("rec"), tipo: "recepcion", turno: u.turno, responsable: u.nombre, fecha: hoy(), hora: ahora(), timestamp: new Date().toISOString(), alertas: { t_ingreso: at, rechazado: d.resultado === "rechazado" }, ...d } as RRecep);
    sG(false);
  }
  function selProv(id: string) { const p = provs.find(x => x.id === id); sD(prev => ({ ...prev, proveedor_id: id, proveedor_nombre: p?.nombre || "" })); }
  return (
    <FW titulo="🚚 Recepción MP" sub="Control de materia prima" onCancel={onCancel} onSave={sv} g={g} ch={<>
      <Sel label="Proveedor (BD)" value={d.proveedor_id} onChange={selProv} opts={provs.filter(p => p.activo).map(p => ({ v: p.id, l: p.nombre }))} />
      {!d.proveedor_id && <Txt label="O ingresá proveedor manualmente" value={d.proveedor_nombre} onChange={v => sD(p => ({ ...p, proveedor_nombre: v }))} ph="Nombre del proveedor" />}
      <Sel label="Producto" value={d.producto} onChange={v => sD(p => ({ ...p, producto: v }))}
        opts={[
          { v: "harina_0000", l: "Harina 0000" }, { v: "harina_000", l: "Harina 000 (28% gluten)" },
          { v: "margarina", l: "Margarina Tapera" }, { v: "grasa", l: "Grasa bovina" },
          { v: "almidon", l: "Almidón de maíz" }, { v: "gluten", l: "Gluten" },
          { v: "sal", l: "Sal" }, { v: "propionato", l: "Propionato de calcio" },
          { v: "sorbato", l: "Sorbato de potasio" }, { v: "hielo", l: "Hielo en escama" },
          { v: "avena", l: "Avena" }, { v: "salvado", l: "Salvado de trigo" },
          { v: "azucar", l: "Azúcar" }, { v: "malta", l: "Extracto de malta" },
          { v: "colorante", l: "Colorante caramelo" }, { v: "superbread", l: "Superbread" },
          { v: "otro", l: "Otro" },
        ]} />
      <Txt label="N° remito / lote" value={d.remito_lote} onChange={v => sD(p => ({ ...p, remito_lote: v }))} ph="Trazabilidad" />
      <div className="grid grid-cols-2 gap-2">
        <Num label="Cantidad (kg)" value={d.cantidad_kg} onChange={v => sD(p => ({ ...p, cantidad_kg: v }))} />
        <Txt label="Vencimiento" value={d.vto} onChange={v => sD(p => ({ ...p, vto: v }))} ph="DD/MM/YYYY" />
      </div>
      <Num label="T° ingreso (°C)" spec="PC — ≤7°C refrigerado" value={d.t_ingreso} onChange={v => sD(p => ({ ...p, t_ingreso: v }))} al={at} />
      <Sel label="Estado envase" value={d.estado_envase} onChange={v => sD(p => ({ ...p, estado_envase: v }))} al={d.estado_envase === "rechazado"}
        opts={[{ v: "integro", l: "✓ Íntegro" }, { v: "danado", l: "⚠ Dañado" }, { v: "rechazado", l: "✕ Rechazado" }]} />
      <Chk label="Rotulado correcto (fecha, lote, denominación)" value={d.rotulado_ok} onChange={v => sD(p => ({ ...p, rotulado_ok: v }))} />
      <Chk label="FIFO/FEFO aplicado en almacén" value={d.fifo_ok} onChange={v => sD(p => ({ ...p, fifo_ok: v }))} />
      <Sel label="Resultado" value={d.resultado} onChange={v => sD(p => ({ ...p, resultado: v }))} al={d.resultado === "rechazado"}
        opts={[{ v: "aprobado", l: "✓ Aprobado" }, { v: "observado", l: "⚠ Con observación" }, { v: "rechazado", l: "✕ Rechazado" }]} />
      <Fotos fotos={d.fotos} onAdd={f => sD(p => ({ ...p, fotos: [...p.fotos, f] }))} onRemove={id => sD(p => ({ ...p, fotos: p.fotos.filter(f => f.id !== id) }))} />
      <TA label="Observaciones" value={d.observaciones} onChange={v => sD(p => ({ ...p, observaciones: v }))} />
    </>} />
  );
}

// ── FORM DESPACHO ─────────────────────────────────────────────────────────
function FDesp({ u, onSave, onCancel }: { u: Usuario; onSave: (r: Reg) => void; onCancel: () => void }) {
  const [d, sD] = useState({ local_destino: "", producto: "", lote: "", cantidad: "", t_despacho: "", etiquetado_ok: false, estado_embalaje: "", chofer: "", patente: "", observaciones: "", fotos: [] as FotoMeta[] });
  const [g, sG] = useState(false);
  async function sv() {
    sG(true);
    onSave({ id: gid("dsp"), tipo: "despacho", turno: u.turno, responsable: u.nombre, fecha: hoy(), hora: ahora(), timestamp: new Date().toISOString(), alertas: { sin_etiqueta: !d.etiquetado_ok }, ...d } as RDesp);
    sG(false);
  }
  return (
    <FW titulo="📦 Despacho" sub="Control de PT saliente" onCancel={onCancel} onSave={sv} g={g} ch={<>
      <Txt label="Local destino" value={d.local_destino} onChange={v => sD(p => ({ ...p, local_destino: v }))} />
      <Txt label="Chofer" value={d.chofer} onChange={v => sD(p => ({ ...p, chofer: v }))} ph="Nombre y apellido" />
      <Txt label="Patente" value={d.patente} onChange={v => sD(p => ({ ...p, patente: v }))} ph="ej: AB 123 CD" />
      <Sel label="Producto" value={d.producto} onChange={v => sD(p => ({ ...p, producto: v }))}
        opts={[{ v: "criollas", l: "Tapas Criollas" }, { v: "integrales", l: "Tapas Integrales" }, { v: "pastelitos", l: "Tapas Pastelitos" }]} />
      <Txt label="Lote" value={d.lote} onChange={v => sD(p => ({ ...p, lote: v }))} />
      <Num label="Cantidad (cajones)" value={d.cantidad} onChange={v => sD(p => ({ ...p, cantidad: v }))} />
      <Num label="T° producto al despacho (°C)" spec="PC — verificar conservación" value={d.t_despacho} onChange={v => sD(p => ({ ...p, t_despacho: v }))} />
      <Chk label="✓ Etiquetado correcto (fecha, vencimiento, lote, tipo)" value={d.etiquetado_ok} onChange={v => sD(p => ({ ...p, etiquetado_ok: v }))} />
      <Sel label="Estado embalaje" value={d.estado_embalaje} onChange={v => sD(p => ({ ...p, estado_embalaje: v }))}
        opts={[{ v: "integro", l: "✓ Íntegro" }, { v: "con_dano", l: "⚠ Con daño" }]} />
      <Fotos fotos={d.fotos} onAdd={f => sD(p => ({ ...p, fotos: [...p.fotos, f] }))} onRemove={id => sD(p => ({ ...p, fotos: p.fotos.filter(f => f.id !== id) }))} />
      <TA label="Observaciones" value={d.observaciones} onChange={v => sD(p => ({ ...p, observaciones: v }))} />
    </>} />
  );
}

// ── FORM NC ───────────────────────────────────────────────────────────────
function FNC({ u, onSave, onCancel }: { u: Usuario; onSave: (r: Reg) => void; onCancel: () => void }) {
  const [d, sD] = useState({ tipo_nc: "", descripcion: "", lote_afectado: "", causa_raiz: "", accion_inmediata: "", requiere_nc_formal: false, responsable_sector: "", fotos: [] as FotoMeta[] });
  const [g, sG] = useState(false);
  async function sv() {
    sG(true);
    onSave({ id: gid("nc"), tipo: "nc", turno: u.turno, responsable: u.nombre, fecha: hoy(), hora: ahora(), timestamp: new Date().toISOString(), alertas: { sin_accion: !d.accion_inmediata }, ...d } as RNC);
    sG(false);
  }
  return (
    <FW titulo="⚠️ No Conformidad" sub="Desvíos de proceso o producto" onCancel={onCancel} onSave={sv} g={g} ch={<>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">Registrá todos los desvíos. El historial es tu evidencia de mejora continua.</div>
      <Sel label="Tipo" value={d.tipo_nc} onChange={v => sD(p => ({ ...p, tipo_nc: v }))}
        opts={[
          { v: "peso", l: "Peso fuera de rango" }, { v: "temperatura", l: "Temperatura NC" },
          { v: "textura", l: "Textura / forma" }, { v: "etiqueta", l: "Error etiquetado" },
          { v: "fifo", l: "FIFO no cumplido" }, { v: "bpm", l: "BPM" },
          { v: "recupero", l: "Recupero excedido" }, { v: "proveedor", l: "Proveedor / MP" },
          { v: "infraestructura", l: "Infraestructura/maquinaria" }, { v: "otro", l: "Otro" },
        ]} />
      <TA label="Descripción del desvío" value={d.descripcion} onChange={v => sD(p => ({ ...p, descripcion: v }))}
        ph="Qué, dónde, cuándo. Ej: Tapa criollas peso 52g (límite 48±2g)" />
      <Txt label="Lote afectado" value={d.lote_afectado} onChange={v => sD(p => ({ ...p, lote_afectado: v }))} />
      <Sel label="Causa raíz (5 porqués)" value={d.causa_raiz} onChange={v => sD(p => ({ ...p, causa_raiz: v }))}
        opts={[
          { v: "humano", l: "Factor humano" }, { v: "equipo", l: "Equipo / calibración" },
          { v: "metodo", l: "Método / procedimiento" }, { v: "insumo", l: "Materia prima" },
          { v: "ambiente", l: "Temperatura ambiente" },
        ]} />
      <TA label="Acción inmediata" value={d.accion_inmediata} onChange={v => sD(p => ({ ...p, accion_inmediata: v }))} ph="Qué se hizo en el momento" />
      <Chk label="Requiere NC formal" value={d.requiere_nc_formal} onChange={v => sD(p => ({ ...p, requiere_nc_formal: v }))} />
      <Txt label="Responsable del sector" value={d.responsable_sector} onChange={v => sD(p => ({ ...p, responsable_sector: v }))} />
      <Fotos fotos={d.fotos} onAdd={f => sD(p => ({ ...p, fotos: [...p.fotos, f] }))} onRemove={id => sD(p => ({ ...p, fotos: p.fotos.filter(f => f.id !== id) }))} />
    </>} />
  );
}

// ── FORM DECOMISO ─────────────────────────────────────────────────────────
function FDecom({ u, onSave, onCancel }: { u: Usuario; onSave: (r: Reg) => void; onCancel: () => void }) {
  const [d, sD] = useState({ producto: "", lote: "", cantidad_kg: "", motivo: "", etapa_deteccion: "", destino: "", observaciones: "", fotos: [] as FotoMeta[] });
  const [g, sG] = useState(false);
  async function sv() {
    sG(true);
    onSave({ id: gid("dec"), tipo: "decomiso", turno: u.turno, responsable: u.nombre, fecha: hoy(), hora: ahora(), timestamp: new Date().toISOString(), alertas: { sin_foto: d.fotos.length === 0 }, ...d } as RDecom);
    sG(false);
  }
  return (
    <FW titulo="🗑️ Decomiso" sub="HACCP obligatorio" onCancel={onCancel} onSave={sv} g={g} ch={<>
      <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 font-medium">Foto obligatoria antes de retirar el producto.</div>
      <Sel label="Producto" value={d.producto} onChange={v => sD(p => ({ ...p, producto: v }))}
        opts={[{ v: "criollas", l: "Tapas Criollas" }, { v: "integrales", l: "Tapas Integrales" }, { v: "pastelitos", l: "Tapas Pastelitos" }, { v: "mp", l: "Materia Prima" }]} />
      <Txt label="Lote" value={d.lote} onChange={v => sD(p => ({ ...p, lote: v }))} />
      <Num label="Cantidad (kg)" value={d.cantidad_kg} onChange={v => sD(p => ({ ...p, cantidad_kg: v }))} />
      <Sel label="Motivo" value={d.motivo} onChange={v => sD(p => ({ ...p, motivo: v }))}
        opts={[
          { v: "vencido", l: "Vencido" }, { v: "peso_nc", l: "Peso NC" },
          { v: "textura", l: "Textura/forma NC" }, { v: "contaminacion", l: "Contaminación" },
          { v: "rotulado", l: "Error rotulado" },
          { v: "recupero_ex", l: "Recupero excedido (integrales)" }, { v: "otro", l: "Otro" },
        ]} />
      <Sel label="Etapa de detección" value={d.etapa_deteccion} onChange={v => sD(p => ({ ...p, etapa_deteccion: v }))}
        opts={[
          { v: "mp", l: "Recepción MP" }, { v: "amasado", l: "Amasado" }, { v: "laminado", l: "Laminado" },
          { v: "cortadora", l: "Cortadora" }, { v: "envasado", l: "Envasado" },
          { v: "pt", l: "Cámara PT" }, { v: "despacho", l: "Despacho" },
        ]} />
      <Sel label="Destino" value={d.destino} onChange={v => sD(p => ({ ...p, destino: v }))}
        opts={[{ v: "destruccion", l: "Destrucción" }, { v: "devolucion", l: "Devolución a proveedor" }, { v: "reproceso", l: "Reproceso" }]} />
      <Fotos fotos={d.fotos} onAdd={f => sD(p => ({ ...p, fotos: [...p.fotos, f] }))} onRemove={id => sD(p => ({ ...p, fotos: p.fotos.filter(f => f.id !== id) }))} />
      <TA label="Observaciones" value={d.observaciones} onChange={v => sD(p => ({ ...p, observaciones: v }))} />
    </>} />
  );
}

// ── FORM LIMPIEZA POES ────────────────────────────────────────────────────
function FLimp({ u, onSave, onCancel }: { u: Usuario; onSave: (r: Reg) => void; onCancel: () => void }) {
  const [d, sD] = useState({ sector: "", superficies_contacto: false, pisos_desagues: false, equipos: false, camaras: false, sanitizante: "", concentracion: "", responsable_limpieza: "", observaciones: "", fotos: [] as FotoMeta[] });
  const [g, sG] = useState(false);
  const pc = [d.superficies_contacto, d.pisos_desagues, d.equipos, d.camaras].filter(Boolean).length * 25;
  async function sv() {
    sG(true);
    onSave({ id: gid("lim"), tipo: "limpieza", turno: u.turno, responsable: u.nombre, fecha: hoy(), hora: ahora(), timestamp: new Date().toISOString(), alertas: { superficies_no_ok: !d.superficies_contacto }, ...d } as RLimp);
    sG(false);
  }
  return (
    <FW titulo="🧹 Limpieza POES" sub="POES/BPM" onCancel={onCancel} onSave={sv} g={g} ch={<>
      <Sel label="Sector" value={d.sector} onChange={v => sD(p => ({ ...p, sector: v }))}
        opts={[
          { v: "amasado", l: "Amasadora" }, { v: "laminado", l: "Laminadora" },
          { v: "cortadora", l: "Cortadora" }, { v: "sobadora", l: "Sobadora" },
          { v: "envasado", l: "Envasado" }, { v: "camara_masas", l: "Cámara de masas" },
          { v: "camara_pt", l: "Cámara PT" }, { v: "sanitarios", l: "Sanitarios" },
        ]} />
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Verificación</div>
        <div className={cn("text-sm font-bold", pc === 100 ? "text-green-600" : "text-amber-600")}>{pc}%</div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Chk label="Superficies en contacto con alimentos (PC)" value={d.superficies_contacto} onChange={v => sD(p => ({ ...p, superficies_contacto: v }))} />
        <Chk label="Pisos y desagües" value={d.pisos_desagues} onChange={v => sD(p => ({ ...p, pisos_desagues: v }))} />
        <Chk label="Equipos (laminadora, cortadora, sobadora, amasadora)" value={d.equipos} onChange={v => sD(p => ({ ...p, equipos: v }))} />
        <Chk label="Cámaras frigoríficas" value={d.camaras} onChange={v => sD(p => ({ ...p, camaras: v }))} />
      </div>
      <Txt label="Sanitizante" value={d.sanitizante} onChange={v => sD(p => ({ ...p, sanitizante: v }))} />
      <Txt label="Concentración" value={d.concentracion} onChange={v => sD(p => ({ ...p, concentracion: v }))} ph="ej: 200 ppm cloro" />
      <Txt label="Responsable limpieza" value={d.responsable_limpieza} onChange={v => sD(p => ({ ...p, responsable_limpieza: v }))} />
      <Fotos fotos={d.fotos} onAdd={f => sD(p => ({ ...p, fotos: [...p.fotos, f] }))} onRemove={id => sD(p => ({ ...p, fotos: p.fotos.filter(f => f.id !== id) }))} />
      <TA label="Observaciones" value={d.observaciones} onChange={v => sD(p => ({ ...p, observaciones: v }))} />
    </>} />
  );
}

// ── BD PROVEEDORES ────────────────────────────────────────────────────────
function BDProveedores({ onBack }: { onBack: () => void }) {
  const [provs, setProvs] = useState<Proveedor[]>([]);
  const [modo, setModo] = useState<"lista" | "nuevo">("lista");
  const [np, setNp] = useState({ id: "", nombre: "", cuit: "", contacto: "", productos: "", activo: true });
  const [cg, setCg] = useState(false);
  useEffect(() => { setCg(true); loadProveedores().then(p => { setProvs(p); setCg(false); }); }, []);
  async function guardar() {
    const p: Proveedor = { ...np, id: np.id || gid("prov") };
    await saveProveedor(p);
    setProvs(prev => [p, ...prev.filter(x => x.id !== p.id)]);
    setModo("lista");
    setNp({ id: "", nombre: "", cuit: "", contacto: "", productos: "", activo: true });
  }
  async function eliminar(id: string) { await deleteProveedor(id); setProvs(p => p.filter(x => x.id !== id)); }
  if (modo === "nuevo") return (
    <div className="min-h-screen bg-gray-50 max-w-lg mx-auto pb-24">
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-3 flex items-center gap-3">
        <button onClick={() => setModo("lista")} className="text-gray-400 p-1">←</button>
        <p className="font-bold text-gray-800">Nuevo proveedor</p>
      </div>
      <div className="p-4 flex flex-col gap-3">
        <Txt label="Nombre" value={np.nombre} onChange={v => setNp(p => ({ ...p, nombre: v }))} ph="Razón social" />
        <Txt label="CUIT" value={np.cuit} onChange={v => setNp(p => ({ ...p, cuit: v }))} ph="XX-XXXXXXXX-X" />
        <Txt label="Contacto" value={np.contacto} onChange={v => setNp(p => ({ ...p, contacto: v }))} ph="Tel / email" />
        <TA label="Productos habituales" value={np.productos} onChange={v => setNp(p => ({ ...p, productos: v }))} ph="Harina 0000, Margarina Tapera, Grasa…" />
        <button onClick={guardar} className="h-11 rounded-xl bg-blue-500 text-white font-semibold text-sm">Guardar proveedor</button>
      </div>
    </div>
  );
  return (
    <div className="min-h-screen bg-gray-50 max-w-lg mx-auto pb-24">
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-gray-400 p-1">←</button>
          <p className="font-bold text-gray-800">BD Proveedores</p>
        </div>
        <button onClick={() => setModo("nuevo")} className="text-xs bg-blue-500 text-white px-3 py-1.5 rounded-lg font-medium">+ Nuevo</button>
      </div>
      <div className="p-4 flex flex-col gap-2">
        {cg ? <div className="flex justify-center p-8"><Spin /></div>
          : provs.length === 0 ? <div className="text-center p-8 text-gray-400 text-sm">Sin proveedores registrados</div>
            : provs.map(p => (
              <div key={p.id} className="bg-white border border-gray-200 rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{p.nombre}</p>
                    <p className="text-xs text-gray-400 mt-0.5">CUIT: {p.cuit}</p>
                    {p.productos && <p className="text-xs text-gray-500 mt-1">Productos: {p.productos}</p>}
                  </div>
                  <button onClick={() => eliminar(p.id)} className="text-[10px] text-red-400 hover:text-red-600 flex-shrink-0 mt-0.5">Eliminar</button>
                </div>
              </div>
            ))}
      </div>
    </div>
  );
}

// ── TRAZABILIDAD AMASIJOS ─────────────────────────────────────────────────
const ETAPAS_LABEL: Record<string, string> = {
  amasado: "🫱 Amasado → Cámara",
  laminado: "📋 Laminado",
  cortadora: "✂️ Cortadora",
  envasado: "📦 Envasado",
};
function BTrazAmasijos({ semDias, onBack }: { semDias: DiaI[]; onBack: () => void }) {
  const [ams, setAms] = useState<TrazAmasijo[]>([]);
  const [cg, setCg] = useState(false);
  const [exp, setExp] = useState<string | null>(null);
  const [busq, sBusq] = useState("");
  const fechas = semDias.filter(d => d.fecha).map(d => d.fecha).sort();
  const desde = fechas[0] || ""; const hasta = fechas[fechas.length - 1] || "";
  useEffect(() => {
    if (!desde) return;
    setCg(true);
    loadTrazAmasijosSemana(desde, hasta).then(c => { setAms(c); setCg(false); });
  }, [desde]);
  const filtrados = ams.filter(c => {
    const q = busq.toLowerCase();
    return !q || c.num_tacho.toLowerCase().includes(q) || c.variedad?.toLowerCase().includes(q) || c.lote_amasijo?.toLowerCase().includes(q);
  });
  return (
    <div className="min-h-screen bg-gray-50 max-w-lg mx-auto pb-24">
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-3 sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack} className="text-gray-400 p-1 text-lg">←</button>
          <div className="flex-1">
            <p className="text-base font-bold text-gray-800">🚛 Trazabilidad de Amasijos</p>
            <p className="text-xs text-gray-400">{desde ? `${fd(desde)} — ${fd(hasta)}` : ""} · {ams.length} amasijos</p>
          </div>
          {cg && <Spin />}
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input value={busq} onChange={e => sBusq(e.target.value)} placeholder="Buscar N° tacho, variedad, lote…"
            className="w-full h-10 rounded-xl border border-gray-200 pl-8 pr-3 text-sm bg-white" />
          {busq && <button onClick={() => sBusq("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">✕</button>}
        </div>
      </div>
      <div className="p-4 flex flex-col gap-3">
        {filtrados.length === 0
          ? <div className="text-center py-12 text-gray-400"><div className="text-3xl mb-2">🚛</div><p className="text-sm">Sin amasijos registrados</p></div>
          : filtrados.map(c => {
            const isExp = exp === c.num_tacho;
            return (
              <div key={c.num_tacho} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <div className="p-3 flex items-center justify-between cursor-pointer" onClick={() => setExp(isExp ? null : c.num_tacho)}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 font-bold text-sm flex items-center justify-center">{c.num_tacho}</div>
                    <div>
                      <div className="text-sm font-semibold text-gray-800">
                        {c.variedad === "criollas" ? "🫓" : c.variedad === "integrales" ? "🌾" : "🟡"} {PARAMS[c.variedad as keyof typeof PARAMS]?.label || c.variedad} · {c.lote_amasijo}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {c.etapas.length} etapas · {c.ultimo_update ? new Date(c.ultimo_update).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-0.5">
                      {(["amasado", "laminado", "cortadora", "envasado"] as const).map(e => (
                        <div key={e} className={cn("w-2 h-2 rounded-full", c.etapas.some(x => x.etapa === e) ? "bg-green-500" : "bg-gray-200")} />
                      ))}
                    </div>
                    <span className="text-gray-400 text-xs">{isExp ? "▲" : "▼"}</span>
                  </div>
                </div>
                {isExp && (
                  <div className="border-t border-gray-100 p-3 flex flex-col gap-2">
                    {c.etapas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora)).map((e, i) => (
                      <div key={i} className="bg-gray-50 rounded-xl p-2.5">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-semibold text-gray-700">{ETAPAS_LABEL[e.etapa] || e.etapa}</span>
                          <span className="text-[10px] text-gray-400">{fd(e.fecha)} {e.hora} · {e.turno} · {e.operario}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-gray-600">
                          {Object.entries(e.datos).filter(([, v]) => v).map(([k, v]) => (
                            <span key={k}><b>{k.replace(/_/g, " ")}</b>: {v}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

// ── AUDITORÍA INTERNA ─────────────────────────────────────────────────────
const SECTORES_AUDIT = [
  { k: "pct_recepcion",  l: "Recepción MP" },
  { k: "pct_amasado",    l: "Amasado" },
  { k: "pct_laminado",   l: "Laminado" },
  { k: "pct_cortadora",  l: "Cortadora" },
  { k: "pct_envasado",   l: "Envasado" },
  { k: "pct_camara_pt",  l: "Cámara PT" },
  { k: "pct_bpm",        l: "BPM Personal" },
  { k: "pct_limpieza",   l: "Limpieza POES" },
] as const;

function FAuditoria({ u, onSave, onCancel }: { u: Usuario; onSave: (a: RAuditoria) => void; onCancel: () => void }) {
  const [d, sD] = useState<Record<string, string>>(Object.fromEntries(SECTORES_AUDIT.map(s => [s.k, ""])));
  const [obs, sObs] = useState(""); const [acc, sAcc] = useState(""); const [g, sG] = useState(false);
  const vals = SECTORES_AUDIT.map(s => parseFloat(d[s.k])).filter(v => !isNaN(v) && v >= 0 && v <= 100);
  const total = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  const colorTotal = total >= 90 ? "text-green-600" : total >= 70 ? "text-amber-600" : "text-red-600";
  const bgTotal = total >= 90 ? "bg-green-50 border-green-300" : total >= 70 ? "bg-amber-50 border-amber-300" : "bg-red-50 border-red-300";
  async function sv() {
    sG(true);
    const a: RAuditoria = {
      id: gid("aud"), fecha: hoy(), hora: ahora(), responsable: u.nombre, turno: u.turno,
      ...Object.fromEntries(SECTORES_AUDIT.map(s => [s.k, d[s.k]])) as unknown as RAuditoria,
      pct_total: total, observaciones: obs, acciones: acc,
    };
    await saveAuditoria(a);
    onSave(a);
    sG(false);
  }
  return (
    <FW titulo="📋 Auditoría Interna" sub="% cumplimiento por sector" onCancel={onCancel} onSave={sv} g={g} ch={<>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">Ingresá el % de cumplimiento (0–100) para cada sector. Se calcula el promedio automáticamente.</div>
      {total > 0 && (
        <div className={cn("rounded-2xl border p-4 text-center", bgTotal)}>
          <div className="text-xs text-gray-500 mb-1">Valor de Auditoría</div>
          <div className={cn("text-4xl font-bold", colorTotal)}>{total}%</div>
          <div className="text-xs mt-1">{total >= 90 ? "✓ Excelente" : total >= 70 ? "⚠ Requiere mejoras" : "🔴 Crítico — acción inmediata"}</div>
          <div className="h-3 bg-gray-200 rounded-full mt-2 overflow-hidden">
            <div className={cn("h-full rounded-full", total >= 90 ? "bg-green-500" : total >= 70 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${total}%` }} />
          </div>
        </div>
      )}
      <div className="flex flex-col gap-3">
        {SECTORES_AUDIT.map(s => {
          const v = parseFloat(d[s.k]);
          const ok = !isNaN(v) && v >= 0 && v <= 100;
          const color = ok ? (v >= 90 ? "text-green-600" : v >= 70 ? "text-amber-600" : "text-red-600") : "text-gray-400";
          return (
            <div key={s.k} className="flex items-center gap-3">
              <label className="text-sm text-gray-700 w-32 flex-shrink-0">{s.l}</label>
              <div className="flex-1 relative">
                <input type="number" min="0" max="100" inputMode="decimal" value={d[s.k]}
                  onChange={e => sD(p => ({ ...p, [s.k]: e.target.value }))} placeholder="0–100"
                  className="w-full h-10 rounded-lg border border-gray-200 px-3 pr-8 text-sm font-mono" />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
              </div>
              {ok && <div className={cn("text-sm font-bold w-12 text-right", color)}>{v}%</div>}
              {ok && <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden"><div className={cn("h-full rounded-full", v >= 90 ? "bg-green-500" : v >= 70 ? "bg-amber-400" : "bg-red-500")} style={{ width: `${v}%` }} /></div>}
            </div>
          );
        })}
      </div>
      <TA label="Observaciones" value={obs} onChange={sObs} ph="Hallazgos, desvíos, observaciones…" />
      <TA label="Acciones requeridas" value={acc} onChange={sAcc} ph="Plan de acción, responsables, fechas…" />
    </>} />
  );
}

// ── KPI AUDITORÍAS ────────────────────────────────────────────────────────
function KPIAuditoria({ auditorias }: { auditorias: RAuditoria[] }) {
  if (!auditorias.length) return null;
  const data = auditorias.slice(0, 8).reverse().map(a => ({ fecha: fd(a.fecha), pct: a.pct_total }));
  const ult = auditorias[0];
  const color = ult.pct_total >= 90 ? "text-green-600" : ult.pct_total >= 70 ? "text-amber-600" : "text-red-600";
  const bg = ult.pct_total >= 90 ? "bg-green-50 border-green-300" : ult.pct_total >= 70 ? "bg-amber-50 border-amber-300" : "bg-red-50 border-red-300";
  return (
    <div className={cn("rounded-2xl border p-4", bg)}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs font-bold text-gray-600 uppercase tracking-wide">📋 Auditoría Interna</div>
          <div className="text-[10px] text-gray-400">{fd(ult.fecha)} · {ult.responsable}</div>
        </div>
        <div className={cn("text-3xl font-bold", color)}>{ult.pct_total}%</div>
      </div>
      {data.length > 1 && (
        <ResponsiveContainer width="100%" height={70}>
          <BarChart data={data} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
            <XAxis dataKey="fecha" tick={{ fontSize: 8 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 8 }} />
            <Tooltip formatter={(v) => `${v}%`} />
            <Bar dataKey="pct" fill={ult.pct_total >= 90 ? "#22c55e" : ult.pct_total >= 70 ? "#f59e0b" : "#ef4444"} radius={[3, 3, 0, 0]} name="Auditoría %" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── CARD REGISTRO ─────────────────────────────────────────────────────────
function RegCard({ r, onDelete, isC, nota, onNota }: { r: Reg; onDelete?: () => void; isC: boolean; nota: string; onNota: (v: string) => void }) {
  const [exp, sE] = useState(false);
  const al = cAl(r.alertas);
  const mod = MODS.find(m => m.id === r.tipo);
  function det() {
    if (r.tipo === "temperaturas") {
      const rt = r as RTemp;
      return (
        <div className="text-xs mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5">
          {rt.t_camara_masas && <span>Cám.masas: <b>{rt.t_camara_masas}°C</b></span>}
          {rt.t_ambiente && <span>Ambiente: <b>{rt.t_ambiente}°C</b></span>}
          {rt.t_camara_pt && <span>Cám.PT: <b>{rt.t_camara_pt}°C</b></span>}
        </div>
      );
    }
    if (r.tipo === "tapas") {
      const tp = r as RTapas;
      const pp = PARAMS[tp.variedad as keyof typeof PARAMS];
      return (
        <div className="text-xs mt-2">
          <div className="font-semibold text-amber-700">{pp?.label || tp.variedad} — Lote: {tp.lote_amasijo}</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1">
            {tp.prom_peso > 0 && <span>Prom.peso: <b className={Math.abs(tp.prom_peso - (pp?.pesoTapa || 48)) > (pp?.pesoTol || 2) ? "text-red-600" : ""}>{tp.prom_peso}g</b></span>}
            {tp.t_masa_salida && <span>T° masa: <b>{tp.t_masa_salida}°C</b></span>}
            {tp.t_agua_chiller && <span>T° agua: <b>{tp.t_agua_chiller}°C</b></span>}
            {tp.recupero_cajones && <span>Recupero: <b>{tp.recupero_cajones} cajones</b></span>}
          </div>
        </div>
      );
    }
    if (r.tipo === "bpm") {
      const b = r as RBPM;
      return (
        <div className="text-xs mt-2">
          <p className="text-red-700 font-medium">Operario: {b.operario} | Sector: {b.sector}</p>
          <p className="text-gray-600">{b.incumplimientos.join(", ")}</p>
          {b.accion_tomada && <p className="text-green-700 mt-0.5">Acción: {b.accion_tomada}</p>}
        </div>
      );
    }
    if (r.tipo === "recepcion") {
      const rc = r as RRecep;
      return <div className="text-xs mt-2"><p>{rc.proveedor_nombre} — {rc.producto}</p><p>T°: {rc.t_ingreso}°C · Lote: {rc.remito_lote} · <b>{rc.resultado}</b></p></div>;
    }
    if (r.tipo === "nc") {
      const nc = r as RNC;
      return <div className="text-xs mt-2"><p className="font-medium text-amber-700">{nc.tipo_nc?.toUpperCase()}</p><p>{nc.descripcion}</p>{nc.accion_inmediata && <p className="text-green-700">Acción: {nc.accion_inmediata}</p>}</div>;
    }
    return null;
  }
  return (
    <div className={cn("bg-white rounded-xl border p-3", al > 0 ? "border-red-200" : "border-gray-200")}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-base flex-shrink-0">{mod?.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-semibold text-gray-800">{mod?.label}</span>
              {al > 0 && <ABadge n={al} />}
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">{r.hora} · {r.turno} · {r.responsable}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={() => sE(!exp)} className="text-[10px] text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">{exp ? "▲" : "▼"}</button>
          {isC && onDelete && <button onClick={onDelete} className="text-[10px] text-red-400 border border-red-200 rounded px-1.5 py-0.5">✕</button>}
        </div>
      </div>
      {exp && <>
        <div className="mt-2">{det()}</div>
        {isC && <div className="mt-2"><input value={nota} onChange={e => onNota(e.target.value)} placeholder="Nota calidad…" className="w-full h-8 rounded-lg border border-gray-200 px-2 text-xs bg-gray-50" /></div>}
      </>}
    </div>
  );
}

// ── PANEL RESUMEN ─────────────────────────────────────────────────────────
function ResumenPanel({
  registros, titulo, isCalidad, notas, onNota, eliminados, onElim, onRestore,
}: {
  registros: Reg[]; titulo: string; isCalidad: boolean;
  notas: Record<string, string>; onNota: (id: string, v: string) => void;
  eliminados: Set<string>; onElim: (id: string) => void; onRestore: (id: string) => void;
}) {
  const vis = registros.filter(r => !eliminados.has(r.id));
  const k = kpis(vis); const als = extraerAlertas(vis); const rein = calcReincidencias(vis);
  function exportar() { dlTxt(buildTxt(registros, titulo, notas, eliminados), `CV_Tapas_${titulo.replace(/\s/g, "_")}.txt`); }
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-2">
        {[
          { l: "Registros", v: k.total, c: "gray" },
          { l: "Alertas", v: k.alertas, c: "red" },
          { l: "NC", v: k.nc, c: "amber" },
          { l: "Tapas", v: k.tapas, c: "green" },
        ].map(({ l, v, c }) => (
          <div key={l} className={cn("rounded-xl p-2.5 text-center border", c === "red" && v > 0 ? "bg-red-50 border-red-200" : "bg-white border-gray-200")}>
            <div className={cn("text-xl font-bold", c === "red" && v > 0 ? "text-red-600" : "text-gray-800")}>{v}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">{l}</div>
          </div>
        ))}
      </div>
      {als.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
          <div className="text-xs font-bold text-red-700 mb-2">⚠ Alertas ({als.length})</div>
          {als.map((a, i) => <div key={i} className="text-xs text-red-600 py-0.5 border-b border-red-100 last:border-0">[{a.registro.hora}] {a.tipo} — Límite: {a.limite}</div>)}
        </div>
      )}
      {rein.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <div className="text-xs font-bold text-amber-700 mb-2">🔁 Reincidencias</div>
          {rein.map((r, i) => <div key={i} className={cn("text-xs py-0.5", r.critico ? "text-red-700 font-bold" : "text-amber-700")}>{r.critico ? "🔴" : "🟡"} {r.tipo}: {r.count} veces</div>)}
        </div>
      )}
      <div className="flex flex-col gap-2">
        {vis.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).map(r => (
          <RegCard key={r.id} r={r} isC={isCalidad} onDelete={isCalidad ? () => onElim(r.id) : undefined} nota={notas[r.id] || ""} onNota={v => onNota(r.id, v)} />
        ))}
      </div>
      {eliminados.size > 0 && isCalidad && (
        <div className="mt-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
          <div className="text-xs text-gray-500 mb-2">Eliminados de este reporte ({eliminados.size})</div>
          {[...eliminados].map(id => {
            const r = registros.find(x => x.id === id); if (!r) return null;
            const m = MODS.find(x => x.id === r.tipo);
            return <button key={id} onClick={() => onRestore(id)} className="text-xs text-blue-500 underline mr-2">{m?.icon} {r.hora} restaurar</button>;
          })}
        </div>
      )}
      <button onClick={exportar} className="h-10 rounded-xl border border-gray-300 text-sm text-gray-600 font-medium flex items-center justify-center gap-2">📄 Exportar reporte TXT</button>
    </div>
  );
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────
function Dash({ registros, label }: { registros: Reg[]; label: string }) {
  const k = kpis(registros);
  const tapData = registros.filter(r => r.tipo === "tapas").map(r => r as RTapas)
    .filter(r => r.prom_peso > 0).map(r => ({
      hora: r.hora, peso: r.prom_peso, variedad: r.variedad,
      ok: Math.abs(r.prom_peso - (PARAMS[r.variedad as keyof typeof PARAMS]?.pesoTapa || 48)) <= (PARAMS[r.variedad as keyof typeof PARAMS]?.pesoTol || 2),
    }));
  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="grid grid-cols-2 gap-2">
        {[
          { l: "Controles tapas", v: k.tapas, ic: "🫓" },
          { l: "BPM incidencias", v: k.bpm_inc, ic: "👤" },
          { l: "NC generadas", v: k.nc, ic: "⚠️" },
          { l: "Alertas totales", v: k.alertas, ic: "🔴" },
        ].map(({ l, v, ic }) => (
          <div key={l} className="bg-white rounded-2xl border border-gray-200 p-3 flex flex-col gap-1">
            <div className="text-xl">{ic}</div>
            <div className="text-2xl font-bold text-gray-800">{v}</div>
            <div className="text-[10px] text-gray-400">{l}</div>
          </div>
        ))}
      </div>
      {tapData.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">⚖️ Pesos de tapas (g)</div>
          <ResponsiveContainer width="100%" height={80}>
            <BarChart data={tapData} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
              <XAxis dataKey="hora" tick={{ fontSize: 8 }} />
              <YAxis domain={[18, 55]} tick={{ fontSize: 8 }} />
              <Tooltip formatter={(v) => `${v}g`} />
              <Bar dataKey="peso" fill="#f59e0b" radius={[3, 3, 0, 0]} name="Peso (g)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── VISTA DÍA ─────────────────────────────────────────────────────────────
function VDia({ u, mes, sem, dia, onBack }: { u: Usuario; mes: MesI; sem: SemI; dia: DiaI; onBack: () => void }) {
  const [registros, sR] = useState<Reg[]>([]);
  const [form, sF] = useState<Tipo | "auditoria" | null>(null);
  const [cg, sCg] = useState(false);
  const [notas, sNotas] = useState<Record<string, string>>({});
  const [elim, sElim] = useState<Set<string>>(new Set());
  const [vista, sV] = useState<"registros" | "resumen">("registros");
  const [traz, sTraz] = useState(false);
  const [auditorias, sAud] = useState<RAuditoria[]>([]);
  const isC = u.rol === "calidad";
  async function load() { sCg(true); const rs = await loadDia(mes.id, sem.semana, dia.fecha); sR(rs); sCg(false); }
  useEffect(() => { load(); loadAuditorias(dia.fecha, dia.fecha).then(sAud); }, [dia.fecha]);
  async function save(r: Reg) { await saveReg(mes.id, sem.semana, dia.fecha, r); await load(); }
  async function del(id: string) { if (!isC) return; await deleteReg(mes.id, sem.semana, dia.fecha, id); sR(p => p.filter(r => r.id !== id)); }
  if (traz) return <BTrazAmasijos semDias={sem.dias} onBack={() => sTraz(false)} />;
  if (form === "temperaturas") return <FTemp u={u} onSave={async r => { await save(r); sF(null); }} onCancel={() => sF(null)} />;
  if (form === "tapas") return <FTapas u={u} onSave={async r => { await save(r); sF(null); }} onCancel={() => sF(null)} />;
  if (form === "bpm") return <FBPM u={u} onSave={async r => { await save(r); sF(null); }} onCancel={() => sF(null)} />;
  if (form === "recepcion") return <FRecep u={u} onSave={async r => { await save(r); sF(null); }} onCancel={() => sF(null)} />;
  if (form === "despacho") return <FDesp u={u} onSave={async r => { await save(r); sF(null); }} onCancel={() => sF(null)} />;
  if (form === "nc") return <FNC u={u} onSave={async r => { await save(r); sF(null); }} onCancel={() => sF(null)} />;
  if (form === "decomiso") return <FDecom u={u} onSave={async r => { await save(r); sF(null); }} onCancel={() => sF(null)} />;
  if (form === "limpieza") return <FLimp u={u} onSave={async r => { await save(r); sF(null); }} onCancel={() => sF(null)} />;
  if (form === "auditoria") return <FAuditoria u={u} onSave={async a => { sAud(p => [a, ...p.filter(x => x.id !== a.id)]); sF(null); }} onCancel={() => sF(null)} />;
  const k = kpis(registros.filter(r => !elim.has(r.id)));
  return (
    <div className="min-h-screen bg-gray-50 max-w-lg mx-auto pb-28">
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-3 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-gray-400 p-1">←</button>
          <div className="flex-1">
            <p className="text-xs text-gray-400">{mes.label} · Sem {sem.semana}</p>
            <p className="text-base font-bold text-gray-800">{fd(dia.fecha)}</p>
          </div>
          {cg && <Spin />}
          {k.alertas > 0 && <ABadge n={k.alertas} />}
        </div>
        <div className="flex gap-1 mt-2 bg-gray-100 rounded-xl p-1">
          {([{ k: "registros", l: "Registros" }, { k: "resumen", l: "Resumen" }] as const).map(x => (
            <button key={x.k} onClick={() => sV(x.k)}
              className={cn("flex-1 text-xs font-medium py-1.5 rounded-lg", vista === x.k ? "bg-white text-gray-800 shadow-sm" : "text-gray-500")}>
              {x.l}
            </button>
          ))}
        </div>
      </div>
      {vista === "registros" && (
        <div className="p-4">
          <div className="grid grid-cols-2 gap-2 mb-4">
            {[
              { id: "tapas" as Tipo, l: "Control Tapas", ic: "🫓", col: "bg-amber-500" },
              { id: "temperaturas" as Tipo, l: "Temperaturas", ic: "🌡️", col: "bg-blue-500" },
              { id: "recepcion" as Tipo, l: "Recepción MP", ic: "🚚", col: "bg-green-500" },
              { id: "despacho" as Tipo, l: "Despacho", ic: "📦", col: "bg-teal-500" },
              { id: "bpm" as Tipo, l: "BPM NC", ic: "👤", col: "bg-orange-500" },
              { id: "nc" as Tipo, l: "No Conformidad", ic: "⚠️", col: "bg-red-500" },
              { id: "decomiso" as Tipo, l: "Decomiso", ic: "🗑️", col: "bg-gray-600" },
              { id: "limpieza" as Tipo, l: "Limpieza POES", ic: "🧹", col: "bg-purple-500" },
            ].map(x => (
              <button key={x.id} onClick={() => sF(x.id)}
                className={cn("h-14 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2", x.col)}>
                <span>{x.ic}</span><span>{x.l}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-2 mb-4">
            <button onClick={() => sTraz(true)} className="flex-1 h-10 rounded-xl border border-gray-300 text-xs text-gray-600 font-medium">🚛 Trazabilidad</button>
            {isC && <button onClick={() => sF("auditoria")} className="flex-1 h-10 rounded-xl border border-blue-300 bg-blue-50 text-xs text-blue-700 font-medium">📋 Auditoría</button>}
          </div>
          {auditorias.length > 0 && <div className="mb-4"><KPIAuditoria auditorias={auditorias} /></div>}
          {registros.length === 0
            ? <div className="text-center py-12 text-gray-400"><div className="text-4xl mb-3">🫓</div><p className="text-sm">Sin registros hoy</p><p className="text-xs mt-1">Tocá un formulario para comenzar</p></div>
            : <div className="flex flex-col gap-2">{registros.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).map(r => <RegCard key={r.id} r={r} isC={isC} onDelete={() => del(r.id)} nota={notas[r.id] || ""} onNota={v => sNotas(p => ({ ...p, [r.id]: v }))} />)}</div>}
        </div>
      )}
      {vista === "resumen" && (
        <div className="px-4 pt-4">
          <ResumenPanel registros={registros} titulo={`${fd(dia.fecha)}`} isCalidad={isC} notas={notas} onNota={(id, v) => sNotas(p => ({ ...p, [id]: v }))} eliminados={elim} onElim={id => sElim(p => new Set([...p, id]))} onRestore={id => sElim(p => { const n = new Set(p); n.delete(id); return n; })} />
        </div>
      )}
    </div>
  );
}

// ── VISTA SEMANA ──────────────────────────────────────────────────────────
function VSem({ u, mes, sem, onBack }: { u: Usuario; mes: MesI; sem: SemI; onBack: () => void }) {
  const [dia, sDia] = useState<DiaI | null>(null);
  const [vista, sV] = useState<"dias" | "resumen" | "dashboard">("dias");
  const [allRegs, sAll] = useState<Reg[]>([]);
  const [cg, sCg] = useState(false);
  const [notas, sNotas] = useState<Record<string, string>>({});
  const [elim, sElim] = useState<Set<string>>(new Set());
  const HOY = hoy();
  useEffect(() => {
    (async () => {
      sCg(true); const rs: Reg[] = [];
      for (const d of sem.dias) { if (!d.fecha || d.fecha > HOY) continue; const dr = await loadDia(mes.id, sem.semana, d.fecha); rs.push(...dr); }
      sAll(rs); sCg(false);
    })();
  }, []);
  if (dia) return <VDia u={u} mes={mes} sem={sem} dia={dia} onBack={() => sDia(null)} />;
  return (
    <div className="min-h-screen bg-gray-50 max-w-lg mx-auto pb-20">
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-3 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-gray-400 p-1">←</button>
          <div><p className="text-xs text-gray-400">{mes.label}</p><p className="text-base font-bold text-gray-800">Semana {sem.semana}</p></div>
          {cg && <Spin />}
        </div>
        <div className="flex gap-1 mt-2 bg-gray-100 rounded-xl p-1">
          {([{ k: "dias", l: "Días" }, { k: "resumen", l: "Resumen" }, { k: "dashboard", l: "Dashboard" }] as const).map(x => (
            <button key={x.k} onClick={() => sV(x.k)}
              className={cn("flex-1 text-xs font-medium py-1.5 rounded-lg", vista === x.k ? "bg-white text-gray-800 shadow-sm" : "text-gray-500")}>
              {x.l}
            </button>
          ))}
        </div>
      </div>
      {vista === "dias" && (
        <div className="p-4">
          <div className="grid grid-cols-7 gap-1 mb-2">{DN.map(d => <div key={d} className="text-center text-[10px] font-semibold text-gray-400 py-1">{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {sem.dias.map((d, i) => {
              if (d.dayOfMonth === -1) return <div key={i} />;
              const eH = d.fecha === HOY; const eF = d.fecha > HOY;
              return (
                <button key={i} onClick={() => !eF && sDia(d)} disabled={eF}
                  className={cn("aspect-square rounded-xl flex flex-col items-center justify-center text-sm font-semibold border",
                    eH ? "bg-blue-500 text-white border-blue-500 shadow-sm" : eF ? "bg-gray-50 text-gray-300 border-gray-100 cursor-default" : "bg-white text-gray-700 border-gray-200 hover:border-blue-400")}>
                  {d.dayOfMonth}{eH && <span className="text-[8px] opacity-80">hoy</span>}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-400 text-center mt-4">Tocá un día para ver o cargar registros</p>
        </div>
      )}
      {vista === "resumen" && (
        <div className="px-4 pt-4">
          <ResumenPanel registros={allRegs} titulo={`${mes.label} · Sem ${sem.semana}`} isCalidad={u.rol === "calidad"} notas={notas} onNota={(id, v) => sNotas(p => ({ ...p, [id]: v }))} eliminados={elim} onElim={id => sElim(p => new Set([...p, id]))} onRestore={id => sElim(p => { const n = new Set(p); n.delete(id); return n; })} />
        </div>
      )}
      {vista === "dashboard" && <Dash registros={allRegs} label={`${mes.label} · Sem ${sem.semana}`} />}
    </div>
  );
}

// ── VISTA MES ─────────────────────────────────────────────────────────────
function VMes({ u, mes, onBack }: { u: Usuario; mes: MesI; onBack: () => void }) {
  const [sem, sSem] = useState<SemI | null>(null);
  const [vista, sV] = useState<"semanas" | "resumen" | "dashboard">("semanas");
  const [allRegs, sAll] = useState<Reg[]>([]);
  const [cg, sCg] = useState(false);
  const [notas, sNotas] = useState<Record<string, string>>({});
  const [elim, sElim] = useState<Set<string>>(new Set());
  const [prov, sProv] = useState(false);
  const HOY = hoy();
  useEffect(() => {
    (async () => {
      sCg(true); const rs: Reg[] = [];
      for (const s of mes.semanas) for (const d of s.dias) {
        if (!d.fecha || d.fecha > HOY) continue;
        const dr = await loadDia(mes.id, s.semana, d.fecha); rs.push(...dr);
      }
      sAll(rs); sCg(false);
    })();
  }, []);
  if (sem) return <VSem u={u} mes={mes} sem={sem} onBack={() => sSem(null)} />;
  if (prov) return <BDProveedores onBack={() => sProv(false)} />;
  return (
    <div className="min-h-screen bg-gray-50 max-w-lg mx-auto pb-20">
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-3 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-gray-400 p-1">←</button>
          <p className="text-base font-bold text-gray-800 flex-1">{mes.label}</p>
          {cg && <Spin />}
        </div>
        <div className="flex gap-1 mt-2 bg-gray-100 rounded-xl p-1">
          {([{ k: "semanas", l: "Semanas" }, { k: "resumen", l: "Resumen" }, { k: "dashboard", l: "Dashboard" }] as const).map(x => (
            <button key={x.k} onClick={() => sV(x.k)}
              className={cn("flex-1 text-xs font-medium py-1.5 rounded-lg", vista === x.k ? "bg-white text-gray-800 shadow-sm" : "text-gray-500")}>
              {x.l}
            </button>
          ))}
        </div>
      </div>
      {vista === "semanas" && (
        <div className="p-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
            <div className="grid grid-cols-7 gap-1 mb-2">{DN.map(d => <div key={d} className="text-center text-[10px] font-semibold text-gray-400">{d}</div>)}</div>
            {mes.semanas.map(s => (
              <div key={s.semana} className="grid grid-cols-7 gap-1 mb-1">
                {s.dias.map((d, i) => {
                  if (d.dayOfMonth === -1) return <div key={i} />;
                  const eH = d.fecha === HOY; const eF = d.fecha > HOY;
                  return (
                    <div key={i} onClick={() => !eF && sSem(s)}
                      className={cn("aspect-square rounded-lg flex items-center justify-center text-xs cursor-pointer",
                        eH ? "bg-blue-500 text-white font-bold" : eF ? "text-gray-300" : "text-gray-700 hover:bg-blue-50 font-medium")}>
                      {d.dayOfMonth}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 mb-4">
            {mes.semanas.map(s => {
              const p = s.dias.find(d => d.dayOfMonth > 0);
              const ul = [...s.dias].reverse().find(d => d.dayOfMonth > 0);
              const eH = s.dias.some(d => d.fecha === HOY);
              const eF = p && p.fecha > HOY;
              return (
                <button key={s.semana} onClick={() => !eF && sSem(s)} disabled={!!eF}
                  className={cn("bg-white rounded-xl border p-4 text-left flex items-center gap-3",
                    eH ? "border-blue-400 bg-blue-50" : eF ? "border-gray-100 opacity-50 cursor-default" : "border-gray-200 hover:border-blue-300")}>
                  <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0", eH ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-600")}>{s.semana}</div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800">Semana {s.semana}</p>
                    <p className="text-xs text-gray-400">{fd(p?.fecha || "")} — {fd(ul?.fecha || "")}</p>
                  </div>
                  {eH && <Badge t="Esta semana" c="blue" />}
                </button>
              );
            })}
          </div>
          {u.rol === "calidad" && <button onClick={() => sProv(true)} className="w-full h-10 rounded-xl border border-gray-300 text-xs text-gray-600 font-medium">📋 BD Proveedores</button>}
        </div>
      )}
      {vista === "resumen" && (
        <div className="px-4 pt-4">
          <ResumenPanel registros={allRegs} titulo={mes.label} isCalidad={u.rol === "calidad"} notas={notas} onNota={(id, v) => sNotas(p => ({ ...p, [id]: v }))} eliminados={elim} onElim={id => sElim(p => new Set([...p, id]))} onRestore={id => sElim(p => { const n = new Set(p); n.delete(id); return n; })} />
        </div>
      )}
      {vista === "dashboard" && <Dash registros={allRegs} label={mes.label} />}
    </div>
  );
}

// ── HOME ──────────────────────────────────────────────────────────────────
function Home({ u, onLogout }: { u: Usuario; onLogout: () => void }) {
  const [anio, sAnio] = useState<2026 | 2027>(2026);
  const [mes, sMes] = useState<MesI | null>(null);
  const HOY = hoy();
  useEffect(() => {
    const [y, m] = HOY.split("-");
    sAnio(parseInt(y) as 2026 | 2027);
    const ma = CAL.find(x => x.anio === parseInt(y) && x.mes === parseInt(m) - 1);
    if (ma) sMes(ma);
  }, []);
  if (mes) return <VMes u={u} mes={mes} onBack={() => sMes(null)} />;
  const meses = CAL.filter(m => m.anio === anio);
  return (
    <div className="min-h-screen bg-gray-50 max-w-lg mx-auto pb-24">
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400">Sabores Express · Control Tapas</p>
            <p className="text-base font-bold text-gray-800">{u.nombre}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className={cn("text-xs font-semibold px-2 py-1 rounded-full",
              u.turno === "TM" ? "bg-amber-100 text-amber-700" : u.turno === "TT" ? "bg-blue-100 text-blue-700" : "bg-indigo-100 text-indigo-700")}>
              {TURNOS.find(t => t.id === u.turno)?.label}
            </div>
            <button onClick={onLogout} className="text-xs text-gray-400 hover:text-gray-600">Salir</button>
          </div>
        </div>
        <div className="flex gap-1 mt-3 text-xs text-gray-400 flex-wrap">
          <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">🫓 Criollas P251/I500</span>
          <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full">🌾 Integrales P250/I1219</span>
          <span className="bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded-full">🟡 Pastelitos P252/I1217</span>
        </div>
      </div>
      <div className="px-4 pt-4">
        <div className="flex gap-2 mb-4">
          {([2026, 2027] as const).map(a => (
            <button key={a} onClick={() => sAnio(a)}
              className={cn("flex-1 h-10 rounded-xl font-semibold text-sm border", anio === a ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-600 border-gray-200 hover:border-blue-300")}>
              {a}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {meses.map(m => {
            const [y, mo] = HOY.split("-");
            const eA = m.anio === parseInt(y) && m.mes === parseInt(mo) - 1;
            const eP = m.anio < parseInt(y) || (m.anio === parseInt(y) && m.mes < parseInt(mo) - 1);
            const eF = !eA && !eP;
            return (
              <button key={m.id} onClick={() => sMes(m)}
                className={cn("rounded-2xl border p-3 text-left active:scale-95",
                  eA ? "bg-blue-500 border-blue-500 text-white shadow-sm" : eF ? "bg-white border-gray-100 text-gray-300" : "bg-white border-gray-200 text-gray-700 hover:border-blue-300")}>
                <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{eA ? "● Actual" : eP ? "Pasado" : "Próximo"}</p>
                <p className={cn("text-sm font-bold mt-0.5", eA ? "text-white" : "")}>{MN[m.mes].slice(0, 3)}</p>
                <p className={cn("text-xs mt-0.5", eA ? "text-blue-100" : "text-gray-400")}>{m.semanas.length} semanas</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────
export default function ControlVolanteTapas() {
  const [u, sU] = useState<Usuario | null>(null);
  if (!u) return <Login onLogin={sU} />;
  return <Home u={u} onLogout={() => sU(null)} />;
}
