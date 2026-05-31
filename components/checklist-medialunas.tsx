"use client";
import { useState, useEffect, useRef } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from "firebase/firestore";

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

// ─── SECTORES — P280 Medialunas de Manteca - Panificados ─────────────────────
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
      al:{min:6,max:10,msg:"T° fuera del rango establecido (6°C a 10°C)"} },
    { id:"f_ob", type:"ob", label:"Observaciones" }
  ]},
  { id:"amas", label:"Amasado", fields:[
    { id:"a_tagua", type:"num", label:"T° agua del chiller",    unit:"°C",  ref:"PCC",
      al:{min:5,max:13,msg:"Agua fuera del rango (5°C a 13°C) — P280 p.3.2"} },
    { id:"a_tamb",  type:"num", label:"T° ambiente",            unit:"°C",  ref:"PC" },
    { id:"a_tcam",  type:"num", label:"T° cámara de masas",     unit:"°C",  ref:"PCC",
      al:{min:6,max:10,msg:"T° fuera del rango establecido (6°C a 10°C)"} },
    { id:"a_tmasa", type:"num", label:"T° masa final",          unit:"°C",  ref:"PCC",
      al:{min:18,max:22,msg:"Masa fuera de rango 20°C ±2°C — retener y evaluar (P280 p.3.5)"} },
    { id:"a_tpo",   type:"num", label:"Tiempo total de amasado",unit:"min", ref:"PC",
      al:{exact:25,msg:"Tiempo fuera del estándar (debe ser 25 min)"} },
    { id:"a_frac",  type:"num", label:"Peso fracción de masa",  unit:"kg",  ref:"PCC",
      al:{exact:8,msg:"Debe ser 8 kg — P280 p.3.6"} },
    { id:"a_ck", type:"ck", label:"Verificación de procedimiento (P280 p.3)", items:[
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
    { id:"a_reposo", type:"num", label:"Tiempo de reposo en cámara", unit:"hs", ref:"PCC",
      al:{min:8,max:24,msg:"Mínimo 8 hs — óptimo 12 hs (P280 p.3.8)"} },
    { id:"a_ob", type:"ob", label:"Observaciones / desvíos" }
  ]},
  { id:"lam", label:"Laminado", fields:[
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
    { id:"l_treposo", type:"num", label:"Tiempo fuera de cámara (laminado)", unit:"min", ref:"PC",
      al:{min:0,max:45,msg:"Máximo 30-45 min fuera de cámara — P280 p.4.6"} },
    { id:"l_ob", type:"ob", label:"Observaciones / desvíos" }
  ]},
  { id:"lamauto", label:"Lam. Auto", fields:[
    { id:"la_ck", type:"ck", label:"Laminadora automática (P280 p.5)", items:[
      "Programa 'manteca' seleccionado en laminadora automática",
      "Ancho de masa controlado al tamaño del rodillo",
      "Rodillo colocado a la derecha para enrollado automático",
      "Solapas de empalme de 10 cm (bastón entrante por debajo)",
      "Presión aplicada correctamente al empalme"
    ]},
    { id:"la_ob", type:"ob", label:"Observaciones / desvíos" }
  ]},
  { id:"med", label:"Medialunera", fields:[
    { id:"m_rec", type:"ck", label:"Recursos en línea", items:[
      "Maquinista presente en línea",
      "N° de identificación colocado en operarias",
      "N° de carro registrado en planilla"
    ]},
    { id:"m_maquina", type:"sel", label:"Medialunera en uso", ref:"PC",
      options:["12mil","1","2","3"] },
    { id:"m_espe", type:"num", label:"Espesor calibrado", unit:"", ref:"PC",
      al:{msg:"12mil → calibre 60 | Medialuneras 1/2/3 → calibre 15/20 (P280 p.6.1)"} },
    { id:"m_peso", type:"num", label:"Peso triángulo (muestra)", unit:"g", ref:"PCC",
      al:{exact:60,msg:"Peso objetivo: 60 g — corregir calibre (P280 p.6.1)"} },
    { id:"m_recorte_peso", type:"num", label:"Peso recortes (registrar por enrolladora)", unit:"kg", ref:"PC" },
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
      "Carro completado y trasladado al fermentador por montacargas ascensor 1"
    ]},
    { id:"m_ob", type:"ob", label:"Observaciones / desvíos" }
  ]},
  { id:"ferm", label:"Fermentado", fields:[
    { id:"fe_temp", type:"num", label:"T° fermentador",    unit:"°C",  ref:"PCC",
      al:{exact:33,msg:"Debe ser 33°C (puede variar según condición ambiental — P280 p.8.4)"} },
    { id:"fe_hr",   type:"num", label:"Humedad relativa",  unit:"%",   ref:"PCC",
      al:{exact:90,msg:"Debe ser 90% HR — P280 p.8.4"} },
    { id:"fe_tpo",  type:"num", label:"Tiempo fermentado", unit:"min", ref:"PCC",
      al:{exact:60,msg:"Debe ser 60 min — P280 p.8.3"} },
    { id:"fe_ent",  type:"ti",  label:"Hora ingreso carro", ref:"PC" },
    { id:"fe_sal",  type:"ti",  label:"Hora salida carro",  ref:"PC" },
    { id:"fe_ck", type:"ck", label:"Verificación fermentado (P280 p.8)", items:[
      "Carro ingresó por puerta próxima al montacargas",
      "N° de carro y tipo de medialuna registrados en planilla",
      "Hora de ingreso y salida registradas"
    ]},
    { id:"fe_ob",   type:"ob",  label:"Observaciones / desvíos" }
  ]},
  { id:"abat", label:"Abatidor", fields:[
    { id:"ab_carga", type:"ck", label:"Verificación de carga (P280 p.9.1)", items:[
      "Abatidor con capacidad mínima: 8 carros simples o 4 carros dobles",
      "Capacidad máxima no superada: 10 carros simples / 5 carros dobles"
    ]},
    { id:"ab_temp",  type:"num", label:"T° abatidor seteada",    unit:"°C",  ref:"PCC",
      al:{min:-26,max:-22,msg:"Debe ser -24°C ±2°C — P280 p.9.3"} },
    { id:"ab_tpo",   type:"num", label:"Tiempo de abatido",      unit:"min", ref:"PCC",
      al:{msg:"Aproximadamente 60 min — P280 p.9.3"} },
    { id:"ab_tsalida",type:"num",label:"T° medialunas al salir", unit:"°C",  ref:"PCC",
      al:{maxOnly:-12,msg:"Debe ser ≤ -12°C antes de pasar a envasado — P280 p.9.4"} },
    { id:"ab_ob",    type:"ob",  label:"Observaciones / desvíos" }
  ]},
  { id:"env", label:"Envasado", fields:[
    { id:"e_ck1", type:"ck", label:"Verificación de envasado (P280 p.10)", items:[
      "Cajón: 1 bolsa + 4 bandejas + 12 medialunas sueltas = 180 unidades",
      "Etiqueta con fecha, tipo de medialuna y LOTE visible colocada en nudo",
      "Pallet de 32 cajones ingresado a cámara final",
      "Cadena de frío no interrumpida durante envasado",
      "Etiquetas en cajón — no en pared de cámara"
    ]},
    { id:"e_tcam", type:"num", label:"T° cámara final", unit:"°C", ref:"PCC",
      al:{maxOnly:-17,msg:"Debe ser ≤ -17°C — P280 p.10.5"} },
    { id:"e_ob",   type:"ob",  label:"Observaciones / desvíos" }
  ]}
];

