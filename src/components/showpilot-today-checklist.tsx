import {useEffect,useMemo,useState,type FormEvent} from "react";
import {CheckCircle2,ClipboardList,Plus,Trash2} from "lucide-react";
import {Button} from "@/components/ui/button";
import {ShowPilotWhy} from "@/components/showpilot-why";
import type {PostConShow} from "@/lib/showpilot-postcon";
import type {AirwallAssessment} from "@/lib/showpilot-today";
import type {TaskNote} from "@/lib/work-tools";
import type {WorkbookWallTask} from "@/lib/showpilot-today-sources";
import type {BallroomTransition} from "@/lib/showpilot-ballroom-inference";
import {
 addTodayTask,buildingChecklistTasks,reconcileAirwallDay,checkTodayTask,checklistKey,
 loadTodayChecklist,removeTodayTask,tasksForShow,
 type ChecklistTask,type TodayChecklistState
} from "@/lib/showpilot-today-checklist";

type Props={
 day:string;shows:readonly PostConShow[];
 airwalls:Record<string,AirwallAssessment>;
 workbookWalls:readonly WorkbookWallTask[];
 suggestions:readonly TaskNote[];
 transitions:readonly BallroomTransition[];
};
const empty:TodayChecklistState={date:"",done:{},custom:[]};
export function ShowPilotTodayChecklist({day,shows,airwalls,workbookWalls,suggestions,transitions}:Props){
 const [state,setState]=useState<TodayChecklistState>(empty);
 const [handoffs,setHandoffs]=useState<Record<string,TodayChecklistState>>({});
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [newText,setNewText]=useState("");
 const [newScope,setNewScope]=useState("building");
 const [showCompleted,setShowCompleted]=useState(true);
 useEffect(()=>{
  let alive=true;
  setLoading(true);setError("");setMessage("");
  const days=[...new Set([day,...transitions.filter(t=>day>=t.afterDate&&day<=t.needByDate).map(t=>t.afterDate)])];
  void Promise.all(days.map(loadTodayChecklist)).then(snapshots=>{
   if(alive){setState(snapshots.find(s=>s.date===day)??{...empty,date:day});setHandoffs(Object.fromEntries(snapshots.map(s=>[s.date,s])));setLoading(false);}
  }).catch(e=>{
   if(alive){setState({...empty,date:day});setError("Couldn't restore today's checklist: "+String(e));setLoading(false);}
  });
  return ()=>{alive=false};
 },[day,transitions]);
 const airwallPlan=useMemo(()=>reconcileAirwallDay(day,workbookWalls,suggestions,transitions),[day,workbookWalls,suggestions,transitions]);
 const groups=useMemo(()=>{
  const building={
   scope:"building",title:"Building-wide setup",subtitle:"",
   tasks:buildingChecklistTasks(day,workbookWalls,suggestions,transitions)
  };
  const eventGroups=shows.map(show=>({
   scope:show.key,title:show.showName,
   subtitle:(show.eventId?"Event #"+show.eventId+" · ":"")+show.rooms,
   tasks:tasksForShow(show,airwalls[show.key]??{state:"unknown",findings:[]})
  }));
  return [building,...eventGroups];
 },[day,shows,airwalls,workbookWalls,suggestions,transitions]);
 const withManual=useMemo(()=>groups.map(g=>({
  ...g,
  tasks:[...g.tasks,...state.custom.filter(x=>x.scope===g.scope).map<ChecklistTask>(x=>({
   id:x.id,text:x.text,source:"manual" as const
  }))]
 })),[groups,state.custom]);
 const isChecked=(scope:string,task:ChecklistTask)=>!!(task.storageDay&&task.storageDay!==day?
  handoffs[task.storageDay]?.done[checklistKey(scope,task.id)]:
  state.done[checklistKey(scope,task.id)]);
 const all=withManual.flatMap(g=>g.tasks.map(task=>({scope:g.scope,task})));
 const completed=all.filter(t=>isChecked(t.scope,t.task)).length;
 const total=all.length;
 const work=async(action:()=>Promise<TodayChecklistState>,success:string)=>{
  if(saving||loading)return;
  setSaving(true);setError("");
  try{
   const next=await action();
   if(next.date===day)setState(next);
   setHandoffs(old=>({...old,[next.date]:next}));setMessage(success);
  }catch(e){
   setError("Couldn't save checklist change: "+(e instanceof Error?e.message:String(e)));
  }finally{setSaving(false);}
 };
 const toggle=(scope:string,task:ChecklistTask,checked:boolean)=>{
  void work(()=>checkTodayTask(task.storageDay??day,scope,task.id,checked),
   "Saved locally · "+new Date().toLocaleTimeString());
 };
 const addTask=async(e:FormEvent)=>{
  e.preventDefault();
  const text=newText.trim();
  if(!text||saving||loading)return;
  setSaving(true);setError("");
  try{
   const saved=await addTodayTask(day,newScope,text);
   if(saved.date===day){setState(saved);setNewText("");setMessage("Task added and saved locally.");}
  }catch(e){setError("Couldn't save the new task: "+(e instanceof Error?e.message:String(e)));}
  finally{setSaving(false);}
 };
 const remove=(scope:string,task:ChecklistTask)=>{
  if(!task.id.startsWith("custom:"))return;
  if(!window.confirm('Remove the custom task "'+task.text+'"?'))return;
  void work(()=>removeTodayTask(day,scope,task.id),"Custom task removed.");
 };
 return <section className="rounded-xl border bg-card p-4 space-y-4" aria-label="Today's operations checklist">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div>
    <h3 className="flex items-center gap-2 text-base font-semibold"><ClipboardList size={19}/> Today Operations Checklist</h3>
    <p className="mt-1 text-xs text-muted-foreground">Check off completed room setup, airwalls, lighting and event services. Saved separately for each day and event, even after restarting ShowPilot.</p>
   </div>
   <div className="text-right">
    <p className="flex items-center justify-end gap-1 text-sm font-semibold"><CheckCircle2 size={15}/>{completed} / {total} complete</p>
    <p className="text-xs text-muted-foreground">{saving?"Saving…":loading?"Loading…":"Offline checklist"}</p>
   </div>
  </div>
  <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar"
   aria-valuemin={0} aria-valuemax={total||1} aria-valuenow={completed} aria-label="Today tasks completed">
   <div className="h-full rounded-full bg-emerald-500 transition-all" style={{width:(total?completed/total*100:0)+"%"}}/>
  </div>
  {error&&<p role="alert" className="rounded-lg border border-red-500/60 px-3 py-2 text-xs text-red-500">{error}</p>}
  {message&&!error&&<p role="status" className="text-xs text-muted-foreground">{message}</p>}
  <div className="flex items-center gap-2">
   <input type="checkbox" id="showpilot-checklist-show-completed" checked={showCompleted}
    onChange={e=>setShowCompleted(e.target.checked)}/>
   <label htmlFor="showpilot-checklist-show-completed" className="text-xs text-muted-foreground">Show checked-off tasks</label>
  </div>
  <div className="grid gap-3 lg:grid-cols-2">
   {withManual.map(g=>{
    const done=g.tasks.filter(task=>isChecked(g.scope,task)).length;
    const visible=g.tasks.filter(task=>showCompleted||!isChecked(g.scope,task));
    return <div key={g.scope} className="rounded-lg border p-3 space-y-3">
     <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
       <h4 className="break-words text-sm font-semibold">{g.title}</h4>
       {g.subtitle&&<p className="break-words text-xs text-muted-foreground">{g.subtitle}</p>}
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{done}/{g.tasks.length}</span>
     </div>
     {g.scope==="building"&&airwallPlan.review.length>0&&
      <details className="rounded-md border border-amber-500/60 p-2 text-xs">
       <summary className="cursor-pointer font-semibold">
        {airwallPlan.review.some(x=>x.kind==="conflict")?"Conflicting ballroom setups — verify before moving":"Other proposed setups — not additional moves for today"}
        {" · "+airwallPlan.review.length+" source suggestion(s)"}
       </summary>
       <p className="mt-2 text-muted-foreground">ShowPilot compares the engineering workbook, Event Schedule and inferred event-to-event room changes. A contradictory or later arrangement is not automatically another task for today.</p>
       {airwallPlan.review.map(item=>
        <div key={item.id} className="mt-2 border-t pt-2 space-y-1">
         <div className="flex items-center gap-1">
          <strong>{item.kind==="conflict"?"Needs review":"Plan ahead"}: {item.target}</strong>
          <ShowPilotWhy label={item.target}>
           <p>{item.reason}</p>
           {item.sources.map((source,i)=><p key={i} className="border-t pt-1">{source}</p>)}
          </ShowPilotWhy>
         </div>
         <p className="text-muted-foreground">{item.reason}</p>
        </div>)}
      </details>}
     {g.scope==="building"&&!g.tasks.some(task=>task.id.startsWith("wall-"))&&!airwallPlan.review.length&&
      <p className="text-xs text-muted-foreground">No dated airwall movement was found in the saved engineering schedules for today. Verify the EOC before concluding no changes are required.</p>}
     <div className="space-y-2">
      {visible.map(task=>{
       const key=checklistKey(g.scope,task.id);
       const checked=isChecked(g.scope,task);
       const inputId="today-task-"+encodeURIComponent(day+"|"+key).replace(/%/g,"_");
       return <div key={task.id} className="flex items-start gap-2">
        <input id={inputId} type="checkbox" className="mt-0.5 size-4 shrink-0 accent-emerald-500"
         checked={checked} disabled={loading||saving} onChange={e=>toggle(g.scope,task,e.target.checked)}/>
        <div className="min-w-0 flex-1">
         <label htmlFor={inputId} className={"block cursor-pointer break-words text-sm "+(checked?"text-muted-foreground line-through":"")}>{task.text}</label>
         {task.detail&&<p className="mt-0.5 text-xs text-muted-foreground">{task.detail}</p>}
         {task.source==="schedule"&&<p className="text-xs text-amber-600">Dated engineering schedule — verify EOC and room availability</p>}
         {task.source==="inferred"&&<p className="text-xs text-amber-600">Inferred layout transition — confirm timing and EOC before moving walls</p>}
         {(task.source==="inferred"||task.source==="schedule")&&
          <ShowPilotWhy label={task.text}>
           <p>{task.detail||"This task was found in the saved schedule."}</p>
           <p>Completion is a manual acknowledgment. ShowPilot has not controlled the physical airwalls or verified their present position.</p>
          </ShowPilotWhy>
         {task.source==="eoc"&&<p className="text-xs text-amber-600">Document note — confirm date and timing</p>}
        </div>
        {task.source==="manual"&&<button type="button" disabled={saving||loading}
         aria-label={"Remove task "+task.text} className="rounded p-1 text-muted-foreground hover:text-destructive"
         onClick={()=>remove(g.scope,task)}><Trash2 size={14}/></button>}
       </div>;
      })}
      {!visible.length&&<p className="text-xs text-muted-foreground">All tasks in this group are checked off.</p>}
     </div>
    </div>;
   })}
  </div>
  <form onSubmit={e=>void addTask(e)} className="rounded-lg border p-3 space-y-2">
   <h4 className="text-sm font-semibold">Add a task</h4>
   <div className="flex flex-wrap items-center gap-2">
    <input type="text" maxLength={160} value={newText} onChange={e=>setNewText(e.target.value)}
     placeholder="e.g., Check ballroom lighting preset" aria-label="New operations task"
     className="min-w-[190px] flex-1 rounded border bg-background px-3 py-2 text-sm" disabled={loading||saving}/>
    <select aria-label="Assign task to" value={newScope} onChange={e=>setNewScope(e.target.value)}
     className="max-w-full min-w-[150px] rounded border bg-background px-2 py-2 text-sm" disabled={loading||saving}>
     <option value="building">Building-wide</option>
     {shows.map(show=><option value={show.key} key={show.key}>{show.showName}</option>)}
    </select>
    <Button size="sm" type="submit" disabled={loading||saving||!newText.trim()}><Plus size={15}/> Add task</Button>
   </div>
   <p className="text-xs text-muted-foreground">Building-wide airwall tasks and their follow-up lighting checks only appear when a dated schedule calls for a change. Each requires a separate completion check. Checking a task never controls physical equipment or changes your saved schedules.</p>
  </form>
 </section>;
}
