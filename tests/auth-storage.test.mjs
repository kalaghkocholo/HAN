import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync(new URL("../js/auth-storage.js",import.meta.url),"utf8");

function createStorage(){
  const cookies=new Map();
  const values=new Map();
  const localStorage={
    getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key),
  };
  const document={};
  Object.defineProperty(document,"cookie",{
    get(){return [...cookies].map(([key,value])=>key+"="+value).join("; ");},
    set(line){
      const pair=line.split(";",1)[0];
      const separator=pair.indexOf("=");
      const name=pair.slice(0,separator),value=pair.slice(separator+1);
      if(/(?:^|;\s*)Max-Age=0(?:;|$)/i.test(line))cookies.delete(name);
      else cookies.set(name,value);
    }
  });
  const window={location:{protocol:"https:"},localStorage};
  const navigator={storage:{persisted:async()=>false,persist:async()=>true}};
  vm.runInNewContext(source,{window,document,navigator,console});
  return {storage:window.FarnazAuthStorage,cookies,values};
}

test("persists a session in chunked cookies and restores it after localStorage is cleared",async()=>{
  const {storage,cookies,values}=createStorage();
  const key="sb-project-auth-token";
  const session=JSON.stringify({access_token:"a".repeat(5000),refresh_token:"refresh-token",user:{id:"user-1"}});
  await storage.setItem(key,session);
  assert.ok(cookies.has(key+".chunks"));
  assert.ok(Number(cookies.get(key+".chunks"))>1);
  values.clear();
  assert.equal(await storage.getItem(key),session);
});

test("migrates an existing Supabase localStorage session into persistent cookies",async()=>{
  const {storage,cookies,values}=createStorage();
  const key="sb-project-auth-token";
  const session=JSON.stringify({access_token:"access",refresh_token:"refresh"});
  values.set(key,session);
  assert.equal(await storage.getItem(key),session);
  assert.ok(cookies.has(key+".chunks"));
});

test("removes every cookie chunk and the localStorage fallback on sign-out",async()=>{
  const {storage,cookies,values}=createStorage();
  const key="sb-project-auth-token";
  await storage.setItem(key,JSON.stringify({access_token:"x".repeat(6000)}));
  assert.ok(cookies.size>1);
  await storage.removeItem(key);
  assert.equal(cookies.size,0);
  assert.equal(values.has(key),false);
  assert.equal(await storage.getItem(key),null);
});

test("requests persistent storage from WebKit when the API is available",async()=>{
  const {storage}=createStorage();
  assert.equal(await storage.requestPersistence(),true);
});
