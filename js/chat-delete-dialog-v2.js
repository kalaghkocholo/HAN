async function loadMessages(older=false){
  if(!currentUser||!currentChatUser)return;
  const request=++chatRequestNumber,myId=currentUser.id,contactId=currentChatUser.user_id;
  if(!older){
    $("messageList").replaceChildren();messageLoadedCount=50;messageHasMore=false;
    selectedMessageIds.clear();messageSelectionMode=false;updateSelectionToolbar();
    $("loadOlderButton").hidden=true;
  }
  setStatus("sendMessageStatus",english?"Loading messages...":"در حال بارگذاری پیام‌ها...");
  try{
    const client=getClient(),existing=Array.from($("messageList").querySelectorAll(".message[data-created-at]"));
    const oldest=older&&existing.length?existing[0]:null;
    // Query each direction separately to avoid fragile nested PostgREST OR filters.
    const results=await retryRead("messages",()=>{
      let sent=client.from("messages")
        .select("id,sender_id,receiver_id,body,created_at,message_type,attachment_path,attachment_name,attachment_mime,reply_to_id,edited_at")
        .eq("sender_id",myId).eq("receiver_id",contactId).order("created_at",{ascending:false}).limit(50);
      let received=client.from("messages")
        .select("id,sender_id,receiver_id,body,created_at,message_type,attachment_path,attachment_name,attachment_mime,reply_to_id,edited_at")
        .eq("sender_id",contactId).eq("receiver_id",myId).order("created_at",{ascending:false}).limit(50);
      if(oldest){sent=sent.lt("created_at",oldest.dataset.createdAt);received=received.lt("created_at",oldest.dataset.createdAt);}
      return Promise.all([sent,received]);
    });
    if(request!==chatRequestNumber||currentUser?.id!==myId||currentChatUser?.user_id!==contactId)return;
    let data=[...(results[0].data||[]),...(results[1].data||[])];
    data.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    messageHasMore=data.length>(older?0:50);
    // Fetch up to 50 combined messages; direction queries each return at most 50.
    const page=data.slice(0,50),rows=page.reverse();
    let hiddenIds=new Set();
    try{
      const hidden=await retryRead("hidden messages",()=>client.from("message_hidden").select("message_id").eq("user_id",myId));
      if(!hidden.error)hiddenIds=new Set((hidden.data||[]).map(x=>x.message_id));
      else console.warn("Could not load hidden-message preferences:",hidden.error);
    }catch(hiddenError){console.warn("Could not load hidden-message preferences:",hiddenError);}
    const visibleRows=rows.filter(m=>!hiddenIds.has(m.id));
    if(older){await prependMessages(visibleRows,myId);messageLoadedCount+=50;}
    else await renderMessages(visibleRows,myId);
    messageHasMore=data.length>50 || (data.length===50);
    $("loadOlderButton").hidden=!messageHasMore;
    setStatus("sendMessageStatus","");
  }catch(e){
    console.error("Load messages:",e);
    setStatus("sendMessageStatus",(english?"Could not load messages: ":"دریافت پیام‌ها ناموفق بود: ")+e.message,true);
  }
}
async function makeMessageElement(m,myId){
  const item=document.createElement("article");item.className="message "+(m.sender_id===myId?"my-message":"their-message");
  item.dataset.messageId=m.id;item.dataset.createdAt=m.created_at;
  if(selectedMessageIds.has(m.id))item.classList.add("selected");
  if(m.reply_to_id){
    try{const {data}=await getClient().from("messages").select("body,attachment_name").eq("id",m.reply_to_id).maybeSingle();
      if(data){const q=document.createElement("div");q.className="message-quote";q.textContent=(english?"Replying to: ":"در پاسخ به: ")+(data.body||data.attachment_name||"");item.appendChild(q);}}catch(e){console.warn(e);}
  }
  if(m.body){const body=document.createElement("p");body.textContent=m.body;item.appendChild(body);}
  if(m.attachment_path){
    const {data,error}=await getClient().storage.from("chat-attachments").createSignedUrl(m.attachment_path,3600);
    if(!error&&data?.signedUrl){
      if((m.message_type||"image")==="image"){const img=document.createElement("img");img.src=data.signedUrl;img.alt=m.attachment_name||"Photo";img.loading="lazy";item.appendChild(img);}
      else if((m.attachment_mime||"").startsWith("audio/")){const audio=document.createElement("audio");audio.controls=true;audio.preload="metadata";audio.src=data.signedUrl;audio.setAttribute("aria-label",m.attachment_name||"Voice message");audio.style.display="block";audio.style.maxWidth="240px";item.appendChild(audio);}
      else{const link=document.createElement("a");link.href=data.signedUrl;link.target="_blank";link.rel="noopener";link.download=m.attachment_name||"";link.textContent="📎 "+(m.attachment_name||"Download file");item.appendChild(link);}
    }else{const n=document.createElement("small");n.textContent=english?"Attachment unavailable":"پیوست در دسترس نیست";item.appendChild(n);}
  }
  const time=document.createElement("time"),date=new Date(m.created_at);time.dateTime=date.toISOString();
  time.textContent=date.toLocaleTimeString(english?"en":"fa-IR",{hour:"2-digit",minute:"2-digit"})+(m.edited_at?(english?" · edited":" · ویرایش‌شده"):"");item.appendChild(time);
  let pointerHold=null,touchHold=null,holdTriggered=false,holdX=0,holdY=0;
  const interactiveTarget=target=>!!target.closest("a,button,audio,video,input,textarea,select");
  const cancelPointerHold=()=>{clearTimeout(pointerHold);pointerHold=null;};
  const cancelTouchHold=()=>{clearTimeout(touchHold);touchHold=null;};
  item.addEventListener("click",event=>{
    if(holdTriggered){event.preventDefault();event.stopPropagation();holdTriggered=false;return;}
    if(messageSelectionMode){toggleMessageSelection(m.id,item);return;}
    if(interactiveTarget(event.target))return;
  });
  item.addEventListener("contextmenu",e=>{
    e.preventDefault();e.stopPropagation();
    if(!document.querySelector(".message-tools-floating"))showMessageActions(m,item);
  });
  // Mouse/trackpad long-press. Keep this timer separate from touch events:
  // iOS can emit pointerleave during a stationary touch and cancel a shared timer.
  item.addEventListener("pointerdown",event=>{
    if(event.pointerType==="touch"||interactiveTarget(event.target))return;
    holdTriggered=false;holdX=event.clientX;holdY=event.clientY;cancelPointerHold();
    pointerHold=setTimeout(()=>{holdTriggered=true;showMessageActions(m,item);},500);
  });
  item.addEventListener("pointermove",event=>{
    if(event.pointerType==="touch")return;
    if(Math.abs(event.clientX-holdX)>12||Math.abs(event.clientY-holdY)>12)cancelPointerHold();
  });
  ["pointerup","pointercancel","pointerleave"].forEach(ev=>item.addEventListener(ev,event=>{
    if(event.pointerType!=="touch")cancelPointerHold();
  }));
  // Native iOS touch path: don't share a timer with Pointer Events.
  item.addEventListener("touchstart",event=>{
    if(event.touches.length!==1||interactiveTarget(event.target))return;
    const touch=event.touches[0];holdX=touch.clientX;holdY=touch.clientY;holdTriggered=false;cancelTouchHold();
    touchHold=setTimeout(()=>{holdTriggered=true;showMessageActions(m,item);},500);
  },{passive:true});
  item.addEventListener("touchmove",event=>{
    if(!event.touches.length)return;
    const touch=event.touches[0];
    if(Math.abs(touch.clientX-holdX)>12||Math.abs(touch.clientY-holdY)>12)cancelTouchHold();
  },{passive:true});
  item.addEventListener("touchend",cancelTouchHold);
  item.addEventListener("touchcancel",cancelTouchHold);
  return item;
}
async function renderMessages(messages,myId){
  const list=$("messageList");list.replaceChildren();
  if(!messages.length){const empty=document.createElement("div");empty.className="empty-state";empty.textContent=english?"No messages yet. Say hello!":"هنوز پیامی ردوبدل نشده؛ سلام کن!";list.appendChild(empty);}
  for(const m of messages)list.appendChild(await makeMessageElement(m,myId));
  list.scrollTop=list.scrollHeight;
}
async function prependMessages(messages,myId){
  const list=$("messageList"),oldHeight=list.scrollHeight,oldTop=list.scrollTop,frag=document.createDocumentFragment();
  for(const m of messages)frag.appendChild(await makeMessageElement(m,myId));
  list.prepend(frag);list.scrollTop=oldTop+(list.scrollHeight-oldHeight);
}
async function loadOlderMessages(){if(messageHasMore)await loadMessages(true);}
function clearMessageActionOverlay(){
  document.querySelectorAll(".message-action-backdrop,.message-action-clone").forEach(node=>node.remove());
  document.querySelectorAll(".message.context-active").forEach(node=>{node.style.visibility="";node.classList.remove("context-active");});
}
function dismissMessageMenus(except=null){
  document.querySelectorAll(".message-tools").forEach(menu=>{if(!except||!except.contains(menu))menu.remove();});
  if(!except)clearMessageActionOverlay();
}
document.addEventListener("pointerdown",event=>{
  if(event.target.closest(".message-tools"))return;
  dismissMessageMenus();
  if(messageSelectionMode&&!event.target.closest(".message, #selectionToolbar"))exitMessageSelection();
});
function showMessageActions(m,item){
  if(messageSelectionMode){toggleMessageSelection(m.id,item);return;}
  dismissMessageMenus();
  const rect=item.getBoundingClientRect();
  const backdrop=document.createElement("div");backdrop.className="message-action-backdrop";backdrop.setAttribute("aria-hidden","true");
  backdrop.addEventListener("click",()=>dismissMessageMenus());document.body.appendChild(backdrop);
  const clone=item.cloneNode(true);clone.className=item.className+" message-action-clone";
  clone.style.left=rect.left+"px";clone.style.top=rect.top+"px";clone.style.width=rect.width+"px";clone.style.height=rect.height+"px";
  clone.style.borderRadius=getComputedStyle(item).borderRadius;document.body.appendChild(clone);
  item.classList.add("context-active");item.style.visibility="hidden";
  const restoreItem=()=>{item.style.visibility="";item.classList.remove("context-active");};
  const menu=document.createElement("div");menu.className="message-tools message-tools-floating";
  const closeMenu=()=>{menu.remove();restoreItem();clearMessageActionOverlay();};
  const add=(label,fn,cls="mini-button")=>{const b=document.createElement("button");b.type="button";b.className=cls;b.textContent=label;b.onclick=()=>{closeMenu();fn();};menu.appendChild(b);};
  add(english?"Reply":"پاسخ",()=>setReplyTarget(m));
  add(english?"Select":"انتخاب",()=>{messageSelectionMode=true;toggleMessageSelection(m.id,item);updateSelectionToolbar();});
  if(m.sender_id===currentUser.id)add(english?"Edit":"ویرایش",()=>editMessage(m));
  add(english?"Delete":"حذف",()=>deleteMessage(m),"mini-button danger");
  const close=document.createElement("button");close.type="button";close.className="message-tools-dismiss";close.textContent="×";close.setAttribute("aria-label",english?"Close":"بستن");close.onclick=closeMenu;menu.appendChild(close);
  document.body.appendChild(menu);
  const menuRect=menu.getBoundingClientRect(),margin=12;
  let left=Math.max(margin,Math.min(rect.left+(rect.width-menuRect.width)/2,window.innerWidth-menuRect.width-margin));
  let top=rect.top-menuRect.height-8;
  if(top<margin)top=Math.min(window.innerHeight-menuRect.height-margin,rect.bottom+8);
  menu.style.left=left+"px";menu.style.top=Math.max(margin,top)+"px";
}
function setReplyTarget(m){
  replyTarget=m;const preview=$("replyPreview");preview.replaceChildren();preview.hidden=false;
  const text=document.createElement("span");text.className="message-quote-text";
  text.textContent=(english?"Replying to: ":"در پاسخ به: ")+(m.body||m.attachment_name||(english?"Photo":"عکس"));
  const close=document.createElement("button");close.type="button";close.className="message-quote-cancel";close.textContent="×";close.setAttribute("aria-label",english?"Cancel reply":"لغو پاسخ");close.onclick=cancelReply;
  preview.append(text,close);$("messageText").focus();
}
function cancelReply(){replyTarget=null;$("replyPreview").hidden=true;$("replyPreview").replaceChildren();}
function editMessage(m){
  if(m.sender_id!==currentUser.id)return;
  cancelReply();preEditDraft=$("messageText").value;editingMessageId=m.id;$("messageText").value=m.body||"";
  $("cancelEditButton").hidden=false;$("sendMessageButton").textContent="✓";
  setStatus("sendMessageStatus",english?"Editing your message":"در حال ویرایش پیام");$("messageText").focus();
}
function cancelMessageEdit(){if(!editingMessageId)return;editingMessageId=null;$("messageText").value=preEditDraft;preEditDraft="";$("cancelEditButton").hidden=true;$("sendMessageButton").textContent="➤";setStatus("sendMessageStatus","");$("messageText").dispatchEvent(new Event("input",{bubbles:true}));}
function askDeleteScope(){
  return new Promise(resolve=>{
    const overlay=document.createElement("div");
    overlay.className="farnaz-confirm-overlay";
    Object.assign(overlay.style,{position:"fixed",inset:"0",zIndex:"10000",display:"flex",alignItems:"center",justifyContent:"center",padding:"20px",background:"rgba(0,0,0,.48)",backdropFilter:"blur(3px)"});
    const dialog=document.createElement("section");
    dialog.className="farnaz-confirm-dialog";
    Object.assign(dialog.style,{width:"min(100%,360px)",padding:"22px",border:"1px solid var(--border-color,rgba(128,128,128,.25))",borderRadius:"18px",background:"var(--panel-bg,var(--card-bg,#fff))",color:"var(--text-color,#222)",boxShadow:"0 16px 48px rgba(0,0,0,.22)",direction:"inherit"});
    dialog.setAttribute("role","dialog");dialog.setAttribute("aria-modal","true");
    const title=document.createElement("h2");
    title.textContent=english?"Delete message":"حذف پیام";
    Object.assign(title.style,{margin:"0 0 14px",fontSize:"18px",fontWeight:"700"});
    const label=document.createElement("label");
    label.textContent=english?"Choose where to delete":"روش حذف پیام را انتخاب کن";
    Object.assign(label.style,{display:"block",margin:"0 0 8px",fontSize:"14px",fontWeight:"600"});
    const select=document.createElement("select");
    select.setAttribute("aria-label",english?"Delete scope":"روش حذف");
    Object.assign(select.style,{width:"100%",minHeight:"48px",padding:"10px 12px",margin:"0 0 18px",border:"1px solid var(--border-color,rgba(128,128,128,.3))",borderRadius:"12px",background:"var(--input-bg,var(--panel-bg,#fff))",color:"inherit",font:"inherit",fontSize:"14px",outlineOffset:"2px"});
    const onlyMe=document.createElement("option");onlyMe.value="me";onlyMe.textContent=english?"Only for me":"فقط برای من";
    const everyone=document.createElement("option");everyone.value="all";everyone.textContent=english?"For everyone":"برای همه";
    select.append(onlyMe,everyone);
    const actions=document.createElement("div");
    Object.assign(actions.style,{display:"flex",gap:"10px",justifyContent:"flex-start"});
    const cancel=document.createElement("button");cancel.type="button";cancel.textContent=english?"Cancel":"لغو";
    Object.assign(cancel.style,{flex:"1",minHeight:"44px",padding:"10px 14px",border:"1px solid rgba(128,128,128,.3)",borderRadius:"11px",background:"transparent",color:"inherit",font:"inherit"});
    const confirmButton=document.createElement("button");confirmButton.type="button";confirmButton.textContent=english?"Continue":"ادامه";
    Object.assign(confirmButton.style,{flex:"1",minHeight:"44px",padding:"10px 14px",border:"1px solid transparent",borderRadius:"11px",background:"var(--accent,#168f78)",color:"var(--accent-ink,#fff)",font:"inherit",fontWeight:"600"});
    let finished=false;
    const finish=value=>{if(finished)return;finished=true;overlay.remove();document.removeEventListener("keydown",onKey);resolve(value);};
    const onKey=e=>{if(e.key==="Escape")finish(null);};
    cancel.onclick=()=>finish(null);
    confirmButton.onclick=()=>finish(select.value==="all");
    overlay.addEventListener("click",e=>{if(e.target===overlay)finish(null);});
    actions.append(cancel,confirmButton);dialog.append(title,label,select,actions);overlay.append(dialog);document.body.append(overlay);
    document.addEventListener("keydown",onKey);select.focus();
  });
}
async function deleteMessage(m){
  const all=m.sender_id===currentUser.id?await askDeleteScope():false;
  if(all===null)return;
  try{
    if(all){const {error}=await getClient().from("messages").delete().eq("id",m.id).eq("sender_id",currentUser.id);if(error)throw error;}
    else{const {error}=await getClient().from("message_hidden").upsert({user_id:currentUser.id,message_id:m.id},{onConflict:"user_id,message_id"});if(error)throw error;}
    await loadMessages(false);await refreshConversationList();
  }catch(e){alert((english?"Delete failed: ":"حذف پیام ناموفق بود: ")+e.message);}
}
function toggleMessageSelection(id,item){if(selectedMessageIds.has(id))selectedMessageIds.delete(id);else selectedMessageIds.add(id);item?.classList.toggle("selected",selectedMessageIds.has(id));updateSelectionToolbar();}
function updateSelectionToolbar(){$("selectionToolbar").classList.toggle("visible",messageSelectionMode);$("selectedCount").textContent=english?(selectedMessageIds.size+" selected"):("انتخاب‌شده: "+selectedMessageIds.size);}
function exitMessageSelection(){messageSelectionMode=false;selectedMessageIds.clear();document.querySelectorAll(".message.selected").forEach(x=>x.classList.remove("selected"));updateSelectionToolbar();}
async function replyToSelected(){
  if(selectedMessageIds.size!==1)return alert(english?"Select exactly one message to reply.":"برای پاسخ، فقط یک پیام را انتخاب کن.");
  const {data,error}=await getClient().from("messages").select("*").eq("id",[...selectedMessageIds][0]).maybeSingle();if(error||!data)return;
  setReplyTarget(data);exitMessageSelection();
}
async function deleteSelectedMessages(){
  if(!selectedMessageIds.size)return;if(!confirm(english?"Hide selected messages from your view?":"پیام‌های انتخاب‌شده از صفحه شما حذف شوند؟"))return;
  try{const rows=[...selectedMessageIds].map(message_id=>({user_id:currentUser.id,message_id}));
    const {error}=await getClient().from("message_hidden").upsert(rows,{onConflict:"user_id,message_id"});if(error)throw error;
    exitMessageSelection();await loadMessages(false);
  }catch(e){alert((english?"Delete failed: ":"حذف ناموفق بود: ")+e.message);}
}
async function forwardSelectedMessages(){
  if(!selectedMessageIds.size)return;
  try{
    const {data,error}=await getClient().from("messages").select("id,body,message_type,attachment_path,attachment_name,attachment_mime,attachment_size").in("id",[...selectedMessageIds]).order("created_at");
    if(error)throw error;
    const {data:all,error:e}=await getClient().from("messages").select("sender_id,receiver_id,created_at").or("sender_id.eq."+currentUser.id+",receiver_id.eq."+currentUser.id).order("created_at",{ascending:false}).limit(1000);
    if(e)throw e;
    const {data:savedContacts,error:contactError}=await getClient().from("contacts").select("contact_user_id").eq("user_id",currentUser.id);
    if(contactError)throw contactError;
    const ids=[...new Set([...(all||[]).map(m=>m.sender_id===currentUser.id?m.receiver_id:m.sender_id),...(savedContacts||[]).map(c=>c.contact_user_id)].filter(id=>id&&id!==currentUser.id&&id!==currentChatUser?.user_id))];
    if(!ids.length)throw new Error(english?"No other conversation to forward to.":"گفتگوی دیگری برای فوروارد وجود ندارد.");
    const profiles=await Promise.all(ids.map(id=>getContactProfile(id).catch(()=>null)));
    const labels=ids.map((id,i)=>(i+1)+". "+(profiles[i]?.display_name||ids[i].slice(0,8))).join("\\n");
    const choice=Number(prompt((english?"Choose destination by number:\\n":"شماره مقصد را انتخاب کن:\\n")+labels));
    if(!Number.isInteger(choice)||choice<1||choice>ids.length)return;
    const receiverId=ids[choice-1],client=getClient();
    for(const m of data||[]){
      let path=null;
      if(m.attachment_path){
        const {data:blobData,error:downloadError}=await client.storage.from("chat-attachments").download(m.attachment_path);
        if(downloadError)throw downloadError;
        const ext=(m.attachment_name||"photo").split(".").pop().toLowerCase().replace(/[^a-z0-9]/g,"")||"img";
        path=currentUser.id+"/"+crypto.randomUUID()+"."+ext;
        const {error:uploadError}=await client.storage.from("chat-attachments").upload(path,blobData,{contentType:m.attachment_mime||blobData.type||"image/jpeg",upsert:false});
        if(uploadError)throw uploadError;
      }
      const {error:sendError}=await client.from("messages").insert({
        sender_id:currentUser.id,receiver_id:receiverId,body:m.body||null,message_type:m.message_type||"text",
        attachment_path:path,attachment_name:m.attachment_name,attachment_mime:m.attachment_mime,attachment_size:m.attachment_size
      });
      if(sendError){if(path)await client.storage.from("chat-attachments").remove([path]);throw sendError;}
    }
    exitMessageSelection();alert(english?"Messages forwarded.":"پیام‌ها فوروارد شدند.");
  }catch(e){alert((english?"Forward failed: ":"فوروارد ناموفق بود: ")+e.message);}
}
async function subscribeToMessages(){
  await stopMessageSubscription();if(!currentUser)return;
  const myId=currentUser.id,client=getClient();
  messageSubscription=client.channel("farnaz-inbox-"+myId)
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages"},payload=>{
      if(currentUser?.id!==myId)return;
      const m=payload.new;
      if(m.sender_id!==myId&&m.receiver_id!==myId)return;
      refreshConversationList();
      if(currentChatUser&&((m.sender_id===myId&&m.receiver_id===currentChatUser.user_id)||(m.sender_id===currentChatUser.user_id&&m.receiver_id===myId)))loadMessages(false);
    })
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"messages"},payload=>{
      if(currentUser?.id!==myId)return;
      const m=payload.new;
      if(m.sender_id===myId||m.receiver_id===myId){refreshConversationList();if(currentChatUser&&(m.sender_id===currentChatUser.user_id||m.receiver_id===currentChatUser.user_id))loadMessages(false);}
    })
    .on("postgres_changes",{event:"DELETE",schema:"public",table:"messages"},()=>{
      if(currentUser?.id!==myId)return;refreshConversationList();if(currentChatUser)loadMessages(false);
    })
    .subscribe(status=>{
      if(status==="SUBSCRIBED"){
        reconnectAttempts=0;
        if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;}
        setConnectionBanner("",false);
        setStatus("inboxStatus",english?"Connected":"متصل");
      }else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"||status==="CLOSED"){
        setConnectionBanner(english?"Live connection interrupted. Reconnecting automatically…":"ارتباط زنده قطع شد؛ در حال اتصال مجدد…");
        setStatus("inboxStatus",english?"Live updates interrupted; retrying…":"به‌روزرسانی زنده قطع شد؛ تلاش مجدد…");
        scheduleReconnect();
      }
    });
}
function stopAudioRecordingTracks(){
  if(recordingStream){recordingStream.getTracks().forEach(track=>track.stop());recordingStream=null;}
}
if(window.visualViewport){
  const syncChatViewport=()=>{
    const inChat=document.body.classList.contains("chat-mode");
    const viewport=window.visualViewport;
    if(inChat){
      document.documentElement.style.setProperty("--chat-viewport-height",Math.round(viewport.height)+"px");
      document.documentElement.style.setProperty("--chat-viewport-offset",Math.max(0,Math.round(viewport.offsetTop))+"px");
      const keyboardLikelyOpen=!!(document.activeElement&&document.activeElement.id==="messageText") &&
        (window.innerHeight-viewport.height)>120;
      document.body.classList.toggle("keyboard-open",keyboardLikelyOpen);
    }else{
      document.documentElement.style.removeProperty("--chat-viewport-height");
      document.documentElement.style.removeProperty("--chat-viewport-offset");
      document.body.classList.remove("keyboard-open");
    }
  };
  window.visualViewport.addEventListener("resize",syncChatViewport);
  window.visualViewport.addEventListener("scroll",syncChatViewport);
  window.addEventListener("orientationchange",()=>setTimeout(syncChatViewport,180));
  document.addEventListener("focusin",event=>{if(event.target?.id==="messageText")setTimeout(syncChatViewport,100);});
  document.addEventListener("focusout",()=>setTimeout(syncChatViewport,150));
}
function showRecordedVoicePreview(){
  const panel=$("voicePreview"),player=$("voicePreviewPlayer");
  if(!recordedVoiceFile||!panel||!player)return;
  if(recordedVoiceUrl){URL.revokeObjectURL(recordedVoiceUrl);recordedVoiceUrl=null;}
  recordedVoiceUrl=URL.createObjectURL(recordedVoiceFile);
  player.src=recordedVoiceUrl;
  $("voicePreviewLabel").textContent=english?"Voice message ready to send":"پیام صوتی آماده ارسال";
  $("voicePreviewSize").textContent=Math.ceil(recordedVoiceFile.size/1024)+" KB";
  panel.hidden=false;
}
function discardRecordedVoice(){
  const player=$("voicePreviewPlayer"),panel=$("voicePreview");
  if(player){player.pause();player.removeAttribute("src");player.load();}
  if(recordedVoiceUrl){URL.revokeObjectURL(recordedVoiceUrl);recordedVoiceUrl=null;}
  recordedVoiceFile=null;
  if(panel)panel.hidden=true;
}
async function toggleAudioRecording(){
  if(mediaRecorder&&mediaRecorder.state==="recording"){
    const button=$("recordAudioButton");button.disabled=true;
    try{mediaRecorder.stop();setStatus("sendMessageStatus",english?"Finishing recording…":"در حال آماده‌سازی صدای ضبط‌شده…");}
    catch(e){setStatus("sendMessageStatus",english?"Could not finish recording. Try again.":"پایان ضبط ناموفق بود؛ دوباره تلاش کن.",true);}
    return;
  }
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined"){
    setStatus("sendMessageStatus",english?"Audio recording is not supported in this browser.":"ضبط صدا در این مرورگر پشتیبانی نمی‌شود.",true);return;
  }
  try{
    discardRecordedVoice();
    recordingStream=await navigator.mediaDevices.getUserMedia({audio:true});
    const preferred=["audio/mp4","audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus"];
    const mimeType=preferred.find(type=>MediaRecorder.isTypeSupported?.(type));
    mediaRecorder=mimeType?new MediaRecorder(recordingStream,{mimeType}):new MediaRecorder(recordingStream);
    const activeRecorder=mediaRecorder;
    recordedAudioChunks=[];
    mediaRecorder.ondataavailable=e=>{if(e.data&&e.data.size)recordedAudioChunks.push(e.data);};
    mediaRecorder.onerror=()=>{
      stopAudioRecordingTracks();mediaRecorder=null;
      $("recordAudioButton").disabled=false;
      $("recordAudioButton").classList.remove("recording");
      $("recordAudioButton").textContent="🎙";
      setStatus("sendMessageStatus",english?"Could not record audio. Please try again.":"ضبط صدا ناموفق بود؛ دوباره تلاش کن.",true);
    };
    mediaRecorder.onstop=()=>{
      const actualType=activeRecorder?.mimeType||recordedAudioChunks[0]?.type||"audio/mp4";
      const blob=new Blob(recordedAudioChunks,{type:actualType});
      const ext=actualType.includes("mp4")?"m4a":actualType.includes("ogg")?"ogg":"webm";
      recordedVoiceFile=blob.size?new File([blob],"voice-message."+ext,{type:actualType}):null;
      stopAudioRecordingTracks();mediaRecorder=null;
      $("recordAudioButton").disabled=false;
      $("recordAudioButton").classList.remove("recording");$("recordAudioButton").textContent="🎙";
      if(recordedVoiceFile){
        $("attachmentFile").value="";$("cameraFile").value="";$("photoFile").value="";
        showRecordedVoicePreview();
        setStatus("sendMessageStatus",(english?"Voice message ready. Review it, then tap Send.":"صدای ضبط‌شده آماده است؛ گوش بده و سپس دکمهٔ ارسال را بزن."));
      }else{
        discardRecordedVoice();
        setStatus("sendMessageStatus",english?"No audio was captured. Please record again.":"صدایی ضبط نشد؛ لطفاً دوباره ضبط کن.",true);
      }
    };
    mediaRecorder.start();
    $("recordAudioButton").classList.add("recording");$("recordAudioButton").textContent="■";
    setStatus("sendMessageStatus",english?"Recording… Tap stop when finished.":"در حال ضبط… برای پایان، دوباره دکمه را بزن.");
  }catch(e){
    stopAudioRecordingTracks();
    setStatus("sendMessageStatus",english?"Microphone permission is needed to record audio.":"برای ضبط پیام صوتی باید اجازه دسترسی به میکروفون بدهی.",true);
  }
}
async function sendMessage(event){
  event.preventDefault();
  if(!currentUser||!currentChatUser){setStatus("sendMessageStatus",english?"Choose a contact first.":"ابتدا مخاطب را انتخاب کن.",true);return;}
  if(mediaRecorder&&mediaRecorder.state==="recording"){setStatus("sendMessageStatus",english?"Stop recording before sending.":"پیش از ارسال، ضبط صدا را متوقف کن.",true);return;}
  const input=$("messageText"),body=input.value.trim(),selectedFile=$("attachmentFile").files[0],photoFile=$("photoFile").files[0],cameraFile=$("cameraFile").files[0];
  const file=recordedVoiceFile||selectedFile||photoFile||cameraFile;
  if(!body&&!file&&!editingMessageId)return;
  if(file&&file.size>20*1024*1024){setStatus("sendMessageStatus",english?"Choose a file up to 20 MB.":"حجم فایل باید حداکثر ۲۰ مگابایت باشد.",true);return;}
  if(editingMessageId&&file){setStatus("sendMessageStatus",english?"Remove the attachment before editing a message.":"برای ویرایش پیام، ابتدا پیوست را بردار.",true);return;}
  const button=$("sendMessageButton");button.disabled=true;setStatus("sendMessageStatus",english?"Sending…":"در حال ارسال…");
  try{
    const {data:s,error:se}=await getClient().auth.getSession();if(se)throw se;
    if(!s.session||s.session.user.id!==currentUser.id)throw new Error(english?"Session expired. Sign in again.":"نشست منقضی شده؛ دوباره وارد شو.");
    const client=getClient(),receiverId=currentChatUser.user_id;
    if(editingMessageId){
      const {error}=await client.from("messages").update({body,edited_at:new Date().toISOString()}).eq("id",editingMessageId).eq("sender_id",currentUser.id);
      if(error)throw error;cancelMessageEdit();
    }else{
      let attachmentPath=null,attachmentName=null,attachmentMime=null,attachmentSize=null;
      const isImage=!!file&&file.type.startsWith("image/");
      if(file){
        const safeName=(file.name||"attachment").replace(/[^a-zA-Z0-9._-]/g,"_").slice(-120)||"attachment";
        const ext=(safeName.split(".").pop()||"bin").toLowerCase().replace(/[^a-z0-9]/g,"")||"bin";
        attachmentPath=currentUser.id+"/"+crypto.randomUUID()+"."+ext;
        const {error:uploadError}=await client.storage.from("chat-attachments").upload(attachmentPath,file,{contentType:file.type||"application/octet-stream",upsert:false});
        if(uploadError)throw uploadError;
        attachmentName=safeName;attachmentMime=file.type||"application/octet-stream";attachmentSize=file.size;
      }
      const isAudio=!!file&&(file.type||"").startsWith("audio/");
      const row={sender_id:currentUser.id,receiver_id:receiverId,body:body||null,message_type:file?(isImage?"image":"file"):"text",
        attachment_path:attachmentPath,attachment_name:attachmentName,attachment_mime:attachmentMime,attachment_size:attachmentSize,reply_to_id:replyTarget?.id||null};
      const {error}=await client.from("messages").insert(row);
      if(error){if(attachmentPath)await client.storage.from("chat-attachments").remove([attachmentPath]);throw error;}
      cancelReply();if(isAudio)discardRecordedVoice();
    }
    input.value="";input.style.height="auto";$("attachmentFile").value="";$("cameraFile").value="";$("photoFile").value="";
    setStatus("sendMessageStatus",english?"Message sent.":"پیام ارسال شد.");
    await loadMessages(false);await refreshConversationList();
  }catch(e){
    console.error("Send message:",e);
    setStatus("sendMessageStatus",(english?"Could not send: ":"ارسال پیام ناموفق بود: ")+e.message,true);
  }finally{button.disabled=false;}
}
function startCall(type){
  alert(english?
    (type==="video"?"Video calling is not configured yet.":"Audio calling is not configured yet."):
    (type==="video"?"تماس تصویری هنوز راه‌اندازی نشده است.":"تماس صوتی هنوز راه‌اندازی نشده است."));
}
$("authForm").addEventListener("submit",async event=>{
  event.preventDefault();
  const button=$("authSubmit"),email=$("authEmail").value.trim();
  const password=$("authPassword").value,name=$("authName").value.trim();
  button.disabled=true;setStatus("authStatus",english?"Connecting...":"در حال اتصال...");
  try{
    const client=getClient();let result;
    if(authMode==="signup"){
      result=await client.auth.signUp({
        email,password,
        options:{
          emailRedirectTo:"https://kalaghkocholo.github.io/Farnaz/",
          data:{display_name:name}
        }
      });
      if(result.error)throw result.error;
      if(!result.data.session){
        setStatus("authStatus",english?
          "Sign-up submitted. Confirm your email, then sign in.":
          "ثبت‌نام انجام شد. ایمیلت را تأیید کن و سپس وارد شو.");return;
      }
    }else{
      result=await client.auth.signInWithPassword({email,password});
      if(result.error)throw result.error;
    }
    if(!result.data.user)throw new Error("اطلاعات حساب دریافت نشد.");
    closeAuth();await showUser(result.data.user);
    await subscribeToMessages();await refreshConversationList();
    navigate("chatsPage");
  }catch(e){
    console.error("Auth:",e);
    setStatus("authStatus",(english?"Error: ":"خطا: ")+e.message,true);
  }finally{button.disabled=false;}
});
$("profileForm").addEventListener("submit",saveProfile);
$("recipientForm").addEventListener("submit",findRecipient);
document.addEventListener("click",event=>{
  const chat=$("chatPage");
  if(!chat?.classList.contains("active"))return;
  if(event.target.closest(".message-tools,.message,.composer-shell,#selectionToolbar"))return;
  dismissMessageMenus();
  if(messageSelectionMode&&event.target.closest("#messageList"))exitMessageSelection();
});
document.addEventListener("keydown",event=>{
  if(event.key!=="Escape")return;
  dismissMessageMenus();
  if(messageSelectionMode)exitMessageSelection();
  if(replyTarget)cancelReply();
  if(editingMessageId)cancelMessageEdit();
  toggleAttachmentMenu(false);
});
(function enableChatEdgeGestures(){
  let startX=0,startY=0,tracking=false;
  const chat=$("chatPage");
  chat.addEventListener("touchstart",event=>{
    if(!chat.classList.contains("active")||event.touches.length!==1)return;
    const t=event.touches[0],width=window.innerWidth;
    tracking=t.clientX<26||t.clientX>width-26;startX=t.clientX;startY=t.clientY;
  },{passive:true});
  chat.addEventListener("touchend",event=>{
    if(!tracking||event.changedTouches.length!==1)return;
    tracking=false;const t=event.changedTouches[0],dx=t.clientX-startX,dy=t.clientY-startY;
    if(Math.abs(dx)<75||Math.abs(dx)<Math.abs(dy)*1.35)return;
    if(dx>0&&startX<26)backFromChat();
    else if(dx<0&&startX>window.innerWidth-26)openAdjacentConversation(1);
  },{passive:true});
})();
$("savedContactFilter").addEventListener("input",filterSavedContactsForNewChat);
document.addEventListener("click",event=>{
  const panel=$("newChatPopover"),button=$("topNewChatButton");
  if(panel&&!panel.hidden&&!panel.contains(event.target)&&!button.contains(event.target))toggleNewChatPopover(false);
});
$("sendMessageForm").addEventListener("submit",sendMessage);
function handleAttachmentChange(input){
  const file=input.files[0];if(!file)return;
  recordedVoiceFile=null;
  if(file.size>20*1024*1024){input.value="";setStatus("sendMessageStatus",english?"Choose a file up to 20 MB.":"حجم فایل باید حداکثر ۲۰ مگابایت باشد.",true);return;}
  setStatus("sendMessageStatus",(english?"Ready to send: ":"آماده ارسال: ")+file.name+" · "+Math.ceil(file.size/1024)+" KB");
}
$("attachmentFile").addEventListener("change",()=>handleAttachmentChange($("attachmentFile")));
$("photoFile").addEventListener("change",()=>handleAttachmentChange($("photoFile")));
$("cameraFile").addEventListener("change",()=>handleAttachmentChange($("cameraFile")));

