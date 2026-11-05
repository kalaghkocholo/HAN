let pendingPrivateSend=null;
let readReceiptMessageIds=new Set();
let messageReactionMap=new Map(),pinnedMessageIds=new Set(),currentPinnedMessage=null;
const MESSAGE_REACTION_CHOICES=["👍","❤️","😂","😮","😢","🙏"];
function ensurePinnedMessageBanner(){
  const list=$("messageList");if(!list)return null;
  let banner=$("pinnedMessageBanner");
  if(!banner){
    banner=document.createElement("button");banner.id="pinnedMessageBanner";banner.type="button";
    banner.className="message-pinned-banner";banner.hidden=true;
    banner.innerHTML='<span class="message-pinned-icon" aria-hidden="true">📌</span><span class="message-pinned-copy"><strong></strong><small></small></span><span class="message-pinned-arrow" aria-hidden="true">›</span>';
    banner.addEventListener("click",async()=>{
      if(!currentPinnedMessage||!currentChatUser)return;
      const target=$("messageList").querySelector('[data-message-id="'+currentPinnedMessage.id+'"]');
      if(target){target.scrollIntoView({behavior:"smooth",block:"center"});target.classList.add("contact-info-search-match");setTimeout(()=>target.classList.remove("contact-info-search-match"),1800);}
      else if(typeof openMessageFromSearch==="function")await openMessageFromSearch(currentPinnedMessage.id,currentPinnedMessage.created_at,currentChatUser.user_id);
    });
    list.before(banner);
  }
  return banner;
}
function updatePinnedMessageBanner(){
  const banner=ensurePinnedMessageBanner();if(!banner)return;
  if(!currentPinnedMessage){banner.hidden=true;return;}
  const message=currentPinnedMessage;
  const preview=(message.body||message.attachment_name||(english?"Attachment":"پیوست")).trim();
  banner.querySelector("strong").textContent=english?"Pinned message":"پیام سنجاق‌شده";
  banner.querySelector("small").textContent=preview.length>90?preview.slice(0,87)+"…":preview;
  banner.hidden=false;
}
async function loadMessageDecorations(messages,myId,contactId){
  const client=getClient(),ids=[...new Set((messages||[]).map(m=>String(m.id)).filter(Boolean))];
  if(ids.length){
    try{
      const {data,error}=await client.from("message_reactions").select("message_id,user_id,emoji").in("message_id",ids);
      if(error)throw error;
      const grouped=new Map();
      for(const r of data||[]){
        const key=String(r.message_id);if(!grouped.has(key))grouped.set(key,new Map());
        const byEmoji=grouped.get(key);if(!byEmoji.has(r.emoji))byEmoji.set(r.emoji,[]);
        byEmoji.get(r.emoji).push(String(r.user_id));
      }
      for(const id of ids){
        const byEmoji=grouped.get(id)||new Map();
        messageReactionMap.set(id,[...byEmoji.entries()].map(([emoji,users])=>({emoji,users})));
      }
    }catch(e){console.warn("Could not load message reactions:",e.message);}
  }
  try{
    const {data,error}=await client.from("message_pins")
      .select("message_id,pinned_by,pinned_at,messages!inner(id,body,attachment_name,created_at,sender_id,receiver_id)")
      .order("pinned_at",{ascending:false}).limit(100);
    if(error)throw error;
    const relevant=(data||[]).map(pin=>{
      const m=Array.isArray(pin.messages)?pin.messages[0]:pin.messages;
      return m&&((String(m.sender_id)===String(myId)&&String(m.receiver_id)===String(contactId))||(String(m.sender_id)===String(contactId)&&String(m.receiver_id)===String(myId)))?{...pin,...m}:null;
    }).filter(Boolean);
    pinnedMessageIds=new Set(relevant.map(p=>String(p.message_id)));
    currentPinnedMessage=relevant[0]||null;
    updatePinnedMessageBanner();
  }catch(e){console.warn("Could not load pinned messages:",e.message);}
}
async function toggleMessageReaction(messageId,emoji){
  if(!currentUser||!currentChatUser)return;
  const client=getClient(),id=String(messageId),mine=(messageReactionMap.get(id)||[]).find(r=>r.emoji===emoji&&r.users.includes(String(currentUser.id)));
  try{
    const result=mine
      ?await client.from("message_reactions").delete().eq("message_id",messageId).eq("user_id",currentUser.id)
      :await client.from("message_reactions").upsert({message_id:messageId,user_id:currentUser.id,emoji},{onConflict:"message_id,user_id"});
    if(result.error)throw result.error;
    await loadPrivateMessages(false,true);
  }catch(e){console.error("Message reaction failed:",e);setStatus("sendMessageStatus",(english?"Could not save reaction: ":"ذخیره واکنش ناموفق بود: ")+e.message,true);}
}
async function toggleMessagePin(messageId){
  if(!currentUser||!currentChatUser)return;
  const client=getClient(),id=String(messageId),alreadyPinned=pinnedMessageIds.has(id);
  try{
    const result=alreadyPinned
      ?await client.from("message_pins").delete().eq("message_id",messageId)
      :await client.from("message_pins").insert({message_id:messageId,pinned_by:currentUser.id});
    if(result.error)throw result.error;
    await loadPrivateMessages(false,true);
  }catch(e){console.error("Pin message failed:",e);setStatus("sendMessageStatus",(english?"Could not update pinned message: ":"تغییر سنجاق پیام ناموفق بود: ")+e.message,true);}
}

