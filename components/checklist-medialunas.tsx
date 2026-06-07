"use client";
// ═══════════════════════════════════════════════════════════════
// CONTROL VOLANTE — SABORES EXPRESS · v4.0
// Resumen: Día / Semana / Mes con alertas, reincidencias, ranking
// Módulo Medialunas: P276 Grasa / P280 Manteca · R200 / R201
// Solo Calidad puede editar/eliminar · Exportar .txt en cada nivel
// ═══════════════════════════════════════════════════════════════
import React,{useState,useEffect,useRef,useCallback}from"react";
import{initializeApp,getApps}from"firebase/app";
import{getFirestore,collection,doc,setDoc,getDocs,query,orderBy,deleteDoc}from"firebase/firestore";
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
interface RTemp  extends Base{tipo:"temperaturas";sector:string;t_camara_mp:string;t_camara_pt:string;t_coccion:string;t_recalentamiento:string;t_transporte:string;equipo_num:string;observaciones:string;}
interface RPesos extends Base{tipo:"pesos";producto:string;lote:string;peso_declarado:string;peso_1:string;peso_2:string;peso_3:string;promedio:number;desvio_pct:number;ajustado:string;observaciones:string;}
interface RBPM   extends Base{tipo:"bpm";sector:string;personal_auditado:string;lavado_manos:boolean;uniforme_completo:boolean;sin_joyas:boolean;sin_celular:boolean;sin_alimentos:boolean;estado_salud:string;personal_lesiones:string;observaciones:string;}
interface RRecep extends Base{tipo:"recepcion";proveedor:string;producto:string;remito_lote:string;t_ingreso:string;estado_envase:string;rotulado_ok:boolean;fifo_ok:boolean;resultado:string;observaciones:string;}
interface RDesp  extends Base{tipo:"despacho";local_destino:string;producto:string;lote:string;cantidad:string;t_despacho:string;t_transporte:string;etiquetado_ok:boolean;estado_embalaje:string;observaciones:string;}
interface RNC    extends Base{tipo:"nc";tipo_nc:string;descripcion:string;lote_afectado:string;causa_raiz:string;accion_inmediata:string;requiere_nc_formal:boolean;responsable_sector:string;}
interface RDecom extends Base{tipo:"decomiso";producto:string;lote:string;cantidad_kg:string;motivo:string;etapa_deteccion:string;destino:string;observaciones:string;}
interface RLimp  extends Base{tipo:"limpieza";sector:string;superficies_contacto:boolean;pisos_desagues:boolean;equipos:boolean;camaras:boolean;sanitizante:string;concentracion:string;atp_nivel:string;responsable_limpieza:string;observaciones:string;}
interface RMedialunas extends Base{tipo:"medialunas";
  // Identificación
  variedad:"manteca"|"grasa"|"";
  lote_harina:string;
  // Masa
  t_masa:string;t_agua:string;tiempo_amasado:string;peso_baston:string;
  // Fermentado
  t_fermentador:string;humedad_fermentador:string;tiempo_fermentado:string;
  // Abatido
  t_abatido:string;t_salida_abatidor:string;tiempo_abatido:string;
  // Medialunera
  peso_triangulo:string;calibre_masa:string;unidades_bandeja:string;
  // Cámara final
  t_camara_final:string;
  // Sensorial
  color_ok:boolean;forma_ok:boolean;textura_ok:boolean;
  sensorial_obs:string;
  // Recupero
  pct_recupero:string;
  observaciones:string;
}
type Reg=RTemp|RPesos|RBPM|RRecep|RDesp|RNC|RDecom|RLimp|RMedialunas;

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
function fsPath(mid:string,sem:number,fecha:string){return`cv/${mid}/semanas/sem_${sem}/dias/${fecha.replace(/-/g,"")}/items`;}
async function loadDia(mid:string,sem:number,fecha:string):Promise<Reg[]>{
  try{const s=await getDocs(query(collection(db,fsPath(mid,sem,fecha)),orderBy("timestamp","desc")));return s.docs.map(d=>d.data() as Reg);}catch{return[];}
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

// ── KPIs & ANÁLISIS ───────────────────────────────────────────
interface KPI{total:number;alertas:number;nc:number;decomisos:number;kg:number;bpm:number;medialunas:number;por_tipo:Record<string,number>;}
function kpis(rs:Reg[]):KPI{
  let al=0,nc=0,dec=0,kg=0,bok=0,bt=0,ml=0;const pt:Record<string,number>={};
  for(const r of rs){pt[r.tipo]=(pt[r.tipo]||0)+1;al+=cAl(r.alertas);if(r.tipo==="nc")nc++;if(r.tipo==="decomiso"){dec++;kg+=parseFloat((r as RDecom).cantidad_kg)||0;}if(r.tipo==="bpm"){bt++;const b=r as RBPM;if([b.lavado_manos,b.uniforme_completo,b.sin_joyas,b.sin_celular,b.sin_alimentos].every(Boolean)&&b.estado_salud==="apto")bok++;}if(r.tipo==="medialunas")ml++;}
  return{total:rs.length,alertas:al,nc,decomisos:dec,kg:Math.round(kg*10)/10,bpm:bt>0?Math.round(bok/bt*100):100,medialunas:ml,por_tipo:pt};
}

// Alertas activas detalladas
interface AlertaItem{campo:string;valor:string;limite:string;tipo:string;registro:Reg;}
function extraerAlertas(rs:Reg[]):AlertaItem[]{
  const out:AlertaItem[]=[];
  const labels:Record<string,{limite:string;tipo:string}>={
    t_camara_mp:{limite:"≤ 4°C",tipo:"T° cámara MP"},t_camara_pt:{limite:"≤ 4°C / -18°C",tipo:"T° cámara PT"},
    t_coccion:{limite:"≥ 75°C",tipo:"T° cocción"},t_recalentamiento:{limite:"≥ 65°C",tipo:"T° recalent."},
    t_despacho:{limite:"≤ 4°C",tipo:"T° despacho"},t_transporte:{limite:"≤ 7°C",tipo:"T° transporte"},
    t_ingreso:{limite:"≤ 7°C",tipo:"T° recepción MP"},desvio:{limite:"≤ 5%",tipo:"Desvío peso"},
    rechazado:{limite:"Rechazado",tipo:"Rechazo MP/envase"},no_apto:{limite:"No apto",tipo:"Salud personal"},
    bpm_inc:{limite:"Incompleto",tipo:"BPM incompleto"},sin_accion:{limite:"Sin acción",tipo:"NC sin acción"},
    sin_foto:{limite:"Sin foto",tipo:"Decomiso sin foto"},superficies_no_ok:{limite:"No verificado",tipo:"Superficies PCC"},
    t_masa_alta:{limite:"20°C ±2°C",tipo:"T° masa fuera rango"},t_fermentador_nc:{limite:"33°C / 90% hum",tipo:"T° fermentador NC"},
    t_abatidor_nc:{limite:"-24°C ±2°C (mant) / -16 a -20°C (grasa)",tipo:"T° abatidor NC"},
    t_salida_nc:{limite:"≤ -12°C (mant) / listo para envasar (grasa)",tipo:"T° salida abatidor NC"},
    t_camara_nc:{limite:"≤ -17°C",tipo:"T° cámara final NC"},
    peso_triangulo_nc:{limite:"60g (manteca) / 50±2g (grasa)",tipo:"Peso triángulo NC"},
    recupero_exc:{limite:"≤ 10% de harina",tipo:"Recupero excedido"},
  };
  for(const r of rs){
    for(const[k,v]of Object.entries(r.alertas)){
      if(v){
        const l=labels[k]||{limite:"—",tipo:k};
        const val=(r as Record<string,unknown>)[k];
        out.push({campo:k,valor:typeof val==="string"?val:"—",limite:l.limite,tipo:l.tipo,registro:r});
      }
    }
  }
  return out;
}

// Observaciones de campos ob
function extraerObs(rs:Reg[]):Array<{texto:string;registro:Reg}>{
  const out:Array<{texto:string;registro:Reg}>=[];
  for(const r of rs){
    const o=(r as Record<string,unknown>).observaciones;
    if(typeof o==="string"&&o.trim())out.push({texto:o.trim(),registro:r});
    if(r.tipo==="nc"){const d=(r as RNC).descripcion;if(d)out.push({texto:`NC: ${d}`,registro:r});}
  }
  return out;
}

// Reincidencias: alertas que aparecen más de una vez
interface Reincidencia{tipo:string;count:number;critico:boolean;registros:Reg[];}
function calcReincidencias(rs:Reg[]):Reincidencia[]{
  const map:Record<string,{count:number;regs:Reg[]}>={}; 
  const als=extraerAlertas(rs);
  for(const a of als){const k=a.tipo;if(!map[k])map[k]={count:0,regs:[]};map[k].count++;map[k].regs.push(a.registro);}
  return Object.entries(map).filter(([,v])=>v.count>1).map(([k,v])=>({tipo:k,count:v.count,critico:v.count>=3,registros:v.regs})).sort((a,b)=>b.count-a.count);
}

// ── EXPORT TXT ────────────────────────────────────────────────
const MODS:{id:Tipo;label:string;icon:string;badge:string}[]=[
  {id:"temperaturas",label:"Temperaturas",icon:"🌡️",badge:"PCC"},{id:"pesos",label:"Pesos",icon:"⚖️",badge:"PC"},
  {id:"bpm",label:"BPM Personal",icon:"👤",badge:"BPM"},{id:"recepcion",label:"Recepción MP",icon:"🚚",badge:"PCC"},
  {id:"despacho",label:"Despacho",icon:"📦",badge:"PC"},{id:"nc",label:"No Conformidad",icon:"⚠️",badge:"ISO"},
  {id:"decomiso",label:"Decomiso",icon:"🗑️",badge:"HACCP"},{id:"limpieza",label:"Limpieza POES",icon:"🧹",badge:"POES"},
  {id:"medialunas",label:"Medialunas",icon:"🥐",badge:"P276/280"},
];
const TURNOS=[{id:"TM" as Turno,label:"Mañana"},{id:"TT" as Turno,label:"Tarde"},{id:"TN" as Turno,label:"Noche"}];
const UK="sv_usuarios",PIN="1234";

function buildTxt(rs:Reg[],titulo:string,notas:Record<string,string>,elim:Set<string>):string{
  const vis=rs.filter(r=>!elim.has(r.id));
  const k=kpis(vis);const als=extraerAlertas(vis);const obs=extraerObs(vis);const rein=calcReincidencias(vis);
  let t=`REPORTE — CONTROL VOLANTE\nSabores Express · Cocina Central\n${titulo}\nGenerado: ${new Date().toLocaleString("es-AR")}\n${"─".repeat(42)}\n\n`;
  t+=`RESUMEN\nRegistros: ${k.total} | Alertas: ${k.alertas} | NC: ${k.nc} | Decomisos: ${k.decomisos} (${k.kg}kg) | BPM: ${k.bpm}%\n\n`;
  if(als.length){t+=`ALERTAS (${als.length})\n`;for(const a of als)t+=`  [${fd(a.registro.fecha)} ${a.registro.hora}] ⚠ ${a.tipo} — ${a.valor} (límite ${a.limite}) · ${a.registro.responsable}\n`;}
  if(rein.length){t+=`\nREINCIDENCIAS\n`;for(const r of rein)t+=`  ${r.critico?"🔴 CRÍTICO":"🟡"} ${r.tipo}: ${r.count} veces\n`;}
  if(obs.length){t+=`\nOBSERVACIONES\n`;for(const o of obs){t+=`  [${fd(o.registro.fecha)} ${o.registro.hora}] ${o.texto}\n`;const n=notas[o.registro.id];if(n)t+=`    Nota: ${n}\n`;}}
  t+=`\n${"─".repeat(42)}\nDETALLE POR TURNO\n`;
  for(const tr of TURNOS){const trRs=vis.filter(r=>r.turno===tr.id);if(!trRs.length)continue;t+=`\nTURNO ${tr.label.toUpperCase()}\n`;for(const r of trRs){const m=MODS.find(x=>x.id===r.tipo);t+=`  [${r.hora}] ${m?.icon} ${m?.label}${cAl(r.alertas)>0?" ⚠":""} · ${r.responsable}\n`;if(r.tipo==="nc")t+=`    ${(r as RNC).tipo_nc} — ${(r as RNC).descripcion}\n    Acción: ${(r as RNC).accion_inmediata}\n`;if(r.tipo==="decomiso")t+=`    ${(r as RDecom).producto} ${(r as RDecom).cantidad_kg}kg — ${(r as RDecom).motivo}\n`;if(r.tipo==="medialunas"){const ml=r as RMedialunas;t+=`    Variedad: ${ml.variedad} | Lote: ${ml.lote_harina}\n`;t+=`    T°masa: ${ml.t_masa}°C | T°ferment: ${ml.t_fermentador}°C (${ml.humedad_fermentador}% hum) | T°abat: ${ml.t_abatido}°C\n`;t+=`    Peso triáng: ${ml.peso_triangulo}g | Recupero: ${ml.pct_recupero}% | T°cámara final: ${ml.t_camara_final}°C\n`;t+=`    Sensorial: color=${ml.color_ok?"✓":"✗"} forma=${ml.forma_ok?"✓":"✗"} textura=${ml.textura_ok?"✓":"✗"}\n`;if(ml.sensorial_obs)t+=`    Obs sensorial: ${ml.sensorial_obs}\n`;}const n=notas[r.id];if(n)t+=`    Nota calidad: ${n}\n`;}}
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
function Num({label,value,onChange,al,spec}:{label:string;value:string;onChange:(v:string)=>void;al?:boolean;spec?:string}){return<div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">{label}</label>{spec&&<span className="text-[10px] text-gray-400">{spec}</span>}<input type="number" inputMode="decimal" value={value} onChange={e=>onChange(e.target.value)} className={cn("h-10 rounded-lg border px-3 text-sm font-mono",al?"border-red-400 bg-red-50 text-red-700":"border-gray-200 bg-white")}/>{al&&<span className="text-[10px] text-red-500 font-medium">⚠ Fuera de rango</span>}</div>;}
function Txt({label,value,onChange,ph}:{label:string;value:string;onChange:(v:string)=>void;ph?:string}){return<div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">{label}</label><input type="text" value={value} onChange={e=>onChange(e.target.value)} placeholder={ph} className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm"/></div>;}
function Sel({label,value,onChange,opts,al}:{label:string;value:string;onChange:(v:string)=>void;opts:{v:string;l:string}[];al?:boolean}){return<div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">{label}</label><select value={value} onChange={e=>onChange(e.target.value)} className={cn("h-10 rounded-lg border px-3 text-sm bg-white",al?"border-red-400 bg-red-50":"border-gray-200")}><option value="">Seleccionar…</option>{opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select>{al&&<span className="text-[10px] text-red-500 font-medium">⚠ Requiere acción</span>}</div>;}
function Chk({label,value,onChange}:{label:string;value:boolean;onChange:(v:boolean)=>void}){return<button onClick={()=>onChange(!value)} className={cn("flex items-center gap-2 p-2.5 rounded-lg border text-sm text-left",value?"border-green-400 bg-green-50 text-green-800":"border-gray-200 bg-white text-gray-700")}><span className={cn("w-5 h-5 rounded flex items-center justify-center flex-shrink-0 text-xs border",value?"bg-green-500 border-green-500 text-white":"border-gray-300")}>{value?"✓":""}</span>{label}</button>;}
function TA({label,value,onChange,ph}:{label:string;value:string;onChange:(v:string)=>void;ph?:string}){return<div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">{label}</label><textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={ph} rows={3} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm resize-none"/></div>;}
function Fotos({fotos,onAdd,onRemove}:{fotos:FotoMeta[];onAdd:(m:FotoMeta)=>void;onRemove:(id:string)=>void}){
  const ref=useRef<HTMLInputElement>(null);const[cg,setCg]=useState(false);
  async function h(e:React.ChangeEvent<HTMLInputElement>){const f=e.target.files?.[0];if(!f)return;setCg(true);try{const{dataUrl,w,h}=await compFoto(f);const id=gid("foto");saveFoto(id,dataUrl);onAdd({id,nombre:f.name,sector:"CV",timestamp:new Date().toISOString(),w,h});}finally{setCg(false);if(ref.current)ref.current.value="";}}
  return<div className="flex flex-col gap-2"><label className="text-xs text-gray-500">Fotos de evidencia</label><div className="flex flex-wrap gap-2">{fotos.map(f=>{const u=loadFoto(f.id);return<div key={f.id} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200">{u?<img src={u} alt={f.nombre} className="w-full h-full object-cover"/>:<div className="w-full h-full bg-gray-100 flex items-center justify-center text-[10px] text-gray-400 text-center px-1">Solo este disp.</div>}<button onClick={()=>onRemove(f.id)} className="absolute top-0 right-0 bg-red-500 text-white w-4 h-4 rounded-bl text-[9px] flex items-center justify-center">✕</button></div>;})}  <button onClick={()=>ref.current?.click()} className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400">{cg?<Spin/>:<><span className="text-xl">📷</span><span className="text-[10px]">Foto</span></>}</button></div><input ref={ref} type="file" accept="image/*" capture="environment" className="hidden" onChange={h}/></div>;
}
function FW({titulo,sub,onCancel,onSave,g,ch}:{titulo:string;sub:string;onCancel:()=>void;onSave:()=>void;g:boolean;ch:React.ReactNode}){return<div className="flex flex-col h-full"><div className="flex items-center gap-3 p-4 border-b border-gray-100 bg-white sticky top-0 z-10"><button onClick={onCancel} className="text-gray-400 p-1 text-lg">←</button><div className="flex-1"><div className="font-semibold text-gray-800 text-sm">{titulo}</div><div className="text-xs text-gray-400">{sub}</div></div></div><div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 pb-28">{ch}</div><div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 flex gap-3 max-w-lg mx-auto"><button onClick={onCancel} className="flex-1 h-11 rounded-xl border border-gray-200 text-sm text-gray-600 font-medium">Cancelar</button><button onClick={onSave} disabled={g} className="flex-[2] h-11 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2">{g?<Spin/>:"Guardar ✓"}</button></div></div>;}

// ── FORMULARIOS ───────────────────────────────────────────────
function FTemp({u,onSave,onCancel}:{u:Usuario;onSave:(r:Reg)=>void;onCancel:()=>void}){
  const[d,sD]=useState({sector:"",t_camara_mp:"",t_camara_pt:"",t_coccion:"",t_recalentamiento:"",t_transporte:"",equipo_num:"",observaciones:"",fotos:[] as FotoMeta[]});const[g,sG]=useState(false);
  const am=d.t_camara_mp!==""&&parseFloat(d.t_camara_mp)>4,ap=d.t_camara_pt!==""&&parseFloat(d.t_camara_pt)>4,ac=d.t_coccion!==""&&parseFloat(d.t_coccion)<75,ar=d.t_recalentamiento!==""&&parseFloat(d.t_recalentamiento)<65;
  async function sv(){sG(true);onSave({id:gid("tmp"),tipo:"temperaturas",turno:u.turno,responsable:u.nombre,fecha:hoy(),hora:ahora(),timestamp:new Date().toISOString(),alertas:{t_camara_mp:am,t_camara_pt:ap,t_coccion:ac,t_recalentamiento:ar},...d} as RTemp);sG(false);}
  return<FW titulo="🌡️ Temperaturas" sub="HACCP PCC" onCancel={onCancel} onSave={sv} g={g} ch={<><Txt label="Sector" value={d.sector} onChange={v=>sD(p=>({...p,sector:v}))} ph="ej: Cámara 1"/><div className="text-xs font-semibold text-red-600 uppercase tracking-wide">PCC — Puntos Críticos</div><Num label="T° cámara MP (°C)" spec="Límite: ≤ 4°C" value={d.t_camara_mp} onChange={v=>sD(p=>({...p,t_camara_mp:v}))} al={am}/><Num label="T° cámara PT (°C)" spec="≤ 4°C frío / ≤ -18°C congelado" value={d.t_camara_pt} onChange={v=>sD(p=>({...p,t_camara_pt:v}))} al={ap}/><Num label="T° cocción (°C)" spec="Mínimo ≥ 75°C" value={d.t_coccion} onChange={v=>sD(p=>({...p,t_coccion:v}))} al={ac}/><Num label="T° recalentamiento (°C)" spec="Mínimo ≥ 65°C" value={d.t_recalentamiento} onChange={v=>sD(p=>({...p,t_recalentamiento:v}))} al={ar}/><div className="text-xs font-semibold text-amber-600 uppercase tracking-wide">PC — Puntos de Control</div><Num label="T° transporte (°C)" value={d.t_transporte} onChange={v=>sD(p=>({...p,t_transporte:v}))}/><Txt label="N° termómetro" value={d.equipo_num} onChange={v=>sD(p=>({...p,equipo_num:v}))}/><Fotos fotos={d.fotos} onAdd={f=>sD(p=>({...p,fotos:[...p.fotos,f]}))} onRemove={id=>sD(p=>({...p,fotos:p.fotos.filter(f=>f.id!==id)}))}/><TA label="Observaciones / acción correctiva" value={d.observaciones} onChange={v=>sD(p=>({...p,observaciones:v}))}/></>}/>;
}
function FPesos({u,onSave,onCancel}:{u:Usuario;onSave:(r:Reg)=>void;onCancel:()=>void}){
  const[d,sD]=useState({producto:"",lote:"",peso_declarado:"",peso_1:"",peso_2:"",peso_3:"",ajustado:"",observaciones:"",fotos:[] as FotoMeta[]});const[g,sG]=useState(false);
  const vs=[d.peso_1,d.peso_2,d.peso_3].map(v=>parseFloat(v)).filter(v=>!isNaN(v));const pr=vs.length?vs.reduce((a,b)=>a+b,0)/vs.length:0;const dl=parseFloat(d.peso_declarado);const dv=dl>0&&pr>0?Math.abs((pr-dl)/dl*100):0;const aP=dv>5;
  async function sv(){sG(true);onSave({id:gid("pso"),tipo:"pesos",turno:u.turno,responsable:u.nombre,fecha:hoy(),hora:ahora(),timestamp:new Date().toISOString(),promedio:Math.round(pr*10)/10,desvio_pct:Math.round(dv*10)/10,alertas:{desvio:aP},...d} as RPesos);sG(false);}
  return<FW titulo="⚖️ Pesos" sub="ISO 9001 PC" onCancel={onCancel} onSave={sv} g={g} ch={<><Txt label="Producto" value={d.producto} onChange={v=>sD(p=>({...p,producto:v}))}/><Txt label="Lote" value={d.lote} onChange={v=>sD(p=>({...p,lote:v}))}/><Num label="Peso declarado (g)" value={d.peso_declarado} onChange={v=>sD(p=>({...p,peso_declarado:v}))}/><div className="text-xs font-semibold text-blue-600 uppercase tracking-wide">3 muestras</div><div className="grid grid-cols-3 gap-2">{(["peso_1","peso_2","peso_3"] as const).map((k,i)=><Num key={k} label={`M${i+1} (g)`} value={d[k]} onChange={v=>sD(p=>({...p,[k]:v}))}/>)}</div>{pr>0&&<div className={cn("rounded-xl p-3 text-sm flex items-center justify-between",aP?"bg-red-50 border border-red-300":"bg-green-50 border border-green-300")}><div><div className="font-semibold">{aP?"⚠ Desvío":"✓ En rango"}</div><div className="text-xs text-gray-500">Prom: {pr.toFixed(1)}g</div></div><div className={cn("text-xl font-bold",aP?"text-red-600":"text-green-600")}>{dv.toFixed(1)}%</div></div>}<Sel label="¿Ajustado?" value={d.ajustado} onChange={v=>sD(p=>({...p,ajustado:v}))} al={aP&&!d.ajustado} opts={[{v:"si",l:"✓ Sí"},{v:"no",l:"No"},{v:"retirado",l:"Retirado"}]}/><Fotos fotos={d.fotos} onAdd={f=>sD(p=>({...p,fotos:[...p.fotos,f]}))} onRemove={id=>sD(p=>({...p,fotos:p.fotos.filter(f=>f.id!==id)}))}/><TA label="Observaciones" value={d.observaciones} onChange={v=>sD(p=>({...p,observaciones:v}))}/></>}/>;
}
function FBPM({u,onSave,onCancel}:{u:Usuario;onSave:(r:Reg)=>void;onCancel:()=>void}){
  const[d,sD]=useState({sector:"",personal_auditado:"",lavado_manos:false,uniforme_completo:false,sin_joyas:false,sin_celular:false,sin_alimentos:false,estado_salud:"apto",personal_lesiones:"",observaciones:"",fotos:[] as FotoMeta[]});const[g,sG]=useState(false);
  const pc=[d.lavado_manos,d.uniforme_completo,d.sin_joyas,d.sin_celular,d.sin_alimentos].filter(Boolean).length*20;
  async function sv(){sG(true);onSave({id:gid("bpm"),tipo:"bpm",turno:u.turno,responsable:u.nombre,fecha:hoy(),hora:ahora(),timestamp:new Date().toISOString(),alertas:{no_apto:d.estado_salud==="no_apto",bpm_inc:!d.lavado_manos||!d.uniforme_completo},...d} as RBPM);sG(false);}
  return<FW titulo="👤 BPM Personal" sub="BPM/POES" onCancel={onCancel} onSave={sv} g={g} ch={<><Txt label="Sector" value={d.sector} onChange={v=>sD(p=>({...p,sector:v}))} ph="ej: Producción"/><Txt label="Personal auditado" value={d.personal_auditado} onChange={v=>sD(p=>({...p,personal_auditado:v}))}/><div className="flex items-center justify-between"><div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Checklist BPM</div><div className={cn("text-sm font-bold",pc===100?"text-green-600":pc>=60?"text-amber-600":"text-red-600")}>{pc}%</div></div><div className="flex flex-col gap-1.5"><Chk label="Lavado de manos" value={d.lavado_manos} onChange={v=>sD(p=>({...p,lavado_manos:v}))}/><Chk label="Uniforme completo (cofia, delantal, guantes)" value={d.uniforme_completo} onChange={v=>sD(p=>({...p,uniforme_completo:v}))}/><Chk label="Sin joyas ni maquillaje" value={d.sin_joyas} onChange={v=>sD(p=>({...p,sin_joyas:v}))}/><Chk label="Sin celular en zona de trabajo" value={d.sin_celular} onChange={v=>sD(p=>({...p,sin_celular:v}))}/><Chk label="Sin alimentos fuera del área" value={d.sin_alimentos} onChange={v=>sD(p=>({...p,sin_alimentos:v}))}/></div><Sel label="Estado de salud" value={d.estado_salud} onChange={v=>sD(p=>({...p,estado_salud:v}))} al={d.estado_salud!=="apto"} opts={[{v:"apto",l:"✓ Apto"},{v:"con_lesion",l:"⚠ Con lesión"},{v:"no_apto",l:"✕ No apto"}]}/>{d.estado_salud!=="apto"&&<Txt label="Descripción" value={d.personal_lesiones} onChange={v=>sD(p=>({...p,personal_lesiones:v}))} ph="Nombre y situación"/>}<Fotos fotos={d.fotos} onAdd={f=>sD(p=>({...p,fotos:[...p.fotos,f]}))} onRemove={id=>sD(p=>({...p,fotos:p.fotos.filter(f=>f.id!==id)}))}/><TA label="Observaciones" value={d.observaciones} onChange={v=>sD(p=>({...p,observaciones:v}))}/></>}/>;
}
function FRecep({u,onSave,onCancel}:{u:Usuario;onSave:(r:Reg)=>void;onCancel:()=>void}){
  const[d,sD]=useState({proveedor:"",producto:"",remito_lote:"",t_ingreso:"",estado_envase:"",rotulado_ok:false,fifo_ok:false,resultado:"",observaciones:"",fotos:[] as FotoMeta[]});const[g,sG]=useState(false);
  const at=d.t_ingreso!==""&&parseFloat(d.t_ingreso)>7;
  async function sv(){sG(true);onSave({id:gid("rec"),tipo:"recepcion",turno:u.turno,responsable:u.nombre,fecha:hoy(),hora:ahora(),timestamp:new Date().toISOString(),alertas:{t_ingreso:at,rechazado:d.estado_envase==="rechazado"||d.resultado==="rechazado"},...d} as RRecep);sG(false);}
  return<FW titulo="🚚 Recepción MP" sub="HACCP PCC" onCancel={onCancel} onSave={sv} g={g} ch={<><Txt label="Proveedor" value={d.proveedor} onChange={v=>sD(p=>({...p,proveedor:v}))}/><Txt label="Producto" value={d.producto} onChange={v=>sD(p=>({...p,producto:v}))}/><Txt label="N° remito / lote" value={d.remito_lote} onChange={v=>sD(p=>({...p,remito_lote:v}))} ph="Trazabilidad"/><Num label="T° ingreso (°C)" spec="PCC — ≤ 7°C refrigerado / ≤ -18°C congelado" value={d.t_ingreso} onChange={v=>sD(p=>({...p,t_ingreso:v}))} al={at}/><Sel label="Estado envase" value={d.estado_envase} onChange={v=>sD(p=>({...p,estado_envase:v}))} al={d.estado_envase==="rechazado"} opts={[{v:"integro",l:"✓ Íntegro"},{v:"danado",l:"⚠ Dañado"},{v:"rechazado",l:"✕ Rechazado"}]}/><Chk label="Rotulado correcto (fecha, lote, denominación)" value={d.rotulado_ok} onChange={v=>sD(p=>({...p,rotulado_ok:v}))}/><Chk label="FIFO/FEFO aplicado" value={d.fifo_ok} onChange={v=>sD(p=>({...p,fifo_ok:v}))}/><Sel label="Resultado" value={d.resultado} onChange={v=>sD(p=>({...p,resultado:v}))} al={d.resultado==="rechazado"} opts={[{v:"aprobado",l:"✓ Aprobado"},{v:"observado",l:"⚠ Con observación"},{v:"rechazado",l:"✕ Rechazado"}]}/><Fotos fotos={d.fotos} onAdd={f=>sD(p=>({...p,fotos:[...p.fotos,f]}))} onRemove={id=>sD(p=>({...p,fotos:p.fotos.filter(f=>f.id!==id)}))}/><TA label="Observaciones" value={d.observaciones} onChange={v=>sD(p=>({...p,observaciones:v}))}/></>}/>;
}
function FDesp({u,onSave,onCancel}:{u:Usuario;onSave:(r:Reg)=>void;onCancel:()=>void}){
  const[d,sD]=useState({local_destino:"",producto:"",lote:"",cantidad:"",t_despacho:"",t_transporte:"",etiquetado_ok:false,estado_embalaje:"",observaciones:"",fotos:[] as FotoMeta[]});const[g,sG]=useState(false);
  const atd=d.t_despacho!==""&&parseFloat(d.t_despacho)>4,att=d.t_transporte!==""&&parseFloat(d.t_transporte)>7;
  async function sv(){sG(true);onSave({id:gid("dsp"),tipo:"despacho",turno:u.turno,responsable:u.nombre,fecha:hoy(),hora:ahora(),timestamp:new Date().toISOString(),alertas:{t_despacho:atd,t_transporte:att,sin_etiqueta:!d.etiquetado_ok},...d} as RDesp);sG(false);}
  return<FW titulo="📦 Despacho" sub="PCC" onCancel={onCancel} onSave={sv} g={g} ch={<><Txt label="Local destino" value={d.local_destino} onChange={v=>sD(p=>({...p,local_destino:v}))}/><Txt label="Producto" value={d.producto} onChange={v=>sD(p=>({...p,producto:v}))}/><Txt label="Lote" value={d.lote} onChange={v=>sD(p=>({...p,lote:v}))}/><Num label="Cantidad / unidades" value={d.cantidad} onChange={v=>sD(p=>({...p,cantidad:v}))}/><Num label="T° despacho (°C)" spec="PCC — ≤ 4°C frío" value={d.t_despacho} onChange={v=>sD(p=>({...p,t_despacho:v}))} al={atd}/><Num label="T° transporte (°C)" spec="PCC — ≤ 7°C" value={d.t_transporte} onChange={v=>sD(p=>({...p,t_transporte:v}))} al={att}/><Chk label="Etiquetado correcto (fecha, vencimiento, lote)" value={d.etiquetado_ok} onChange={v=>sD(p=>({...p,etiquetado_ok:v}))}/><Sel label="Estado embalaje" value={d.estado_embalaje} onChange={v=>sD(p=>({...p,estado_embalaje:v}))} opts={[{v:"integro",l:"✓ Íntegro"},{v:"con_dano",l:"⚠ Con daño"}]}/><Fotos fotos={d.fotos} onAdd={f=>sD(p=>({...p,fotos:[...p.fotos,f]}))} onRemove={id=>sD(p=>({...p,fotos:p.fotos.filter(f=>f.id!==id)}))}/><TA label="Observaciones" value={d.observaciones} onChange={v=>sD(p=>({...p,observaciones:v}))}/></>}/>;
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
  return<FW titulo="🧹 Limpieza POES" sub="POES/BPM" onCancel={onCancel} onSave={sv} g={g} ch={<><Sel label="Sector" value={d.sector} onChange={v=>sD(p=>({...p,sector:v}))} opts={[{v:"cocina_caliente",l:"Cocina caliente"},{v:"cocina_fria",l:"Cocina fría"},{v:"camara",l:"Cámara"},{v:"despacho",l:"Despacho"},{v:"sanitarios",l:"Sanitarios"},{v:"almacen",l:"Almacén"}]}/><div className="flex items-center justify-between"><div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Verificación</div><div className={cn("text-sm font-bold",pc===100?"text-green-600":"text-amber-600")}>{pc}%</div></div><div className="flex flex-col gap-1.5"><Chk label="Superficies contacto con alimentos (PCC)" value={d.superficies_contacto} onChange={v=>sD(p=>({...p,superficies_contacto:v}))}/><Chk label="Pisos y desagües" value={d.pisos_desagues} onChange={v=>sD(p=>({...p,pisos_desagues:v}))}/><Chk label="Equipos (hornos, freidoras)" value={d.equipos} onChange={v=>sD(p=>({...p,equipos:v}))}/><Chk label="Cámaras frigoríficas" value={d.camaras} onChange={v=>sD(p=>({...p,camaras:v}))}/></div><Txt label="Sanitizante" value={d.sanitizante} onChange={v=>sD(p=>({...p,sanitizante:v}))}/><Txt label="Concentración" value={d.concentracion} onChange={v=>sD(p=>({...p,concentracion:v}))} ph="ej: 200 ppm cloro"/><Num label="Nivel ATP (si aplica)" value={d.atp_nivel} onChange={v=>sD(p=>({...p,atp_nivel:v}))}/><Txt label="Responsable limpieza" value={d.responsable_limpieza} onChange={v=>sD(p=>({...p,responsable_limpieza:v}))}/><Fotos fotos={d.fotos} onAdd={f=>sD(p=>({...p,fotos:[...p.fotos,f]}))} onRemove={id=>sD(p=>({...p,fotos:p.fotos.filter(f=>f.id!==id)}))}/><TA label="Observaciones" value={d.observaciones} onChange={v=>sD(p=>({...p,observaciones:v}))}/></>}/>;
}

function FMedialunas({u,onSave,onCancel}:{u:Usuario;onSave:(r:Reg)=>void;onCancel:()=>void}){
  const[d,sD]=useState({variedad:"" as "manteca"|"grasa"|"",lote_harina:"",
    t_masa:"",t_agua:"",tiempo_amasado:"",peso_baston:"",
    t_fermentador:"",humedad_fermentador:"",tiempo_fermentado:"",
    t_abatido:"",t_salida_abatidor:"",tiempo_abatido:"",
    calibre_masa:"",peso_triangulo:"",unidades_bandeja:"",
    t_camara_final:"",
    color_ok:false,forma_ok:false,textura_ok:false,sensorial_obs:"",
    pct_recupero:"",observaciones:"",fotos:[] as FotoMeta[]});
  const[g,sG]=useState(false);

  const isMant=d.variedad==="manteca";
  const isGrasa=d.variedad==="grasa";
  const tMasaV=d.t_masa!==""&&(parseFloat(d.t_masa)<18||parseFloat(d.t_masa)>22);
  // Fermentador: 33°C ±2, 90% hum
  const tFermV=d.t_fermentador!==""&&(parseFloat(d.t_fermentador)<31||parseFloat(d.t_fermentador)>35);
  const humFermV=d.humedad_fermentador!==""&&(parseFloat(d.humedad_fermentador)<85||parseFloat(d.humedad_fermentador)>95);
  // Abatidor manteca: -24±2; grasa: -16 a -20
  const tAbatV=d.t_abatido!==""&&(isMant?(parseFloat(d.t_abatido)>-22||parseFloat(d.t_abatido)<-26):(isGrasa?(parseFloat(d.t_abatido)>-16||parseFloat(d.t_abatido)<-20):false));
  // Salida abatidor manteca: ≤ -12°C
  const tSalidaV=isMant&&d.t_salida_abatidor!==""&&parseFloat(d.t_salida_abatidor)>-12;
  // Cámara final: ≤ -17°C
  const tCamaraV=d.t_camara_final!==""&&parseFloat(d.t_camara_final)>-17;
  // Peso triángulo: 60g manteca / 50±2 grasa
  const pesoObjMin=isMant?58:48;const pesoObjMax=isMant?62:52;
  const pesoTriV=d.peso_triangulo!==""&&(parseFloat(d.peso_triangulo)<pesoObjMin||parseFloat(d.peso_triangulo)>pesoObjMax);
  // Recupero: ≤ 10%
  const recuperoV=d.pct_recupero!==""&&parseFloat(d.pct_recupero)>10;

  async function sv(){sG(true);onSave({id:gid("ml"),tipo:"medialunas",turno:u.turno,responsable:u.nombre,fecha:hoy(),hora:ahora(),timestamp:new Date().toISOString(),
    alertas:{t_masa_alta:tMasaV,t_fermentador_nc:tFermV||humFermV,t_abatidor_nc:tAbatV,t_salida_nc:tSalidaV,t_camara_nc:tCamaraV,peso_triangulo_nc:pesoTriV,recupero_exc:recuperoV},...d} as RMedialunas);sG(false);}

  return<FW titulo="🥐 Medialunas" sub="P276 Grasa / P280 Manteca" onCancel={onCancel} onSave={sv} g={g} ch={<>
    {/* Variedad */}
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">Seleccioná la variedad para ver los parámetros correctos según procedimiento.</div>
    <div className="flex flex-col gap-0.5"><label className="text-xs text-gray-500">Variedad</label>
      <div className="flex gap-2">
        {([{v:"manteca",l:"🥐 Manteca (P280)"},{v:"grasa",l:"🥐 Grasa (P276)"}] as {v:"manteca"|"grasa";l:string}[]).map(x=>(
          <button key={x.v} onClick={()=>sD(p=>({...p,variedad:x.v}))} className={cn("flex-1 py-2 rounded-lg text-xs font-medium border",d.variedad===x.v?"bg-amber-500 text-white border-amber-500":"bg-white text-gray-600 border-gray-200")}>{x.l}</button>
        ))}
      </div>
    </div>
    <Txt label="Lote / N° amasijo" value={d.lote_harina} onChange={v=>sD(p=>({...p,lote_harina:v}))} ph="Trazabilidad"/>

    {/* MASA */}
    <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide border-b border-blue-100 pb-1">🫱 Elaboración de Masa</div>
    <Num label="T° agua chiller (°C)" spec="Parámetro: 5°C a 13°C" value={d.t_agua} onChange={v=>sD(p=>({...p,t_agua:v}))} al={d.t_agua!==""&&(parseFloat(d.t_agua)<5||parseFloat(d.t_agua)>13)}/>
    <Num label="Tiempo total amasado (min)" spec="Objetivo: 25 min" value={d.tiempo_amasado} onChange={v=>sD(p=>({...p,tiempo_amasado:v}))}/>
    <Num label="T° de masa al salir (°C)" spec="Límite: 20°C ±2°C" value={d.t_masa} onChange={v=>sD(p=>({...p,t_masa:v}))} al={tMasaV}/>
    {tMasaV&&<div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">⚠ T° fuera de rango. Retirar masa, fraccionar y dejar descansar en cámara con seguimiento.</div>}
    <Num label="Peso bastones (kg)" spec="Objetivo: 8 kg c/u" value={d.peso_baston} onChange={v=>sD(p=>({...p,peso_baston:v}))} al={d.peso_baston!==""&&(parseFloat(d.peso_baston)<7.5||parseFloat(d.peso_baston)>8.5)}/>

    {/* FERMENTADOR */}
    <div className="text-xs font-semibold text-green-700 uppercase tracking-wide border-b border-green-100 pb-1">🌡️ Fermentador</div>
    <Num label="T° fermentador (°C)" spec="Seteo: 33°C" value={d.t_fermentador} onChange={v=>sD(p=>({...p,t_fermentador:v}))} al={tFermV}/>
    <Num label="Humedad fermentador (%)" spec="Seteo: 90%" value={d.humedad_fermentador} onChange={v=>sD(p=>({...p,humedad_fermentador:v}))} al={humFermV}/>
    <Num label="Tiempo fermentado (min)" spec="Objetivo: 60 min" value={d.tiempo_fermentado} onChange={v=>sD(p=>({...p,tiempo_fermentado:v}))} al={d.tiempo_fermentado!==""&&(parseFloat(d.tiempo_fermentado)<55||parseFloat(d.tiempo_fermentado)>70)}/>

    {/* ABATIDOR */}
    <div className="text-xs font-semibold text-indigo-700 uppercase tracking-wide border-b border-indigo-100 pb-1">❄️ Abatidor</div>
    {isMant&&<div className="text-[10px] text-indigo-500 -mt-2">Manteca: -24°C ±2°C · aprox 1 hora · salida ≤ -12°C</div>}
    {isGrasa&&<div className="text-[10px] text-indigo-500 -mt-2">Grasa: -16°C a -20°C · aprox 1 hora</div>}
    <Num label="T° seteo abatidor (°C)" spec={isMant?"-24°C ±2°C":isGrasa?"-16°C a -20°C":"Según variedad"} value={d.t_abatido} onChange={v=>sD(p=>({...p,t_abatido:v}))} al={tAbatV}/>
    <Num label="Tiempo abatido (min)" spec="Aprox 60 min" value={d.tiempo_abatido} onChange={v=>sD(p=>({...p,tiempo_abatido:v}))}/>
    {isMant&&<Num label="T° salida abatidor (°C)" spec="PCC — debe ser ≤ -12°C" value={d.t_salida_abatidor} onChange={v=>sD(p=>({...p,t_salida_abatidor:v}))} al={tSalidaV}/>}
    {tSalidaV&&<div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">⚠ Medialuna no lista para envasado. Continuar abatido.</div>}

    {/* MEDIALUNERA */}
    <div className="text-xs font-semibold text-orange-700 uppercase tracking-wide border-b border-orange-100 pb-1">⚙️ Medialunera</div>
    {isMant&&<div className="text-[10px] text-orange-500 -mt-2">Manteca: calibre 60 (ML12) o 15/20 (ML 1-3) · 42 und/bandeja (7×6)</div>}
    {isGrasa&&<div className="text-[10px] text-orange-500 -mt-2">Grasa: calibre 15/20 · 36 und/bandeja (6×6)</div>}
    <Num label="Calibre espesor masa" spec={isMant?"60 (ML12) ó 15/20 (ML 1-3)":isGrasa?"15 a 20":""} value={d.calibre_masa} onChange={v=>sD(p=>({...p,calibre_masa:v}))}/>
    <Num label="Peso triángulo (g)" spec={isMant?"Objetivo: 60g":isGrasa?"Objetivo: 50g ±2":""} value={d.peso_triangulo} onChange={v=>sD(p=>({...p,peso_triangulo:v}))} al={pesoTriV}/>
    {pesoTriV&&<div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">⚠ Peso fuera de rango — corregir calibre de la medialunera.</div>}
    <Num label="Unidades por bandeja" spec={isMant?"42 (7×6)":isGrasa?"36 (6×6)":""} value={d.unidades_bandeja} onChange={v=>sD(p=>({...p,unidades_bandeja:v}))} al={d.unidades_bandeja!==""&&(isMant?parseInt(d.unidades_bandeja)!==42:isGrasa?parseInt(d.unidades_bandeja)!==36:false)}/>

    {/* RECUPERO */}
    <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide border-b border-gray-100 pb-1">♻️ Recupero</div>
    <Num label="% recupero s/ harina utilizada" spec="Límite: ≤ 10% de harina del amasijo" value={d.pct_recupero} onChange={v=>sD(p=>({...p,pct_recupero:v}))} al={recuperoV}/>
    {recuperoV&&<div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-700">⚠ Recupero excedido. Revisar proceso de recorte y amasijo.</div>}

    {/* CÁMARA FINAL */}
    <div className="text-xs font-semibold text-blue-800 uppercase tracking-wide border-b border-blue-100 pb-1">🏭 Cámara Final</div>
    <Num label="T° cámara final (°C)" spec="PCC — debe ser ≤ -17°C" value={d.t_camara_final} onChange={v=>sD(p=>({...p,t_camara_final:v}))} al={tCamaraV}/>

    {/* SENSORIAL */}
    <div className="text-xs font-semibold text-purple-700 uppercase tracking-wide border-b border-purple-100 pb-1">👅 Evaluación Sensorial</div>
    <div className="flex flex-col gap-1.5">
      <Chk label="Color adecuado (dorado uniforme)" value={d.color_ok} onChange={v=>sD(p=>({...p,color_ok:v}))}/>
      <Chk label="Forma correcta (cierre punta hacia abajo)" value={d.forma_ok} onChange={v=>sD(p=>({...p,forma_ok:v}))}/>
      <Chk label="Textura / hojaldrado OK" value={d.textura_ok} onChange={v=>sD(p=>({...p,textura_ok:v}))}/>
    </div>
    <TA label="Observaciones sensoriales" value={d.sensorial_obs} onChange={v=>sD(p=>({...p,sensorial_obs:v}))} ph="Desvíos, apariencia, aroma…"/>

    <Fotos fotos={d.fotos} onAdd={f=>sD(p=>({...p,fotos:[...p.fotos,f]}))} onRemove={id=>sD(p=>({...p,fotos:p.fotos.filter(f=>f.id!==id)}))}/>
    <TA label="Observaciones generales" value={d.observaciones} onChange={v=>sD(p=>({...p,observaciones:v}))}/>
  </>}/>;
}


function RegCard({r,onDelete,isC,nota,onNota}:{r:Reg;onDelete?:()=>void;isC:boolean;nota:string;onNota:(v:string)=>void}){
  const[exp,sE]=useState(false);const[editNota,sEN]=useState(false);const al=cAl(r.alertas);const mod=MODS.find(m=>m.id===r.tipo);
  function det(){
    if(r.tipo==="temperaturas")return<div className="grid grid-cols-2 gap-1 text-xs mt-2">{r.t_camara_mp&&<span>Cámara MP:<b> {r.t_camara_mp}°C</b></span>}{r.t_camara_pt&&<span>Cámara PT:<b> {r.t_camara_pt}°C</b></span>}{r.t_coccion&&<span>Cocción:<b> {r.t_coccion}°C</b></span>}{r.t_recalentamiento&&<span>Recalent.:<b> {r.t_recalentamiento}°C</b></span>}{r.t_transporte&&<span>Transporte:<b> {r.t_transporte}°C</b></span>}{r.observaciones&&<span className="col-span-2 text-gray-500">{r.observaciones}</span>}</div>;
    if(r.tipo==="pesos")return<div className="text-xs mt-2"><p>{r.producto} · Lote: {r.lote}</p><p>Decl: {r.peso_declarado}g · Prom: <b>{r.promedio}g</b> · Desvío: <b className={r.desvio_pct>5?"text-red-600":"text-green-600"}>{r.desvio_pct}%</b></p></div>;
    if(r.tipo==="bpm")return<div className="text-xs mt-2"><p>{r.sector} — {r.personal_auditado}</p><span className={cn("font-medium",r.estado_salud==="apto"?"text-green-600":"text-red-600")}>{r.estado_salud==="apto"?"✓ Apto":"⚠ "+r.estado_salud}</span>{r.observaciones&&<p className="text-gray-500 mt-0.5">{r.observaciones}</p>}</div>;
    if(r.tipo==="recepcion")return<div className="text-xs mt-2"><p>{r.proveedor} — {r.producto}</p><p>T°: {r.t_ingreso}°C · <b>{r.resultado}</b></p>{r.observaciones&&<p className="text-gray-500">{r.observaciones}</p>}</div>;
    if(r.tipo==="despacho")return<div className="text-xs mt-2"><p>Local {r.local_destino} — {r.producto}</p><p>T° desp: {r.t_despacho}°C · Trans: {r.t_transporte}°C</p></div>;
    if(r.tipo==="nc")return<div className="text-xs mt-2"><p className="font-medium text-amber-700">{r.tipo_nc?.toUpperCase()}</p><p>{r.descripcion}</p>{r.accion_inmediata&&<p className="text-green-700">Acción: {r.accion_inmediata}</p>}</div>;
    if(r.tipo==="decomiso")return<div className="text-xs mt-2"><p>{r.producto} · {r.lote}</p><p className="text-red-600 font-medium">{r.cantidad_kg}kg · {r.motivo} → {r.destino}</p></div>;
    if(r.tipo==="medialunas"){const ml=r as RMedialunas;const alertCount=cAl(ml.alertas);return<div className="text-xs mt-2">
      <div className="flex items-center gap-2 flex-wrap"><span className="font-semibold text-amber-700">{ml.variedad==="manteca"?"🥐 Manteca (P280)":ml.variedad==="grasa"?"🥐 Grasa (P276)":"🥐 —"}</span>{ml.lote_harina&&<span className="text-gray-400">#{ml.lote_harina}</span>}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1">{ml.t_masa&&<span>T° masa: <b className={(parseFloat(ml.t_masa)<18||parseFloat(ml.t_masa)>22)?"text-red-600":""}>{ml.t_masa}°C</b></span>}{ml.peso_triangulo&&<span>Triáng.: <b>{ml.peso_triangulo}g</b></span>}{ml.t_fermentador&&<span>Ferment.: <b>{ml.t_fermentador}°C</b></span>}{ml.t_camara_final&&<span>Cám. final: <b>{ml.t_camara_final}°C</b></span>}{ml.pct_recupero&&<span>Recupero: <b className={parseFloat(ml.pct_recupero)>10?"text-red-600":""}>{ml.pct_recupero}%</b></span>}<span>Sensorial: <b>{[ml.color_ok&&"Color",ml.forma_ok&&"Forma",ml.textura_ok&&"Textura"].filter(Boolean).join(", ")||"—"}</b></span></div>
      {alertCount>0&&<div className="text-red-600 font-medium mt-1">⚠ {alertCount} alerta{alertCount>1?"s":""} detectada{alertCount>1?"s":""}</div>}
      {ml.observaciones&&<p className="text-gray-500 mt-0.5">{ml.observaciones}</p>}
    </div>;}
    if(r.tipo==="limpieza")return<div className="text-xs mt-2"><p>Sector: {r.sector}</p><p>{r.sanitizante} {r.concentracion}</p></div>;
    return null;
  }
  return<div className={cn("rounded-xl border bg-white overflow-hidden",al>0?"border-red-300":"border-gray-200")}>
    <div className="flex items-center gap-2 p-3 cursor-pointer" onClick={()=>sE(!exp)}>
      <span className="text-xl">{mod?.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap"><span className="text-sm font-medium text-gray-800">{mod?.label}</span><ABadge n={al}/>{r.fotos.length>0&&<span className="text-xs text-gray-400">📷{r.fotos.length}</span>}</div>
        <div className="text-xs text-gray-400">{r.hora} · {r.responsable} · <span className={cn("font-medium",r.turno==="TM"?"text-amber-600":r.turno==="TT"?"text-blue-600":"text-indigo-600")}>{r.turno}</span></div>
      </div>
      <span className="text-gray-300 text-xs">{exp?"▲":"▼"}</span>
    </div>
    {exp&&<div className="px-3 pb-3 border-t border-gray-100">
      {det()}
      {nota&&<div className="mt-2 bg-yellow-50 border border-yellow-200 rounded-lg px-2 py-1 text-xs text-yellow-800">📝 {nota}</div>}
      {isC&&<div className="flex gap-3 mt-2">
        <button onClick={()=>sEN(!editNota)} className="text-xs text-blue-500 hover:text-blue-700">{editNota?"Cerrar nota":"+ Nota calidad"}</button>
        {onDelete&&<button onClick={onDelete} className="text-xs text-red-400 hover:text-red-600">Eliminar</button>}
      </div>}
      {isC&&editNota&&<div className="mt-2"><textarea value={nota} onChange={e=>onNota(e.target.value)} placeholder="Nota de calidad..." rows={2} className="w-full rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs resize-none"/></div>}
    </div>}
  </div>;
}

// ── RESUMEN PANEL ─────────────────────────────────────────────
function ResumenPanel({registros,titulo,isCalidad,notas,onNota,eliminados,onElim,onRestore}:{
  registros:Reg[];titulo:string;isCalidad:boolean;
  notas:Record<string,string>;onNota:(id:string,v:string)=>void;
  eliminados:Set<string>;onElim:(id:string)=>void;onRestore:(id:string)=>void;
}){
  const[tab,sTab]=useState<"alertas"|"obs"|"reincidencias"|"ranking">("alertas");
  const vis=registros.filter(r=>!eliminados.has(r.id));
  const als=extraerAlertas(vis);const obs=extraerObs(vis);const rein=calcReincidencias(vis);const k=kpis(vis);
  const ranking=MODS.map(m=>({label:m.label,icon:m.icon,count:vis.filter(r=>r.tipo===m.id).reduce((a,r)=>a+cAl(r.alertas),0)})).filter(x=>x.count>0).sort((a,b)=>b.count-a.count);
  const maxR=ranking[0]?.count||1;

  function exportar(){dlTxt(buildTxt(registros,titulo,notas,eliminados),`CV_${titulo.replace(/\s/g,"_")}.txt`);}

  return<div className="flex flex-col gap-3">
    {/* KPI strip */}
    <div className="grid grid-cols-3 gap-2">
      {[{l:"Registros",v:k.total,c:"text-blue-600"},{l:"Alertas",v:k.alertas,c:k.alertas>0?"text-red-600":"text-green-600"},{l:"NC",v:k.nc,c:k.nc>0?"text-amber-600":"text-green-600"}].map((x,i)=><div key={i} className="bg-white rounded-xl border border-gray-200 p-2 text-center"><div className="text-xs text-gray-400">{x.l}</div><div className={`text-xl font-bold ${x.c}`}>{x.v}</div></div>)}
    </div>
    <div className="grid grid-cols-3 gap-2">
      {[{l:"BPM",v:`${k.bpm}%`,c:k.bpm>=80?"text-green-600":"text-red-600"},{l:"Decomisos",v:k.decomisos,c:"text-gray-700"},{l:"Kg decomisados",v:k.kg,c:"text-gray-700"}].map((x,i)=><div key={i} className="bg-white rounded-xl border border-gray-200 p-2 text-center"><div className="text-xs text-gray-400">{x.l}</div><div className={`text-xl font-bold ${x.c}`}>{x.v}</div></div>)}
    </div>

    {/* Tabs */}
    <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
      {([{k:"alertas",l:`⚠ Alertas (${als.length})`},{k:"obs",l:`📝 Obs (${obs.length})`},{k:"reincidencias",l:`🔁 Reinc (${rein.length})`},{k:"ranking",l:"🏆 Ranking"}] as const).map(t=>(
        <button key={t.k} onClick={()=>sTab(t.k)} className={cn("flex-1 text-[10px] font-medium py-1.5 rounded-lg transition-colors",tab===t.k?"bg-white text-gray-800 shadow-sm":"text-gray-500")}>{t.l}</button>
      ))}
    </div>

    {/* Alertas */}
    {tab==="alertas"&&<div className="flex flex-col gap-2">
      {als.length===0?<div className="text-center py-6 text-gray-400 text-sm">✓ Sin alertas</div>
      :als.map((a,i)=><div key={i} className="bg-red-50 border border-red-200 rounded-xl p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-red-700">{a.tipo}</div>
            <div className="text-xs text-gray-600 mt-0.5">Valor: <b>{a.valor}</b> · Límite: {a.limite}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">{fd(a.registro.fecha)} {a.registro.hora} · {a.registro.responsable} · {a.registro.turno}</div>
          </div>
          {isCalidad&&<button onClick={()=>onElim(a.registro.id)} className="text-[10px] text-gray-400 hover:text-red-500 flex-shrink-0">Ocultar</button>}
        </div>
        {notas[a.registro.id]&&<div className="mt-1 text-xs text-yellow-700 bg-yellow-50 rounded px-2 py-0.5">📝 {notas[a.registro.id]}</div>}
      </div>)}
    </div>}

    {/* Observaciones */}
    {tab==="obs"&&<div className="flex flex-col gap-2">
      {obs.length===0?<div className="text-center py-6 text-gray-400 text-sm">Sin observaciones</div>
      :obs.map((o,i)=><div key={i} className="bg-white border border-gray-200 rounded-xl p-3">
        <div className="text-xs text-gray-700">{o.texto}</div>
        <div className="text-[10px] text-gray-400 mt-1">{fd(o.registro.fecha)} {o.registro.hora} · {o.registro.responsable} · {o.registro.turno}</div>
        {notas[o.registro.id]&&<div className="mt-1 text-xs text-yellow-700 bg-yellow-50 rounded px-2 py-0.5">📝 {notas[o.registro.id]}</div>}
        {isCalidad&&<button onClick={()=>onElim(o.registro.id)} className="text-[10px] text-gray-400 hover:text-red-500 mt-1">Ocultar</button>}
      </div>)}
    </div>}

    {/* Reincidencias */}
    {tab==="reincidencias"&&<div className="flex flex-col gap-2">
      {rein.length===0?<div className="text-center py-6 text-gray-400 text-sm">✓ Sin reincidencias</div>
      :rein.map((r,i)=><div key={i} className={cn("rounded-xl border p-3",r.critico?"border-red-300 bg-red-50":"border-amber-200 bg-amber-50")}>
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold">{r.critico?"🔴 CRÍTICO":"🟡"} {r.tipo}</div>
          <div className={cn("text-sm font-bold",r.critico?"text-red-700":"text-amber-700")}>{r.count}×</div>
        </div>
        <div className="text-[10px] text-gray-500 mt-0.5">{r.critico?"≥ 3 apariciones — requiere acción correctiva":"Apareció más de una vez"}</div>
      </div>)}
    </div>}

    {/* Ranking */}
    {tab==="ranking"&&<div className="flex flex-col gap-2">
      {ranking.length===0?<div className="text-center py-6 text-gray-400 text-sm">Sin alertas para rankear</div>
      :ranking.map((r,i)=><div key={i} className="bg-white border border-gray-200 rounded-xl p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm">{r.icon} {r.label}</span>
          <span className="text-sm font-bold text-red-600">{r.count}</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-red-400 rounded-full transition-all" style={{width:`${(r.count/maxR)*100}%`}}/>
        </div>
      </div>)}
    </div>}

    {/* Eliminados (solo calidad) */}
    {isCalidad&&eliminados.size>0&&<details className="bg-gray-50 border border-gray-200 rounded-xl">
      <summary className="p-3 text-xs font-medium text-gray-500 cursor-pointer">Ocultos ({eliminados.size}) — toca para ver</summary>
      <div className="px-3 pb-3 flex flex-col gap-1">
        {registros.filter(r=>eliminados.has(r.id)).map(r=>{const m=MODS.find(x=>x.id===r.tipo);return<div key={r.id} className="flex items-center justify-between text-xs py-1"><span>{m?.icon} {m?.label} · {r.hora}</span><button onClick={()=>onRestore(r.id)} className="text-blue-500 hover:text-blue-700">Restaurar</button></div>;})}
        <button onClick={()=>{registros.forEach(r=>{if(eliminados.has(r.id))onRestore(r.id);});}} className="text-xs text-blue-500 mt-1">Restaurar todos</button>
      </div>
    </details>}

    {/* Exportar */}
    {isCalidad&&<button onClick={exportar} className="h-10 rounded-xl border border-blue-300 text-blue-600 text-sm font-medium hover:bg-blue-50 transition-colors">📄 Exportar reporte .txt</button>}
  </div>;
}

// ── DASHBOARD ─────────────────────────────────────────────────
function Dash({registros,label}:{registros:Reg[];label:string}){
  const k=kpis(registros);
  const bd=MODS.map(m=>({name:m.label.split(" ")[0],cant:k.por_tipo[m.id]??0}));
  const td=TURNOS.map(t=>({turno:t.label,registros:registros.filter(r=>r.turno===t.id).length,alertas:registros.filter(r=>r.turno===t.id).reduce((a,r)=>a+cAl(r.alertas),0)}));
  return<div className="p-4 flex flex-col gap-4">
    <p className="text-xs text-gray-400 font-medium">{label}</p>
    <div className="grid grid-cols-2 gap-3">
      {[{l:"Registros",v:k.total,c:"text-blue-600"},{l:"Alertas PCC",v:k.alertas,c:k.alertas>0?"text-red-600":"text-green-600"},{l:"NC",v:k.nc,c:k.nc>0?"text-amber-600":"text-green-600"},{l:"Decomis. kg",v:k.kg,c:"text-gray-700"},{l:"BPM %",v:`${k.bpm}%`,c:k.bpm>=80?"text-green-600":"text-red-600"},{l:"🥐 Medialunas",v:k.medialunas,c:"text-amber-600"}].map((x,i)=><div key={i} className="bg-white rounded-xl border border-gray-200 p-3"><div className="text-xs text-gray-400">{x.l}</div><div className={`text-2xl font-bold mt-0.5 ${x.c}`}>{x.v}</div></div>)}
    </div>
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Registros por módulo</div>
      <ResponsiveContainer width="100%" height={140}><BarChart data={bd} margin={{top:0,right:0,left:-20,bottom:0}}><XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/><Tooltip/><Bar dataKey="cant" fill="#3b82f6" radius={[4,4,0,0]} name="Registros"/></BarChart></ResponsiveContainer>
    </div>
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Por turno</div>
      <ResponsiveContainer width="100%" height={120}><BarChart data={td} margin={{top:0,right:0,left:-20,bottom:0}}><XAxis dataKey="turno" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/><Tooltip/><Bar dataKey="registros" fill="#93c5fd" radius={[4,4,0,0]} name="Registros"/><Bar dataKey="alertas" fill="#f87171" radius={[4,4,0,0]} name="Alertas"/><Legend iconSize={8} wrapperStyle={{fontSize:11}}/></BarChart></ResponsiveContainer>
    </div>
  </div>;
}

// ── LOGIN ─────────────────────────────────────────────────────
function Login({onLogin}:{onLogin:(u:Usuario)=>void}){
  const[n,sN]=useState(""); const[t,sT]=useState<Turno>("TM"); const[r,sR]=useState<Rol>("control_volante"); const[p,sP]=useState(""); const[pe,sPE]=useState(false); const[rec,sRec]=useState<Usuario[]>([]);
  useEffect(()=>{try{const s=localStorage.getItem(UK);if(s)sRec(JSON.parse(s).slice(0,5));}catch{}},[]);
  function go(){if(!n.trim())return;if(r==="calidad"&&p!==PIN){sPE(true);return;}const u:Usuario={nombre:n.trim(),rol:r,turno:t};try{const prev=JSON.parse(localStorage.getItem(UK)||"[]");localStorage.setItem(UK,JSON.stringify([u,...prev.filter((x:Usuario)=>x.nombre!==u.nombre||x.rol!==u.rol)].slice(0,5)));}catch{}onLogin(u);}
  return<div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4"><div className="w-full max-w-sm">
    <div className="text-center mb-8"><div className="text-4xl mb-2">🍽️</div><h1 className="text-2xl font-bold text-gray-800">Sabores Express</h1><p className="text-sm text-gray-500 mt-1">Control de Calidad · Cocina Central</p></div>
    {rec.length>0&&<div className="mb-4"><p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">Acceso rápido</p>{rec.map((u,i)=><button key={i} onClick={()=>onLogin(u)} className="w-full flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-200 hover:border-blue-400 text-sm mb-1.5"><span>{u.rol==="calidad"?"🔑":"👷"}</span><span className="font-medium text-gray-800 flex-1 text-left">{u.nombre} <span className="text-gray-400 font-normal">· {TURNOS.find(x=>x.id===u.turno)?.label}</span></span><Badge t={u.rol==="calidad"?"Calidad":"CV"} c="blue"/></button>)}</div>}
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
  const[regs,sR]=useState<Reg[]>([]);const[cg,sCg]=useState(false);const[mod,sMod]=useState<Tipo|null>(null);const[filtro,sFiltro]=useState<Turno|"todos">("todos");const[vista,sV]=useState<"registros"|"resumen"|"dashboard">("registros");const[notas,sNotas]=useState<Record<string,string>>({});const[elim,sElim]=useState<Set<string>>(new Set());const[toast,sToast]=useState<{msg:string;tipo:"ok"|"err"}|null>(null);
  const showT=useCallback((msg:string,tipo:"ok"|"err"="ok")=>{sToast({msg,tipo});setTimeout(()=>sToast(null),3000);},[]);
  async function cargar(){sCg(true);try{const rs=await loadDia(mes.id,sem.semana,dia.fecha);sR(rs);}catch{showT("Error al cargar","err");}finally{sCg(false);}};
  useEffect(()=>{cargar();},[dia.fecha]);
  async function guardar(rec:Reg){try{await setDoc(doc(db,fsPath(mes.id,sem.semana,dia.fecha),rec.id),san(rec as unknown as Record<string,unknown>));sR(p=>[rec,...p.filter(r=>r.id!==rec.id)]);showT(`✓ Guardado${cAl(rec.alertas)>0?" — ⚠ con alertas":""}`);sMod(null);}catch{showT("Error al guardar","err");}}
  async function eliminar(id:string){if(!u||u.rol!=="calidad")return;try{await deleteDoc(doc(db,fsPath(mes.id,sem.semana,dia.fecha),id));sR(p=>p.filter(r=>r.id!==id));showT("Eliminado");}catch{showT("Error","err");}}
  const fp={u,onSave:guardar,onCancel:()=>sMod(null)};
  if(mod)return<div className="min-h-screen bg-gray-50 max-w-lg mx-auto">{mod==="temperaturas"&&<FTemp {...fp}/>}{mod==="pesos"&&<FPesos {...fp}/>}{mod==="bpm"&&<FBPM {...fp}/>}{mod==="recepcion"&&<FRecep {...fp}/>}{mod==="despacho"&&<FDesp {...fp}/>}{mod==="nc"&&<FNC {...fp}/>}{mod==="decomiso"&&<FDecom {...fp}/>}{mod==="limpieza"&&<FLimp {...fp}/>}{mod==="medialunas"&&<FMedialunas {...fp}/>}</div>;
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
      <div className="grid grid-cols-3 gap-2">{MODS.map(m=><button key={m.id} onClick={()=>sMod(m.id)} className={cn("bg-white rounded-xl border p-2.5 text-center active:scale-95 flex flex-col items-center gap-1",m.id==="medialunas"?"border-amber-300 hover:border-amber-400":"border-gray-200 hover:border-blue-400")}><span className="text-xl">{m.icon}</span><span className="text-[10px] font-medium text-gray-700 leading-tight">{m.label.split(" ")[0]}</span><Badge t={m.badge} c={m.badge==="PCC"?"red":m.badge==="PC"?"amber":m.badge==="BPM"?"green":m.badge==="POES"?"purple":m.badge==="HACCP"?"red":m.id==="medialunas"?"amber":"blue"}/></button>)}</div>
      <div className="flex gap-2 overflow-x-auto pb-1">{(["todos",...TURNOS.map(x=>x.id)] as (Turno|"todos")[]).map(t=><button key={t} onClick={()=>sFiltro(t)} className={cn("px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border",filtro===t?"bg-blue-500 text-white border-blue-500":"bg-white text-gray-600 border-gray-200")}>{t==="todos"?"Todos":t}</button>)}</div>
      {cg?<div className="flex justify-center p-8"><Spin/></div>:fR.length===0?<div className="text-center p-8 text-gray-400"><div className="text-3xl mb-2">📋</div><p className="text-sm">Sin registros</p></div>:<div className="flex flex-col gap-2">{fR.map(r=><RegCard key={r.id} r={r} isC={u.rol==="calidad"} nota={notas[r.id]||""} onNota={v=>sNotas(p=>({...p,[r.id]:v}))} onDelete={u.rol==="calidad"?()=>eliminar(r.id):undefined}/>)}</div>}
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
    {vista==="dias"&&<div className="p-4">
      <div className="grid grid-cols-7 gap-1 mb-2">{DN.map(d=><div key={d} className="text-center text-[10px] font-semibold text-gray-400 py-1">{d}</div>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {sem.dias.map((d,i)=>{if(d.dayOfMonth===-1)return<div key={i}/>;const eH=d.fecha===HOY;const eF=d.fecha>HOY;return<button key={i} onClick={()=>!eF&&sDia(d)} disabled={eF} className={cn("aspect-square rounded-xl flex flex-col items-center justify-center text-sm font-semibold border",eH?"bg-blue-500 text-white border-blue-500 shadow-sm":eF?"bg-gray-50 text-gray-300 border-gray-100 cursor-default":"bg-white text-gray-700 border-gray-200 hover:border-blue-400 active:scale-95")}>{d.dayOfMonth}{eH&&<span className="text-[8px] opacity-80">hoy</span>}</button>;})}
      </div>
      <p className="text-xs text-gray-400 text-center mt-4">Tocá un día para ver o cargar registros</p>
    </div>}
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
      <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
        <div className="grid grid-cols-7 gap-1 mb-2">{DN.map(d=><div key={d} className="text-center text-[10px] font-semibold text-gray-400">{d}</div>)}</div>
        {mes.semanas.map(s=><div key={s.semana} className="grid grid-cols-7 gap-1 mb-1">{s.dias.map((d,i)=>{if(d.dayOfMonth===-1)return<div key={i}/>;const eH=d.fecha===HOY;const eF=d.fecha>HOY;return<div key={i} onClick={()=>!eF&&sSem(s)} className={cn("aspect-square rounded-lg flex items-center justify-center text-xs cursor-pointer",eH?"bg-blue-500 text-white font-bold":eF?"text-gray-300":"text-gray-700 hover:bg-blue-50 font-medium")}>{d.dayOfMonth}</div>;})}</div>)}
      </div>
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
