import { useState, useEffect, useCallback } from "react";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─────────────────────────────────────────────────────────────────────────────
// 🔥 FIREBASE CONFIG — reemplazá estos valores con los de tu proyecto Firebase
// Ve a: console.firebase.google.com → tu proyecto → Configuración → Aplicaciones web
// ─────────────────────────────────────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyBE3wpFexU7e8b_Y8jyxs4RqpXRUKzFdy8",
  authDomain:        "sig-medialunas.firebaseapp.com",
  projectId:         "sig-medialunas",
  storageBucket:     "sig-medialunas.firebasestorage.app",
  messagingSenderId: "909968740020",
  appId:             "1:909968740020:web:73175efa260d0f325cb1b1"
};

// Inicialización Firebase
let db = null;
let firebaseOk = false;
try {
  const app = initializeApp(FIREBASE_CONFIG);
  db = getFirestore(app);
  firebaseOk = true;
} catch(e) {
  console.warn("Firebase no inicializado — modo local activo", e);
}

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

const DIAS   = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
const TURNOS = ["TM","TT","TN"];
const MESES  = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function emptyDay()  { return { meta:{fecha:"",lote:"",turno:"",resp:"",tipo:"m"}, datos:{}, alertas:{} }; }
function emptyWeek(label){ return { label, days:DIAS.map(()=>emptyDay()) }; }
function emptyMonth(label){ return { label, weeks:[1,2,3,4].map(i=>emptyWeek(`Semana ${i}`)) }; }

function countAl(d){ let c=0; SECTORES.forEach(s=>s.fields.forEach(f=>{ if(d.alertas[f.id]) c++; })); return c; }
function weekAl(w){ return w.days.reduce((s,d)=>s+countAl(d),0); }
function monthAl(m){ return m.weeks.reduce((s,w)=>s+weekAl(w),0); }
function weekDays(w){ return w.days.filter(d=>d.meta.fecha||d.meta.lote).length; }

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

// Firestore path helper
function monthDocId(label){ return label.replace(/\s+/g,"_").toLowerCase(); }

// ─── STYLES ───────────────────────────────────────────────────────────────────
const S={
  inp:(e)=>({width:"100%",fontSize:13,padding:"7px 10px",border:`0.5px solid ${e?"#E24B4A":"#cbd5e1"}`,borderRadius:8,background:e?"#FCEBEB":"#fff",boxSizing:"border-box",color:"#1e293b"}),
  bpcc:{fontSize:10,background:"#FCEBEB",color:"#A32D2D",border:"0.5px solid #F09595",borderRadius:3,padding:"1px 5px",fontWeight:500},
  bpc: {fontSize:10,background:"#E6F1FB",color:"#185FA5",border:"0.5px solid #85B7EB",borderRadius:3,padding:"1px 5px"},
  bok: {fontSize:11,background:"#E1F5EE",color:"#085041",borderRadius:3,padding:"2px 6px",fontWeight:500},
  ber: {fontSize:11,background:"#FCEBEB",color:"#A32D2D",borderRadius:3,padding:"2px 6px",fontWeight:500},
  card:{border:"0.5px solid #e2e8f0",borderRadius:10,padding:"1rem",background:"#fff",marginBottom:8},
  nb:(p,d)=>({padding:"8px 14px",fontSize:12,border:`0.5px solid ${p?"#185FA5":"#cbd5e1"}`,borderRadius:8,background:p?"#185FA5":"#f8fafc",color:p?"#E6F1FB":"#1e293b",cursor:d?"default":"pointer",opacity:d?.38:1,fontWeight:p?500:400}),
};

// ─── SAVE STATUS BADGE ────────────────────────────────────────────────────────
function SaveBadge({status}){
  const cfg={
    saving: {bg:"#FAEEDA",color:"#633806",text:"Guardando…"},
    saved:  {bg:"#E1F5EE",color:"#085041",text:"✓ Guardado en Firebase"},
    error:  {bg:"#FCEBEB",color:"#A32D2D",text:"⚠ Error al guardar — datos en local"},
    local:  {bg:"#f1f5f9",color:"#64748b",text:"Modo local (sin Firebase)"},
    idle:   {bg:"#f1f5f9",color:"#94a3b8",text:"Sin cambios"},
  };
  const c=cfg[status]||cfg.idle;
  return(
    <div style={{padding:"5px 10px",background:c.bg,color:c.color,borderRadius:6,fontSize:11,textAlign:"center",marginBottom:8}}>
      {c.text}
    </div>
  );
}