async function loadPrivateMessages(older=false,preserveScroll=false){
  if(!currentUser||!currentChatUser)return;
  const scrollList=$("messageList");
  const oldScrollTop=scrollList.scrollTop;
  const wasNearBottom=scrollList.scrollHeight-scrollList.scrollTop-scrollList.clientHeight<100;
  const request=++chatRequestNumber,myId=currentUser.id,contactId=currentChatUser.user_id;
  if(!older)readReceiptMessageIds=new Set();
  let displayedCachedMessages=false;
  if(!older){
    $("messageList").replaceChildren();messageLoadedCount=50;messageHasMore=false;
    selectedMessageIds.clear();messageSelectionMode=false;updateSelectionToolbar();
    $("loadOlderButton").hidden=true;
    messageReactionMap=new Map();pinnedMessageIds=new Set();currentPinnedMessage=null;updatePinnedMessageBanner();
    try{
      const cached=await window.FarnazLocalStore?.getMessages(myId,contactId);
      const hiddenBoundary=prefFor(contactId).hidden_at?new Date(prefFor(contactId).hidden_at).getTime():null;
      const visibleCached=Array.isArray(cached)?cached.filter(m=>!hiddenBoundary||new Date(m.created_at).getTime()>hiddenBoundary):[];
      if(request===chatRequestNumber&&currentUser?.id===myId&&String(currentChatUser?.user_id)===String(contactId)&&visibleCached.length){
        displayedCachedMessages=true;
        await renderMessages(visibleCached,myId,true);
      }
    }catch(cacheError){console.warn("Could not read cached messages:",cacheError);}
  }
  if(!older&&typeof navigator!=="undefined"&&navigator.onLine===false){
    setStatus("sendMessageStatus",displayedCachedMessages
      ?(english?"Showing saved messages offline.":"پیام‌های ذخیره‌شده نمایش داده می‌شوند؛ اینترنت قطع است.")
      :(english?"Offline. No saved messages for this chat yet.":"اینترنت قطع است و هنوز پیامی از این گفتگو ذخیره نشده است."),!displayedCachedMessages);
    return false;
  }
  setStatus("sendMessageStatus",english?"Loading messages...":"در حال بارگذاری پیام‌ها...");
  try{
    const client=getClient(),existing=Array.from($("messageList").querySelectorAll(".message[data-created-at]"));
    const oldest=older&&existing.length?existing[0]:null;
    // Query each direction separately to avoid fragile nested PostgREST OR filters.
    const results=await retryRead("messages",()=>{
      let sent=client.from("messages")
        .select("id,sender_id,receiver_id,body,created_at,message_type,attachment_path,attachment_name,attachment_mime,reply_to_id,edited_at")
        .eq("sender_id",myId).eq("receiver_id",contactId).order("created_at",{ascending:false}).limit(51);
      let received=client.from("messages")
        .select("id,sender_id,receiver_id,body,created_at,message_type,attachment_path,attachment_name,attachment_mime,reply_to_id,edited_at")
        .eq("sender_id",contactId).eq("receiver_id",myId).order("created_at",{ascending:false}).limit(51);
      if(oldest){sent=sent.lt("created_at",oldest.dataset.createdAt);received=received.lt("created_at",oldest.dataset.createdAt);}
      return Promise.all([sent,received]);
    });
    if(request!==chatRequestNumber||currentUser?.id!==myId||currentChatUser?.user_id!==contactId)return;
    let data=[...(results[0].data||[]),...(results[1].data||[])];
    data.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    // Fetch up to 50 combined messages; direction queries each return at most 50.
    const page=data.slice(0,50),rows=page.reverse();
    let hiddenIds=new Set();
    try{
      const hidden=await retryRead("hidden messages",()=>client.from("message_hidden").select("message_id").eq("user_id",myId));
      if(!hidden.error)hiddenIds=new Set((hidden.data||[]).map(x=>x.message_id));
      else console.warn("Could not load hidden-message preferences:",hidden.error);
    }catch(hiddenError){console.warn("Could not load hidden-message preferences:",hiddenError);}
    // The hidden-message read can finish after logout or a chat/account switch.
    // Re-check before caching anything so a late response cannot repopulate the
    // previous account's local message store after logout cleanup has started.
    if(request!==chatRequestNumber||currentUser?.id!==myId||String(currentChatUser?.user_id)!==String(contactId))return;
    // A deleted conversation remains deleted in this user's view. Only messages
    // strictly newer than the saved boundary may appear when the same contact is reopened.
    const hiddenBoundary=prefFor(contactId).hidden_at?new Date(prefFor(contactId).hidden_at).getTime():null;
    const visibleRows=rows.filter(m=>
      !hiddenIds.has(m.id)&&(!hiddenBoundary||new Date(m.created_at).getTime()>hiddenBoundary)
    );
    window.FarnazLocalStore?.saveMessages(myId,contactId,visibleRows,older).catch(cacheError=>console.warn("Could not cache messages:",cacheError));
    await loadMessageDecorations(visibleRows,myId,contactId);
    if(request!==chatRequestNumber||currentUser?.id!==myId||currentChatUser?.user_id!==contactId)return;
    const ownIds=visibleRows.filter(m=>String(m.sender_id)===String(myId)).map(m=>String(m.id));
    const receivedIds=visibleRows.filter(m=>String(m.receiver_id)===String(myId)&&String(m.sender_id)!==String(myId)).map(m=>({message_id:m.id,sender_id:m.sender_id,receiver_id:m.receiver_id,reader_id:myId}));
    const receiptRead=ownIds.length?client.from("message_read_receipts").select("message_id,reader_id,read_at").in("message_id",ownIds):Promise.resolve({data:[],error:null});
    const markRead=receivedIds.length?client.from("message_read_receipts").upsert(receivedIds,{onConflict:"message_id,reader_id",ignoreDuplicates:true}).then(({error})=>{if(error)console.warn("Could not save read receipts:",error.message);}):Promise.resolve();
    const [receiptResult]=await Promise.all([receiptRead,markRead]);
    if(request!==chatRequestNumber||currentUser?.id!==myId||currentChatUser?.user_id!==contactId)return;
    (receiptResult?.data||[]).forEach(r=>{if(String(r.reader_id)!==String(myId))readReceiptMessageIds.add(String(r.message_id));});
    if(older){await prependMessages(visibleRows,myId);messageLoadedCount+=50;}
    else{
      await renderMessages(visibleRows,myId);
      if(preserveScroll&&!wasNearBottom)scrollList.scrollTop=oldScrollTop;
    }
    messageHasMore=data.length>50;
    // Keep the older-history control hidden after loading; user must scroll back to the top.
    $("loadOlderButton").hidden=true;
    setStatus("sendMessageStatus","");
    return true;
  }catch(e){
    console.error("Load messages:",e);
    if(displayedCachedMessages){
      setStatus("sendMessageStatus",english?"Showing saved messages; could not sync with the server.":"پیام‌های ذخیره‌شده نمایش داده می‌شوند؛ همگام‌سازی با سرور انجام نشد.");
    }else{
      setStatus("sendMessageStatus",(english?"Could not load messages: ":"دریافت پیام‌ها ناموفق بود: ")+e.message,true);
    }
    return false;
  }
}
async function makeMessageElement(m,myId,fromCache=false){
  const item=document.createElement("article");
  const isOwnMessage=String(m.sender_id)===String(myId);
  item.className="message "+(isOwnMessage?"my-message":"their-message");
  item.dataset.messageSide=isOwnMessage?"own":"contact";
  // Use a one-column grid and explicitly place each bubble in its grid cell.
  // This avoids flex-direction/RTL interactions and the historical duplicate CSS rules.
  const messageList=$("messageList");
  if(messageList){
    messageList.style.setProperty("display","grid","important");
    messageList.style.setProperty("grid-template-columns","minmax(0, 1fr)","important");
    messageList.style.setProperty("grid-auto-rows","min-content","important");
    messageList.style.setProperty("direction","ltr","important");
    messageList.style.setProperty("align-items","start","important");
  }
  // Use physical margins (not logical start/end) so RTL cannot mirror the sides.
  item.style.setProperty("justify-self","auto","important");
  item.style.setProperty("align-self","start","important");
  item.style.setProperty("margin-left",isOwnMessage?"auto":"0","important");
  item.style.setProperty("margin-right",isOwnMessage?"0":"auto","important");
  item.style.setProperty("display","block","important");
  item.style.setProperty("width","fit-content","important");
  item.style.setProperty("max-width","88%","important");
  item.dataset.messageId=m.id;item.dataset.createdAt=m.created_at;
  if(selectedMessageIds.has(m.id))item.classList.add("selected");
  if(pinnedMessageIds.has(String(m.id))){
    const pin=document.createElement("div");pin.className="message-pin-indicator";
    pin.textContent=english?"📌 Pinned":"📌 سنجاق‌شده";item.appendChild(pin);
  }
  if(m.reply_to_id){
    let repliedTo=null;
    if(!fromCache){
      try{
        const {data,error}=await getClient().from("messages").select("id,sender_id,body,attachment_name,message_type").eq("id",m.reply_to_id).maybeSingle();
        if(!error)repliedTo=data||null;
      }catch(error){console.warn("Could not load replied-to message:",error);}
    }
    const quote=document.createElement("button");
    quote.type="button";quote.className="message-quote";quote.dataset.replyTarget=String(m.reply_to_id);
    Object.assign(quote.style,{display:"block",width:"100%",textAlign:"start",border:"0",borderInlineStart:"3px solid var(--accent,#22b8a5)",borderRadius:"7px",padding:"6px 9px",margin:"0 0 6px",background:"rgba(120,130,145,.12)",color:"inherit",font:"inherit",cursor:"pointer"});
    const author=document.createElement("strong");
    Object.assign(author.style,{display:"block",fontSize:"11px",color:"var(--accent,#159b8c)"});
    author.textContent=repliedTo?(String(repliedTo.sender_id)===String(myId)?(english?"You":"شما"):(english?"Contact":"مخاطب")):(english?"Original message":"پیام اصلی");
    const preview=document.createElement("span");
    Object.assign(preview.style,{display:"block",fontSize:"12px",opacity:".82",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"});
    preview.textContent=repliedTo?(repliedTo.body||repliedTo.attachment_name||(english?"Attachment":"پیوست")):(english?"Open original message":"نمایش پیام اصلی");
    quote.append(author,preview);
    quote.addEventListener("click",event=>{
      event.stopPropagation();
      const target=$("messageList")?.querySelector('[data-message-id="'+String(m.reply_to_id)+'"]');
      if(target){
        target.scrollIntoView({behavior:"smooth",block:"center"});
        target.classList.add("contact-info-search-match");
        setTimeout(()=>target.classList.remove("contact-info-search-match"),1800);
      }else if(typeof openMessageFromSearch==="function"){
        openMessageFromSearch(m.reply_to_id,m.created_at,currentChatUser?.user_id);
      }
    });
    item.appendChild(quote);
  }
  if(m.body){const body=document.createElement("p");body.textContent=m.body;item.appendChild(body);}
  if(m.attachment_path&&fromCache){
    const n=document.createElement("small");
    n.textContent=english?"Attachment saved on server; connect to view it.":"پیوست روی سرور است؛ برای مشاهده به اینترنت وصل شو.";
    item.appendChild(n);
  }else if(m.attachment_path){
    const {data,error}=await getClient().storage.from("chat-attachments").createSignedUrl(m.attachment_path,3600);
    if(!error&&data?.signedUrl){
      if((m.message_type||"image")==="image"){const img=document.createElement("img");img.src=data.signedUrl;img.alt=m.attachment_name||"Photo";img.loading="lazy";item.appendChild(img);}
      else if((m.attachment_mime||"").startsWith("audio/")){const audio=document.createElement("audio");audio.controls=true;audio.preload="metadata";audio.src=data.signedUrl;audio.setAttribute("aria-label",m.attachment_name||"Voice message");audio.style.display="block";audio.style.maxWidth="240px";item.appendChild(audio);}
      else{const link=document.createElement("a");link.href=data.signedUrl;link.target="_blank";link.rel="noopener";link.download=m.attachment_name||"";link.textContent="📎 "+(m.attachment_name||"Download file");item.appendChild(link);}
    }else{const n=document.createElement("small");n.textContent=english?"Attachment unavailable":"پیوست در دسترس نیست";item.appendChild(n);}
  }
  const meta=document.createElement("div");meta.className="message-meta";
  const time=document.createElement("time"),date=new Date(m.created_at);time.dateTime=date.toISOString();
  time.textContent=date.toLocaleTimeString(english?"en":"fa-IR",{hour:"2-digit",minute:"2-digit"})+(m.edited_at?(english?" · edited":" · ویرایش‌شده"):"");
  if(isOwnMessage){
    const read=readReceiptMessageIds.has(String(m.id)),receipt=document.createElement("small");
    receipt.className="message-read-status";receipt.textContent=read?"✓✓":"✓";
    receipt.title=read?(english?"Read":"خوانده‌شده"):(english?"Sent; not read yet":"ارسال‌شده؛ هنوز خوانده نشده");
    receipt.setAttribute("aria-label",receipt.title);
    receipt.style.cssText="display:inline-block;margin:0;font-size:12px;letter-spacing:-2px;font-weight:700;color:"+(read?"#20a66a":"var(--muted,#8a94a6)");
    meta.appendChild(receipt);
  }
  meta.appendChild(time);item.appendChild(meta);
  const reactionGroups=messageReactionMap.get(String(m.id))||[];
  if(reactionGroups.length){
    const reactionBar=document.createElement("div");reactionBar.className="message-reactions";
    for(const group of reactionGroups){
      const chip=document.createElement("button");chip.type="button";chip.className="message-reaction-chip"+(group.users.includes(String(myId))?" mine":"");
      chip.textContent=group.emoji+" "+group.users.length;
      chip.setAttribute("aria-label",group.emoji+" "+group.users.length);
      chip.addEventListener("click",event=>{event.stopPropagation();toggleMessageReaction(m.id,group.emoji);});
      reactionBar.appendChild(chip);
    }
    item.appendChild(reactionBar);
  }
  let pointerHold=null,touchHold=null,holdTriggered=false,holdX=0,holdY=0,lastMessageTap=0,swipeStartX=0,swipeStartY=0;
  const interactiveTarget=target=>!!target.closest("a,button,audio,video,input,textarea,select");
  const cancelPointerHold=()=>{clearTimeout(pointerHold);pointerHold=null;};
  const cancelTouchHold=()=>{clearTimeout(touchHold);touchHold=null;};
  item.addEventListener("click",event=>{
    if(holdTriggered){event.preventDefault();event.stopPropagation();holdTriggered=false;return;}
    if(messageSelectionMode){toggleMessageSelection(m.id,item);return;}
    if(interactiveTarget(event.target))return;
    const now=Date.now();
    if(now-lastMessageTap<330){lastMessageTap=0;toggleMessageReaction(m.id,"👍");}
    else lastMessageTap=now;
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
    const touch=event.touches[0];holdX=touch.clientX;holdY=touch.clientY;swipeStartX=touch.clientX;swipeStartY=touch.clientY;holdTriggered=false;cancelTouchHold();
    touchHold=setTimeout(()=>{holdTriggered=true;showMessageActions(m,item);},500);
  },{passive:true});
  item.addEventListener("touchmove",event=>{
    if(!event.touches.length)return;
    const touch=event.touches[0];
    if(Math.abs(touch.clientX-holdX)>12||Math.abs(touch.clientY-holdY)>12)cancelTouchHold();
  },{passive:true});
  item.addEventListener("touchend",event=>{
    cancelTouchHold();const touch=event.changedTouches?.[0];if(!touch||holdTriggered||messageSelectionMode||interactiveTarget(event.target))return;
    const dx=touch.clientX-swipeStartX,dy=touch.clientY-swipeStartY;
    // A physical right-swipe on a message replies; vertical scrolling and the global page gesture stay untouched.
    if(dx>60&&dx>Math.abs(dy)*1.35)setReplyTarget(m);
  });
  item.addEventListener("touchcancel",cancelTouchHold);
  return item;
}
async function renderMessages(messages,myId,fromCache=false){
  const list=$("messageList");list.replaceChildren();
  if(!messages.length){const empty=document.createElement("div");empty.className="empty-state";empty.textContent=english?"No messages yet. Say hello!":"هنوز پیامی ردوبدل نشده؛ سلام کن!";list.appendChild(empty);}
  for(const m of messages)list.appendChild(await makeMessageElement(m,myId,fromCache));
  list.scrollTop=list.scrollHeight;
}
async function prependMessages(messages,myId){
  const list=$("messageList"),oldHeight=list.scrollHeight,oldTop=list.scrollTop,frag=document.createDocumentFragment();
  for(const m of messages)frag.appendChild(await makeMessageElement(m,myId));
  list.prepend(frag);list.scrollTop=oldTop+(list.scrollHeight-oldHeight);
}
(function enableOlderMessagesAtTop(){
  const list=$("messageList"),button=$("loadOlderButton");
  if(!list||!button||list.dataset.olderScrollBound==="1")return;
  list.dataset.olderScrollBound="1";
  let previousScrollTop=list.scrollTop;
  button.hidden=true;
  list.addEventListener("scroll",()=>{
    const currentScrollTop=list.scrollTop;
    if(currentScrollTop>8){
      button.hidden=true;
    }else if(previousScrollTop>8&&currentScrollTop<=8){
      button.hidden=!messageHasMore;
    }
    previousScrollTop=currentScrollTop;
  },{passive:true});
})();
async function loadOlderMessages(){
  if(!messageHasMore)return;
  $("loadOlderButton").hidden=true;
  await loadPrivateMessages(true);
}
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
  const quickReactions=document.createElement("div");quickReactions.className="message-quick-reactions";
  quickReactions.setAttribute("role","group");quickReactions.setAttribute("aria-label",english?"React to message":"واکنش به پیام");
  Object.assign(quickReactions.style,{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"5px",padding:"5px 2px 9px",borderBottom:"1px solid var(--border-color,rgba(128,128,128,.2))",marginBottom:"5px"});
  for(const emoji of MESSAGE_REACTION_CHOICES){const reaction=document.createElement("button");reaction.type="button";reaction.className="message-quick-reaction";reaction.textContent=emoji;reaction.setAttribute("aria-label",(english?"React with ":"واکنش ")+emoji);Object.assign(reaction.style,{width:"36px",height:"36px",minWidth:"36px",padding:"0",border:"0",borderRadius:"10px",background:"var(--surface-secondary,rgba(128,128,128,.12))",fontSize:"20px",cursor:"pointer"});reaction.onclick=()=>{closeMenu();toggleMessageReaction(m.id,emoji);};quickReactions.appendChild(reaction);}
  menu.appendChild(quickReactions);
  add("📌  "+(pinnedMessageIds.has(String(m.id))?(english?"Unpin message":"برداشتن سنجاق"):(english?"Pin message":"سنجاق پیام")),()=>toggleMessagePin(m.id),"mini-button message-pin-action");
  add("↩  "+(english?"Reply":"پاسخ"),()=>setReplyTarget(m));
  add("➦  "+(english?"Forward":"فوروارد"),()=>{selectedMessageIds.clear();selectedMessageIds.add(m.id);messageSelectionMode=true;updateSelectionToolbar();forwardSelectedMessages();});
  add("⬇  "+(english?"Download attachment":"دانلود فایل"),()=>downloadMessage(m),"mini-button download-message-action");
  add("☑  "+(english?"Select":"انتخاب"),()=>{messageSelectionMode=true;toggleMessageSelection(m.id,item);updateSelectionToolbar();});
  if(m.sender_id===currentUser.id)add("✎  "+(english?"Edit":"ویرایش"),()=>editMessage(m));
  add("🗑  "+(english?"Delete":"حذف"),()=>deleteMessage(m),"mini-button danger");
  const close=document.createElement("button");close.type="button";close.className="message-tools-dismiss";close.textContent="×";close.setAttribute("aria-label",english?"Close":"بستن");close.onclick=closeMenu;menu.appendChild(close);
  document.body.appendChild(menu);
  const vv=window.visualViewport,margin=10,gap=8;
  const viewLeft=vv?vv.offsetLeft:0,viewTop=vv?vv.offsetTop:0;
  const viewWidth=vv?vv.width:window.innerWidth,viewHeight=vv?vv.height:window.innerHeight;
  const header=document.querySelector("#chatPage .chat-header");
  const headerBottom=header?header.getBoundingClientRect().bottom:viewTop+44;
  // Reserve the complete chat header/status-bar area; the menu must never sit beneath the iPhone clock.
  const safeTop=Math.max(viewTop+8,headerBottom+6,48);
  const viewBottom=viewTop+viewHeight-8;
  const aboveSpace=Math.max(0,rect.top-safeTop-gap);
  const belowSpace=Math.max(0,viewBottom-rect.bottom-gap);
  const naturalHeight=menu.scrollHeight;
  const useAbove=aboveSpace>=naturalHeight||aboveSpace>=belowSpace;
  const availableSpace=Math.max(aboveSpace,belowSpace);
  menu.style.maxHeight=Math.max(110,availableSpace-4)+"px";
  const menuRect=menu.getBoundingClientRect();
  const minLeft=viewLeft+margin,maxLeft=viewLeft+viewWidth-menuRect.width-margin;
  const left=Math.max(minLeft,Math.min(rect.left+(rect.width-menuRect.width)/2,maxLeft));
  let top=useAbove?rect.top-menuRect.height-gap:rect.bottom+gap;
  top=Math.max(safeTop,Math.min(top,viewBottom-menuRect.height));
  menu.style.left=left+"px";menu.style.top=top+"px";
  menu.dataset.position=useAbove?"above":"below";
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
async function downloadMessage(m){
  let objectUrl=null;
  try{
    const client=getClient();
    let blob,filename;
    if(m.attachment_path){
      const {data,error}=await client.storage.from("chat-attachments").download(m.attachment_path);
      if(error)throw error;
      blob=data;
      const mime=(m.attachment_mime||blob.type||"").toLowerCase();
      const extByMime={"image/jpeg":"jpg","image/png":"png","image/gif":"gif","image/webp":"webp","image/heic":"heic","image/heif":"heif","audio/mpeg":"mp3","audio/mp4":"m4a","audio/aac":"aac","audio/ogg":"ogg","audio/wav":"wav","audio/webm":"webm","video/mp4":"mp4","application/pdf":"pdf","text/plain":"txt","application/zip":"zip"};
      const fallbackExt=extByMime[mime]||(mime.startsWith("audio/")?"audio":mime.startsWith("image/")?"image":mime.startsWith("video/")?"video":"file");
      filename=m.attachment_name||("farnaz-"+(m.message_type||fallbackExt)+"."+(fallbackExt==="image"?"jpg":fallbackExt));
    }else{
      blob=new Blob([m.body||""],{type:"text/plain;charset=utf-8"});
      filename="farnaz-message.txt";
    }
    objectUrl=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=objectUrl;a.download=filename;a.rel="noopener";a.style.display="none";
    document.body.appendChild(a);a.click();a.remove();
    // On iOS Safari, open the file if the download attribute is not honored,
    // so the user can use Share > Save to Files.
    if(/iPad|iPhone|iPod/.test(navigator.userAgent)&&!window.matchMedia("(display-mode: standalone)").matches){
      setTimeout(()=>{if(objectUrl)window.open(objectUrl,"_blank","noopener");},250);
    }
    setTimeout(()=>{if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=null;},60000);
  }catch(e){if(objectUrl)URL.revokeObjectURL(objectUrl);alert((english?"Download failed: ":"دانلود ناموفق بود: ")+e.message);}
}
function askDeleteScope(count=1){
  return new Promise(resolve=>{
    const overlay=document.createElement("div");
    overlay.className="farnaz-confirm-overlay";
    Object.assign(overlay.style,{position:"fixed",inset:"0",zIndex:"10000",display:"flex",alignItems:"center",justifyContent:"center",padding:"20px",background:"rgba(0,0,0,.48)",backdropFilter:"blur(3px)"});
    const dialog=document.createElement("section");
    dialog.className="farnaz-confirm-dialog";
    Object.assign(dialog.style,{width:"min(100%,360px)",padding:"22px",border:"1px solid var(--border-color,rgba(128,128,128,.25))",borderRadius:"18px",background:"var(--panel-bg,var(--card-bg,#fff))",color:"var(--text-color,#222)",boxShadow:"0 16px 48px rgba(0,0,0,.22)",direction:"inherit"});
    dialog.setAttribute("role","dialog");dialog.setAttribute("aria-modal","true");
    const title=document.createElement("h2");
    title.textContent=count>1?(english?"Delete selected messages":"حذف پیام‌های انتخاب‌شده"):(english?"Delete message":"حذف پیام");
    Object.assign(title.style,{margin:"0 0 14px",fontSize:"18px",fontWeight:"700"});
    const label=document.createElement("p");
    label.textContent=english?"Choose where to delete":"مشخص کن پیام"+(count>1?"ها":"")+" کجا حذف "+(count>1?"شوند":"شود");
    Object.assign(label.style,{margin:"0 0 10px",fontSize:"14px",fontWeight:"600"});
    let scope="me";
    const choices=document.createElement("div");
    Object.assign(choices.style,{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px",margin:"0 0 18px"});
    const makeChoice=(value,text)=>{
      const button=document.createElement("button");button.type="button";button.textContent=text;
      Object.assign(button.style,{minHeight:"46px",padding:"10px 8px",border:"1px solid rgba(128,128,128,.35)",borderRadius:"11px",background:"transparent",color:"inherit",font:"inherit",fontSize:"14px",cursor:"pointer"});
      button.setAttribute("aria-pressed",String(scope===value));
      button.onclick=()=>{scope=value;[...choices.children].forEach(b=>{const active=b.dataset.scope===scope;b.setAttribute("aria-pressed",String(active));b.style.background=active?"var(--accent,#168f78)":"transparent";b.style.color=active?"var(--accent-ink,#fff)":"inherit";b.style.borderColor=active?"var(--accent,#168f78)":"rgba(128,128,128,.35)";});};
      button.dataset.scope=value;
      if(value===scope){button.style.background="var(--accent,#168f78)";button.style.color="var(--accent-ink,#fff)";button.style.borderColor="var(--accent,#168f78)";}
      return button;
    };
    choices.append(makeChoice("me",english?"Only for me":"فقط برای من"),makeChoice("all",english?"For everyone":"برای همه"));
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
    confirmButton.onclick=()=>finish(scope==="all");
    overlay.addEventListener("click",e=>{if(e.target===overlay)finish(null);});
    actions.append(cancel,confirmButton);dialog.append(title,label,choices,actions);overlay.append(dialog);document.body.append(overlay);
    document.addEventListener("keydown",onKey);
  });
}
async function deleteMessage(m){
  const all=m.sender_id===currentUser.id?await askDeleteScope():false;
  if(all===null)return;
  try{
    if(all){const {error}=await getClient().from("messages").delete().eq("id",m.id).eq("sender_id",currentUser.id);if(error)throw error;}
    else{const {error}=await getClient().from("message_hidden").upsert({user_id:currentUser.id,message_id:m.id},{onConflict:"user_id,message_id"});if(error)throw error;}
    await loadPrivateMessages(false);await refreshConversationList();
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
  const ids=[...selectedMessageIds];
  if(!ids.length)return;
  try{
    const client=getClient();
    const {data:messages,error:readError}=await client.from("messages").select("id,sender_id").in("id",ids);
    if(readError)throw readError;
    const ownIds=(messages||[]).filter(m=>m.sender_id===currentUser.id).map(m=>m.id);
    const scope=ownIds.length?await askDeleteScope(ids.length):false;
    if(scope===null)return;
    if(scope){
      const {error}=await client.from("messages").delete().in("id",ownIds).eq("sender_id",currentUser.id);
      if(error)throw error;
    }
    const hideIds=scope?ids.filter(id=>!ownIds.includes(id)):ids;
    if(hideIds.length){
      const rows=hideIds.map(message_id=>({user_id:currentUser.id,message_id}));
      const {error}=await client.from("message_hidden").upsert(rows,{onConflict:"user_id,message_id"});
      if(error)throw error;
    }
    exitMessageSelection();await loadPrivateMessages(false);await refreshConversationList();
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
let messageSubscriptionSetupPromise=null,messageSubscriptionUserId=null;
async function subscribeToMessages(){
  const requestedUserId=String(currentUser?.id||"");
  if(!requestedUserId)return;
  const activeState=messageSubscription?.state;
  if(messageSubscription&&messageSubscriptionUserId===requestedUserId&&
     (activeState==="joining"||activeState==="joined"))return;
  // Serialize reconnects: visibilitychange + online + auth restoration can fire
  // together on iOS. Concurrent teardown/setup used to orphan realtime channels.
  if(messageSubscriptionSetupPromise){
    try{await messageSubscriptionSetupPromise;}catch(_){}
    const settledState=messageSubscription?.state;
    if(messageSubscription&&messageSubscriptionUserId===String(currentUser?.id||"")&&
       (settledState==="joining"||settledState==="joined"))return;
  }
  const setup=subscribeToMessagesNow();
  messageSubscriptionSetupPromise=setup;
  try{await setup;}finally{if(messageSubscriptionSetupPromise===setup)messageSubscriptionSetupPromise=null;}
}
async function subscribeToMessagesNow(){
  await stopMessageSubscription();if(!currentUser)return;
  const myId=currentUser.id,client=getClient();
  messageSubscriptionUserId=String(myId);
  let resolveSubscription,rejectSubscription,subscriptionSettled=false;
  const subscriptionReady=new Promise((resolve,reject)=>{resolveSubscription=resolve;rejectSubscription=reject;});
  const subscriptionTimeout=setTimeout(()=>{
    if(subscriptionSettled)return;
    subscriptionSettled=true;
    rejectSubscription(new Error(english
      ?"Live message channel did not confirm within 12 seconds."
      :"کانال پیام زنده طی ۱۲ ثانیه اتصال را تأیید نکرد."));
  },12000);
  const channel=client.channel("farnaz-inbox-"+myId)
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages"},async payload=>{
      if(currentUser?.id!==myId)return;
      const m=payload.new;
      if(m.sender_id!==myId&&m.receiver_id!==myId)return;
      refreshConversationList();
      // Append a newly received message in-place; never rebuild the whole chat for an INSERT.
      if(m.sender_id!==myId&&currentChatUser&&m.sender_id===currentChatUser.user_id&&m.receiver_id===myId){
        const list=$("messageList");
        if(!list.querySelector('[data-message-id="'+m.id+'"]')){
          list.querySelector(".empty-state")?.remove();
          list.appendChild(await makeMessageElement(m,myId));
          list.scrollTop=list.scrollHeight;
          if(document.body.classList.contains("chat-mode")) client.from("message_read_receipts").upsert([{message_id:m.id,sender_id:m.sender_id,receiver_id:m.receiver_id,reader_id:myId}],{onConflict:"message_id,reader_id",ignoreDuplicates:true}).then(({error})=>{if(error)console.warn(error.message);});
        }
      }
    })
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"messages"},async payload=>{
      if(currentUser?.id!==myId)return;
      const m=payload.new;
      if(m.sender_id===myId||m.receiver_id===myId){
        refreshConversationList();
        if(currentChatUser&&(m.sender_id===currentChatUser.user_id||m.receiver_id===currentChatUser.user_id)){
          const list=$("messageList"),oldItem=list.querySelector('[data-message-id="'+m.id+'"]');
          if(oldItem){
            const replacement=await makeMessageElement(m,myId);
            if(oldItem.isConnected)oldItem.replaceWith(replacement);
          }
        }
      }
    })
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"message_read_receipts"},payload=>{
      if(currentUser?.id!==myId)return;
      const receipt=payload.new;
      if(String(receipt?.sender_id)!==String(myId))return;
      readReceiptMessageIds.add(String(receipt.message_id));
      if(currentChatUser&&String(currentChatUser.user_id)===String(receipt.receiver_id)){
        const item=$("messageList").querySelector('[data-message-id="'+receipt.message_id+'"]');
        const status=item?.querySelector(".message-read-status");
        if(status){status.textContent="✓✓";status.style.color="#20a66a";status.title=english?"Read":"خوانده‌شده";status.setAttribute("aria-label",status.title);}
      }
    })
    .on("postgres_changes",{event:"*",schema:"public",table:"message_reactions"},payload=>{
      if(currentUser?.id!==myId||!currentChatUser||!document.body.classList.contains("chat-mode"))return;
      const row=payload.new||payload.old;if(!row?.message_id)return;
      const item=$("messageList").querySelector('[data-message-id="'+row.message_id+'"]');
      if(item)loadPrivateMessages(false,true);
    })
    .on("postgres_changes",{event:"*",schema:"public",table:"message_pins"},payload=>{
      if(currentUser?.id!==myId||!currentChatUser||!document.body.classList.contains("chat-mode"))return;
      loadPrivateMessages(false,true);
    })
    .on("postgres_changes",{event:"DELETE",schema:"public",table:"messages"},payload=>{
      if(currentUser?.id!==myId)return;
      refreshConversationList();
      const m=payload.old;
      if(m?.id){$("messageList").querySelector('[data-message-id="'+m.id+'"]')?.remove();}
    })
    ;
  messageSubscription=channel;
  channel.subscribe((status,err)=>{
    if(status!=="SUBSCRIBED")console.warn("Farnaz inbox realtime status:",status,err?.message||err||"No error details provided");
    if(status==="SUBSCRIBED"){
      if(!subscriptionSettled){subscriptionSettled=true;clearTimeout(subscriptionTimeout);resolveSubscription();}
      reconnectAttempts=0;
      if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;}
      setConnectionBanner("",false);
      setStatus("inboxStatus",english?"Connected":"متصل");
    }else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"||status==="CLOSED"){
      if(!subscriptionSettled){subscriptionSettled=true;clearTimeout(subscriptionTimeout);rejectSubscription(err||new Error("Realtime channel status: "+status));}
      setConnectionBanner(english?"Live connection interrupted. Reconnecting automatically…":"ارتباط زنده قطع شد؛ در حال اتصال مجدد…");
      setStatus("inboxStatus",english?"Live updates interrupted; retrying…":"به‌روزرسانی زنده قطع شد؛ تلاش مجدد…");
      scheduleReconnect();
    }
  });
  try{
    await subscriptionReady;
  }catch(error){
    clearTimeout(subscriptionTimeout);
    if(messageSubscription===channel){messageSubscription=null;messageSubscriptionUserId=null;}
    try{await Promise.race([client.removeChannel(channel),new Promise(resolve=>setTimeout(resolve,1500))]);}
    catch(cleanupError){console.warn("Failed realtime setup cleanup:",cleanupError);}
    throw error;
  }
}
function stopAudioRecordingTracks(){
  if(recordingStream){recordingStream.getTracks().forEach(track=>track.stop());recordingStream=null;}
}
if(window.visualViewport){
  const syncChatViewport=()=>{
    const inChat=document.body.classList.contains("chat-mode")||document.body.classList.contains("spaces-chat-mode");
    const viewport=window.visualViewport;
    if(inChat){
      document.documentElement.style.setProperty("--chat-viewport-height",Math.round(viewport.height)+"px");
      document.documentElement.style.setProperty("--chat-viewport-offset",Math.max(0,Math.round(viewport.offsetTop))+"px");
      const focusedComposer=document.activeElement&&["messageText","spaceText"].includes(document.activeElement.id);
      const keyboardLikelyOpen=!!focusedComposer && (window.innerHeight-viewport.height)>120;
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
  document.addEventListener("focusin",event=>{if(["messageText","spaceText"].includes(event.target?.id))setTimeout(syncChatViewport,100);});
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
  // Prevent native form navigation even when invoked directly by the send button.
  event?.preventDefault();
  const button=$("sendMessageButton");
  // The button click and form submit must never start two sends for one tap.
  if(button?.disabled)return;
  if(!currentUser||!currentChatUser){setStatus("sendMessageStatus",english?"Choose a contact first.":"ابتدا مخاطب را انتخاب کن.",true);return;}
  if(mediaRecorder&&mediaRecorder.state==="recording"){setStatus("sendMessageStatus",english?"Stop recording before sending.":"پیش از ارسال، ضبط صدا را متوقف کن.",true);return;}
  const senderId=String(currentUser.id),receiverId=String(currentChatUser.user_id);
  const input=$("messageText"),body=input.value.trim(),selectedFile=$("attachmentFile").files[0],photoFile=$("photoFile").files[0],cameraFile=$("cameraFile").files[0];
  const restoreComposerFocus=document.activeElement===input;
  const file=recordedVoiceFile||selectedFile||photoFile||cameraFile;
  if(!body&&!file&&!editingMessageId)return;
  const sendFingerprint=JSON.stringify([senderId,receiverId,body,file?.name||"",file?.size||0,file?.lastModified||0,file?.type||"",replyTarget?.id||""]);
  const pendingSend=editingMessageId?null:(pendingPrivateSend?.fingerprint===sendFingerprint&&pendingPrivateSend.fileRef===(file||null)?pendingPrivateSend:{fingerprint:sendFingerprint,fileRef:file||null,id:crypto.randomUUID(),attachmentPath:null});
  if(pendingSend)pendingPrivateSend=pendingSend;
  if(file&&file.size>20*1024*1024){setStatus("sendMessageStatus",english?"Choose a file up to 20 MB.":"حجم فایل باید حداکثر ۲۰ مگابایت باشد.",true);return;}
  if(editingMessageId&&file){setStatus("sendMessageStatus",english?"Remove the attachment before editing a message.":"برای ویرایش پیام، ابتدا پیوست را بردار.",true);return;}
  button.disabled=true;setStatus("sendMessageStatus",english?"Sending…":"در حال ارسال…");
  const sameChat=()=>String(currentUser?.id||"")===senderId&&String(currentChatUser?.user_id||"")===receiverId;
  let pendingUploadPath=null;
  try{
    const {data:s,error:se}=await getClient().auth.getSession();if(se)throw se;
    if(String(currentUser?.id||"")!==senderId||!s.session||String(s.session.user.id)!==senderId)throw new Error(english?"Session changed or expired. Sign in again.":"نشست حساب تغییر کرده یا منقضی شده؛ دوباره وارد شو.");
    const client=getClient();
    if(!editingMessageId){
      // Do not rewrite conversation preferences before sending. That write also
      // refreshes/rebuilds the inbox and can interrupt the active chat on mobile.
      // Keep the deletion boundary stable; a successful new message is handled
      // below without navigating away from this conversation.
      const {data:blocked,error:blockError}=await client.from("blocked_contacts").select("blocked_user_id").eq("blocker_id",senderId).eq("blocked_user_id",receiverId).maybeSingle();
      if(String(currentUser?.id||"")!==senderId)throw new Error("Account changed while sending.");
      if(blockError)throw blockError;
      if(blocked)throw new Error(english?"This contact is blocked. Unblock them before sending a message.":"این مخاطب را مسدود کرده‌ای؛ برای ارسال پیام ابتدا مسدودسازی را بردار.");
    }
    if(editingMessageId){
      if(!sameChat())throw new Error("Account or conversation changed while editing.");
      const {error}=await client.from("messages").update({body,edited_at:new Date().toISOString()}).eq("id",editingMessageId).eq("sender_id",senderId);
      if(error)throw error;
      if(!sameChat())return;
      cancelMessageEdit();
    }else{
      let attachmentPath=null,attachmentName=null,attachmentMime=null,attachmentSize=null;
      const isImage=!!file&&file.type.startsWith("image/");
      if(file){
        const safeName=(file.name||"attachment").replace(/[^a-zA-Z0-9._-]/g,"_").slice(-120)||"attachment";
        const ext=(safeName.split(".").pop()||"bin").toLowerCase().replace(/[^a-z0-9]/g,"")||"bin";
        pendingSend.attachmentPath=pendingSend.attachmentPath||senderId+"/"+pendingSend.id+"."+ext;
        attachmentPath=pendingSend.attachmentPath;pendingUploadPath=attachmentPath;
        const {error:uploadError}=await client.storage.from("chat-attachments").upload(attachmentPath,file,{contentType:file.type||"application/octet-stream",upsert:false});
        if(uploadError){const conflict=String(uploadError.statusCode||uploadError.status||"")==="409"||/already exists|duplicate/i.test(String(uploadError.message||""));if(!conflict)throw uploadError;}
        if(String(currentUser?.id||"")!==senderId)throw new Error("Account changed while uploading; sign in again before sending.");
        attachmentName=safeName;attachmentMime=file.type||"application/octet-stream";attachmentSize=file.size;
      }
      if(String(currentUser?.id||"")!==senderId)throw new Error("Account changed while sending.");
      const row={id:pendingSend.id,sender_id:senderId,receiver_id:receiverId,body:body||null,message_type:file?(isImage?"image":"file"):"text",
        attachment_path:attachmentPath,attachment_name:attachmentName,attachment_mime:attachmentMime,attachment_size:attachmentSize,reply_to_id:replyTarget?.id||null};
      let {data:sentMessage,error:sendError}=await client.from("messages").insert(row).select("id,sender_id,receiver_id,body,created_at,message_type,attachment_path,attachment_name,attachment_mime,reply_to_id,edited_at").single();
      if(sendError){
        // A mobile connection can drop after PostgreSQL has committed the row.
        // Reconcile by the client-generated UUID before allowing a retry.
        const {data:existing,error:lookupError}=await client.from("messages").select("id,sender_id,receiver_id,body,created_at,message_type,attachment_path,attachment_name,attachment_mime,reply_to_id,edited_at").eq("id",pendingSend.id).maybeSingle();
        if(existing&&!lookupError){sentMessage=existing;sendError=null;}else throw sendError;
      }
      pendingUploadPath=null;pendingPrivateSend=null;
      if(String(currentUser?.id||"")!==senderId)return;
      // Only touch the composer and visible history if the user is still in the
      // same account and conversation; switching chats must preserve its draft.
      if(sameChat()&&sentMessage){
        const list=$("messageList");
        list.querySelector(".empty-state")?.remove();
        const element=await makeMessageElement(sentMessage,senderId);
        if(sameChat()){
          list.appendChild(element);
          list.scrollTop=list.scrollHeight;
          window.FarnazLocalStore?.getMessages(senderId,receiverId)
            .then(cached=>window.FarnazLocalStore.saveMessages(senderId,receiverId,[...cached,sentMessage]))
            .catch(cacheError=>console.warn("Could not update message cache:",cacheError));
          cancelReply();if(file&&(file.type||"").startsWith("audio/"))discardRecordedVoice();
        }
      }
    }
    if(String(currentUser?.id||"")!==senderId)return;
    if(String(currentChatUser?.user_id||"")===receiverId){
      input.value="";input.style.height="auto";$("attachmentFile").value="";$("cameraFile").value="";$("photoFile").value="";
      if(window.farnazDraftSaveTimer)clearTimeout(window.farnazDraftSaveTimer);
      window.FarnazLocalStore?.clearDraft(senderId,receiverId).catch(cacheError=>console.warn("Could not clear sent draft:",cacheError));
      setStatus("sendMessageStatus",english?"Message sent.":"پیام ارسال شد.");
    }
    await refreshConversationList();
  }catch(e){
    // The insert may have committed even if its response was lost. Never delete a stable retry path here.
    if(String(currentUser?.id||"")!==senderId)return;
    console.error("Send message:",e);
    if(String(currentChatUser?.user_id||"")===receiverId)setStatus("sendMessageStatus",(english?"Could not send; your text and attachment are preserved. Tap Send to retry: ":"ارسال ناموفق بود؛ متن و پیوستت حفظ شده است. برای تلاش دوباره دکمه ارسال را بزن: ")+e.message,true);
  }finally{button.disabled=false;if(restoreComposerFocus&&sameChat()&&document.activeElement!==input){try{input.focus({preventScroll:true});}catch(_){input.focus();}}}
}
$("profileForm")?.addEventListener("submit",saveProfile);
// Legacy recipient lookup form is not present in the current HTML.
// Register its handler only if that optional form exists.
$("recipientForm")?.addEventListener("submit",findRecipient);
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
/* Edge-swipe navigation intentionally disabled: it can accidentally leave
   a private conversation during touch interactions on iPhone. */
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
  if(window.farnazDraftSaveTimer)clearTimeout(window.farnazDraftSaveTimer);
  const userId=currentUser?.id,contactId=currentChatUser?.user_id,value=el.value;
  if(userId&&contactId){
    window.farnazDraftSaveTimer=setTimeout(()=>{
      window.FarnazLocalStore?.saveDraft(userId,contactId,value).catch(cacheError=>console.warn("Could not save draft:",cacheError));
    },250);
  }
});
$("messageText").addEventListener("keydown",e=>{
  if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("sendMessageForm").requestSubmit();}
});

// Authentication/session restoration is owned by js/core.js. Keep this module focused on chat features.
window.addEventListener("offline",()=>{
  setConnectionBanner(english?"You are offline. Messages will reload when you reconnect.":"اینترنت قطع است؛ پس از اتصال، پیام‌ها دوباره بارگذاری می‌شوند.");
});
window.addEventListener("online",()=>{
  setConnectionBanner(english?"Internet restored. Reconnecting…":"اینترنت وصل شد؛ در حال بازیابی ارتباط…");
  recoverConnection();
});
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible"&&typeof navigator!=="undefined"&&navigator.onLine&&currentUser){
    // Reconcile after mobile browsers suspend realtime sockets while backgrounded.
    recoverConnection();
  }
});

