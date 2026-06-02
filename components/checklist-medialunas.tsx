"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore, doc, setDoc, getDoc, onSnapshot, collection, getDocs, query, orderBy
} from "firebase/firestore";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer, Legend
} from "recharts";

// ─── FIREBASE CONFIG ──────────────────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
let db = null, firebaseOk = false;
try {
  const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
  db = getFirestore(app);
  firebaseOk = true;
} catch(e) { console.warn("Firebase no inicializado", e); }

// ─── ROLES ────────────────────────────────────────────────────────────────────
const ROLES = { CALIDAD:"calidad", OPERARIO:"operario" };
const PIN_CALIDAD = "1234";
const STORAGE_KEY = "sig_medialunas_usuario";

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const DIAS    = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
const TURNOS  = ["TM","TT","TN"];
const MESES   = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const YEARS   = [2026,2027];
const ALL_MONTHS = YEARS.flatMap(y=>MESES.map((m,i)=>({label:`${m} ${y}`,id:`${m.toLowerCase()}_${y}`,year:y,monthIdx:i})));

// ─── SECTORES ─────────────────────────────────────────────────────────────────
const SECTORES = [
  { id:"frac", label:"Fraccionado", fields:[
    { id:"f_ck", type:"ck", label:"Verificación de fraccionado (P280 p.2)", items:[
      "Ingredientes fraccionados según receta R120 vigente",
      "Cajón 1: azúcar y leche en polvo",
      "Cajón 2: secos, esencias y miel",
      "Fraccionados rotulados con fecha de elaboración",
      "Fraccionados colocados en cámara de masas"
    ]},
    { id:"f_tcam", type:"num", label:"T° cámara de masas", unit:"°C", ref:"PCC",
      al:{min:6,max:10,msg:"T° fuera del rango (6°C a 10°C)"} },
    { id:"f_ob", type:"ob", label:"Observaciones" }
  ]},
  { id:"amas", label:"Amasado", fields:[
    { id:"a_tagua",   type:"num", label:"T° agua del chiller",      unit:"°C",  ref:"PCC", al:{min:1,max:5,msg:"Agua fuera del rango (1°C a 5°C)"} },
    { id:"a_agua_kg", type:"num", label:"Cantidad de agua cargada",   unit:"kg",  ref:"PC" },
    { id:"a_hielo_kg",type:"num", label:"Cantidad de hielo cargado",  unit:"kg",  ref:"PC" },


    { id:"a_tamb",  type:"num", label:"T° ambiente",             unit:"°C",  ref:"PC" },
    { id:"a_tcam",  type:"num", label:"T° cámara de masas",      unit:"°C",  ref:"PCC",
      al:{min:6,max:10,msg:"T° fuera del rango (6°C a 10°C)"} },
    { id:"a_tmasa", type:"num", label:"T° masa final",           unit:"°C",  ref:"PCC",
      al:{min:18,max:22,msg:"Masa fuera de rango 20°C ±2°C — P280 p.3.5"} },
    { id:"a_tpo",   type:"num", label:"Tiempo total de amasado", unit:"min", ref:"PC",
      al:{min:23,max:27,msg:"Tiempo fuera del rango 25 min ±2 min (23-27 min)"} },
    { id:"a_frac",  type:"num", label:"Peso fracción de masa",   unit:"kg",  ref:"PCC",
      al:{exact:8,msg:"Debe ser 8 kg — P280 p.3.6"} },
    { id:"a_ck", type:"ck", label:"Verificación de procedimiento (P280 p.3)", items:[
      "Bandejas limpias disponibles y en uso",
      "Secos cargados con máquina apagada (excepto sal y manteca)",
      "Máquina giró una vuelta en velocidad lenta para integrar secos",
      "Agua del chiller agregada correctamente",
      "Manteca agregada a los 10 min del amasado rápido",
      "Sal agregada 4 min después de la manteca",
      "Análisis organoléptico realizado (tenacidad y elasticidad)",
      "Masa retirada y fraccionada en 8 kg",
      "Prensa seteada: 4.1s masa virgen / 6s recupero",
      "Papel de envoltorio con tinta hacia afuera (sin tocar masa)",
      "Tiempo de amasado registrado en planilla"
    ]},
    { id:"a_carro",       type:"txt", label:"N° de carro",               unit:"",   ref:"PC" },
    { id:"a_fecha_entrada",type:"txt",label:"Fecha de entrada a cámara", unit:"",   ref:"PC" },
    { id:"a_hora_entrada", type:"ti", label:"Hora de entrada a cámara",  ref:"PC" },
    { id:"a_ob", type:"ob", label:"Observaciones / desvíos" }
  ]},
  { id:"lam", label:"Laminado", fields:[
    { id:"l_carro",       type:"txt", label:"N° de carro (conecta con amasado)", unit:"", ref:"PC" },
    { id:"l_fecha_salida",type:"txt", label:"Fecha de salida de cámara",           unit:"", ref:"PC" },
    { id:"l_hora_salida", type:"ti",  label:"Hora de salida de cámara a laminado", ref:"PC" },
    { id:"l_tamb", type:"num", label:"T° ambiente en laminado", unit:"°C", ref:"PCC",
      al:{min:16,max:20,msg:"T° ambiente fuera del rango 16°C a 20°C — P280 p.4.6"} },
    { id:"l_ck1", type:"ck", label:"Laminado manual y empaste (P280 p.4)", items:[
      "Bastones retirados de cámara del turno anterior",
      "Estirado manual inicial realizado",
      "4 pasadas laminadora Argental: calibres 39-29-19-12",
      "Empaste cubre ancho y largo de mitad del bastón",
      "Bastón girado 90° antes de pasar con empaste",
      "Vuelta de integración: 5 pasadas calibres 39-32-26-17-12",
      "1ra Vuelta Simple: 5 pasadas 39-32-26-17-12",
      "2da Vuelta Simple: 5 pasadas 39-32-26-17-12",
      "3ra Vuelta Simple: 6 pasadas 39-32-26-20-14-12",
      "Carros laminados no superaron 45 min fuera de cámara"
    ]},
    { id:"l_treposo", type:"num", label:"Tiempo fuera de cámara", unit:"min", ref:"PC",
      al:{min:0,max:45,msg:"Máximo 45 min fuera de cámara — P280 p.4.6"} },
    { id:"l_ob", type:"ob", label:"Observaciones / desvíos" }
  ]},
  { id:"lamauto", label:"Lam. Auto", fields:[
    { id:"la_cal1",   type:"num", label:"Calibre inicial",          unit:"mm",  ref:"PC" },
    { id:"la_cal2",   type:"num", label:"Calibre final",            unit:"mm",  ref:"PC" },
    { id:"la_ancho",  type:"num", label:"Ancho de masa",            unit:"cm",  ref:"PC" },
    { id:"la_ck", type:"ck", label:"Laminadora automática (P280 p.5)", items:[
      "Programa 'manteca' seleccionado",
      "Ancho de masa controlado al tamaño del rodillo",
      "Rodillo colocado a la derecha para enrollado automático",
      "Solapas de empalme de 10 cm (bastón entrante por debajo)",
      "Presión aplicada correctamente al empalme"
    ]},
    { id:"la_ob", type:"ob", label:"Observaciones / desvíos" }
  ]},
  { id:"med", label:"Medialunera", fields:[
    { id:"m_maquinista_nombre", type:"txt", label:"Nombre del maquinista", unit:"", ref:"PC" },
    { id:"m_rec", type:"ck", label:"Recursos en línea", items:[
      "Maquinista presente en línea",
      "N° de identificación colocado en operarias",
      "N° de carro registrado en planilla",
      "Bandejas limpias disponibles y en uso"
    ]},
    { id:"m_maquina", type:"sel", label:"Medialunera en uso", ref:"PC",
      options:["12mil","1","2","3"] },
    { id:"m_espe", type:"num", label:"Espesor calibrado", unit:"", ref:"PC",
      al:{msg:"12mil → calibre 60 | Medialuneras 1/2/3 → calibre 15/20"} },
    { id:"m_peso", type:"num", label:"Peso triángulo (muestra)", unit:"g", ref:"PCC",
      al:{min:55,max:65,msg:"Peso fuera de rango 60g ±5g (55g-65g) — corregir calibre (P280 p.6.1)"} },
    { id:"m_recorte_peso", type:"num", label:"Peso recortes por enrolladora", unit:"kg", ref:"PC" },
    { id:"m_ck2", type:"ck", label:"Gestión de recupero (P280 p.6-7)", items:[
      "Recupero ≤10% de la cantidad de harina del amasijo",
      "Peso de recortes registrado por medialuna y por enrolladora",
      "Recupero fraccionado en bastones de 10 kg",
      "Prensa con seteo correcto para recupero (6 segundos)",
      "Recupero procesado desde punto 4.3 en adelante"
    ]},
    { id:"m_ck3", type:"ck", label:"Estiba en bandeja (P280 p.6.3-6.5)", items:[
      "Papel con número de operaria colocado (parte brillosa hacia arriba)",
      "7 columnas de 6 medialunas = 42 unidades por bandeja",
      "Punta del triángulo del medio hacia abajo",
      "Carro completado y trasladado al fermentador por montacargas"
    ]},
    { id:"m_ob", type:"ob", label:"Observaciones / desvíos" }
  ]},
  { id:"ferm", label:"Fermentado", fields:[
    { id:"fe_temp", type:"num", label:"T° fermentador",    unit:"°C",  ref:"PCC",
      al:{min:27,max:33,msg:"T° fuera del rango 27°C a 33°C — P280 p.8.4"} },
    { id:"fe_hr",   type:"num", label:"Humedad relativa fermentador", unit:"%", ref:"PCC",
      al:{min:86,max:90,msg:"Humedad fuera del rango 88% ±2% (86%-90%) — P280 p.8.4"} },
    { id:"fe_tpo",  type:"num", label:"Tiempo fermentado", unit:"min", ref:"PCC",
      al:{exact:60,msg:"Debe ser 60 min — P280 p.8.3"} },
    { id:"fe_ent",  type:"ti",  label:"Hora ingreso carro", ref:"PC" },
    { id:"fe_sal",  type:"ti",  label:"Hora salida carro",  ref:"PC" },
    { id:"fe_ck", type:"ck", label:"Verificación fermentado", items:[
      "Carro ingresó por puerta próxima al montacargas",
      "N° de carro y tipo registrados en planilla",
      "Hora de ingreso y salida registradas"
    ]},
    { id:"fe_ob", type:"ob", label:"Observaciones / desvíos" }
  ]},
  { id:"abat", label:"Abatidor", fields:[
    { id:"ab_carga", type:"ck", label:"Verificación de carga (P280 p.9.1)", items:[
      "Mínimo: 8 carros simples o 4 carros dobles",
      "Máximo no superado: 10 simples / 5 dobles"
    ]},
    { id:"ab_temp",   type:"num", label:"T° abatidor seteada",    unit:"°C",  ref:"PCC",
      al:{min:-26,max:-22,msg:"Debe ser -24°C ±2°C — P280 p.9.3"} },
    { id:"ab_tpo",    type:"num", label:"Tiempo de abatido",      unit:"min", ref:"PCC",
      al:{msg:"Aproximadamente 60 min — P280 p.9.3"} },
    { id:"ab_tsalida",type:"num", label:"T° medialunas al salir", unit:"°C",  ref:"PCC",
      al:{maxOnly:-12,msg:"Debe ser ≤ -12°C antes de envasar — P280 p.9.4"} },
    { id:"ab_ob", type:"ob", label:"Observaciones / desvíos" }
  ]},
  { id:"env", label:"Envasado", fields:[
    { id:"e_ck1", type:"ck", label:"Verificación de envasado (P280 p.10)", items:[
      "Cajón: 1 bolsa + 4 bandejas + 12 sueltas = 180 unidades",
      "Etiqueta con fecha, tipo y LOTE visible en nudo",
      "Pallet de 32 cajones ingresado a cámara final",
      "Cadena de frío no interrumpida",
      "Etiquetas en cajón — no en pared de cámara"
    ]},
    { id:"e_tcam", type:"num", label:"T° cámara final", unit:"°C", ref:"PCC",
      al:{maxOnly:-17,msg:"Debe ser ≤ -17°C — P280 p.10.5"} },
    { id:"e_ob", type:"ob", label:"Observaciones / desvíos" }
  ]}
];