$("authBox").addEventListener("click",e=>{if(e.target.id==="authBox")closeAuth();});
$("authBox").addEventListener("keydown",e=>{if(e.key==="Escape")closeAuth();});
$("messageText").addEventListener("input",()=>{
  const el=$("messageText");el.style.height="auto";el.style.height=Math.min(el.scrollHeight,112)+"px";
});
$("messageText").addEventListener("keydown",e=>{
  if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("sendMessageForm").requestSubmit();}
});

async function initializeApp(){
  try{
    const client=getClient(),{data,error}=await client.auth.getSession();if(error)throw error;
    if(data.session?.user){
      await showUser(data.session.user);await subscribeToMessages();
      await refreshConversationList();navigate("chatsPage");
    }else showGuest();
    client.auth.onAuthStateChange((event,session)=>{
      setTimeout(async()=>{
        if(session?.user&&currentUser?.id!==session.user.id){
          await showUser(session.user);await subscribeToMessages();
          await refreshConversationList();navigate("chatsPage");
        }else if(event==="SIGNED_OUT"){
          await stopMessageSubscription();showGuest();
        }
      },0);
    });
  }catch(e){
    console.error("Initialization:",e);
    setStatus("authStatus",(english?"Account loading failed: ":"بارگذاری حساب ناموفق بود: ")+e.message,true);
  }
}
window.addEventListener("offline",()=>{
  setConnectionBanner(english?"You are offline. Messages will reload when you reconnect.":"اینترنت قطع است؛ پس از اتصال، پیام‌ها دوباره بارگذاری می‌شوند.");
});
window.addEventListener("online",()=>{
  setConnectionBanner(english?"Internet restored. Reconnecting…":"اینترنت وصل شد؛ در حال بازیابی ارتباط…");
  recoverConnection();
});
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible"&&typeof navigator!=="undefined"&&navigator.onLine&&currentUser){
    if(currentChatUser)loadMessages(false);
    refreshConversationList();
  }
});
initializeApp();
