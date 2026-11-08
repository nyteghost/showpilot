import { useEffect, useState } from "react";
import {
  CalendarDays, CalendarClock, Layers3, Store, Map, FolderOpen,
  LayoutDashboard, Menu, Moon, Sun, ChevronRight, PanelLeftClose, PanelLeftOpen, Settings2
} from "lucide-react";
import { ShowServicesTools, type WorkTabId, type OpenEventRequest } from "@/components/work-tools";
import { BackupPanel } from "@/components/showpilot-backup";
import { ShowPilotLocalFoundation } from "@/components/showpilot-local-foundation";
import { ShowPilotAiSettings } from "@/components/showpilot-ai-settings";
import { GoogleCalendarSettings } from "@/components/showpilot-calendar-settings";
import { ShowPilotUpdates } from "@/components/showpilot-updates";
import { ShowPilotMemorySettings } from "@/components/showpilot-memory-settings";
import { ShowPilotDiagnosticsPanel } from "@/components/showpilot-diagnostics-panel";
import { getLocalAiRuntimeState, subscribeLocalAiRuntimeState } from "@/lib/showpilot-ai-local";
import showpilotIcon from "./assets/showpilot-approved.webp";

type Screen = "dashboard" | "settings" | WorkTabId;
const sections: { id: WorkTabId; label: string; desc: string; Icon: typeof CalendarDays; note: string }[] = [
  {id:"today",label:"Today",desc:"Today’s events, EOCs, airwall work and an easy weekly overview",Icon:Sun,note:"Daily operations"},
  {id:"events",label:"Event Schedule",desc:"Import Ungerboeck reports, plan engineering coverage and export Excel",Icon:CalendarDays,note:"Reports & staffing"},
  {id:"eventhub",label:"Events",desc:"Show notes, work orders, EOCs, event diagrams and Pre/Post-Con information",Icon:FolderOpen,note:"Central show records"},
  {id:"shifts",label:"My Shifts",desc:"Read, edit and export your personal shifts to Google Calendar",Icon:CalendarClock,note:"Calendar tools"},
  {id:"floor",label:"Floor Maps",desc:"Color booth utility locations and resolve work-order questions",Icon:Map,note:"Exhibitor utilities"},
  {id:"vendors",label:"Vendors",desc:"Manage and compare purchase and rental quotes",Icon:Store,note:"Purchasing & rentals"},
];

function saved(key:string,fallback:string) {
  try { return localStorage.getItem(key)??fallback; } catch { return fallback; }
}