// PCC fields para dashboard
const PCC_TRENDS = [
  { id:"f_tcam",    label:"T° cámara masas",  unit:"°C", min:6,   max:10,  color:"#8b5cf6" },
  { id:"a_tagua",   label:"T° agua chiller",  unit:"°C", min:1,   max:5,   color:"#3b82f6" },
  { id:"a_tmasa",   label:"T° masa final",    unit:"°C", min:18,  max:22,  color:"#ef4444" },
  { id:"l_tamb",    label:"T° amb. laminado", unit:"°C", min:16,  max:20,  color:"#f97316" },
  { id:"fe_temp",   label:"T° fermentador",   unit:"°C", min:28,  max:33,  color:"#eab308" },
  { id:"ab_temp",   label:"T° abatidor",      unit:"°C", min:-26, max:-22, color:"#06b6d4" },
  { id:"ab_tsalida",label:"T° salida abat.",  unit:"°C", max:-12,          color:"#0ea5e9" },
  { id:"e_tcam",    label:"T° cámara final",  unit:"°C", max:-17,          color:"#6366f1" },
  { id:"m_peso",    label:"Peso triángulo",   unit:"g",  min:55,  max:65,  color:"#10b981" },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function emptyRecorrida(turno,responsable){
  const now=new Date();
  return { id:`rec_${Date.now()}`,turno,responsable,lote:"",tipo:"m",
    hora:now.toTimeString().slice(0,5),fecha:now.toLocaleDateString("es-AR"),
    timestamp:now.toISOString(),datos:{},alertas:{},fotos:[],completado:false };
}
function hasAlerta(f,val){
  if(!f.al||val===""||val===undefined) return false;
  const n=parseFloat(val); if(isNaN(n)) return false;
  const a=f.al;
  if(a.exact!=null)            return Math.abs(n-a.exact)>0.01;
  if(a.min!=null&&a.max!=null) return n<a.min||n>a.max;
  if(a.maxOnly!=null)          return n>a.maxOnly;
  if(a.minOnly!=null)          return n<a.minOnly;
  return false;
}
function countAlertasRec(rec){ let c=0; SECTORES.forEach(s=>s.fields.forEach(f=>{ if(rec.alertas[f.id]) c++; })); return c; }
function dayPath(mId,wIdx,dIdx){ return `meses/${mId}/semanas/semana_${wIdx+1}/dias/dia_${dIdx}`; }

// ─── ESTILOS ──────────────────────────────────────────────────────────────────
const S={
  inp:(e)=>({width:"100%",fontSize:13,padding:"7px 10px",border:`1px solid ${e?"#E24B4A":"#cbd5e1"}`,borderRadius:8,background:e?"#FCEBEB":"#fff",boxSizing:"border-box",color:"#1e293b"}),
  bpcc:{fontSize:10,background:"#FCEBEB",color:"#A32D2D",border:"1px solid #F09595",borderRadius:3,padding:"1px 5px",fontWeight:600},
  bpc: {fontSize:10,background:"#E6F1FB",color:"#185FA5",border:"1px solid #85B7EB",borderRadius:3,padding:"1px 5px"},
  bok: {fontSize:11,background:"#E1F5EE",color:"#085041",borderRadius:3,padding:"2px 6px",fontWeight:500},
  ber: {fontSize:11,background:"#FCEBEB",color:"#A32D2D",borderRadius:3,padding:"2px 6px",fontWeight:500},
  card:{border:"1px solid #e2e8f0",borderRadius:10,padding:"1rem",background:"#fff",marginBottom:8},
  btn:(p,d)=>({padding:"8px 14px",fontSize:12,border:`1px solid ${p?"#185FA5":"#cbd5e1"}`,borderRadius:8,background:p?"#185FA5":"#f8fafc",color:p?"#E6F1FB":"#1e293b",cursor:d?"default":"pointer",opacity:d?.4:1,fontWeight:p?500:400}),
  btnSm:(p)=>({padding:"5px 10px",fontSize:11,border:`1px solid ${p?"#185FA5":"#e2e8f0"}`,borderRadius:6,background:p?"#185FA5":"#f8fafc",color:p?"#E6F1FB":"#64748b",cursor:"pointer",fontWeight:p?500:400}),
};

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({onLogin}){
  const [rol,setRol]=useState(ROLES.OPERARIO);
  const [nombre,setNombre]=useState("");
  const [turno,setTurno]=useState("TM");
  const [pin,setPin]=useState("");
  const [recordados,setRecordados]=useState([]);

  useEffect(()=>{
    try {
      const saved=localStorage.getItem(STORAGE_KEY);
      if(saved) setRecordados(JSON.parse(saved));
    } catch(e){}
  },[]);

  function guardarUsuario(u){
    try {
      const existing=JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]");
      const filtered=existing.filter(x=>!(x.nombre===u.nombre&&x.turno===u.turno));
      const updated=[u,...filtered].slice(0,5); // max 5 usuarios recordados
      localStorage.setItem(STORAGE_KEY,JSON.stringify(updated));
    } catch(e){}
  }

  function handleLogin(){
    if(!nombre.trim()) return;
    if(rol===ROLES.CALIDAD&&pin!==PIN_CALIDAD){ alert("PIN incorrecto"); return; }
    const u={rol,nombre:nombre.trim(),turno:rol===ROLES.OPERARIO?turno:"CALIDAD"};
    guardarUsuario(u);
    onLogin(u);
  }

  function loginRapido(u){
    if(u.rol===ROLES.CALIDAD){
      setRol(ROLES.CALIDAD); setNombre(u.nombre);
    } else {
      setRol(ROLES.OPERARIO); setNombre(u.nombre); setTurno(u.turno);
    }
  }

  return(
    <div style={{minHeight:"100vh",background:"#f8fafc",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{width:"100%",maxWidth:380,background:"#fff",border:"1px solid #e2e8f0",borderRadius:16,padding:"1.5rem"}}>
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:28,marginBottom:6}}>🥐</div>
          <div style={{fontSize:16,fontWeight:500}}>Control de Proceso</div>
          <div style={{fontSize:12,color:"#64748b"}}>Medialunas Panificados — SIG</div>
          <div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>P280 · Rev. A · Nov 2025</div>
        </div>

        {/* Acceso rápido usuarios recordados */}
        {recordados.length>0&&(
          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,color:"#64748b",marginBottom:6}}>Acceso rápido</div>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {recordados.map((u,i)=>(
                <button key={i} onClick={()=>loginRapido(u)}
                  style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",
                    border:"1px solid #e2e8f0",borderRadius:8,background:"#f8fafc",
                    cursor:"pointer",textAlign:"left",width:"100%"}}>
                  <span style={{fontSize:16}}>{u.rol===ROLES.CALIDAD?"👁":"👷"}</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:500,color:"#1e293b"}}>{u.nombre}</div>
                    <div style={{fontSize:11,color:"#64748b"}}>{u.turno} · {u.rol==="calidad"?"Calidad":"Operario"}</div>
                  </div>
                  <span style={{fontSize:11,color:"#94a3b8"}}>→</span>
                </button>
              ))}
            </div>
            <div style={{borderTop:"1px solid #f1f5f9",margin:"12px 0"}}/>
          </div>
        )}

        <div style={{marginBottom:12}}>
          <div style={{fontSize:12,color:"#64748b",marginBottom:5}}>Ingresar como</div>
          <div style={{display:"flex",gap:8}}>
            {[ROLES.OPERARIO,ROLES.CALIDAD].map(r=>(
              <button key={r} onClick={()=>setRol(r)}
                style={{flex:1,padding:"8px",fontSize:13,borderRadius:8,cursor:"pointer",
                  border:`1px solid ${rol===r?"#185FA5":"#e2e8f0"}`,
                  background:rol===r?"#185FA5":"#f8fafc",
                  color:rol===r?"#E6F1FB":"#64748b",fontWeight:rol===r?500:400}}>
                {r==="calidad"?"👁 Calidad":"👷 Operario"}
              </button>
            ))}
          </div>
        </div>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:12,color:"#64748b",marginBottom:4}}>Nombre / Apellido</div>
          <input type="text" value={nombre} onChange={e=>setNombre(e.target.value)}
            placeholder="Ej: Juan García" style={S.inp(false)}/>
        </div>
        {rol===ROLES.OPERARIO&&(
          <div style={{marginBottom:12}}>
            <div style={{fontSize:12,color:"#64748b",marginBottom:4}}>Turno asignado</div>
            <div style={{display:"flex",gap:6}}>
              {TURNOS.map(t=><button key={t} onClick={()=>setTurno(t)} style={{flex:1,...S.btnSm(turno===t)}}>{t}</button>)}
            </div>
          </div>
        )}
        {rol===ROLES.CALIDAD&&(
          <div style={{marginBottom:12}}>
            <div style={{fontSize:12,color:"#64748b",marginBottom:4}}>PIN de Calidad</div>
            <input type="password" value={pin} onChange={e=>setPin(e.target.value)}
              placeholder="••••" style={S.inp(false)}
              onKeyDown={e=>e.key==="Enter"&&handleLogin()}/>
          </div>
        )}
        <button onClick={handleLogin} disabled={!nombre.trim()}
          style={{...S.btn(true,!nombre.trim()),width:"100%",padding:"10px",fontSize:14,marginTop:8}}>
          Ingresar →
        </button>
      </div>
    </div>
  );
}

