"use client";
// ═══════════════════════════════════════════════════════════════
// CONTROL VOLANTE — SABORES EXPRESS · v8.0
// Proceso unificado P280/P276 — sin duplicación de datos
// Trazabilidad fija de carros (path estable en Firebase)
// KPIs PCC por etapa + KPI Auditoría Interna con gráfico
// ═══════════════════════════════════════════════════════════════
import React,{useState,useEffect,useRef,useCallback}from"react";
import{initializeApp,getApps}from"firebase/app";
import{getFirestore,collection,doc,setDoc,getDocs,query,orderBy,deleteDoc,getDoc}from"firebase/firestore";
import{BarChart,Bar,XAxis,YAxis,Tooltip,ResponsiveContainer,Legend}from"recharts";

// ── FIREBASE ──────────────────────────────────────────────────
const _app=getApps().length===0?initializeApp({apiKey:process.env.NEXT_PUBLIC_FIREBASE_API_KEY,authDomain:process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,projectId:process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,storageBucket:process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,messagingSenderId:process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,appId:process.env.NEXT_PUBLIC_FIREBASE_APP_ID}):getApps()[0];
const db=getFirestore(_app);

// ── TIPOS ─────────────────────────────────────────────────────
type Turno="TM"|"TT"|"TN";
type Rol="calidad"|"control_volante";
type Tipo="temperaturas"|"pesos"|"bpm"|"recepcion"|"despacho"|"nc"|"decomiso"|"limpieza"|"medialunas";
interface Usuario{nombre:string;rol:Rol;turno:Turno;}
interface FotoMeta{id:string;nombre:string;sector:string;timestamp:string;w:number;h:number;}
interface Base{id:string;tipo:Tipo;turno:Turno;responsable:string;fecha:string;hora:string;timestamp:string;alertas:Record<string,boolean>;fotos:FotoMeta[];}

// Temperaturas — Medialunas
interface RTempML extends Base{tipo:"temperaturas";area:"medialunas";
  t_camara_masas:string;t_ambiente:string;t_camara_pt:string;
  agua_chiller_kg:string;hielo_kg:string;t_agua_chiller:string;
  tiempo_amasado:string;num_carro:string;hora_ingreso_camara:string;fecha_ingreso_camara:string;
  // Laminado manual
  num_carro_laminado:string;hora_salida_camara:string;fecha_salida_camara:string;horas_reposo:number;
  hojaldre_ok:boolean;
  // Laminado automático
  calibre_inicio:string;calibre_fin:string;ancho_cm:string;
  // Medialunera
  calibre_medialunera:string;maquinista_12mil:string;maquinista_lam_auto:string;
  // Fermentador
  t_fermentador:string;tiempo_fermentado:string;
  equipo_num:string;observaciones:string;}

// Temperaturas — Panificados
interface RTempPan extends Base{tipo:"temperaturas";area:"panificados";
  t_camara_masas:string;t_ambiente:string;t_camara_pt:string;
  equipo_num:string;observaciones:string;}

type RTemp=RTempML|RTempPan;

// Medialunas (pesos) — integrado en módulo medialunas
interface RMedialunas extends Base{tipo:"medialunas";
  variedad:"manteca"|"grasa"|"";lote_harina:string;
  maquinista_12mil:string;maquinista_lam_auto:string;
  // Amasado
  agua_chiller_kg:string;hielo_kg:string;t_agua_chiller:string;tiempo_amasado:string;
  // Ingreso cámara
  num_carro:string;fecha_ingreso_camara:string;hora_ingreso_camara:string;
  // Laminado manual
  num_carro_laminado:string;fecha_salida_camara:string;hora_salida_camara:string;hojaldre_ok:boolean;
  // Laminado automático
  calibre_inicio:string;calibre_fin:string;ancho_cm:string;
  // Medialunera
  calibre_medialunera:string;
  // 15 muestras: 5 inicio, 5 medio, 5 fin
  muestras_inicio:string[];muestras_medio:string[];muestras_fin:string[];
  prom_inicio:number;prom_medio:number;prom_fin:number;prom_total:number;desvio_pct:number;
  ajustado:string;
  // Fermentador
  t_fermentador:string;humedad_fermentador:string;tiempo_fermentado:string;
  num_carro_fermentador:string;hora_ingreso_fermentador:string;hora_salida_fermentador:string;
  // Abatidor
  t_abatidor:string;t_salida_abatidor:string;tiempo_abatido:string;
  num_carro_abatidor:string;  // conecta con fermentador
  // Envasado
  bandejas_unidades_ok:boolean;etiqueta_vigente:boolean;t_medialunas_envasar:string;obs_envasado:string;
  // Cámara final
  t_camara_final:string;
  // Sensorial
  color_ok:boolean;forma_ok:boolean;textura_ok:boolean;sensorial_obs:string;
  // Recupero
  pct_recupero:string;observaciones:string;}

// BPM — por incumplimiento
interface RBPM extends Base{tipo:"bpm";
  sector:string;operario:string;
  incumplimientos:string[];  // lista de ítems incumplidos
  accion_tomada:string;responsable_sector:string;observaciones:string;}

// Recepción MP
interface RRecep extends Base{tipo:"recepcion";
  proveedor_id:string;proveedor_nombre:string;producto:string;remito_lote:string;
  cantidad_kg:string;vto:string;t_ingreso:string;estado_envase:string;
  rotulado_ok:boolean;fifo_ok:boolean;resultado:string;observaciones:string;}

// Despacho
interface RDesp extends Base{tipo:"despacho";
  local_destino:string;producto:string;lote:string;cantidad:string;
  t_despacho:string;t_transporte:string;etiquetado_ok:boolean;estado_embalaje:string;
  chofer:string;patente:string;observaciones:string;}

// NC, Decomiso, Limpieza (sin cambios)
interface RNC extends Base{tipo:"nc";tipo_nc:string;descripcion:string;lote_afectado:string;causa_raiz:string;accion_inmediata:string;requiere_nc_formal:boolean;responsable_sector:string;}
interface RDecom extends Base{tipo:"decomiso";producto:string;lote:string;cantidad_kg:string;motivo:string;etapa_deteccion:string;destino:string;observaciones:string;}
interface RLimp extends Base{tipo:"limpieza";sector:string;superficies_contacto:boolean;pisos_desagues:boolean;equipos:boolean;camaras:boolean;sanitizante:string;concentracion:string;atp_nivel:string;responsable_limpieza:string;observaciones:string;}
interface RPesos extends Base{tipo:"pesos";producto:string;lote:string;peso_declarado:string;peso_1:string;peso_2:string;peso_3:string;promedio:number;desvio_pct:number;ajustado:string;observaciones:string;}

type Reg=RTemp|RMedialunas|RBPM|RRecep|RDesp|RNC|RDecom|RLimp|RPesos;

// Proveedor BD
interface Proveedor{id:string;nombre:string;cuit:string;contacto:string;productos:string;activo:boolean;}

// Auditoría interna
interface RAuditoria{
  id:string;fecha:string;hora:string;responsable:string;turno:Turno;
  // Puntajes por sector (0-100)
  pct_recepcion:string;pct_amasado:string;pct_laminado:string;pct_medialunera:string;
  pct_fermentador:string;pct_abatidor:string;pct_envasado:string;pct_camara_pt:string;pct_bpm:string;pct_limpieza:string;
  pct_total:number;
  observaciones:string;
  acciones:string;
}

// Trazabilidad de carro — path FIJO independiente de versión
// cv_carros/{num_carro} — documento único por carro, se actualiza en cada etapa
interface TrazCarro{
  num_carro:string;variedad:string;lote_harina:string;
  // Etapas con timestamp fijo
  etapas:TrazEtapa[];
  ultimo_update:string;
}
interface TrazEtapa{
  etapa:string;fecha:string;hora:string;operario:string;turno:Turno;datos:Record<string,string>;
}