// ─── MINI BAR ─────────────────────────────────────────────────────────────────
function MiniBar({values,spec,color,label}){
  const vals=values.map(v=>parseFloat(v));
  const valid=vals.filter(v=>!isNaN(v));
  if(!valid.length) return <div style={{fontSize:11,color:"#94a3b8",marginBottom:8}}>{label}: sin datos</div>;
  const mx=Math.max(...vals.map(v=>Math.abs(isNaN(v)?0:v)),1);
  return(
    <div style={{marginBottom:4}}>
      <div style={{fontSize:11,color:"#64748b",marginBottom:4}}>{label}</div>
      <div style={{display:"flex",alignItems:"flex-end",gap:2,height:36}}>
        {vals.map((v,i)=>{
          const ok=spec?spec(v):true;
          const h=isNaN(v)?3:Math.max(3,Math.round((Math.abs(v)/mx)*32));
          return <div key={i} style={{flex:1,borderRadius:2,background:isNaN(v)?"#f1f5f9":ok?color:"#F09595",height:h}} title={isNaN(v)?"—":String(v)}/>;
        })}
      </div>
    </div>
  );
}

// ─── DAILY CHECKLIST ──────────────────────────────────────────────────────────
function DailyChecklist({state,onChange,saveStatus}){
  const [cur,setCur]=useState(0);
  const {meta,datos,alertas}=state;
  const setMeta=(k,v)=>onChange({...state,meta:{...meta,[k]:v}});
  const handleNum=(f,val)=>onChange({...state,datos:{...datos,[f.id]:val},alertas:{...alertas,[f.id]:hasAlerta(f,val)}});
  const toggleCk=(fid,ix,len)=>{
    const arr=datos[fid]?[...datos[fid]]:Array(len).fill(false);
    arr[ix]=!arr[ix];
    onChange({...state,datos:{...datos,[fid]:arr}});
  };
  const sec=SECTORES[cur];
  const prog=Math.round((cur/(SECTORES.length-1))*100);
  const sAl=(s)=>s.fields.some(f=>alertas[f.id]);

  function renderField(f){
    const val=datos[f.id]??""; const err=!!alertas[f.id];
    if(f.type==="num"||f.type==="ti") return(
      <div key={f.id} style={{marginBottom:10}}>
        <div style={{fontSize:12,color:"#64748b",marginBottom:3,display:"flex",alignItems:"center",gap:5}}>
          {f.label}{f.ref==="PCC"?<span style={S.bpcc}>PCC</span>:f.ref?<span style={S.bpc}>PC</span>:null}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <input type={f.type==="ti"?"time":"number"} value={val}
            onChange={e=>handleNum(f,e.target.value)} style={{...S.inp(err),flex:1}}/>
          {f.unit&&<span style={{fontSize:12,color:"#94a3b8",whiteSpace:"nowrap"}}>{f.unit}</span>}
        </div>
        {err&&f.al?.msg&&<div style={{fontSize:11,color:"#A32D2D",marginTop:3}}>⚠ {f.al.msg}</div>}
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
                border:`0.5px solid ${arr[ix]?"#5DCAA5":"#cbd5e1"}`,borderRadius:8,marginBottom:4,
                cursor:"pointer",background:arr[ix]?"#E1F5EE":"#fff"}}>
              <input type="checkbox" checked={!!arr[ix]} onChange={()=>{}} style={{marginTop:1}}/>
              <span style={{fontSize:13,color:arr[ix]?"#085041":"#1e293b",lineHeight:1.4}}>{item}</span>
            </div>
          ))}
        </div>
      );
    }
    if(f.type==="ob") return(
      <div key={f.id} style={{marginBottom:10}}>
        <div style={{fontSize:12,color:"#64748b",marginBottom:3}}>{f.label}</div>
        <textarea value={val} onChange={e=>onChange({...state,datos:{...datos,[f.id]:e.target.value}})}
          placeholder="Sin novedad / describir desvío..."
          style={{...S.inp(false),height:52,resize:"none"}}/>
      </div>
    );
    return null;
  }

  return(
    <div>
      <SaveBadge status={saveStatus}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
        <input type="text" placeholder="Fecha" value={meta.fecha} onChange={e=>setMeta("fecha",e.target.value)} style={S.inp(false)}/>
        <input type="text" placeholder="N° de lote" value={meta.lote} onChange={e=>setMeta("lote",e.target.value)} style={S.inp(false)}/>
        <select value={meta.turno} onChange={e=>setMeta("turno",e.target.value)} style={S.inp(false)}>
          <option value="">Turno</option>{TURNOS.map(t=><option key={t}>{t}</option>)}
        </select>
        <input type="text" placeholder="Responsable" value={meta.resp} onChange={e=>setMeta("resp",e.target.value)} style={S.inp(false)}/>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:8}}>
        {[["m","Manteca","#E6F1FB","#185FA5","#0C447C"],["g","Grasa","#FAEEDA","#BA7517","#633806"]].map(([t,label,bg,border,color])=>(
          <button key={t} onClick={()=>setMeta("tipo",t)}
            style={{flex:1,padding:"7px",fontSize:13,borderRadius:8,cursor:"pointer",
              border:`0.5px solid ${meta.tipo===t?border:"#cbd5e1"}`,
              background:meta.tipo===t?bg:"#f8fafc",color:meta.tipo===t?color:"#64748b",fontWeight:meta.tipo===t?500:400}}>
            {label}
          </button>
        ))}
      </div>
      <div style={{height:3,background:"#e2e8f0",borderRadius:2,marginBottom:6}}>
        <div style={{height:3,width:`${prog}%`,background:"#1D9E75",borderRadius:2,transition:"width .3s"}}/>
      </div>
      <div style={{display:"flex",overflowX:"auto",gap:3,scrollbarWidth:"none"}}>
        {SECTORES.map((s,i)=>{
          const alrt=sAl(s),done=datos[s.id+"_d"];
          return(
            <button key={s.id} onClick={()=>setCur(i)}
              style={{whiteSpace:"nowrap",padding:"4px 8px",fontSize:11,
                border:`0.5px solid ${i===cur?"#94a3b8":"#e2e8f0"}`,borderBottom:"none",
                borderRadius:"4px 4px 0 0",cursor:"pointer",
                background:i===cur?"#fff":"#f8fafc",color:i===cur?"#1e293b":"#64748b",fontWeight:i===cur?500:400}}>
              <span style={{display:"inline-block",width:5,height:5,borderRadius:"50%",marginRight:3,verticalAlign:"middle",
                background:alrt?"#E24B4A":done?"#1D9E75":"#cbd5e1"}}/>
              {s.label}
            </button>
          );
        })}
      </div>
      <div style={{border:"0.5px solid #94a3b8",borderRadius:"0 8px 8px 8px",padding:"1rem",background:"#fff",marginBottom:8}}>
        <div style={{fontSize:14,fontWeight:500,marginBottom:10}}>{sec.label}</div>
        {sec.fields.map(f=>renderField(f))}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <button onClick={()=>setCur(c=>Math.max(0,c-1))} disabled={cur===0} style={S.nb(false,cur===0)}>← Anterior</button>
        <span style={{fontSize:11,color:"#94a3b8"}}>{cur+1}/{SECTORES.length}</span>
        <button onClick={()=>setCur(c=>Math.min(SECTORES.length-1,c+1))} disabled={cur===SECTORES.length-1} style={S.nb(true,cur===SECTORES.length-1)}>Siguiente →</button>
      </div>
    </div>
  );
}

