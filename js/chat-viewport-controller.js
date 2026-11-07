/* One source of truth for conversation viewport and keyboard geometry. */
(function installFarnazChatViewportController(){
  const win=window,doc=document,root=doc.documentElement,body=doc.body;
  win.FarnazChatViewportController?.destroy?.();

  let observer=null,observedHeader=null,observedComposer=null;
  let framePending=false,keyboardWasOpen=false;
  let baselineHeight=0;
  const listeners=[];
  const listen=(target,type,handler,options)=>{
    if(!target?.addEventListener)return;
    target.addEventListener(type,handler,options);
    listeners.push(()=>target.removeEventListener(type,handler,options));
  };
  const positive=value=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):null;
  function viewportMetrics(){
    const visual=positive(win.visualViewport?.height);
    const inner=positive(win.innerHeight);
    const documentHeight=positive(root.clientHeight);
    const values=[visual,inner,documentHeight].filter(Boolean);
    return {visibleHeight:Math.max(1,Math.min(...values)),layoutHeight:Math.max(1,...values)};
  }
  function activeChat(){
    return body.classList.contains("chat-mode")||body.classList.contains("spaces-chat-mode");
  }
  function focusedComposer(){
    return !!doc.activeElement?.matches?.("#messageText,#spaceText");
  }
  function measureAnchors(){
    const page=doc.getElementById("chatPage");
    const header=doc.querySelector("body.chat-mode #chatPage>.chat-header,body.spaces-chat-mode #chatPage>.chat-header");
    const composer=doc.querySelector("body.chat-mode #chatPage>#sendMessageForm,body.spaces-chat-mode #chatPage>#sendMessageForm");
    if(!page||!header||!composer)return;
    const headerHeight=Math.ceil(header.getBoundingClientRect().height||56);
    const composerHeight=Math.ceil(composer.getBoundingClientRect().height||76);
    page.style.setProperty("--chat-header-height",headerHeight+"px");
    page.style.setProperty("--chat-composer-height",composerHeight+"px");
    if(header!==observedHeader||composer!==observedComposer){
      observer?.disconnect();
      observedHeader=header;observedComposer=composer;
      if(typeof win.ResizeObserver==="function"){
        observer=new win.ResizeObserver(measureAnchors);
        observer.observe(header);observer.observe(composer);
      }
    }
  }
  function syncViewport(){
    if(!activeChat()){
      root.style.removeProperty("--chat-viewport-height");
      root.style.removeProperty("--chat-viewport-offset");
      body.classList.remove("keyboard-open");
      keyboardWasOpen=false;
      const metrics=viewportMetrics();baselineHeight=metrics.layoutHeight;
      observer?.disconnect();observer=null;observedHeader=null;observedComposer=null;
      return;
    }
    const metrics=viewportMetrics();
    const focused=focusedComposer();
    const shrink=baselineHeight-metrics.visibleHeight;
    const threshold=Math.max(110,baselineHeight*.16);
    const touchDevice=(Number(win.navigator?.maxTouchPoints)||0)>0||
      !!win.matchMedia?.("(pointer: coarse)")?.matches;
    const keyboardOpen=touchDevice&&(focused||keyboardWasOpen)&&shrink>threshold;
    root.style.setProperty("--chat-viewport-height",metrics.visibleHeight+"px");
    // Keep the app shell at the physical safe-area top; iOS standalone can report
    // transient offsetTop changes during keyboard animation.
    root.style.setProperty("--chat-viewport-offset","0px");
    measureAnchors();
    body.classList.toggle("keyboard-open",keyboardOpen);
    keyboardWasOpen=keyboardOpen;
    if(!focused&&!keyboardOpen)baselineHeight=metrics.layoutHeight;
  }
  function scheduleSync(){
    if(framePending)return;
    framePending=true;
    win.requestAnimationFrame(()=>{
      framePending=false;
      syncViewport();
    });
  }
  function onFocusChange(){scheduleSync();}
  listen(doc,"focusin",onFocusChange);
  listen(doc,"focusout",onFocusChange);
  listen(win,"resize",scheduleSync);
  listen(win,"orientationchange",scheduleSync);
  listen(win,"pageshow",scheduleSync);
  listen(win,"farnaz:navigate",scheduleSync);
  listen(win.visualViewport,"resize",scheduleSync);
  listen(win.visualViewport,"scroll",scheduleSync);
  listen(doc,"visibilitychange",scheduleSync);
  listen(doc,"click",event=>{
    if(event.target?.closest?.("#backToChats,#backSpaces,.nav-button"))scheduleSync();
  });
  if(typeof win.ResizeObserver==="function"){
    observer=new win.ResizeObserver(measureAnchors);
  }
  baselineHeight=viewportMetrics().layoutHeight;
  const api={
    sync:scheduleSync,
    destroy(){
      listeners.splice(0).forEach(remove=>remove());
      observer?.disconnect();observer=null;
      root.style.removeProperty("--chat-viewport-height");
      root.style.removeProperty("--chat-viewport-offset");
      body.classList.remove("keyboard-open");
      if(win.FarnazChatViewportController===api)delete win.FarnazChatViewportController;
    }
  };
  win.FarnazChatViewportController=api;
  scheduleSync();
})();