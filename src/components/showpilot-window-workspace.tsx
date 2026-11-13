import {useEffect,useRef,useState,type ReactNode,type PointerEvent as ReactPointerEvent,type KeyboardEvent as ReactKeyboardEvent} from "react";
import {Grip,LayoutGrid,Layers3,Maximize2,Minimize2,Minus,RotateCcw,X} from "lucide-react";
import {Button} from "@/components/ui/button";
import {
 clampWindowRectangle,defaultWindowRectangle,resizeWindowRectangle,readSavedWindowRectangles,
 type WorkspaceWindowId,type WindowBounds,type WindowRectangle
} from "@/lib/showpilot-window-workspace";

const STORE="showpilot:window-workspace:rectangles:v1";
type WorkspaceItem={id:WorkspaceWindowId;label:string;description:string;icon:ReactNode;content:ReactNode};
type Props={
 items:WorkspaceItem[];openIds:readonly WorkspaceWindowId[];
 minimizedIds:readonly WorkspaceWindowId[];activeId:WorkspaceWindowId|null;
 windowed:boolean;visible:boolean;
 onFocus:(id:WorkspaceWindowId)=>void;
 onClose:(id:WorkspaceWindowId)=>void;
 onMinimize:(id:WorkspaceWindowId)=>void;
};
type Motion={id:WorkspaceWindowId;kind:"move"|"resize";x:number;y:number;initial:WindowRectangle;bounds:WindowBounds};

/** One DOM pane per visited tool, never unmount on close/minimize/switch.
 * All working state remains in the original component tree. */