const DIAS   = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
const TURNOS = ["TM","TT","TN"];
const MESES  = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const YEARS  = [2026,2027];
const ALL_MONTHS = YEARS.flatMap(y=>MESES.map((m,i)=>({label:`${m} ${y}`,id:`${m.toLowerCase()}_${y}`,year:y,monthIdx:i})));

function emptyRecorrida(turno,responsable){
  const now=new Date();
  return { id:`rec_${Date.now()}`,turno,responsable,lote:"",tipo:"m",
    hora:now.toTimeString().slice(0,5),fecha:now.toLocaleDateString("es-AR"),
    timestamp:now.toISOString(),datos:{},alertas:{},completado:false };
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

// ─── STYLES ──────────────────────────────────────────────────────────────────
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
  function handleLogin(){
    if(!nombre.trim()) return;
    if(rol===ROLES.CALIDAD&&pin!==PIN_CALIDAD){ alert("PIN incorrecto"); return; }
    onLogin({rol,nombre:nombre.trim(),turno:rol===ROLES.OPERARIO?turno:"CALIDAD"});
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
          <input type="text" value={nombre} onChange={e=>setNombre(e.target.value)} placeholder="Ej: Juan García" style={S.inp(false)}/>
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
            <input type="password" value={pin} onChange={e=>setPin(e.target.value)} placeholder="••••" style={S.inp(false)}/>
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
  const {datos,alertas}=recorrida;
  const sec=SECTORES[cur];
  const prog=Math.round((cur/(SECTORES.length-1))*100);

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

  function renderField(f){
    const val=datos[f.id]??""; const err=!!alertas[f.id];
    if(f.type==="num"||f.type==="ti") return(
      <div key={f.id} style={{marginBottom:10}}>
        <div style={{fontSize:12,color:"#64748b",marginBottom:3,display:"flex",alignItems:"center",gap:5}}>
          {f.label}{f.ref==="PCC"?<span style={S.bpcc}>PCC</span>:f.ref?<span style={S.bpc}>PC</span>:null}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <input type={f.type==="ti"?"time":"number"} value={val} onChange={e=>handleNum(f,e.target.value)}
            readOnly={readonly} style={{...S.inp(err),flex:1,background:readonly?"#f8fafc":"#fff"}}/>
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
              style={{flex:1,...S.btnSm(val===op),fontSize:12}}>
              {op}
            </button>
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
        <div style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#64748b",background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:"7px 10px"}}>
          🕐 {recorrida.hora} · {recorrida.responsable}
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
      </div>
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
    const ref=doc(db,path);
    const unsub=onSnapshot(ref,snap=>{
      if(snap.exists()) setRegistros(snap.data().registros||{});
      else setRegistros({});
      setLoading(false);
    });
    return()=>unsub();
  },[path]);

  async function saveToFirebase(newReg){
    if(!firebaseOk) return;
    setSaveStatus("saving");
    try{
      await setDoc(doc(db,path),{registros:newReg},{merge:true});
      setSaveStatus("saved");
      setTimeout(()=>setSaveStatus("idle"),2000);
    }catch(e){setSaveStatus("error");}
  }

  function debouncedSave(newReg){
    if(saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(()=>saveToFirebase(newReg),1000);
  }

  function addRecorrida(){
    const newRec=emptyRecorrida(turnoActivo,usuario.nombre);
    const tRecs=registros[turnoActivo]?[...registros[turnoActivo],newRec]:[newRec];
    const newRegistros={...registros,[turnoActivo]:tRecs};
    setRegistros(newRegistros);
    setRecActiva({turno:turnoActivo,idx:tRecs.length-1});
    debouncedSave(newRegistros);
  }

  function updateRecorrida(turno,idx,newRec){
    const tRecs=[...(registros[turno]||[])];
    tRecs[idx]=newRec;
    const newRegistros={...registros,[turno]:tRecs};
    setRegistros(newRegistros);
    debouncedSave(newRegistros);
  }

  const allAlertas=[];
  Object.entries(registros).forEach(([turno,recs])=>{
    recs.forEach((r,i)=>{
      SECTORES.forEach(s=>s.fields.forEach(f=>{
        if(r.alertas[f.id]) allAlertas.push({turno,rec:i+1,sec:s.label,campo:f.label,msg:f.al?.msg||""});
      }));
    });
  });

  if(loading) return <div style={{padding:20,textAlign:"center",color:"#64748b"}}>Cargando registros...</div>;

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
        <RecorridaForm recorrida={rec} onChange={newRec=>updateRecorrida(recActiva.turno,recActiva.idx,newRec)} readonly={!isOwn}/>
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
              {t}<span style={{display:"block",fontSize:9,marginTop:1}}>{recs.length>0?`${recs.length} rec${alrts>0?` · ${alrts}⚠`:""}` :"—"}</span>
            </button>
          );
        })}
      </div>
      <div style={{marginBottom:12}}>
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
              <div key={i} onClick={()=>setRecActiva({turno:turnoActivo,idx:i})}
                style={{...S.card,cursor:"pointer",padding:"10px 12px",borderColor:als>0?"#F09595":"#5DCAA5",marginBottom:6}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                  <div style={{fontSize:13,fontWeight:500}}>Recorrida {i+1}</div>
                  {als>0?<span style={S.ber}>{als} alerta{als>1?"s":""}</span>:<span style={S.bok}>✓ Sin alertas</span>}
                </div>
                <div style={{fontSize:11,color:"#64748b"}}>
                  🕐 {rec.hora} · 👤 {rec.responsable}
                  {rec.lote&&<span> · Lote: {rec.lote}</span>}
                  <span> · {rec.tipo==="m"?"Manteca":"Grasa"}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
      {usuario.rol===ROLES.CALIDAD&&allAlertas.length>0&&(
        <div style={S.card}>
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

// ─── WEEK / MONTH VIEWS ───────────────────────────────────────────────────────
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

function MonthView({monthLabel,onWeekSelect}){
  return(
    <div>
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
      {/* HEADER */}
      <div style={{padding:"1rem 1rem .75rem",borderBottom:"1px solid #e2e8f0",background:"#fff",marginBottom:8}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <div>
            <div style={{fontSize:15,fontWeight:500}}>🥐 Control de Proceso</div>
            <div style={{fontSize:11,color:"#64748b"}}>{usuario.nombre} · {usuario.turno} · {usuario.rol==="calidad"?"👁 Calidad":"👷 Operario"}</div>
          </div>
          <button onClick={()=>setUsuario(null)} style={{fontSize:11,border:"1px solid #e2e8f0",borderRadius:6,padding:"4px 8px",background:"#f8fafc",cursor:"pointer",color:"#64748b"}}>Salir</button>
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
          <MonthView monthLabel={selectedMonth.label} onWeekSelect={i=>{setWeekIdx(i);setNav("week");}}/>
        ):nav==="week"?(
          <WeekView monthId={selectedMonth.id} weekIdx={weekIdx} weekLabel={`Semana ${weekIdx+1}`} usuario={usuario}
            onDaySelect={i=>{setDayIdx(i);setNav("day");}} onBack={()=>setNav("month")}/>


        ):(
          <DayView monthId={selectedMonth.id} weekIdx={weekIdx} dayIdx={dayIdx}
            usuario={usuario} onBack={()=>setNav("week")}/>
        )}
      </div>
    </div>
  );
}

// ─── WEEKLY SUMMARY COMPONENT ─────────────────────────────────────────────────
// Este componente se agrega al WeekView para mostrar alertas + observaciones
// con ranking y lista por turno. Solo calidad ve todos los turnos.

function ResumenSemanal({ monthId, weekIdx, usuario }) {
  const [diasData, setDiasData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseOk) { setLoading(false); return; }
    // Cargar los 7 días de la semana
    const promises = DIAS.map((_, di) => {
      const ref = doc(db, dayPath(monthId, weekIdx, di));
      return getDoc(ref).then(snap => ({ di, data: snap.exists() ? snap.data() : null }));
    });
    Promise.all(promises).then(results => {
      const data = {};
      results.forEach(({ di, data: d }) => { if (d) data[di] = d; });
      setDiasData(data);
      setLoading(false);
    });
  }, [monthId, weekIdx]);

  if (loading) return <div style={{ padding: 20, textAlign: "center", color: "#64748b" }}>Cargando resumen...</div>;

  // ── Recopilar alertas y observaciones ──
  const alertaConteo = {}; // { "Sector — Campo": count }
  const alertasPorTurno = { TM: [], TT: [], TN: [] };
  const obsPorTurno = { TM: [], TT: [], TN: [] };

  Object.entries(diasData).forEach(([diIdx, dayData]) => {
    const registros = dayData.registros || {};
    TURNOS.forEach(turno => {
      if (usuario.rol !== ROLES.CALIDAD && usuario.turno !== turno) return;
      const recs = registros[turno] || [];
      recs.forEach((rec, ri) => {
        // Alertas automáticas
        SECTORES.forEach(s => s.fields.forEach(f => {
          if (rec.alertas[f.id]) {
            const key = `${s.label} — ${f.label}`;
            alertaConteo[key] = (alertaConteo[key] || 0) + 1;
            alertasPorTurno[turno].push({
              dia: DIAS[diIdx],
              rec: ri + 1,
              sector: s.label,
              campo: f.label,
              msg: f.al?.msg || "",
              valor: rec.datos[f.id] || "",
              responsable: rec.responsable,
              hora: rec.hora,
            });
          }
        }));
        // Observaciones escritas
        SECTORES.forEach(s => s.fields.forEach(f => {
          if (f.type === "ob" && rec.datos[f.id] && rec.datos[f.id].trim()) {
            obsPorTurno[turno].push({
              dia: DIAS[diIdx],
              rec: ri + 1,
              sector: s.label,
              texto: rec.datos[f.id].trim(),
              responsable: rec.responsable,
              hora: rec.hora,
            });
          }
        }));
      });
    });
  });

  // ── Ranking de alertas (ordenado por frecuencia) ──
  const ranking = Object.entries(alertaConteo)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, count }));

  const totalAlertas = ranking.reduce((s, r) => s + r.count, 0);
  const totalObs = Object.values(obsPorTurno).flat().length;

  // ── Exportar TXT ──
  function exportarResumen() {
    let t = `RESUMEN SEMANAL — SEMANA ${weekIdx + 1}\n`;
    t += `Mes: ${monthId} | Generado: ${new Date().toLocaleDateString("es-AR")}\n`;
    t += `${"=".repeat(55)}\n\n`;
    t += `TOTALES: ${totalAlertas} alertas | ${totalObs} observaciones\n\n`;

    // Ranking
    t += `${"─".repeat(40)}\nRANKING DE ALERTAS (más frecuentes primero)\n${"─".repeat(40)}\n`;
    if (ranking.length === 0) {
      t += "Sin alertas registradas esta semana.\n";
    } else {
      ranking.forEach((r, i) => { t += `${i + 1}. ${r.key}: ${r.count} vez${r.count > 1 ? "es" : ""}\n`; });
    }
    t += "\n";

    // Por turno
    TURNOS.forEach(turno => {
      if (usuario.rol !== ROLES.CALIDAD && usuario.turno !== turno) return;
      t += `${"─".repeat(40)}\nTURNO ${turno}\n${"─".repeat(40)}\n`;
      const als = alertasPorTurno[turno];
      const obs = obsPorTurno[turno];
      if (als.length === 0 && obs.length === 0) {
        t += "Sin desvíos ni observaciones.\n\n";
        return;
      }
      if (als.length > 0) {
        t += `\nALERTAS (${als.length}):\n`;
        als.forEach((a, i) => {
          t += `  ${i + 1}. [${a.dia} · Rec.${a.rec} · ${a.hora}] ${a.sector} — ${a.campo}`;
          if (a.valor) t += ` (valor: ${a.valor})`;
          t += ` · ${a.responsable}\n`;
          if (a.msg) t += `     → ${a.msg}\n`;
        });
      }
      if (obs.length > 0) {
        t += `\nOBSERVACIONES (${obs.length}):\n`;
        obs.forEach((o, i) => {
          t += `  ${i + 1}. [${o.dia} · Rec.${o.rec} · ${o.hora}] ${o.sector} · ${o.responsable}\n`;
          t += `     "${o.texto}"\n`;
        });
      }
      t += "\n";
    });

    const b = new Blob([t], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = `resumen_semana${weekIdx + 1}_${monthId}.txt`;
    a.click();
  }

  const turnosVisibles = TURNOS.filter(t => usuario.rol === ROLES.CALIDAD || usuario.turno === t);

  return (
    <div style={{ marginTop: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>Resumen — Semana {weekIdx + 1}</div>
        <button onClick={exportarResumen}
          style={{ ...S.btn(false, false), padding: "6px 12px", fontSize: 12 }}>
          ↓ Exportar .txt
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
        {[
          ["Alertas", totalAlertas, totalAlertas > 0 ? "#FCEBEB" : "#E1F5EE", totalAlertas > 0 ? "#A32D2D" : "#085041"],
          ["Observaciones", totalObs, totalObs > 0 ? "#FAEEDA" : "#E1F5EE", totalObs > 0 ? "#633806" : "#085041"],
          ["Desvíos únicos", ranking.length, ranking.length > 0 ? "#FCEBEB" : "#E1F5EE", ranking.length > 0 ? "#A32D2D" : "#085041"],
        ].map(([label, val, bg, color]) => (
          <div key={label} style={{ background: bg, borderRadius: 8, padding: "10px 6px", textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 500, color }}>{val}</div>
            <div style={{ fontSize: 10, color, marginTop: 2, lineHeight: 1.3 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Ranking */}
      {ranking.length > 0 && (
        <div style={{ ...S.card, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>
            🏆 Ranking — alertas más frecuentes
          </div>
          {ranking.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 500,
                background: i === 0 ? "#FFA000" : i === 1 ? "#9E9E9E" : i === 2 ? "#795548" : "#e2e8f0",
                color: i < 3 ? "#fff" : "#64748b" }}>
                {i + 1}
              </div>
              <div style={{ flex: 1, fontSize: 12, color: "#1e293b" }}>{r.key}</div>
              <div style={{ fontSize: 12, fontWeight: 500, background: "#FCEBEB", color: "#A32D2D", borderRadius: 4, padding: "2px 8px" }}>
                {r.count}x
              </div>
              {/* Barra proporcional */}
              <div style={{ width: 60, height: 6, background: "#f1f5f9", borderRadius: 3 }}>
                <div style={{ height: 6, borderRadius: 3, background: "#E24B4A", width: `${Math.round((r.count / ranking[0].count) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Por turno */}
      {turnosVisibles.map(turno => {
        const als = alertasPorTurno[turno];
        const obs = obsPorTurno[turno];
        if (als.length === 0 && obs.length === 0) return (
          <div key={turno} style={{ ...S.card, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Turno {turno}</div>
              <span style={S.bok}>✓ Sin desvíos</span>
            </div>
          </div>
        );
        return (
          <div key={turno} style={{ ...S.card, marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>
              Turno {turno}
              <span style={{ fontSize: 11, fontWeight: 400, color: "#64748b", marginLeft: 8 }}>
                {als.length} alerta{als.length !== 1 ? "s" : ""} · {obs.length} observación{obs.length !== 1 ? "es" : ""}
              </span>
            </div>

            {als.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 500, color: "#A32D2D", marginBottom: 6 }}>⚠ Alertas</div>
                {als.map((a, i) => (
                  <div key={i} style={{ background: "#FCEBEB", border: "1px solid #F09595", borderRadius: 6, padding: "7px 10px", marginBottom: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "#A32D2D" }}>{a.sector} — {a.campo}</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                      {a.dia} · Rec.{a.rec} · {a.hora} · {a.responsable}
                      {a.valor && <span> · Valor registrado: <strong>{a.valor}</strong></span>}
                    </div>
                    {a.msg && <div style={{ fontSize: 11, color: "#A32D2D", marginTop: 2 }}>→ {a.msg}</div>}
                  </div>
                ))}
              </>
            )}

            {obs.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 500, color: "#633806", marginBottom: 6, marginTop: als.length > 0 ? 10 : 0 }}>📝 Observaciones</div>
                {obs.map((o, i) => (
                  <div key={i} style={{ background: "#FAEEDA", border: "1px solid #f9c74f", borderRadius: 6, padding: "7px 10px", marginBottom: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "#633806" }}>{o.sector}</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                      {o.dia} · Rec.{o.rec} · {o.hora} · {o.responsable}
                    </div>
                    <div style={{ fontSize: 12, color: "#1e293b", marginTop: 4, fontStyle: "italic" }}>"{o.texto}"</div>
                  </div>
                ))}
              </>
            )}
          </div>
        );
      })}

      {totalAlertas === 0 && totalObs === 0 && (
        <div style={{ textAlign: "center", padding: "30px 20px", background: "#E1F5EE", border: "1px solid #5DCAA5", borderRadius: 10, color: "#085041" }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>✓</div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>Semana sin desvíos ni observaciones</div>
        </div>
      )}
    </div>
  );
}