// ── CALENDARIO ────────────────────────────────────────────────
const MN=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DN=["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
interface DiaI{fecha:string;dayOfMonth:number;diaSem:number;}
interface SemI{semana:number;dias:DiaI[];}
interface MesI{anio:number;mes:number;label:string;id:string;semanas:SemI[];}
function buildCal():MesI[]{
  const r:MesI[]=[];
  for(const y of[2026,2027])for(let m=0;m<12;m++){
    const id=`${y}_${String(m+1).padStart(2,"0")}`;
    const sems:SemI[]=[];let ds=((new Date(y,m,1).getDay()+6)%7);
    const dim=new Date(y,m+1,0).getDate();let cur:DiaI[]=[];let ns=1;
    for(let p=0;p<ds;p++)cur.push({fecha:"",dayOfMonth:-1,diaSem:p});
    for(let d=1;d<=dim;d++){
      cur.push({fecha:`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`,dayOfMonth:d,diaSem:ds});
      ds++;if(ds===7){sems.push({semana:ns++,dias:cur});cur=[];ds=0;}
    }
    if(cur.length>0){while(cur.length<7)cur.push({fecha:"",dayOfMonth:-1,diaSem:cur.length});sems.push({semana:ns,dias:cur});}
    r.push({anio:y,mes:m,label:`${MN[m]} ${y}`,id,semanas:sems});
  }
  return r;
}
const CAL=buildCal();

// ── FIREBASE PATHS — ESTABLES (no cambian con versiones) ──────
// Los registros viven bajo "cv_registros/" — path fijo, independiente del código.
function fsPath(mid:string,sem:number,fecha:string){return`cv_registros/${mid}/sem_${sem}/${fecha.replace(/-/g,"")}/items`;}
async function loadDia(mid:string,sem:number,fecha:string):Promise<Reg[]>{
  try{const s=await getDocs(query(collection(db,fsPath(mid,sem,fecha)),orderBy("timestamp","desc")));return s.docs.map(d=>d.data() as Reg);}catch{return[];}
}
// Proveedores en colección separada estable
async function loadProveedores():Promise<Proveedor[]>{
  try{const s=await getDocs(collection(db,"cv_proveedores"));return s.docs.map(d=>d.data() as Proveedor);}catch{return[];}
}
async function saveProveedor(p:Proveedor){await setDoc(doc(db,"cv_proveedores",p.id),p);}
async function deleteProveedor(id:string){await deleteDoc(doc(db,"cv_proveedores",id));}

// ── AUDITORÍAS — path fijo ────────────────────────────────────
async function saveAuditoria(a:RAuditoria){await setDoc(doc(db,`cv_auditorias/${a.fecha}_${a.id}`),a as unknown as Record<string,unknown>);}
async function loadAuditorias(desde:string,hasta:string):Promise<RAuditoria[]>{
  try{const s=await getDocs(collection(db,"cv_auditorias"));
    return s.docs.map(d=>d.data() as RAuditoria).filter(a=>a.fecha>=desde&&a.fecha<=hasta).sort((a,b)=>b.fecha.localeCompare(a.fecha));}catch{return[];}}

// ── TRAZABILIDAD CARROS — path fijo (cv_carros/) ─────────────
async function saveTrazCarro(t:TrazCarro){await setDoc(doc(db,`cv_carros/${t.num_carro}`),t as unknown as Record<string,unknown>);}
async function loadTrazCarro(num:string):Promise<TrazCarro|null>{
  try{const d=await getDoc(doc(db,`cv_carros/${num}`));return d.exists()?d.data() as TrazCarro:null;}catch{return null;}}
async function loadTrazCarrosSemana(fechaDesde:string,fechaHasta:string):Promise<TrazCarro[]>{
  try{const s=await getDocs(collection(db,"cv_carros"));
    return s.docs.map(d=>d.data() as TrazCarro).filter(c=>{
      const ultima=c.etapas[c.etapas.length-1]?.fecha||"";
      return ultima>=fechaDesde&&ultima<=fechaHasta;
    }).sort((a,b)=>b.ultimo_update.localeCompare(a.ultimo_update));}catch{return[];}}
async function agregarEtapaCarro(num_carro:string,etapa:TrazEtapa,variedad:string,lote:string){
  const prev=await loadTrazCarro(num_carro)||{num_carro,variedad,lote_harina:lote,etapas:[],ultimo_update:""};
  const etapas=[...prev.etapas.filter(e=>e.etapa!==etapa.etapa),etapa];
  await saveTrazCarro({...prev,etapas,ultimo_update:new Date().toISOString()});
}

// ── HELPERS ───────────────────────────────────────────────────
const hoy=()=>new Date().toISOString().split("T")[0];
const ahora=()=>new Date().toTimeString().slice(0,5);
function fd(iso:string){if(!iso)return"";const[y,m,d]=iso.split("-");return`${d}/${m}/${y.slice(2)}`;}
function gid(p:string){return`${p}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;}
function cAl(a:Record<string,boolean>){return Object.values(a).filter(Boolean).length;}
function saveFoto(id:string,u:string){try{localStorage.setItem(`sv_foto_${id}`,u);}catch{}}
function loadFoto(id:string):string|null{try{return localStorage.getItem(`sv_foto_${id}`);}catch{return null;}}
async function compFoto(f:File):Promise<{dataUrl:string;w:number;h:number}>{return new Promise(r=>{const i=new Image();const u=URL.createObjectURL(f);i.onload=()=>{const M=800;const rt=Math.min(M/i.width,M/i.height,1);const w=Math.round(i.width*rt);const h=Math.round(i.height*rt);const c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d")!.drawImage(i,0,0,w,h);URL.revokeObjectURL(u);r({dataUrl:c.toDataURL("image/jpeg",0.7),w,h});};i.src=u;});}
function san(o:Record<string,unknown>):Record<string,unknown>{const r:Record<string,unknown>={};for(const[k,v]of Object.entries(o)){if(k==="fotos"&&Array.isArray(v))r[k]=(v as FotoMeta[]).map(({id,nombre,sector,timestamp,w,h})=>({id,nombre,sector,timestamp,w,h}));else r[k]=v;}return r;}
function calcHorasReposo(fi:string,di:string,fs:string,ds:string):number{
  if(!fi||!di||!fs||!ds)return 0;
  try{const ini=new Date(`${di}T${fi}`);const sal=new Date(`${ds}T${fs}`);return Math.round((sal.getTime()-ini.getTime())/36000)/100;}catch{return 0;}
}
function promedioArr(arr:string[]):number{const vs=arr.map(v=>parseFloat(v)).filter(v=>!isNaN(v));return vs.length?Math.round(vs.reduce((a,b)=>a+b,0)/vs.length*10)/10:0;}

// ── KPIs ──────────────────────────────────────────────────────
interface KPI{total:number;alertas:number;nc:number;decomisos:number;kg:number;bpm_inc:number;medialunas:number;por_tipo:Record<string,number>;}
function kpis(rs:Reg[]):KPI{
  let al=0,nc=0,dec=0,kg=0,binc=0,ml=0;const pt:Record<string,number>={};
  for(const r of rs){pt[r.tipo]=(pt[r.tipo]||0)+1;al+=cAl(r.alertas);if(r.tipo==="nc")nc++;if(r.tipo==="decomiso"){dec++;kg+=parseFloat((r as RDecom).cantidad_kg)||0;}if(r.tipo==="bpm")binc++;if(r.tipo==="medialunas")ml++;}
  return{total:rs.length,alertas:al,nc,decomisos:dec,kg:Math.round(kg*10)/10,bpm_inc:binc,medialunas:ml,por_tipo:pt};
}

// KPIs de cámaras y ambiente — últimos registros de temperaturas
interface KPITemp{t_camara_masas:string;t_ambiente:string;t_camara_pt:string;area:string;fecha:string;hora:string;}
function lastKPITemp(rs:Reg[]):KPITemp|null{
  const ts=rs.filter(r=>r.tipo==="temperaturas").sort((a,b)=>b.timestamp.localeCompare(a.timestamp));
  if(!ts.length)return null;
  const t=ts[0] as RTemp;
  return{t_camara_masas:(t as RTempML).t_camara_masas||"—",t_ambiente:(t as RTempML).t_ambiente||"—",t_camara_pt:(t as RTempML).t_camara_pt||"—",area:(t as RTempML).area||"—",fecha:t.fecha,hora:t.hora};
}
// T° final medialunas despacho — del último despacho
function lastTDespacho(rs:Reg[]):string{
  const ds=rs.filter(r=>r.tipo==="despacho").sort((a,b)=>b.timestamp.localeCompare(a.timestamp));
  if(!ds.length)return"—";return(ds[0] as RDesp).t_despacho||"—";
}

interface AlertaItem{campo:string;valor:string;limite:string;tipo:string;registro:Reg;}
function extraerAlertas(rs:Reg[]):AlertaItem[]{
  const labels:Record<string,{limite:string;tipo:string}>={
    t_camara_masas_nc:{limite:"8°C ±2°C",tipo:"T° cámara masas NC"},
    t_ambiente_nc:{limite:"16°C a 20°C",tipo:"T° ambiente NC"},
    t_camara_pt_nc:{limite:"-21°C ±4°C",tipo:"T° cámara PT NC"},
    t_agua_nc:{limite:"1°C a 6°C",tipo:"T° agua chiller NC"},
    tiempo_amasado_nc:{limite:"25 min ±3",tipo:"Tiempo amasado NC"},
    hojaldre_nc:{limite:"Hojaldre OK",tipo:"Corte hojaldre NC"},
    fermentador_nc:{limite:"28°C ±3°C",tipo:"T° fermentador NC"},
    t_abatidor_nc:{limite:"-24±2 / -16 a -20°C",tipo:"T° abatidor NC"},
    t_salida_nc:{limite:"≤-12°C",tipo:"T° salida abatidor NC"},
    t_camara_nc:{limite:"≤-17°C",tipo:"T° cámara final NC"},
    peso_nc:{limite:"60g±5 / 50g±5",tipo:"Peso triángulo NC"},
    recupero_exc:{limite:"≤10% harina",tipo:"Recupero excedido"},
    t_ingreso:{limite:"≤7°C",tipo:"T° recepción MP"},
    rechazado:{limite:"Rechazado",tipo:"Rechazo MP"},
    t_despacho:{limite:"≤-12°C",tipo:"T° despacho"},
    sin_accion:{limite:"Sin acción",tipo:"NC sin acción"},
    sin_foto:{limite:"Sin foto",tipo:"Decomiso sin foto"},
    superficies_no_ok:{limite:"No verificado",tipo:"Superficies PCC"},
    bpm_nc:{limite:"Incumplimiento",tipo:"BPM"},
  };
  const out:AlertaItem[]=[];
  for(const r of rs)for(const[k,v]of Object.entries(r.alertas)){if(v){const l=labels[k]||{limite:"—",tipo:k};const val=(r as Record<string,unknown>)[k];out.push({campo:k,valor:typeof val==="string"?val:"—",limite:l.limite,tipo:l.tipo,registro:r});}}
  return out;
}
function extraerObs(rs:Reg[]):Array<{texto:string;registro:Reg}>{
  const out:Array<{texto:string;registro:Reg}>=[];
  for(const r of rs){const o=(r as Record<string,unknown>).observaciones;if(typeof o==="string"&&o.trim())out.push({texto:o.trim(),registro:r});if(r.tipo==="nc"){const d=(r as RNC).descripcion;if(d)out.push({texto:`NC: ${d}`,registro:r});}}
  return out;
}
interface Reincidencia{tipo:string;count:number;critico:boolean;}
function calcReincidencias(rs:Reg[]):Reincidencia[]{
  const map:Record<string,number>={};
  for(const a of extraerAlertas(rs)){map[a.tipo]=(map[a.tipo]||0)+1;}
  return Object.entries(map).filter(([,c])=>c>1).map(([k,c])=>({tipo:k,count:c,critico:c>=3})).sort((a,b)=>b.count-a.count);
}

// ── EXPORT TXT ────────────────────────────────────────────────
const MODS:{id:Tipo;label:string;icon:string;badge:string}[]=[
  {id:"temperaturas",label:"Temperaturas",icon:"🌡️",badge:"PCC"},
  {id:"medialunas",label:"Medialunas",icon:"🥐",badge:"P276/280"},
  {id:"bpm",label:"BPM NC",icon:"👤",badge:"BPM"},
  {id:"recepcion",label:"Recepción MP",icon:"🚚",badge:"PCC"},
  {id:"despacho",label:"Despacho",icon:"📦",badge:"PC"},
  {id:"nc",label:"No Conformidad",icon:"⚠️",badge:"ISO"},
  {id:"decomiso",label:"Decomiso",icon:"🗑️",badge:"HACCP"},
  {id:"limpieza",label:"Limpieza POES",icon:"🧹",badge:"POES"},
];
const TURNOS=[{id:"TM" as Turno,label:"Mañana"},{id:"TT" as Turno,label:"Tarde"},{id:"TN" as Turno,label:"Noche"}];
const UK="sv_usuarios_v5",PIN="1234";
const BPM_ITEMS=["Lavado de manos","Uniforme completo","Sin joyas/maquillaje","Sin celular en zona","Sin alimentos fuera de área","Cofia colocada correctamente","Calzado adecuado","Uñas cortas y sin esmalte","Sin heridas descubiertas","Manipulación correcta de alimentos"];

function buildTxt(rs:Reg[],titulo:string,notas:Record<string,string>,elim:Set<string>):string{
  const vis=rs.filter(r=>!elim.has(r.id));const k=kpis(vis);const als=extraerAlertas(vis);const rein=calcReincidencias(vis);const obs=extraerObs(vis);
  let t=`REPORTE — CONTROL VOLANTE v5\nSabores Express · Cocina Central\n${titulo}\nGenerado: ${new Date().toLocaleString("es-AR")}\n${"─".repeat(46)}\n\n`;
  t+=`RESUMEN\nRegistros: ${k.total} | Alertas: ${k.alertas} | NC: ${k.nc} | Decomisos: ${k.decomisos} (${k.kg}kg) | BPM NC: ${k.bpm_inc} | Medialunas: ${k.medialunas}\n\n`;
  if(als.length){t+=`ALERTAS (${als.length})\n`;for(const a of als)t+=`  [${fd(a.registro.fecha)} ${a.registro.hora}] ⚠ ${a.tipo} — ${a.valor} (límite ${a.limite}) · ${a.registro.responsable}\n`;}
  if(rein.length){t+=`\nREINCIDENCIAS\n`;for(const r of rein)t+=`  ${r.critico?"🔴 CRÍTICO":"🟡"} ${r.tipo}: ${r.count} veces\n`;}
  if(obs.length){t+=`\nOBSERVACIONES\n`;for(const o of obs){t+=`  [${fd(o.registro.fecha)} ${o.registro.hora}] ${o.texto}\n`;const n=notas[o.registro.id];if(n)t+=`    Nota: ${n}\n`;}}
  t+=`\n${"─".repeat(46)}\nDETALLE POR TURNO\n`;
  for(const tr of TURNOS){const trs=vis.filter(r=>r.turno===tr.id);if(!trs.length)continue;t+=`\nTURNO ${tr.label.toUpperCase()}\n`;for(const r of trs){const m=MODS.find(x=>x.id===r.tipo);t+=`  [${r.hora}] ${m?.icon} ${m?.label}${cAl(r.alertas)>0?" ⚠":""} · ${r.responsable}\n`;
    if(r.tipo==="temperaturas"){const rt=r as RTemp;t+=`    Área: ${(rt as RTempML).area} | Cám.masas: ${(rt as RTempML).t_camara_masas}°C | Amb: ${(rt as RTempML).t_ambiente}°C | Cám.PT: ${(rt as RTempML).t_camara_pt}°C\n`;}
    if(r.tipo==="medialunas"){const ml=r as RMedialunas;t+=`    ${ml.variedad} | Prom: ${ml.prom_total}g | Ferment: ${ml.t_fermentador}°C | Abat: ${ml.t_abatido}°C | Cám.final: ${ml.t_camara_final}°C | Recupero: ${ml.pct_recupero}%\n`;}
    if(r.tipo==="bpm"){const b=r as RBPM;t+=`    Operario: ${b.operario} | Sector: ${b.sector}\n    Incumplimientos: ${b.incumplimientos.join(", ")}\n    Acción: ${b.accion_tomada}\n`;}
    if(r.tipo==="recepcion"){const rc=r as RRecep;t+=`    ${rc.proveedor_nombre} — ${rc.producto} | T°: ${rc.t_ingreso}°C | ${rc.resultado}\n`;}
    if(r.tipo==="despacho"){const dp=r as RDesp;t+=`    ${dp.local_destino} — ${dp.producto} | T°: ${dp.t_despacho}°C | Chofer: ${dp.chofer} | Pat: ${dp.patente}\n`;}
    if(r.tipo==="nc"){const nc=r as RNC;t+=`    ${nc.tipo_nc} — ${nc.descripcion}\n    Acción: ${nc.accion_inmediata}\n`;}
    if(r.tipo==="decomiso"){const dc=r as RDecom;t+=`    ${dc.producto} ${dc.cantidad_kg}kg — ${dc.motivo}\n`;}
    const n=notas[r.id];if(n)t+=`    Nota calidad: ${n}\n`;}}
  return t;
}
function dlTxt(content:string,name:string){const b=new Blob([content],{type:"text/plain;charset=utf-8"});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=name;a.click();}

// ── UI BASE ───────────────────────────────────────────────────
function cn(...c:(string|false|undefined)[]){return c.filter(Boolean).join(" ");}
function Badge({t,c}:{t:string;c:"red"|"amber"|"blue"|"green"|"purple"|"gray"}){
  const m={red:"bg-red-100 text-red-700",amber:"bg-amber-100 text-amber-700",blue:"bg-blue-100 text-blue-700",green:"bg-green-100 text-green-700",purple:"bg-purple-100 text-purple-700",gray:"bg-gray-100 text-gray-600"};
  return<span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${m[c]}`}>{t}</span>;
}
function ABadge({n}:{n:number}){if(!n)return null;return<span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{n}</span>;}
function Spin(){return<div className="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"/>;}
function Num({label,value,onChange,al,spec}:{label:string;value:string;onChange:(v:string)=>void;al?:boolean;spec?:string}){return<div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">{label}</label>{spec&&<span className="text-[10px] text-blue-400">{spec}</span>}<input type="number" inputMode="decimal" value={value} onChange={e=>onChange(e.target.value)} className={cn("h-10 rounded-lg border px-3 text-sm font-mono",al?"border-red-400 bg-red-50 text-red-700":"border-gray-200 bg-white")}/>{al&&<span className="text-[10px] text-red-500 font-medium">⚠ Fuera de rango</span>}</div>;}
function Txt({label,value,onChange,ph}:{label:string;value:string;onChange:(v:string)=>void;ph?:string}){return<div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">{label}</label><input type="text" value={value} onChange={e=>onChange(e.target.value)} placeholder={ph} className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm"/></div>;}
function DTxt({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}){return<div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">{label}</label><input type="datetime-local" value={value} onChange={e=>onChange(e.target.value)} className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm"/></div>;}
function Sel({label,value,onChange,opts,al}:{label:string;value:string;onChange:(v:string)=>void;opts:{v:string;l:string}[];al?:boolean}){return<div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">{label}</label><select value={value} onChange={e=>onChange(e.target.value)} className={cn("h-10 rounded-lg border px-3 text-sm bg-white",al?"border-red-400 bg-red-50":"border-gray-200")}><option value="">Seleccionar…</option>{opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select>{al&&<span className="text-[10px] text-red-500 font-medium">⚠ Requiere acción</span>}</div>;}
function Chk({label,value,onChange}:{label:string;value:boolean;onChange:(v:boolean)=>void}){return<button onClick={()=>onChange(!value)} className={cn("flex items-center gap-2 p-2.5 rounded-lg border text-sm text-left",value?"border-green-400 bg-green-50 text-green-800":"border-gray-200 bg-white text-gray-700")}><span className={cn("w-5 h-5 rounded flex items-center justify-center flex-shrink-0 text-xs border",value?"bg-green-500 border-green-500 text-white":"border-gray-300")}>{value?"✓":""}</span>{label}</button>;}
function TA({label,value,onChange,ph}:{label:string;value:string;onChange:(v:string)=>void;ph?:string}){return<div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">{label}</label><textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={ph} rows={3} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm resize-none"/></div>;}
function SecH({label,color}:{label:string;color:string}){return<div className={`text-xs font-bold uppercase tracking-wide border-b pb-1 ${color}`}>{label}</div>;}
function Fotos({fotos,onAdd,onRemove}:{fotos:FotoMeta[];onAdd:(m:FotoMeta)=>void;onRemove:(id:string)=>void}){
  const ref=useRef<HTMLInputElement>(null);const[cg,setCg]=useState(false);
  async function h(e:React.ChangeEvent<HTMLInputElement>){const f=e.target.files?.[0];if(!f)return;setCg(true);try{const{dataUrl,w,h}=await compFoto(f);const id=gid("foto");saveFoto(id,dataUrl);onAdd({id,nombre:f.name,sector:"CV",timestamp:new Date().toISOString(),w,h});}finally{setCg(false);if(ref.current)ref.current.value="";}}
  return<div className="flex flex-col gap-2"><label className="text-xs text-gray-500">Fotos de evidencia</label><div className="flex flex-wrap gap-2">{fotos.map(f=>{const u=loadFoto(f.id);return<div key={f.id} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200">{u?<img src={u} alt={f.nombre} className="w-full h-full object-cover"/>:<div className="w-full h-full bg-gray-100 flex items-center justify-center text-[10px] text-gray-400 text-center px-1">Solo este disp.</div>}<button onClick={()=>onRemove(f.id)} className="absolute top-0 right-0 bg-red-500 text-white w-4 h-4 rounded-bl text-[9px] flex items-center justify-center">✕</button></div>;})} <button onClick={()=>ref.current?.click()} className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400">{cg?<Spin/>:<><span className="text-xl">📷</span><span className="text-[10px]">Foto</span></>}</button></div><input ref={ref} type="file" accept="image/*" capture="environment" className="hidden" onChange={h}/></div>;
}
function FW({titulo,sub,onCancel,onSave,g,ch}:{titulo:string;sub:string;onCancel:()=>void;onSave:()=>void;g:boolean;ch:React.ReactNode}){return<div className="flex flex-col min-h-screen"><div className="flex items-center gap-3 p-4 border-b border-gray-100 bg-white sticky top-0 z-10"><button onClick={onCancel} className="text-gray-400 p-1 text-lg">←</button><div className="flex-1"><div className="font-semibold text-gray-800 text-sm">{titulo}</div><div className="text-xs text-gray-400">{sub}</div></div></div><div className="flex-1 p-4 flex flex-col gap-4 pb-28">{ch}</div><div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 flex gap-3 max-w-lg mx-auto"><button onClick={onCancel} className="flex-1 h-11 rounded-xl border border-gray-200 text-sm text-gray-600 font-medium">Cancelar</button><button onClick={onSave} disabled={g} className="flex-[2] h-11 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2">{g?<Spin/>:"Guardar ✓"}</button></div></div>;}

// ── FORM TEMPERATURAS — Sólo Cámaras y Ambiente ──────────────
// Único lugar donde se registran T° de cámaras (masas, PT, ambiente).
// El proceso de amasado/fermentador/abatidor va en FMedialunas por etapa.
function FTemp({u,onSave,onCancel}:{u:Usuario;onSave:(r:Reg)=>void;onCancel:()=>void}){
  const[d,sD]=useState({
    t_camara_masas:"",t_ambiente:"",t_camara_pt:"",
    equipo_num:"",observaciones:"",fotos:[] as FotoMeta[]});
  const[g,sG]=useState(false);

  const aCamaraMasas=d.t_camara_masas!==""&&(parseFloat(d.t_camara_masas)<6||parseFloat(d.t_camara_masas)>10);
  const aAmbiente=d.t_ambiente!==""&&(parseFloat(d.t_ambiente)<16||parseFloat(d.t_ambiente)>20);
  const aCamaraPT=d.t_camara_pt!==""&&(parseFloat(d.t_camara_pt)<-25||parseFloat(d.t_camara_pt)>-17);

  async function sv(){sG(true);
    onSave({id:gid("tmp"),tipo:"temperaturas",area:"general",turno:u.turno,responsable:u.nombre,fecha:hoy(),hora:ahora(),timestamp:new Date().toISOString(),
      alertas:{t_camara_masas_nc:aCamaraMasas,t_ambiente_nc:aAmbiente,t_camara_pt_nc:aCamaraPT},
      ...d} as unknown as Reg);
    sG(false);}

  return<FW titulo="🌡️ Temperaturas — Cámaras" sub="PCC · Registro único de cámaras" onCancel={onCancel} onSave={sv} g={g} ch={<>
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700 leading-relaxed">
      <b>Datos únicos de cámaras.</b> Registrá una sola vez por turno. Las temperaturas de proceso (fermentador, abatidor) se cargan dentro de <b>🥐 Medialunas</b> en cada etapa correspondiente.
    </div>

    <SecH label="🏭 PCC — Cámaras" color="text-blue-700"/>
    <Num label="T° cámara de Masas / Fraccionado (°C)" spec="PCC · Parámetro: 8°C ±2°C  →  6°C a 10°C" value={d.t_camara_masas} onChange={v=>sD(p=>({...p,t_camara_masas:v}))} al={aCamaraMasas}/>
    {aCamaraMasas&&<div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">⚠ PCC fuera de rango — verificar equipo y registrar NC</div>}

    <Num label="T° ambiente (°C)" spec="PC · Parámetro: 16°C a 20°C" value={d.t_ambiente} onChange={v=>sD(p=>({...p,t_ambiente:v}))} al={aAmbiente}/>
    {aAmbiente&&<div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-700">⚠ T° ambiente fuera de rango — impacta en laminado y fermentado</div>}

    <Num label="T° cámara de PT (°C)" spec="PCC · Parámetro: -21°C ±4°C  →  -17°C a -25°C" value={d.t_camara_pt} onChange={v=>sD(p=>({...p,t_camara_pt:v}))} al={aCamaraPT}/>
    {aCamaraPT&&<div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">⚠ PCC fuera de rango — cadena de frío comprometida</div>}

    <Txt label="N° termómetro / equipo calibrado" value={d.equipo_num} onChange={v=>sD(p=>({...p,equipo_num:v}))} ph="ej: TM-03"/>
    <Fotos fotos={d.fotos} onAdd={f=>sD(p=>({...p,fotos:[...p.fotos,f]}))} onRemove={id=>sD(p=>({...p,fotos:p.fotos.filter(f=>f.id!==id)}))}/>
    <TA label="Observaciones / acción correctiva" value={d.observaciones} onChange={v=>sD(p=>({...p,observaciones:v}))}/>
  </>}/>;
}

// ── FORM MEDIALUNAS — Proceso completo P280/P276 ─────────────
// Estructura: 1-Amasado → 2-Cámara → 3-Laminado manual (PCC hojaldre)
//             → 4-Laminado auto → 5-Medialunera (pesos) → 6-Fermentador
//             → 7-Abatidor → 8-Envasado → 9-Sensorial + Recupero
// T° de cámaras (masas/PT/ambiente) NO se duplican aquí — van en FTemp.
// Trazabilidad de carro se escribe en cv_carros/{num_carro} (path fijo).
function FMedialunas({u,onSave,onCancel}:{u:Usuario;onSave:(r:Reg)=>void;onCancel:()=>void}){
  const[d,sD]=useState({
    variedad:""as"manteca"|"grasa"|"",lote_harina:"",
    maquinista_12mil:"",maquinista_lam_auto:"",maquinista_manual:"",
    // S0 — Fraccionado/Dosificado
    agua_chiller_kg:"",hielo_kg:"",t_agua_chiller:"",
    // S1 — Amasado
    tiempo_amasado:"",t_masa_salida:"",peso_baston:"",
    // Trazabilidad ingreso cámara
    num_carro:"",fecha_ingreso_camara:hoy(),hora_ingreso_camara:"",
    pct_recupero:"",
    // S2 — Laminado manual
    num_carro_laminado:"",fecha_salida_camara:hoy(),hora_salida_camara:"",hojaldre_ok:false,
    calibre_inicio_manual:"",calibre_fin_manual:"",vueltas_manual:"",
    // S3 — Laminado automático
    calibre_inicio:"",calibre_fin:"",ancho_cm:"",
    // S4 — Medialunera + Pesos
    calibre_medialunera:"",
    muestras_inicio:["","","","",""],muestras_medio:["","","","",""],muestras_fin:["","","","",""],
    ajustado:"",
    // S5 — Fermentador
    t_fermentador:"",humedad_fermentador:"",tiempo_fermentado:"",
    num_carro_fermentador:"",hora_ingreso_fermentador:"",hora_salida_fermentador:"",
    // S6 — Abatidor
    t_abatidor:"",t_salida_abatidor:"",tiempo_abatido:"",num_carro_abatidor:"",
    // S7 — Envasado
    bandejas_unidades_ok:false,etiqueta_vigente:false,t_medialunas_envasar:"",t_camara_final:"",obs_envasado:"",
    // S8 — Sensorial
    color_ok:false,forma_ok:false,textura_ok:false,sensorial_obs:"",
    observaciones:"",fotos:[] as FotoMeta[]});
  const[g,sG]=useState(false);

  const horasReposo=calcHorasReposo(d.hora_ingreso_camara,d.fecha_ingreso_camara,d.hora_salida_camara,d.fecha_salida_camara);
  const isMant=d.variedad==="manteca";const isGrasa=d.variedad==="grasa";
  const pesoObj=isMant?60:isGrasa?50:60;
  const pi=promedioArr(d.muestras_inicio);const pm=promedioArr(d.muestras_medio);const pf=promedioArr(d.muestras_fin);
  const pt=d.muestras_inicio.concat(d.muestras_medio,d.muestras_fin).some(v=>v!=="")
    ?Math.round((pi+pm+pf)/([pi,pm,pf].filter(v=>v>0).length||1)*10)/10:0;
  const dv=pesoObj>0&&pt>0?Math.round(Math.abs(pt-pesoObj)/pesoObj*100*10)/10:0;

  // PCC por etapa — sin duplicar T° de cámaras
  const aAgua=d.t_agua_chiller!==""&&(parseFloat(d.t_agua_chiller)<1||parseFloat(d.t_agua_chiller)>6);
  const aTiempoAm=d.tiempo_amasado!==""&&(parseFloat(d.tiempo_amasado)<22||parseFloat(d.tiempo_amasado)>28);
  const aTMasa=d.t_masa_salida!==""&&(parseFloat(d.t_masa_salida)<18||parseFloat(d.t_masa_salida)>22);
  const aReposoMin=horasReposo>0&&horasReposo<8;
  const aHojaldre=d.num_carro_laminado!==""&&!d.hojaldre_ok;
  const aPeso=pt>0&&Math.abs(pt-pesoObj)>5;
  const aFerment=d.t_fermentador!==""&&(parseFloat(d.t_fermentador)<25||parseFloat(d.t_fermentador)>31);
  const aHumedad=d.humedad_fermentador!==""&&(parseFloat(d.humedad_fermentador)<85||parseFloat(d.humedad_fermentador)>95);
  const aTiempoFerm=d.tiempo_fermentado!==""&&(parseFloat(d.tiempo_fermentado)<55||parseFloat(d.tiempo_fermentado)>65);
  const aAbat=d.t_abatidor!==""&&(isMant?(parseFloat(d.t_abatidor)>-22||parseFloat(d.t_abatidor)<-26):(isGrasa?(parseFloat(d.t_abatidor)>-16||parseFloat(d.t_abatidor)<-20):false));
  const aSalida=isMant&&d.t_salida_abatidor!==""&&parseFloat(d.t_salida_abatidor)>-12;
  const aEnvasado=d.t_medialunas_envasar!==""&&parseFloat(d.t_medialunas_envasar)>-12;
  const aRecupero=d.pct_recupero!==""&&parseFloat(d.pct_recupero)>10;

  function setMuestra(g:"muestras_inicio"|"muestras_medio"|"muestras_fin",i:number,v:string){sD(p=>{const a=[...p[g]];a[i]=v;return{...p,[g]:a};});}

  async function sv(){
    sG(true);
    // Escribir trazabilidad de carro en path fijo (independiente de versión)
    if(d.num_carro){
      await agregarEtapaCarro(d.num_carro,{etapa:"amasado_ingreso_camara",fecha:d.fecha_ingreso_camara,hora:d.hora_ingreso_camara,operario:u.nombre,turno:u.turno,datos:{agua_kg:d.agua_chiller_kg,hielo_kg:d.hielo_kg,t_agua:d.t_agua_chiller,tiempo_am:d.tiempo_amasado,t_masa:d.t_masa_salida,lote:d.lote_harina}},d.variedad,d.lote_harina);
    }
    if(d.num_carro_laminado){
      await agregarEtapaCarro(d.num_carro_laminado,{etapa:"laminado_salida_camara",fecha:d.fecha_salida_camara,hora:d.hora_salida_camara,operario:u.nombre,turno:u.turno,datos:{hojaldre:d.hojaldre_ok?"ok":"nc",calibre_inicio:d.calibre_inicio,calibre_fin:d.calibre_fin,ancho:d.ancho_cm}},d.variedad,d.lote_harina);
    }
    if(d.num_carro_fermentador){
      await agregarEtapaCarro(d.num_carro_fermentador,{etapa:"fermentador",fecha:hoy(),hora:d.hora_ingreso_fermentador,operario:u.nombre,turno:u.turno,datos:{t_fermentador:d.t_fermentador,humedad:d.humedad_fermentador,tiempo:d.tiempo_fermentado,hora_ingreso:d.hora_ingreso_fermentador,hora_salida:d.hora_salida_fermentador}},d.variedad,d.lote_harina);
    }
    if(d.num_carro_abatidor){
      await agregarEtapaCarro(d.num_carro_abatidor,{etapa:"abatidor",fecha:hoy(),hora:ahora(),operario:u.nombre,turno:u.turno,datos:{t_abatidor:d.t_abatidor,t_salida:d.t_salida_abatidor,tiempo:d.tiempo_abatido}},d.variedad,d.lote_harina);
    }
    onSave({id:gid("ml"),tipo:"medialunas",turno:u.turno,responsable:u.nombre,fecha:hoy(),hora:ahora(),timestamp:new Date().toISOString(),
      prom_inicio:pi,prom_medio:pm,prom_fin:pf,prom_total:pt,desvio_pct:dv,
      alertas:{peso_nc:aPeso,t_agua_nc:aAgua,tiempo_am_nc:aTiempoAm,t_masa_nc:aTMasa,reposo_nc:aReposoMin,hojaldre_nc:aHojaldre,fermentador_nc:aFerment,humedad_nc:aHumedad,tiempo_ferm_nc:aTiempoFerm,t_abatidor_nc:aAbat,t_salida_nc:aSalida,t_envasado_nc:aEnvasado,recupero_exc:aRecupero},
      ...d} as unknown as Reg);
    sG(false);
  }

  return<FW titulo="🥐 Medialunas" sub="P280 Manteca / P276 Grasa — Proceso completo" onCancel={onCancel} onSave={sv} g={g} ch={<>

    {/* ── CABECERA: Variedad + Lote ──────────────────────────── */}
    <div className="flex gap-2">
      {(["manteca","grasa"] as const).map(x=><button key={x} onClick={()=>sD(p=>({...p,variedad:x}))} className={cn("flex-1 py-3 rounded-xl text-sm font-bold border-2",d.variedad===x?"border-amber-500 bg-amber-50 text-amber-700":"border-gray-200 bg-white text-gray-500")}>{x==="manteca"?"🥐 Manteca (P280)":"🥐 Grasa (P276)"}</button>)}
    </div>
    <Txt label="Lote / N° amasijo" value={d.lote_harina} onChange={v=>sD(p=>({...p,lote_harina:v}))} ph="Obligatorio — trazabilidad"/>

    {/* ══════════════════════════════════════════════════════════
        SECTOR 0 — FRACCIONADO / DOSIFICADO  (P280 §2)
        Ingredientes fraccionados antes del amasado.
        PCC: T° del sitio de fraccionado (cámara de masas) — se registra en Temperaturas.
        Aquí se carga Agua + Hielo como datos únicos del lote.
    ══════════════════════════════════════════════════════════ */}
    <div className="rounded-2xl border-2 border-gray-200 overflow-hidden">
      <div className="bg-gray-100 px-4 py-2 flex items-center justify-between">
        <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">📦 S0 — Fraccionado / Dosificado</span>
        <span className="text-[10px] text-gray-400">P280 §2</span>
      </div>
      <div className="p-4 flex flex-col gap-3 bg-white">
        <div className="text-[10px] text-gray-400 leading-relaxed">Ingredientes fraccionados en cámara de masas, rotulados con fecha. T° del sitio se registra en <b>🌡️ Temperaturas</b>.</div>
        <div className="grid grid-cols-2 gap-3">
          <Num label="Cantidad Agua (Kg)" spec="PC — dato único del lote" value={d.agua_chiller_kg} onChange={v=>sD(p=>({...p,agua_chiller_kg:v}))}/>
          <Num label="Cantidad Hielo (Kg)" spec="PC — dato único del lote" value={d.hielo_kg} onChange={v=>sD(p=>({...p,hielo_kg:v}))}/>
        </div>
        <Num label="T° chiller (°C)" spec="PCC — Parámetro: 5°C a 13°C (P280) / 1°C a 6°C (seteo)" value={d.t_agua_chiller} onChange={v=>sD(p=>({...p,t_agua_chiller:v}))} al={aAgua}/>
        {aAgua&&<div className="bg-red-50 border border-red-200 rounded-xl p-2.5 text-xs text-red-700 font-medium">🔴 PCC — T° agua chiller fuera de rango. Ajustar proporción agua/hielo antes de amasar.</div>}
      </div>
    </div>

    {/* ══════════════════════════════════════════════════════════
        SECTOR 1 — AMASADO  (P280 §3)
        PCC: T° agua chiller · Tiempo amasado · T° masa salida
        Trazabilidad: N° carro asignado + Fecha + Hora de ingreso a cámara
    ══════════════════════════════════════════════════════════ */}
    <div className="rounded-2xl border-2 border-indigo-200 overflow-hidden">
      <div className="bg-indigo-50 px-4 py-2 flex items-center justify-between">
        <span className="text-xs font-bold text-indigo-700 uppercase tracking-wide">🫱 S1 — Amasado</span>
        <span className="text-[10px] text-indigo-400">P280 §3 · PCC</span>
      </div>
      <div className="p-4 flex flex-col gap-3 bg-white">

        {/* PCC Amasado */}
        <div className="bg-indigo-50 rounded-xl p-3 flex flex-col gap-3">
          <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide">🔴 Puntos de Control Crítico</div>
          <Num label="Tiempo total de amasado (min)" spec="PCC — 25 min ±3 min  →  22 a 28 min" value={d.tiempo_amasado} onChange={v=>sD(p=>({...p,tiempo_amasado:v}))} al={aTiempoAm}/>
          {aTiempoAm&&<div className="bg-red-50 border border-red-300 rounded-xl p-2 text-xs text-red-700 font-medium">⚠ Tiempo fuera de rango — verificar análisis organoléptico (tenacidad/elasticidad)</div>}
          <Num label="T° masa al salir amasadora (°C)" spec="PCC — 20°C ±2°C  →  18°C a 22°C" value={d.t_masa_salida} onChange={v=>sD(p=>({...p,t_masa_salida:v}))} al={aTMasa}/>
          {aTMasa&&<div className="bg-red-50 border border-red-300 rounded-xl p-2 text-xs text-red-700 font-medium">⚠ T° masa NC — Retirar, cortar y dejar descansar en cámara con seguimiento hasta bajar a rango.</div>}
        </div>

        {/* PC Amasado */}
        <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Peso de bastones (PC)</div>
        <Num label="Peso de bastón (Kg)" spec="PC — valor unitario · objetivo 8 Kg" value={d.peso_baston} onChange={v=>sD(p=>({...p,peso_baston:v}))} al={d.peso_baston!==""&&(parseFloat(d.peso_baston)<7.5||parseFloat(d.peso_baston)>8.5)}/>

        {/* Trazabilidad carro — Ingreso a cámara */}
        <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-cyan-700 uppercase tracking-wide">🚛 Trazabilidad — Ingreso a cámara</span>
            <span className="text-[9px] text-cyan-500">cv_carros/ (path fijo)</span>
          </div>
          <div className="text-[9px] text-cyan-500">Reposo mínimo 8h · Óptimo 12h según P280 §3.8</div>
          <Txt label="N° de carro asignado" value={d.num_carro} onChange={v=>sD(p=>({...p,num_carro:v}))} ph="ej: C-01 · único por lote"/>
          <div className="grid grid-cols-2 gap-2">
            <Txt label="Fecha ingreso" value={d.fecha_ingreso_camara} onChange={v=>sD(p=>({...p,fecha_ingreso_camara:v}))} ph={hoy()}/>
            <Txt label="Hora ingreso" value={d.hora_ingreso_camara} onChange={v=>sD(p=>({...p,hora_ingreso_camara:v}))} ph="HH:MM"/>
          </div>
          {d.num_carro&&d.hora_ingreso_camara&&<div className="bg-cyan-100 rounded-lg px-3 py-1.5 text-xs text-cyan-800 font-medium">Carro {d.num_carro} · Ingresó {fd(d.fecha_ingreso_camara)} a las {d.hora_ingreso_camara}h</div>}
        </div>

        <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Rendimiento (PC)</div>
        <Num label="% Rendimiento / Recupero" spec="PC — Límite: ≤10% de harina del amasijo" value={d.pct_recupero} onChange={v=>sD(p=>({...p,pct_recupero:v}))} al={aRecupero}/>
        {aRecupero&&<div className="bg-amber-50 border border-amber-200 rounded-xl p-2 text-xs text-amber-700">⚠ Recupero excede límite — revisar proceso de recorte y absorción.</div>}
      </div>
    </div>

    {/* ══════════════════════════════════════════════════════════
        SECTOR 2 — LAMINADO MANUAL  (P280 §4)
        Maquinista Manual.
        N° carro debe coincidir con el dato de ingreso.
        Trazabilidad: Fecha + Hora de salida de cámara → calcula reposo.
        PCC: Corte de hojaldre visible.
    ══════════════════════════════════════════════════════════ */}
    <div className="rounded-2xl border-2 border-violet-200 overflow-hidden">
      <div className="bg-violet-50 px-4 py-2 flex items-center justify-between">
        <span className="text-xs font-bold text-violet-700 uppercase tracking-wide">📋 S2 — Laminado Manual</span>
        <span className="text-[10px] text-violet-400">P280 §4 · PCC</span>
      </div>
      <div className="p-4 flex flex-col gap-3 bg-white">

        <Txt label="Maquinista Manual" value={d.maquinista_manual} onChange={v=>sD(p=>({...p,maquinista_manual:v}))} ph="Nombre y apellido del operario"/>

        {/* Trazabilidad carro — Salida de cámara */}
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-violet-700 uppercase tracking-wide">🚛 Trazabilidad — Salida de cámara</span>
            <span className="text-[9px] text-violet-400">cv_carros/ (path fijo)</span>
          </div>
          <Txt label="N° de carro (debe coincidir con S1)" value={d.num_carro_laminado} onChange={v=>sD(p=>({...p,num_carro_laminado:v}))} ph="Mismo N° del ingreso"/>
          {d.num_carro&&d.num_carro_laminado&&d.num_carro!==d.num_carro_laminado&&<div className="bg-amber-50 border border-amber-300 rounded-lg p-2 text-xs text-amber-700 font-semibold">⚠ N° de carro no coincide con el ingreso ({d.num_carro})</div>}
          <div className="grid grid-cols-2 gap-2">
            <Txt label="Fecha salida cámara" value={d.fecha_salida_camara} onChange={v=>sD(p=>({...p,fecha_salida_camara:v}))} ph={hoy()}/>
            <Txt label="Hora salida cámara" value={d.hora_salida_camara} onChange={v=>sD(p=>({...p,hora_salida_camara:v}))} ph="HH:MM"/>
          </div>
          {/* Cálculo automático de reposo */}
          {horasReposo>0&&<div className={cn("rounded-xl px-3 py-2 text-sm font-bold text-center border-2",horasReposo>=12?"border-blue-300 bg-blue-50 text-blue-700":horasReposo>=8?"border-green-300 bg-green-50 text-green-700":"border-red-400 bg-red-50 text-red-700")}>
            ⏱ Reposo en cámara: <span className="text-lg">{horasReposo}h</span>
            {horasReposo<8?" 🔴 MÍNIMO 8h — Desvío de proceso":horasReposo>=12?" ✓ Óptimo (12h)":"  ✓ Mínimo cumplido (8h)"}
          </div>}
          {aReposoMin&&<div className="bg-red-50 border border-red-300 rounded-xl p-2 text-xs text-red-700 font-medium">⚠ Reposo insuficiente — Caso de NO completarse: señalar hora de ingreso. Generar desvío.</div>}
        </div>

        {/* PCC Hojaldre */}
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-3 flex flex-col gap-2">
          <div className="text-[10px] font-bold text-red-700 uppercase tracking-wide">🔴 PCC — Corte de hojaldre</div>
          <div className="text-[10px] text-red-500">Verificar hojaldre visible en el corte. Si no cumple: NO continuar proceso.</div>
          <button onClick={()=>sD(p=>({...p,hojaldre_ok:!p.hojaldre_ok}))} className={cn("h-13 py-3 rounded-xl border-2 text-sm font-bold",d.hojaldre_ok?"border-green-400 bg-green-50 text-green-700":"border-red-400 bg-red-100 text-red-700")}>
            {d.hojaldre_ok?"✓ CUMPLE — Hojaldre visible en corte":"✕ NO CUMPLE — Hojaldre no visible"}
          </button>
          {aHojaldre&&<div className="bg-red-100 border border-red-400 rounded-xl p-2 text-xs text-red-800 font-bold">🛑 PCC CRÍTICO — Detener proceso. Generar NC inmediatamente.</div>}
        </div>

        {/* PC Laminado manual */}
        <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Calibres laminado manual (P280 §4.1)</div>
        <div className="bg-gray-50 rounded-xl p-3">
          <div className="text-[9px] text-gray-400 mb-2">Manteca: 39-29-19-12 (Argental) · Vueltas simples: 39-32-26-17-12</div>
          <div className="grid grid-cols-3 gap-2">
            <Num label="Calibre inicio" spec="PC" value={d.calibre_inicio_manual||""} onChange={v=>sD(p=>({...p,calibre_inicio_manual:v}))}/>
            <Num label="Calibre fin" spec="PC" value={d.calibre_fin_manual||""} onChange={v=>sD(p=>({...p,calibre_fin_manual:v}))}/>
            <Num label="N° vueltas" spec="PC" value={d.vueltas_manual||""} onChange={v=>sD(p=>({...p,vueltas_manual:v}))}/>
          </div>
        </div>
      </div>
    </div>

    {/* ══════════════════════════════════════════════════════════
        SECTOR 3 — LAMINADO AUTOMÁTICO  (P280 §5)
        Maquinista Laminadora Automática.
        PC: Calibre inicio · Calibre fin · Ancho (cm)
    ══════════════════════════════════════════════════════════ */}
    <div className="rounded-2xl border-2 border-orange-200 overflow-hidden">
      <div className="bg-orange-50 px-4 py-2 flex items-center justify-between">
        <span className="text-xs font-bold text-orange-700 uppercase tracking-wide">⚙️ S3 — Laminado Automático</span>
        <span className="text-[10px] text-orange-400">P280 §5 · PC</span>
      </div>
      <div className="p-4 flex flex-col gap-3 bg-white">
        <Txt label="Maquinista Laminadora Automática" value={d.maquinista_lam_auto} onChange={v=>sD(p=>({...p,maquinista_lam_auto:v}))} ph="Nombre y apellido del operario"/>
        <div className="text-[9px] text-gray-400">Programa: "manteca" · Rodillo lado derecho para enrollado automático</div>
        <div className="grid grid-cols-3 gap-2">
          <Num label="Calibre inicio" spec="PC" value={d.calibre_inicio} onChange={v=>sD(p=>({...p,calibre_inicio:v}))}/>
          <Num label="Calibre fin" spec="PC" value={d.calibre_fin} onChange={v=>sD(p=>({...p,calibre_fin:v}))}/>
          <Num label="Ancho (cm)" spec="PC" value={d.ancho_cm} onChange={v=>sD(p=>({...p,ancho_cm:v}))}/>
        </div>
      </div>
    </div>

    {/* ══════════════════════════════════════════════════════════
        SECTOR 4 — MEDIALUNERA + PESOS  (P280 §6)
        Maquinista 12 Mil.
        PCC: Peso triángulo (valor unitario = 8 Kg de bastón)
             Cantidad de bastones.
        PC: Calibre medialunera · % recupero.
        15 muestras: 5 inicio · 5 medio · 5 fin
    ══════════════════════════════════════════════════════════ */}
    <div className="rounded-2xl border-2 border-amber-200 overflow-hidden">
      <div className="bg-amber-50 px-4 py-2 flex items-center justify-between">
        <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">🥐 S4 — Medialunera</span>
        <span className="text-[10px] text-amber-400">P280 §6 · PCC + PC</span>
      </div>
      <div className="p-4 flex flex-col gap-3 bg-white">
        <Txt label="Maquinista 12 Mil" value={d.maquinista_12mil} onChange={v=>sD(p=>({...p,maquinista_12mil:v}))} ph="Nombre y apellido del operario"/>
        <Num label="Calibre medialunera" spec="PC — 60 (ML12) o 15/20 (ML 1-3)" value={d.calibre_medialunera} onChange={v=>sD(p=>({...p,calibre_medialunera:v}))}/>
        <div className="text-[9px] text-gray-400">Cantidad de bastones (valor unitario = 8 Kg c/u) · Registrar recortes por medialunera (P280 §6.2)</div>

        {/* PCC Pesos — 15 muestras */}
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3">
          <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wide mb-2">🔴 PCC — Peso de triángulos · Objetivo: {pesoObj}g ±5g</div>
          <div className="text-[9px] text-amber-600 mb-3">15 muestras total: 5 al inicio · 5 al medio · 5 al final · Valor unitario por bastón</div>
          {(["muestras_inicio","muestras_medio","muestras_fin"] as const).map((grupo,gi)=>{
            const etiqLabel=["Inicio (primeros 5)","Medio (siguientes 5)","Fin (últimos 5)"];
            const prom=[pi,pm,pf][gi];const enRango=prom>0&&Math.abs(prom-pesoObj)<=5;
            return<div key={grupo} className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-gray-700">{etiqLabel[gi]}</span>
                {prom>0&&<span className={cn("text-xs font-bold px-2 py-0.5 rounded-full",enRango?"bg-green-100 text-green-700":"bg-red-100 text-red-700")}>X̄ {prom}g {enRango?"✓":"⚠"}</span>}
              </div>
              <div className="grid grid-cols-5 gap-1">
                {d[grupo].map((v,i)=><input key={i} type="number" inputMode="decimal" value={v} onChange={e=>setMuestra(grupo,i,e.target.value)} placeholder={`${i+1}`} className={cn("h-10 rounded-lg border text-center text-xs font-mono",v!==""&&Math.abs(parseFloat(v)-pesoObj)>5?"border-red-400 bg-red-50 text-red-700":"border-gray-200 bg-white")}/>)}
              </div>
            </div>;})}
          {pt>0&&<div className={cn("rounded-xl p-3 flex items-center justify-between border-2 mt-2",aPeso?"border-red-400 bg-red-50":"border-green-400 bg-green-50")}>
            <div><div className={cn("text-sm font-bold",aPeso?"text-red-700":"text-green-700")}>{aPeso?"🔴 PCC — Fuera de rango":"✓ En rango"}</div><div className="text-[10px] text-gray-500">Promedio total: {pt}g · Objetivo: {pesoObj}g ±5g</div></div>
            <div className={cn("text-2xl font-black",aPeso?"text-red-600":"text-green-600")}>{dv}%</div>
          </div>}
          {aPeso&&<Sel label="Acción correctiva" value={d.ajustado} onChange={v=>sD(p=>({...p,ajustado:v}))} al={!d.ajustado} opts={[{v:"si",l:"✓ Calibre corregido"},{v:"no",l:"Sin corrección — documentar"},{v:"retirado",l:"Lote retirado de línea"}]}/>}
        </div>
      </div>
    </div>

    {/* ══════════════════════════════════════════════════════════
        SECTOR 5 — FERMENTADOR  (P280 §8)
        Trazabilidad: N° carro + hora ingreso + hora salida
        PCC: T° · Humedad · Tiempo
    ══════════════════════════════════════════════════════════ */}
    <div className="rounded-2xl border-2 border-green-200 overflow-hidden">
      <div className="bg-green-50 px-4 py-2 flex items-center justify-between">
        <span className="text-xs font-bold text-green-700 uppercase tracking-wide">🌡️ S5 — Fermentador</span>
        <span className="text-[10px] text-green-400">P280 §8 · PCC</span>
      </div>
      <div className="p-4 flex flex-col gap-3 bg-white">
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex flex-col gap-2.5">
          <div className="text-[10px] font-bold text-green-700 uppercase tracking-wide">🚛 Trazabilidad — Fermentador</div>
          <div className="text-[9px] text-green-500">N° carro · Ingreso por puerta más próxima al montacargas · Salida por puerta más próxima a abatidores</div>
          <Txt label="N° de carro fermentador" value={d.num_carro_fermentador} onChange={v=>sD(p=>({...p,num_carro_fermentador:v}))} ph="Dato de trazabilidad — path fijo"/>
          <div className="grid grid-cols-2 gap-2">
            <Txt label="Hora ingreso" value={d.hora_ingreso_fermentador} onChange={v=>sD(p=>({...p,hora_ingreso_fermentador:v}))} ph="HH:MM"/>
            <Txt label="Hora salida" value={d.hora_salida_fermentador} onChange={v=>sD(p=>({...p,hora_salida_fermentador:v}))} ph="HH:MM"/>
          </div>
          {d.hora_ingreso_fermentador&&d.hora_salida_fermentador&&<div className="bg-green-100 rounded-lg px-3 py-1.5 text-xs text-green-800 font-medium">Carro {d.num_carro_fermentador||"—"} · {d.hora_ingreso_fermentador}h → {d.hora_salida_fermentador}h</div>}
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex flex-col gap-2.5">
          <div className="text-[10px] font-bold text-green-700 uppercase tracking-wide">🔴 PCC — Parámetros fermentador</div>
          <div className="text-[9px] text-green-500">Seteo: 33°C · 90% humedad · 60 min (puede variar según condición ambiental)</div>
          <Num label="T° fermentador (°C)" spec="PCC — 28°C ±3°C  →  25°C a 31°C" value={d.t_fermentador} onChange={v=>sD(p=>({...p,t_fermentador:v}))} al={aFerment}/>
          <div className="grid grid-cols-2 gap-2">
            <Num label="Humedad (%)" spec="PCC — 90%" value={d.humedad_fermentador} onChange={v=>sD(p=>({...p,humedad_fermentador:v}))} al={aHumedad}/>
            <Num label="Tiempo (min)" spec="PCC — 60 min" value={d.tiempo_fermentado} onChange={v=>sD(p=>({...p,tiempo_fermentado:v}))} al={aTiempoFerm}/>
          </div>
          {(aFerment||aHumedad||aTiempoFerm)&&<div className="bg-red-50 border border-red-300 rounded-xl p-2 text-xs text-red-700 font-medium">⚠ PCC fuera de parámetro — documentar causa y acción correctiva abajo.</div>}
        </div>
      </div>
    </div>

    {/* ══════════════════════════════════════════════════════════
        SECTOR 6 — ABATIDOR  (P280 §9)
        Trazabilidad: N° carro
        PCC: T° seteo · T° salida (≤-12°C para habilitar envasado)
    ══════════════════════════════════════════════════════════ */}
    <div className="rounded-2xl border-2 border-indigo-200 overflow-hidden">
      <div className="bg-indigo-50 px-4 py-2 flex items-center justify-between">
        <span className="text-xs font-bold text-indigo-700 uppercase tracking-wide">❄️ S6 — Abatidor</span>
        <span className="text-[10px] text-indigo-400">P280 §9 · PCC</span>
      </div>
      <div className="p-4 flex flex-col gap-3 bg-white">
        <div className="text-[9px] text-indigo-400">{isMant?"Manteca: -24°C ±2°C · salida ≤-12°C · ~60 min · mín. 8 carros simples / 4 dobles":isGrasa?"Grasa: -16°C a -20°C · ~60 min":""}</div>
        <Txt label="N° de carro abatidor" value={d.num_carro_abatidor} onChange={v=>sD(p=>({...p,num_carro_abatidor:v}))} ph="Trazabilidad — dato fijo"/>
        <Num label="T° seteo abatidor (°C)" spec={isMant?"PCC — -24°C ±2°C":isGrasa?"PCC — -16°C a -20°C":""} value={d.t_abatidor} onChange={v=>sD(p=>({...p,t_abatidor:v}))} al={aAbat}/>
        <Num label="Tiempo abatido (min)" spec="~60 min" value={d.tiempo_abatido} onChange={v=>sD(p=>({...p,tiempo_abatido:v}))}/>
        {isMant&&<><Num label="T° salida abatidor (°C)" spec="PCC CRÍTICO — ≤-12°C para habilitar envasado" value={d.t_salida_abatidor} onChange={v=>sD(p=>({...p,t_salida_abatidor:v}))} al={aSalida}/>
        {aSalida&&<div className="bg-red-50 border-2 border-red-400 rounded-xl p-2.5 text-xs text-red-800 font-bold">🛑 PCC CRÍTICO — No habilitar envasado. T° insuficiente. Continuar abatido y re-verificar.</div>}</>}
        {aAbat&&!aSalida&&<div className="bg-red-50 border border-red-200 rounded-xl p-2 text-xs text-red-700">⚠ T° abatidor NC — verificar carga de carros y funcionamiento del equipo.</div>}
      </div>
    </div>

    {/* ══════════════════════════════════════════════════════════
        SECTOR 7 — ENVASADO  (P280 §10)
        PCC: T° medialunas al envasar ≤-12°C
        PC: Bandejas completas · Etiqueta vigente
    ══════════════════════════════════════════════════════════ */}
    <div className="rounded-2xl border-2 border-teal-200 overflow-hidden">
      <div className="bg-teal-50 px-4 py-2 flex items-center justify-between">
        <span className="text-xs font-bold text-teal-700 uppercase tracking-wide">📦 S7 — Envasado</span>
        <span className="text-[10px] text-teal-400">P280 §10 · PCC</span>
      </div>
      <div className="p-4 flex flex-col gap-3 bg-white">
        <div className="text-[9px] text-teal-500">180 und/cajón (4 bandejas + 12 sueltas) · Rotular con fecha y tipo · Lote visible · Pallet de 32 cajones → cámara final</div>
        <Num label="T° medialunas al envasar (°C)" spec="PCC — ≤-12°C para habilitar envasado" value={d.t_medialunas_envasar} onChange={v=>sD(p=>({...p,t_medialunas_envasar:v}))} al={aEnvasado}/>
        {aEnvasado&&<div className="bg-red-50 border-2 border-red-400 rounded-xl p-2.5 text-xs text-red-800 font-bold">🛑 PCC — No envasar. T° fuera de límite. Devolver a abatidor.</div>}
        <Chk label="✓ Bandejas completas (42 manteca · 36 grasa por bandeja)" value={d.bandejas_unidades_ok} onChange={v=>sD(p=>({...p,bandejas_unidades_ok:v}))}/>
        <Chk label="✓ Etiqueta vigente con fecha, tipo y LOTE visible" value={d.etiqueta_vigente} onChange={v=>sD(p=>({...p,etiqueta_vigente:v}))}/>
        <Num label="T° cámara final (°C)" spec="PCC — ≤-17°C" value={d.t_camara_final} onChange={v=>sD(p=>({...p,t_camara_final:v}))} al={d.t_camara_final!==""&&parseFloat(d.t_camara_final)>-17}/>
        {d.t_camara_final!==""&&parseFloat(d.t_camara_final)>-17&&<div className="bg-red-50 border border-red-300 rounded-xl p-2 text-xs text-red-700 font-medium">⚠ PCC — Cámara final fuera de rango. Verificar equipo urgente.</div>}
        <TA label="Obs. envasado" value={d.obs_envasado} onChange={v=>sD(p=>({...p,obs_envasado:v}))} ph="Novedades, cantidades, incidencias de envasado…"/>
      </div>
    </div>

    {/* ══════════════════════════════════════════════════════════
        SECTOR 8 — EVALUACIÓN SENSORIAL
        Análisis organoléptico del producto terminado.
    ══════════════════════════════════════════════════════════ */}
    <div className="rounded-2xl border-2 border-purple-200 overflow-hidden">
      <div className="bg-purple-50 px-4 py-2">
        <span className="text-xs font-bold text-purple-700 uppercase tracking-wide">👅 S8 — Sensorial</span>
      </div>
      <div className="p-4 flex flex-col gap-2 bg-white">
        <Chk label="✓ Color — dorado uniforme" value={d.color_ok} onChange={v=>sD(p=>({...p,color_ok:v}))}/>
        <Chk label="✓ Forma — punta al centro hacia abajo, sin aperturas" value={d.forma_ok} onChange={v=>sD(p=>({...p,forma_ok:v}))}/>
        <Chk label="✓ Textura / hojaldrado OK" value={d.textura_ok} onChange={v=>sD(p=>({...p,textura_ok:v}))}/>
        <div className="mt-1"><TA label="Observaciones sensoriales" value={d.sensorial_obs} onChange={v=>sD(p=>({...p,sensorial_obs:v}))} ph="Desvíos de color, aroma, textura, apertura, presencia de cuerpos extraños…"/></div>
      </div>
    </div>

    <Fotos fotos={d.fotos} onAdd={f=>sD(p=>({...p,fotos:[...p.fotos,f]}))} onRemove={id=>sD(p=>({...p,fotos:p.fotos.filter(f=>f.id!==id)}))}/>
    <TA label="Observaciones generales / acciones correctivas" value={d.observaciones} onChange={v=>sD(p=>({...p,observaciones:v}))}/>
  </>}/>;
}

    {/* ── SECTOR 1: AMASADO ─────────────────────────────────── */}
    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3">
      <div className="text-xs font-bold text-indigo-700 uppercase tracking-wide mb-3">🫱 Sector 1 — Amasado (P280 §3)</div>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <Num label="Agua chiller (Kg)" value={d.agua_chiller_kg} onChange={v=>sD(p=>({...p,agua_chiller_kg:v}))}/>
          <Num label="Hielo (Kg)" value={d.hielo_kg} onChange={v=>sD(p=>({...p,hielo_kg:v}))}/>
        </div>
        <Num label="T° agua chiller (°C)" spec="PCC — Parámetro: 1°C a 6°C" value={d.t_agua_chiller} onChange={v=>sD(p=>({...p,t_agua_chiller:v}))} al={aAgua}/>
        {aAgua&&<div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">⚠ PCC — T° agua fuera de rango. Ajustar proporción agua/hielo.</div>}
        <Num label="Tiempo total amasado (min)" spec="PCC — Parámetro: 25 min ±3" value={d.tiempo_amasado} onChange={v=>sD(p=>({...p,tiempo_amasado:v}))} al={aTiempoAm}/>
        <Num label="T° masa al salir amasadora (°C)" spec="PCC — Parámetro: 20°C ±2°C" value={d.t_masa_salida} onChange={v=>sD(p=>({...p,t_masa_salida:v}))} al={aTMasa}/>
        {aTMasa&&<div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">⚠ T° masa NC — Retirar de amasadora, fraccionar y reposar en cámara con seguimiento.</div>}
      </div>
    </div>

    {/* ── SECTOR 2: INGRESO A CÁMARA (Trazabilidad) ─────────── */}
    <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-3">
      <div className="text-xs font-bold text-cyan-700 uppercase tracking-wide mb-1">❄️ Sector 2 — Ingreso a cámara (reposo masa)</div>
      <div className="text-[10px] text-cyan-500 mb-3">Reposo: mínimo 8h — óptimo 12h · Registrado en cv_carros/ (fijo)</div>
      <div className="flex flex-col gap-3">
        <Txt label="N° de carro" value={d.num_carro} onChange={v=>sD(p=>({...p,num_carro:v}))} ph="ej: C-12 — único por lote"/>
        <div className="grid grid-cols-2 gap-2">
          <Txt label="Fecha ingreso" value={d.fecha_ingreso_camara} onChange={v=>sD(p=>({...p,fecha_ingreso_camara:v}))} ph="YYYY-MM-DD"/>
          <Txt label="Hora ingreso" value={d.hora_ingreso_camara} onChange={v=>sD(p=>({...p,hora_ingreso_camara:v}))} ph="HH:MM"/>
        </div>
      </div>
    </div>

    {/* ── SECTOR 3: LAMINADO MANUAL + PCC HOJALDRE ──────────── */}
    <div className="bg-violet-50 border border-violet-200 rounded-xl p-3">
      <div className="text-xs font-bold text-violet-700 uppercase tracking-wide mb-1">📋 Sector 3 — Laminado manual / Salida de cámara</div>
      <div className="text-[10px] text-violet-500 mb-3">T° ambiente válida para laminado: 16°C a 20°C (registrar en Temperaturas)</div>
      <div className="flex flex-col gap-3">
        <Txt label="N° de carro (mismo que ingreso)" value={d.num_carro_laminado} onChange={v=>sD(p=>({...p,num_carro_laminado:v}))} ph="debe coincidir con Sector 2"/>
        <div className="grid grid-cols-2 gap-2">
          <Txt label="Fecha salida cámara" value={d.fecha_salida_camara} onChange={v=>sD(p=>({...p,fecha_salida_camara:v}))} ph="YYYY-MM-DD"/>
          <Txt label="Hora salida cámara" value={d.hora_salida_camara} onChange={v=>sD(p=>({...p,hora_salida_camara:v}))} ph="HH:MM"/>
        </div>
        {horasReposo>0&&<div className={cn("rounded-xl p-3 text-sm text-center font-bold border",horasReposo>=8?"bg-green-50 border-green-300 text-green-700":horasReposo>=12?"bg-blue-50 border-blue-300 text-blue-700":"bg-red-50 border-red-300 text-red-700")}>
          ⏱ Reposo en cámara: {horasReposo}h {horasReposo<8?"⚠ MÍNIMO 8h — desvío de proceso":horasReposo>=12?"✓ Óptimo (12h)":"✓ Mínimo cumplido"}
        </div>}
        {/* PCC Hojaldre */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-red-700">🔴 PCC — Corte: Hojaldre visible</label>
          <button onClick={()=>sD(p=>({...p,hojaldre_ok:!p.hojaldre_ok}))} className={cn("h-12 rounded-xl border-2 text-sm font-bold",d.hojaldre_ok?"border-green-400 bg-green-50 text-green-700":"border-red-300 bg-red-50 text-red-700")}>
            {d.hojaldre_ok?"✓ CUMPLE — Hojaldre visible en corte":"✕ NO CUMPLE — Hojaldre no visible (NC)"}
          </button>
          {aHojaldre&&<div className="bg-red-50 border border-red-300 rounded-lg p-2 text-xs text-red-700 font-medium">⚠ PCC fuera de límite — Generar NC inmediatamente. No continuar proceso.</div>}
        </div>
      </div>
    </div>

    {/* ── SECTOR 4: LAMINADO AUTOMÁTICO ─────────────────────── */}
    <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
      <div className="text-xs font-bold text-orange-700 uppercase tracking-wide mb-3">⚙️ Sector 4 — Laminado automático (P280 §5)</div>
      <div className="flex flex-col gap-3">
        <Txt label="Maquinista Laminadora Automática" value={d.maquinista_lam_auto} onChange={v=>sD(p=>({...p,maquinista_lam_auto:v}))} ph="Nombre del operario"/>
        <div className="grid grid-cols-3 gap-2">
          <Num label="Calibre inicio" spec="PC" value={d.calibre_inicio} onChange={v=>sD(p=>({...p,calibre_inicio:v}))}/>
          <Num label="Calibre fin" spec="PC" value={d.calibre_fin} onChange={v=>sD(p=>({...p,calibre_fin:v}))}/>
          <Num label="Ancho (cm)" spec="PC" value={d.ancho_cm} onChange={v=>sD(p=>({...p,ancho_cm:v}))}/>
        </div>
      </div>
    </div>

    {/* ── SECTOR 5: MEDIALUNERA + PESOS ─────────────────────── */}
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
      <div className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-3">🥐 Sector 5 — Medialunera + Pesos (P280 §6)</div>
      <div className="flex flex-col gap-3">
        <Txt label="Maquinista 12 Mil" value={d.maquinista_12mil} onChange={v=>sD(p=>({...p,maquinista_12mil:v}))} ph="Nombre del operario"/>
        <Num label="Calibre medialunera" spec="PC" value={d.calibre_medialunera} onChange={v=>sD(p=>({...p,calibre_medialunera:v}))}/>
        <div className="text-xs font-semibold text-blue-700">⚖️ Pesos — PCC: {pesoObj}g ±5g · 15 muestras (inicio / medio / fin)</div>
        {(["muestras_inicio","muestras_medio","muestras_fin"] as const).map((grupo,gi)=>{
          const labels=["Inicio","Medio","Fin"];const prom=[pi,pm,pf][gi];
          return<div key={grupo} className="bg-white rounded-lg p-2 flex flex-col gap-2 border border-amber-100">
            <div className="flex items-center justify-between"><span className="text-xs font-semibold text-gray-600">{labels[gi]} — 5 muestras</span>{prom>0&&<span className={cn("text-xs font-bold",Math.abs(prom-pesoObj)>5?"text-red-600":"text-green-600")}>X̄ {prom}g</span>}</div>
            <div className="grid grid-cols-5 gap-1">{d[grupo].map((v,i)=><input key={i} type="number" inputMode="decimal" value={v} onChange={e=>setMuestra(grupo,i,e.target.value)} placeholder={`${i+1}`} className={cn("h-9 rounded-lg border text-center text-xs font-mono",v!==""&&Math.abs(parseFloat(v)-pesoObj)>5?"border-red-400 bg-red-50":"border-gray-200 bg-white")}/>)}</div>
          </div>;})}
        {pt>0&&<div className={cn("rounded-xl p-3 flex items-center justify-between border font-bold",aPeso?"border-red-300 bg-red-50":"border-green-300 bg-green-50")}>
          <span className={aPeso?"text-red-700":"text-green-700"}>{aPeso?"⚠ PCC — Peso fuera de rango":"✓ Peso en rango"} · X̄ {pt}g</span>
          <span className={cn("text-xl",aPeso?"text-red-600":"text-green-600")}>{dv}%</span>
        </div>}
        {aPeso&&<Sel label="Acción correctiva peso" value={d.ajustado} onChange={v=>sD(p=>({...p,ajustado:v}))} al={!d.ajustado} opts={[{v:"si",l:"✓ Calibre ajustado"},{v:"no",l:"Sin ajuste (documentar)"},{v:"retirado",l:"Retirado de línea"}]}/>}
        <Num label="% recupero sobre harina del amasijo" spec="PC — Límite: ≤10%" value={d.pct_recupero} onChange={v=>sD(p=>({...p,pct_recupero:v}))} al={aRecupero}/>
        {aRecupero&&<div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-700">⚠ Recupero excede límite — revisar recortes y proceso.</div>}
      </div>
    </div>

    {/* ── SECTOR 6: FERMENTADOR ─────────────────────────────── */}
    <div className="bg-green-50 border border-green-200 rounded-xl p-3">
      <div className="text-xs font-bold text-green-700 uppercase tracking-wide mb-1">🌡️ Sector 6 — Fermentador (P280 §8)</div>
      <div className="text-[10px] text-green-500 mb-3">Seteo: 33°C · 90% humedad · 60 min — Variación posible según condición ambiental</div>
      <div className="flex flex-col gap-3">
        <Txt label="N° de carro fermentador" value={d.num_carro_fermentador} onChange={v=>sD(p=>({...p,num_carro_fermentador:v}))} ph="Trazabilidad fija"/>
        <div className="grid grid-cols-2 gap-2">
          <Txt label="Hora ingreso" value={d.hora_ingreso_fermentador} onChange={v=>sD(p=>({...p,hora_ingreso_fermentador:v}))} ph="HH:MM"/>
          <Txt label="Hora salida" value={d.hora_salida_fermentador} onChange={v=>sD(p=>({...p,hora_salida_fermentador:v}))} ph="HH:MM"/>
        </div>
        <Num label="T° fermentador (°C)" spec="PCC — 28°C ±3°C" value={d.t_fermentador} onChange={v=>sD(p=>({...p,t_fermentador:v}))} al={aFerment}/>
        <div className="grid grid-cols-2 gap-2">
          <Num label="Humedad (%)" spec="PCC — 90%" value={d.humedad_fermentador} onChange={v=>sD(p=>({...p,humedad_fermentador:v}))} al={aHumedad}/>
          <Num label="Tiempo (min)" spec="PCC — 60 min" value={d.tiempo_fermentado} onChange={v=>sD(p=>({...p,tiempo_fermentado:v}))} al={aTiempoFerm}/>
        </div>
        {(aFerment||aHumedad||aTiempoFerm)&&<div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">⚠ PCC fermentador fuera de parámetro — documentar causa y acción en Observaciones.</div>}
      </div>
    </div>

    {/* ── SECTOR 7: ABATIDOR ────────────────────────────────── */}
    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3">
      <div className="text-xs font-bold text-indigo-700 uppercase tracking-wide mb-1">❄️ Sector 7 — Abatidor (P280 §9)</div>
      <div className="text-[10px] text-indigo-400 mb-3">{isMant?"Manteca: seteo -24°C ±2°C · salida ≤-12°C · ~60 min":isGrasa?"Grasa: -16°C a -20°C · ~60 min":"Seleccionar variedad arriba"}</div>
      <div className="flex flex-col gap-3">
        <Txt label="N° de carro abatidor" value={d.num_carro_abatidor} onChange={v=>sD(p=>({...p,num_carro_abatidor:v}))} ph="Trazabilidad fija"/>
        <Num label="T° seteo abatidor (°C)" spec={isMant?"PCC — -24°C ±2°C":isGrasa?"PCC — -16°C a -20°C":""} value={d.t_abatidor} onChange={v=>sD(p=>({...p,t_abatidor:v}))} al={aAbat}/>
        <Num label="Tiempo abatido (min)" spec="~60 min" value={d.tiempo_abatido} onChange={v=>sD(p=>({...p,tiempo_abatido:v}))}/>
        {isMant&&<Num label="T° salida abatidor (°C)" spec="PCC CRÍTICO — ≤-12°C para habilitar envasado" value={d.t_salida_abatidor} onChange={v=>sD(p=>({...p,t_salida_abatidor:v}))} al={aSalida}/>}
        {aSalida&&<div className="bg-red-50 border border-red-300 rounded-lg p-2 text-xs text-red-700 font-semibold">🔴 PCC CRÍTICO — Medialuna no habilitada para envasado. Continuar abatido.</div>}
        {aAbat&&<div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">⚠ T° abatidor NC — verificar carga y funcionamiento.</div>}
      </div>
    </div>

    {/* ── SECTOR 8: ENVASADO ────────────────────────────────── */}
    <div className="bg-teal-50 border border-teal-200 rounded-xl p-3">
      <div className="text-xs font-bold text-teal-700 uppercase tracking-wide mb-1">📦 Sector 8 — Envasado (P280 §10)</div>
      <div className="text-[10px] text-teal-500 mb-3">Habilitado solo si T° salida abatidor ≤-12°C · 180 und/cajón (4 bandejas + 12 sueltas)</div>
      <div className="flex flex-col gap-3">
        <Num label="T° medialunas al envasar (°C)" spec="PCC — debe ser ≤-12°C" value={d.t_medialunas_envasar} onChange={v=>sD(p=>({...p,t_medialunas_envasar:v}))} al={aEnvasado}/>
        {aEnvasado&&<div className="bg-red-50 border border-red-300 rounded-lg p-2 text-xs text-red-700 font-semibold">🔴 PCC — No envasar. T° no cumple. Devolver a abatidor.</div>}
        <Chk label="✓ Bandejas completas (42 manteca / 36 grasa por bandeja)" value={d.bandejas_unidades_ok} onChange={v=>sD(p=>({...p,bandejas_unidades_ok:v}))}/>
        <Chk label="✓ Etiqueta vigente con fecha, tipo y lote visible" value={d.etiqueta_vigente} onChange={v=>sD(p=>({...p,etiqueta_vigente:v}))}/>
        <TA label="Obs. envasado" value={d.obs_envasado} onChange={v=>sD(p=>({...p,obs_envasado:v}))} ph="Novedades, cantidades, incidencias…"/>
      </div>
    </div>

    {/* ── SECTOR 9: SENSORIAL ───────────────────────────────── */}
    <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
      <div className="text-xs font-bold text-purple-700 uppercase tracking-wide mb-3">👅 Sector 9 — Evaluación sensorial</div>
      <div className="flex flex-col gap-2">
        <Chk label="✓ Color adecuado — dorado uniforme" value={d.color_ok} onChange={v=>sD(p=>({...p,color_ok:v}))}/>
        <Chk label="✓ Forma correcta — punta al centro hacia abajo, sin aperturas" value={d.forma_ok} onChange={v=>sD(p=>({...p,forma_ok:v}))}/>
        <Chk label="✓ Textura y hojaldrado OK" value={d.textura_ok} onChange={v=>sD(p=>({...p,textura_ok:v}))}/>
      </div>
      <div className="mt-3"><TA label="Obs. sensorial" value={d.sensorial_obs} onChange={v=>sD(p=>({...p,sensorial_obs:v}))} ph="Desvíos de color, aroma, textura, apertura…"/></div>
    </div>

    <Fotos fotos={d.fotos} onAdd={f=>sD(p=>({...p,fotos:[...p.fotos,f]}))} onRemove={id=>sD(p=>({...p,fotos:p.fotos.filter(f=>f.id!==id)}))}/>
    <TA label="Observaciones generales / acciones correctivas" value={d.observaciones} onChange={v=>sD(p=>({...p,observaciones:v}))}/>
  </>}/>;
}
// ── FORM BPM (por incumplimiento) ─────────────────────────────
function FBPM({u,onSave,onCancel}:{u:Usuario;onSave:(r:Reg)=>void;onCancel:()=>void}){
  const[d,sD]=useState({sector:"",operario:"",incumplimientos:[] as string[],accion_tomada:"",responsable_sector:"",observaciones:"",fotos:[] as FotoMeta[]});const[g,sG]=useState(false);
  function toggle(item:string){sD(p=>({...p,incumplimientos:p.incumplimientos.includes(item)?p.incumplimientos.filter(x=>x!==item):[...p.incumplimientos,item]}));}
  async function sv(){sG(true);onSave({id:gid("bpm"),tipo:"bpm",turno:u.turno,responsable:u.nombre,fecha:hoy(),hora:ahora(),timestamp:new Date().toISOString(),alertas:{bpm_nc:d.incumplimientos.length>0},...d} as RBPM);sG(false);}
  return<FW titulo="👤 BPM — Incumplimiento" sub="Registrar operario y desvío" onCancel={onCancel} onSave={sv} g={g} ch={<>
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">Registrá solo cuando hay incumplimiento de BPM. El historial acumulado aparece en reportes.</div>
    <Txt label="Sector" value={d.sector} onChange={v=>sD(p=>({...p,sector:v}))} ph="ej: Producción / Laminado"/>
    <Txt label="Operario en incumplimiento" value={d.operario} onChange={v=>sD(p=>({...p,operario:v}))} ph="Nombre y apellido"/>
    <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">Ítems incumplidos ({d.incumplimientos.length})</label>
      <div className="flex flex-col gap-1.5">{BPM_ITEMS.map(item=><button key={item} onClick={()=>toggle(item)} className={cn("flex items-center gap-2 p-2.5 rounded-lg border text-sm text-left",d.incumplimientos.includes(item)?"border-red-400 bg-red-50 text-red-800":"border-gray-200 bg-white text-gray-700")}><span className={cn("w-5 h-5 rounded flex items-center justify-center flex-shrink-0 text-xs border",d.incumplimientos.includes(item)?"bg-red-500 border-red-500 text-white":"border-gray-300")}>{d.incumplimientos.includes(item)?"✕":""}</span>{item}</button>)}</div>
    </div>
    <TA label="Acción tomada" value={d.accion_tomada} onChange={v=>sD(p=>({...p,accion_tomada:v}))} ph="Corrección inmediata realizada"/>
    <Txt label="Responsable de sector" value={d.responsable_sector} onChange={v=>sD(p=>({...p,responsable_sector:v}))}/>
    <Fotos fotos={d.fotos} onAdd={f=>sD(p=>({...p,fotos:[...p.fotos,f]}))} onRemove={id=>sD(p=>({...p,fotos:p.fotos.filter(f=>f.id!==id)}))}/>
    <TA label="Observaciones" value={d.observaciones} onChange={v=>sD(p=>({...p,observaciones:v}))}/>
  </>}/>;
}

// ── FORM RECEPCIÓN MP ─────────────────────────────────────────
function FRecep({u,onSave,onCancel}:{u:Usuario;onSave:(r:Reg)=>void;onCancel:()=>void}){
  const[d,sD]=useState({proveedor_id:"",proveedor_nombre:"",producto:"",remito_lote:"",cantidad_kg:"",vto:"",t_ingreso:"",estado_envase:"",rotulado_ok:false,fifo_ok:false,resultado:"",observaciones:"",fotos:[] as FotoMeta[]});
  const[provs,setProvs]=useState<Proveedor[]>([]);const[g,sG]=useState(false);
  useEffect(()=>{loadProveedores().then(setProvs);},[]);
  const at=d.t_ingreso!==""&&parseFloat(d.t_ingreso)>7;
  async function sv(){sG(true);onSave({id:gid("rec"),tipo:"recepcion",turno:u.turno,responsable:u.nombre,fecha:hoy(),hora:ahora(),timestamp:new Date().toISOString(),alertas:{t_ingreso:at,rechazado:d.estado_envase==="rechazado"||d.resultado==="rechazado"},...d} as RRecep);sG(false);}
  function selProv(id:string){const p=provs.find(x=>x.id===id);sD(prev=>({...prev,proveedor_id:id,proveedor_nombre:p?.nombre||""}));}
  return<FW titulo="🚚 Recepción MP" sub="HACCP PCC · BD Proveedores" onCancel={onCancel} onSave={sv} g={g} ch={<>
    <Sel label="Proveedor (BD)" value={d.proveedor_id} onChange={selProv} opts={provs.filter(p=>p.activo).map(p=>({v:p.id,l:p.nombre}))}/>
    {!d.proveedor_id&&<Txt label="O ingresá proveedor manualmente" value={d.proveedor_nombre} onChange={v=>sD(p=>({...p,proveedor_nombre:v}))} ph="Nombre del proveedor"/>}
    <Txt label="Producto" value={d.producto} onChange={v=>sD(p=>({...p,producto:v}))}/>
    <Txt label="N° remito / lote" value={d.remito_lote} onChange={v=>sD(p=>({...p,remito_lote:v}))} ph="Trazabilidad"/>
    <div className="grid grid-cols-2 gap-2">
      <Num label="Cantidad (Kg)" value={d.cantidad_kg} onChange={v=>sD(p=>({...p,cantidad_kg:v}))}/>
      <Txt label="Vencimiento" value={d.vto} onChange={v=>sD(p=>({...p,vto:v}))} ph="DD/MM/YYYY"/>
    </div>
    <Num label="T° ingreso (°C)" spec="PCC — ≤7°C refrigerado / ≤-18°C congelado" value={d.t_ingreso} onChange={v=>sD(p=>({...p,t_ingreso:v}))} al={at}/>
    <Sel label="Estado envase" value={d.estado_envase} onChange={v=>sD(p=>({...p,estado_envase:v}))} al={d.estado_envase==="rechazado"} opts={[{v:"integro",l:"✓ Íntegro"},{v:"danado",l:"⚠ Dañado"},{v:"rechazado",l:"✕ Rechazado"}]}/>
    <Chk label="Rotulado correcto (fecha, lote, denominación)" value={d.rotulado_ok} onChange={v=>sD(p=>({...p,rotulado_ok:v}))}/>
    <Chk label="FIFO/FEFO aplicado" value={d.fifo_ok} onChange={v=>sD(p=>({...p,fifo_ok:v}))}/>
    <Sel label="Resultado" value={d.resultado} onChange={v=>sD(p=>({...p,resultado:v}))} al={d.resultado==="rechazado"} opts={[{v:"aprobado",l:"✓ Aprobado"},{v:"observado",l:"⚠ Con observación"},{v:"rechazado",l:"✕ Rechazado"}]}/>
    <Fotos fotos={d.fotos} onAdd={f=>sD(p=>({...p,fotos:[...p.fotos,f]}))} onRemove={id=>sD(p=>({...p,fotos:p.fotos.filter(f=>f.id!==id)}))}/>
    <TA label="Observaciones" value={d.observaciones} onChange={v=>sD(p=>({...p,observaciones:v}))}/>
  </>}/>;
}

// ── FORM DESPACHO ─────────────────────────────────────────────
function FDesp({u,onSave,onCancel}:{u:Usuario;onSave:(r:Reg)=>void;onCancel:()=>void}){
  const[d,sD]=useState({local_destino:"",producto:"",lote:"",cantidad:"",t_despacho:"",t_transporte:"",etiquetado_ok:false,estado_embalaje:"",chofer:"",patente:"",observaciones:"",fotos:[] as FotoMeta[]});const[g,sG]=useState(false);
  const atd=d.t_despacho!==""&&parseFloat(d.t_despacho)>-12;const att=d.t_transporte!==""&&parseFloat(d.t_transporte)>-10;
  async function sv(){sG(true);onSave({id:gid("dsp"),tipo:"despacho",turno:u.turno,responsable:u.nombre,fecha:hoy(),hora:ahora(),timestamp:new Date().toISOString(),alertas:{t_despacho:atd,sin_etiqueta:!d.etiquetado_ok},...d} as RDesp);sG(false);}
  return<FW titulo="📦 Despacho" sub="PCC + Trazabilidad" onCancel={onCancel} onSave={sv} g={g} ch={<>
    <Txt label="Local destino" value={d.local_destino} onChange={v=>sD(p=>({...p,local_destino:v}))}/>
    <Txt label="Chofer" value={d.chofer} onChange={v=>sD(p=>({...p,chofer:v}))} ph="Nombre y apellido"/>
    <Txt label="Patente" value={d.patente} onChange={v=>sD(p=>({...p,patente:v}))} ph="ej: AB 123 CD"/>
    <Txt label="Producto" value={d.producto} onChange={v=>sD(p=>({...p,producto:v}))}/>
    <Txt label="Lote" value={d.lote} onChange={v=>sD(p=>({...p,lote:v}))}/>
    <Num label="Cantidad / unidades" value={d.cantidad} onChange={v=>sD(p=>({...p,cantidad:v}))}/>
    <Num label="T° producto a despachar (°C)" spec="PCC — ≤-12°C" value={d.t_despacho} onChange={v=>sD(p=>({...p,t_despacho:v}))} al={atd}/>
    <Num label="T° transporte (°C)" spec="PCC — ≤-10°C" value={d.t_transporte} onChange={v=>sD(p=>({...p,t_transporte:v}))} al={att}/>
    <Chk label="Etiquetado correcto (fecha, vencimiento, lote)" value={d.etiquetado_ok} onChange={v=>sD(p=>({...p,etiquetado_ok:v}))}/>
    <Sel label="Estado embalaje" value={d.estado_embalaje} onChange={v=>sD(p=>({...p,estado_embalaje:v}))} opts={[{v:"integro",l:"✓ Íntegro"},{v:"con_dano",l:"⚠ Con daño"}]}/>
    <Fotos fotos={d.fotos} onAdd={f=>sD(p=>({...p,fotos:[...p.fotos,f]}))} onRemove={id=>sD(p=>({...p,fotos:p.fotos.filter(f=>f.id!==id)}))}/>
    <TA label="Observaciones" value={d.observaciones} onChange={v=>sD(p=>({...p,observaciones:v}))}/>
  </>}/>;
}

// ── FORM NC ───────────────────────────────────────────────────
function FNC({u,onSave,onCancel}:{u:Usuario;onSave:(r:Reg)=>void;onCancel:()=>void}){
  const[d,sD]=useState({tipo_nc:"",descripcion:"",lote_afectado:"",causa_raiz:"",accion_inmediata:"",requiere_nc_formal:false,responsable_sector:"",fotos:[] as FotoMeta[]});const[g,sG]=useState(false);
  async function sv(){sG(true);onSave({id:gid("nc"),tipo:"nc",turno:u.turno,responsable:u.nombre,fecha:hoy(),hora:ahora(),timestamp:new Date().toISOString(),alertas:{sin_accion:!d.accion_inmediata},...d} as RNC);sG(false);}
  return<FW titulo="⚠️ No Conformidad" sub="ISO 9001" onCancel={onCancel} onSave={sv} g={g} ch={<><div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">Registrá todos los desvíos. El historial es tu evidencia.</div><Sel label="Tipo" value={d.tipo_nc} onChange={v=>sD(p=>({...p,tipo_nc:v}))} opts={[{v:"proceso",l:"Proceso"},{v:"producto",l:"Producto"},{v:"bpm",l:"BPM"},{v:"proveedor",l:"Proveedor"},{v:"infraestructura",l:"Infraestructura"}]}/><TA label="Descripción del desvío" value={d.descripcion} onChange={v=>sD(p=>({...p,descripcion:v}))} ph="Qué, dónde, cuándo"/><Txt label="Lote afectado" value={d.lote_afectado} onChange={v=>sD(p=>({...p,lote_afectado:v}))}/><Sel label="Causa raíz" value={d.causa_raiz} onChange={v=>sD(p=>({...p,causa_raiz:v}))} opts={[{v:"humano",l:"Factor humano"},{v:"equipo",l:"Equipo"},{v:"metodo",l:"Método"},{v:"insumo",l:"Materia prima"},{v:"ambiente",l:"Ambiente"}]}/><TA label="Acción inmediata" value={d.accion_inmediata} onChange={v=>sD(p=>({...p,accion_inmediata:v}))} ph="Qué se hizo en el momento"/><Chk label="Requiere NC formal" value={d.requiere_nc_formal} onChange={v=>sD(p=>({...p,requiere_nc_formal:v}))}/><Txt label="Responsable del sector" value={d.responsable_sector} onChange={v=>sD(p=>({...p,responsable_sector:v}))}/><Fotos fotos={d.fotos} onAdd={f=>sD(p=>({...p,fotos:[...p.fotos,f]}))} onRemove={id=>sD(p=>({...p,fotos:p.fotos.filter(f=>f.id!==id)}))}/></>}/>;
}
function FDecom({u,onSave,onCancel}:{u:Usuario;onSave:(r:Reg)=>void;onCancel:()=>void}){
  const[d,sD]=useState({producto:"",lote:"",cantidad_kg:"",motivo:"",etapa_deteccion:"",destino:"",observaciones:"",fotos:[] as FotoMeta[]});const[g,sG]=useState(false);
  async function sv(){sG(true);onSave({id:gid("dec"),tipo:"decomiso",turno:u.turno,responsable:u.nombre,fecha:hoy(),hora:ahora(),timestamp:new Date().toISOString(),alertas:{sin_foto:d.fotos.length===0},...d} as RDecom);sG(false);}
  return<FW titulo="🗑️ Decomiso" sub="HACCP obligatorio" onCancel={onCancel} onSave={sv} g={g} ch={<><div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 font-medium">Foto obligatoria antes de retirar el producto.</div><Txt label="Producto" value={d.producto} onChange={v=>sD(p=>({...p,producto:v}))}/><Txt label="Lote" value={d.lote} onChange={v=>sD(p=>({...p,lote:v}))}/><Num label="Cantidad (kg)" value={d.cantidad_kg} onChange={v=>sD(p=>({...p,cantidad_kg:v}))}/><Sel label="Motivo" value={d.motivo} onChange={v=>sD(p=>({...p,motivo:v}))} opts={[{v:"vencido",l:"Vencido"},{v:"temperatura",l:"Ruptura cadena frío"},{v:"dano",l:"Daño físico"},{v:"contaminacion",l:"Contaminación"},{v:"rotulado",l:"Error rotulado"},{v:"otro",l:"Otro"}]}/><Sel label="Etapa de detección" value={d.etapa_deteccion} onChange={v=>sD(p=>({...p,etapa_deteccion:v}))} opts={[{v:"mp",l:"Recepción MP"},{v:"produccion",l:"Producción"},{v:"pt",l:"Producto terminado"},{v:"despacho",l:"Despacho"}]}/><Sel label="Destino" value={d.destino} onChange={v=>sD(p=>({...p,destino:v}))} opts={[{v:"destruccion",l:"Destrucción"},{v:"devolucion",l:"Devolución"},{v:"reproceso",l:"Reproceso"}]}/><Fotos fotos={d.fotos} onAdd={f=>sD(p=>({...p,fotos:[...p.fotos,f]}))} onRemove={id=>sD(p=>({...p,fotos:p.fotos.filter(f=>f.id!==id)}))}/><TA label="Observaciones" value={d.observaciones} onChange={v=>sD(p=>({...p,observaciones:v}))}/></>}/>;
}
function FLimp({u,onSave,onCancel}:{u:Usuario;onSave:(r:Reg)=>void;onCancel:()=>void}){
  const[d,sD]=useState({sector:"",superficies_contacto:false,pisos_desagues:false,equipos:false,camaras:false,sanitizante:"",concentracion:"",atp_nivel:"",responsable_limpieza:"",observaciones:"",fotos:[] as FotoMeta[]});const[g,sG]=useState(false);
  const pc=[d.superficies_contacto,d.pisos_desagues,d.equipos,d.camaras].filter(Boolean).length*25;
  async function sv(){sG(true);onSave({id:gid("lim"),tipo:"limpieza",turno:u.turno,responsable:u.nombre,fecha:hoy(),hora:ahora(),timestamp:new Date().toISOString(),alertas:{superficies_no_ok:!d.superficies_contacto},...d} as RLimp);sG(false);}
  return<FW titulo="🧹 Limpieza POES" sub="POES/BPM" onCancel={onCancel} onSave={sv} g={g} ch={<><Sel label="Sector" value={d.sector} onChange={v=>sD(p=>({...p,sector:v}))} opts={[{v:"laminado",l:"Laminado"},{v:"medialunera",l:"Medialunera"},{v:"fermentador",l:"Fermentador"},{v:"camara_masas",l:"Cámara de masas"},{v:"camara_pt",l:"Cámara PT"},{v:"envasado",l:"Envasado"},{v:"despacho",l:"Despacho"},{v:"sanitarios",l:"Sanitarios"}]}/><div className="flex items-center justify-between"><div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Verificación</div><div className={cn("text-sm font-bold",pc===100?"text-green-600":"text-amber-600")}>{pc}%</div></div><div className="flex flex-col gap-1.5"><Chk label="Superficies contacto con alimentos (PCC)" value={d.superficies_contacto} onChange={v=>sD(p=>({...p,superficies_contacto:v}))}/><Chk label="Pisos y desagües" value={d.pisos_desagues} onChange={v=>sD(p=>({...p,pisos_desagues:v}))}/><Chk label="Equipos (laminadora, medialunera)" value={d.equipos} onChange={v=>sD(p=>({...p,equipos:v}))}/><Chk label="Cámaras frigoríficas" value={d.camaras} onChange={v=>sD(p=>({...p,camaras:v}))}/></div><Txt label="Sanitizante" value={d.sanitizante} onChange={v=>sD(p=>({...p,sanitizante:v}))}/><Txt label="Concentración" value={d.concentracion} onChange={v=>sD(p=>({...p,concentracion:v}))} ph="ej: 200 ppm cloro"/><Num label="Nivel ATP (si aplica)" value={d.atp_nivel} onChange={v=>sD(p=>({...p,atp_nivel:v}))}/><Txt label="Responsable limpieza" value={d.responsable_limpieza} onChange={v=>sD(p=>({...p,responsable_limpieza:v}))}/><Fotos fotos={d.fotos} onAdd={f=>sD(p=>({...p,fotos:[...p.fotos,f]}))} onRemove={id=>sD(p=>({...p,fotos:p.fotos.filter(f=>f.id!==id)}))}/><TA label="Observaciones" value={d.observaciones} onChange={v=>sD(p=>({...p,observaciones:v}))}/></>}/>;
}

// ── BD PROVEEDORES ────────────────────────────────────────────
function BDProveedores({onBack}:{onBack:()=>void}){
  const[provs,setProvs]=useState<Proveedor[]>([]);const[modo,setModo]=useState<"lista"|"nuevo">("lista");
  const[np,setNp]=useState({id:"",nombre:"",cuit:"",contacto:"",productos:"",activo:true});
  const[cg,setCg]=useState(false);
  useEffect(()=>{setCg(true);loadProveedores().then(p=>{setProvs(p);setCg(false)});},[]);
  async function guardar(){const p:Proveedor={...np,id:np.id||gid("prov")};await saveProveedor(p);setProvs(prev=>[p,...prev.filter(x=>x.id!==p.id)]);setModo("lista");setNp({id:"",nombre:"",cuit:"",contacto:"",productos:"",activo:true});}
  async function eliminar(id:string){await deleteProveedor(id);setProvs(p=>p.filter(x=>x.id!==id));}
  if(modo==="nuevo")return<div className="min-h-screen bg-gray-50 max-w-lg mx-auto pb-24">
    <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-3 flex items-center gap-3"><button onClick={()=>setModo("lista")} className="text-gray-400 p-1">←</button><p className="font-bold text-gray-800">Nuevo proveedor</p></div>
    <div className="p-4 flex flex-col gap-3">
      <Txt label="Nombre" value={np.nombre} onChange={v=>setNp(p=>({...p,nombre:v}))} ph="Razón social"/>
      <Txt label="CUIT" value={np.cuit} onChange={v=>setNp(p=>({...p,cuit:v}))} ph="XX-XXXXXXXX-X"/>
      <Txt label="Contacto" value={np.contacto} onChange={v=>setNp(p=>({...p,contacto:v}))} ph="Tel / email"/>
      <TA label="Productos habituales" value={np.productos} onChange={v=>setNp(p=>({...p,productos:v}))} ph="Harina 0000, Manteca…"/>
      <button onClick={guardar} className="h-11 rounded-xl bg-blue-500 text-white font-semibold text-sm">Guardar proveedor</button>
    </div>
  </div>;
  return<div className="min-h-screen bg-gray-50 max-w-lg mx-auto pb-24">
    <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-3 flex items-center justify-between">
      <div className="flex items-center gap-3"><button onClick={onBack} className="text-gray-400 p-1">←</button><p className="font-bold text-gray-800">BD Proveedores</p></div>
      <button onClick={()=>setModo("nuevo")} className="text-xs bg-blue-500 text-white px-3 py-1.5 rounded-lg font-medium">+ Nuevo</button>
    </div>
    <div className="p-4 flex flex-col gap-2">
      {cg?<div className="flex justify-center p-8"><Spin/></div>:provs.length===0?<div className="text-center p-8 text-gray-400 text-sm">Sin proveedores registrados</div>
      :provs.map(p=><div key={p.id} className="bg-white border border-gray-200 rounded-xl p-3">
        <div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold text-gray-800">{p.nombre}</p><p className="text-xs text-gray-400 mt-0.5">CUIT: {p.cuit}</p>{p.contacto&&<p className="text-xs text-gray-400">{p.contacto}</p>}{p.productos&&<p className="text-xs text-gray-500 mt-1">Productos: {p.productos}</p>}</div>
          <button onClick={()=>eliminar(p.id)} className="text-[10px] text-red-400 hover:text-red-600 flex-shrink-0 mt-0.5">Eliminar</button>
        </div>
      </div>)}
    </div>
  </div>;
}

// ── CATEGORÍA DESPLEGABLE ─────────────────────────────────────
function CategoriaDrop({icon,label,badge,count,alertas,children}:{icon:string;label:string;badge:string;count:number;alertas:number;children:React.ReactNode}){
  const[open,sO]=useState(true);
  return<div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
    <button onClick={()=>sO(!open)} className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 transition-colors">
      <span className="text-base">{icon}</span>
      <span className="text-sm font-semibold text-gray-800 flex-1 text-left">{label}</span>
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{count}</span>
      {alertas>0&&<ABadge n={alertas}/>}
      <span className="text-gray-400 text-xs">{open?"▲":"▼"}</span>
    </button>
    {open&&<div className="border-t border-gray-100 p-2 flex flex-col gap-2">{children}</div>}
  </div>;
}

// ── FORM AUDITORÍA INTERNA ────────────────────────────────────
const SECTORES_AUDIT=[
  {k:"pct_recepcion",l:"Recepción MP"},
  {k:"pct_amasado",l:"Amasado"},
  {k:"pct_laminado",l:"Laminado"},
  {k:"pct_medialunera",l:"Medialunera"},
  {k:"pct_fermentador",l:"Fermentador"},
  {k:"pct_abatidor",l:"Abatidor"},
  {k:"pct_envasado",l:"Envasado"},
  {k:"pct_camara_pt",l:"Cámara PT"},
  {k:"pct_bpm",l:"BPM Personal"},
  {k:"pct_limpieza",l:"Limpieza POES"},
] as const;

function FAuditoria({u,onSave,onCancel}:{u:Usuario;onSave:(a:RAuditoria)=>void;onCancel:()=>void}){
  const[d,sD]=useState<Record<string,string>>(Object.fromEntries(SECTORES_AUDIT.map(s=>[s.k,""])));
  const[obs,sObs]=useState("");const[acc,sAcc]=useState("");const[g,sG]=useState(false);
  const vals=SECTORES_AUDIT.map(s=>parseFloat(d[s.k])).filter(v=>!isNaN(v)&&v>=0&&v<=100);
  const total=vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):0;
  const colorTotal=total>=90?"text-green-600":total>=70?"text-amber-600":"text-red-600";
  const bgTotal=total>=90?"bg-green-50 border-green-300":total>=70?"bg-amber-50 border-amber-300":"bg-red-50 border-red-300";
  async function sv(){sG(true);const a:RAuditoria={id:gid("aud"),fecha:hoy(),hora:ahora(),responsable:u.nombre,turno:u.turno,...Object.fromEntries(SECTORES_AUDIT.map(s=>[s.k,d[s.k]])) as unknown as RAuditoria,pct_total:total,observaciones:obs,acciones:acc};await saveAuditoria(a);onSave(a);sG(false);}
  return<FW titulo="📋 Auditoría Interna" sub="Cargar % de cumplimiento por sector" onCancel={onCancel} onSave={sv} g={g} ch={<>
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">Ingresá el % de cumplimiento (0-100) para cada sector. Se calcula el promedio automáticamente.</div>
    {total>0&&<div className={cn("rounded-2xl border p-4 text-center",bgTotal)}>
      <div className="text-xs text-gray-500 mb-1">Valor de Auditoría</div>
      <div className={cn("text-4xl font-bold",colorTotal)}>{total}%</div>
      <div className="text-xs mt-1">{total>=90?"✓ Excelente":total>=70?"⚠ Requiere mejoras":"🔴 Crítico — acción inmediata"}</div>
      <div className="h-3 bg-gray-200 rounded-full mt-2 overflow-hidden"><div className={cn("h-full rounded-full transition-all",total>=90?"bg-green-500":total>=70?"bg-amber-500":"bg-red-500")} style={{width:`${total}%`}}/></div>
    </div>}
    <div className="flex flex-col gap-3">
      {SECTORES_AUDIT.map(s=>{const v=parseFloat(d[s.k]);const ok=!isNaN(v)&&v>=0&&v<=100;const color=ok?(v>=90?"text-green-600":v>=70?"text-amber-600":"text-red-600"):"text-gray-400";
        return<div key={s.k} className="flex items-center gap-3">
          <label className="text-sm text-gray-700 w-36 flex-shrink-0">{s.l}</label>
          <div className="flex-1 relative">
            <input type="number" min="0" max="100" inputMode="decimal" value={d[s.k]} onChange={e=>sD(p=>({...p,[s.k]:e.target.value}))} placeholder="0–100" className={cn("w-full h-10 rounded-lg border px-3 pr-8 text-sm font-mono",d[s.k]&&!ok?"border-red-300":"border-gray-200")}/>
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
          </div>
          {ok&&<div className={cn("text-sm font-bold w-12 text-right",color)}>{v}%</div>}
          {ok&&<div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden"><div className={cn("h-full rounded-full",v>=90?"bg-green-500":v>=70?"bg-amber-400":"bg-red-500")} style={{width:`${v}%`}}/></div>}
        </div>;})}
    </div>
    <TA label="Observaciones" value={obs} onChange={sObs} ph="Hallazgos, desvíos, observaciones de la auditoría…"/>
    <TA label="Acciones requeridas" value={acc} onChange={sAcc} ph="Plan de acción, responsables, fechas…"/>
  </>}/>;
}

// ── TRAZABILIDAD CARROS ───────────────────────────────────────
const ETAPAS_LABEL:Record<string,string>={
  amasado_ingreso_camara:"🫱 Amasado → Cámara",
  laminado_salida_camara:"📋 Laminado → Salida",
  fermentador:"🌡️ Fermentador",
  abatidor:"❄️ Abatidor",
};
function BTrazCarros({semDias,onBack}:{semDias:DiaI[];onBack:()=>void}){
  const[carros,setCarros]=useState<TrazCarro[]>([]);const[cg,setCg]=useState(false);const[exp,setExp]=useState<string|null>(null);const[busq,sBusq]=useState("");
  const fechas=semDias.filter(d=>d.fecha).map(d=>d.fecha).sort();
  const desde=fechas[0]||"";const hasta=fechas[fechas.length-1]||"";
  useEffect(()=>{if(!desde)return;setCg(true);loadTrazCarrosSemana(desde,hasta).then(c=>{setCarros(c);setCg(false);});},[desde]);
  const filtrados=carros.filter(c=>{const q=busq.toLowerCase();return!q||c.num_carro.toLowerCase().includes(q)||c.variedad?.toLowerCase().includes(q)||c.lote_harina?.toLowerCase().includes(q);});
  return<div className="min-h-screen bg-gray-50 max-w-lg mx-auto pb-24">
    <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-3 sticky top-0 z-10">
      <div className="flex items-center gap-3 mb-3"><button onClick={onBack} className="text-gray-400 p-1 text-lg">←</button>
        <div className="flex-1"><p className="text-base font-bold text-gray-800">🚛 Trazabilidad de Carros</p><p className="text-xs text-gray-400">{desde?`${fd(desde)} — ${fd(hasta)}`:""} · {carros.length} carros</p></div>{cg&&<Spin/>}
      </div>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
        <input value={busq} onChange={e=>sBusq(e.target.value)} placeholder="Buscar N° carro, variedad, lote…" className="w-full h-10 rounded-xl border border-gray-200 pl-8 pr-3 text-sm bg-white"/>
        {busq&&<button onClick={()=>sBusq("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">✕</button>}
      </div>
    </div>
    <div className="p-4 flex flex-col gap-3">
      {filtrados.length===0?<div className="text-center py-12 text-gray-400"><div className="text-3xl mb-2">🚛</div><p className="text-sm">Sin carros registrados</p></div>
      :filtrados.map(c=>{const isExp=exp===c.num_carro;const etapasComp=c.etapas.length;
        return<div key={c.num_carro} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="p-3 flex items-center justify-between" onClick={()=>setExp(isExp?null:c.num_carro)}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 font-bold text-sm flex items-center justify-center">{c.num_carro}</div>
              <div>
                <div className="text-sm font-semibold text-gray-800">{c.variedad==="manteca"?"🥐 Manteca":c.variedad==="grasa"?"🥐 Grasa":"🥐 —"} · Lote: {c.lote_harina||"—"}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{etapasComp} etapas · Últ. actualización: {c.ultimo_update?new Date(c.ultimo_update).toLocaleString("es-AR",{dateStyle:"short",timeStyle:"short"}):""}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex gap-0.5">{(["amasado_ingreso_camara","laminado_salida_camara","fermentador","abatidor"] as const).map(e=><div key={e} className={cn("w-2 h-2 rounded-full",c.etapas.some(x=>x.etapa===e)?"bg-green-500":"bg-gray-200")}/>)}</div>
              <span className="text-gray-400 text-xs">{isExp?"▲":"▼"}</span>
            </div>
          </div>
          {isExp&&<div className="border-t border-gray-100 p-3 flex flex-col gap-2">
            {c.etapas.sort((a,b)=>a.fecha.localeCompare(b.fecha)||a.hora.localeCompare(b.hora)).map((e,i)=><div key={i} className="bg-gray-50 rounded-xl p-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-gray-700">{ETAPAS_LABEL[e.etapa]||e.etapa}</span>
                <span className="text-[10px] text-gray-400">{fd(e.fecha)} {e.hora} · {e.turno} · {e.operario}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-gray-600">
                {Object.entries(e.datos).filter(([,v])=>v).map(([k,v])=><span key={k}><b>{k.replace(/_/g," ")}</b>: {v}</span>)}
              </div>
            </div>)}
          </div>}
        </div>;})}
    </div>
  </div>;
}

// ── KPI AUDITORÍAS ────────────────────────────────────────────
function KPIAuditoria({auditorias}:{auditorias:RAuditoria[]}){
  if(!auditorias.length)return null;
  const data=auditorias.slice(0,8).reverse().map(a=>({fecha:fd(a.fecha),pct:a.pct_total}));
  const ult=auditorias[0];
  const color=ult.pct_total>=90?"text-green-600":ult.pct_total>=70?"text-amber-600":"text-red-600";
  const bg=ult.pct_total>=90?"bg-green-50 border-green-300":ult.pct_total>=70?"bg-amber-50 border-amber-300":"bg-red-50 border-red-300";
  return<div className={cn("rounded-2xl border p-4",bg)}>
    <div className="flex items-center justify-between mb-3">
      <div><div className="text-xs font-bold text-gray-600 uppercase tracking-wide">📋 Auditoría Interna</div><div className="text-[10px] text-gray-400">{fd(ult.fecha)} · {ult.responsable}</div></div>
      <div className={cn("text-3xl font-bold",color)}>{ult.pct_total}%</div>
    </div>
    {data.length>1&&<ResponsiveContainer width="100%" height={70}><BarChart data={data} margin={{top:0,right:0,left:-30,bottom:0}}><XAxis dataKey="fecha" tick={{fontSize:8}}/><YAxis domain={[0,100]} tick={{fontSize:8}}/><Tooltip formatter={(v)=>`${v}%`}/><Bar dataKey="pct" fill={ult.pct_total>=90?"#22c55e":ult.pct_total>=70?"#f59e0b":"#ef4444"} radius={[3,3,0,0]} name="Auditoría %"/></BarChart></ResponsiveContainer>}
    <div className="grid grid-cols-5 gap-1 mt-2">
      {SECTORES_AUDIT.map(s=>{const v=parseFloat((ult as unknown as Record<string,string>)[s.k])||0;return<div key={s.k} className="text-center"><div className="text-[9px] text-gray-400 truncate">{s.l.split(" ")[0]}</div><div className={cn("text-xs font-bold",v>=90?"text-green-600":v>=70?"text-amber-600":"text-red-600")}>{v||"—"}</div></div>;})}
    </div>
  </div>;
}

// ── CARD REGISTRO ─────────────────────────────────────────────
function RegCard({r,onDelete,isC,nota,onNota}:{r:Reg;onDelete?:()=>void;isC:boolean;nota:string;onNota:(v:string)=>void}){
  const[exp,sE]=useState(false);const al=cAl(r.alertas);const mod=MODS.find(m=>m.id===r.tipo);
  function det(){
    if(r.tipo==="temperaturas"){const rt=r as RTemp;return<div className="text-xs mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5">{(rt as RTempML).area&&<span className="col-span-2 font-medium text-gray-600">Área: {(rt as RTempML).area}</span>}{(rt as RTempML).t_camara_masas&&<span>Cám. masas: <b>{(rt as RTempML).t_camara_masas}°C</b></span>}{(rt as RTempML).t_ambiente&&<span>Ambiente: <b>{(rt as RTempML).t_ambiente}°C</b></span>}{(rt as RTempML).t_camara_pt&&<span>Cám. PT: <b>{(rt as RTempML).t_camara_pt}°C</b></span>}{(rt as RTempML).t_fermentador&&<span>Ferment.: <b>{(rt as RTempML).t_fermentador}°C</b></span>}</div>;}
    if(r.tipo==="medialunas"){const ml=r as RMedialunas;return<div className="text-xs mt-2"><div className="font-semibold text-amber-700">{ml.variedad==="manteca"?"Manteca":"Grasa"} — Lote: {ml.lote_harina}</div><div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1">{ml.prom_total>0&&<span>Prom. total: <b className={Math.abs(ml.prom_total-(ml.variedad==="manteca"?60:50))>5?"text-red-600":""}>{ml.prom_total}g</b></span>}{ml.t_fermentador&&<span>Ferment.: <b>{ml.t_fermentador}°C</b></span>}{ml.t_camara_final&&<span>Cám. final: <b>{ml.t_camara_final}°C</b></span>}{ml.pct_recupero&&<span>Recupero: <b>{ml.pct_recupero}%</b></span>}</div></div>;}
    if(r.tipo==="bpm"){const b=r as RBPM;return<div className="text-xs mt-2"><p className="text-red-700 font-medium">Operario: {b.operario}</p><p className="text-gray-600">{b.incumplimientos.join(", ")}</p>{b.accion_tomada&&<p className="text-green-700 mt-0.5">Acción: {b.accion_tomada}</p>}</div>;}
    if(r.tipo==="recepcion"){const rc=r as RRecep;return<div className="text-xs mt-2"><p>{rc.proveedor_nombre} — {rc.producto}</p><p>T°: {rc.t_ingreso}°C · Lote: {rc.remito_lote} · <b>{rc.resultado}</b></p></div>;}
    if(r.tipo==="despacho"){const dp=r as RDesp;return<div className="text-xs mt-2"><p>{dp.local_destino} — {dp.producto}</p><p>T°: {dp.t_despacho}°C · Chofer: {dp.chofer} · {dp.patente}</p></div>;}
    if(r.tipo==="nc"){const nc=r as RNC;return<div className="text-xs mt-2"><p className="font-medium text-amber-700">{nc.tipo_nc?.toUpperCase()}</p><p>{nc.descripcion}</p>{nc.accion_inmediata&&<p className="text-green-700">Acción: {nc.accion_inmediata}</p>}</div>;}
    if(r.tipo==="decomiso"){const dc=r as RDecom;return<div className="text-xs mt-2"><p>{dc.producto} · {dc.lote}</p><p className="text-red-600 font-medium">{dc.cantidad_kg}kg · {dc.motivo} → {dc.destino}</p></div>;}
    return null;
  }
  return<div className={cn("bg-white rounded-xl border p-3",al>0?"border-red-200":"border-gray-200")}>
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-center gap-2 flex-1 min-w-0"><span className="text-base flex-shrink-0">{mod?.icon}</span>
        <div className="flex-1 min-w-0"><div className="flex items-center gap-1.5 flex-wrap"><span className="text-sm font-semibold text-gray-800">{mod?.label}</span>{al>0&&<ABadge n={al}/>}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">{r.hora} · {r.turno} · {r.responsable}</div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button onClick={()=>sE(!exp)} className="text-[10px] text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">{exp?"▲":"▼"}</button>
        {isC&&onDelete&&<button onClick={onDelete} className="text-[10px] text-red-400 border border-red-200 rounded px-1.5 py-0.5">🗑</button>}
      </div>
    </div>
    {exp&&<>{det()}{isC&&<div className="mt-2"><input value={nota} onChange={e=>onNota(e.target.value)} placeholder="Nota calidad…" className="w-full h-8 rounded-lg border border-yellow-300 bg-yellow-50 px-2 text-xs"/></div>}</>}
  </div>;
}

// ── KPI CÁMARAS (Dashboard especial) ─────────────────────────
function KPICamaras({registros}:{registros:Reg[]}){
  const lt=lastKPITemp(registros);const ld=lastTDespacho(registros);
  if(!lt&&ld==="—")return null;
  return<div className="bg-white rounded-xl border border-blue-200 p-4">
    <div className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-3">📊 KPIs — Estado cámaras y producto</div>
    <div className="grid grid-cols-2 gap-2">
      {lt&&<>
        <div className={cn("rounded-lg p-2 text-center border",lt.t_camara_masas!=="—"&&(parseFloat(lt.t_camara_masas)<6||parseFloat(lt.t_camara_masas)>10)?"border-red-200 bg-red-50":"border-gray-100 bg-gray-50")}>
          <div className="text-[10px] text-gray-400">🧊 Cám. Masas</div>
          <div className={cn("text-lg font-bold",lt.t_camara_masas!=="—"&&(parseFloat(lt.t_camara_masas)<6||parseFloat(lt.t_camara_masas)>10)?"text-red-600":"text-blue-700")}>{lt.t_camara_masas}°C</div>
          <div className="text-[9px] text-gray-400">8°C ±2</div>
        </div>
        <div className={cn("rounded-lg p-2 text-center border",lt.t_ambiente!=="—"&&(parseFloat(lt.t_ambiente)<16||parseFloat(lt.t_ambiente)>20)?"border-red-200 bg-red-50":"border-gray-100 bg-gray-50")}>
          <div className="text-[10px] text-gray-400">🌡️ Ambiente</div>
          <div className={cn("text-lg font-bold",lt.t_ambiente!=="—"&&(parseFloat(lt.t_ambiente)<16||parseFloat(lt.t_ambiente)>20)?"text-red-600":"text-blue-700")}>{lt.t_ambiente}°C</div>
          <div className="text-[9px] text-gray-400">16 – 20°C</div>
        </div>
        <div className={cn("rounded-lg p-2 text-center border",lt.t_camara_pt!=="—"&&(parseFloat(lt.t_camara_pt)<-25||parseFloat(lt.t_camara_pt)>-17)?"border-red-200 bg-red-50":"border-gray-100 bg-gray-50")}>
          <div className="text-[10px] text-gray-400">❄️ Cám. PT</div>
          <div className={cn("text-lg font-bold",lt.t_camara_pt!=="—"&&(parseFloat(lt.t_camara_pt)<-25||parseFloat(lt.t_camara_pt)>-17)?"text-red-600":"text-blue-700")}>{lt.t_camara_pt}°C</div>
          <div className="text-[9px] text-gray-400">-21°C ±4</div>
        </div>
      </>}
      <div className={cn("rounded-lg p-2 text-center border",ld!=="—"&&parseFloat(ld)>-12?"border-red-200 bg-red-50":"border-gray-100 bg-gray-50")}>
        <div className="text-[10px] text-gray-400">📦 T° Despacho</div>
        <div className={cn("text-lg font-bold",ld!=="—"&&parseFloat(ld)>-12?"text-red-600":"text-blue-700")}>{ld}°C</div>
        <div className="text-[9px] text-gray-400">≤-12°C ML</div>
      </div>
    </div>
    {lt&&<div className="text-[9px] text-gray-400 mt-2 text-right">Último registro: {fd(lt.fecha)} {lt.hora} · Área: {lt.area}</div>}
  </div>;
}

// ── RESUMEN PANEL ─────────────────────────────────────────────
function ResumenPanel({registros,titulo,isCalidad,notas,onNota,eliminados,onElim,onRestore,auditorias}:{
  registros:Reg[];titulo:string;isCalidad:boolean;
  notas:Record<string,string>;onNota:(id:string,v:string)=>void;
  eliminados:Set<string>;onElim:(id:string)=>void;onRestore:(id:string)=>void;
  auditorias?:RAuditoria[];
}){
  const[tab,sTab]=useState<"alertas"|"obs"|"reincidencias"|"ranking">("alertas");
  const vis=registros.filter(r=>!eliminados.has(r.id));
  const als=extraerAlertas(vis);const obs=extraerObs(vis);const rein=calcReincidencias(vis);const k=kpis(vis);
  const ranking=MODS.map(m=>({label:m.label,icon:m.icon,count:vis.filter(r=>r.tipo===m.id).reduce((a,r)=>a+cAl(r.alertas),0)})).filter(x=>x.count>0).sort((a,b)=>b.count-a.count);
  const maxR=ranking[0]?.count||1;
  function exportar(){dlTxt(buildTxt(registros,titulo,notas,eliminados),`CV_${titulo.replace(/\s/g,"_")}.txt`);}
  return<div className="flex flex-col gap-3">
    <KPICamaras registros={vis}/>
    {auditorias&&auditorias.length>0&&<KPIAuditoria auditorias={auditorias}/>}
    <div className="grid grid-cols-3 gap-2">
      {[{l:"Registros",v:k.total,c:"text-blue-600"},{l:"Alertas",v:k.alertas,c:k.alertas>0?"text-red-600":"text-green-600"},{l:"NC",v:k.nc,c:k.nc>0?"text-amber-600":"text-green-600"}].map((x,i)=><div key={i} className="bg-white rounded-xl border border-gray-200 p-2 text-center"><div className="text-xs text-gray-400">{x.l}</div><div className={`text-xl font-bold ${x.c}`}>{x.v}</div></div>)}
    </div>
    <div className="grid grid-cols-3 gap-2">
      {[{l:"BPM NC",v:k.bpm_inc,c:k.bpm_inc>0?"text-red-600":"text-green-600"},{l:"Decomisos",v:k.decomisos,c:"text-gray-700"},{l:"🥐 Medialunas",v:k.medialunas,c:"text-amber-600"}].map((x,i)=><div key={i} className="bg-white rounded-xl border border-gray-200 p-2 text-center"><div className="text-xs text-gray-400">{x.l}</div><div className={`text-xl font-bold ${x.c}`}>{x.v}</div></div>)}
    </div>
    <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
      {([{k:"alertas",l:`⚠ (${als.length})`},{k:"obs",l:`📝 (${obs.length})`},{k:"reincidencias",l:`🔁 (${rein.length})`},{k:"ranking",l:"🏆"}] as const).map(t=>(
        <button key={t.k} onClick={()=>sTab(t.k)} className={cn("flex-1 text-[10px] font-medium py-1.5 rounded-lg",tab===t.k?"bg-white text-gray-800 shadow-sm":"text-gray-500")}>{t.l}</button>
      ))}
    </div>
    {tab==="alertas"&&<div className="flex flex-col gap-2">{als.length===0?<div className="text-center py-6 text-gray-400 text-sm">✓ Sin alertas</div>:als.map((a,i)=><div key={i} className="bg-red-50 border border-red-200 rounded-xl p-3"><div className="flex items-start justify-between gap-2"><div><div className="text-xs font-semibold text-red-700">{a.tipo}</div><div className="text-xs text-gray-600 mt-0.5">Valor: <b>{a.valor}</b> · Límite: {a.limite}</div><div className="text-[10px] text-gray-400 mt-0.5">{fd(a.registro.fecha)} {a.registro.hora} · {a.registro.responsable} · {a.registro.turno}</div></div>{isCalidad&&<button onClick={()=>onElim(a.registro.id)} className="text-[10px] text-gray-400 hover:text-red-500 flex-shrink-0">Ocultar</button>}</div>{notas[a.registro.id]&&<div className="mt-1 text-xs text-yellow-700 bg-yellow-50 rounded px-2 py-0.5">📝 {notas[a.registro.id]}</div>}</div>)}</div>}
    {tab==="obs"&&<div className="flex flex-col gap-2">{obs.length===0?<div className="text-center py-6 text-gray-400 text-sm">Sin observaciones</div>:obs.map((o,i)=><div key={i} className="bg-white border border-gray-200 rounded-xl p-3"><div className="text-xs text-gray-700">{o.texto}</div><div className="text-[10px] text-gray-400 mt-1">{fd(o.registro.fecha)} {o.registro.hora} · {o.registro.responsable}</div>{notas[o.registro.id]&&<div className="mt-1 text-xs text-yellow-700 bg-yellow-50 rounded px-2 py-0.5">📝 {notas[o.registro.id]}</div>}{isCalidad&&<button onClick={()=>onElim(o.registro.id)} className="text-[10px] text-gray-400 hover:text-red-500 mt-1">Ocultar</button>}</div>)}</div>}
    {tab==="reincidencias"&&<div className="flex flex-col gap-2">{rein.length===0?<div className="text-center py-6 text-gray-400 text-sm">✓ Sin reincidencias</div>:rein.map((r,i)=><div key={i} className={cn("rounded-xl border p-3",r.critico?"border-red-300 bg-red-50":"border-amber-200 bg-amber-50")}><div className="flex items-center justify-between"><div className="text-xs font-semibold">{r.critico?"🔴 CRÍTICO":"🟡"} {r.tipo}</div><div className={cn("text-sm font-bold",r.critico?"text-red-700":"text-amber-700")}>{r.count}×</div></div><div className="text-[10px] text-gray-500 mt-0.5">{r.critico?"≥3 apariciones — acción correctiva urgente":"Apareció más de una vez"}</div></div>)}</div>}
    {tab==="ranking"&&<div className="flex flex-col gap-2">{ranking.length===0?<div className="text-center py-6 text-gray-400 text-sm">Sin alertas</div>:ranking.map((r,i)=><div key={i} className="bg-white border border-gray-200 rounded-xl p-3"><div className="flex items-center justify-between mb-1"><span className="text-sm">{r.icon} {r.label}</span><span className="text-sm font-bold text-red-600">{r.count}</span></div><div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-red-400 rounded-full" style={{width:`${(r.count/maxR)*100}%`}}/></div></div>)}</div>}
    {isCalidad&&eliminados.size>0&&<details className="bg-gray-50 border border-gray-200 rounded-xl"><summary className="p-3 text-xs font-medium text-gray-500 cursor-pointer">Ocultos ({eliminados.size})</summary><div className="px-3 pb-3 flex flex-col gap-1">{registros.filter(r=>eliminados.has(r.id)).map(r=>{const m=MODS.find(x=>x.id===r.tipo);return<div key={r.id} className="flex items-center justify-between text-xs py-1"><span>{m?.icon} {m?.label} · {r.hora}</span><button onClick={()=>onRestore(r.id)} className="text-blue-500">Restaurar</button></div>;})}<button onClick={()=>registros.forEach(r=>{if(eliminados.has(r.id))onRestore(r.id);})} className="text-xs text-blue-500 mt-1">Restaurar todos</button></div></details>}
    {isCalidad&&<button onClick={exportar} className="h-10 rounded-xl border border-blue-300 text-blue-600 text-sm font-medium hover:bg-blue-50">📄 Exportar reporte .txt</button>}
  </div>;
}

// ── DASHBOARD ─────────────────────────────────────────────────
function Dash({registros,label}:{registros:Reg[];label:string}){
  const k=kpis(registros);
  const bd=MODS.map(m=>({name:m.icon,cant:k.por_tipo[m.id]??0}));
  const td=TURNOS.map(t=>({turno:t.label,registros:registros.filter(r=>r.turno===t.id).length,alertas:registros.filter(r=>r.turno===t.id).reduce((a,r)=>a+cAl(r.alertas),0)}));
  return<div className="p-4 flex flex-col gap-4">
    <p className="text-xs text-gray-400 font-medium">{label}</p>
    <KPICamaras registros={registros}/>
    <div className="grid grid-cols-2 gap-3">
      {[{l:"Registros",v:k.total,c:"text-blue-600"},{l:"Alertas",v:k.alertas,c:k.alertas>0?"text-red-600":"text-green-600"},{l:"NC",v:k.nc,c:k.nc>0?"text-amber-600":"text-green-600"},{l:"Kg decomis.",v:k.kg,c:"text-gray-700"},{l:"BPM NC",v:k.bpm_inc,c:k.bpm_inc>0?"text-red-600":"text-green-600"},{l:"🥐 Medialunas",v:k.medialunas,c:"text-amber-600"}].map((x,i)=><div key={i} className="bg-white rounded-xl border border-gray-200 p-3"><div className="text-xs text-gray-400">{x.l}</div><div className={`text-2xl font-bold mt-0.5 ${x.c}`}>{x.v}</div></div>)}
    </div>
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Registros por módulo</div>
      <ResponsiveContainer width="100%" height={120}><BarChart data={bd} margin={{top:0,right:0,left:-20,bottom:0}}><XAxis dataKey="name" tick={{fontSize:12}}/><YAxis tick={{fontSize:10}}/><Tooltip/><Bar dataKey="cant" fill="#3b82f6" radius={[4,4,0,0]} name="Registros"/></BarChart></ResponsiveContainer>
    </div>
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Por turno</div>
      <ResponsiveContainer width="100%" height={110}><BarChart data={td} margin={{top:0,right:0,left:-20,bottom:0}}><XAxis dataKey="turno" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/><Tooltip/><Bar dataKey="registros" fill="#93c5fd" radius={[4,4,0,0]} name="Registros"/><Bar dataKey="alertas" fill="#f87171" radius={[4,4,0,0]} name="Alertas"/><Legend iconSize={8} wrapperStyle={{fontSize:11}}/></BarChart></ResponsiveContainer>
    </div>
  </div>;
}

// ── LOGIN ─────────────────────────────────────────────────────
function Login({onLogin}:{onLogin:(u:Usuario)=>void}){
  const[n,sN]=useState("");const[t,sT]=useState<Turno>("TM");const[r,sR]=useState<Rol>("control_volante");const[p,sP]=useState("");const[pe,sPE]=useState(false);
  const[rec,sRec]=useState<Usuario[]>([]);const[editMode,setEditMode]=useState(false);
  useEffect(()=>{try{const s=localStorage.getItem(UK);if(s)sRec(JSON.parse(s).slice(0,8));}catch{}},[]);
  function go(){if(!n.trim())return;if(r==="calidad"&&p!==PIN){sPE(true);return;}const u:Usuario={nombre:n.trim(),rol:r,turno:t};try{const prev=JSON.parse(localStorage.getItem(UK)||"[]");localStorage.setItem(UK,JSON.stringify([u,...prev.filter((x:Usuario)=>x.nombre!==u.nombre||x.rol!==u.rol)].slice(0,8)));}catch{}onLogin(u);}
  function eliminarRec(idx:number){const next=rec.filter((_,i)=>i!==idx);sRec(next);try{localStorage.setItem(UK,JSON.stringify(next));}catch{}}
  return<div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4"><div className="w-full max-w-sm">
    <div className="text-center mb-8"><div className="text-4xl mb-2">🍽️</div><h1 className="text-2xl font-bold text-gray-800">Sabores Express</h1><p className="text-sm text-gray-500 mt-1">Control de Calidad · v6.0</p></div>
    {rec.length>0&&<div className="mb-4">
      <div className="flex items-center justify-between mb-2"><p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Acceso rápido</p><button onClick={()=>setEditMode(!editMode)} className="text-[10px] text-blue-400 hover:text-blue-600">{editMode?"Listo":"Editar"}</button></div>
      {rec.map((u,i)=><div key={i} className="flex items-center gap-1.5 mb-1.5">
        <button onClick={()=>!editMode&&onLogin(u)} className="flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-200 hover:border-blue-400 text-sm flex-1">
          <span>{u.rol==="calidad"?"🔑":"👷"}</span><span className="font-medium text-gray-800 flex-1 text-left">{u.nombre} <span className="text-gray-400 font-normal">· {TURNOS.find(x=>x.id===u.turno)?.label}</span></span><Badge t={u.rol==="calidad"?"Calidad":"CV"} c="blue"/>
        </button>
        {editMode&&<button onClick={()=>eliminarRec(i)} className="w-8 h-8 rounded-lg bg-red-100 text-red-500 text-xs font-bold flex items-center justify-center">✕</button>}
      </div>)}
    </div>}
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm flex flex-col gap-4">
      <Txt label="Nombre y apellido" value={n} onChange={sN} ph="Tu nombre completo"/>
      <div className="flex flex-col gap-1"><label className="text-xs text-gray-500">Turno</label><div className="flex gap-2">{TURNOS.map(x=><button key={x.id} onClick={()=>sT(x.id)} className={cn("flex-1 py-2 rounded-lg text-sm font-medium border",t===x.id?"bg-blue-500 text-white border-blue-500":"bg-white text-gray-600 border-gray-200")}>{x.label}</button>)}</div></div>
      <div className="flex flex-col gap-1"><label className="text-xs text-gray-500">Rol</label><div className="flex gap-2">{(["control_volante","calidad"] as Rol[]).map(x=><button key={x} onClick={()=>sR(x)} className={cn("flex-1 py-2 rounded-lg text-sm font-medium border",r===x?"bg-blue-500 text-white border-blue-500":"bg-white text-gray-600 border-gray-200")}>{x==="calidad"?"🔑 Calidad":"👷 CV"}</button>)}</div></div>
      {r==="calidad"&&<div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">PIN</label><input type="password" maxLength={4} value={p} onChange={e=>{sP(e.target.value);sPE(false);}} placeholder="••••" className={cn("h-10 rounded-lg border px-3 text-sm text-center tracking-widest",pe?"border-red-400 bg-red-50":"border-gray-200")}/>{pe&&<span className="text-xs text-red-500">PIN incorrecto</span>}</div>}
      <button onClick={go} className="h-11 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold text-sm">Ingresar →</button>
    </div>
  </div></div>;
}

// ── VISTA DÍA ─────────────────────────────────────────────────
function VDia({u,mes,sem,dia,onBack}:{u:Usuario;mes:MesI;sem:SemI;dia:DiaI;onBack:()=>void}){
  const[regs,sR]=useState<Reg[]>([]);const[cg,sCg]=useState(false);const[mod,sMod]=useState<Tipo|null>(null);const[filtro,sFiltro]=useState<Turno|"todos">("todos");const[vista,sV]=useState<"registros"|"resumen"|"dashboard">("registros");const[notas,sNotas]=useState<Record<string,string>>({});const[elim,sElim]=useState<Set<string>>(new Set());const[toast,sToast]=useState<{msg:string;tipo:"ok"|"err"}|null>(null);const[bdProv,setBdProv]=useState(false);
  const showT=useCallback((msg:string,tipo:"ok"|"err"="ok")=>{sToast({msg,tipo});setTimeout(()=>sToast(null),3000);},[]);
  async function cargar(){sCg(true);try{const rs=await loadDia(mes.id,sem.semana,dia.fecha);sR(rs);}catch{showT("Error al cargar","err");}finally{sCg(false);}};
  useEffect(()=>{cargar();},[dia.fecha]);
  async function guardar(rec:Reg){try{await setDoc(doc(db,fsPath(mes.id,sem.semana,dia.fecha),rec.id),san(rec as unknown as Record<string,unknown>));sR(p=>[rec,...p.filter(r=>r.id!==rec.id)]);showT(`✓ Guardado${cAl(rec.alertas)>0?" — ⚠ con alertas":""}`);sMod(null);}catch{showT("Error al guardar","err");}}
  async function eliminar(id:string){if(u.rol!=="calidad")return;try{await deleteDoc(doc(db,fsPath(mes.id,sem.semana,dia.fecha),id));sR(p=>p.filter(r=>r.id!==id));showT("Eliminado");}catch{showT("Error","err");}}
  const fp={u,onSave:guardar,onCancel:()=>sMod(null)};
  if(bdProv)return<BDProveedores onBack={()=>setBdProv(false)}/>;
  if(mod)return<div className="min-h-screen bg-gray-50 max-w-lg mx-auto">{mod==="temperaturas"&&<FTemp {...fp}/>}{mod==="medialunas"&&<FMedialunas {...fp}/>}{mod==="bpm"&&<FBPM {...fp}/>}{mod==="recepcion"&&<FRecep {...fp}/>}{mod==="despacho"&&<FDesp {...fp}/>}{mod==="nc"&&<FNC {...fp}/>}{mod==="decomiso"&&<FDecom {...fp}/>}{mod==="limpieza"&&<FLimp {...fp}/>}</div>;
  const alT=regs.reduce((a,r)=>a+cAl(r.alertas),0);const fR=filtro==="todos"?regs:regs.filter(r=>r.turno===filtro);
  // Group by tipo for category dropdown
  const byTipo=MODS.reduce((acc,m)=>{acc[m.id]=fR.filter(r=>r.tipo===m.id);return acc;},{} as Record<string,typeof fR>);
  const titulo=`${mes.label} · Sem ${sem.semana} · ${fd(dia.fecha)}`;
  return<div className="min-h-screen bg-gray-50 max-w-lg mx-auto pb-24">
    <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-3 sticky top-0 z-10">
      <div className="flex items-center gap-2"><button onClick={onBack} className="text-gray-400 p-1">←</button><div className="flex-1"><p className="text-xs text-gray-400">{mes.label} · Semana {sem.semana}</p><p className="text-base font-bold text-gray-800">{DN[dia.diaSem]} {fd(dia.fecha)}</p></div>{alT>0&&<ABadge n={alT}/>}{cg&&<Spin/>}</div>
      <div className="flex gap-1 mt-2 bg-gray-100 rounded-xl p-1">
        {([{k:"registros",l:"Registros"},{k:"resumen",l:"Resumen"},{k:"dashboard",l:"Dashboard"}] as const).map(x=><button key={x.k} onClick={()=>sV(x.k)} className={cn("flex-1 text-xs font-medium py-1.5 rounded-lg",vista===x.k?"bg-white text-gray-800 shadow-sm":"text-gray-500")}>{x.l}</button>)}
      </div>
    </div>
    {vista==="registros"&&<div className="px-4 pt-4 flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">{MODS.map(m=><button key={m.id} onClick={()=>sMod(m.id)} className={cn("bg-white rounded-xl border p-2.5 text-center active:scale-95 flex flex-col items-center gap-1",m.id==="medialunas"?"border-amber-300 hover:border-amber-400":"border-gray-200 hover:border-blue-400")}><span className="text-xl">{m.icon}</span><span className="text-[10px] font-medium text-gray-700 leading-tight">{m.label}</span><Badge t={m.badge} c={m.badge==="PCC"?"red":m.badge==="PC"?"amber":m.badge==="BPM"?"green":m.badge==="POES"?"purple":m.badge==="HACCP"?"red":m.id==="medialunas"?"amber":"blue"}/></button>)}</div>
      {u.rol==="calidad"&&<button onClick={()=>setBdProv(true)} className="h-9 rounded-xl border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:border-blue-300">🏢 Gestión BD Proveedores</button>}
      <div className="flex gap-2 overflow-x-auto pb-1">{(["todos",...TURNOS.map(x=>x.id)] as (Turno|"todos")[]).map(t=><button key={t} onClick={()=>sFiltro(t)} className={cn("px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border",filtro===t?"bg-blue-500 text-white border-blue-500":"bg-white text-gray-600 border-gray-200")}>{t==="todos"?"Todos":t}</button>)}</div>
      {cg?<div className="flex justify-center p-8"><Spin/></div>:fR.length===0?<div className="text-center p-8 text-gray-400"><div className="text-3xl mb-2">📋</div><p className="text-sm">Sin registros</p></div>:
      <div className="flex flex-col gap-2">
        {MODS.filter(m=>byTipo[m.id]?.length>0).map(m=>{
          const items=byTipo[m.id];const catAlertas=items.reduce((a,r)=>a+cAl(r.alertas),0);
          return<CategoriaDrop key={m.id} icon={m.icon} label={m.label} badge={m.badge} count={items.length} alertas={catAlertas}>
            {items.map(r=><RegCard key={r.id} r={r} isC={u.rol==="calidad"} nota={notas[r.id]||""} onNota={v=>sNotas(p=>({...p,[r.id]:v}))} onDelete={u.rol==="calidad"?()=>eliminar(r.id):undefined}/>)}
          </CategoriaDrop>;
        })}
      </div>}
    </div>}
    {vista==="resumen"&&<div className="px-4 pt-4"><ResumenPanel registros={regs} titulo={titulo} isCalidad={u.rol==="calidad"} notas={notas} onNota={(id,v)=>sNotas(p=>({...p,[id]:v}))} eliminados={elim} onElim={id=>sElim(p=>new Set([...p,id]))} onRestore={id=>sElim(p=>{const n=new Set(p);n.delete(id);return n;})}/></div>}
    {vista==="dashboard"&&<Dash registros={regs} label={titulo}/>}
    {toast&&<div className={cn("fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-white text-sm font-medium shadow-lg z-50",toast.tipo==="ok"?"bg-gray-800":"bg-red-500")}>{toast.msg}</div>}
  </div>;
}

// ── VISTA SEMANA ──────────────────────────────────────────────
function VSem({u,mes,sem,onBack}:{u:Usuario;mes:MesI;sem:SemI;onBack:()=>void}){
  const[dia,sDia]=useState<DiaI|null>(null);const[vista,sV]=useState<"dias"|"resumen"|"dashboard">("dias");const[allRegs,sAll]=useState<Reg[]>([]);const[cg,sCg]=useState(false);const[notas,sNotas]=useState<Record<string,string>>({});const[elim,sElim]=useState<Set<string>>(new Set());
  const HOY=hoy();
  useEffect(()=>{(async()=>{sCg(true);const rs:Reg[]=[];for(const d of sem.dias){if(!d.fecha||d.fecha>HOY)continue;const dr=await loadDia(mes.id,sem.semana,d.fecha);rs.push(...dr);}sAll(rs);sCg(false);})();},[]);
  if(dia)return<VDia u={u} mes={mes} sem={sem} dia={dia} onBack={()=>sDia(null)}/>;
  const titulo=`${mes.label} · Semana ${sem.semana}`;
  return<div className="min-h-screen bg-gray-50 max-w-lg mx-auto pb-20">
    <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-3 sticky top-0 z-10">
      <div className="flex items-center gap-3"><button onClick={onBack} className="text-gray-400 p-1">←</button><div><p className="text-xs text-gray-400">{mes.label}</p><p className="text-base font-bold text-gray-800">Semana {sem.semana}</p></div>{cg&&<Spin/>}</div>
      <div className="flex gap-1 mt-2 bg-gray-100 rounded-xl p-1">{([{k:"dias",l:"Días"},{k:"resumen",l:"Resumen"},{k:"dashboard",l:"Dashboard"}] as const).map(x=><button key={x.k} onClick={()=>sV(x.k)} className={cn("flex-1 text-xs font-medium py-1.5 rounded-lg",vista===x.k?"bg-white text-gray-800 shadow-sm":"text-gray-500")}>{x.l}</button>)}</div>
    </div>
    {vista==="dias"&&<div className="p-4"><div className="grid grid-cols-7 gap-1 mb-2">{DN.map(d=><div key={d} className="text-center text-[10px] font-semibold text-gray-400 py-1">{d}</div>)}</div><div className="grid grid-cols-7 gap-1">{sem.dias.map((d,i)=>{if(d.dayOfMonth===-1)return<div key={i}/>;const eH=d.fecha===HOY;const eF=d.fecha>HOY;return<button key={i} onClick={()=>!eF&&sDia(d)} disabled={eF} className={cn("aspect-square rounded-xl flex flex-col items-center justify-center text-sm font-semibold border",eH?"bg-blue-500 text-white border-blue-500 shadow-sm":eF?"bg-gray-50 text-gray-300 border-gray-100 cursor-default":"bg-white text-gray-700 border-gray-200 hover:border-blue-400 active:scale-95")}>{d.dayOfMonth}{eH&&<span className="text-[8px] opacity-80">hoy</span>}</button>;})}</div><p className="text-xs text-gray-400 text-center mt-4">Tocá un día para ver o cargar registros</p></div>}
    {vista==="resumen"&&<div className="px-4 pt-4"><ResumenPanel registros={allRegs} titulo={titulo} isCalidad={u.rol==="calidad"} notas={notas} onNota={(id,v)=>sNotas(p=>({...p,[id]:v}))} eliminados={elim} onElim={id=>sElim(p=>new Set([...p,id]))} onRestore={id=>sElim(p=>{const n=new Set(p);n.delete(id);return n;})}/></div>}
    {vista==="dashboard"&&<Dash registros={allRegs} label={titulo}/>}
  </div>;
}

// ── VISTA MES ─────────────────────────────────────────────────
function VMes({u,mes,onBack}:{u:Usuario;mes:MesI;onBack:()=>void}){
  const[sem,sSem]=useState<SemI|null>(null);const[vista,sV]=useState<"semanas"|"resumen"|"dashboard">("semanas");const[allRegs,sAll]=useState<Reg[]>([]);const[cg,sCg]=useState(false);const[notas,sNotas]=useState<Record<string,string>>({});const[elim,sElim]=useState<Set<string>>(new Set());
  const HOY=hoy();
  useEffect(()=>{(async()=>{sCg(true);const rs:Reg[]=[];for(const s of mes.semanas)for(const d of s.dias){if(!d.fecha||d.fecha>HOY)continue;const dr=await loadDia(mes.id,s.semana,d.fecha);rs.push(...dr);}sAll(rs);sCg(false);})();},[]);
  if(sem)return<VSem u={u} mes={mes} sem={sem} onBack={()=>sSem(null)}/>;
  return<div className="min-h-screen bg-gray-50 max-w-lg mx-auto pb-20">
    <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-3 sticky top-0 z-10">
      <div className="flex items-center gap-3"><button onClick={onBack} className="text-gray-400 p-1">←</button><p className="text-base font-bold text-gray-800 flex-1">{mes.label}</p>{cg&&<Spin/>}</div>
      <div className="flex gap-1 mt-2 bg-gray-100 rounded-xl p-1">{([{k:"semanas",l:"Semanas"},{k:"resumen",l:"Resumen mes"},{k:"dashboard",l:"Dashboard"}] as const).map(x=><button key={x.k} onClick={()=>sV(x.k)} className={cn("flex-1 text-xs font-medium py-1.5 rounded-lg",vista===x.k?"bg-white text-gray-800 shadow-sm":"text-gray-500")}>{x.l}</button>)}</div>
    </div>
    {vista==="semanas"&&<div className="p-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4"><div className="grid grid-cols-7 gap-1 mb-2">{DN.map(d=><div key={d} className="text-center text-[10px] font-semibold text-gray-400">{d}</div>)}</div>{mes.semanas.map(s=><div key={s.semana} className="grid grid-cols-7 gap-1 mb-1">{s.dias.map((d,i)=>{if(d.dayOfMonth===-1)return<div key={i}/>;const eH=d.fecha===HOY;const eF=d.fecha>HOY;return<div key={i} onClick={()=>!eF&&sSem(s)} className={cn("aspect-square rounded-lg flex items-center justify-center text-xs cursor-pointer",eH?"bg-blue-500 text-white font-bold":eF?"text-gray-300":"text-gray-700 hover:bg-blue-50 font-medium")}>{d.dayOfMonth}</div>;})}</div>)}</div>
      <div className="flex flex-col gap-2">{mes.semanas.map(s=>{const p=s.dias.find(d=>d.dayOfMonth>0);const ul=[...s.dias].reverse().find(d=>d.dayOfMonth>0);const eH=s.dias.some(d=>d.fecha===HOY);const eF=p&&p.fecha>HOY;return<button key={s.semana} onClick={()=>!eF&&sSem(s)} disabled={!!eF} className={cn("bg-white rounded-xl border p-4 text-left flex items-center gap-3",eH?"border-blue-400 bg-blue-50":eF?"border-gray-100 opacity-50 cursor-default":"border-gray-200 hover:border-blue-300")}><div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0",eH?"bg-blue-500 text-white":"bg-gray-100 text-gray-600")}>{s.semana}</div><div className="flex-1"><p className="text-sm font-semibold text-gray-800">Semana {s.semana}</p><p className="text-xs text-gray-400">{fd(p?.fecha||"")} — {fd(ul?.fecha||"")}</p></div>{eH&&<Badge t="Esta semana" c="blue"/>}{!eF&&<span className="text-gray-300 text-xs">›</span>}</button>;})}</div>
    </div>}
    {vista==="resumen"&&<div className="px-4 pt-4"><ResumenPanel registros={allRegs} titulo={mes.label} isCalidad={u.rol==="calidad"} notas={notas} onNota={(id,v)=>sNotas(p=>({...p,[id]:v}))} eliminados={elim} onElim={id=>sElim(p=>new Set([...p,id]))} onRestore={id=>sElim(p=>{const n=new Set(p);n.delete(id);return n;})}/></div>}
    {vista==="dashboard"&&<Dash registros={allRegs} label={mes.label}/>}
  </div>;
}

// ── HOME ──────────────────────────────────────────────────────
function Home({u,onLogout}:{u:Usuario;onLogout:()=>void}){
  const[anio,sAnio]=useState<2026|2027>(2026);const[mes,sMes]=useState<MesI|null>(null);
  const HOY=hoy();
  useEffect(()=>{const[y,m]=HOY.split("-");sAnio(parseInt(y) as 2026|2027);const ma=CAL.find(x=>x.anio===parseInt(y)&&x.mes===parseInt(m)-1);if(ma)sMes(ma);},[]);
  if(mes)return<VMes u={u} mes={mes} onBack={()=>sMes(null)}/>;
  const meses=CAL.filter(m=>m.anio===anio);
  return<div className="min-h-screen bg-gray-50 max-w-lg mx-auto pb-24">
    <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-3">
      <div className="flex items-center justify-between"><div><p className="text-xs text-gray-400">Sabores Express · Cocina Central</p><p className="text-base font-bold text-gray-800">{u.nombre}</p></div><div className="flex items-center gap-2"><div className={cn("text-xs font-semibold px-2 py-1 rounded-full",u.turno==="TM"?"bg-amber-100 text-amber-700":u.turno==="TT"?"bg-blue-100 text-blue-700":"bg-indigo-100 text-indigo-700")}>{TURNOS.find(t=>t.id===u.turno)?.label}</div><button onClick={onLogout} className="text-xs text-gray-400 hover:text-gray-600">Salir</button></div></div>
    </div>
    <div className="px-4 pt-4">
      <div className="flex gap-2 mb-4">{([2026,2027] as const).map(a=><button key={a} onClick={()=>sAnio(a)} className={cn("flex-1 h-10 rounded-xl font-semibold text-sm border",anio===a?"bg-blue-500 text-white border-blue-500":"bg-white text-gray-600 border-gray-200 hover:border-blue-300")}>{a}</button>)}</div>
      <div className="grid grid-cols-3 gap-2.5">{meses.map(m=>{const[y,mo]=HOY.split("-");const eA=m.anio===parseInt(y)&&m.mes===parseInt(mo)-1;const eP=m.anio<parseInt(y)||(m.anio===parseInt(y)&&m.mes<parseInt(mo)-1);const eF=!eA&&!eP;return<button key={m.id} onClick={()=>sMes(m)} className={cn("rounded-2xl border p-3 text-left active:scale-95",eA?"bg-blue-500 border-blue-500 text-white shadow-sm":eF?"bg-white border-gray-100 text-gray-300":"bg-white border-gray-200 text-gray-700 hover:border-blue-300")}><p className="text-xs font-semibold uppercase tracking-wide opacity-70">{eA?"● Actual":eP?"Pasado":"Próximo"}</p><p className={cn("text-sm font-bold mt-0.5",eA?"text-white":"")}>{MN[m.mes].slice(0,3)}</p><p className={cn("text-xs mt-0.5",eA?"text-blue-100":"text-gray-400")}>{m.semanas.length} semanas</p></button>;})}
      </div>
    </div>
  </div>;
}

// ── ROOT ──────────────────────────────────────────────────────
export default function ControlVolante(){
  const[u,sU]=useState<Usuario|null>(null);
  if(!u)return<Login onLogin={sU}/>;
  return<Home u={u} onLogout={()=>sU(null)}/>;
}