export function ShowPilotWindowWorkspace({
 items,openIds,minimizedIds,activeId,windowed,visible,onFocus,onClose,onMinimize
}:Props){
 const canvas=useRef<HTMLDivElement>(null);
 const motion=useRef<Motion|null>(null);
 const [bounds,setBounds]=useState<WindowBounds>({width:1200,height:670});
 const [rectangles,setRectangles]=useState<Partial<Record<WorkspaceWindowId,WindowRectangle>>>(()=>{
  try{return readSavedWindowRectangles(localStorage.getItem(STORE));}catch{return {};}
 });
 useEffect(()=>{
  const container=canvas.current;
  if(!container||typeof ResizeObserver==="undefined")return;
  const observer=new ResizeObserver(entries=>{
   const entry=entries[0];
   if(!entry)return;
   const width=Math.round(entry.contentRect.width),height=Math.round(entry.contentRect.height);
   if(width>0&&height>0)setBounds(prev=>prev.width===width&&prev.height===height?prev:{width,height});
  });
  observer.observe(container);
  return ()=>observer.disconnect();
 },[]);
 useEffect(()=>{
  // Bounds are small UI-only JSON, not any imported user data or OAuth keys.
  const timeout=window.setTimeout(()=>{
   try{localStorage.setItem(STORE,JSON.stringify(rectangles))}catch{/* persistence optional */}
  },180);
  return ()=>window.clearTimeout(timeout);
 },[rectangles]);
 const rectangle=(id:WorkspaceWindowId):WindowRectangle=>
  clampWindowRectangle(rectangles[id]??defaultWindowRectangle(id),bounds);
 const update=(id:WorkspaceWindowId,value:WindowRectangle)=>
  setRectangles(old=>({...old,[id]:clampWindowRectangle(value,bounds)}));
 const start=(event:ReactPointerEvent<HTMLElement>,id:WorkspaceWindowId,kind:Motion["kind"])=>{
  if(event.button!==0||!windowed)return;
  const current=rectangle(id);
  if(current.maximized)return;
  motion.current={id,kind,x:event.clientX,y:event.clientY,initial:current,bounds};
  event.currentTarget.setPointerCapture(event.pointerId);
  event.preventDefault();
  onFocus(id);
 };
 const move=(event:ReactPointerEvent<HTMLElement>)=>{
  const drag=motion.current;
  if(!drag)return;
  const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
  const updated=drag.kind==="move"?
   clampWindowRectangle({...drag.initial,x:drag.initial.x+dx,y:drag.initial.y+dy},drag.bounds):
   resizeWindowRectangle(drag.initial,dx,dy,drag.bounds);
  setRectangles(old=>({...old,[drag.id]:updated}));
 };
 const end=()=>{
  motion.current=null;
 };
 const keyboardMove=(event:ReactKeyboardEvent<HTMLElement>,id:WorkspaceWindowId,kind:Motion["kind"])=>{
  if(!event.altKey||!["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(event.key))return;
  event.preventDefault();
  const amount=event.shiftKey?50:10;
  const dx=event.key==="ArrowLeft"?-amount:event.key==="ArrowRight"?amount:0;
  const dy=event.key==="ArrowUp"?-amount:event.key==="ArrowDown"?amount:0;
  const rect=rectangle(id);
  if(rect.maximized)return;
  update(id,kind==="move"?{...rect,x:rect.x+dx,y:rect.y+dy}:resizeWindowRectangle(rect,dx,dy,bounds));
  onFocus(id);
 };
 const toggleMaximize=(id:WorkspaceWindowId)=>{
  const rect=rectangle(id);update(id,{...rect,maximized:!rect.maximized});onFocus(id);
 };
 const arrange=(kind:"cascade"|"tile")=>{
  const active=items.map(i=>i.id).filter(id=>openIds.includes(id)&&!minimizedIds.includes(id));
  if(!active.length)return;
  const margin=12;
  const updates:Partial<Record<WorkspaceWindowId,WindowRectangle>>={};
  if(kind==="tile"){
   const columns=Math.ceil(Math.sqrt(active.length)),rows=Math.ceil(active.length/columns);
   const width=Math.max(1,(bounds.width-margin*(columns+1))/columns);
   const height=Math.max(1,(bounds.height-margin*(rows+1))/rows);
   active.forEach((id,i)=>updates[id]=clampWindowRectangle({
    x:margin+(i%columns)*(width+margin),y:margin+Math.floor(i/columns)*(height+margin),
    width,height,maximized:false
   },bounds));
  }else active.forEach((id,i)=>updates[id]=clampWindowRectangle({
   ...defaultWindowRectangle(id),x:margin+i*36,y:margin+i*32,
   width:Math.min(860,Math.max(1,bounds.width-80)),height:Math.min(590,Math.max(1,bounds.height-80)),
   maximized:false
  },bounds));
  setRectangles(old=>({...old,...updates}));
 };
 return <div className={"sp-window-workspace"+(windowed?" sp-mode-windows":" sp-mode-classic")}
  hidden={!visible} aria-label={windowed?"ShowPilot floating window workspace":"ShowPilot classic tab workspace"}>
  {windowed&&<div className="sp-window-toolbar">
   <div className="sp-window-toolbar-title"><Layers3 size={17}/>
    <strong>Windowed workspace</strong>
    <span>Open several tools, then drag their title bars or resize from the bottom-right corner.</span>
   </div>
   <div className="sp-window-toolbar-actions">
    <Button size="sm" variant="outline" onClick={()=>arrange("cascade")} disabled={!openIds.length}><RotateCcw size={15}/> Cascade</Button>
    <Button size="sm" variant="outline" onClick={()=>arrange("tile")} disabled={!openIds.length}><LayoutGrid size={15}/> Tile</Button>
   </div>
  </div>}
  <div ref={canvas} className="sp-window-canvas">
   {items.map(item=>{
    const opened=openIds.includes(item.id),minimized=minimizedIds.includes(item.id);
    const shown=opened&&!minimized&&(windowed||item.id===activeId);
    const rect=rectangle(item.id);
    const maximized=windowed&&rect.maximized;
    return <section key={item.id} hidden={!shown}
     className={"sp-floating-window"+(windowed?" sp-floating-movable":" sp-floating-classic")+
       (item.id===activeId?" sp-floating-focused":"")}
     style={windowed?{
      left:maximized?0:rect.x,top:maximized?0:rect.y,
      width:maximized?bounds.width:rect.width,height:maximized?bounds.height:rect.height,
      zIndex:10+Math.max(0,openIds.indexOf(item.id))
     }:undefined}
     aria-label={item.label+" workspace window"}
     onPointerDown={()=>{if(item.id!==activeId)onFocus(item.id);}}>
     {windowed&&<header className="sp-floating-header">
      <div className="sp-floating-drag" role="button" tabIndex={0}
       aria-label={"Move "+item.label+" window; Alt plus arrow keys"}
       title="Drag to move · Alt + Arrow keys to move · Shift + Alt + Arrow keys for larger steps"
       onDoubleClick={()=>toggleMaximize(item.id)}
       onPointerDown={event=>start(event,item.id,"move")}
       onPointerMove={move} onPointerUp={end} onPointerCancel={end}
       onKeyDown={event=>keyboardMove(event,item.id,"move")}>
       {item.icon}
       <div className="sp-floating-heading"><strong>{item.label}</strong><small>{item.description}</small></div>
      </div>
      <div className="sp-floating-actions">
       <button type="button" onClick={()=>onMinimize(item.id)} title={"Minimize "+item.label} aria-label={"Minimize "+item.label}><Minus size={17}/></button>
       <button type="button" onClick={()=>toggleMaximize(item.id)}
        title={rect.maximized?"Restore window":"Maximize window"}
        aria-label={(rect.maximized?"Restore ":"Maximize ")+item.label}>
        {rect.maximized?<Minimize2 size={16}/>:<Maximize2 size={16}/>}
       </button>
       <button type="button" onClick={()=>onClose(item.id)} title={"Close "+item.label+" (keeps editing state this session)"}
        aria-label={"Close "+item.label}><X size={17}/></button>
      </div>
     </header>}
     <div className="sp-floating-content">{item.content}</div>
     {windowed&&!rect.maximized&&<button type="button" className="sp-floating-resize"
      aria-label={"Resize "+item.label+" window; drag or Alt plus arrow keys"}
      title="Drag to resize · Alt + Arrow keys to resize"
      onPointerDown={event=>start(event,item.id,"resize")}
      onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      onKeyDown={event=>keyboardMove(event,item.id,"resize")}>
      <Grip size={17}/>
     </button>}
    </section>;
   })}
   {windowed&&openIds.every(id=>minimizedIds.includes(id))&&
    <div className="sp-workspace-empty">All windows are minimized. Select one from the window bar below, or open a tool from the sidebar.</div>}
  </div>
  {windowed&&<nav className="sp-window-dock" aria-label="Open ShowPilot windows">
   {openIds.map(id=>{
    const item=items.find(item=>item.id===id);
    if(!item)return null;
    const minimized=minimizedIds.includes(id);
    return <button key={id} type="button"
     className={"sp-window-dock-item"+(id===activeId&&!minimized?" is-focused":"")}
     onClick={()=>onFocus(id)}
     aria-label={(minimized?"Restore ":"Focus ")+item.label}>
      {item.icon}<span>{item.label}</span>{minimized&&<span className="sp-window-dock-mini">minimized</span>}
     </button>;
   })}
   {!openIds.length&&<span className="sp-window-dock-note">Choose a section in the sidebar to open its window.</span>}
  </nav>}
 </div>;
}
