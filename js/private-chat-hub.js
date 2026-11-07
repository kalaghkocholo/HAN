(function () {
  "use strict";
  const PAGE = 24;
  const FIELDS = "id,sender_id,receiver_id,body,created_at,message_type,attachment_path,attachment_name,attachment_mime,attachment_size";
  const labels = {photos:["تصاویر","Photos"],videos:["ویدئوها","Videos"],files:["فایل‌ها","Files"],audio:["صوت","Audio"],links:["پیوندها","Links"]};
  const tr = (fa,en) => english ? en : fa;
  const $ = id => document.getElementById(id);
  let dialog=null, contactId=null, category="photos", cursor=null, more=false, busy=false, request=0, hiddenIds=new Set(), focusBefore=null, visiblePhone="", profileLoading=false;

  function ensure(){
    if(dialog && dialog.isConnected) return dialog;
    dialog=document.createElement("div");
    dialog.id="contactInfoDialog";
    dialog.className="contact-info-dialog private-hub-dialog";
    dialog.hidden=true;
    dialog.setAttribute("role","dialog");
    dialog.setAttribute("aria-modal","true");
    dialog.setAttribute("aria-labelledby","privateHubHeading");
    dialog.innerHTML =
      '<section class="contact-info-card private-hub-sheet">' +
        '<header class="private-hub-header"><button type="button" class="private-hub-back" id="closeContactInfo" aria-label="بستن"><span id="privateHubBackGlyph">→</span></button><h2 id="privateHubHeading">اطلاعات گفتگو</h2><span></span></header>' +
        '<section class="private-hub-identity"><div class="contact-info-avatar avatar large" id="contactInfoAvatar">F</div><h3 id="contactInfoTitle"></h3><p id="contactInfoAbout" class="muted-note"></p><p id="contactInfoPresence" class="private-hub-presence" role="status"></p><div id="contactInfoPhone" class="contact-info-phone" hidden></div></section>' +
        '<div class="contact-info-actions private-hub-actions" id="contactInfoActions" aria-label="اقدام‌های گفتگو"></div>' +
        '<section class="private-hub-section"><h3 id="contactInfoMediaTitle">محتوای مشترک</h3>' +
          '<div class="private-hub-category-tabs" id="privateHubCategoryTabs" role="tablist" aria-label="دسته‌بندی محتوای مشترک">' +
            '<button type="button" role="tab" data-hub-category="photos" aria-selected="true">تصاویر</button><button type="button" role="tab" data-hub-category="videos" aria-selected="false">ویدئوها</button><button type="button" role="tab" data-hub-category="files" aria-selected="false">فایل‌ها</button><button type="button" role="tab" data-hub-category="audio" aria-selected="false">صوت</button><button type="button" role="tab" data-hub-category="links" aria-selected="false">پیوندها</button>' +
          '</div><p id="contactInfoMediaStatus" class="muted-note private-hub-media-status" role="status" aria-live="polite"></p><div id="contactInfoMediaList" class="contact-info-media-list private-hub-media-list"></div><button type="button" id="privateHubLoadMore" class="private-hub-load-more" hidden>موارد قدیمی‌تر</button>' +
        '</section>' +
        '<section class="private-hub-section private-hub-management"><h3 id="privateHubManagementTitle">مدیریت گفتگو</h3>' +
          '<button type="button" class="private-hub-row" id="privateHubRename"><span><strong>تغییر نام مخاطب</strong><small>نام دلخواه فقط برای خودت</small></span><span>›</span></button>' +
          '<button type="button" class="private-hub-row" id="privateHubArchive"><span><strong>بایگانی گفتگو</strong><small>پیام‌ها حذف نمی‌شوند</small></span><span>›</span></button>' +
        '</section>' +
        '<section class="private-hub-section"><h3 id="privateHubSafetyTitle">امنیت و حریم خصوصی</h3><button type="button" class="private-hub-row" id="contactInfoBlock"><span><strong>مسدودسازی مخاطب</strong><small>پیام و تماس جدید متوقف می‌شود</small></span><span>›</span></button><p id="contactInfoStatus" class="status muted-note" role="status" aria-live="polite"></p></section>' +
        '<section class="private-hub-section private-hub-destructive"><button type="button" class="private-hub-row is-danger" id="contactInfoDelete"><span><strong>حذف از فهرست گفتگوها</strong><small>فقط برای حساب تو؛ پیام‌های طرف مقابل باقی می‌مانند</small></span><span>›</span></button></section>' +
      '</section>';
    document.body.appendChild(dialog);
    $("closeContactInfo").addEventListener("click",close);
    dialog.addEventListener("click",e=>{if(e.target===dialog)close();});
    dialog.addEventListener("keydown",e=>{
      if(e.key==="Escape"){e.preventDefault();close();return;}
      if(e.key==="Tab"){
        const nodes=[...dialog.querySelectorAll("button:not([disabled]),a[href],input:not([disabled])")].filter(n=>!n.hidden);
        if(!nodes.length)return;
        if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes[nodes.length-1].focus();}
        else if(!e.shiftKey&&document.activeElement===nodes[nodes.length-1]){e.preventDefault();nodes[0].focus();}
      }
    });
    $("privateHubCategoryTabs").addEventListener("click",e=>{const b=e.target.closest("[data-hub-category]");if(b)selectCategory(b.dataset.hubCategory);});
    $("privateHubCategoryTabs").addEventListener("keydown",e=>{
      if(!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;
      const tabs=[...$("privateHubCategoryTabs").querySelectorAll("[data-hub-category]")];
      const current=tabs.indexOf(document.activeElement);let next=current;
      if(e.key==="Home")next=0;else if(e.key==="End")next=tabs.length-1;else next=(current+(e.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length;
      e.preventDefault();tabs[next].focus();selectCategory(tabs[next].dataset.hubCategory);
    });
    $("privateHubLoadMore").addEventListener("click",()=>loadPage(true));
    $("privateHubRename").addEventListener("click",()=>renameCurrentContact());
    $("privateHubArchive").addEventListener("click",toggleArchive);
    $("contactInfoBlock").addEventListener("click",async()=>{await toggleContactBlock();syncBlockedActions();});
    $("contactInfoDelete").addEventListener("click",()=>deleteContactConversation());
    return dialog;
  }

  function close(){
    if(!dialog)return;
    dialog.hidden=true;
    document.body.classList.remove("private-hub-open");
    request++;
    if(focusBefore?.isConnected)focusBefore.focus({preventScroll:true});
    focusBefore=null;
  }

  function action(label,icon,handler){
    const paths={
      message:'<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v13H7l-3 3z"/><path d="M8 8h7M8 11h5"/>',
      edit:'<path d="m4 16.5-.8 3.3 3.3-.8L19 6.5 16 3.5z"/><path d="m14.5 5 3 3"/>',
      audio:'<path d="M5 4h4l2 5-2.5 1.7a14 14 0 0 0 4.8 4.8L15 13l2-2 5 2v4c0 1.1-.9 2-2 2C9.2 21 3 14.8 3 6c0-1.1.9-2 2-2Z"/>',
      video:'<rect x="3" y="6" width="12" height="12" rx="2"/><path d="m15 10 6-3v10l-6-3z"/>',
      search:'<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/>'
    };
    const b=document.createElement("button");b.type="button";b.className="contact-info-action";
    const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("aria-hidden","true");svg.innerHTML=paths[icon];
    b.dataset.hubAction=icon;const text=document.createElement("span");text.textContent=label;b.append(svg,text);b.addEventListener("click",handler);$("contactInfoActions").appendChild(b);
  }

  function applyLanguage(){
    if(!dialog||!dialog.isConnected)return;
    $("privateHubBackGlyph").textContent=english?"←":"→";
    $("closeContactInfo").setAttribute("aria-label",tr("بازگشت","Back"));
    $("privateHubHeading").textContent=tr("اطلاعات گفتگو","Conversation info");
    $("contactInfoMediaTitle").textContent=tr("محتوای مشترک","Shared content");
    $("privateHubManagementTitle").textContent=tr("مدیریت گفتگو","Conversation management");
    $("privateHubRename").querySelector("strong").textContent=tr("تغییر نام مخاطب","Rename contact");
    $("privateHubRename").querySelector("small").textContent=tr("نام دلخواه فقط برای خودت","A name visible only to you");
    $("privateHubArchive").querySelector("small").textContent=tr("پیام‌ها حذف نمی‌شوند","Messages are not deleted");
    $("privateHubSafetyTitle").textContent=tr("امنیت و حریم خصوصی","Safety and privacy");
    $("contactInfoBlock").querySelector("strong").textContent=tr("مسدودسازی مخاطب","Block contact");
    $("contactInfoBlock").querySelector("small").textContent=tr("پیام و تماس جدید متوقف می‌شود","Stops new messages and calls");
    $("contactInfoDelete").querySelector("strong").textContent=tr("حذف از فهرست گفتگوها","Remove conversation");
    $("contactInfoDelete").querySelector("small").textContent=tr("فقط برای حساب تو؛ پیام‌های طرف مقابل باقی می‌مانند","Only for your account; the other person keeps their messages");
    const tabLabels={photos:tr("تصاویر","Photos"),videos:tr("ویدئوها","Videos"),files:tr("فایل‌ها","Files"),audio:tr("صوت","Audio"),links:tr("پیوندها","Links")};
    $("privateHubCategoryTabs").querySelectorAll("[data-hub-category]").forEach(b=>b.textContent=tabLabels[b.dataset.hubCategory]);
  }

  window.addEventListener("farnaz-language-changed",applyLanguage);

  function syncBlockedActions(){
    const buttons=$("contactInfoActions").querySelectorAll("button");
    const blocked=!!contactInfoBlocked;
    if(buttons[2]){buttons[2].disabled=blocked;buttons[2].title=blocked?tr("ابتدا مسدودسازی را بردار","Unblock this contact first"):"";}
    if(buttons[3]){buttons[3].disabled=blocked;buttons[3].title=blocked?tr("ابتدا مسدودسازی را بردار","Unblock this contact first"):"";}
    $("contactInfoBlock").querySelector("strong").textContent=blocked?tr("رفع مسدودسازی","Unblock contact"):tr("مسدودسازی مخاطب","Block contact");
  }

  function syncTabs(){
    $("privateHubCategoryTabs").querySelectorAll("[data-hub-category]").forEach(b=>{
      const active=b.dataset.hubCategory===category;b.setAttribute("aria-selected",String(active));b.tabIndex=active?0:-1;
    });
  }

  async function open(){
    if(!currentUser||!currentChatUser)return;
    ensure();focusBefore=document.activeElement;
    const token=++request,user=String(currentUser.id),other=String(currentChatUser.user_id);
    contactId=other;category="photos";cursor=null;more=false;busy=false;profileLoading=true;hiddenIds=new Set();
    dialog.hidden=false;document.body.classList.add("private-hub-open");
    $("closeContactInfo").focus({preventScroll:true});
    const name=currentChatUser.display_name||(english?"Farnaz user":"مخاطب فرناز");
    $("privateHubHeading").textContent=tr("اطلاعات گفتگو","Conversation info");
    $("contactInfoTitle").textContent=currentChatUser.is_deleted_account?tr("حساب حذف‌شده","Deleted account"):name;
    $("contactInfoAbout").textContent=currentChatUser.is_deleted_account?tr("این حساب حذف شده است.","This account has been deleted."):tr("گفتگوی خصوصی در فرناز","Private conversation on Farnaz");
    $("contactInfoPresence").textContent=tr("در حال بررسی وضعیت…","Checking status…");
    visiblePhone="";$("contactInfoPhone").hidden=true;$("contactInfoPhone").textContent="";
    $("contactInfoActions").replaceChildren();$("contactInfoMediaList").replaceChildren();
    $("contactInfoMediaStatus").textContent=tr("در حال بارگذاری…","Loading…");$("contactInfoStatus").textContent="";
    $("contactInfoBlock").disabled=true;$("contactInfoDelete").disabled=false;$("privateHubRename").disabled=!!currentChatUser.is_deleted_account;
    renderAvatar($("contactInfoAvatar"),currentChatUser.avatar_url||"",name);
    action(tr("پیام","Message"),"message",close);
    if(!currentChatUser.is_deleted_account){
      action(tr("تغییر نام","Rename"),"edit",()=>renameCurrentContact());
      action(tr("تماس صوتی","Audio call"),"audio",()=>{close();startCall("audio");});
      action(tr("تماس تصویری","Video call"),"video",()=>{close();startCall("video");});
    }
    action(tr("جست‌وجو","Search"),"search",()=>searchCurrentConversation());
    applyLanguage();syncTabs();updateArchiveLabel();
    try{
      const client=getClient();
      const [profile,blocked]=await Promise.all([
        getContactProfile(other),
        client.from("blocked_contacts").select("blocked_user_id").eq("blocker_id",user).eq("blocked_user_id",other).maybeSingle()
      ]);
      if(token!==request||String(currentUser?.id)!==user||String(currentChatUser?.user_id)!==other)return;
      if(profile?.display_name){
        const alias=String(prefFor(other).display_name||"").trim();
        $("contactInfoTitle").textContent=alias||profile.display_name;
        $("contactInfoAbout").textContent=[alias?profile.display_name:"",profile.username?"@"+profile.username:"",profile.about||tr("عضو فرناز","Farnaz member")].filter(Boolean).join(" · ");
        if(profile.avatar_url)renderAvatar($("contactInfoAvatar"),profile.avatar_url,alias||profile.display_name);
      }
      if(profile?.phone){
        visiblePhone=profile.phone;
        $("contactInfoPhone").textContent=(english?"Phone: ":"شماره تلفن: ")+formatContactPhone(profile.phone);
        $("contactInfoPhone").dir="ltr";$("contactInfoPhone").hidden=false;
      }
      if(blocked.error)throw blocked.error;
      contactInfoBlocked=!!blocked.data;
      $("contactInfoBlock").disabled=!!currentChatUser.is_deleted_account;
      syncBlockedActions();
      await refreshPrivatePresence(other);
      if(token!==request||String(currentChatUser?.user_id)!==other)return;
      const presence=currentChatPresenceLabel||"";
      $("contactInfoPresence").textContent=presence===(english?"Private conversation":"گفتگوی خصوصی")?tr("وضعیت در دسترس نیست","Status unavailable"):presence;
      profileLoading=false;
      await loadPage(false);
    }catch(error){
      if(token!==request)return;
      profileLoading=false;
      $("contactInfoStatus").textContent=tr("بارگذاری اطلاعات ناموفق بود: ","Could not load contact information: ")+(error?.message||String(error));
      $("contactInfoMediaStatus").textContent=tr("برای تلاش دوباره دسته را انتخاب کن.","Select a category to retry.");
      $("contactInfoBlock").disabled=false;
    }
  }

  function updateArchiveLabel(){
    const archived=!!prefFor(contactId).archived,row=$("privateHubArchive");
    row.querySelector("strong").textContent=tr(archived?"بازگرداندن از بایگانی":"بایگانی گفتگو",archived?"Unarchive conversation":"Archive conversation");
    row.querySelector("small").textContent=tr("این تغییر فقط برای حساب توست و پیام‌ها را حذف نمی‌کند.","This affects only your account; messages are not deleted.");
  }

  async function toggleArchive(){
    if(!currentUser||!currentChatUser||String(currentChatUser.user_id)!==String(contactId))return;
    const user=String(currentUser.id),id=String(contactId),was=!!prefFor(id).archived,b=$("privateHubArchive");b.disabled=true;
    try{
      await saveConversationPref(id,{archived:!was,pinned:false});
      if(String(currentUser?.id)!==user||String(currentChatUser?.user_id)!==id)return;
      updateArchiveLabel();$("contactInfoStatus").textContent=tr(was?"گفتگو به فهرست اصلی بازگشت.":"گفتگو بایگانی شد.",was?"Conversation restored.":"Conversation archived.");
    }catch(error){$("contactInfoStatus").textContent=tr("تغییر بایگانی ناموفق بود: ","Could not update archive: ")+(error?.message||String(error));}
    finally{b.disabled=false;}
  }

  function queryFor(client,sender,receiver,after){
    let q=client.from("messages").select(FIELDS).eq("sender_id",sender).eq("receiver_id",receiver);
    if(category==="photos")q=q.eq("message_type","image").not("attachment_path","is",null);
    else if(category==="videos")q=q.ilike("attachment_mime","video/%").not("attachment_path","is",null);
    else if(category==="audio")q=q.ilike("attachment_mime","audio/%").not("attachment_path","is",null);
    else if(category==="files")q=q.eq("message_type","file").not("attachment_path","is",null);
    else q=q.is("attachment_path",null).ilike("body","%http%");
    q=q.order("created_at",{ascending:false}).order("id",{ascending:false}).limit(PAGE);
    if(after)q=q.or("created_at.lt."+after.created_at+",and(created_at.eq."+after.created_at+",id.lt."+after.id+")");
    return q;
  }

  function newestFirst(a,b){return String(b.created_at).localeCompare(String(a.created_at))||String(b.id).localeCompare(String(a.id));}

  async function selectCategory(next){
    if(!labels[next]||next===category)return;
    category=next;cursor=null;more=false;$("contactInfoMediaList").replaceChildren();syncTabs();
    if(profileLoading)return;
    request++;busy=false;await loadPage(false);
  }

  async function loadPage(append){
    if(busy||!currentUser||!currentChatUser||String(currentChatUser.user_id)!==String(contactId))return;
    const token=request,user=String(currentUser.id),other=String(contactId),kind=category,after=append?cursor:null;
    busy=true;$("privateHubLoadMore").hidden=true;$("privateHubLoadMore").disabled=true;
    $("contactInfoMediaStatus").textContent=tr("در حال بارگذاری…","Loading…");
    try{
      const client=getClient(),results=await Promise.all([queryFor(client,user,other,after),queryFor(client,other,user,after)]);
      if(token!==request||kind!==category||String(currentUser?.id)!==user||String(currentChatUser?.user_id)!==other)return;
      for(const r of results)if(r.error)throw r.error;
      const unique=new Map();for(const r of results)for(const m of r.data||[])unique.set(String(m.id),m);
      const ordered=[...unique.values()].sort(newestFirst),page=ordered.slice(0,PAGE);
      more=ordered.length>PAGE||results.some(r=>(r.data||[]).length===PAGE);
      if(page.length)cursor=page[page.length-1];
      const hiddenResult=page.length?await client.from("message_hidden").select("message_id").eq("user_id",user).in("message_id",page.map(m=>m.id)):{data:[],error:null};
      if(hiddenResult.error)throw hiddenResult.error;
      const pageHidden=new Set((hiddenResult.data||[]).map(row=>String(row.message_id)));
      const visible=page.filter(m=>!pageHidden.has(String(m.id))&&(kind!=="files"||! /^(image|video|audio)\//i.test(m.attachment_mime||"")));
      if(kind==="links")renderLinks(visible,append,other);
      else await renderAttachments(visible,append,token,other);
      if(token!==request||kind!==category)return;
      const count=$("contactInfoMediaList").children.length;
      $("contactInfoMediaStatus").textContent=count?tr("محتوای همین گفتگو","Shared in this conversation"):(more?tr("در این بازه موردی نیست؛ موارد قدیمی‌تر را هم بررسی کن.","No items in this range; check older items too."):tr("موردی در این دسته‌بندی وجود ندارد.","No items in this category yet."));
      $("privateHubLoadMore").hidden=!more;$("privateHubLoadMore").disabled=false;
      $("privateHubLoadMore").textContent=tr("موارد قدیمی‌تر","Load older items");
    }catch(error){
      if(token===request){$("contactInfoMediaStatus").textContent=tr("بارگذاری ناموفق بود؛ دوباره تلاش کن.","Loading failed; please retry.");$("contactInfoStatus").textContent=(english?"Media error: ":"خطای محتوا: ")+(error?.message||String(error));}
    }finally{if(token===request){busy=false;$("privateHubLoadMore").disabled=false;}}
  }

  function renderLinks(items,append,other){
    const list=$("contactInfoMediaList");if(!append)list.replaceChildren();
    for(const m of items){
      const match=String(m.body||"").match(/https?:\/\/[^\s<>"']+/i);if(!match)continue;
      const b=document.createElement("button");b.type="button";b.className="private-hub-link-item";
      const url=document.createElement("span");url.textContent=match[0].replace(/[),.!?]+$/,"");
      const meta=document.createElement("small");meta.textContent=new Date(m.created_at).toLocaleString(english?"en":"fa-IR",{dateStyle:"medium",timeStyle:"short"});
      b.append(url,meta);b.addEventListener("click",()=>{close();openSearchedMessage(m.id,m.created_at,other);});list.appendChild(b);
    }
  }

  async function renderAttachments(items,append,token,other){
    const list=$("contactInfoMediaList");if(!append)list.replaceChildren();if(!items.length)return;
    const paths=[...new Set(items.map(m=>m.attachment_path).filter(Boolean))];
    const {data,error}=await getClient().storage.from("chat-attachments").createSignedUrls(paths,3600);
    if(token!==request||String(currentChatUser?.user_id)!==other)return;
    if(error)throw error;
    const urls=new Map((data||[]).filter(x=>x?.path&&x?.signedUrl&&!x.error).map(x=>[x.path,x.signedUrl]));
    for(const m of items){
      const url=urls.get(m.attachment_path),card=document.createElement("a"),mime=String(m.attachment_mime||""),name=m.attachment_name||tr("فایل پیوست","Attachment");
      card.className="contact-info-media-item private-hub-media-item";card.href=url||"#";card.target="_blank";card.rel="noopener noreferrer";
      if(!url){card.addEventListener("click",e=>e.preventDefault());card.setAttribute("aria-disabled","true");}
      if(category==="photos"&&url){
        const img=document.createElement("img");img.src=url;img.alt=name;img.loading="lazy";img.decoding="async";card.appendChild(img);
      }else if(category==="videos"&&url){
        const video=document.createElement("video");video.src=url;video.controls=true;video.preload="none";video.playsInline=true;video.setAttribute("aria-label",name);card.appendChild(video);
        card.addEventListener("click",e=>{if(video.contains(e.target)||e.target===video)e.preventDefault();});
      }else if(category==="audio"&&url){
        const audio=document.createElement("audio");audio.src=url;audio.controls=true;audio.preload="none";audio.setAttribute("aria-label",name);card.appendChild(audio);
        card.addEventListener("click",e=>{if(audio.contains(e.target)||e.target===audio)e.preventDefault();});
      }else{
        const glyph=document.createElement("span");glyph.className="contact-info-file-icon";glyph.textContent=category==="audio"?"♫":"↧";card.appendChild(glyph);
      }
      const label=document.createElement("span");label.className="contact-info-media-name";label.textContent=url?name:tr("این فایل در دسترس نیست","This file is unavailable");card.appendChild(label);list.appendChild(card);
    }
  }

  window.FarnazPrivateChatHub={ensure,open,close,selectCategory,loadPage};
  window.ensureContactInfoDialog=ensure;
  window.openContactInfo=open;
  window.closeContactInfo=close;
  window.loadContactInfoMedia=(id)=>String(id)===String(contactId)?loadPage(false):undefined;
})();