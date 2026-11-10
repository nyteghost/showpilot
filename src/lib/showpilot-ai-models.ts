/** Small, WebGPU-friendly local models exposed in ShowPilot Settings.
 * Only models actually shipped in WebLLM's prebuiltAppConfig are returned.
 * Keep the current Qwen selection first for existing installations.
 */
export const LLAMA_3_2_3B_Q4F16_MODEL="Llama-3.2-3B-Instruct-q4f16_1-MLC";
export const DEFAULT_SHOWPILOT_LOCAL_MODEL="Qwen2.5-1.5B-Instruct-q4f16_1-MLC";

export function selectShowPilotLocalModels(available:readonly string[]):string[]{
 const supported=new Set(available);
 const preferred=[
  DEFAULT_SHOWPILOT_LOCAL_MODEL,
  LLAMA_3_2_3B_Q4F16_MODEL,
  "Llama-3.2-1B-Instruct-q4f16_1-MLC"
 ];
 const small=available.filter(model=>
  /Qwen2.*(?:0\\.5B|1\\.5B)|Llama-3\\.2-(?:1|3)B|SmolLM.*1\\.7B/i.test(model)&&/q4/i.test(model)
 );
 return [...new Set([...preferred.filter(id=>supported.has(id)),...small])].slice(0,10);
}
