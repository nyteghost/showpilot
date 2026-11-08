/** Limit responses from small local models to useful conversational text. */
export function conciseChatReference(value:string):string{
 const text=value.trim();
 if(!text||/ZIP Schedule:|eventId|showName|reviewed|\\u00|\\\"|\\n|\.zip\b|\.pdf\b/i.test(text))return "";
 if((text.match(/[{}\[\]\\]/g)||[]).length>3)return "";
 return text.replace(/\s+/g," ").slice(0,180);
}
export function conciseChatAnswer(raw:string):string{
 let text=raw.trim();
 if(!text)return "";
 if(text.startsWith("{")||text.startsWith("[")){
  try{const obj:unknown=JSON.parse(text);
   if(obj&&typeof obj==="object"){
    const record=obj as Record<string,unknown>;
    text=typeof record.answer==="string"?record.answer:
     typeof record.reply==="string"?record.reply:
     typeof record.message==="string"?record.message:
     "I found structured data instead of a clear answer. Please rephrase your question.";
   }
  }catch{return "I found raw document data instead of an answer. Please ask about the specific rule.";}
 }
 if(/ZIP Schedule:|eventId|showName|\\u00|\\\"|\\n|\.zip\b|\.pdf\b/i.test(text))
  return "That looks like document metadata, not a useful answer. Please ask about the specific show or rule.";
 const sentences=text.replace(/\s+/g," ").split(/(?<=[.!?])\s+/).filter(Boolean);
 const words=sentences.slice(0,2).join(" ").split(/\s+/);
 return (words.length>45?words.slice(0,45).join(" ")+"…":words.join(" ")).slice(0,320);
}