export function App() {
  const [screen,setScreen] = useState<Screen>(()=>{
    const v=saved("showpilot:screen","dashboard");
    if(v==="precon"||v==="postcon"||v==="deck")return "eventhub"; // Older standalone pages now live inside Events.
    return v==="dashboard"||v==="settings"||sections.some(s=>s.id===v)?v as Screen:"dashboard";
  });
  // Mount the workspace only after its first visit, then keep it alive across
  // sidebar navigation. Its Event Schedule stores imported File objects and
  // unsaved reviewer choices in React state, which unmounting would destroy.
  const [lastWorkTab,setLastWorkTab] = useState<WorkTabId|null>(()=>{
    const v=saved("showpilot:screen","dashboard");
    if(v==="precon"||v==="postcon")return "eventhub";
    return sections.some(s=>s.id===v)?v as WorkTabId:null;
  });
  const [dark,setDark] = useState(()=>saved("showpilot:theme","light")==="dark");
  const [expanded,setExpanded] = useState(()=>saved("showpilot:sidebar","true")!=="false");
  const [mobileOpen,setMobileOpen] = useState(false);
  const [openEventRequest,setOpenEventRequest]=useState<OpenEventRequest|null>(null);
  const [localAiRuntime,setLocalAiRuntime] = useState(getLocalAiRuntimeState);

  useEffect(()=>{
    document.documentElement.classList.toggle("dark",dark);
    try{localStorage.setItem("showpilot:theme",dark?"dark":"light")}catch{}
  },[dark]);
  useEffect(()=>{try{localStorage.setItem("showpilot:screen",screen)}catch{}},[screen]);
  useEffect(()=>{try{localStorage.setItem("showpilot:sidebar",String(expanded))}catch{}},[expanded]);
  useEffect(()=>subscribeLocalAiRuntimeState(setLocalAiRuntime),[]);

  useEffect(()=>{
    const open=(event:Event)=>{
      const detail=(event as CustomEvent<{tab?:string;eventKey?:string;section?:string}>).detail;
      const tab=detail?.tab;
      if(tab&&sections.some(s=>s.id===tab)){
        if(tab==="eventhub"&&detail?.eventKey){
          setOpenEventRequest(previous=>({
            key:detail.eventKey!,section:detail.section==="overview"?"overview":"documents",
            revision:(previous?.revision??0)+1
          }));
        }
        setLastWorkTab(tab as WorkTabId);setScreen(tab as WorkTabId);setMobileOpen(false);
      }
    };
    window.addEventListener("showpilot:navigate",open);
    return ()=>window.removeEventListener("showpilot:navigate",open);
  },[]);
  const select=(next:Screen)=>{if(sections.some(s=>s.id===next))setLastWorkTab(next as WorkTabId);setScreen(next);setMobileOpen(false)};
  const current=sections.find(s=>s.id===screen);
  return <div className="sp-shell">
    {mobileOpen&&<button className="sp-backdrop" aria-label="Close navigation" onClick={()=>setMobileOpen(false)}/>}
    <aside className={"sp-sidebar "+(expanded?"":"sp-collapsed ")+(mobileOpen?"sp-open":"")}>
      <div className="sp-brand">
        <span className="sp-logo"><img src={showpilotIcon} alt="ShowPilot stage and truss emblem" /></span>
        {expanded&&<div><strong>ShowPilot</strong><small>OPERATIONS SUITE</small></div>}
      </div>
      <div className="sp-nav">
        {expanded&&<span className="sp-nav-label">WORKSPACE</span>}
        <button title="Dashboard" className={"sp-nav-item "+(screen==="dashboard"?"sp-selected":"")} onClick={()=>select("dashboard")}><LayoutDashboard size={19}/>{expanded&&<span>Dashboard</span>}</button>
        {sections.map(({id,label,Icon})=><button title={label} key={id} className={"sp-nav-item "+(screen===id?"sp-selected":"")} onClick={()=>select(id)}><Icon size={19}/>{expanded&&<span>{label}</span>}</button>)}
        <button title="Settings & AI Providers" className={"sp-nav-item "+(screen==="settings"?"sp-selected":"")} onClick={()=>select("settings")}><Settings2 size={19}/>{expanded&&<span>Settings & AI</span>}</button>
      </div>
      <div className="sp-sidebar-footer">
        {expanded&&<span>Cobb Convention Center-Atlanta</span>}
        <button className="sp-icon-button" onClick={()=>setExpanded(v=>!v)} title={expanded?"Collapse sidebar":"Expand sidebar"} aria-label={expanded?"Collapse sidebar":"Expand sidebar"}>
          {expanded?<PanelLeftClose size={18}/>:<PanelLeftOpen size={18}/>}
        </button>
      </div>
    </aside>
    <div className="sp-body">
      <header className="sp-header">
        <button className="sp-mobile-menu" onClick={()=>setMobileOpen(true)} aria-label="Open navigation"><Menu size={20}/></button>
        <div className="sp-breadcrumb">SHOWPILOT <ChevronRight size={14}/> {current?.label??(screen==="settings"?"Settings & AI":"Dashboard")}</div>
        <div className="sp-header-actions">
          <span className="sp-local" role="status" aria-live="polite"
            aria-label={localAiRuntime.status==="ready"?"Local AI connected":"Local AI disconnected"}
            title={localAiRuntime.status==="ready"?"Local AI is loaded and ready":localAiRuntime.status==="loading"?"Local AI is loading":"Local AI is not connected"}>
            <span aria-hidden="true" className={"inline-block size-2.5 shrink-0 rounded-full "+(localAiRuntime.status==="ready"?"bg-emerald-500":"bg-red-500")}/>
            Local Workspace
          </span>
          <button className="sp-icon-button" onClick={()=>setDark(v=>!v)} aria-label={dark?"Use light theme":"Use dark theme"}>{dark?<Sun size={19}/>:<Moon size={19}/>}</button>
        </div>
      </header>
      <main className="sp-main">
        <div className="sp-page-head">
          <div><p className="sp-eyebrow">COBB CONVENTION CENTER-ATLANTA</p><h1>{current?.label??(screen==="settings"?"Settings & AI Providers":"Operations Overview")}</h1>
            <p className="sp-subtitle">{current?.desc??(screen==="settings"?"Configure on-device GPU AI and encrypted online provider keys.":"Your venue operations tools, together in one workspace.")}</p></div>
        </div>
        {screen==="settings" ? <section className="sp-panel space-y-5"><ShowPilotUpdates /><ShowPilotDiagnosticsPanel /><ShowPilotMemorySettings /><ShowPilotLocalFoundation /><GoogleCalendarSettings /><ShowPilotAiSettings /></section>
        : screen==="dashboard"
          ? <div className="space-y-5">
              <div className="sp-banner"><img src={showpilotIcon} width={52} height={52} alt="" aria-hidden="true" /><div><h2>Welcome to ShowPilot</h2><p>Open a tool below to begin. Scheduling and reports run locally, with no uploaded report data sent to a server.</p></div></div>
              <div className="sp-cards">
                {sections.map(({id,label,desc,Icon,note})=><button className="sp-card" key={id} onClick={()=>select(id)}>
                  <div className="sp-card-top"><span className="sp-card-icon"><Icon size={21}/></span><ChevronRight size={17}/></div>
                  <strong>{label}</strong><p>{desc}</p><small>{note}</small>
                </button>)}
              </div>
              <BackupPanel />
              <div className="sp-note">Beta: event imports accept recognized convention-center spaces. Unknown rooms are held for manual review; CEPAC rows are excluded. Google Calendar bulk sync is available in the portable Windows app after one-time OAuth setup; .ics export works offline. Automated online vendor refresh is still pending.</div>
            </div>
          : null
        }
        {lastWorkTab && <div hidden={!current}>
          <section className="sp-panel"><ShowServicesTools selectedTab={lastWorkTab} openEventRequest={openEventRequest} hideTabBar page venueOnly /></section>
        </div>}
      </main>
      <footer className="sp-footer">ShowPilot v{__APP_VERSION__} · Cobb Convention Center-Atlanta · {__APP_VERSION__.includes("-beta") ? "Beta" : "Main"} channel</footer>
    </div>
  </div>;
}
