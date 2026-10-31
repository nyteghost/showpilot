import {describe,it,expect} from "vitest";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const {secureStorageAvailable,secureStorageRequirement}=require("../../desktop/secure-storage.cjs");
const mocked=(backend:string,available=true)=>({
 isEncryptionAvailable:()=>available,
 getSelectedStorageBackend:()=>backend,
});
describe("ShowPilot secure credentials on CachyOS / KDE",()=>{
 it("allows real KWallet 6, KWallet 5 and libsecret keyrings",()=>{
  for(const name of ["kwallet","kwallet5","kwallet6","gnome_libsecret"]){
    expect(secureStorageAvailable(mocked(name),"linux")).toBe(true);
  }
 });
 it("blocks Electron's insecure basic_text fallback and undefined backends",()=>{
  for(const name of ["basic_text","unknown","", "unauthorized"]){
    expect(secureStorageAvailable(mocked(name),"linux")).toBe(false);
  }
  expect(secureStorageAvailable({isEncryptionAvailable:()=>true},"linux")).toBe(false);
  expect(secureStorageAvailable(mocked("kwallet6",false),"linux")).toBe(false);
 });
 it("does not unnecessarily change Windows OS encryption",()=>{
  expect(secureStorageAvailable({isEncryptionAvailable:()=>true},"win32")).toBe(true);
  expect(secureStorageAvailable({isEncryptionAvailable:()=>false},"win32")).toBe(false);
 });
 it("fails closed if Electron throws or storage is missing",()=>{
  expect(secureStorageAvailable(null,"linux")).toBe(false);
  expect(secureStorageAvailable({isEncryptionAvailable:()=>{throw Error("bad")}},"linux")).toBe(false);
  expect(secureStorageRequirement("linux")).toContain("KWallet");
  expect(secureStorageRequirement("linux")).toContain("basic_text");
 });
});
