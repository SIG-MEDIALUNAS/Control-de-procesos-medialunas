"use client";
import { useState, useEffect, useRef } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, addDoc, query, orderBy } from "firebase/firestore";

// ─── FIREBASE CONFIG ──────────────────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let db = null;
let firebaseOk = false;
try {
  const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
  db = getFirestore(app);
  firebaseOk = true;
} catch(e) {
  console.warn("Firebase no inicializado", e);
}

// ─── ROLES ────────────────────────────────────────────────────────────────────
const ROLES = { CALIDAD: "calidad", OPERARIO: "operario" };

// ─── DATA ─────────────────────────────────────────────────────────────────────
const SECTORES = [
  { id:"frac", label:"Fraccionado", fields:[
    { id:"f_ck", type:"ck", label:"Verificación de ingredientes", items:[
      "Ingredientes fraccionados según receta vigente",
      "Fracciones rotuladas con fecha de elaboración",
      "Aditivos almacenados en cámara tras fraccionado",
      "Checklist de carga completo antes de iniciar amasado"
    ]},
    { id:"f_ob", type:"ob", label:"Observaciones" }
  ]},
  { id:"amas", label:"Amasado", fields:[
    { id:"a_tamb",  type:"num", label:"T° ambiente",            unit:"°C",  ref:"PC" },
    { id:"a_tagua", type:"num", label:"T° del agua",             unit:"°C",  ref:"PC" },
    { id:"a_agua",  type:"num", label:"Agua manual cargada",     unit:"kg",  ref:"PC",  al:{min:20,max:26,msg:"Verificar ajuste por condición ambiental"} },
    { id:"a_hielo", type:"num", label:"Hielo cargado",           unit:"kg",  ref:"PC" },
    { id:"a_tmasa", type:"num", label:"T° masa final",           unit:"°C",  ref:"PCC", al:{maxOnly:20,msg:"Masa >20°C — retener y evaluar (P276 p.3.7)"} },
    { id:"a_tpo",   type:"num", label:"Tiempo total de amasado", unit:"min", ref:"PC",  al:{exact:25,msg:"Tiempo fuera del estándar (debe ser 25 min)"} },
    { id:"a_frac",  type:"num", label:"Peso fracción de masa",   unit:"kg",  ref:"PCC", al:{exact:8,msg:"Debe ser 8 kg — desvío de fraccionado (P276 p.3.8)"} },
    { id:"a_tcam",  type:"num", label:"T° cámara de masas",      unit:"°C",  ref:"PCC", al:{min:6,max:10,msg:"T° fuera del rango establecido (6°C a 10°C)"} },
    { id:"a_ck", type:"ck", label:"Verificación de procedimiento", items:[
      "Orden de ingredientes respetado (harina+aditivos, luego agua+hielo)",
      "Velocidad lenta 3 min antes de velocidad rápida",
      "Grasa/manteca agregada a los 10 min del amasado rápido",
      "Sal agregada a los 14 min del amasado rápido",
      "Masa retirada y prensada con papel manteca como separador"
    ]},
    { id:"a_ob", type:"ob", label:"Observaciones / desvíos" }
  ]},
  { id:"lam", label:"Laminado", fields:[
    { id:"l_ck1", type:"ck", label:"Laminado manual y empaste", items:[
      "Bastones retirados de cámara al inicio del turno",
      "Empaste cubre ancho y largo de mitad del bastón",
      "3 vueltas simples realizadas (calibres 39→12 en cada vuelta)",
      "Masa emponchada y guardada en cámara 3 entre vueltas",
      "Masa descansó en cámara antes de laminadora automática"
    ]},
    { id:"l_ck2", type:"ck", label:"Laminadora automática", items:[
      "Programa MANTEV seleccionado",
      "Harinador activado durante espolvoreo",
      "Ancho de masa controlado al tamaño del rodillo",
      "Rodillo colocado a la derecha para enrollado automático"
    ]},
    { id:"l_ob", type:"ob", label:"Observaciones / desvíos" }
  ]},
  { id:"med", label:"Medialunera", fields:[
    { id:"m_rec", type:"ck", label:"Recursos en línea", items:[
      "Maquinista presente en línea",
      "N° de identificación colocado en operarias",
      "N° de carro registrado en planilla"
    ]},
    { id:"m_espe", type:"num", label:"Espesor calibrado",        unit:"(15–20)", ref:"PC",  al:{min:15,max:20,msg:"Espesor fuera del rango 15–20"} },
    { id:"m_peso", type:"num", label:"Peso triángulo (muestra)", unit:"g",       ref:"PCC", al:{msg:"Manteca: 60±2 g | Grasa: 50±2 g"} },
    { id:"m_ck2", type:"ck", label:"Gestión de recupero", items:[
      "Recupero ingresado a cámara (no a T° ambiente)",
      "Recupero representa ≤10% del amasijo",
      "Recupero del turno anterior ya procesado"
    ]},
    { id:"m_ck3", type:"ck", label:"Estiba y bandejas", items:[
      "Bandejas limpias y sin moho en uso",
      "Papel manteca colocado en bandeja",
      "Distribución correcta (grasa: 6×6=36 u / manteca: 7×6=42 u)",
      "Punta central hacia abajo (evita apertura en fermentado)",
      "Poncho colocado al completar el carro"
    ]},
    { id:"m_ob", type:"ob", label:"Observaciones / desvíos" }
  ]},
  { id:"ferm", label:"Fermentado", fields:[
    { id:"fe_temp", type:"num", label:"T° fermentador",    unit:"°C",  ref:"PCC", al:{min:28,max:33,msg:"Rango: 28°C (verano) / 33°C (invierno)"} },
    { id:"fe_hr",   type:"num", label:"Humedad relativa",  unit:"%",   ref:"PCC", al:{exact:90,msg:"Debe ser 90% HR"} },
    { id:"fe_tpo",  type:"num", label:"Tiempo fermentado", unit:"min", ref:"PCC", al:{exact:60,msg:"Debe ser 60 min (P275/P276 p.7.3)"} },
    { id:"fe_ent",  type:"ti",  label:"Hora ingreso carro", ref:"PC" },
    { id:"fe_sal",  type:"ti",  label:"Hora salida carro",  ref:"PC" },
    { id:"fe_ob",   type:"ob",  label:"Observaciones / desvíos" }
  ]},
  { id:"abat", label:"Abatido", fields:[
    { id:"ab_temp", type:"num", label:"T° abatidor",    unit:"°C",  ref:"PCC", al:{min:-20,max:-16,msg:"Rango: −16°C a −20°C (P275/P276 p.8.2)"} },
    { id:"ab_tpo",  type:"num", label:"Tiempo abatido", unit:"min", ref:"PCC", al:{msg:"Confirmar tiempo con procedimiento vigente"} },
    { id:"ab_ob",   type:"ob",  label:"Observaciones / desvíos" }
  ]},
  { id:"env", label:"Envasado", fields:[
    { id:"e_ck1", type:"ck", label:"Verificación de envasado", items:[
      "Cajón: bolsa + 4 bandejas + 12 sueltas = 180 unidades",
      "Etiqueta con fecha y tipo en nudo de bolsa",
      "Cada 6 cajones a cámara final (cadena de frío)",
      "Etiquetas en cajón — no en pared de cámara"
    ]},
    { id:"e_tcam", type:"num", label:"T° cámara final", unit:"°C", ref:"PCC", al:{maxOnly:-17,msg:"Debe ser ≤ −17°C (P275/P276 p.9.5)"} },
    { id:"e_ob",   type:"ob",  label:"Observaciones / desvíos" }
  ]}
];

