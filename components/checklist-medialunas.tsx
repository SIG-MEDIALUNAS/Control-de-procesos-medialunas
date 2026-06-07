"use client";
// ═══════════════════════════════════════════════════════════════
// CONTROL VOLANTE — SABORES EXPRESS · v5.0
// Firebase persiste todos los registros (independiente del deploy)
// Módulos: Temperaturas(ML/Pan) · Pesos ML · BPM NC · Recepción
// Despacho+chofer · NC · Decomiso · Limpieza · Proveedores DB
// ═══════════════════════════════════════════════════════════════
import React,{useState,useEffect,useRef,useCallback}from"react";
import{initializeApp,getApps}from"firebase/app";
import{getFirestore,collection,doc,setDoc,getDocs,query,orderBy,deleteDoc,addDoc,onSnapshot}from"firebase/firestore";
import{BarChart,Bar,XAxis,YAxis,Tooltip,ResponsiveContainer,Legend,LineChart,Line}from"recharts";

// ── FIREBASE ──────────────────────────────────────────────────
const _app=getApps().length===0?initializeApp({apiKey:process.env.NEXT_PUBLIC_FIREBASE_API_KEY,authDomain:process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,projectId:process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,storageBucket:process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,messagingSenderId:process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,appId:process.env.NEXT_PUBLIC_FIREBASE_APP_ID}):getApps()[0];
const db=getFirestore(_app);

// ── TIPOS ─────────────────────────────────────────────────────
type Turno="TM"|"TT"|"TN";
type Rol="calidad"|"control_volante";
type Tipo="temperaturas"|"pesos_ml"|"bpm_nc"|"recepcion"|"despacho"|"nc"|"decomiso"|"limpieza";
interface Usuario{nombre:string;rol:Rol;turno:Turno;}
interface FotoMeta{id:string;nombre:string;sector:string;timestamp:string;w:number;h:number;}

// Base
interface Base{id:string;tipo:Tipo;turno:Turno;responsable:string;fecha:string;hora:string;timestamp:string;alertas:Record<string,boolean>;fotos:FotoMeta[];}

// Temperaturas – área Medialunas (todos los parámetros solicitados)
interface RTempML extends Base{tipo:"temperaturas";area:"medialunas"|"panificados";
  // Cámaras
  t_camara_masas:string;t_ambiente:string;t_camara_pt:string;
  // Masa
  t_agua_chiller:string;kg_agua:string;kg_hielo:string;tiempo_amasado:string;
  // Carro – amasado
  nro_carro_amasado:string;fecha_ingreso_camara:string;hora_ingreso_camara:string;
  // Laminado manual (PCC hojaldre)
  laminado_hojaldre:"cumple"|"nc"|"";
  // Carro – laminado (salida)
  nro_carro_laminado:string;fecha_salida_laminado:string;hora_salida_laminado:string;
  horas_camara:string; // calculado
  // Laminado automático
  lam_auto_calibre_inicio:string;lam_auto_calibre_fin:string;lam_auto_ancho_cm:string;
  // Medialunera
  calibre_medialunera:string;maquinista_12mil:string;maquinista_lam_auto:string;
  // Fermentador
  t_fermentador:string;humedad_fermentador:string;tiempo_fermentado:string;
  // Abatidor
  t_abatido:string;t_salida_abatidor:string;
  // Cámara PT
  t_camara_pt_final:string;
  equipo_num:string;observaciones:string;
}
// Pesos Medialunas – 15 muestras, inicio/medio/fin
interface RPesosML extends Base{tipo:"pesos_ml";
  variedad:"manteca"|"grasa"|"";
  maquinista_12mil:string;maquinista_lam_auto:string;
  muestras_inicio:string[];muestras_medio:string[];muestras_fin:string[];
  prom_inicio:number;prom_medio:number;prom_fin:number;prom_total:number;desvio_pct:number;
  ajustado:string;observaciones:string;
}
// BPM – registro de incumplimiento por operario
interface RBPMNC extends Base{tipo:"bpm_nc";
  sector:string;operario:string;
  incumplimientos:string[]; // lista de items incumplidos
  accion_tomada:string;reincidente:boolean;observaciones:string;
}
interface RRecep extends Base{tipo:"recepcion";proveedor_id:string;proveedor_nombre:string;producto:string;remito_lote:string;cantidad:string;t_ingreso:string;vto:string;estado_envase:string;rotulado_ok:boolean;fifo_ok:boolean;resultado:string;observaciones:string;}
interface RDesp  extends Base{tipo:"despacho";local_destino:string;producto:string;lote:string;cantidad:string;t_despacho:string;t_transporte:string;etiquetado_ok:boolean;estado_embalaje:string;chofer:string;patente:string;observaciones:string;}
interface RNC    extends Base{tipo:"nc";tipo_nc:string;descripcion:string;lote_afectado:string;causa_raiz:string;accion_inmediata:string;requiere_nc_formal:boolean;responsable_sector:string;}
interface RDecom extends Base{tipo:"decomiso";producto:string;lote:string;cantidad_kg:string;motivo:string;etapa_deteccion:string;destino:string;observaciones:string;}
interface RLimp  extends Base{tipo:"limpieza";sector:string;superficies_contacto:boolean;pisos_desagues:boolean;equipos:boolean;camaras:boolean;sanitizante:string;concentracion:string;atp_nivel:string;responsable_limpieza:string;observaciones:string;}
type Reg=RTempML|RPesosML|RBPMNC|RRecep|RDesp|RNC|RDecom|RLimp;

// Proveedores
interface Proveedor{id:string;nombre:string;rubro:string;contacto:string;notas:string;}