// ─── RECORRIDA FORM ───────────────────────────────────────────────────────────
function RecorridaForm({recorrida,onChange,readonly}){
  const [cur,setCur]=useState(0);
  const {datos,alertas,fotos=[]}=recorrida;
  const sec=SECTORES[cur];
  const prog=Math.round((cur/(SECTORES.length-1))*100);
  const fileInputRef=useRef(null);

  function handleNum(f,val){
    if(readonly) return;
    onChange({...recorrida,datos:{...datos,[f.id]:val},alertas:{...alertas,[f.id]:hasAlerta(f,val)}});
  }
  function toggleCk(fid,ix,len){
    if(readonly) return;
    const arr=datos[fid]?[...datos[fid]]:Array(len).fill(false);
    arr[ix]=!arr[ix];
    onChange({...recorrida,datos:{...datos,[fid]:arr}});
  }
  function handleSel(fid,val){
    if(readonly) return;
    onChange({...recorrida,datos:{...datos,[fid]:val}});
  }

  // Fotos
  // ── FOTOS — guardadas en localStorage, referenciadas por ID en Firestore ──
  function saveFotoLocal(id, dataUrl){
    try { localStorage.setItem(`sig_foto_${id}`, dataUrl); } catch(e){ console.warn("localStorage lleno",e); }
  }
  function getFotoLocal(id){
    try { return localStorage.getItem(`sig_foto_${id}`)||null; } catch(e){ return null; }
  }
  function deleteFotoLocal(id){
    try { localStorage.removeItem(`sig_foto_${id}`); } catch(e){}
  }

  function handleFotoCaptura(e){
    const files=Array.from(e.target.files||[]);
    if(!files.length) return;
    files.forEach(file=>{
      // Comprimir la imagen antes de guardar
      const reader=new FileReader();
      reader.onload=ev=>{
        const img=new Image();
        img.onload=()=>{
          // Redimensionar a max 800px manteniendo aspect ratio
          const MAX=800;
          let w=img.width, h=img.height;
          if(w>MAX||h>MAX){ if(w>h){h=Math.round(h*(MAX/w));w=MAX;}else{w=Math.round(w*(MAX/h));h=MAX;} }
          const canvas=document.createElement("canvas");
          canvas.width=w; canvas.height=h;
          const ctx=canvas.getContext("2d");
          ctx.drawImage(img,0,0,w,h);
          // Comprimir a JPEG 70%
          const compressedDataUrl=canvas.toDataURL("image/jpeg",0.7);
          const id=`foto_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          // Guardar imagen en localStorage (no en Firestore)
          saveFotoLocal(id, compressedDataUrl);
          // Solo guardar metadatos livianos en Firestore
          const fotoMeta={ id, nombre:file.name, sector:sec.label,
            timestamp:new Date().toISOString(), w, h };
          onChange({...recorrida, fotos:[...(recorrida.fotos||[]), fotoMeta]});
        };
        img.src=ev.target.result;
      };
      reader.readAsDataURL(file);
    });
    e.target.value="";
  }

  function eliminarFoto(id){
    deleteFotoLocal(id);
    onChange({...recorrida, fotos:(recorrida.fotos||[]).filter(f=>f.id!==id)});
  }

  // Componente para mostrar foto (carga desde localStorage)
  // Visor de foto a pantalla completa (modal)
  function FotoViewer({src,onClose,sector,hora}){
    useEffect(()=>{
      const handler=(e)=>{ if(e.key==="Escape") onClose(); };
      window.addEventListener("keydown",handler);
      return()=>window.removeEventListener("keydown",handler);
    },[]);
    return(
      <div onClick={onClose}
        style={{position:"fixed",top:0,left:0,width:"100vw",height:"100vh",
          background:"rgba(0,0,0,0.92)",zIndex:9999,display:"flex",flexDirection:"column",
          alignItems:"center",justifyContent:"center",padding:16}}>
        <div style={{width:"100%",maxWidth:500,display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
          <img src={src} alt="desvío"
            style={{maxWidth:"100%",maxHeight:"75vh",objectFit:"contain",borderRadius:8}}
            onClick={e=>e.stopPropagation()}/>
          <div style={{color:"#fff",fontSize:12,textAlign:"center",opacity:.8}}>
            📷 {sector}{hora?` · ${hora}`:""}
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={e=>{e.stopPropagation();
              const a=document.createElement("a");a.href=src;
              a.download=`foto_desvio_${Date.now()}.jpg`;a.click();}}
              style={{padding:"8px 16px",fontSize:12,borderRadius:8,border:"1px solid #fff",
                background:"transparent",color:"#fff",cursor:"pointer"}}>
              ↓ Descargar
            </button>
            <button onClick={onClose}
              style={{padding:"8px 16px",fontSize:12,borderRadius:8,border:"none",
                background:"#E24B4A",color:"#fff",cursor:"pointer"}}>
              ✕ Cerrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  function FotoThumb({foto, onDelete, readonly}){
    const [src,setSrc]=useState(null);
    const [visor,setVisor]=useState(false);
    useEffect(()=>{
      const stored=getFotoLocal(foto.id);
      setSrc(stored||null);
    },[foto.id]);
    return(
      <>
        {visor&&src&&<FotoViewer src={src} onClose={()=>setVisor(false)} sector={foto.sector} hora={foto.timestamp?.slice(11,16)}/>}
        <div style={{position:"relative",width:80}}>
          {src?(
            <img src={src} alt="desvío"
              style={{width:80,height:80,objectFit:"cover",borderRadius:6,
                border:"2px solid #e2e8f0",cursor:"pointer",display:"block"}}
              onClick={()=>setVisor(true)}/>
          ):(
            <div style={{width:80,height:80,borderRadius:6,border:"1px dashed #e2e8f0",
              background:"#f8fafc",display:"flex",alignItems:"center",justifyContent:"center",
              flexDirection:"column",gap:2}}>
              <span style={{fontSize:18}}>📷</span>
              <span style={{fontSize:8,color:"#94a3b8",textAlign:"center",lineHeight:1.2}}>Solo este dispositivo</span>
            </div>
          )}
          {src&&(
            <div onClick={()=>setVisor(true)}
              style={{position:"absolute",bottom:0,left:0,right:0,
                background:"rgba(0,0,0,0.45)",borderRadius:"0 0 5px 5px",
                color:"#fff",fontSize:9,textAlign:"center",padding:"2px 0",cursor:"pointer"}}>
              🔍 Ver
            </div>
          )}
          {!readonly&&onDelete&&(
            <button onClick={e=>{e.stopPropagation();onDelete(foto.id);}}
              style={{position:"absolute",top:-6,right:-6,width:18,height:18,borderRadius:"50%",
                background:"#E24B4A",color:"#fff",border:"2px solid #fff",cursor:"pointer",
                fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",padding:0,zIndex:1}}>
              ×
            </button>
          )}
          <div style={{fontSize:8,color:"#94a3b8",textAlign:"center",marginTop:2,lineHeight:1.2,
            maxWidth:80,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {foto.sector}
          </div>
        </div>
      </>
    );
  }

  function handleFotoCaptura(e){
    const files=Array.from(e.target.files||[]);
    if(!files.length) return;
    files.forEach(file=>{
      const reader=new FileReader();
      reader.onload=ev=>{
        const foto={ id:`foto_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          dataUrl:ev.target.result, nombre:file.name,
          sector:sec.label, timestamp:new Date().toISOString() };
        onChange({...recorrida,fotos:[...(recorrida.fotos||[]),foto]});
      };
      reader.readAsDataURL(file);
    });
    e.target.value="";
  }
  function eliminarFoto(id){
    onChange({...recorrida,fotos:(recorrida.fotos||[]).filter(f=>f.id!==id)});
  }

  function renderField(f){
    const val=datos[f.id]??""; const err=!!alertas[f.id];
    if(f.type==="txt") return(
      <div key={f.id} style={{marginBottom:10}}>
        <div style={{fontSize:12,color:"#64748b",marginBottom:3,display:"flex",alignItems:"center",gap:5}}>
          {f.label}{f.ref==="PCC"?<span style={S.bpcc}>PCC</span>:f.ref?<span style={S.bpc}>PC</span>:null}
        </div>
        <input type="text" value={val}
          onChange={e=>!readonly&&onChange({...recorrida,datos:{...datos,[f.id]:e.target.value}})}
          readOnly={readonly} placeholder="—"
          style={{...S.inp(false),background:readonly?"#f8fafc":"#fff"}}/>
      </div>
    );
    if(f.type==="num"||f.type==="ti") return(
      <div key={f.id} style={{marginBottom:10}}>
        <div style={{fontSize:12,color:"#64748b",marginBottom:3,display:"flex",alignItems:"center",gap:5}}>
          {f.label}{f.ref==="PCC"?<span style={S.bpcc}>PCC</span>:f.ref?<span style={S.bpc}>PC</span>:null}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <input type={f.type==="ti"?"time":"number"} value={val}
            onChange={e=>handleNum(f,e.target.value)} readOnly={readonly}
            style={{...S.inp(err),flex:1,background:readonly?"#f8fafc":"#fff"}}/>
          {f.unit&&<span style={{fontSize:12,color:"#94a3b8",whiteSpace:"nowrap"}}>{f.unit}</span>}
        </div>
        {err&&f.al?.msg&&<div style={{fontSize:11,color:"#A32D2D",marginTop:3}}>⚠ {f.al.msg}</div>}
      </div>
    );
    if(f.type==="sel") return(
      <div key={f.id} style={{marginBottom:10}}>
        <div style={{fontSize:12,color:"#64748b",marginBottom:3,display:"flex",alignItems:"center",gap:5}}>
          {f.label}{f.ref?<span style={S.bpc}>PC</span>:null}
        </div>
        <div style={{display:"flex",gap:6}}>
          {f.options.map(op=>(
            <button key={op} onClick={()=>handleSel(f.id,op)} disabled={readonly}
              style={{flex:1,...S.btnSm(val===op),fontSize:12}}>{op}</button>
          ))}
        </div>
      </div>
    );
    if(f.type==="ck"){
      const arr=val||Array(f.items.length).fill(false);
      return(
        <div key={f.id} style={{marginBottom:10}}>
          <div style={{fontSize:12,color:"#64748b",marginBottom:5}}>{f.label}</div>
          {f.items.map((item,ix)=>(
            <div key={ix} onClick={()=>toggleCk(f.id,ix,f.items.length)}
              style={{display:"flex",alignItems:"flex-start",gap:8,padding:"7px 9px",
                border:`1px solid ${arr[ix]?"#5DCAA5":"#cbd5e1"}`,borderRadius:8,marginBottom:4,
                cursor:readonly?"default":"pointer",background:arr[ix]?"#E1F5EE":"#fff",opacity:readonly?.75:1}}>
              <input type="checkbox" checked={!!arr[ix]} onChange={()=>{}} style={{marginTop:1,flexShrink:0}}/>
              <span style={{fontSize:12,color:arr[ix]?"#085041":"#1e293b",lineHeight:1.4}}>{item}</span>
            </div>
          ))}
        </div>
      );
    }
    if(f.type==="ob") return(
      <div key={f.id} style={{marginBottom:10}}>
        <div style={{fontSize:12,color:"#64748b",marginBottom:3}}>{f.label}</div>
        <textarea value={val} onChange={e=>!readonly&&onChange({...recorrida,datos:{...datos,[f.id]:e.target.value}})}
          readOnly={readonly} placeholder="Sin novedad / describir desvío..."
          style={{...S.inp(false),height:52,resize:"none",background:readonly?"#f8fafc":"#fff"}}/>
      </div>
    );
    return null;
  }

  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
        <input type="text" placeholder="N° de lote" value={recorrida.lote}
          onChange={e=>!readonly&&onChange({...recorrida,lote:e.target.value})}
          readOnly={readonly} style={{...S.inp(false),background:readonly?"#f8fafc":"#fff"}}/>
        <div style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#64748b",
          background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:"7px 10px"}}>
          🕐 {recorrida.hora} — {recorrida.responsable}
        </div>
      </div>
      {!readonly&&(
        <div style={{display:"flex",gap:8,marginBottom:8}}>
          {[["m","Manteca","#E6F1FB","#185FA5","#0C447C"],["g","Grasa","#FAEEDA","#BA7517","#633806"]].map(([t,label,bg,border,color])=>(
            <button key={t} onClick={()=>onChange({...recorrida,tipo:t})}
              style={{flex:1,padding:"7px",fontSize:12,borderRadius:8,cursor:"pointer",
                border:`1px solid ${recorrida.tipo===t?border:"#e2e8f0"}`,
                background:recorrida.tipo===t?bg:"#f8fafc",
                color:recorrida.tipo===t?color:"#64748b",fontWeight:recorrida.tipo===t?500:400}}>
              {label}
            </button>
          ))}
        </div>
      )}
      <div style={{height:3,background:"#e2e8f0",borderRadius:2,marginBottom:6}}>
        <div style={{height:3,width:`${prog}%`,background:"#1D9E75",borderRadius:2,transition:"width .3s"}}/>
      </div>
      <div style={{display:"flex",overflowX:"auto",gap:3,scrollbarWidth:"none"}}>
        {SECTORES.map((s,i)=>{
          const alrt=s.fields.some(f=>alertas[f.id]);
          return(
            <button key={s.id} onClick={()=>setCur(i)}
              style={{whiteSpace:"nowrap",padding:"4px 8px",fontSize:11,
                border:`1px solid ${i===cur?"#94a3b8":"#e2e8f0"}`,borderBottom:"none",
                borderRadius:"4px 4px 0 0",cursor:"pointer",
                background:i===cur?"#fff":"#f8fafc",color:i===cur?"#1e293b":"#64748b",fontWeight:i===cur?500:400}}>
              <span style={{display:"inline-block",width:5,height:5,borderRadius:"50%",marginRight:3,verticalAlign:"middle",
                background:alrt?"#E24B4A":"#cbd5e1"}}/>
              {s.label}
            </button>
          );
        })}
      </div>
      <div style={{border:"1px solid #94a3b8",borderRadius:"0 8px 8px 8px",padding:"1rem",background:"#fff",marginBottom:8}}>
        <div style={{fontSize:14,fontWeight:500,marginBottom:2}}>{sec.label}</div>
        <div style={{fontSize:10,color:"#94a3b8",marginBottom:10}}>P280 · {cur+1}/{SECTORES.length}</div>
        {sec.fields.map(f=>renderField(f))}

        {/* Botón cámara por sector */}
        {!readonly&&(
          <div style={{marginTop:8,paddingTop:8,borderTop:"1px solid #f1f5f9"}}>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
              multiple style={{display:"none"}} onChange={handleFotoCaptura}/>
            <button onClick={()=>fileInputRef.current?.click()}
              style={{...S.btnSm(false),width:"100%",padding:"8px",fontSize:12,
                borderStyle:"dashed",color:"#64748b",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              📷 Adjuntar foto de desvío en {sec.label}
            </button>
            {/* Fotos del sector actual — cargadas desde localStorage */}
            {fotos.filter(f=>f.sector===sec.label).length>0&&(
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:8}}>
                {fotos.filter(f=>f.sector===sec.label).map(foto=>(
                  <FotoThumb key={foto.id} foto={foto} onDelete={eliminarFoto} readonly={false}/>
                ))}
              </div>
            )}
          </div>
        )}
        {/* Fotos en modo lectura — cargadas desde localStorage */}
        {readonly&&fotos.filter(f=>f.sector===sec.label).length>0&&(
          <div style={{marginTop:8,paddingTop:8,borderTop:"1px solid #f1f5f9"}}>
            <div style={{fontSize:11,color:"#64748b",marginBottom:6}}>📷 Fotos adjuntas ({fotos.filter(f=>f.sector===sec.label).length})</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {fotos.filter(f=>f.sector===sec.label).map(foto=>(
                <FotoThumb key={foto.id} foto={foto} onDelete={null} readonly={true}/>
              ))}
            </div>
          </div>
        )}
      </div>
      {/* ── Trazabilidad de carro con soporte de fechas cruzadas ── */}
      {(datos["a_carro"]||datos["l_carro"])&&(
        <div style={{background:"#E6F1FB",border:"1px solid #85B7EB",borderRadius:8,padding:"10px 12px",marginBottom:8}}>
          <div style={{fontSize:12,fontWeight:500,color:"#0C447C",marginBottom:8}}>🚗 Trazabilidad del carro</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,fontSize:11}}>
            {/* Entrada — Amasado */}
            <div style={{background:"#fff",borderRadius:6,padding:"6px 8px",border:"1px solid #bfdbfe"}}>
              <div style={{fontSize:10,color:"#64748b",marginBottom:3,fontWeight:500}}>📥 AMASADO → CÁMARA</div>
              {datos["a_carro"]&&<div><span style={{color:"#64748b"}}>Carro:</span> <strong style={{color:"#0C447C"}}>{datos["a_carro"]}</strong></div>}
              {datos["a_fecha_entrada"]&&<div style={{marginTop:2}}><span style={{color:"#64748b"}}>Fecha:</span> <strong style={{color:"#0C447C"}}>{datos["a_fecha_entrada"]}</strong></div>}
              {datos["a_hora_entrada"]&&<div style={{marginTop:2}}><span style={{color:"#64748b"}}>Hora:</span> <strong style={{color:"#0C447C"}}>{datos["a_hora_entrada"]}</strong></div>}
              {!datos["a_carro"]&&!datos["a_fecha_entrada"]&&!datos["a_hora_entrada"]&&<div style={{color:"#94a3b8",fontSize:10}}>Sin datos de entrada</div>}
            </div>
            {/* Salida — Laminado */}
            <div style={{background:"#fff",borderRadius:6,padding:"6px 8px",border:"1px solid #bfdbfe"}}>
              <div style={{fontSize:10,color:"#64748b",marginBottom:3,fontWeight:500}}>📤 CÁMARA → LAMINADO</div>
              {datos["l_carro"]&&<div><span style={{color:"#64748b"}}>Carro:</span> <strong style={{color:"#0C447C"}}>{datos["l_carro"]}</strong></div>}
              {datos["l_fecha_salida"]&&<div style={{marginTop:2}}><span style={{color:"#64748b"}}>Fecha:</span> <strong style={{color:"#0C447C"}}>{datos["l_fecha_salida"]}</strong></div>}
              {datos["l_hora_salida"]&&<div style={{marginTop:2}}><span style={{color:"#64748b"}}>Hora:</span> <strong style={{color:"#0C447C"}}>{datos["l_hora_salida"]}</strong></div>}
              {!datos["l_carro"]&&!datos["l_fecha_salida"]&&!datos["l_hora_salida"]&&<div style={{color:"#94a3b8",fontSize:10}}>Sin datos de salida</div>}
            </div>
          </div>
          {/* Cálculo tiempo total — soporta días distintos */}
          {datos["a_hora_entrada"]&&datos["l_hora_salida"]&&(()=>{
            function parseDateTime(fecha,hora){
              if(!hora) return null;
              const [h,m]=hora.split(":").map(Number);
              if(fecha){
                const parts=fecha.split("/");
                if(parts.length===3){
                  const d=new Date(2000+parseInt(parts[2]),parseInt(parts[1])-1,parseInt(parts[0]),h,m);
                  return d.getTime();
                }
              }
              return h*60+m; // fallback sin fecha
            }
            const t1=parseDateTime(datos["a_fecha_entrada"],datos["a_hora_entrada"]);
            const t2=parseDateTime(datos["l_fecha_salida"],datos["l_hora_salida"]);
            if(!t1||!t2) return null;
            let diffMin;
            if(typeof t1==="number"&&typeof t2==="number"&&t1>1000){
              diffMin=Math.round((t2-t1)/60000);
            } else {
              diffMin=t2-t1;
              if(diffMin<0) diffMin+=1440;
            }
            if(diffMin<0) return null;
            const hs=Math.floor(diffMin/60), mn=diffMin%60;
            const ok=diffMin>=480&&diffMin<=1440;
            const diasStr=hs>=24?` (${Math.floor(hs/24)}d ${hs%24}h ${mn}min)`:``;
            return(
              <div style={{marginTop:8,padding:"7px 10px",
                background:ok?"#E1F5EE":"#FCEBEB",borderRadius:6,
                color:ok?"#085041":"#A32D2D",fontWeight:500,fontSize:12,
                display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:16}}>⏱</span>
                <div>
                  <div>Tiempo en cámara: <strong>{hs}h {mn}min{diasStr}</strong></div>
                  <div style={{fontSize:10,fontWeight:400,marginTop:1}}>
                    {ok?"✓ Dentro del rango (8-24 hs)":"⚠ Fuera del rango establecido (8-24 hs)"}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Galería de fotos de la recorrida ── */}
      {(recorrida.fotos||[]).length>0&&(
        <div style={{border:"1px solid #e2e8f0",borderRadius:8,padding:"10px 12px",marginBottom:8,background:"#fff"}}>
          <div style={{fontSize:12,fontWeight:500,color:"#1e293b",marginBottom:8}}>
            📷 Fotos de esta recorrida ({(recorrida.fotos||[]).length})
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {(recorrida.fotos||[]).map(foto=>(
              <div key={foto.id} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                <FotoThumb foto={foto} onDelete={readonly?null:eliminarFoto} readonly={readonly}/>
                <span style={{fontSize:9,color:"#94a3b8",maxWidth:80,textAlign:"center",lineHeight:1.2}}>
                  {foto.sector}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <button onClick={()=>setCur(c=>Math.max(0,c-1))} disabled={cur===0} style={S.btn(false,cur===0)}>← Anterior</button>
        <span style={{fontSize:11,color:"#94a3b8"}}>{cur+1}/{SECTORES.length}</span>
        <button onClick={()=>setCur(c=>Math.min(SECTORES.length-1,c+1))} disabled={cur===SECTORES.length-1} style={S.btn(true,cur===SECTORES.length-1)}>Siguiente →</button>
      </div>
    </div>
  );
}

// ─── DAY VIEW ─────────────────────────────────────────────────────────────────
function DayView({monthId,weekIdx,dayIdx,usuario,onBack}){
  const [registros,setRegistros]=useState({});
  const [turnoActivo,setTurnoActivo]=useState(usuario.turno==="CALIDAD"?"TM":usuario.turno);
  const [recActiva,setRecActiva]=useState(null);
  const [saveStatus,setSaveStatus]=useState("idle");
  const [loading,setLoading]=useState(true);
  const saveTimer=useRef(null);
  const path=dayPath(monthId,weekIdx,dayIdx);

  useEffect(()=>{
    if(!firebaseOk){setLoading(false);return;}
    const unsub=onSnapshot(doc(db,path),snap=>{
      setRegistros(snap.exists()?snap.data().registros||{}:{});
      setLoading(false);
    });
    return()=>unsub();
  },[path]);

  // Sanitizar antes de guardar: quitar dataUrl de fotos (se guarda en localStorage)
  function sanitizeForFirestore(reg){
    const clean={};
    Object.entries(reg).forEach(([turno,recs])=>{
      clean[turno]=recs.map(rec=>({
        ...rec,
        fotos:(rec.fotos||[]).map(f=>{
          const {dataUrl,...meta}=f; // strip dataUrl, solo guardar metadatos
          return meta;
        })
      }));
    });
    return clean;
  }

  async function saveToFirebase(newReg){
    if(!firebaseOk) return;
    setSaveStatus("saving");
    try{
      const safe=sanitizeForFirestore(newReg);
      await setDoc(doc(db,path),{registros:safe},{merge:true});
      setSaveStatus("saved");
      setTimeout(()=>setSaveStatus("idle"),2000);
    }catch(e){
      console.error("Error guardando en Firebase:",e);
      setSaveStatus("error");
    }
  }

  function debouncedSave(newReg){
    if(saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(()=>saveToFirebase(newReg),1000);
  }
  function addRecorrida(){
    const newRec=emptyRecorrida(turnoActivo,usuario.nombre);
    const tRecs=registros[turnoActivo]?[...registros[turnoActivo],newRec]:[newRec];
    const newReg={...registros,[turnoActivo]:tRecs};
    setRegistros(newReg);
    setRecActiva({turno:turnoActivo,idx:tRecs.length-1});
    debouncedSave(newReg);
  }
  function updateRecorrida(turno,idx,newRec){
    const tRecs=[...(registros[turno]||[])];
    tRecs[idx]=newRec;
    const newReg={...registros,[turno]:tRecs};
    setRegistros(newReg);
    debouncedSave(newReg);
  }

  function eliminarRecorrida(turno,idx){
    if(!window.confirm(`¿Eliminar Recorrida ${idx+1} del turno ${turno}? Esta acción no se puede deshacer.`)) return;
    const tRecs=(registros[turno]||[]).filter((_,i)=>i!==idx);
    const newReg={...registros,[turno]:tRecs};
    setRegistros(newReg);
    debouncedSave(newReg);
  }

  const allAlertas=[];
  Object.entries(registros).forEach(([turno,recs])=>recs.forEach((r,i)=>{
    SECTORES.forEach(s=>s.fields.forEach(f=>{
      if(r.alertas[f.id]) allAlertas.push({turno,rec:i+1,sec:s.label,campo:f.label,msg:f.al?.msg||""});
    }));
  }));

  if(loading) return <div style={{padding:20,textAlign:"center",color:"#64748b"}}>Cargando...</div>;

  if(recActiva){
    const rec=(registros[recActiva.turno]||[])[recActiva.idx];
    if(!rec){setRecActiva(null);return null;}
    const isOwn=usuario.rol===ROLES.CALIDAD||rec.responsable===usuario.nombre;
    return(
      <div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
          <button onClick={()=>setRecActiva(null)} style={S.btn(false,false)}>← Volver</button>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:500}}>{recActiva.turno} — Recorrida {recActiva.idx+1}</div>
            <div style={{fontSize:11,color:"#64748b"}}>{rec.hora} · {rec.responsable}</div>
          </div>
          {!isOwn&&<span style={{...S.ber,fontSize:10}}>Solo lectura</span>}
          {isOwn&&(
            <span style={{fontSize:11,padding:"3px 8px",borderRadius:5,
              background:saveStatus==="saving"?"#FAEEDA":saveStatus==="saved"?"#E1F5EE":saveStatus==="error"?"#FCEBEB":"#f1f5f9",
              color:saveStatus==="saving"?"#633806":saveStatus==="saved"?"#085041":saveStatus==="error"?"#A32D2D":"#94a3b8"}}>
              {saveStatus==="saving"?"Guardando…":saveStatus==="saved"?"✓ Guardado":saveStatus==="error"?"⚠ Error":"Sin cambios"}
            </span>
          )}
        </div>
        <RecorridaForm recorrida={rec} onChange={nr=>updateRecorrida(recActiva.turno,recActiva.idx,nr)} readonly={!isOwn}/>
      </div>
    );
  }

  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <button onClick={onBack} style={S.btn(false,false)}>← Semana</button>
        <div style={{flex:1,fontSize:14,fontWeight:500}}>{DIAS[dayIdx]}</div>
        {allAlertas.length>0&&<span style={S.ber}>{allAlertas.length} alerta{allAlertas.length>1?"s":""}</span>}
      </div>
      <div style={{display:"flex",gap:5,marginBottom:10}}>
        {TURNOS.map(t=>{
          const recs=registros[t]||[];
          const alrts=recs.reduce((s,r)=>s+countAlertasRec(r),0);
          const canView=usuario.rol===ROLES.CALIDAD||usuario.turno===t;
          if(!canView) return null;
          return(
            <button key={t} onClick={()=>setTurnoActivo(t)}
              style={{flex:1,padding:"8px 4px",fontSize:12,borderRadius:8,cursor:"pointer",
                border:`1px solid ${turnoActivo===t?"#185FA5":alrts>0?"#F09595":recs.length>0?"#5DCAA5":"#e2e8f0"}`,
                background:turnoActivo===t?"#185FA5":alrts>0?"#FCEBEB":recs.length>0?"#E1F5EE":"#f8fafc",
                color:turnoActivo===t?"#E6F1FB":alrts>0?"#A32D2D":recs.length>0?"#085041":"#64748b",fontWeight:turnoActivo===t?500:400}}>
              {t}<span style={{display:"block",fontSize:9,marginTop:1}}>{recs.length>0?`${recs.length} rec${alrts>0?` · ${alrts}⚠`:""}`:"—"}</span>
            </button>
          );
        })}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{fontSize:13,fontWeight:500}}>{turnoActivo} — Recorridas</div>
        {(usuario.rol===ROLES.CALIDAD||usuario.turno===turnoActivo)&&(
          <button onClick={addRecorrida} style={{...S.btn(true,false),padding:"6px 12px",fontSize:12}}>+ Nueva recorrida</button>
        )}
      </div>
      {(registros[turnoActivo]||[]).length===0?(
        <div style={{padding:"20px",textAlign:"center",background:"#f8fafc",border:"1px dashed #e2e8f0",borderRadius:8,fontSize:12,color:"#94a3b8"}}>Sin recorridas para este turno</div>
      ):(
        (registros[turnoActivo]||[]).map((rec,i)=>{
          const als=countAlertasRec(rec);
          return(
            <div key={i} style={{...S.card,padding:"10px 12px",borderColor:als>0?"#F09595":"#5DCAA5",marginBottom:6}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <div onClick={()=>setRecActiva({turno:turnoActivo,idx:i})}
                  style={{fontSize:13,fontWeight:500,cursor:"pointer",flex:1}}>
                  Recorrida {i+1}
                </div>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  {(rec.fotos||[]).length>0&&<span style={{fontSize:11,color:"#64748b"}}>📷 {rec.fotos.length}</span>}
                  {als>0?<span style={S.ber}>{als} alerta{als>1?"s":""}</span>:<span style={S.bok}>✓ Sin alertas</span>}
                  {(usuario.rol===ROLES.CALIDAD||rec.responsable===usuario.nombre)&&(
                    <button onClick={e=>{e.stopPropagation();eliminarRecorrida(turnoActivo,i);}}
                      style={{fontSize:11,padding:"2px 7px",border:"1px solid #F09595",borderRadius:5,
                        background:"#FCEBEB",color:"#A32D2D",cursor:"pointer",flexShrink:0}}>
                      🗑
                    </button>
                  )}
                </div>
              </div>
              <div onClick={()=>setRecActiva({turno:turnoActivo,idx:i})}
                style={{fontSize:11,color:"#64748b",cursor:"pointer"}}>
                🕐 {rec.hora} · 👤 {rec.responsable}
                {rec.lote&&<span> · Lote: {rec.lote}</span>}
                <span> · {rec.tipo==="m"?"Manteca":"Grasa"}</span>
              </div>
            </div>
          );
        })
      )}
      {usuario.rol===ROLES.CALIDAD&&allAlertas.length>0&&(
        <div style={{...S.card,marginTop:8}}>
          <div style={{fontSize:13,fontWeight:500,color:"#A32D2D",marginBottom:8}}>Alertas del día — todos los turnos</div>
          {allAlertas.map((a,i)=>(
            <div key={i} style={{fontSize:11,background:"#FCEBEB",color:"#A32D2D",border:"1px solid #F09595",borderRadius:5,padding:"4px 8px",marginBottom:3}}>
              <strong>{a.turno} · Rec.{a.rec}</strong> — {a.sec}: {a.campo}{a.msg?` (${a.msg})`:""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── RESUMEN SEMANAL ──────────────────────────────────────────────────────────
function ResumenSemanal({monthId,weekIdx,usuario}){
  const [diasData,setDiasData]=useState({});
  const [loading,setLoading]=useState(true);
  const [tabActiva,setTabActiva]=useState("alertas");
  const [modoEdicion,setModoEdicion]=useState(false);
  // Edicion state — persiste durante la sesion
  const [eliminados,setEliminados]=useState({});     // uid→true
  const [notas,setNotas]=useState({});               // uid→string
  const [editandoNota,setEditandoNota]=useState(null); // uid abierto
  const [notaTemp,setNotaTemp]=useState("");           // valor mientras escribe
  const [eliminadosOpen,setEliminadosOpen]=useState(false); // panel plegable

  useEffect(()=>{
    if(!firebaseOk){setLoading(false);return;}
    const promises=DIAS.map((_,di)=>
      getDoc(doc(db,dayPath(monthId,weekIdx,di))).then(snap=>({di,data:snap.exists()?snap.data():null}))
    );
    Promise.all(promises).then(results=>{
      const data={};
      results.forEach(({di,data:d})=>{if(d) data[di]=d;});
      setDiasData(data);
      setLoading(false);
    });
  },[monthId,weekIdx]);

  if(loading) return <div style={{padding:20,textAlign:"center",color:"#64748b"}}>Cargando resumen...</div>;

  // ── Recolección ──
  const alertaConteo={};
  const alertasPorTurno={TM:[],TT:[],TN:[]};
  const obsPorTurno={TM:[],TT:[],TN:[]};
  const destildadosPorTurno={TM:[],TT:[],TN:[]};
  const reincidencias={};

  Object.entries(diasData).forEach(([diIdx,dayData])=>{
    const registros=dayData.registros||{};
    TURNOS.forEach(turno=>{
      if(usuario.rol!==ROLES.CALIDAD&&usuario.turno!==turno) return;
      (registros[turno]||[]).forEach((rec,ri)=>{
        const base=`${turno}_d${diIdx}_r${ri}`;
        SECTORES.forEach(s=>s.fields.forEach(f=>{
          if(rec.alertas[f.id]){
            const key=`${s.label} — ${f.label}`;
            const uid=`al_${base}_${f.id}`;
            alertaConteo[key]=(alertaConteo[key]||0)+1;
            alertasPorTurno[turno].push({uid,key,dia:DIAS[diIdx],rec:ri+1,sector:s.label,campo:f.label,
              msg:f.al?.msg||"",valor:rec.datos[f.id]||"",responsable:rec.responsable,hora:rec.hora,turno});
            if(!reincidencias[key]) reincidencias[key]={count:0,instancias:[]};
            reincidencias[key].count++;
            reincidencias[key].instancias.push({uid,turno,dia:DIAS[diIdx],rec:ri+1,valor:rec.datos[f.id]||"",responsable:rec.responsable,hora:rec.hora});
          }
          if(f.type==="ob"&&rec.datos[f.id]?.trim()){
            const uid=`ob_${base}_${f.id}`;
            obsPorTurno[turno].push({uid,dia:DIAS[diIdx],rec:ri+1,sector:s.label,
              texto:rec.datos[f.id].trim(),responsable:rec.responsable,hora:rec.hora,turno});
          }
          if(f.type==="ck"){
            const arr=rec.datos[f.id]||[];
            f.items.forEach((item,ix)=>{
              if(!arr[ix]){
                const uid=`de_${base}_${f.id}_${ix}`;
                destildadosPorTurno[turno].push({uid,dia:DIAS[diIdx],rec:ri+1,sector:s.label,
                  checklist:f.label,item,responsable:rec.responsable,hora:rec.hora,turno});
              }
            });
          }
        }));
      });
    });
  });

  const ranking=Object.entries(alertaConteo).sort((a,b)=>b[1]-a[1]).map(([key,count])=>({key,count}));
  const reincList=Object.entries(reincidencias).filter(([,v])=>v.count>1).sort((a,b)=>b[1].count-a[1].count);
  const turnosVisibles=TURNOS.filter(t=>usuario.rol===ROLES.CALIDAD||usuario.turno===t);

  const alsFilt=(t)=>alertasPorTurno[t].filter(a=>!eliminados[a.uid]);
  const obsFilt=(t)=>obsPorTurno[t].filter(o=>!eliminados[o.uid]);
  const destFilt=(t)=>destildadosPorTurno[t].filter(d=>!eliminados[d.uid]);
  const reincFilt=reincList.map(([key,v])=>({key,count:v.instancias.filter(i=>!eliminados[i.uid]).length,
    instancias:v.instancias.filter(i=>!eliminados[i.uid])})).filter(r=>r.instancias.length>0);

  const totAl=turnosVisibles.reduce((s,t)=>s+alsFilt(t).length,0);
  const totOb=turnosVisibles.reduce((s,t)=>s+obsFilt(t).length,0);
  const totDe=turnosVisibles.reduce((s,t)=>s+destFilt(t).length,0);
  const totEl=Object.keys(eliminados).length;

  // ── Acciones ──
  function eliminar(uid){setEliminados(p=>({...p,[uid]:true}));}
  function eliminarTodos(lista){
    const batch={};
    lista.forEach(x=>{batch[x.uid]=true;});
    setEliminados(p=>({...p,...batch}));
  }
  function restaurar(uid){setEliminados(p=>{const n={...p};delete n[uid];return n;});}
  function restaurarTodos(){setEliminados({});}

  function abrirNota(uid){
    setEditandoNota(uid);
    setNotaTemp(notas[uid]||"");
  }
  function guardarNota(){
    if(editandoNota){
      setNotas(p=>({...p,[editandoNota]:notaTemp}));
      setEditandoNota(null);
      setNotaTemp("");
    }
  }
  function cancelarNota(){setEditandoNota(null);setNotaTemp("");}

  // ── BotonesEdicion — sin bugs: nota y eliminar son acciones separadas ──
  function BotonesEdicion({uid}){
    if(!modoEdicion||usuario.rol!==ROLES.CALIDAD) return null;
    const tieneNota=!!notas[uid];
    const estaEditando=editandoNota===uid;
    return(
      <div style={{marginTop:6}}>
        {estaEditando?(
          <div>
            <textarea value={notaTemp} onChange={e=>setNotaTemp(e.target.value)}
              placeholder="Escribí una nota de calidad..."
              autoFocus
              style={{...S.inp(false),height:52,resize:"none",fontSize:11,width:"100%",marginBottom:5}}/>
            <div style={{display:"flex",gap:5}}>
              <button onClick={guardarNota}
                style={{fontSize:10,padding:"4px 10px",border:"1px solid #1D9E75",borderRadius:5,
                  background:"#E1F5EE",color:"#085041",cursor:"pointer",fontWeight:500}}>
                ✓ Guardar nota
              </button>
              <button onClick={cancelarNota}
                style={{fontSize:10,padding:"4px 8px",border:"1px solid #e2e8f0",borderRadius:5,
                  background:"#f8fafc",color:"#64748b",cursor:"pointer"}}>
                Cancelar
              </button>
            </div>
          </div>
        ):(
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            <button onClick={()=>abrirNota(uid)}
              style={{fontSize:10,padding:"3px 8px",border:"1px solid #185FA5",borderRadius:5,
                background:"#E6F1FB",color:"#185FA5",cursor:"pointer"}}>
              {tieneNota?"✏ Editar nota":"+ Agregar nota"}
            </button>
            <button onClick={()=>eliminar(uid)}
              style={{fontSize:10,padding:"3px 8px",border:"1px solid #E24B4A",borderRadius:5,
                background:"#fff",color:"#E24B4A",cursor:"pointer"}}>
              🗑 Eliminar del reporte
            </button>
          </div>
        )}
        {!estaEditando&&tieneNota&&(
          <div style={{fontSize:11,color:"#185FA5",fontStyle:"italic",marginTop:4,
            padding:"4px 8px",background:"#E6F1FB",borderRadius:5}}>
            📝 {notas[uid]}
          </div>
        )}
      </div>
    );
  }

  // ── Exportar TXT ──
  function exportar(){
    let t=`RESUMEN SEMANAL — SEMANA ${weekIdx+1}\nMes: ${monthId} | ${new Date().toLocaleDateString("es-AR")} ${new Date().toLocaleTimeString("es-AR")}\n${"=".repeat(55)}\n\n`;
    t+=`TOTALES: ${totAl} alertas | ${totOb} obs. | ${totDe} destildados | ${reincFilt.length} reincidencias\n\n`;
    t+=`${"─".repeat(40)}\nRANKING\n${"─".repeat(40)}\n`;
    ranking.forEach((r,i)=>{t+=`${i+1}. ${r.key}: ${r.count}x\n`;});
    t+="\n";
    if(reincFilt.length){
      t+=`${"─".repeat(40)}\nREINCIDENCIAS\n${"─".repeat(40)}\n`;
      reincFilt.forEach(r=>{t+=`⚠ ${r.key} — ${r.count}x\n`;r.instancias.forEach((ins,i)=>{t+=`  ${i+1}. ${ins.turno} · ${ins.dia} · Rec.${ins.rec} · ${ins.hora} · ${ins.responsable}${ins.valor?` · Valor: ${ins.valor}`:""}\n`;});t+="\n";});
    }
    turnosVisibles.forEach(turno=>{
      t+=`${"─".repeat(40)}\nTURNO ${turno}\n${"─".repeat(40)}\n`;
      const als=alsFilt(turno),obs=obsFilt(turno),dest=destFilt(turno);
      if(!als.length&&!obs.length&&!dest.length){t+="Sin desvíos.\n\n";return;}
      if(als.length){t+=`\nALERTAS (${als.length}):\n`;als.forEach((a,i)=>{t+=`  ${i+1}. [${a.dia}·Rec.${a.rec}·${a.hora}] ${a.sector} — ${a.campo}${a.valor?` (${a.valor})`:""} · ${a.responsable}\n`;if(a.msg)t+=`     → ${a.msg}\n`;if(notas[a.uid])t+=`     📝 ${notas[a.uid]}\n`;});}
      if(obs.length){t+=`\nOBSERVACIONES (${obs.length}):\n`;obs.forEach((o,i)=>{t+=`  ${i+1}. [${o.dia}·Rec.${o.rec}·${o.hora}] ${o.sector} · ${o.responsable}\n     "${o.texto}"\n`;if(notas[o.uid])t+=`     📝 ${notas[o.uid]}\n`;});}
      if(dest.length){t+=`\nDESTILDADOS (${dest.length}):\n`;dest.forEach((d,i)=>{t+=`  ${i+1}. [${d.dia}·Rec.${d.rec}·${d.hora}] ${d.sector} — ${d.checklist}\n     ✗ ${d.item} · ${d.responsable}\n`;if(notas[d.uid])t+=`     📝 ${notas[d.uid]}\n`;});}
      t+="\n";
    });
    if(totEl>0) t+=`${"─".repeat(40)}\nELIMINADOS DEL REPORTE (${totEl})\n${"─".repeat(40)}\n(Removidos por Calidad)\n`;
    const b=new Blob([t],{type:"text/plain"});
    const a=document.createElement("a");a.href=URL.createObjectURL(b);
    a.download=`resumen_sem${weekIdx+1}_${monthId}.txt`;a.click();
  }

  // ── Render ──
  return(
    <div>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{fontSize:14,fontWeight:500}}>Resumen — Semana {weekIdx+1}</div>
        <div style={{display:"flex",gap:5}}>
          {usuario.rol===ROLES.CALIDAD&&(
            <button onClick={()=>{setModoEdicion(p=>!p);setEditandoNota(null);}}
              style={{padding:"5px 10px",fontSize:11,borderRadius:7,cursor:"pointer",
                border:`1px solid ${modoEdicion?"#185FA5":"#e2e8f0"}`,
                background:modoEdicion?"#185FA5":"#f8fafc",
                color:modoEdicion?"#E6F1FB":"#64748b",fontWeight:modoEdicion?500:400}}>
              {modoEdicion?"✓ Editando":"✏ Editar"}
            </button>
          )}
          <button onClick={exportar} style={{...S.btn(false,false),padding:"5px 10px",fontSize:11}}>↓ .txt</button>
        </div>
      </div>

      {modoEdicion&&(
        <div style={{background:"#E6F1FB",border:"1px solid #85B7EB",borderRadius:7,padding:"7px 10px",marginBottom:10,fontSize:11,color:"#0C447C"}}>
          ✏ Modo edición — agregá notas o eliminá ítems de cualquier apartado. Los cambios se aplican al exportar.
        </div>
      )}

      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5,marginBottom:10}}>
        {[["Alertas",totAl,totAl>0?"#FCEBEB":"#E1F5EE",totAl>0?"#A32D2D":"#085041"],
          ["Obs.",totOb,totOb>0?"#FAEEDA":"#E1F5EE",totOb>0?"#633806":"#085041"],
          ["Destild.",totDe,totDe>0?"#f1f5f9":"#E1F5EE",totDe>0?"#475569":"#085041"],
          ["Reinc.",reincFilt.length,reincFilt.length>0?"#FCEBEB":"#E1F5EE",reincFilt.length>0?"#A32D2D":"#085041"],
        ].map(([label,val,bg,color])=>(
          <div key={label} style={{background:bg,borderRadius:7,padding:"8px 4px",textAlign:"center"}}>
            <div style={{fontSize:18,fontWeight:500,color}}>{val}</div>
            <div style={{fontSize:9,color,marginTop:1}}>{label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:4,marginBottom:10,overflowX:"auto",scrollbarWidth:"none"}}>
        {[["alertas",`⚠ Alertas (${totAl})`],["observaciones",`📝 Obs. (${totOb})`],
          ["destildados",`☐ Destild. (${totDe})`],["reincidencias",`🔁 Reinc. (${reincFilt.length})`],["ranking","🏆 Ranking"],
        ].map(([id,label])=>(
          <button key={id} onClick={()=>setTabActiva(id)}
            style={{whiteSpace:"nowrap",padding:"5px 10px",fontSize:11,borderRadius:16,cursor:"pointer",flexShrink:0,
              border:`1px solid ${tabActiva===id?"#185FA5":"#e2e8f0"}`,
              background:tabActiva===id?"#185FA5":"#f8fafc",
              color:tabActiva===id?"#E6F1FB":"#64748b",fontWeight:tabActiva===id?500:400}}>
            {label}
          </button>
        ))}
      </div>

      {/* ── ALERTAS ── */}
      {tabActiva==="alertas"&&(
        <div>
          {modoEdicion&&totAl>0&&(
            <button onClick={()=>turnosVisibles.forEach(t=>eliminarTodos(alsFilt(t)))}
              style={{...S.btn(false,false),width:"100%",marginBottom:8,fontSize:11,color:"#E24B4A",borderColor:"#F09595"}}>
              🗑 Eliminar todas las alertas del reporte
            </button>
          )}
          {totAl===0&&<div style={{textAlign:"center",padding:"20px",background:"#E1F5EE",border:"1px solid #5DCAA5",borderRadius:9,color:"#085041",fontSize:12}}>✓ Sin alertas esta semana</div>}
          {turnosVisibles.map(turno=>{
            const als=alsFilt(turno);
            if(!als.length) return <div key={turno} style={{...S.card,marginBottom:6}}><div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:13,fontWeight:500}}>Turno {turno}</span><span style={S.bok}>✓ Sin alertas</span></div></div>;
            return(
              <div key={turno} style={{...S.card,marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span style={{fontSize:13,fontWeight:500}}>Turno {turno} <span style={{fontSize:11,fontWeight:400,color:"#64748b"}}>({als.length})</span></span>
                  {modoEdicion&&<button onClick={()=>eliminarTodos(als)} style={{fontSize:10,padding:"2px 7px",border:"1px solid #F09595",borderRadius:5,background:"#fff",color:"#E24B4A",cursor:"pointer"}}>Eliminar todas</button>}
                </div>
                {als.map((a,i)=>(
                  <div key={i} style={{background:"#FCEBEB",border:"1px solid #F09595",borderRadius:6,padding:"8px 10px",marginBottom:5}}>
                    <div style={{fontSize:12,fontWeight:500,color:"#A32D2D"}}>{a.sector} — {a.campo}</div>
                    <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{a.dia} · Rec.{a.rec} · {a.hora} · {a.responsable}{a.valor&&<span> · Valor: <strong>{a.valor}</strong></span>}</div>
                    {a.msg&&<div style={{fontSize:11,color:"#A32D2D",marginTop:2}}>→ {a.msg}</div>}
                    <BotonesEdicion uid={a.uid}/>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* ── OBSERVACIONES ── */}
      {tabActiva==="observaciones"&&(
        <div>
          {modoEdicion&&totOb>0&&(
            <button onClick={()=>turnosVisibles.forEach(t=>eliminarTodos(obsFilt(t)))}
              style={{...S.btn(false,false),width:"100%",marginBottom:8,fontSize:11,color:"#E24B4A",borderColor:"#F09595"}}>
              🗑 Eliminar todas las observaciones
            </button>
          )}
          {totOb===0&&<div style={{textAlign:"center",padding:"20px",background:"#E1F5EE",border:"1px solid #5DCAA5",borderRadius:9,color:"#085041",fontSize:12}}>✓ Sin observaciones esta semana</div>}
          {turnosVisibles.map(turno=>{
            const obs=obsFilt(turno);
            if(!obs.length) return <div key={turno} style={{...S.card,marginBottom:6}}><div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:13,fontWeight:500}}>Turno {turno}</span><span style={S.bok}>✓ Sin observaciones</span></div></div>;
            return(
              <div key={turno} style={{...S.card,marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span style={{fontSize:13,fontWeight:500}}>Turno {turno} <span style={{fontSize:11,fontWeight:400,color:"#64748b"}}>({obs.length})</span></span>
                  {modoEdicion&&<button onClick={()=>eliminarTodos(obs)} style={{fontSize:10,padding:"2px 7px",border:"1px solid #F09595",borderRadius:5,background:"#fff",color:"#E24B4A",cursor:"pointer"}}>Eliminar todas</button>}
                </div>
                {obs.map((o,i)=>(
                  <div key={i} style={{background:"#FAEEDA",border:"1px solid #f9c74f",borderRadius:6,padding:"8px 10px",marginBottom:5}}>
                    <div style={{fontSize:12,fontWeight:500,color:"#633806"}}>{o.sector}</div>
                    <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{o.dia} · Rec.{o.rec} · {o.hora} · {o.responsable}</div>
                    <div style={{fontSize:12,color:"#1e293b",marginTop:4,fontStyle:"italic"}}>"{o.texto}"</div>
                    <BotonesEdicion uid={o.uid}/>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* ── DESTILDADOS ── */}
      {tabActiva==="destildados"&&(
        <div>
          {modoEdicion&&totDe>0&&(
            <button onClick={()=>turnosVisibles.forEach(t=>eliminarTodos(destFilt(t)))}
              style={{...S.btn(false,false),width:"100%",marginBottom:8,fontSize:11,color:"#E24B4A",borderColor:"#F09595"}}>
              🗑 Eliminar todos los ítems destildados
            </button>
          )}
          {totDe===0&&<div style={{textAlign:"center",padding:"20px",background:"#E1F5EE",border:"1px solid #5DCAA5",borderRadius:9,color:"#085041",fontSize:12}}>✓ Todos los ítems marcados</div>}
          {turnosVisibles.map(turno=>{
            const dest=destFilt(turno);
            if(!dest.length) return <div key={turno} style={{...S.card,marginBottom:6}}><div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:13,fontWeight:500}}>Turno {turno}</span><span style={S.bok}>✓ Todo marcado</span></div></div>;
            return(
              <div key={turno} style={{...S.card,marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span style={{fontSize:13,fontWeight:500}}>Turno {turno} <span style={{fontSize:11,fontWeight:400,color:"#64748b"}}>({dest.length} sin marcar)</span></span>
                  {modoEdicion&&<button onClick={()=>eliminarTodos(dest)} style={{fontSize:10,padding:"2px 7px",border:"1px solid #F09595",borderRadius:5,background:"#fff",color:"#E24B4A",cursor:"pointer"}}>Eliminar todos</button>}
                </div>
                {dest.map((d,i)=>(
                  <div key={i} style={{padding:"7px 9px",background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:6,marginBottom:4}}>
                    <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
                      <span style={{fontSize:14,flexShrink:0}}>☐</span>
                      <div style={{flex:1}}>
                        <div style={{fontSize:12,fontWeight:500,color:"#1e293b"}}>{d.item}</div>
                        <div style={{fontSize:11,color:"#64748b"}}>{d.sector} · {d.checklist}</div>
                        <div style={{fontSize:11,color:"#94a3b8"}}>{d.dia} · Rec.{d.rec} · {d.hora} · {d.responsable}</div>
                      </div>
                    </div>
                    <BotonesEdicion uid={d.uid}/>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* ── REINCIDENCIAS ── */}
      {tabActiva==="reincidencias"&&(
        <div>
          {modoEdicion&&reincFilt.length>0&&(
            <button onClick={()=>reincFilt.forEach(r=>eliminarTodos(r.instancias))}
              style={{...S.btn(false,false),width:"100%",marginBottom:8,fontSize:11,color:"#E24B4A",borderColor:"#F09595"}}>
              🗑 Eliminar todas las reincidencias
            </button>
          )}
          {reincFilt.length===0&&<div style={{textAlign:"center",padding:"20px",background:"#E1F5EE",border:"1px solid #5DCAA5",borderRadius:9,color:"#085041",fontSize:12}}>✓ Sin reincidencias</div>}
          {reincFilt.map((r,i)=>(
            <div key={i} style={{...S.card,marginBottom:8,borderLeft:`3px solid ${r.count>=3?"#E24B4A":"#f97316"}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{flex:1,fontSize:13,fontWeight:500}}>{r.key}</div>
                <div style={{display:"flex",gap:5,alignItems:"center"}}>
                  <span style={{fontSize:13,fontWeight:600,background:r.count>=3?"#FCEBEB":"#FAEEDA",color:r.count>=3?"#A32D2D":"#633806",borderRadius:16,padding:"2px 10px"}}>{r.count}x</span>
                  {r.count>=3&&<span style={{fontSize:9,background:"#FCEBEB",color:"#A32D2D",borderRadius:3,padding:"1px 4px",fontWeight:700}}>CRÍTICO</span>}
                </div>
              </div>
              {r.instancias.map((ins,j)=>(
                <div key={j} style={{padding:"4px 0",borderTop:"1px solid #f1f5f9"}}>
                  <div style={{fontSize:11,color:"#64748b"}}>{j+1}. {ins.turno} · {ins.dia} · Rec.{ins.rec} · {ins.hora} · {ins.responsable}{ins.valor&&<span style={{color:"#A32D2D",fontWeight:500}}> · {ins.valor}</span>}</div>
                  <BotonesEdicion uid={ins.uid}/>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ── RANKING ── */}
      {tabActiva==="ranking"&&(
        <div>
          {ranking.length===0&&<div style={{textAlign:"center",padding:"20px",background:"#E1F5EE",border:"1px solid #5DCAA5",borderRadius:9,color:"#085041",fontSize:12}}>✓ Sin alertas</div>}
          {ranking.length>0&&(
            <div style={S.card}>
              <div style={{fontSize:13,fontWeight:500,marginBottom:10}}>🏆 Alertas más frecuentes</div>
              {ranking.map((r,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:7,padding:"5px 7px",borderRadius:5,
                  background:i===0?"#FFF7ED":i===1?"#F8FAFC":"#fff"}}>
                  <div style={{width:22,height:22,borderRadius:"50%",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,
                    background:i===0?"#FFA000":i===1?"#9E9E9E":i===2?"#795548":"#e2e8f0",color:i<3?"#fff":"#64748b"}}>{i+1}</div>
                  <div style={{flex:1,fontSize:12}}>{r.key}</div>
                  <div style={{width:60,height:5,background:"#f1f5f9",borderRadius:3,flexShrink:0}}>
                    <div style={{height:5,borderRadius:3,background:"#E24B4A",width:`${Math.round((r.count/ranking[0].count)*100)}%`}}/>
                  </div>
                  <span style={{fontSize:12,fontWeight:600,background:"#FCEBEB",color:"#A32D2D",borderRadius:4,padding:"2px 7px",minWidth:26,textAlign:"center"}}>{r.count}x</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Panel eliminados PLEGABLE ── */}
      {totEl>0&&(
        <div style={{border:"1px solid #cbd5e1",borderRadius:8,marginTop:12,overflow:"hidden"}}>
          <button onClick={()=>setEliminadosOpen(p=>!p)}
            style={{width:"100%",padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",
              background:"#f8fafc",border:"none",cursor:"pointer",fontSize:12,color:"#64748b"}}>
            <span>🗑 Eliminados del reporte ({totEl})</span>
            <span style={{fontSize:14}}>{eliminadosOpen?"▲":"▼"}</span>
          </button>
          {eliminadosOpen&&(
            <div style={{padding:"10px 12px",background:"#fff"}}>
              {modoEdicion&&(
                <button onClick={restaurarTodos}
                  style={{fontSize:11,padding:"4px 10px",border:"1px solid #185FA5",borderRadius:5,
                    background:"#E6F1FB",color:"#185FA5",cursor:"pointer",marginBottom:8,width:"100%"}}>
                  ↩ Restaurar todos
                </button>
              )}
              {/* Categorías plegables */}
              {[
                {label:"⚠ Alertas", items:[...alertasPorTurno.TM,...alertasPorTurno.TT,...alertasPorTurno.TN].filter(x=>eliminados[x.uid])},
                {label:"📝 Observaciones", items:[...obsPorTurno.TM,...obsPorTurno.TT,...obsPorTurno.TN].filter(x=>eliminados[x.uid])},
                {label:"☐ Destildados", items:[...destildadosPorTurno.TM,...destildadosPorTurno.TT,...destildadosPorTurno.TN].filter(x=>eliminados[x.uid])},
                {label:"🔁 Reincidencias", items:reincList.flatMap(([,v])=>v.instancias).filter(x=>eliminados[x.uid])},
              ].map(({label,items})=>items.length===0?null:(
                <div key={label} style={{marginBottom:8}}>
                  <div style={{fontSize:11,fontWeight:500,color:"#64748b",marginBottom:4}}>{label} ({items.length})</div>
                  {items.map((item,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                      fontSize:11,color:"#94a3b8",padding:"4px 0",borderTop:"1px solid #f8fafc"}}>
                      <span style={{textDecoration:"line-through",flex:1}}>
                        {item.sector||""} {item.campo||item.texto?.substring(0,35)||item.item||"ítem"} · {item.dia||""}
                      </span>
                      {modoEdicion&&(
                        <button onClick={()=>restaurar(item.uid)}
                          style={{fontSize:10,border:"1px solid #185FA5",borderRadius:4,padding:"2px 6px",
                            background:"#E6F1FB",cursor:"pointer",color:"#185FA5",flexShrink:0,marginLeft:6}}>
                          Restaurar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Dashboard({monthId,usuario}){
  const [allData,setAllData]=useState([]);
  const [loading,setLoading]=useState(true);
  const [filtroTurno,setFiltroTurno]=useState("TODOS");
  const [pccSeleccionado,setPccSeleccionado]=useState(PCC_TRENDS[0].id);

  useEffect(()=>{
    if(!firebaseOk){setLoading(false);return;}
    // Cargar todos los días del mes (4 semanas × 7 días)
    const promises=[];
    [0,1,2,3].forEach(wi=>{
      DIAS.forEach((_,di)=>{
        promises.push(
          getDoc(doc(db,dayPath(monthId,wi,di))).then(snap=>({wi,di,data:snap.exists()?snap.data():null}))
        );
      });
    });
    Promise.all(promises).then(results=>{
      const puntos=[];
      results.forEach(({wi,di,data})=>{
        if(!data) return;
        const registros=data.registros||{};
        TURNOS.forEach(turno=>{
          if(usuario.rol!==ROLES.CALIDAD&&usuario.turno!==turno) return;
          (registros[turno]||[]).forEach((rec,ri)=>{
            const punto={
              label:`S${wi+1} ${DIAS[di].substring(0,3)} ${turno} R${ri+1}`,
              semana:wi+1, dia:di, turno, rec:ri+1,
              responsable:rec.responsable, hora:rec.hora,
            };
            PCC_TRENDS.forEach(pcc=>{
              const v=parseFloat(rec.datos[pcc.id]);
              if(!isNaN(v)) punto[pcc.id]=v;
            });
            puntos.push(punto);
          });
        });
      });
      setAllData(puntos);
      setLoading(false);
    });
  },[monthId]);

  if(loading) return <div style={{padding:20,textAlign:"center",color:"#64748b"}}>Cargando datos...</div>;

  const pcc=PCC_TRENDS.find(p=>p.id===pccSeleccionado);
  const datos=allData
    .filter(d=>filtroTurno==="TODOS"||d.turno===filtroTurno)
    .filter(d=>d[pccSeleccionado]!==undefined);

  const fuera=datos.filter(d=>{
    const v=d[pccSeleccionado];
    if(pcc.min!=null&&pcc.max!=null) return v<pcc.min||v>pcc.max;
    if(pcc.max!=null) return v>pcc.max;
    if(pcc.min!=null) return v<pcc.min;
    return false;
  });

  const vals=datos.map(d=>d[pccSeleccionado]).filter(v=>v!==undefined);
  const promedio=vals.length?Math.round((vals.reduce((s,v)=>s+v,0)/vals.length)*10)/10:null;

  // Datos para recharts
  const chartData=datos.map(d=>({
    name:d.label,
    valor:d[pccSeleccionado],
    fill:fuera.includes(d)?"#ef4444":pcc.color,
  }));

  return(
    <div>
      <div style={{fontSize:14,fontWeight:500,marginBottom:12}}>📈 Dashboard de tendencias</div>

      {/* Filtros */}
      <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
        {["TODOS",...TURNOS].map(t=>(
          <button key={t} onClick={()=>setFiltroTurno(t)} style={S.btnSm(filtroTurno===t)}>
            {t}
          </button>
        ))}
      </div>

      {/* Selector PCC */}
      <div style={{display:"flex",overflowX:"auto",gap:5,marginBottom:12,paddingBottom:2,scrollbarWidth:"none"}}>
        {PCC_TRENDS.map(p=>(
          <button key={p.id} onClick={()=>setPccSeleccionado(p.id)}
            style={{whiteSpace:"nowrap",padding:"5px 10px",fontSize:11,borderRadius:20,cursor:"pointer",flexShrink:0,
              border:`1px solid ${pccSeleccionado===p.id?p.color:"#e2e8f0"}`,
              background:pccSeleccionado===p.id?p.color:"#f8fafc",
              color:pccSeleccionado===p.id?"#fff":"#64748b",fontWeight:pccSeleccionado===p.id?500:400}}>
            {p.label}
          </button>
        ))}
      </div>

      {/* KPIs del PCC seleccionado */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
        {[
          ["Registros",datos.length,"#E6F1FB","#0C447C"],
          ["Fuera de rango",fuera.length,fuera.length>0?"#FCEBEB":"#E1F5EE",fuera.length>0?"#A32D2D":"#085041"],
          ["Promedio",promedio!==null?`${promedio}${pcc.unit}`:"—","#f8fafc","#64748b"],
        ].map(([label,val,bg,color])=>(
          <div key={label} style={{background:bg,borderRadius:8,padding:"10px 6px",textAlign:"center"}}>
            <div style={{fontSize:18,fontWeight:500,color}}>{val}</div>
            <div style={{fontSize:10,color,marginTop:2,lineHeight:1.3}}>{label}</div>
          </div>
        ))}
      </div>

      {/* Gráfico */}
      {datos.length===0?(
        <div style={{textAlign:"center",padding:"30px",background:"#f8fafc",border:"1px dashed #e2e8f0",borderRadius:10,color:"#94a3b8",fontSize:12}}>
          Sin datos para este parámetro
        </div>
      ):(
        <div style={{...S.card}}>
          <div style={{fontSize:12,fontWeight:500,marginBottom:8,color:"#1e293b"}}>
            {pcc.label} {pcc.unit} — evolución mensual
          </div>
          <div style={{fontSize:11,color:"#64748b",marginBottom:8}}>
            Límite: {pcc.min!=null&&pcc.max!=null?`${pcc.min} a ${pcc.max}`:pcc.max!=null?`≤ ${pcc.max}`:pcc.min!=null?`≥ ${pcc.min}`:""} {pcc.unit}
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{top:5,right:10,left:-20,bottom:5}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
              <XAxis dataKey="name" tick={{fontSize:8}} interval={Math.floor(chartData.length/6)}/>
              <YAxis tick={{fontSize:10}}/>
              <Tooltip
                contentStyle={{fontSize:11,borderRadius:6,border:"1px solid #e2e8f0"}}
                formatter={(v)=>[`${v} ${pcc.unit}`,pcc.label]}/>
              {pcc.min!=null&&<ReferenceLine y={pcc.min} stroke="#E24B4A" strokeDasharray="4 2" label={{value:`min ${pcc.min}`,fontSize:9,fill:"#E24B4A"}}/>}
              {pcc.max!=null&&<ReferenceLine y={pcc.max} stroke="#E24B4A" strokeDasharray="4 2" label={{value:`max ${pcc.max}`,fontSize:9,fill:"#E24B4A"}}/>}
              <Line type="monotone" dataKey="valor" stroke={pcc.color} dot={(props)=>{
                const {cx,cy,payload}=props;
                const esFuera=fuera.some(d=>d.label===payload.name);
                return <circle key={cx} cx={cx} cy={cy} r={4} fill={esFuera?"#ef4444":pcc.color} stroke="#fff" strokeWidth={1}/>;
              }} strokeWidth={2} connectNulls/>
            </LineChart>
          </ResponsiveContainer>

          {/* Puntos fuera de rango */}
          {fuera.length>0&&(
            <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #f1f5f9"}}>
              <div style={{fontSize:11,fontWeight:500,color:"#A32D2D",marginBottom:6}}>⚠ Registros fuera de rango</div>
              {fuera.map((d,i)=>(
                <div key={i} style={{fontSize:11,background:"#FCEBEB",color:"#A32D2D",borderRadius:5,padding:"4px 8px",marginBottom:3}}>
                  {d.label} · Valor: <strong>{d[pccSeleccionado]} {pcc.unit}</strong> · {d.responsable}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── WEEK VIEW ────────────────────────────────────────────────────────────────
function WeekView({monthId,weekIdx,weekLabel,usuario,onDaySelect,onBack}){
  const [tab,setTab]=useState("dias");
  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <button onClick={onBack} style={S.btn(false,false)}>← Mes</button>
        <span style={{fontSize:14,fontWeight:500,flex:1}}>{weekLabel}</span>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:12}}>
        {[["dias","📋 Días"],["resumen","📊 Resumen"]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{flex:1,padding:"8px",fontSize:12,borderRadius:8,cursor:"pointer",
              border:`1px solid ${tab===id?"#185FA5":"#e2e8f0"}`,
              background:tab===id?"#185FA5":"#f8fafc",
              color:tab===id?"#E6F1FB":"#64748b",fontWeight:tab===id?500:400}}>
            {label}
          </button>
        ))}
      </div>
      {tab==="dias"?(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {DIAS.map((dia,i)=>(
            <div key={i} onClick={()=>onDaySelect(i)}
              style={{...S.card,cursor:"pointer",padding:"12px",borderColor:"#e2e8f0"}}>
              <div style={{fontSize:13,fontWeight:500,marginBottom:3}}>{dia}</div>
              <div style={{fontSize:11,color:"#94a3b8"}}>Ver registros →</div>
            </div>
          ))}
        </div>
      ):(
        <ResumenSemanal monthId={monthId} weekIdx={weekIdx} usuario={usuario}/>
      )}
    </div>
  );
}

// ─── MONTH VIEW ───────────────────────────────────────────────────────────────
function MonthView({monthId,monthLabel,usuario,onWeekSelect}){
  const [tab,setTab]=useState("semanas");
  return(
    <div>
      <div style={{display:"flex",gap:6,marginBottom:12}}>
        {[["semanas","📋 Semanas"],["dashboard","📈 Dashboard"]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{flex:1,padding:"8px",fontSize:12,borderRadius:8,cursor:"pointer",
              border:`1px solid ${tab===id?"#185FA5":"#e2e8f0"}`,
              background:tab===id?"#185FA5":"#f8fafc",
              color:tab===id?"#E6F1FB":"#64748b",fontWeight:tab===id?500:400}}>
            {label}
          </button>
        ))}
      </div>
      {tab==="semanas"?(
        <>
          <div style={{fontSize:14,fontWeight:500,marginBottom:12}}>{monthLabel}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {[1,2,3,4].map(i=>(
              <div key={i} onClick={()=>onWeekSelect(i-1)}
                style={{...S.card,cursor:"pointer",padding:"14px 12px",borderColor:"#e2e8f0",textAlign:"center"}}>
                <div style={{fontSize:22,marginBottom:4}}>📋</div>
                <div style={{fontSize:13,fontWeight:500}}>Semana {i}</div>
                <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>Toca para ver →</div>
              </div>
            ))}
          </div>
        </>
      ):(
        <Dashboard monthId={monthId} usuario={usuario}/>
      )}
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App(){
  const [usuario,setUsuario]=useState(null);
  const [selectedMonth,setSelectedMonth]=useState(null);
  const [nav,setNav]=useState("month");
  const [weekIdx,setWeekIdx]=useState(0);
  const [dayIdx,setDayIdx]=useState(0);

  if(!usuario) return <LoginScreen onLogin={u=>setUsuario(u)}/>;

  return(
    <div style={{fontFamily:"system-ui,sans-serif",maxWidth:430,margin:"0 auto",color:"#1e293b",paddingBottom:32,minHeight:"100vh",background:"#f8fafc"}}>
      <div style={{padding:"1rem 1rem .75rem",borderBottom:"1px solid #e2e8f0",background:"#fff",marginBottom:8}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <div>
            <div style={{fontSize:15,fontWeight:500}}>🥐 Control de Proceso</div>
            <div style={{fontSize:11,color:"#64748b"}}>{usuario.nombre} · {usuario.turno} · {usuario.rol==="calidad"?"👁 Calidad":"👷 Operario"}</div>
          </div>
          <button onClick={()=>setUsuario(null)}
            style={{fontSize:11,border:"1px solid #e2e8f0",borderRadius:6,padding:"4px 8px",background:"#f8fafc",cursor:"pointer",color:"#64748b"}}>
            Salir
          </button>
        </div>
        <div style={{fontSize:11,padding:"3px 8px",borderRadius:5,display:"inline-flex",alignItems:"center",gap:5,
          background:firebaseOk?"#E1F5EE":"#FAEEDA",color:firebaseOk?"#085041":"#633806",marginBottom:8}}>
          <span style={{width:6,height:6,borderRadius:"50%",background:firebaseOk?"#1D9E75":"#BA7517",display:"inline-block"}}/>
          {firebaseOk?"Firebase conectado":"Modo local"}
        </div>
        <select value={selectedMonth?.id||""} onChange={e=>{
          const m=ALL_MONTHS.find(x=>x.id===e.target.value);
          setSelectedMonth(m||null); setNav("month");
        }} style={{...S.inp(false),fontSize:13,marginBottom:8}}>
          <option value="">— Seleccionar período —</option>
          {YEARS.map(y=>(
            <optgroup key={y} label={`── ${y} ──`}>
              {ALL_MONTHS.filter(m=>m.year===y).map(m=>(
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        {selectedMonth&&(
          <div style={{display:"flex",gap:4,fontSize:12,alignItems:"center",flexWrap:"wrap"}}>
            <button onClick={()=>setNav("month")} style={S.btnSm(nav==="month")}>{selectedMonth.label}</button>
            {(nav==="week"||nav==="day")&&<><span style={{color:"#94a3b8"}}>›</span><button onClick={()=>setNav("week")} style={S.btnSm(nav==="week")}>Sem. {weekIdx+1}</button></>}
            {nav==="day"&&<><span style={{color:"#94a3b8"}}>›</span><button style={S.btnSm(true)}>{DIAS[dayIdx].substring(0,3)}</button></>}
          </div>
        )}
      </div>
      <div style={{padding:"0 1rem"}}>
        {!selectedMonth?(
          <div style={{textAlign:"center",padding:"40px 20px",color:"#94a3b8"}}>
            <div style={{fontSize:32,marginBottom:10}}>📅</div>
            <div style={{fontSize:14,marginBottom:4}}>Seleccioná un mes para comenzar</div>
            <div style={{fontSize:12}}>2026 y 2027 disponibles — 12 meses cada año</div>
          </div>
        ):nav==="month"?(
          <MonthView monthId={selectedMonth.id} monthLabel={selectedMonth.label} usuario={usuario} onWeekSelect={i=>{setWeekIdx(i);setNav("week");}}/>
        ):nav==="week"?(
          <WeekView monthId={selectedMonth.id} weekIdx={weekIdx} weekLabel={`Semana ${weekIdx+1}`} usuario={usuario}
            onDaySelect={i=>{setDayIdx(i);setNav("day");}} onBack={()=>setNav("month")}/>
        ):(
          <DayView monthId={selectedMonth.id} weekIdx={weekIdx} dayIdx={dayIdx} usuario={usuario} onBack={()=>setNav("week")}/>
        )}
      </div>
    </div>
  );
}
