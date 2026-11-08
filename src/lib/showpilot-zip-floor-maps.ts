import type {EventZipInspection} from "./showpilot-memory-bridge";

/** A ZIP may contain a floor plan and an identical "[1]" copy.
 * SHA-256 values come from the bounded, CRC-verified ZIP inspector, so only
 * byte-identical files are labeled duplicates. */
export function floorMapsFromZip(files:readonly EventZipInspection["files"][number][]):{
 maps:EventZipInspection["files"];
 duplicates:EventZipInspection["files"];
 drawings:EventZipInspection["files"];
}{
 const maps:EventZipInspection["files"]=[];
 const duplicates:EventZipInspection["files"]=[];
 const drawings:EventZipInspection["files"]=[];
 const fingerprints=new Set<string>();
 for(const item of files){
  if(item.kind!=="diagram")continue;
  const ext=item.name.split(".").pop()?.toLowerCase()??"";
  if(!["pdf","png","jpg","jpeg","webp"].includes(ext)){
   drawings.push(item);continue;
  }
  const signature=item.sha256?"sha256:"+item.sha256:"path:"+item.path.toLowerCase();
  if(fingerprints.has(signature))duplicates.push(item);
  else{fingerprints.add(signature);maps.push(item);}
 }
 return {maps,duplicates,drawings};
}