const DIAS    = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
const TURNOS  = ["TM","TT","TN"];
const MESES   = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const YEARS   = [2026, 2027];

// Generate all months for all years
const ALL_MONTHS = YEARS.flatMap(y => MESES.map((m,i) => ({ label:`${m} ${y}`, id:`${m.toLowerCase()}_${y}`, year:y, monthIdx:i })));

function emptyRecorrida(turno, responsable) {
  const now = new Date();
  return {
    id: `rec_${Date.now()}`,
    turno,
    responsable,
    lote: "",
    tipo: "m",
    hora: now.toTimeString().slice(0,5),
    fecha: now.toLocaleDateString("es-AR"),
    timestamp: now.toISOString(),
    datos: {},
    alertas: {},
    completado: false,
  };
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

function countAlertasRec(rec) {
  let c=0;
  SECTORES.forEach(s=>s.fields.forEach(f=>{ if(rec.alertas[f.id]) c++; }));
  return c;
}

// Firestore helpers
function dayPath(monthId, weekIdx, dayIdx) {
  return `meses/${monthId}/semanas/semana_${weekIdx+1}/dias/dia_${dayIdx}`;
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const S = {
  inp:(e)=>({width:"100%",fontSize:13,padding:"7px 10px",border:`1px solid ${e?"#E24B4A":"#cbd5e1"}`,borderRadius:8,background:e?"#FCEBEB":"#fff",boxSizing:"border-box",color:"#1e293b"}),
  bpcc:{fontSize:10,background:"#FCEBEB",color:"#A32D2D",border:"1px solid #F09595",borderRadius:3,padding:"1px 5px",fontWeight:600},
  bpc: {fontSize:10,background:"#E6F1FB",color:"#185FA5",border:"1px solid #85B7EB",borderRadius:3,padding:"1px 5px"},
  bok: {fontSize:11,background:"#E1F5EE",color:"#085041",borderRadius:3,padding:"2px 6px",fontWeight:500},
  ber: {fontSize:11,background:"#FCEBEB",color:"#A32D2D",borderRadius:3,padding:"2px 6px",fontWeight:500},
  card:{border:"1px solid #e2e8f0",borderRadius:10,padding:"1rem",background:"#fff",marginBottom:8},
  btn:(p,d)=>({padding:"8px 14px",fontSize:12,border:`1px solid ${p?"#185FA5":"#cbd5e1"}`,borderRadius:8,background:p?"#185FA5":"#f8fafc",color:p?"#E6F1FB":"#1e293b",cursor:d?"default":"pointer",opacity:d?.4:1,fontWeight:p?500:400}),
  btnSm:(p)=>({padding:"5px 10px",fontSize:11,border:`1px solid ${p?"#185FA5":"#e2e8f0"}`,borderRadius:6,background:p?"#185FA5":"#f8fafc",color:p?"#E6F1FB":"#64748b",cursor:"pointer",fontWeight:p?500:400}),
};

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [rol, setRol] = useState(ROLES.OPERARIO);
  const [nombre, setNombre] = useState("");
  const [turno, setTurno] = useState("TM");
  const [pin, setPin] = useState("");
  const PIN_CALIDAD = "1234"; // cambiar según necesidad

  function handleLogin() {
    if (!nombre.trim()) return;
    if (rol === ROLES.CALIDAD && pin !== PIN_CALIDAD) {
      alert("PIN de calidad incorrecto");
      return;
    }
    onLogin({ rol, nombre: nombre.trim(), turno: rol === ROLES.OPERARIO ? turno : "CALIDAD" });
  }

  return (
    <div style={{minHeight:"100vh",background:"#f8fafc",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{width:"100%",maxWidth:380,background:"#fff",border:"1px solid #e2e8f0",borderRadius:16,padding:"1.5rem"}}>
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:28,marginBottom:6}}>🥐</div>
          <div style={{fontSize:16,fontWeight:500}}>Control de Proceso</div>
          <div style={{fontSize:12,color:"#64748b"}}>Medialunas — SIG</div>
        </div>

        <div style={{marginBottom:12}}>
          <div style={{fontSize:12,color:"#64748b",marginBottom:5}}>Ingresar como</div>
          <div style={{display:"flex",gap:8}}>
            {[ROLES.OPERARIO, ROLES.CALIDAD].map(r=>(
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

        {rol === ROLES.OPERARIO && (
          <div style={{marginBottom:12}}>
            <div style={{fontSize:12,color:"#64748b",marginBottom:4}}>Turno asignado</div>
            <div style={{display:"flex",gap:6}}>
              {TURNOS.map(t=>(
                <button key={t} onClick={()=>setTurno(t)}
                  style={{flex:1,...S.btnSm(turno===t)}}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {rol === ROLES.CALIDAD && (
          <div style={{marginBottom:12}}>
            <div style={{fontSize:12,color:"#64748b",marginBottom:4}}>PIN de Calidad</div>
            <input type="password" value={pin} onChange={e=>setPin(e.target.value)}
              placeholder="••••" style={S.inp(false)}/>
          </div>
        )}

        <button onClick={handleLogin} disabled={!nombre.trim()}
          style={{...S.btn(true, !nombre.trim()),width:"100%",padding:"10px",fontSize:14,marginTop:8}}>
          Ingresar →
        </button>
      </div>
    </div>
  );
}

// ─── RECORRIDA FORM ───────────────────────────────────────────────────────────
function RecorridaForm({ recorrida, onChange, readonly }) {
  const [cur, setCur] = useState(0);
  const { datos, alertas } = recorrida;
  const sec = SECTORES[cur];
  const prog = Math.round((cur / (SECTORES.length-1)) * 100);

  function handleNum(f, val) {
    if (readonly) return;
    onChange({ ...recorrida, datos:{...datos,[f.id]:val}, alertas:{...alertas,[f.id]:hasAlerta(f,val)} });
  }
  function toggleCk(fid, ix, len) {
    if (readonly) return;
    const arr = datos[fid] ? [...datos[fid]] : Array(len).fill(false);
    arr[ix] = !arr[ix];
    onChange({ ...recorrida, datos:{...datos,[fid]:arr} });
  }
  function setOb(id, val) {
    if (readonly) return;
    onChange({ ...recorrida, datos:{...datos,[id]:val} });
  }

  function renderField(f) {
    const val = datos[f.id] ?? "";
    const err = !!alertas[f.id];
    if (f.type==="num"||f.type==="ti") return (
      <div key={f.id} style={{marginBottom:10}}>
        <div style={{fontSize:12,color:"#64748b",marginBottom:3,display:"flex",alignItems:"center",gap:5}}>
          {f.label}
          {f.ref==="PCC"?<span style={S.bpcc}>PCC</span>:f.ref?<span style={S.bpc}>PC</span>:null}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <input type={f.type==="ti"?"time":"number"} value={val}
            onChange={e=>handleNum(f,e.target.value)}
            readOnly={readonly}
            style={{...S.inp(err),flex:1,background:readonly?"#f8fafc":"#fff"}}/>
          {f.unit&&<span style={{fontSize:12,color:"#94a3b8",whiteSpace:"nowrap"}}>{f.unit}</span>}
        </div>
        {err&&f.al?.msg&&<div style={{fontSize:11,color:"#A32D2D",marginTop:3}}>⚠ {f.al.msg}</div>}
      </div>
    );
    if (f.type==="ck") {
      const arr = val||Array(f.items.length).fill(false);
      return (
        <div key={f.id} style={{marginBottom:10}}>
          <div style={{fontSize:12,color:"#64748b",marginBottom:5}}>{f.label}</div>
          {f.items.map((item,ix)=>(
            <div key={ix} onClick={()=>toggleCk(f.id,ix,f.items.length)}
              style={{display:"flex",alignItems:"flex-start",gap:8,padding:"7px 9px",
                border:`1px solid ${arr[ix]?"#5DCAA5":"#cbd5e1"}`,borderRadius:8,marginBottom:4,
                cursor:readonly?"default":"pointer",background:arr[ix]?"#E1F5EE":"#fff",opacity:readonly?.7:1}}>
              <input type="checkbox" checked={!!arr[ix]} onChange={()=>{}} style={{marginTop:1}}/>
              <span style={{fontSize:13,color:arr[ix]?"#085041":"#1e293b",lineHeight:1.4}}>{item}</span>
            </div>
          ))}
        </div>
      );
    }
    if (f.type==="ob") return (
      <div key={f.id} style={{marginBottom:10}}>
        <div style={{fontSize:12,color:"#64748b",marginBottom:3}}>{f.label}</div>
        <textarea value={val} onChange={e=>setOb(f.id,e.target.value)}
          readOnly={readonly} placeholder="Sin novedad / describir desvío..."
          style={{...S.inp(false),height:52,resize:"none",background:readonly?"#f8fafc":"#fff"}}/>
      </div>
    );
    return null;
  }

  return (
    <div>
      {/* Meta row */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
        <input type="text" placeholder="N° de lote" value={recorrida.lote}
          onChange={e=>!readonly&&onChange({...recorrida,lote:e.target.value})}
          readOnly={readonly} style={{...S.inp(false),background:readonly?"#f8fafc":"#fff"}}/>
        <div style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#64748b",background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:"7px 10px"}}>
          🕐 {recorrida.hora} — {recorrida.responsable}
        </div>
      </div>

      {/* Tipo */}
      {!readonly && (
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

      {/* Progress */}
      <div style={{height:3,background:"#e2e8f0",borderRadius:2,marginBottom:6}}>
        <div style={{height:3,width:`${prog}%`,background:"#1D9E75",borderRadius:2,transition:"width .3s"}}/>
      </div>

      {/* Sector tabs */}
      <div style={{display:"flex",overflowX:"auto",gap:3,scrollbarWidth:"none",marginBottom:0}}>
        {SECTORES.map((s,i)=>{
          const alrt=s.fields.some(f=>alertas[f.id]);
          return (
            <button key={s.id} onClick={()=>setCur(i)}
              style={{whiteSpace:"nowrap",padding:"4px 8px",fontSize:11,
                border:`1px solid ${i===cur?"#94a3b8":"#e2e8f0"}`,borderBottom:"none",
                borderRadius:"4px 4px 0 0",cursor:"pointer",
                background:i===cur?"#fff":"#f8fafc",
                color:i===cur?"#1e293b":"#64748b",fontWeight:i===cur?500:400}}>
              <span style={{display:"inline-block",width:5,height:5,borderRadius:"50%",marginRight:3,verticalAlign:"middle",
                background:alrt?"#E24B4A":"#cbd5e1"}}/>
              {s.label}
            </button>
          );
        })}
      </div>
      <div style={{border:"1px solid #94a3b8",borderRadius:"0 8px 8px 8px",padding:"1rem",background:"#fff",marginBottom:8}}>
        <div style={{fontSize:14,fontWeight:500,marginBottom:10}}>{sec.label}</div>
        {sec.fields.map(f=>renderField(f))}
      </div>

      {/* Nav */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <button onClick={()=>setCur(c=>Math.max(0,c-1))} disabled={cur===0} style={S.btn(false,cur===0)}>← Anterior</button>
        <span style={{fontSize:11,color:"#94a3b8"}}>{cur+1}/{SECTORES.length}</span>
        <button onClick={()=>setCur(c=>Math.min(SECTORES.length-1,c+1))} disabled={cur===SECTORES.length-1} style={S.btn(true,cur===SECTORES.length-1)}>Siguiente →</button>
      </div>
    </div>
  );
}

// ─── DAY VIEW ─────────────────────────────────────────────────────────────────
function DayView({ monthId, weekIdx, dayIdx, usuario, onBack }) {
  const [registros, setRegistros] = useState({}); // { TM: [rec1, rec2], TT: [...], TN: [...] }
  const [turnoActivo, setTurnoActivo] = useState(usuario.turno === "CALIDAD" ? "TM" : usuario.turno);
  const [recActiva, setRecActiva] = useState(null); // { turno, idx }
  const [saveStatus, setSaveStatus] = useState("idle");
  const [loading, setLoading] = useState(true);
  const saveTimer = useRef(null);

  const path = dayPath(monthId, weekIdx, dayIdx);

  // Load from Firebase
  useEffect(()=>{
    if (!firebaseOk) { setLoading(false); return; }
    const ref = doc(db, path);
    const unsub = onSnapshot(ref, snap=>{
      if (snap.exists()) {
        setRegistros(snap.data().registros || {});
      } else {
        setRegistros({});
      }
      setLoading(false);
    });
    return ()=>unsub();
  },[path]);

  async function saveToFirebase(newRegistros) {
    if (!firebaseOk) return;
    setSaveStatus("saving");
    try {
      await setDoc(doc(db, path), { registros: newRegistros }, { merge: true });
      setSaveStatus("saved");
      setTimeout(()=>setSaveStatus("idle"),2000);
    } catch(e) {
      console.error(e);
      setSaveStatus("error");
    }
  }

  function debouncedSave(newRegistros) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(()=>saveToFirebase(newRegistros), 1000);
  }

  function addRecorrida() {
    const turno = turnoActivo;
    const newRec = emptyRecorrida(turno, usuario.nombre);
    const tRecs = registros[turno] ? [...registros[turno], newRec] : [newRec];
    const newRegistros = { ...registros, [turno]: tRecs };
    setRegistros(newRegistros);
    setRecActiva({ turno, idx: tRecs.length - 1 });
    debouncedSave(newRegistros);
  }

  function updateRecorrida(turno, idx, newRec) {
    const tRecs = [...(registros[turno]||[])];
    tRecs[idx] = newRec;
    const newRegistros = { ...registros, [turno]: tRecs };
    setRegistros(newRegistros);
    debouncedSave(newRegistros);
  }

  function getTurnoRecs(turno) { return registros[turno] || []; }

  // All alertas across all turnos
  const allAlertas = [];
  Object.entries(registros).forEach(([turno, recs])=>{
    recs.forEach((r,i)=>{
      SECTORES.forEach(s=>s.fields.forEach(f=>{
        if(r.alertas[f.id]) allAlertas.push({turno,rec:i+1,sec:s.label,campo:f.label,msg:f.al?.msg||""});
      }));
    });
  });

  if (loading) return <div style={{padding:20,textAlign:"center",color:"#64748b"}}>Cargando registros...</div>;

  // If editing a recorrida
  if (recActiva) {
    const rec = (registros[recActiva.turno]||[])[recActiva.idx];
    if (!rec) { setRecActiva(null); return null; }
    const isOwn = usuario.rol === ROLES.CALIDAD || rec.responsable === usuario.nombre;
    const readonly = !isOwn;
    return (
      <div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
          <button onClick={()=>setRecActiva(null)} style={S.btn(false,false)}>← Volver</button>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:500}}>{recActiva.turno} — Recorrida {recActiva.idx+1}</div>
            <div style={{fontSize:11,color:"#64748b"}}>{rec.hora} · {rec.responsable}</div>
          </div>
          {readonly && <span style={{...S.ber,fontSize:10}}>Solo lectura</span>}
          {!readonly && (
            <span style={{fontSize:11,padding:"3px 8px",borderRadius:5,
              background:saveStatus==="saving"?"#FAEEDA":saveStatus==="saved"?"#E1F5EE":saveStatus==="error"?"#FCEBEB":"#f1f5f9",
              color:saveStatus==="saving"?"#633806":saveStatus==="saved"?"#085041":saveStatus==="error"?"#A32D2D":"#94a3b8"}}>
              {saveStatus==="saving"?"Guardando…":saveStatus==="saved"?"✓ Guardado":saveStatus==="error"?"⚠ Error":"Sin cambios"}
            </span>
          )}
        </div>
        <RecorridaForm
          recorrida={rec}
          onChange={newRec=>updateRecorrida(recActiva.turno, recActiva.idx, newRec)}
          readonly={readonly}
        />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <button onClick={onBack} style={S.btn(false,false)}>← Semana</button>
        <div style={{flex:1,fontSize:14,fontWeight:500}}>{DIAS[dayIdx]}</div>
        {allAlertas.length>0&&<span style={S.ber}>{allAlertas.length} alerta{allAlertas.length>1?"s":""}</span>}
      </div>

      {/* Turno tabs */}
      <div style={{display:"flex",gap:5,marginBottom:10}}>
        {TURNOS.map(t=>{
          const recs = getTurnoRecs(t);
          const alrts = recs.reduce((s,r)=>s+countAlertasRec(r),0);
          const canView = usuario.rol===ROLES.CALIDAD || usuario.turno===t;
          if (!canView) return null;
          return (
            <button key={t} onClick={()=>setTurnoActivo(t)}
              style={{flex:1,padding:"8px 4px",fontSize:12,borderRadius:8,cursor:"pointer",
                border:`1px solid ${turnoActivo===t?"#185FA5":alrts>0?"#F09595":recs.length>0?"#5DCAA5":"#e2e8f0"}`,
                background:turnoActivo===t?"#185FA5":alrts>0?"#FCEBEB":recs.length>0?"#E1F5EE":"#f8fafc",
                color:turnoActivo===t?"#E6F1FB":alrts>0?"#A32D2D":recs.length>0?"#085041":"#64748b",
                fontWeight:turnoActivo===t?500:400}}>
              {t}
              <span style={{display:"block",fontSize:9,marginTop:1}}>
                {recs.length>0?`${recs.length} rec${alrts>0?` · ${alrts}⚠`:""}` : "—"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Recorridas del turno activo */}
      <div style={{marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{fontSize:13,fontWeight:500}}>{turnoActivo} — Recorridas</div>
          {(usuario.rol===ROLES.CALIDAD||usuario.turno===turnoActivo) && (
            <button onClick={addRecorrida}
              style={{...S.btn(true,false),padding:"6px 12px",fontSize:12}}>
              + Nueva recorrida
            </button>
          )}
        </div>

        {getTurnoRecs(turnoActivo).length===0 ? (
          <div style={{padding:"20px",textAlign:"center",background:"#f8fafc",border:"1px dashed #e2e8f0",borderRadius:8,fontSize:12,color:"#94a3b8"}}>
            Sin recorridas registradas para este turno
          </div>
        ) : (
          getTurnoRecs(turnoActivo).map((rec,i)=>{
            const als = countAlertasRec(rec);
            return (
              <div key={i} onClick={()=>setRecActiva({turno:turnoActivo,idx:i})}
                style={{...S.card,cursor:"pointer",padding:"10px 12px",
                  borderColor:als>0?"#F09595":"#5DCAA5",marginBottom:6}}>
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

      {/* Alertas del día (calidad ve todo) */}
      {usuario.rol===ROLES.CALIDAD && allAlertas.length>0 && (
        <div style={S.card}>
          <div style={{fontSize:13,fontWeight:500,color:"#A32D2D",marginBottom:8}}>Alertas del día</div>
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

// ─── WEEK VIEW ────────────────────────────────────────────────────────────────
function WeekView({ monthId, weekIdx, weekLabel, usuario, onDaySelect, onBack }) {
  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <button onClick={onBack} style={S.btn(false,false)}>← Mes</button>
        <span style={{fontSize:14,fontWeight:500}}>{weekLabel}</span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        {DIAS.map((dia,i)=>(
          <div key={i} onClick={()=>onDaySelect(i)}
            style={{...S.card,cursor:"pointer",padding:"12px",borderColor:"#e2e8f0"}}>
            <div style={{fontSize:13,fontWeight:500,marginBottom:4}}>{dia}</div>
            <div style={{fontSize:11,color:"#94a3b8"}}>Toca para ver registros</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MONTH VIEW ───────────────────────────────────────────────────────────────
function MonthView({ monthId, monthLabel, usuario, onWeekSelect }) {
  return (
    <div>
      <div style={{fontSize:14,fontWeight:500,marginBottom:12}}>{monthLabel}</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        {[1,2,3,4].map(i=>(
          <div key={i} onClick={()=>onWeekSelect(i-1)}
            style={{...S.card,cursor:"pointer",padding:"14px 12px",borderColor:"#e2e8f0",textAlign:"center"}}>
            <div style={{fontSize:22,marginBottom:4}}>📋</div>
            <div style={{fontSize:13,fontWeight:500}}>Semana {i}</div>
            <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>Toca para ver días</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App() {
  const [usuario, setUsuario] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [nav, setNav] = useState("month"); // month | week | day
  const [weekIdx, setWeekIdx] = useState(0);
  const [dayIdx, setDayIdx] = useState(0);

  if (!usuario) return <LoginScreen onLogin={u=>{ setUsuario(u); }} />;

  const currentMonthId = selectedMonth?.id || null;
  const currentMonthLabel = selectedMonth?.label || "";

  return (
    <div style={{fontFamily:"system-ui,sans-serif",maxWidth:430,margin:"0 auto",color:"#1e293b",paddingBottom:32,minHeight:"100vh",background:"#f8fafc"}}>

      {/* HEADER */}
      <div style={{padding:"1rem 1rem .75rem",borderBottom:"1px solid #e2e8f0",background:"#fff",marginBottom:8}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <div>
            <div style={{fontSize:15,fontWeight:500}}>🥐 Control de Proceso</div>
            <div style={{fontSize:11,color:"#64748b"}}>{usuario.nombre} · {usuario.turno} · {usuario.rol==="calidad"?"👁 Calidad":"👷 Operario"}</div>
          </div>
          <button onClick={()=>setUsuario(null)} style={{fontSize:11,border:"1px solid #e2e8f0",borderRadius:6,padding:"4px 8px",background:"#f8fafc",cursor:"pointer",color:"#64748b"}}>
            Salir
          </button>
        </div>

        {/* Firebase status */}
        <div style={{fontSize:11,padding:"3px 8px",borderRadius:5,display:"inline-flex",alignItems:"center",gap:5,
          background:firebaseOk?"#E1F5EE":"#FAEEDA",color:firebaseOk?"#085041":"#633806"}}>
          <span style={{width:6,height:6,borderRadius:"50%",background:firebaseOk?"#1D9E75":"#BA7517",display:"inline-block"}}/>
          {firebaseOk?"Firebase conectado":"Modo local"}
        </div>

        {/* Month selector */}
        <div style={{marginTop:8}}>
          <select value={selectedMonth?.id||""}
            onChange={e=>{
              const m = ALL_MONTHS.find(x=>x.id===e.target.value);
              setSelectedMonth(m||null);
              setNav("month");
            }}
            style={{...S.inp(false),fontSize:13}}>
            <option value="">— Seleccionar período —</option>
            {YEARS.map(y=>(
              <optgroup key={y} label={`── ${y} ──`}>
                {ALL_MONTHS.filter(m=>m.year===y).map(m=>(
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Nav breadcrumb */}
        {selectedMonth && (
          <div style={{display:"flex",gap:4,marginTop:8,fontSize:12,alignItems:"center",flexWrap:"wrap"}}>
            <button onClick={()=>setNav("month")} style={{...S.btnSm(nav==="month")}}>{currentMonthLabel}</button>
            {(nav==="week"||nav==="day")&&<>
              <span style={{color:"#94a3b8"}}>›</span>
              <button onClick={()=>setNav("week")} style={S.btnSm(nav==="week")}>Sem. {weekIdx+1}</button>
            </>}
            {nav==="day"&&<>
              <span style={{color:"#94a3b8"}}>›</span>
              <button style={S.btnSm(true)}>{DIAS[dayIdx].substring(0,3)}</button>
            </>}
          </div>
        )}
      </div>

      <div style={{padding:"0 1rem"}}>
        {!selectedMonth ? (
          <div style={{textAlign:"center",padding:"40px 20px",color:"#94a3b8"}}>
            <div style={{fontSize:32,marginBottom:10}}>📅</div>
            <div style={{fontSize:14,marginBottom:4}}>Seleccioná un mes para comenzar</div>
            <div style={{fontSize:12}}>Los meses de 2026 y 2027 están disponibles</div>
          </div>
        ) : nav==="month" ? (
          <MonthView
            monthId={currentMonthId}
            monthLabel={currentMonthLabel}
            usuario={usuario}
            onWeekSelect={i=>{ setWeekIdx(i); setNav("week"); }}
          />
        ) : nav==="week" ? (
          <WeekView
            monthId={currentMonthId}
            weekIdx={weekIdx}
            weekLabel={`Semana ${weekIdx+1}`}
            usuario={usuario}
            onDaySelect={i=>{ setDayIdx(i); setNav("day"); }}
            onBack={()=>setNav("month")}
          />
        ) : (
          <DayView
            monthId={currentMonthId}
            weekIdx={weekIdx}
            dayIdx={dayIdx}
            usuario={usuario}
            onBack={()=>setNav("week")}
          />
        )}
      </div>
    </div>
  );
}

