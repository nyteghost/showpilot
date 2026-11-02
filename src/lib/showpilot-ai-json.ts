/** WebLLM's JSON grammar matcher expects a JSON schema *string*.
 * Supplying only {type:"json_object"} can trigger GrammarMatcherInitError
 * ("Cannot pass non-string to std::string") in some runtime builds.
 * The model is still untrusted: validateTaskResponse enforces date/room scope.
 */
export const TASK_JSON_SCHEMA = JSON.stringify({
  type:"object",
  properties:{
    suggestions:{
      type:"array",
      items:{
        type:"object",
        properties:{
          date:{type:"string"},
          room:{type:"string"},
          section:{type:"string"},
          task:{type:"string"},
          reason:{type:"string"},
          evidence:{type:"array",items:{type:"string"}}
        },
        required:["date","room","section","task","reason","evidence"]
      }
    }
  },
  required:["suggestions"]
});

export function isGrammarInitFailure(err:unknown):boolean {
  const message=err instanceof Error?err.message:String(err??"");
  return /GrammarMatcherInitError|Failed to initialize the grammar matcher|Cannot pass non-string to std::string/i.test(message);
}

/** Parse model text defensively, including optional Markdown fences.
 * Never interpret a non-JSON narrative as task instructions.
 */
export function parseTaskJson(text:string):unknown {
  const raw=text.trim().replace(/^\`\`\`(?:json)?\s*/i,"").replace(/\s*\`\`\`$/,"").trim();
  if(!raw)throw new Error("Local AI returned an empty response. No tasks were added.");
  try{return JSON.parse(raw)}catch {
    // A text-only fallback model sometimes surrounds its JSON with a short
    // explanation; extract one complete object if available.
    const start=raw.indexOf("{");
    if(start<0)throw new Error("Local AI did not return JSON. No tasks were added.");
    let depth=0,quoted=false,escaped=false;
    for(let i=start;i<raw.length;i++){
      const ch=raw[i]!;
      if(quoted){
        if(escaped)escaped=false;
        else if(ch==="\\")escaped=true;
        else if(ch==='"')quoted=false;
      } else if(ch==='"')quoted=true;
      else if(ch==="{")depth++;
      else if(ch==="}"&&--depth===0){
        try{return JSON.parse(raw.slice(start,i+1))}
        catch{break}
      }
    }
    throw new Error("Local AI produced malformed JSON. No tasks were added; try again.");
  }
}
