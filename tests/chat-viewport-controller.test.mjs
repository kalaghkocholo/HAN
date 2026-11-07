import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source=readFileSync(new URL("../js/chat-viewport-controller.js",import.meta.url),"utf8");

class Events{
  constructor(){this.handlers=new Map();}
  addEventListener(type,fn){if(!this.handlers.has(type))this.handlers.set(type,new Set());this.handlers.get(type).add(fn);}
  removeEventListener(type,fn){this.handlers.get(type)?.delete(fn);}
  dispatch(type,event={}){for(const fn of this.handlers.get(type)||[])fn({target:this,...event});}
}
class Classes{
  constructor(...items){this.items=new Set(items);}
  contains(value){return this.items.has(value);}
  add(value){this.items.add(value);}
  remove(value){this.items.delete(value);}
  toggle(value,force){if(force===undefined)force=!this.items.has(value);if(force)this.items.add(value);else this.items.delete(value);return force;}
}
class Style{
  constructor(){this.values=new Map();}
  setProperty(key,value){this.values.set(key,String(value));}
  removeProperty(key){this.values.delete(key);}
  getPropertyValue(key){return this.values.get(key)||"";}
}
function harness(){
  const win=new Events(),doc=new Events(),visual=new Events();
  const body={classList:new Classes("chat-mode")};
  const root={style:new Style(),clientHeight:800};
  const page={style:new Style()};
  const header={getBoundingClientRect:()=>({height:58})};
  const composer={getBoundingClientRect:()=>({height:104})};
  const list={scrollTop:240,scrollHeight:1200,clientHeight:500};
  const input={id:"messageText",matches(selector){return selector.includes("#messageText");}};
  doc.body=body;doc.documentElement=root;doc.activeElement={};
  doc.getElementById=id=>id==="chatPage"?page:id==="messageList"?list:null;
  doc.querySelector=selector=>selector.includes(".chat-header")?header:selector.includes("#sendMessageForm")?composer:null;
  win.visualViewport=visual;win.innerHeight=800;win.navigator={maxTouchPoints:1};
  win.matchMedia=()=>({matches:false});
  win.requestAnimationFrame=fn=>{fn();return 1;};
  class RO{constructor(fn){this.fn=fn;harness.observers.push(this);}observe(){}disconnect(){}}
  harness.observers=[];
  win.ResizeObserver=RO;
  vm.runInNewContext(source,{window:win,document:doc,Number,Math});
  return {win,doc,visual,body,root,page,header,composer,list,input};
}

test("keeps the composer anchored and detects a mobile keyboard from one viewport source",()=>{
  const h=harness(),controller=h.win.FarnazChatViewportController;
  assert.equal(h.root.style.getPropertyValue("--chat-viewport-height"),"800px");
  assert.equal(h.page.style.getPropertyValue("--chat-composer-height"),"104px");
  h.doc.activeElement=h.input;
  h.visual.height=430;h.root.clientHeight=800;h.win.innerHeight=800;
  controller.sync();
  assert.equal(h.body.classList.contains("keyboard-open"),true);
  assert.equal(h.root.style.getPropertyValue("--chat-viewport-height"),"430px");
  assert.equal(h.list.scrollTop,240,"keyboard opening must not force-scroll a user reading older messages");
});

test("does not classify desktop viewport resizing as an on-screen keyboard",()=>{
  const h=harness();h.win.navigator.maxTouchPoints=0;
  h.doc.activeElement=h.input;h.win.innerHeight=500;h.root.clientHeight=500;h.visual.height=500;
  h.win.FarnazChatViewportController.sync();
  assert.equal(h.body.classList.contains("keyboard-open"),false);
});

test("releases keyboard state and viewport variables after leaving a conversation",()=>{
  const h=harness();
  h.doc.activeElement=h.input;h.visual.height=430;h.win.FarnazChatViewportController.sync();
  assert.equal(h.body.classList.contains("keyboard-open"),true);
  h.body.classList.remove("chat-mode");
  h.win.FarnazChatViewportController.sync();
  assert.equal(h.body.classList.contains("keyboard-open"),false);
  assert.equal(h.root.style.getPropertyValue("--chat-viewport-height"),"");
});

test("tracks measured composer height when the layout changes",()=>{
  const h=harness();
  h.composer.getBoundingClientRect=()=>({height:148});
  h.win.FarnazChatViewportController.sync();
  assert.equal(h.page.style.getPropertyValue("--chat-composer-height"),"148px");
});
