import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./showpilot-app";
import "./styles.css";

/** A component exception must not leave the user staring at a blank window.
 * The fallback requires no third-party UI components or network resources. */
class ShowPilotRecoveryBoundary extends React.Component<
 {children:React.ReactNode},{failed:boolean}
>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(){
  // Do not log raw exception messages here: a future component could contain
  // a private event name, user file path, or OAuth credential in an error.
 }
 render(){
  if(!this.state.failed)return this.props.children;
  return <main role="alert" style={{
   minHeight:"100vh",padding:"3rem",background:"#121c2b",color:"#f5f7fb",
   fontFamily:"system-ui,sans-serif"
  }}>
   <h1 style={{fontSize:"1.5rem",fontWeight:700}}>ShowPilot needs to reload</h1>
   <p style={{maxWidth:650,marginTop:"1rem",lineHeight:1.6}}>
    The interface encountered an error. Your saved schedules and encrypted
    Google settings have not been deleted. You do not need to reupload your
    Google OAuth JSON file just to restart the application.
   </p>
   <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:24}}>
    <button type="button" onClick={()=>window.location.reload()}
     style={{padding:"10px 16px",borderRadius:6,background:"#60a5fa",color:"#111827"}}>
     Reload interface
    </button>
    <button type="button" onClick={()=>{
     try{localStorage.setItem("showpilot:screen","dashboard");}catch{}
     window.location.reload();
    }} style={{padding:"10px 16px",borderRadius:6,background:"#334155",color:"#fff"}}>
     Restart on dashboard (keep saved data)
    </button>
   </div>
   <p style={{marginTop:22,fontSize:13}}>
    If this happens during Google setup, use View → Toggle Developer Tools
    and share the Console error after redacting any account details.
   </p>
  </main>;
 }
}
const root=document.getElementById("root");
if(root)createRoot(root).render(<React.StrictMode><ShowPilotRecoveryBoundary><App /></ShowPilotRecoveryBoundary></React.StrictMode>);