// ── CALENDARIO ────────────────────────────────────────────────
const MN=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DN=["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
interface DiaI{fecha:string;dayOfMonth:number;diaSem:number;}
interface SemI{semana:number;dias:DiaI[];}
interface MesI{anio:number;mes:number;label:string;id:string;semanas:SemI[];}
function buildCal():MesI[]{
  const r:MesI[]=[];
  for(const y of[2025,2026,2027])for(let m=0;m<12;m++){
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

// ── FIREBASE PATHS (estables — no cambian con deploys) ─────────
// Todos los registros viven en /cv_registros/<año_mes>/dias/<fecha>/items/<id>
// Esta ruta no depende de ninguna versión del código
function fsPath(mid:string,sem:number,fecha:string){return`cv/${mid}/semanas/sem_${sem}/dias/${fecha.replace(/-/g,"")}/items`;}
async function loadDia(mid:string,sem:number,fecha:string):Promise<Reg[]>{
  try{const s=await getDocs(query(collection(db,fsPath(mid,sem,fecha)),orderBy("timestamp","desc")));return s.docs.map(d=>d.data() as Reg);}catch{return[];}
}
// Proveedores – colección separada
const provCol=()=>collection(db,"sv_proveedores");

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
function calcHorasCamara(fi:string,hi:string,fs:string,hs:string):string{
  if(!fi||!hi||!fs||!hs)return"";
  try{const e=(new Date(`${fs}T${hs}`).getTime()-new Date(`${fi}T${hi}`).getTime())/3600000;return e>0?`${e.toFixed(1)}hs`:"?";}catch{return"";}
}
function promArr(arr:string[]):number{const vs=arr.map(v=>parseFloat(v)).filter(v=>!isNaN(v));return vs.length?Math.round(vs.reduce((a,b)=>a+b,0)/vs.length*10)/10:0;}

// ── KPIs ──────────────────────────────────────────────────────
interface KPI{total:number;alertas:number;nc:number;decomisos:number;kg:number;bpm_nc:number;por_tipo:Record<string,number>;}
function kpis(rs:Reg[]):KPI{
  let al=0,nc=0,dec=0,kg=0,bnc=0;const pt:Record<string,number>={};
  for(const r of rs){pt[r.tipo]=(pt[r.tipo]||0)+1;al+=cAl(r.alertas);if(r.tipo==="nc")nc++;if(r.tipo==="decomiso"){dec++;kg+=parseFloat((r as RDecom).cantidad_kg)||0;}if(r.tipo==="bpm_nc")bnc++;}
  return{total:rs.length,alertas:al,nc,decomisos:dec,kg:Math.round(kg*10)/10,bpm_nc:bnc,por_tipo:pt};
}
interface AlertaItem{campo:string;valor:string;limite:string;tipo:string;registro:Reg;}
function extraerAlertas(rs:Reg[]):AlertaItem[]{
  const out:AlertaItem[]=[];
  const labels:Record<string,{limite:string;tipo:string}>={
    t_camara_masas:{limite:"8°C ±2°C",tipo:"T° Cámara Masas"},t_ambiente:{limite:"16°C a 20°C",tipo:"T° Ambiente"},
    t_camara_pt:{limite:"-21°C ±4°C",tipo:"T° Cámara PT"},t_agua_chiller:{limite:"1°C a 6°C",tipo:"T° Agua Chiller"},
    tiempo_amasado:{limite:"25 ±3 min",tipo:"Tiempo Amasado"},laminado_hojaldre:{limite:"Cumple",tipo:"PCC Hojaldre"},
    t_fermentador:{limite:"28°C ±3°C",tipo:"T° Fermentador"},
    t_abatidor:{limite:"-24°C ±2°C / -16 a -20°C",tipo:"T° Abatidor"},
    t_salida_abatidor:{limite:"≤ -12°C",tipo:"T° Salida Abatidor"},
    t_camara_pt_final:{limite:"≤ -17°C",tipo:"T° Cámara PT Final"},
    peso_nc:{limite:"60g±5 / 50g±5",tipo:"Peso Triángulo NC"},
    t_ingreso:{limite:"≤ 7°C",tipo:"T° Recepción MP"},
    rechazado:{limite:"Rechazado",tipo:"Rechazo MP"},
    t_despacho:{limite:"≤ -12°C medialuna",tipo:"T° Despacho"},
    sin_accion:{limite:"Sin acción",tipo:"NC sin acción"},
    sin_foto:{limite:"Sin foto",tipo:"Decomiso sin foto"},
    superficies_no_ok:{limite:"No verificado",tipo:"Superficies PCC"},
  };
  for(const r of rs){for(const[k,v]of Object.entries(r.alertas)){if(v){const l=labels[k]||{limite:"—",tipo:k};const val=(r as Record<string,unknown>)[k];out.push({campo:k,valor:typeof val==="string"?val:"—",limite:l.limite,tipo:l.tipo,registro:r});}}}
  return out;
}
function extraerObs(rs:Reg[]):Array<{texto:string;registro:Reg}>{
  const out:Array<{texto:string;registro:Reg}>=[];
  for(const r of rs){const o=(r as Record<string,unknown>).observaciones;if(typeof o==="string"&&o.trim())out.push({texto:o.trim(),registro:r});if(r.tipo==="nc"){const d=(r as RNC).descripcion;if(d)out.push({texto:`NC: ${d}`,registro:r});}}
  return out;
}
interface Reincidencia{tipo:string;count:number;critico:boolean;registros:Reg[];}
function calcReincidencias(rs:Reg[]):Reincidencia[]{
  const map:Record<string,{count:number;regs:Reg[]}>={}; 
  for(const a of extraerAlertas(rs)){const k=a.tipo;if(!map[k])map[k]={count:0,regs:[]};map[k].count++;map[k].regs.push(a.registro);}
  return Object.entries(map).filter(([,v])=>v.count>1).map(([k,v])=>({tipo:k,count:v.count,critico:v.count>=3,registros:v.regs})).sort((a,b)=>b.count-a.count);
}

// ── MÓDULOS & CONSTANTES ──────────────────────────────────────
const MODS:{id:Tipo;label:string;icon:string;badge:string}[]=[
  {id:"temperaturas",label:"Temperaturas",icon:"🌡️",badge:"PCC"},
  {id:"pesos_ml",label:"Pesos ML",icon:"⚖️",badge:"PC"},
  {id:"bpm_nc",label:"BPM – NC",icon:"👤",badge:"BPM"},
  {id:"recepcion",label:"Recepción MP",icon:"🚚",badge:"PCC"},
  {id:"despacho",label:"Despacho",icon:"📦",badge:"PC"},
  {id:"nc",label:"No Conformidad",icon:"⚠️",badge:"ISO"},
  {id:"decomiso",label:"Decomiso",icon:"🗑️",badge:"HACCP"},
  {id:"limpieza",label:"Limpieza POES",icon:"🧹",badge:"POES"},
];
const TURNOS=[{id:"TM" as Turno,label:"Mañana"},{id:"TT" as Turno,label:"Tarde"},{id:"TN" as Turno,label:"Noche"}];
const UK="sv_usuarios_v5",PIN="1234";
const BPM_ITEMS=["Lavado de manos","Uniforme completo (cofia, delantal, guantes)","Sin joyas ni maquillaje","Sin celular en zona de trabajo","Sin alimentos fuera del área","Higiene del puesto","Estado de salud apto"];

// ── EXPORT TXT ────────────────────────────────────────────────
function buildTxt(rs:Reg[],titulo:string,notas:Record<string,string>,elim:Set<string>):string{
  const vis=rs.filter(r=>!elim.has(r.id));
  const k=kpis(vis);const als=extraerAlertas(vis);const obs=extraerObs(vis);const rein=calcReincidencias(vis);
  let t=`REPORTE — CONTROL VOLANTE\nSabores Express · v5\n${titulo}\nGenerado: ${new Date().toLocaleString("es-AR")}\n${"─".repeat(44)}\n\n`;
  t+=`RESUMEN\nRegistros: ${k.total} | Alertas: ${k.alertas} | NC: ${k.nc} | BPM-NC: ${k.bpm_nc} | Decomisos: ${k.decomisos} (${k.kg}kg)\n\n`;
  if(als.length){t+=`ALERTAS (${als.length})\n`;for(const a of als)t+=`  [${fd(a.registro.fecha)} ${a.registro.hora}] ⚠ ${a.tipo} — ${a.valor} (${a.limite}) · ${a.registro.responsable}\n`;}
  if(rein.length){t+=`\nREINCIDENCIAS\n`;for(const r of rein)t+=`  ${r.critico?"🔴":"🟡"} ${r.tipo}: ${r.count}×\n`;}
  if(obs.length){t+=`\nOBSERVACIONES\n`;for(const o of obs){t+=`  [${fd(o.registro.fecha)} ${o.registro.hora}] ${o.texto}\n`;const n=notas[o.registro.id];if(n)t+=`    Nota: ${n}\n`;}}
  t+=`\n${"─".repeat(44)}\nDETALLE POR TURNO\n`;
  for(const tr of TURNOS){const trRs=vis.filter(r=>r.turno===tr.id);if(!trRs.length)continue;t+=`\nTURNO ${tr.label.toUpperCase()}\n`;
    for(const r of trRs){const m=MODS.find(x=>x.id===r.tipo);t+=`  [${r.hora}] ${m?.icon||""} ${m?.label||r.tipo}${cAl(r.alertas)>0?" ⚠":""} · ${r.responsable}\n`;
      if(r.tipo==="temperaturas"){const tmp=r as RTempML;t+=`    Área: ${tmp.area} | Carro: ${tmp.nro_carro_amasado} | T°Masas: ${tmp.t_camara_masas}°C | T°Amb: ${tmp.t_ambiente}°C | T°PT: ${tmp.t_camara_pt}°C\n`;t+=`    Chiller: ${tmp.t_agua_chiller}°C | Agua: ${tmp.kg_agua}kg | Hielo: ${tmp.kg_hielo}kg | Amasado: ${tmp.tiempo_amasado}min\n`;t+=`    Hojaldre: ${tmp.laminado_hojaldre} | Horas cámara: ${tmp.horas_camara} | Ferment: ${tmp.t_fermentador}°C/${tmp.humedad_fermentador}%\n`;}
      if(r.tipo==="pesos_ml"){const p=r as RPesosML;t+=`    ${p.variedad} | Prom: ${p.prom_total}g | Inicio: ${p.prom_inicio}g Medio: ${p.prom_medio}g Fin: ${p.prom_fin}g | Desvío: ${p.desvio_pct}%\n`;}
      if(r.tipo==="bpm_nc"){const b=r as RBPMNC;t+=`    Operario: ${b.operario} | Incump: ${b.incumplimientos.join(", ")}\n    Acción: ${b.accion_tomada}${b.reincidente?" | ⚠ REINCIDENTE":""}\n`;}
      if(r.tipo==="nc")t+=`    ${(r as RNC).tipo_nc} — ${(r as RNC).descripcion}\n    Acción: ${(r as RNC).accion_inmediata}\n`;
      if(r.tipo==="decomiso")t+=`    ${(r as RDecom).producto} ${(r as RDecom).cantidad_kg}kg — ${(r as RDecom).motivo}\n`;
      if(r.tipo==="despacho"){const d=r as RDesp;t+=`    ${d.local_destino} | Chofer: ${d.chofer} | Patente: ${d.patente} | T°: ${d.t_despacho}°C\n`;}
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
function Num({label,value,onChange,al,spec}:{label:string;value:string;onChange:(v:string)=>void;al?:boolean;spec?:string}){
  return<div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">{label}</label>{spec&&<span className="text-[10px] text-blue-500">{spec}</span>}<input type="number" inputMode="decimal" value={value} onChange={e=>onChange(e.target.value)} className={cn("h-10 rounded-lg border px-3 text-sm font-mono",al?"border-red-400 bg-red-50 text-red-700":"border-gray-200 bg-white")}/>{al&&<span className="text-[10px] text-red-500 font-medium">⚠ Fuera de rango</span>}</div>;
}
function Txt({label,value,onChange,ph}:{label:string;value:string;onChange:(v:string)=>void;ph?:string}){return<div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">{label}</label><input type="text" value={value} onChange={e=>onChange(e.target.value)} placeholder={ph} className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm"/></div>;}
function Sel({label,value,onChange,opts,al}:{label:string;value:string;onChange:(v:string)=>void;opts:{v:string;l:string}[];al?:boolean}){return<div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">{label}</label><select value={value} onChange={e=>onChange(e.target.value)} className={cn("h-10 rounded-lg border px-3 text-sm bg-white",al?"border-red-400 bg-red-50":"border-gray-200")}><option value="">Seleccionar…</option>{opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select>{al&&<span className="text-[10px] text-red-500 font-medium">⚠ Requiere acción</span>}</div>;}
function Chk({label,value,onChange}:{label:string;value:boolean;onChange:(v:boolean)=>void}){return<button onClick={()=>onChange(!value)} className={cn("flex items-center gap-2 p-2.5 rounded-lg border text-sm text-left",value?"border-green-400 bg-green-50 text-green-800":"border-gray-200 bg-white text-gray-700")}><span className={cn("w-5 h-5 rounded flex items-center justify-center flex-shrink-0 text-xs border",value?"bg-green-500 border-green-500 text-white":"border-gray-300")}>{value?"✓":""}</span>{label}</button>;}
function TA({label,value,onChange,ph}:{label:string;value:string;onChange:(v:string)=>void;ph?:string}){return<div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">{label}</label><textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={ph} rows={3} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm resize-none"/></div>;}
function SH({label,children}:{label:string;children:React.ReactNode}){
  return<div className="text-xs font-bold uppercase tracking-wide border-b pb-1 mt-1" style={{color:"#1d4ed8",borderColor:"#bfdbfe"}}>{label}{children}</div>;
}
function Fotos({fotos,onAdd,onRemove}:{fotos:FotoMeta[];onAdd:(m:FotoMeta)=>void;onRemove:(id:string)=>void}){
  const ref=useRef<HTMLInputElement>(null);const[cg,setCg]=useState(false);
  async function h(e:React.ChangeEvent<HTMLInputElement>){const f=e.target.files?.[0];if(!f)return;setCg(true);try{const{dataUrl,w,h}=await compFoto(f);const id=gid("foto");saveFoto(id,dataUrl);onAdd({id,nombre:f.name,sector:"CV",timestamp:new Date().toISOString(),w,h});}finally{setCg(false);if(ref.current)ref.current.value="";}}
  return<div className="flex flex-col gap-2"><label className="text-xs text-gray-500">Fotos de evidencia</label><div className="flex flex-wrap gap-2">{fotos.map(f=>{const u=loadFoto(f.id);return<div key={f.id} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200">{u?<img src={u} alt={f.nombre} className="w-full h-full object-cover"/>:<div className="w-full h-full bg-gray-100 flex items-center justify-center text-[10px] text-gray-400 text-center px-1">Solo este disp.</div>}<button onClick={()=>onRemove(f.id)} className="absolute top-0 right-0 bg-red-500 text-white w-4 h-4 rounded-bl text-[9px] flex items-center justify-center">✕</button></div>;})}
  <button onClick={()=>ref.current?.click()} className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400">{cg?<Spin/>:<><span className="text-xl">📷</span><span className="text-[10px]">Foto</span></>}</button></div><input ref={ref} type="file" accept="image/*" capture="environment" className="hidden" onChange={h}/></div>;
}
function FW({titulo,sub,onCancel,onSave,g,ch}:{titulo:string;sub:string;onCancel:()=>void;onSave:()=>void;g:boolean;ch:React.ReactNode}){
  return<div className="flex flex-col min-h-screen"><div className="flex items-center gap-3 p-4 border-b border-gray-100 bg-white sticky top-0 z-10"><button onClick={onCancel} className="text-gray-400 p-1 text-lg">←</button><div className="flex-1"><div className="font-semibold text-gray-800 text-sm">{titulo}</div><div className="text-xs text-gray-400">{sub}</div></div></div><div className="flex-1 p-4 flex flex-col gap-4 pb-28">{ch}</div><div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 flex gap-3 max-w-lg mx-auto z-20"><button onClick={onCancel} className="flex-1 h-11 rounded-xl border border-gray-200 text-sm text-gray-600 font-medium">Cancelar</button><button onClick={onSave} disabled={g} className="flex-[2] h-11 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2">{g?<Spin/>:"Guardar ✓"}</button></div></div>;
}

// ── FORMULARIO TEMPERATURAS ───────────────────────────────────
function FTemp({u,onSave,onCancel}:{u:Usuario;onSave:(r:Reg)=>void;onCancel:()=>void}){
  const init={area:"medialunas" as "medialunas"|"panificados",
    t_camara_masas:"",t_ambiente:"",t_camara_pt:"",
    t_agua_chiller:"",kg_agua:"",kg_hielo:"",tiempo_amasado:"",
    nro_carro_amasado:"",fecha_ingreso_camara:hoy(),hora_ingreso_camara:"",
    laminado_hojaldre:"" as "cumple"|"nc"|"",
    nro_carro_laminado:"",fecha_salida_laminado:hoy(),hora_salida_laminado:"",horas_camara:"",
    lam_auto_calibre_inicio:"",lam_auto_calibre_fin:"",lam_auto_ancho_cm:"",
    calibre_medialunera:"",maquinista_12mil:"",maquinista_lam_auto:"",
    t_fermentador:"",humedad_fermentador:"",tiempo_fermentado:"",
    t_abatido:"",t_salida_abatidor:"",t_camara_pt_final:"",
    equipo_num:"",observaciones:"",fotos:[] as FotoMeta[]};
  const[d,sD]=useState(init);const[g,sG]=useState(false);

  // Actualizar horas cámara cuando cambian fechas/horas
  useEffect(()=>{
    const hc=calcHorasCamara(d.fecha_ingreso_camara,d.hora_ingreso_camara,d.fecha_salida_laminado,d.hora_salida_laminado);
    sD(p=>({...p,horas_camara:hc}));
  },[d.fecha_ingreso_camara,d.hora_ingreso_camara,d.fecha_salida_laminado,d.hora_salida_laminado]);

  // Alertas
  const aCamaraMasas=d.t_camara_masas!==""&&(parseFloat(d.t_camara_masas)<6||parseFloat(d.t_camara_masas)>10);
  const aAmbiente=d.t_ambiente!==""&&(parseFloat(d.t_ambiente)<16||parseFloat(d.t_ambiente)>20);
  const aCamaraPT=d.t_camara_pt!==""&&(parseFloat(d.t_camara_pt)<-25||parseFloat(d.t_camara_pt)>-17);
  const aChiller=d.t_agua_chiller!==""&&(parseFloat(d.t_agua_chiller)<1||parseFloat(d.t_agua_chiller)>6);
  const aAmasado=d.tiempo_amasado!==""&&(parseFloat(d.tiempo_amasado)<22||parseFloat(d.tiempo_amasado)>28);
  const aHojaldre=d.laminado_hojaldre==="nc";
  const aFerment=d.t_fermentador!==""&&(parseFloat(d.t_fermentador)<25||parseFloat(d.t_fermentador)>31);
  const aAbatidor=d.t_abatido!==""&&(parseFloat(d.t_abatido)<-26||parseFloat(d.t_abatido)>-16);
  const aSalida=d.t_salida_abatidor!==""&&parseFloat(d.t_salida_abatidor)>-12;
  const aPTFinal=d.t_camara_pt_final!==""&&parseFloat(d.t_camara_pt_final)>-17;

  async function sv(){sG(true);
    onSave({id:gid("tmp"),tipo:"temperaturas",turno:u.turno,responsable:u.nombre,fecha:hoy(),hora:ahora(),timestamp:new Date().toISOString(),
      alertas:{t_camara_masas:aCamaraMasas,t_ambiente:aAmbiente,t_camara_pt:aCamaraPT,t_agua_chiller:aChiller,tiempo_amasado:aAmasado,laminado_hojaldre:aHojaldre,t_fermentador:aFerment,t_abatidor:aAbatidor,t_salida_abatidor:aSalida,t_camara_pt_final:aPTFinal},
      ...d} as RTempML);
    sG(false);}

  return<FW titulo="🌡️ Temperaturas" sub="PCC · Medialunas & Panificados" onCancel={onCancel} onSave={sv} g={g} ch={<>
    {/* Área */}
    <div className="flex flex-col gap-1"><label className="text-xs text-gray-500">Área</label>
      <div className="flex gap-2">
        {([{v:"medialunas",l:"🥐 Medialunas"},{v:"panificados",l:"🍞 Panificados"}] as {v:"medialunas"|"panificados";l:string}[]).map(x=>(
          <button key={x.v} onClick={()=>sD(p=>({...p,area:x.v}))} className={cn("flex-1 py-2.5 rounded-lg text-xs font-semibold border",d.area===x.v?"bg-blue-500 text-white border-blue-500":"bg-white text-gray-600 border-gray-200")}>{x.l}</button>
        ))}
      </div>
    </div>

    {/* ── CÁMARAS ── */}
    <SH label="❄️ Cámaras">{null}</SH>
    <Num label="T° Cámara de Masas / Fraccionado (°C)" spec="Parámetro: 8°C ±2°C" value={d.t_camara_masas} onChange={v=>sD(p=>({...p,t_camara_masas:v}))} al={aCamaraMasas}/>
    <Num label="T° Ambiente (°C)" spec="Parámetro: 16°C a 20°C" value={d.t_ambiente} onChange={v=>sD(p=>({...p,t_ambiente:v}))} al={aAmbiente}/>
    <Num label="T° Cámara de PT (°C)" spec="Parámetro: -21°C ±4°C" value={d.t_camara_pt} onChange={v=>sD(p=>({...p,t_camara_pt:v}))} al={aCamaraPT}/>

    {/* ── MASA ── */}
    <SH label="🫱 Elaboración de Masa">{null}</SH>
    <Num label="T° Agua Chiller (°C)" spec="Parámetro: 1°C a 6°C" value={d.t_agua_chiller} onChange={v=>sD(p=>({...p,t_agua_chiller:v}))} al={aChiller}/>
    <div className="grid grid-cols-2 gap-2">
      <Num label="Cantidad de Agua (kg)" value={d.kg_agua} onChange={v=>sD(p=>({...p,kg_agua:v}))} spec="R200: 23kg / R201: 25kg"/>
      <Num label="Cantidad de Hielo (kg)" value={d.kg_hielo} onChange={v=>sD(p=>({...p,kg_hielo:v}))} spec="Receta: 15kg"/>
    </div>
    <Num label="Tiempo total de amasado (min)" spec="Objetivo: 25 min ±3 min" value={d.tiempo_amasado} onChange={v=>sD(p=>({...p,tiempo_amasado:v}))} al={aAmasado}/>

    {/* ── CARRO – INGRESO CÁMARA ── */}
    <SH label="🚗 Carro – Ingreso a Cámara">{null}</SH>
    <Txt label="N° de Carro" value={d.nro_carro_amasado} onChange={v=>sD(p=>({...p,nro_carro_amasado:v}))} ph="ej: 7"/>
    <div className="grid grid-cols-2 gap-2">
      <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">Fecha ingreso</label><input type="date" value={d.fecha_ingreso_camara} onChange={e=>sD(p=>({...p,fecha_ingreso_camara:e.target.value}))} className="h-10 rounded-lg border border-gray-200 px-3 text-sm bg-white"/></div>
      <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">Hora ingreso</label><input type="time" value={d.hora_ingreso_camara} onChange={e=>sD(p=>({...p,hora_ingreso_camara:e.target.value}))} className="h-10 rounded-lg border border-gray-200 px-3 text-sm bg-white"/></div>
    </div>

    {/* ── LAMINADO MANUAL ── */}
    <SH label="📋 Laminado Manual">{null}</SH>
    <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">PCC — Hojaldre visible</label>
      <div className="flex gap-2">
        {([{v:"cumple",l:"✅ Cumple"},{v:"nc",l:"❌ NC"}] as {v:"cumple"|"nc";l:string}[]).map(x=>(
          <button key={x.v} onClick={()=>sD(p=>({...p,laminado_hojaldre:x.v}))} className={cn("flex-1 py-2.5 rounded-lg text-xs font-semibold border",d.laminado_hojaldre===x.v?(x.v==="cumple"?"bg-green-500 text-white border-green-500":"bg-red-500 text-white border-red-500"):"bg-white text-gray-600 border-gray-200")}>{x.l}</button>
        ))}
      </div>
      {aHojaldre&&<span className="text-[10px] text-red-500 font-medium">⚠ PCC NC — Hojaldre no visible. Registrar acción.</span>}
    </div>

    {/* ── CARRO – SALIDA LAMINADO ── */}
    <SH label="🚗 Carro – Salida a Laminado">{null}</SH>
    <Txt label="N° de Carro (confirmar)" value={d.nro_carro_laminado} onChange={v=>sD(p=>({...p,nro_carro_laminado:v}))} ph="Debe coincidir con ingreso"/>
    <div className="grid grid-cols-2 gap-2">
      <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">Fecha salida</label><input type="date" value={d.fecha_salida_laminado} onChange={e=>sD(p=>({...p,fecha_salida_laminado:e.target.value}))} className="h-10 rounded-lg border border-gray-200 px-3 text-sm bg-white"/></div>
      <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">Hora salida</label><input type="time" value={d.hora_salida_laminado} onChange={e=>sD(p=>({...p,hora_salida_laminado:e.target.value}))} className="h-10 rounded-lg border border-gray-200 px-3 text-sm bg-white"/></div>
    </div>
    {d.horas_camara&&<div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-xs text-blue-700 font-semibold">⏱ Tiempo en cámara: {d.horas_camara} (mín. 8 hs — óptimo 12 hs)</div>}

    {/* ── LAMINADO AUTOMÁTICO ── */}
    <SH label="⚙️ Laminado Automático">{null}</SH>
    <div className="grid grid-cols-3 gap-2">
      <Num label="Calibre inicio" value={d.lam_auto_calibre_inicio} onChange={v=>sD(p=>({...p,lam_auto_calibre_inicio:v}))} spec="ej: 39"/>
      <Num label="Calibre fin" value={d.lam_auto_calibre_fin} onChange={v=>sD(p=>({...p,lam_auto_calibre_fin:v}))} spec="ej: 12"/>
      <Num label="Ancho (cm)" value={d.lam_auto_ancho_cm} onChange={v=>sD(p=>({...p,lam_auto_ancho_cm:v}))}/>
    </div>

    {/* ── MEDIALUNERA ── */}
    <SH label="🥐 Medialunera">{null}</SH>
    <Num label="Calibre medialunera" spec="Mant: 60 (ML12) ó 15/20 (ML1-3) | Grasa: 15/20" value={d.calibre_medialunera} onChange={v=>sD(p=>({...p,calibre_medialunera:v}))}/>
    <Txt label="Maquinista 12 mil" value={d.maquinista_12mil} onChange={v=>sD(p=>({...p,maquinista_12mil:v}))} ph="Nombre del operario"/>
    <Txt label="Maquinista Laminadora Automática" value={d.maquinista_lam_auto} onChange={v=>sD(p=>({...p,maquinista_lam_auto:v}))} ph="Nombre del operario"/>

    {/* ── FERMENTADOR ── */}
    <SH label="🌡️ Fermentador">{null}</SH>
    <Num label="T° Fermentador (°C)" spec="Seteo: 28°C ±3°C" value={d.t_fermentador} onChange={v=>sD(p=>({...p,t_fermentador:v}))} al={aFerment}/>
    <Num label="Humedad fermentador (%)" spec="Seteo: ~90%" value={d.humedad_fermentador} onChange={v=>sD(p=>({...p,humedad_fermentador:v}))}/>
    <Num label="Tiempo fermentado (min)" spec="Objetivo: 60 min" value={d.tiempo_fermentado} onChange={v=>sD(p=>({...p,tiempo_fermentado:v}))}/>

    {/* ── ABATIDOR ── */}
    <SH label="❄️ Abatidor">{null}</SH>
    <Num label="T° seteo abatidor (°C)" spec="Mant: -24°C ±2°C | Grasa: -16 a -20°C" value={d.t_abatido} onChange={v=>sD(p=>({...p,t_abatido:v}))} al={aAbatidor}/>
    <Num label="T° salida abatidor (°C)" spec="PCC — debe ser ≤ -12°C (Manteca)" value={d.t_salida_abatidor} onChange={v=>sD(p=>({...p,t_salida_abatidor:v}))} al={aSalida}/>
    {aSalida&&<div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">⚠ Medialuna no lista para envasado. Continuar abatido.</div>}

    {/* ── CÁMARA PT FINAL ── */}
    <SH label="🏭 Cámara PT Final">{null}</SH>
    <Num label="T° Cámara final (°C)" spec="PCC — debe ser ≤ -17°C" value={d.t_camara_pt_final} onChange={v=>sD(p=>({...p,t_camara_pt_final:v}))} al={aPTFinal}/>

    <Txt label="N° Termómetro / equipo" value={d.equipo_num} onChange={v=>sD(p=>({...p,equipo_num:v}))}/>
    <Fotos fotos={d.fotos} onAdd={f=>sD(p=>({...p,fotos:[...p.fotos,f]}))} onRemove={id=>sD(p=>({...p,fotos:p.fotos.filter(f=>f.id!==id)}))}/>
    <TA label="Observaciones / acción correctiva" value={d.observaciones} onChange={v=>sD(p=>({...p,observaciones:v}))}/>
  </>}/>;
}

// ── FORMULARIO PESOS ML ───────────────────────────────────────
function FPesosML({u,onSave,onCancel}:{u:Usuario;onSave:(r:Reg)=>void;onCancel:()=>void}){
  const empty5=()=>Array(5).fill("");
  const[d,sD]=useState({variedad:"" as "manteca"|"grasa"|"",maquinista_12mil:"",maquinista_lam_auto:"",
    muestras_inicio:empty5(),muestras_medio:empty5(),muestras_fin:empty5(),ajustado:"",observaciones:"",fotos:[] as FotoMeta[]});
  const[g,sG]=useState(false);
  const isMant=d.variedad==="manteca";
  const obj=isMant?60:50;const tol=5;
  const pi=promArr(d.muestras_inicio),pm=promArr(d.muestras_medio),pf=promArr(d.muestras_fin);
  const pt=promArr([...d.muestras_inicio,...d.muestras_medio,...d.muestras_fin]);
  const aP=pt>0&&(pt<obj-tol||pt>obj+tol);
  const dv=pt>0&&obj>0?Math.round(Math.abs(pt-obj)/obj*100*10)/10:0;

  function setM(grupo:"inicio"|"medio"|"fin",idx:number,val:string){
    sD(p=>{const arr=[...(grupo==="inicio"?p.muestras_inicio:grupo==="medio"?p.muestras_medio:p.muestras_fin)];arr[idx]=val;return{...p,[`muestras_${grupo}`]:arr};});
  }
  async function sv(){sG(true);
    onSave({id:gid("pml"),tipo:"pesos_ml",turno:u.turno,responsable:u.nombre,fecha:hoy(),hora:ahora(),timestamp:new Date().toISOString(),
      prom_inicio:pi,prom_medio:pm,prom_fin:pf,prom_total:pt,desvio_pct:dv,
      alertas:{peso_nc:aP},...d} as RPesosML);
    sG(false);}

  return<FW titulo="⚖️ Pesos Medialunas" sub="15 muestras · Inicio / Medio / Fin" onCancel={onCancel} onSave={sv} g={g} ch={<>
    <div className="flex flex-col gap-1"><label className="text-xs text-gray-500">Variedad</label>
      <div className="flex gap-2">
        {([{v:"manteca",l:"🥐 Manteca (60g ±5)"},{v:"grasa",l:"🥐 Grasa (50g ±5)"}] as {v:"manteca"|"grasa";l:string}[]).map(x=>(
          <button key={x.v} onClick={()=>sD(p=>({...p,variedad:x.v}))} className={cn("flex-1 py-2 rounded-lg text-xs font-semibold border",d.variedad===x.v?"bg-amber-500 text-white border-amber-500":"bg-white text-gray-600 border-gray-200")}>{x.l}</button>
        ))}
      </div>
    </div>
    <Txt label="Maquinista 12 mil" value={d.maquinista_12mil} onChange={v=>sD(p=>({...p,maquinista_12mil:v}))} ph="Nombre operario"/>
    <Txt label="Maquinista Laminadora Automática" value={d.maquinista_lam_auto} onChange={v=>sD(p=>({...p,maquinista_lam_auto:v}))} ph="Nombre operario"/>

    {(["inicio","medio","fin"] as const).map(grupo=>(
      <div key={grupo} className="flex flex-col gap-2">
        <SH label={`📏 ${grupo.charAt(0).toUpperCase()+grupo.slice(1)} (5 muestras)`}>{null}</SH>
        <div className="grid grid-cols-5 gap-1">
          {Array(5).fill(0).map((_,i)=>(
            <div key={i} className="flex flex-col gap-0.5">
              <label className="text-[10px] text-gray-400 text-center">M{grupo==="inicio"?i+1:grupo==="medio"?i+6:i+11}</label>
              <input type="number" inputMode="decimal" value={(grupo==="inicio"?d.muestras_inicio:grupo==="medio"?d.muestras_medio:d.muestras_fin)[i]} onChange={e=>setM(grupo,i,e.target.value)} className="h-9 rounded-lg border border-gray-200 px-1 text-sm font-mono text-center w-full"/>
            </div>
          ))}
        </div>
        {promArr(grupo==="inicio"?d.muestras_inicio:grupo==="medio"?d.muestras_medio:d.muestras_fin)>0&&(
          <div className="text-xs text-gray-500 text-right">Prom {grupo}: <b>{promArr(grupo==="inicio"?d.muestras_inicio:grupo==="medio"?d.muestras_medio:d.muestras_fin)}g</b></div>
        )}
      </div>
    ))}

    {pt>0&&<div className={cn("rounded-xl p-3 text-sm flex items-center justify-between border",aP?"bg-red-50 border-red-300":"bg-green-50 border-green-300")}>
      <div><div className="font-semibold">{aP?"⚠ Fuera de rango":"✓ En rango"}</div>
        <div className="text-xs text-gray-500">Prom total: <b>{pt}g</b> | Obj: {obj}g ±{tol}g</div>
        <div className="text-[10px] text-gray-400">Inicio: {pi}g · Medio: {pm}g · Fin: {pf}g</div>
      </div>
      <div className={cn("text-xl font-bold",aP?"text-red-600":"text-green-600")}>{dv}%</div>
    </div>}
    <Sel label="¿Ajustado?" value={d.ajustado} onChange={v=>sD(p=>({...p,ajustado:v}))} al={aP&&!d.ajustado} opts={[{v:"si",l:"✓ Sí, calibre corregido"},{v:"no",l:"No"},{v:"retirado",l:"Retirado de línea"}]}/>
    <Fotos fotos={d.fotos} onAdd={f=>sD(p=>({...p,fotos:[...p.fotos,f]}))} onRemove={id=>sD(p=>({...p,fotos:p.fotos.filter(f=>f.id!==id)}))}/>
    <TA label="Observaciones" value={d.observaciones} onChange={v=>sD(p=>({...p,observaciones:v}))}/>
  </>}/>;
}

// ── FORMULARIO BPM – NC ───────────────────────────────────────
function FBPMNC({u,onSave,onCancel,regsHoy}:{u:Usuario;onSave:(r:Reg)=>void;onCancel:()=>void;regsHoy:Reg[]}){
  const[d,sD]=useState({sector:"",operario:"",incumplimientos:[] as string[],accion_tomada:"",reincidente:false,observaciones:"",fotos:[] as FotoMeta[]});
  const[g,sG]=useState(false);
  // detectar reincidente: mismo operario ya tiene BPM-NC hoy
  useEffect(()=>{if(!d.operario.trim())return;const reincidente=regsHoy.some(r=>r.tipo==="bpm_nc"&&(r as RBPMNC).operario.toLowerCase()===d.operario.toLowerCase());sD(p=>({...p,reincidente}));},[d.operario,regsHoy]);
  function toggleItem(item:string){sD(p=>({...p,incumplimientos:p.incumplimientos.includes(item)?p.incumplimientos.filter(x=>x!==item):[...p.incumplimientos,item]}));}
  async function sv(){if(!d.operario.trim()||d.incumplimientos.length===0)return;sG(true);
    onSave({id:gid("bpm"),tipo:"bpm_nc",turno:u.turno,responsable:u.nombre,fecha:hoy(),hora:ahora(),timestamp:new Date().toISOString(),alertas:{bpm_nc:true,reincidente:d.reincidente},...d} as RBPMNC);sG(false);}

  return<FW titulo="👤 BPM – Registro de NC" sub="Registrá al operario en incumplimiento" onCancel={onCancel} onSave={sv} g={g} ch={<>
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">Registrá únicamente cuando hay un incumplimiento de BPM. Este registro se acumula en los reportes de mejora continua.</div>
    <Sel label="Sector" value={d.sector} onChange={v=>sD(p=>({...p,sector:v}))} opts={[{v:"masas",l:"Masas/Fraccionado"},{v:"laminado",l:"Laminado"},{v:"medialunera",l:"Medialunera"},{v:"fermentado",l:"Fermentado"},{v:"envasado",l:"Envasado"},{v:"expedicion",l:"Expedición"},{v:"deposito",l:"Depósito"},{v:"otro",l:"Otro"}]}/>
    <Txt label="Operario (nombre completo)" value={d.operario} onChange={v=>sD(p=>({...p,operario:v}))} ph="Nombre y apellido"/>
    {d.reincidente&&<div className="bg-red-100 border border-red-300 rounded-lg p-2 text-xs text-red-700 font-semibold">🔴 REINCIDENTE — Este operario ya tiene un registro BPM-NC hoy</div>}
    <SH label="✗ Incumplimientos detectados (seleccioná todos)">{null}</SH>
    <div className="flex flex-col gap-1.5">{BPM_ITEMS.map(item=>(
      <button key={item} onClick={()=>toggleItem(item)} className={cn("flex items-center gap-2 p-2.5 rounded-lg border text-sm text-left",d.incumplimientos.includes(item)?"border-red-400 bg-red-50 text-red-800":"border-gray-200 bg-white text-gray-700")}>
        <span className={cn("w-5 h-5 rounded flex items-center justify-center flex-shrink-0 text-xs border",d.incumplimientos.includes(item)?"bg-red-500 border-red-500 text-white":"border-gray-300")}>{d.incumplimientos.includes(item)?"✕":""}</span>
        {item}
      </button>
    ))}</div>
    <TA label="Acción tomada en el momento" value={d.accion_tomada} onChange={v=>sD(p=>({...p,accion_tomada:v}))} ph="Qué se hizo / indicó al operario"/>
    <Fotos fotos={d.fotos} onAdd={f=>sD(p=>({...p,fotos:[...p.fotos,f]}))} onRemove={id=>sD(p=>({...p,fotos:p.fotos.filter(f=>f.id!==id)}))}/>
    <TA label="Observaciones adicionales" value={d.observaciones} onChange={v=>sD(p=>({...p,observaciones:v}))}/>
  </>}/>;
}

// ── FORMULARIO RECEPCIÓN ──────────────────────────────────────
function FRecep({u,onSave,onCancel,proveedores}:{u:Usuario;onSave:(r:Reg)=>void;onCancel:()=>void;proveedores:Proveedor[]}){
  const[d,sD]=useState({proveedor_id:"",proveedor_nombre:"",producto:"",remito_lote:"",cantidad:"",t_ingreso:"",vto:"",estado_envase:"",rotulado_ok:false,fifo_ok:false,resultado:"",observaciones:"",fotos:[] as FotoMeta[]});const[g,sG]=useState(false);
  const at=d.t_ingreso!==""&&parseFloat(d.t_ingreso)>7;
  useEffect(()=>{if(d.proveedor_id){const p=proveedores.find(x=>x.id===d.proveedor_id);if(p)sD(prev=>({...prev,proveedor_nombre:p.nombre}));}else sD(prev=>({...prev,proveedor_nombre:""}));},[d.proveedor_id]);
  async function sv(){sG(true);onSave({id:gid("rec"),tipo:"recepcion",turno:u.turno,responsable:u.nombre,fecha:hoy(),hora:ahora(),timestamp:new Date().toISOString(),alertas:{t_ingreso:at,rechazado:d.estado_envase==="rechazado"||d.resultado==="rechazado"},...d} as RRecep);sG(false);}
  return<FW titulo="🚚 Recepción MP" sub="HACCP PCC · Base de datos proveedores" onCancel={onCancel} onSave={sv} g={g} ch={<>
    <Sel label="Proveedor" value={d.proveedor_id} onChange={v=>sD(p=>({...p,proveedor_id:v}))} opts={proveedores.map(p=>({v:p.id,l:p.nombre}))}/>
    {!d.proveedor_id&&<Txt label="Proveedor (manual si no está en lista)" value={d.proveedor_nombre} onChange={v=>sD(p=>({...p,proveedor_nombre:v}))}/>}
    <Txt label="Producto" value={d.producto} onChange={v=>sD(p=>({...p,producto:v}))}/>
    <div className="grid grid-cols-2 gap-2">
      <Txt label="N° remito / lote" value={d.remito_lote} onChange={v=>sD(p=>({...p,remito_lote:v}))} ph="Trazabilidad"/>
      <Txt label="Cantidad" value={d.cantidad} onChange={v=>sD(p=>({...p,cantidad:v}))} ph="ej: 25 kg"/>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Num label="T° ingreso (°C)" spec="PCC ≤ 7°C refrig / ≤-18°C cong" value={d.t_ingreso} onChange={v=>sD(p=>({...p,t_ingreso:v}))} al={at}/>
      <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">Vencimiento</label><input type="date" value={d.vto} onChange={e=>sD(p=>({...p,vto:e.target.value}))} className="h-10 rounded-lg border border-gray-200 px-3 text-sm bg-white"/></div>
    </div>
    <Sel label="Estado envase" value={d.estado_envase} onChange={v=>sD(p=>({...p,estado_envase:v}))} al={d.estado_envase==="rechazado"} opts={[{v:"integro",l:"✓ Íntegro"},{v:"danado",l:"⚠ Dañado"},{v:"rechazado",l:"✕ Rechazado"}]}/>
    <Chk label="Rotulado correcto (fecha, lote, denominación)" value={d.rotulado_ok} onChange={v=>sD(p=>({...p,rotulado_ok:v}))}/>
    <Chk label="FIFO/FEFO aplicado" value={d.fifo_ok} onChange={v=>sD(p=>({...p,fifo_ok:v}))}/>
    <Sel label="Resultado" value={d.resultado} onChange={v=>sD(p=>({...p,resultado:v}))} al={d.resultado==="rechazado"} opts={[{v:"aprobado",l:"✓ Aprobado"},{v:"observado",l:"⚠ Con observación"},{v:"rechazado",l:"✕ Rechazado"}]}/>
    <Fotos fotos={d.fotos} onAdd={f=>sD(p=>({...p,fotos:[...p.fotos,f]}))} onRemove={id=>sD(p=>({...p,fotos:p.fotos.filter(f=>f.id!==id)}))}/>
    <TA label="Observaciones" value={d.observaciones} onChange={v=>sD(p=>({...p,observaciones:v}))}/>
  </>}/>;
}

// ── FORMULARIO DESPACHO ───────────────────────────────────────
function FDesp({u,onSave,onCancel}:{u:Usuario;onSave:(r:Reg)=>void;onCancel:()=>void}){
  const[d,sD]=useState({local_destino:"",producto:"",lote:"",cantidad:"",t_despacho:"",t_transporte:"",etiquetado_ok:false,estado_embalaje:"",chofer:"",patente:"",observaciones:"",fotos:[] as FotoMeta[]});const[g,sG]=useState(false);
  const atd=d.t_despacho!==""&&parseFloat(d.t_despacho)>-12;
  const att=d.t_transporte!==""&&parseFloat(d.t_transporte)>-12;
  async function sv(){sG(true);onSave({id:gid("dsp"),tipo:"despacho",turno:u.turno,responsable:u.nombre,fecha:hoy(),hora:ahora(),timestamp:new Date().toISOString(),alertas:{t_despacho:atd,t_transporte:att,sin_etiqueta:!d.etiquetado_ok},...d} as RDesp);sG(false);}
  return<FW titulo="📦 Despacho" sub="PCC · Trazabilidad transporte" onCancel={onCancel} onSave={sv} g={g} ch={<>
    <Txt label="Local destino" value={d.local_destino} onChange={v=>sD(p=>({...p,local_destino:v}))}/>
    <div className="grid grid-cols-2 gap-2">
      <Txt label="Chofer" value={d.chofer} onChange={v=>sD(p=>({...p,chofer:v}))} ph="Nombre y apellido"/>
      <Txt label="Patente" value={d.patente} onChange={v=>sD(p=>({...p,patente:v}))} ph="ej: AB123CD"/>
    </div>
    <Txt label="Producto" value={d.producto} onChange={v=>sD(p=>({...p,producto:v}))}/>
    <div className="grid grid-cols-2 gap-2">
      <Txt label="Lote" value={d.lote} onChange={v=>sD(p=>({...p,lote:v}))}/>
      <Num label="Cantidad / unidades" value={d.cantidad} onChange={v=>sD(p=>({...p,cantidad:v}))}/>
    </div>
    <Num label="T° producto al despachar (°C)" spec="PCC Medialuna — ≤ -12°C" value={d.t_despacho} onChange={v=>sD(p=>({...p,t_despacho:v}))} al={atd}/>
    <Num label="T° vehículo / transporte (°C)" spec="PCC — ≤ -12°C" value={d.t_transporte} onChange={v=>sD(p=>({...p,t_transporte:v}))} al={att}/>
    <Chk label="Etiquetado correcto (fecha, vencimiento, lote)" value={d.etiquetado_ok} onChange={v=>sD(p=>({...p,etiquetado_ok:v}))}/>
    <Sel label="Estado embalaje" value={d.estado_embalaje} onChange={v=>sD(p=>({...p,estado_embalaje:v}))} opts={[{v:"integro",l:"✓ Íntegro"},{v:"con_dano",l:"⚠ Con daño"}]}/>
    <Fotos fotos={d.fotos} onAdd={f=>sD(p=>({...p,fotos:[...p.fotos,f]}))} onRemove={id=>sD(p=>({...p,fotos:p.fotos.filter(f=>f.id!==id)}))}/>
    <TA label="Observaciones" value={d.observaciones} onChange={v=>sD(p=>({...p,observaciones:v}))}/>
  </>}/>;
}

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
  return<FW titulo="🧹 Limpieza POES" sub="POES/BPM" onCancel={onCancel} onSave={sv} g={g} ch={<><Sel label="Sector" value={d.sector} onChange={v=>sD(p=>({...p,sector:v}))} opts={[{v:"masas",l:"Masas/Fraccionado"},{v:"laminado",l:"Laminado"},{v:"medialunera",l:"Medialunera"},{v:"fermentado",l:"Fermentado"},{v:"abatidor",l:"Abatidor"},{v:"envasado",l:"Envasado"},{v:"camara",l:"Cámara"},{v:"despacho",l:"Despacho"},{v:"sanitarios",l:"Sanitarios"},{v:"almacen",l:"Almacén"}]}/><div className="flex items-center justify-between"><div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Verificación</div><div className={cn("text-sm font-bold",pc===100?"text-green-600":"text-amber-600")}>{pc}%</div></div><div className="flex flex-col gap-1.5"><Chk label="Superficies contacto con alimentos (PCC)" value={d.superficies_contacto} onChange={v=>sD(p=>({...p,superficies_contacto:v}))}/><Chk label="Pisos y desagües" value={d.pisos_desagues} onChange={v=>sD(p=>({...p,pisos_desagues:v}))}/><Chk label="Equipos (laminadora, medialunera)" value={d.equipos} onChange={v=>sD(p=>({...p,equipos:v}))}/><Chk label="Cámaras frigoríficas" value={d.camaras} onChange={v=>sD(p=>({...p,camaras:v}))}/></div><Txt label="Sanitizante" value={d.sanitizante} onChange={v=>sD(p=>({...p,sanitizante:v}))}/><Txt label="Concentración" value={d.concentracion} onChange={v=>sD(p=>({...p,concentracion:v}))} ph="ej: 200 ppm cloro"/><Num label="Nivel ATP (si aplica)" value={d.atp_nivel} onChange={v=>sD(p=>({...p,atp_nivel:v}))}/><Txt label="Responsable limpieza" value={d.responsable_limpieza} onChange={v=>sD(p=>({...p,responsable_limpieza:v}))}/><Fotos fotos={d.fotos} onAdd={f=>sD(p=>({...p,fotos:[...p.fotos,f]}))} onRemove={id=>sD(p=>({...p,fotos:p.fotos.filter(f=>f.id!==id)}))}/><TA label="Observaciones" value={d.observaciones} onChange={v=>sD(p=>({...p,observaciones:v}))}/></>}/>;
}

// ── CARD REGISTRO ─────────────────────────────────────────────
function RegCard({r,onDelete,isC,nota,onNota}:{r:Reg;onDelete?:()=>void;isC:boolean;nota:string;onNota:(v:string)=>void}){
  const[exp,sE]=useState(false);const[editNota,sEN]=useState(false);const al=cAl(r.alertas);const mod=MODS.find(m=>m.id===r.tipo);
  function det(){
    if(r.tipo==="temperaturas"){const t=r as RTempML;return<div className="text-xs mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5">{t.area&&<span className="col-span-2 font-medium text-blue-700">Área: {t.area}</span>}{t.t_camara_masas&&<span>Cám.Masas:<b> {t.t_camara_masas}°C</b></span>}{t.t_ambiente&&<span>Ambiente:<b> {t.t_ambiente}°C</b></span>}{t.t_camara_pt&&<span>Cám.PT:<b> {t.t_camara_pt}°C</b></span>}{t.nro_carro_amasado&&<span>Carro:<b> #{t.nro_carro_amasado}</b></span>}{t.horas_camara&&<span>En cámara:<b> {t.horas_camara}</b></span>}{t.laminado_hojaldre&&<span className={t.laminado_hojaldre==="nc"?"text-red-600 font-bold col-span-2":""}>Hojaldre: {t.laminado_hojaldre==="cumple"?"✅":"❌ NC"}</span>}{t.t_fermentador&&<span>Ferment:<b> {t.t_fermentador}°C/{t.humedad_fermentador}%</b></span>}{t.t_camara_pt_final&&<span>PT Final:<b> {t.t_camara_pt_final}°C</b></span>}{t.observaciones&&<span className="col-span-2 text-gray-500">{t.observaciones}</span>}</div>;}
    if(r.tipo==="pesos_ml"){const p=r as RPesosML;return<div className="text-xs mt-2"><p>{p.variedad} | Prom: <b>{p.prom_total}g</b> | Desvío: <b className={p.desvio_pct>8?"text-red-600":"text-green-600"}>{p.desvio_pct}%</b></p><p className="text-gray-400">I:{p.prom_inicio}g M:{p.prom_medio}g F:{p.prom_fin}g</p></div>;}
    if(r.tipo==="bpm_nc"){const b=r as RBPMNC;return<div className="text-xs mt-2"><p className="font-medium text-red-700">{b.operario} — {b.sector}</p><p className="text-gray-600">{b.incumplimientos.join(", ")}</p>{b.reincidente&&<p className="text-red-600 font-bold">🔴 REINCIDENTE</p>}</div>;}
    if(r.tipo==="recepcion")return<div className="text-xs mt-2"><p>{(r as RRecep).proveedor_nombre} — {(r as RRecep).producto}</p><p>T°: {(r as RRecep).t_ingreso}°C · <b>{(r as RRecep).resultado}</b>{(r as RRecep).vto&&` · Vto: ${fd((r as RRecep).vto)}`}</p></div>;
    if(r.tipo==="despacho"){const dsp=r as RDesp;return<div className="text-xs mt-2"><p>{dsp.local_destino} — {dsp.producto}</p><p>T°: {dsp.t_despacho}°C | Chofer: {dsp.chofer} | {dsp.patente}</p></div>;}
    if(r.tipo==="nc")return<div className="text-xs mt-2"><p className="font-medium text-amber-700">{(r as RNC).tipo_nc?.toUpperCase()}</p><p>{(r as RNC).descripcion}</p>{(r as RNC).accion_inmediata&&<p className="text-green-700">Acción: {(r as RNC).accion_inmediata}</p>}</div>;
    if(r.tipo==="decomiso")return<div className="text-xs mt-2"><p>{(r as RDecom).producto} · {(r as RDecom).lote}</p><p className="text-red-600 font-medium">{(r as RDecom).cantidad_kg}kg · {(r as RDecom).motivo}</p></div>;
    if(r.tipo==="limpieza")return<div className="text-xs mt-2"><p>{(r as RLimp).sector} · {[["superficies_contacto","Sup"],["pisos_desagues","Pisos"],["equipos","Equipos"],["camaras","Cámaras"]].filter(([k])=>(r as Record<string,unknown>)[k]).map(([,l])=>l).join(", ")||"—"}</p></div>;
  }
  return<div className={cn("bg-white rounded-xl border p-3",al>0?"border-red-300":"border-gray-200")}>
    <div className="flex items-center gap-2" onClick={()=>sE(e=>!e)}>
      <span className="text-lg">{mod?.icon||"📋"}</span>
      <div className="flex-1 min-w-0"><div className="flex items-center gap-1.5 flex-wrap"><span className="text-sm font-medium text-gray-800">{mod?.label||r.tipo}</span>{al>0&&<ABadge n={al}/>}<Badge t={r.turno} c="gray"/></div><div className="text-xs text-gray-400">{r.hora} · {r.responsable}</div></div>
      {isC&&<button onClick={e=>{e.stopPropagation();if(window.confirm("¿Eliminar este registro?"))onDelete?.();}} className="text-red-400 text-xs p-1">🗑</button>}
      <span className="text-gray-300 text-xs">{exp?"▲":"▼"}</span>
    </div>
    {exp&&<><div>{det()}</div>
      {isC&&<div className="mt-2">{editNota?<div className="flex gap-1"><input className="flex-1 h-8 rounded border border-gray-200 px-2 text-xs" value={nota} onChange={e=>onNota(e.target.value)} placeholder="Nota de calidad…"/><button onClick={()=>sEN(false)} className="text-xs text-blue-500">OK</button></div>:<button onClick={()=>sEN(true)} className="text-xs text-gray-400 hover:text-blue-500">{nota?"📝 "+nota:"+ Nota calidad"}</button>}</div>}
    </>}
  </div>;
}

// ── PANEL RESUMEN ─────────────────────────────────────────────
function ResumenPanel({registros,titulo,isCalidad,notas,onNota,eliminados,onElim,onRestore}:{registros:Reg[];titulo:string;isCalidad:boolean;notas:Record<string,string>;onNota:(id:string,v:string)=>void;eliminados:Set<string>;onElim:(id:string)=>void;onRestore:(id:string)=>void}){
  const[tab,sTab]=useState<"alertas"|"obs"|"reincidencias"|"ranking">("alertas");
  const vis=registros.filter(r=>!eliminados.has(r.id));
  const k=kpis(vis);const als=extraerAlertas(vis);const obs=extraerObs(vis);const rein=calcReincidencias(vis);
  const ranking=MODS.map(m=>{const count=als.filter(a=>a.registro.tipo===m.id).length;return{icon:m.icon,label:m.label,count};}).filter(x=>x.count>0).sort((a,b)=>b.count-a.count);
  const maxR=ranking[0]?.count||1;
  function exportar(){dlTxt(buildTxt(registros,titulo,notas,eliminados),`CV_${titulo.replace(/\s/g,"_")}.txt`);}
  return<div className="flex flex-col gap-3">
    <div className="grid grid-cols-3 gap-2">
      {[{l:"Registros",v:k.total,c:"text-blue-600"},{l:"Alertas",v:k.alertas,c:k.alertas>0?"text-red-600":"text-green-600"},{l:"NC",v:k.nc,c:k.nc>0?"text-amber-600":"text-green-600"}].map((x,i)=><div key={i} className="bg-white rounded-xl border border-gray-200 p-2 text-center"><div className="text-xs text-gray-400">{x.l}</div><div className={`text-xl font-bold ${x.c}`}>{x.v}</div></div>)}
    </div>
    <div className="grid grid-cols-3 gap-2">
      {[{l:"BPM-NC",v:k.bpm_nc,c:k.bpm_nc>0?"text-red-600":"text-green-600"},{l:"Decomisos",v:k.decomisos,c:"text-gray-700"},{l:"Kg decomis.",v:k.kg,c:"text-gray-700"}].map((x,i)=><div key={i} className="bg-white rounded-xl border border-gray-200 p-2 text-center"><div className="text-xs text-gray-400">{x.l}</div><div className={`text-xl font-bold ${x.c}`}>{x.v}</div></div>)}
    </div>
    <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
      {([{k:"alertas",l:`⚠ (${als.length})`},{k:"obs",l:`📝 (${obs.length})`},{k:"reincidencias",l:`🔁 (${rein.length})`},{k:"ranking",l:"🏆"}] as const).map(t=>(
        <button key={t.k} onClick={()=>sTab(t.k)} className={cn("flex-1 text-[10px] font-medium py-1.5 rounded-lg",tab===t.k?"bg-white text-gray-800 shadow-sm":"text-gray-500")}>{t.l}</button>
      ))}
    </div>
    {tab==="alertas"&&<div className="flex flex-col gap-2">{als.length===0?<div className="text-center py-6 text-gray-400 text-sm">✓ Sin alertas</div>:als.map((a,i)=><div key={i} className="bg-red-50 border border-red-200 rounded-xl p-3"><div className="flex items-start justify-between gap-2"><div><div className="text-xs font-semibold text-red-700">{a.tipo}</div><div className="text-xs text-gray-600 mt-0.5">Valor: <b>{a.valor}</b> · Límite: {a.limite}</div><div className="text-[10px] text-gray-400 mt-0.5">{fd(a.registro.fecha)} {a.registro.hora} · {a.registro.responsable}</div></div>{isCalidad&&<button onClick={()=>onElim(a.registro.id)} className="text-[10px] text-gray-400 hover:text-red-500">Ocultar</button>}</div>{notas[a.registro.id]&&<div className="mt-1 text-xs text-yellow-700 bg-yellow-50 rounded px-2 py-0.5">📝 {notas[a.registro.id]}</div>}</div>)}</div>}
    {tab==="obs"&&<div className="flex flex-col gap-2">{obs.length===0?<div className="text-center py-6 text-gray-400 text-sm">Sin observaciones</div>:obs.map((o,i)=><div key={i} className="bg-white border border-gray-200 rounded-xl p-3"><div className="text-xs text-gray-700">{o.texto}</div><div className="text-[10px] text-gray-400 mt-1">{fd(o.registro.fecha)} {o.registro.hora} · {o.registro.responsable}</div>{notas[o.registro.id]&&<div className="mt-1 text-xs text-yellow-700 bg-yellow-50 rounded px-2 py-0.5">📝 {notas[o.registro.id]}</div>}{isCalidad&&<button onClick={()=>onElim(o.registro.id)} className="text-[10px] text-gray-400 hover:text-red-500 mt-1">Ocultar</button>}</div>)}</div>}
    {tab==="reincidencias"&&<div className="flex flex-col gap-2">{rein.length===0?<div className="text-center py-6 text-gray-400 text-sm">✓ Sin reincidencias</div>:rein.map((r,i)=><div key={i} className={cn("rounded-xl border p-3",r.critico?"border-red-300 bg-red-50":"border-amber-200 bg-amber-50")}><div className="flex items-center justify-between"><div className="text-xs font-semibold">{r.critico?"🔴 CRÍTICO":"🟡"} {r.tipo}</div><div className={cn("text-sm font-bold",r.critico?"text-red-700":"text-amber-700")}>{r.count}×</div></div><div className="text-[10px] text-gray-500 mt-0.5">{r.critico?"≥ 3 — requiere acción correctiva":"Apareció más de una vez"}</div></div>)}</div>}
    {tab==="ranking"&&<div className="flex flex-col gap-2">{ranking.length===0?<div className="text-center py-6 text-gray-400 text-sm">Sin alertas</div>:ranking.map((r,i)=><div key={i} className="bg-white border border-gray-200 rounded-xl p-3"><div className="flex items-center justify-between mb-1"><span className="text-sm">{r.icon} {r.label}</span><span className="text-sm font-bold text-red-600">{r.count}</span></div><div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-red-400 rounded-full" style={{width:`${(r.count/maxR)*100}%`}}/></div></div>)}</div>}
    {isCalidad&&eliminados.size>0&&<details className="bg-gray-50 border border-gray-200 rounded-xl"><summary className="p-3 text-xs font-medium text-gray-500 cursor-pointer">Ocultos ({eliminados.size})</summary><div className="px-3 pb-3 flex flex-col gap-1">{registros.filter(r=>eliminados.has(r.id)).map(r=>{const m=MODS.find(x=>x.id===r.tipo);return<div key={r.id} className="flex items-center justify-between text-xs py-1"><span>{m?.icon} {m?.label} · {r.hora}</span><button onClick={()=>onRestore(r.id)} className="text-blue-500">Restaurar</button></div>;})}<button onClick={()=>registros.forEach(r=>{if(eliminados.has(r.id))onRestore(r.id);})} className="text-xs text-blue-500 mt-1">Restaurar todos</button></div></details>}
    {isCalidad&&<button onClick={exportar} className="h-10 rounded-xl border border-blue-300 text-blue-600 text-sm font-medium hover:bg-blue-50">📄 Exportar .txt</button>}
  </div>;
}

// ── DASHBOARD ─────────────────────────────────────────────────
function Dash({registros,label}:{registros:Reg[];label:string}){
  const k=kpis(registros);
  // KPIs T° cámaras (último registro de temperaturas)
  const lastTemp=registros.filter(r=>r.tipo==="temperaturas").sort((a,b)=>b.timestamp.localeCompare(a.timestamp))[0] as RTempML|undefined;
  const bd=MODS.map(m=>({name:m.icon+m.label.split(" ")[0],cant:k.por_tipo[m.id]??0}));
  const td=TURNOS.map(t=>({turno:t.label,registros:registros.filter(r=>r.turno===t.id).length,alertas:registros.filter(r=>r.turno===t.id).reduce((a,r)=>a+cAl(r.alertas),0)}));
  // Trend de alertas por día
  const byDay:Record<string,number>={};for(const r of registros){const d=r.fecha;byDay[d]=(byDay[d]||0)+cAl(r.alertas);}
  const trendData=Object.entries(byDay).sort(([a],[b])=>a.localeCompare(b)).map(([d,v])=>({dia:fd(d),alertas:v}));

  function StatBox({label:l,value:v,unit,ok,warn}:{label:l:string;value:string;unit?:string;ok?:boolean;warn?:boolean}){
    return<div className={cn("rounded-xl border p-3 text-center",warn?"border-red-300 bg-red-50":ok===false?"border-amber-200 bg-amber-50":"bg-white border-gray-200")}>
      <div className="text-[10px] text-gray-400">{l}</div>
      <div className={cn("text-xl font-bold mt-0.5",warn?"text-red-600":ok===false?"text-amber-600":"text-blue-700")}>{v}{unit&&<span className="text-xs ml-0.5">{unit}</span>}</div>
    </div>;
  }

  return<div className="p-4 flex flex-col gap-4">
    <p className="text-xs text-gray-400 font-medium">{label}</p>

    {/* KPIs generales */}
    <div className="grid grid-cols-2 gap-3">
      {[{l:"Registros",v:String(k.total),c:"text-blue-600"},{l:"Alertas PCC",v:String(k.alertas),c:k.alertas>0?"text-red-600":"text-green-600"},{l:"NC formales",v:String(k.nc),c:k.nc>0?"text-amber-600":"text-green-600"},{l:"BPM-NC",v:String(k.bpm_nc),c:k.bpm_nc>0?"text-red-600":"text-green-600"},{l:"Decomisos kg",v:String(k.kg),c:"text-gray-700"},{l:"Decomisos",v:String(k.decomisos),c:"text-gray-700"}].map((x,i)=><div key={i} className="bg-white rounded-xl border border-gray-200 p-3"><div className="text-xs text-gray-400">{x.l}</div><div className={`text-2xl font-bold mt-0.5 ${x.c}`}>{x.v}</div></div>)}
    </div>

    {/* KPIs Temperaturas en tiempo real */}
    {lastTemp&&<>
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Último registro de Temperaturas</div>
      <div className="grid grid-cols-3 gap-2">
        <StatBox label="T° Cám. Masas" value={lastTemp.t_camara_masas||"—"} unit="°C" warn={!!lastTemp.alertas.t_camara_masas}/>
        <StatBox label="T° Ambiente" value={lastTemp.t_ambiente||"—"} unit="°C" warn={!!lastTemp.alertas.t_ambiente}/>
        <StatBox label="T° Cám. PT" value={lastTemp.t_camara_pt||"—"} unit="°C" warn={!!lastTemp.alertas.t_camara_pt}/>
        <StatBox label="T° Ferment." value={lastTemp.t_fermentador||"—"} unit="°C" warn={!!lastTemp.alertas.t_fermentador}/>
        <StatBox label="T° Abatidor" value={lastTemp.t_abatido||"—"} unit="°C" warn={!!lastTemp.alertas.t_abatidor}/>
        <StatBox label="T° PT Final" value={lastTemp.t_camara_pt_final||"—"} unit="°C" warn={!!lastTemp.alertas.t_camara_pt_final}/>
      </div>
    </>}

    {/* Trend alertas */}
    {trendData.length>1&&<div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Tendencia de alertas</div>
      <ResponsiveContainer width="100%" height={110}><LineChart data={trendData}><XAxis dataKey="dia" tick={{fontSize:9}}/><YAxis tick={{fontSize:9}}/><Tooltip/><Line type="monotone" dataKey="alertas" stroke="#f87171" strokeWidth={2} dot={false} name="Alertas"/></LineChart></ResponsiveContainer>
    </div>}

    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Registros por módulo</div>
      <ResponsiveContainer width="100%" height={130}><BarChart data={bd} margin={{top:0,right:0,left:-20,bottom:0}}><XAxis dataKey="name" tick={{fontSize:9}}/><YAxis tick={{fontSize:9}}/><Tooltip/><Bar dataKey="cant" fill="#3b82f6" radius={[4,4,0,0]} name="Registros"/></BarChart></ResponsiveContainer>
    </div>
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Por turno</div>
      <ResponsiveContainer width="100%" height={110}><BarChart data={td} margin={{top:0,right:0,left:-20,bottom:0}}><XAxis dataKey="turno" tick={{fontSize:10}}/><YAxis tick={{fontSize:9}}/><Tooltip/><Bar dataKey="registros" fill="#93c5fd" radius={[4,4,0,0]} name="Registros"/><Bar dataKey="alertas" fill="#f87171" radius={[4,4,0,0]} name="Alertas"/><Legend iconSize={8} wrapperStyle={{fontSize:11}}/></BarChart></ResponsiveContainer>
    </div>
  </div>;
}

// ── GESTIÓN PROVEEDORES ───────────────────────────────────────
function ProveedoresPanel({isCalidad}:{isCalidad:boolean}){
  const[provs,sProvs]=useState<Proveedor[]>([]);const[form,sForm]=useState<Partial<Proveedor>|null>(null);const[cg,sCg]=useState(false);
  useEffect(()=>{sCg(true);return onSnapshot(provCol(),(snap)=>{sProvs(snap.docs.map(d=>({id:d.id,...d.data()} as Proveedor)));sCg(false);});},[]);
  async function guardar(){if(!form?.nombre?.trim())return;const data={nombre:form.nombre||"",rubro:form.rubro||"",contacto:form.contacto||"",notas:form.notas||""};if(form.id){await setDoc(doc(db,"sv_proveedores",form.id),data);}else{await addDoc(provCol(),data);}sForm(null);}
  async function eliminar(id:string){if(!window.confirm("¿Eliminar proveedor?"))return;await deleteDoc(doc(db,"sv_proveedores",id));}
  return<div className="p-4 flex flex-col gap-3">
    <div className="flex items-center justify-between"><div className="text-sm font-bold text-gray-800">Proveedores / Base MP</div>{isCalidad&&<button onClick={()=>sForm({})} className="bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">+ Nuevo</button>}</div>
    {cg&&<div className="flex justify-center p-6"><Spin/></div>}
    {form!==null&&<div className="bg-white rounded-xl border border-blue-300 p-4 flex flex-col gap-3">
      <div className="text-sm font-semibold text-gray-700">{form.id?"Editar proveedor":"Nuevo proveedor"}</div>
      <Txt label="Nombre" value={form.nombre||""} onChange={v=>sForm(p=>({...p,nombre:v}))}/>
      <Txt label="Rubro / tipo de insumo" value={form.rubro||""} onChange={v=>sForm(p=>({...p,rubro:v}))} ph="ej: Harina, Grasa, Packaging"/>
      <Txt label="Contacto" value={form.contacto||""} onChange={v=>sForm(p=>({...p,contacto:v}))} ph="Tel / email"/>
      <TA label="Notas" value={form.notas||""} onChange={v=>sForm(p=>({...p,notas:v}))} ph="Condiciones, acuerdos, observaciones…"/>
      <div className="flex gap-2"><button onClick={()=>sForm(null)} className="flex-1 h-10 rounded-xl border border-gray-200 text-sm text-gray-600">Cancelar</button><button onClick={guardar} className="flex-[2] h-10 rounded-xl bg-blue-500 text-white text-sm font-semibold">Guardar</button></div>
    </div>}
    {provs.length===0&&!cg&&<div className="text-center py-8 text-gray-400 text-sm">Sin proveedores cargados</div>}
    {provs.map(p=><div key={p.id} className="bg-white rounded-xl border border-gray-200 p-3">
      <div className="flex items-start justify-between gap-2"><div><div className="text-sm font-semibold text-gray-800">{p.nombre}</div>{p.rubro&&<div className="text-xs text-gray-400">{p.rubro}</div>}{p.contacto&&<div className="text-xs text-blue-500">{p.contacto}</div>}{p.notas&&<div className="text-xs text-gray-500 mt-1">{p.notas}</div>}</div>
      {isCalidad&&<div className="flex flex-col gap-1"><button onClick={()=>sForm(p)} className="text-xs text-blue-500 px-2 py-1 rounded border border-blue-200">Editar</button><button onClick={()=>eliminar(p.id)} className="text-xs text-red-400 px-2 py-1 rounded border border-red-200">Eliminar</button></div>}</div>
    </div>)}
  </div>;
}

// ── LOGIN ─────────────────────────────────────────────────────
function Login({onLogin}:{onLogin:(u:Usuario)=>void}){
  const[n,sN]=useState("");const[t,sT]=useState<Turno>("TM");const[r,sR]=useState<Rol>("control_volante");const[p,sP]=useState("");const[pe,sPE]=useState(false);const[rec,sRec]=useState<Usuario[]>([]);const[editMode,sEM]=useState(false);
  useEffect(()=>{try{const s=localStorage.getItem(UK);if(s)sRec(JSON.parse(s).slice(0,8));}catch{}},[]);
  function go(){if(!n.trim())return;if(r==="calidad"&&p!==PIN){sPE(true);return;}const u:Usuario={nombre:n.trim(),rol:r,turno:t};try{const prev=JSON.parse(localStorage.getItem(UK)||"[]");localStorage.setItem(UK,JSON.stringify([u,...prev.filter((x:Usuario)=>x.nombre!==u.nombre||x.rol!==u.rol)].slice(0,8)));}catch{}onLogin(u);}
  function eliminarRec(idx:number){try{const prev=JSON.parse(localStorage.getItem(UK)||"[]");prev.splice(idx,1);localStorage.setItem(UK,JSON.stringify(prev));sRec(prev);}catch{}}
  return<div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4"><div className="w-full max-w-sm">
    <div className="text-center mb-8"><div className="text-4xl mb-2">🍽️</div><h1 className="text-2xl font-bold text-gray-800">Sabores Express</h1><p className="text-sm text-gray-500 mt-1">Control de Calidad · v5</p></div>
    {rec.length>0&&<div className="mb-4">
      <div className="flex items-center justify-between mb-2"><p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Acceso rápido</p><button onClick={()=>sEM(e=>!e)} className="text-xs text-blue-500">{editMode?"Listo":"Editar"}</button></div>
      {rec.map((u,i)=><div key={i} className="flex items-center gap-2 mb-1.5">
        <button onClick={()=>!editMode&&onLogin(u)} className={cn("flex-1 flex items-center gap-3 p-3 rounded-xl bg-white border text-sm",editMode?"border-gray-100 opacity-70":"border-gray-200 hover:border-blue-400")}>
          <span>{u.rol==="calidad"?"🔑":"👷"}</span><span className="font-medium text-gray-800 flex-1 text-left">{u.nombre} <span className="text-gray-400 font-normal">· {TURNOS.find(x=>x.id===u.turno)?.label}</span></span><Badge t={u.rol==="calidad"?"Calidad":"CV"} c="blue"/>
        </button>
        {editMode&&<button onClick={()=>eliminarRec(i)} className="w-8 h-8 rounded-lg bg-red-100 text-red-600 text-sm font-bold flex items-center justify-center">✕</button>}
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
function VDia({u,mes,sem,dia,onBack,proveedores}:{u:Usuario;mes:MesI;sem:SemI;dia:DiaI;onBack:()=>void;proveedores:Proveedor[]}){
  const[regs,sR]=useState<Reg[]>([]);const[cg,sCg]=useState(false);const[mod,sMod]=useState<Tipo|null>(null);const[filtro,sFiltro]=useState<Turno|"todos">("todos");const[vista,sV]=useState<"registros"|"resumen"|"dashboard">("registros");const[notas,sNotas]=useState<Record<string,string>>({});const[elim,sElim]=useState<Set<string>>(new Set());const[toast,sToast]=useState<{msg:string;tipo:"ok"|"err"}|null>(null);
  const showT=useCallback((msg:string,tipo:"ok"|"err"="ok")=>{sToast({msg,tipo});setTimeout(()=>sToast(null),3000);},[]);
  async function cargar(){sCg(true);try{const rs=await loadDia(mes.id,sem.semana,dia.fecha);sR(rs);}catch{showT("Error al cargar","err");}finally{sCg(false);}}
  useEffect(()=>{cargar();},[dia.fecha]);
  async function guardar(rec:Reg){try{await setDoc(doc(db,fsPath(mes.id,sem.semana,dia.fecha),rec.id),san(rec as unknown as Record<string,unknown>));sR(p=>[rec,...p.filter(r=>r.id!==rec.id)]);showT(`✓ Guardado${cAl(rec.alertas)>0?" — ⚠ con alertas":""}`);sMod(null);}catch{showT("Error al guardar","err");}}
  async function eliminar(id:string){if(u.rol!=="calidad")return;try{await deleteDoc(doc(db,fsPath(mes.id,sem.semana,dia.fecha),id));sR(p=>p.filter(r=>r.id!==id));showT("Eliminado");}catch{showT("Error","err");}}
  const fp={u,onSave:guardar,onCancel:()=>sMod(null)};
  if(mod)return<div className="min-h-screen bg-gray-50 max-w-lg mx-auto">
    {mod==="temperaturas"&&<FTemp {...fp}/>}
    {mod==="pesos_ml"&&<FPesosML {...fp}/>}
    {mod==="bpm_nc"&&<FBPMNC {...fp} regsHoy={regs}/>}
    {mod==="recepcion"&&<FRecep {...fp} proveedores={proveedores}/>}
    {mod==="despacho"&&<FDesp {...fp}/>}
    {mod==="nc"&&<FNC {...fp}/>}
    {mod==="decomiso"&&<FDecom {...fp}/>}
    {mod==="limpieza"&&<FLimp {...fp}/>}
  </div>;
  const alT=regs.reduce((a,r)=>a+cAl(r.alertas),0);const fR=filtro==="todos"?regs:regs.filter(r=>r.turno===filtro);
  const titulo=`${mes.label} · Sem ${sem.semana} · ${fd(dia.fecha)}`;
  return<div className="min-h-screen bg-gray-50 max-w-lg mx-auto pb-24">
    <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-3 sticky top-0 z-10">
      <div className="flex items-center gap-2"><button onClick={onBack} className="text-gray-400 p-1">←</button><div className="flex-1"><p className="text-xs text-gray-400">{mes.label} · Semana {sem.semana}</p><p className="text-base font-bold text-gray-800">{DN[dia.diaSem]} {fd(dia.fecha)}</p></div>{alT>0&&<ABadge n={alT}/>}{cg&&<Spin/>}</div>
      <div className="flex gap-1 mt-2 bg-gray-100 rounded-xl p-1">
        {([{k:"registros",l:"Registros"},{k:"resumen",l:"Resumen"},{k:"dashboard",l:"Dashboard"}] as const).map(x=><button key={x.k} onClick={()=>sV(x.k)} className={cn("flex-1 text-xs font-medium py-1.5 rounded-lg",vista===x.k?"bg-white text-gray-800 shadow-sm":"text-gray-500")}>{x.l}</button>)}
      </div>
    </div>
    {vista==="registros"&&<div className="px-4 pt-4 flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-2">{MODS.map(m=><button key={m.id} onClick={()=>sMod(m.id)} className={cn("bg-white rounded-xl border p-2 text-center active:scale-95 flex flex-col items-center gap-1",m.id==="bpm_nc"?"border-red-200 hover:border-red-400":"border-gray-200 hover:border-blue-400")}><span className="text-lg">{m.icon}</span><span className="text-[9px] font-medium text-gray-700 leading-tight">{m.label.split(" ")[0]}</span><Badge t={m.badge} c={m.badge==="PCC"?"red":m.badge==="PC"?"amber":m.badge==="BPM"?"green":m.badge==="POES"?"purple":m.badge==="HACCP"?"red":"blue"}/></button>)}</div>
      <div className="flex gap-2 overflow-x-auto pb-1">{(["todos",...TURNOS.map(x=>x.id)] as (Turno|"todos")[]).map(t=><button key={t} onClick={()=>sFiltro(t)} className={cn("px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border",filtro===t?"bg-blue-500 text-white border-blue-500":"bg-white text-gray-600 border-gray-200")}>{t==="todos"?"Todos":t}</button>)}</div>
      {cg?<div className="flex justify-center p-8"><Spin/></div>:fR.length===0?<div className="text-center p-8 text-gray-400"><div className="text-3xl mb-2">📋</div><p className="text-sm">Sin registros</p></div>:<div className="flex flex-col gap-2">{fR.map(r=><RegCard key={r.id} r={r} isC={u.rol==="calidad"} nota={notas[r.id]||""} onNota={v=>sNotas(p=>({...p,[r.id]:v}))} onDelete={u.rol==="calidad"?()=>eliminar(r.id):undefined}/>)}</div>}
    </div>}
    {vista==="resumen"&&<div className="px-4 pt-4"><ResumenPanel registros={regs} titulo={titulo} isCalidad={u.rol==="calidad"} notas={notas} onNota={(id,v)=>sNotas(p=>({...p,[id]:v}))} eliminados={elim} onElim={id=>sElim(p=>new Set([...p,id]))} onRestore={id=>sElim(p=>{const n=new Set(p);n.delete(id);return n;})}/></div>}
    {vista==="dashboard"&&<Dash registros={regs} label={titulo}/>}
    {toast&&<div className={cn("fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-white text-sm font-medium shadow-lg z-50",toast.tipo==="ok"?"bg-gray-800":"bg-red-500")}>{toast.msg}</div>}
  </div>;
}

// ── VISTA SEMANA ──────────────────────────────────────────────
function VSem({u,mes,sem,onBack,proveedores}:{u:Usuario;mes:MesI;sem:SemI;onBack:()=>void;proveedores:Proveedor[]}){
  const[dia,sDia]=useState<DiaI|null>(null);const[vista,sV]=useState<"dias"|"resumen"|"dashboard">("dias");const[allRegs,sAll]=useState<Reg[]>([]);const[cg,sCg]=useState(false);const[notas,sNotas]=useState<Record<string,string>>({});const[elim,sElim]=useState<Set<string>>(new Set());
  const HOY=hoy();
  useEffect(()=>{(async()=>{sCg(true);const rs:Reg[]=[];for(const d of sem.dias){if(!d.fecha||d.fecha>HOY)continue;const dr=await loadDia(mes.id,sem.semana,d.fecha);rs.push(...dr);}sAll(rs);sCg(false);})();},[]);
  if(dia)return<VDia u={u} mes={mes} sem={sem} dia={dia} onBack={()=>sDia(null)} proveedores={proveedores}/>;
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
function VMes({u,mes,onBack,proveedores}:{u:Usuario;mes:MesI;onBack:()=>void;proveedores:Proveedor[]}){
  const[sem,sSem]=useState<SemI|null>(null);const[vista,sV]=useState<"semanas"|"resumen"|"dashboard">("semanas");const[allRegs,sAll]=useState<Reg[]>([]);const[cg,sCg]=useState(false);const[notas,sNotas]=useState<Record<string,string>>({});const[elim,sElim]=useState<Set<string>>(new Set());
  const HOY=hoy();
  useEffect(()=>{(async()=>{sCg(true);const rs:Reg[]=[];for(const s of mes.semanas)for(const d of s.dias){if(!d.fecha||d.fecha>HOY)continue;const dr=await loadDia(mes.id,s.semana,d.fecha);rs.push(...dr);}sAll(rs);sCg(false);})();},[]);
  if(sem)return<VSem u={u} mes={mes} sem={sem} onBack={()=>sSem(null)} proveedores={proveedores}/>;
  return<div className="min-h-screen bg-gray-50 max-w-lg mx-auto pb-20">
    <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-3 sticky top-0 z-10">
      <div className="flex items-center gap-3"><button onClick={onBack} className="text-gray-400 p-1">←</button><p className="text-base font-bold text-gray-800 flex-1">{mes.label}</p>{cg&&<Spin/>}</div>
      <div className="flex gap-1 mt-2 bg-gray-100 rounded-xl p-1">{([{k:"semanas",l:"Semanas"},{k:"resumen",l:"Resumen mes"},{k:"dashboard",l:"Dashboard"}] as const).map(x=><button key={x.k} onClick={()=>sV(x.k)} className={cn("flex-1 text-xs font-medium py-1.5 rounded-lg",vista===x.k?"bg-white text-gray-800 shadow-sm":"text-gray-500")}>{x.l}</button>)}</div>
    </div>
    {vista==="semanas"&&<div className="p-4"><div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4"><div className="grid grid-cols-7 gap-1 mb-2">{DN.map(d=><div key={d} className="text-center text-[10px] font-semibold text-gray-400">{d}</div>)}</div>{mes.semanas.map(s=><div key={s.semana} className="grid grid-cols-7 gap-1 mb-1">{s.dias.map((d,i)=>{if(d.dayOfMonth===-1)return<div key={i}/>;const eH=d.fecha===HOY;const eF=d.fecha>HOY;return<div key={i} onClick={()=>!eF&&sSem(s)} className={cn("aspect-square rounded-lg flex items-center justify-center text-xs cursor-pointer",eH?"bg-blue-500 text-white font-bold":eF?"text-gray-300":"text-gray-700 hover:bg-blue-50 font-medium")}>{d.dayOfMonth}</div>;})}</div>)}</div><div className="flex flex-col gap-2">{mes.semanas.map(s=>{const p=s.dias.find(d=>d.dayOfMonth>0);const ul=[...s.dias].reverse().find(d=>d.dayOfMonth>0);const eH=s.dias.some(d=>d.fecha===HOY);const eF=p&&p.fecha>HOY;return<button key={s.semana} onClick={()=>!eF&&sSem(s)} disabled={!!eF} className={cn("bg-white rounded-xl border p-4 text-left flex items-center gap-3",eH?"border-blue-400 bg-blue-50":eF?"border-gray-100 opacity-50 cursor-default":"border-gray-200 hover:border-blue-300")}><div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0",eH?"bg-blue-500 text-white":"bg-gray-100 text-gray-600")}>{s.semana}</div><div className="flex-1"><p className="text-sm font-semibold text-gray-800">Semana {s.semana}</p><p className="text-xs text-gray-400">{fd(p?.fecha||"")} — {fd(ul?.fecha||"")}</p></div>{eH&&<Badge t="Esta semana" c="blue"/>}{!eF&&<span className="text-gray-300 text-xs">›</span>}</button>;})}</div></div>}
    {vista==="resumen"&&<div className="px-4 pt-4"><ResumenPanel registros={allRegs} titulo={mes.label} isCalidad={u.rol==="calidad"} notas={notas} onNota={(id,v)=>sNotas(p=>({...p,[id]:v}))} eliminados={elim} onElim={id=>sElim(p=>new Set([...p,id]))} onRestore={id=>sElim(p=>{const n=new Set(p);n.delete(id);return n;})}/></div>}
    {vista==="dashboard"&&<Dash registros={allRegs} label={mes.label}/>}
  </div>;
}

// ── HOME ──────────────────────────────────────────────────────
function Home({u,onLogout}:{u:Usuario;onLogout:()=>void}){
  const[anio,sAnio]=useState<number>(new Date().getFullYear());const[mes,sMes]=useState<MesI|null>(null);const[seccion,sSec]=useState<"calendario"|"proveedores">("calendario");const[proveedores,sProvs]=useState<Proveedor[]>([]);
  const HOY=hoy();
  useEffect(()=>{const[y,m]=HOY.split("-");sAnio(parseInt(y));const ma=CAL.find(x=>x.anio===parseInt(y)&&x.mes===parseInt(m)-1);if(ma)sMes(ma);},[]);
  useEffect(()=>{return onSnapshot(provCol(),(snap)=>{sProvs(snap.docs.map(d=>({id:d.id,...d.data()} as Proveedor)));});},[]);
  if(mes&&seccion==="calendario")return<VMes u={u} mes={mes} onBack={()=>sMes(null)} proveedores={proveedores}/>;
  const meses=CAL.filter(m=>m.anio===anio);
  return<div className="min-h-screen bg-gray-50 max-w-lg mx-auto pb-24">
    <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-3">
      <div className="flex items-center justify-between"><div><p className="text-xs text-gray-400">Sabores Express · Cocina Central</p><p className="text-base font-bold text-gray-800">{u.nombre}</p></div><div className="flex items-center gap-2"><div className={cn("text-xs font-semibold px-2 py-1 rounded-full",u.turno==="TM"?"bg-amber-100 text-amber-700":u.turno==="TT"?"bg-blue-100 text-blue-700":"bg-indigo-100 text-indigo-700")}>{TURNOS.find(t=>t.id===u.turno)?.label}</div><button onClick={onLogout} className="text-xs text-gray-400 hover:text-gray-600">Salir</button></div></div>
      {/* Nav */}
      <div className="flex gap-1 mt-3 bg-gray-100 rounded-xl p-1">
        {([{k:"calendario",l:"📅 Registros"},{k:"proveedores",l:"🏭 Proveedores"}] as const).map(x=><button key={x.k} onClick={()=>sSec(x.k)} className={cn("flex-1 text-xs font-medium py-1.5 rounded-lg",seccion===x.k?"bg-white text-gray-800 shadow-sm":"text-gray-500")}>{x.l}</button>)}
      </div>
    </div>
    {seccion==="proveedores"&&<ProveedoresPanel isCalidad={u.rol==="calidad"}/>}
    {seccion==="calendario"&&<div className="px-4 pt-4">
      <div className="flex gap-2 mb-4">{[anio-1,anio,anio+1].map(a=><button key={a} onClick={()=>sAnio(a)} className={cn("flex-1 h-10 rounded-xl font-semibold text-sm border",a===anio?"bg-blue-500 text-white border-blue-500":"bg-white text-gray-600 border-gray-200 hover:border-blue-300")}>{a}</button>)}</div>
      <div className="grid grid-cols-3 gap-2.5">{meses.map(m=>{const[y,mo]=HOY.split("-");const eA=m.anio===parseInt(y)&&m.mes===parseInt(mo)-1;const eP=m.anio<parseInt(y)||(m.anio===parseInt(y)&&m.mes<parseInt(mo)-1);const eF=!eA&&!eP;return<button key={m.id} onClick={()=>sMes(m)} className={cn("rounded-2xl border p-3 text-left active:scale-95",eA?"bg-blue-500 border-blue-500 text-white shadow-sm":eF?"bg-white border-gray-100 text-gray-300":"bg-white border-gray-200 text-gray-700 hover:border-blue-300")}><p className="text-xs font-semibold uppercase tracking-wide opacity-70">{eA?"● Actual":eP?"Pasado":"Próximo"}</p><p className={cn("text-sm font-bold mt-0.5",eA?"text-white":"")}>{MN[m.mes].slice(0,3)}</p><p className={cn("text-xs mt-0.5",eA?"text-blue-100":"text-gray-400")}>{m.semanas.length} sem</p></button>;})}
      </div>
    </div>}
  </div>;
}

// ── ROOT ──────────────────────────────────────────────────────
export default function ControlVolante(){
  const[u,sU]=useState<Usuario|null>(null);
  if(!u)return<Login onLogin={sU}/>;
  return<Home u={u} onLogout={()=>sU(null)}/>;
}