// ─── WEEKLY VIEW ──────────────────────────────────────────────────────────────
function WeeklyView({week,onDayEdit,onBack}){
  const totAl=week.days.map(d=>countAl(d));
  const mx=Math.max(...totAl,1);
  const totAlSem=weekAl(week);
  const diasCon=weekDays(week);
  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <button onClick={onBack} style={S.nb(false,false)}>← Mes</button>
        <span style={{fontSize:14,fontWeight:500}}>{week.label}</span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
        {[["Días reg.",diasCon,"#E6F1FB","#0C447C"],
          ["Alertas",totAlSem,totAlSem>0?"#FCEBEB":"#E1F5EE",totAlSem>0?"#A32D2D":"#085041"],
          ["Sin datos",7-diasCon,"#f1f5f9","#64748b"]].map(([l,v,bg,c])=>(
          <div key={l} style={{background:bg,borderRadius:8,padding:"10px 8px",textAlign:"center"}}>
            <div style={{fontSize:20,fontWeight:500,color:c}}>{v}</div>
            <div style={{fontSize:10,color:c,marginTop:2,lineHeight:1.3}}>{l}</div>
          </div>
        ))}
      </div>
      <div style={S.card}>
        <div style={{fontSize:12,color:"#64748b",marginBottom:8}}>Alertas por día</div>
        <div style={{display:"flex",alignItems:"flex-end",gap:6,height:72}}>
          {week.days.map((d,i)=>{
            const c=totAl[i]; const h=mx>0?Math.max(4,Math.round((c/mx)*64)):4;
            const hasData=d.meta.fecha||d.meta.lote;
            return(
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                <span style={{fontSize:10,color:c>0?"#A32D2D":"#1D9E75",fontWeight:500}}>{hasData?c:"—"}</span>
                <div onClick={()=>onDayEdit(i)} style={{width:"100%",borderRadius:4,cursor:"pointer",
                  background:!hasData?"#f1f5f9":c>0?"#F09595":"#5DCAA5",height:h}}/>
                <span style={{fontSize:10,color:"#64748b"}}>{DIAS[i].substring(0,3)}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{display:"flex",gap:5,marginBottom:10,overflowX:"auto"}}>
        {DIAS.map((dia,i)=>{
          const c=totAl[i]; const hasData=week.days[i].meta.fecha||week.days[i].meta.lote;
          return(
            <button key={i} onClick={()=>onDayEdit(i)}
              style={{flex:"0 0 auto",padding:"6px 10px",fontSize:12,borderRadius:8,cursor:"pointer",
                border:`0.5px solid ${c>0?"#F09595":hasData?"#5DCAA5":"#e2e8f0"}`,
                background:c>0?"#FCEBEB":hasData?"#E1F5EE":"#f8fafc",
                color:c>0?"#A32D2D":hasData?"#085041":"#64748b"}}>
              {dia.substring(0,3)}
              {hasData&&<span style={{fontSize:9,display:"block",marginTop:1}}>{c>0?`${c}⚠`:"✓"}</span>}
            </button>
          );
        })}
      </div>
      <div style={S.card}>
        <MiniBar values={week.days.map(d=>d.datos["a_tmasa"])} spec={v=>!isNaN(v)&&v<=20} color="#5DCAA5" label="T° masa final (°C) — esp. ≤20°C"/>
        <MiniBar values={week.days.map(d=>d.datos["e_tcam"])}  spec={v=>!isNaN(v)&&v<=-17} color="#5DCAA5" label="T° cámara final (°C) — esp. ≤−17°C"/>
      </div>
      {week.days.some(d=>countAl(d)>0)&&(
        <div style={S.card}>
          <div style={{fontSize:13,fontWeight:500,color:"#A32D2D",marginBottom:8}}>Detalle de alertas</div>
          {week.days.map((d,i)=>{
            const al=[];
            SECTORES.forEach(s=>s.fields.forEach(f=>{if(d.alertas[f.id])al.push({sec:s.label,campo:f.label,msg:f.al?.msg||""});}));
            if(!al.length) return null;
            return(
              <div key={i} style={{marginBottom:10}}>
                <div style={{fontSize:12,fontWeight:500,marginBottom:4}}>{DIAS[i]}{d.meta.fecha?` — ${d.meta.fecha}`:""}</div>
                {al.map((a,j)=>(
                  <div key={j} style={{fontSize:11,background:"#FCEBEB",color:"#A32D2D",border:"0.5px solid #F09595",borderRadius:5,padding:"4px 8px",marginBottom:3}}>
                    <strong>{a.sec}</strong> — {a.campo}{a.msg?`: ${a.msg}`:""}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── MONTHLY VIEW ─────────────────────────────────────────────────────────────
function MonthlyView({month,onWeekSelect,onWeekLabelChange}){
  const totAlMonth=monthAl(month);
  const diasConMonth=month.weeks.reduce((s,w)=>s+weekDays(w),0);
  const allDays=month.weeks.flatMap(w=>w.days);
  const wAls=month.weeks.map(w=>weekAl(w));
  const mxW=Math.max(...wAls,1);
  return(
    <div>
      <div style={{fontSize:14,fontWeight:500,marginBottom:12}}>{month.label}</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:12}}>
        {[["Días reg.",diasConMonth,"#E6F1FB","#0C447C"],
          ["Alertas",totAlMonth,totAlMonth>0?"#FCEBEB":"#E1F5EE",totAlMonth>0?"#A32D2D":"#085041"],
          ["Semanas",4,"#f1f5f9","#64748b"],
          ["Sin datos",28-diasConMonth,"#f1f5f9","#94a3b8"]].map(([l,v,bg,c])=>(
          <div key={l} style={{background:bg,borderRadius:8,padding:"8px 4px",textAlign:"center"}}>
            <div style={{fontSize:18,fontWeight:500,color:c}}>{v}</div>
            <div style={{fontSize:9,color:c,marginTop:2,lineHeight:1.3}}>{l}</div>
          </div>
        ))}
      </div>
      <div style={S.card}>
        <div style={{fontSize:12,color:"#64748b",marginBottom:8}}>Alertas por semana</div>
        <div style={{display:"flex",alignItems:"flex-end",gap:10,height:80}}>
          {month.weeks.map((w,i)=>{
            const c=wAls[i]; const h=mxW>0?Math.max(4,Math.round((c/mxW)*72)):4;
            const diasW=weekDays(w);
            return(
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                <span style={{fontSize:11,color:c>0?"#A32D2D":"#1D9E75",fontWeight:500}}>{diasW>0?c:"—"}</span>
                <div onClick={()=>onWeekSelect(i)} style={{width:"100%",borderRadius:5,cursor:"pointer",
                  background:diasW===0?"#f1f5f9":c>0?"#F09595":"#5DCAA5",height:h,border:"0.5px solid #e2e8f0"}}/>
                <span style={{fontSize:11,color:"#64748b"}}>S{i+1}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
        {month.weeks.map((w,i)=>{
          const c=wAls[i]; const dias=weekDays(w);
          return(
            <div key={i} onClick={()=>onWeekSelect(i)}
              style={{...S.card,cursor:"pointer",padding:"10px 12px",
                borderColor:c>0?"#F09595":dias>0?"#5DCAA5":"#e2e8f0"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <input value={w.label} onClick={e=>e.stopPropagation()}
                  onChange={e=>onWeekLabelChange(i,e.target.value)}
                  style={{fontSize:13,fontWeight:500,border:"none",background:"transparent",color:"#1e293b",outline:"none",padding:0,width:"100%"}}/>
                {c>0?<span style={S.ber}>{c}⚠</span>:dias>0?<span style={S.bok}>OK</span>:<span style={{fontSize:11,color:"#94a3b8"}}>—</span>}
              </div>
              <div style={{fontSize:11,color:"#64748b"}}>{dias}/7 días registrados</div>
              <div style={{display:"flex",gap:3,marginTop:6}}>
                {w.days.map((d,j)=>{
                  const hasD=d.meta.fecha||d.meta.lote; const al=countAl(d)>0;
                  return <div key={j} style={{flex:1,height:5,borderRadius:2,background:!hasD?"#f1f5f9":al?"#F09595":"#5DCAA5"}} title={DIAS[j]}/>;
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div style={S.card}>
        <div style={{fontSize:12,color:"#64748b",marginBottom:8}}>Tendencias mensuales (28 días)</div>
        <MiniBar values={allDays.map(d=>d.datos["a_tmasa"])} spec={v=>!isNaN(v)&&v<=20}  color="#5DCAA5" label="T° masa final (°C) — esp. ≤20°C"/>
        <MiniBar values={allDays.map(d=>d.datos["e_tcam"])}  spec={v=>!isNaN(v)&&v<=-17} color="#5DCAA5" label="T° cámara final (°C) — esp. ≤−17°C"/>
      </div>
      {totAlMonth>0&&(
        <div style={S.card}>
          <div style={{fontSize:13,fontWeight:500,color:"#A32D2D",marginBottom:8}}>Resumen de alertas del mes</div>
          {month.weeks.map((w,wi)=>{
            const wAlerts=[];
            w.days.forEach((d,di)=>{ SECTORES.forEach(s=>s.fields.forEach(f=>{ if(d.alertas[f.id]) wAlerts.push({dia:DIAS[di],sec:s.label,campo:f.label}); })); });
            if(!wAlerts.length) return null;
            return(
              <div key={wi} style={{marginBottom:10}}>
                <div style={{fontSize:12,fontWeight:500,color:"#64748b",marginBottom:5,padding:"3px 6px",background:"#f8fafc",borderRadius:5}}>{w.label}</div>
                {wAlerts.map((a,j)=>(
                  <div key={j} style={{fontSize:11,background:"#FCEBEB",color:"#A32D2D",border:"0.5px solid #F09595",borderRadius:5,padding:"4px 8px",marginBottom:3}}>
                    <strong>{a.dia}</strong> · {a.sec} — {a.campo}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── EXPORT TXT ───────────────────────────────────────────────────────────────
function exportMonth(month){
  let t=`REGISTRO MENSUAL CONTROL DE CALIDAD — MEDIALUNAS\nMes: ${month.label}\n${"=".repeat(55)}\n`;
  month.weeks.forEach(w=>{
    t+=`\n${"─".repeat(40)}\n${w.label.toUpperCase()}\n${"─".repeat(40)}\n`;
    w.days.forEach((d,i)=>{
      if(!d.meta.fecha&&!d.meta.lote) return;
      t+=`\n${DIAS[i]} | Fecha: ${d.meta.fecha||"—"} | Lote: ${d.meta.lote||"—"} | Turno: ${d.meta.turno||"—"} | Tipo: ${d.meta.tipo==="m"?"Manteca":"Grasa"}\n`;
      SECTORES.forEach(s=>{
        let rows="";
        s.fields.forEach(f=>{
          const v=d.datos[f.id]; if(!v) return;
          if(Array.isArray(v)){ rows+=`  ${f.label}:\n`; f.items.forEach((it,ix)=>{ rows+=`    [${v[ix]?"X":" "}] ${it}\n`; }); }
          else { rows+=`  ${f.label}: ${v}${d.alertas[f.id]?" ⚠ ALERTA":""}\n`; }
        });
        if(rows) t+=`${s.label}:\n${rows}`;
      });
      const al=[];
      SECTORES.forEach(s=>s.fields.forEach(f=>{ if(d.alertas[f.id]) al.push(`${s.label}: ${f.label}`); }));
      if(al.length) t+=`ALERTAS: ${al.join(" | ")}\n`;
    });
  });
  const b=new Blob([t],{type:"text/plain"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(b); a.download=`registro_mensual_${month.label.replace(/\s/g,"_")}.txt`; a.click();
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App(){
  const [nav,setNav]       = useState("month");
  const [weekIdx,setWeekIdx] = useState(0);
  const [dayIdx,setDayIdx]   = useState(0);
  const [saveStatus,setSaveStatus] = useState(firebaseOk?"idle":"local");
  const [loading,setLoading] = useState(true);
  const [monthList,setMonthList] = useState([]);
  const [activeMonthId,setActiveMonthId] = useState(null);

  const now = new Date();
  const defaultLabel = `${MESES[now.getMonth()]} ${now.getFullYear()}`;

  const [month,setMonth] = useState(()=>emptyMonth(defaultLabel));

  // ── Firebase: load month list on boot ──
  useEffect(()=>{
    if(!firebaseOk){ setLoading(false); return; }
    const col = collection(db,"meses");
    const unsub = onSnapshot(col, snap=>{
      const list=snap.docs.map(d=>({id:d.id, label:d.data().label||d.id}));
      list.sort((a,b)=>a.id.localeCompare(b.id));
      setMonthList(list);
      setLoading(false);
    });
    return ()=>unsub();
  },[]);

  // ── Firebase: load active month ──
  useEffect(()=>{
    if(!firebaseOk||!activeMonthId){ setLoading(false); return; }
    setLoading(true);
    getDoc(doc(db,"meses",activeMonthId)).then(snap=>{
      if(snap.exists()){
        const data=snap.data();
        // Merge saved data over empty structure to fill any missing days
        const base=emptyMonth(data.label||activeMonthId);
        if(data.weeks) base.weeks=data.weeks.map((w,wi)=>({
          label:w.label||`Semana ${wi+1}`,
          days:(w.days||[]).map((d,di)=>({
            meta:d.meta||emptyDay().meta,
            datos:d.datos||{},
            alertas:d.alertas||{}
          }))
        }));
        setMonth(base);
      } else {
        const m=emptyMonth(activeMonthId.replace(/_/g," "));
        setMonth(m);
      }
      setLoading(false);
    }).catch(()=>setLoading(false));
  },[activeMonthId]);

  // ── Firebase: debounced auto-save ──
  const saveTimer = useState(null);
  const saveToFirebase = useCallback(async(m)=>{
    if(!firebaseOk) return;
    setSaveStatus("saving");
    try{
      const id=monthDocId(m.label);
      await setDoc(doc(db,"meses",id), JSON.parse(JSON.stringify(m)));
      setSaveStatus("saved");
      setTimeout(()=>setSaveStatus("idle"),2500);
    } catch(e){
      console.error(e);
      setSaveStatus("error");
    }
  },[]);

  function updMonth(newMonth){
    setMonth(newMonth);
    if(saveTimer[0]) clearTimeout(saveTimer[0]);
    saveTimer[0]=setTimeout(()=>saveToFirebase(newMonth), 1200);
  }

  function updDay(wi,di,newDay){
    updMonth({...month,weeks:month.weeks.map((w,i)=>i!==wi?w:{...w,days:w.days.map((d,j)=>j!==di?d:newDay)})});
  }
  function updWeekLabel(wi,label){
    updMonth({...month,weeks:month.weeks.map((w,i)=>i!==wi?w:{...w,label})});
  }

  const currentWeek=month.weeks[weekIdx];
  const currentDay=currentWeek.days[dayIdx];

  if(loading) return(
    <div style={{fontFamily:"system-ui",maxWidth:430,margin:"0 auto",padding:"2rem",textAlign:"center",color:"#64748b"}}>
      <div style={{fontSize:24,marginBottom:8}}>⏳</div>
      <div style={{fontSize:14}}>Conectando con Firebase…</div>
    </div>
  );

  return(
    <div style={{fontFamily:"system-ui,sans-serif",maxWidth:430,margin:"0 auto",color:"#1e293b",paddingBottom:32}}>

      {/* ── HEADER ── */}
      <div style={{padding:"1rem 1rem .75rem",borderBottom:"0.5px solid #e2e8f0",marginBottom:8}}>
        <div style={{fontSize:15,fontWeight:500,marginBottom:8}}>Control de proceso — Medialunas</div>

        {/* Firebase status */}
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,fontSize:11,
          color:firebaseOk?"#085041":"#633806",
          background:firebaseOk?"#E1F5EE":"#FAEEDA",
          padding:"4px 8px",borderRadius:6}}>
          <span style={{width:6,height:6,borderRadius:"50%",background:firebaseOk?"#1D9E75":"#BA7517",display:"inline-block"}}/>
          {firebaseOk?"Firebase conectado — sincronización activa":"Modo local — configurá Firebase para sincronizar"}
        </div>

        {/* Month selector + new month */}
        <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
          <select value={activeMonthId||""} onChange={e=>{setActiveMonthId(e.target.value||null);}}
            style={{...S.inp(false),flex:1,fontSize:12}}>
            <option value="">— Nuevo mes —</option>
            {monthList.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:8}}>
          <input type="text" value={month.label} onChange={e=>updMonth({...month,label:e.target.value})}
            placeholder="Nombre del mes / período" style={{...S.inp(false),flex:1,fontSize:13}}/>
          <button onClick={()=>exportMonth(month)}
            style={{padding:"7px 10px",fontSize:12,border:"0.5px solid #cbd5e1",borderRadius:8,background:"#f8fafc",cursor:"pointer",whiteSpace:"nowrap"}}>
            ↓ .txt
          </button>
        </div>

        {/* Nav tabs */}
        <div style={{display:"flex",gap:6}}>
          {[["month","Mes"],["week","Semana"],["day","Día"]].map(([id,label])=>(
            <button key={id} onClick={()=>setNav(id)}
              style={{flex:1,padding:"7px 8px",fontSize:13,borderRadius:8,cursor:"pointer",
                border:`0.5px solid ${nav===id?"#185FA5":"#cbd5e1"}`,
                background:nav===id?"#185FA5":"#f8fafc",
                color:nav===id?"#E6F1FB":"#64748b",fontWeight:nav===id?500:400}}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{padding:"0 1rem"}}>

        {/* ── MES ── */}
        {nav==="month"&&(
          <MonthlyView month={month}
            onWeekSelect={i=>{setWeekIdx(i);setNav("week");}}
            onWeekLabelChange={updWeekLabel}/>
        )}

        {/* ── SEMANA ── */}
        {nav==="week"&&(
          <>
            <div style={{display:"flex",gap:5,marginBottom:10,overflowX:"auto"}}>
              {month.weeks.map((w,i)=>{
                const c=weekAl(w); const dias=weekDays(w); const active=i===weekIdx;
                return(
                  <button key={i} onClick={()=>setWeekIdx(i)}
                    style={{flex:"0 0 auto",padding:"5px 10px",fontSize:12,borderRadius:7,cursor:"pointer",
                      border:`0.5px solid ${active?"#185FA5":c>0?"#F09595":dias>0?"#5DCAA5":"#e2e8f0"}`,
                      background:active?"#185FA5":c>0?"#FCEBEB":dias>0?"#E1F5EE":"#f8fafc",
                      color:active?"#E6F1FB":c>0?"#A32D2D":dias>0?"#085041":"#64748b",fontWeight:active?500:400}}>
                    {w.label}
                    {dias>0&&!active&&<span style={{fontSize:9,display:"block",marginTop:1}}>{c>0?`${c}⚠`:"✓"}</span>}
                  </button>
                );
              })}
            </div>
            <WeeklyView week={currentWeek}
              onDayEdit={i=>{setDayIdx(i);setNav("day");}}
              onBack={()=>setNav("month")}/>
          </>
        )}

        {/* ── DÍA ── */}
        {nav==="day"&&(
          <>
            <div style={{display:"flex",gap:4,marginBottom:6,overflowX:"auto"}}>
              {month.weeks.map((w,i)=>(
                <button key={i} onClick={()=>setWeekIdx(i)}
                  style={{flex:"0 0 auto",padding:"4px 9px",fontSize:11,borderRadius:6,cursor:"pointer",
                    border:`0.5px solid ${i===weekIdx?"#185FA5":"#e2e8f0"}`,
                    background:i===weekIdx?"#185FA5":"#f8fafc",
                    color:i===weekIdx?"#E6F1FB":"#64748b",fontWeight:i===weekIdx?500:400}}>
                  {w.label}
                </button>
              ))}
            </div>
            <div style={{display:"flex",gap:4,marginBottom:10,overflowX:"auto"}}>
              {DIAS.map((dia,i)=>{
                const d=currentWeek.days[i]; const c=countAl(d); const hasData=d.meta.fecha||d.meta.lote; const active=i===dayIdx;
                return(
                  <button key={i} onClick={()=>setDayIdx(i)}
                    style={{flex:"0 0 auto",padding:"5px 8px",fontSize:11,borderRadius:7,cursor:"pointer",
                      border:`0.5px solid ${active?"#185FA5":c>0?"#F09595":hasData?"#5DCAA5":"#e2e8f0"}`,
                      background:active?"#185FA5":c>0?"#FCEBEB":hasData?"#E1F5EE":"#f8fafc",
                      color:active?"#E6F1FB":c>0?"#A32D2D":hasData?"#085041":"#64748b",fontWeight:active?500:400}}>
                    {dia.substring(0,3)}
                  </button>
                );
              })}
            </div>
            <div style={{fontSize:13,fontWeight:500,marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>{DIAS[dayIdx]} — {currentWeek.label}</span>
              <button onClick={()=>setNav("week")} style={{fontSize:11,border:"0.5px solid #cbd5e1",borderRadius:6,padding:"3px 8px",background:"#f8fafc",cursor:"pointer",color:"#64748b"}}>← Semana</button>
            </div>
            <DailyChecklist
              state={currentDay}
              onChange={s=>updDay(weekIdx,dayIdx,s)}
              saveStatus={saveStatus}/>
          </>
        )}

      </div>
    </div>
  );
}
