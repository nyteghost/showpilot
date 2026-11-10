/** Validate on-device model commentary before display.
 * This never treats an AI opinion as approval for an operational action. */
export const RULE_REVIEW_JSON_SCHEMA=JSON.stringify({
 type:"object",
 properties:{
  opinion:{type:"string"},
  checks:{type:"array",items:{type:"string"}}
 },
 required:["opinion","checks"]
});

export type VerifiedRuleOpinion={opinion:string;checks:string[]};

export function validateRuleReviewResponse(raw:unknown):VerifiedRuleOpinion{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))
  throw new Error("Local AI returned no valid review object. Retry the review or use a larger model.");
 const item=raw as Record<string,unknown>;
 if(typeof item.opinion!=="string"||!item.opinion.trim())
  throw new Error("Local AI omitted its written opinion. Retry the review or use a larger model.");
 if(item.opinion.length>900)
  throw new Error("Local AI opinion exceeded the safe length limit (900 characters).");
 if(!Array.isArray(item.checks))
  throw new Error("Local AI omitted the required checks list. Retry the review or use a larger model.");
 if(item.checks.length>5)
  throw new Error("Local AI provided too many checks (maximum five).");
 if(!item.checks.every(x=>typeof x==="string"))
  throw new Error("Local AI checks contained non-text values. Retry the review.");
 if(!item.checks.every((x:string)=>x.length<=240))
  throw new Error("Local AI check exceeded the safe length limit (240 characters).");
 return {opinion:item.opinion.trim(),checks:(item.checks as string[]).slice(0,3).map(x=>x.trim()).filter(Boolean)};
}
