"use strict";

window.FARNAZ_CONFIG = {
  supabaseUrl: "https://iemykhluluoymsbqpjsn.supabase.co",
  supabasePublishableKey: "sb_publishable_LhUmVjXJlazgYRtEvXna6g_GGKxi_kC"
};

let english=false,authMode="signup",farnazClient=null,currentUser=null;
let currentProfileName="",currentAvatarUrl="",currentPhone="";
let currentChatUser=null,messageSubscription=null,reconnectTimer=null,reconnectAttempts=0;
let profileRequestNumber=0,chatRequestNumber=0,previousPage="chatsPage";
let conversationView="active",conversationPrefs=new Map(),messageLoadedCount=50,messageHasMore=false;
let selectedMessageIds=new Set(),replyTarget=null,editingMessageId=null,messageSelectionMode=false,preEditDraft="";
let recordedVoiceFile=null,recordedVoiceUrl=null,mediaRecorder=null,recordedAudioChunks=[],recordingStream=null;

const $=id=>document.getElementById(id);

const APPEARANCE_DEFAULTS={theme:"dark",accent:"#50e3c2",fontSize:"medium",fontFamily:"system",fontColor:"auto",outgoingBubble:"auto",incomingBubble:"auto"};
const APPEARANCE_KEY="farnaz-appearance-v1";
function readAppearanceSettings(){
  try{return {...APPEARANCE_DEFAULTS,...JSON.parse(localStorage.getItem(APPEARANCE_KEY)||"{}")};}
  catch(_){return {...APPEARANCE_DEFAULTS};}
}
let appearanceSettings=readAppearanceSettings();
function applyAppearanceSettings(){
  const root=document.documentElement;
  let theme=appearanceSettings.theme||"dark";
  if(theme==="system")theme=window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";
  document.body.dataset.theme=theme;
  const fontColor=appearanceSettings.fontColor||"auto";
  document.body.dataset.fontColor=fontColor;
  root.style.setProperty("--white",fontColor==="white"?"#ffffff":fontColor==="black"?"#111111":theme==="light"?"#172237":"#f7f9fc");
  const accent=appearanceSettings.accent||APPEARANCE_DEFAULTS.accent;
  root.style.setProperty("--accent",accent);
  root.style.setProperty("--mint",accent);
  const hex=accent.replace("#","");
  const rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));
  const luminance=(0.2126*rgb[0]+0.7152*rgb[1]+0.0722*rgb[2])/255;
  const accentInk=luminance>0.62?"#111111":"#ffffff";
  root.style.setProperty("--accent-ink",accentInk);
  /* Each chat bubble has its own saved color; automatic follows the accent color. */
  const readableInk=color=>{
    const h=(color||"#50e3c2").replace("#","");
    const channels=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16));
    const linear=channels.map(v=>{v/=255;return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4);});
    return 0.2126*linear[0]+0.7152*linear[1]+0.0722*linear[2]>0.42?"#111111":"#ffffff";
  };
  const outgoing=appearanceSettings.outgoingBubble||"auto";
  const incoming=appearanceSettings.incomingBubble||"auto";
  const outgoingColor=outgoing==="auto"?accent:outgoing;
  const incomingColor=incoming==="auto"?(accent.toLowerCase()==="#ffffff"?"#eef1f5":accent.toLowerCase()==="#000000"?"#252525":"color-mix(in srgb, "+accent+" 15%, var(--panel2))"):incoming;
  root.style.setProperty("--my-message-bg",outgoingColor);
  root.style.setProperty("--my-message-ink",readableInk(outgoingColor));
  root.style.setProperty("--their-message-bg",incomingColor);
  root.style.setProperty("--their-message-ink",incoming==="auto"&&accent!=="#ffffff"&&accent!=="#000000"?(theme==="light"?"#172237":"#f7f9fc"):readableInk(incomingColor));
  const sizes={small:"0.92",medium:"1",large:"1.12"};
  root.style.setProperty("--font-scale",sizes[appearanceSettings.fontSize]||"1");
  const fonts={system:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',serif:'Georgia,"Times New Roman",serif',rounded:'"Trebuchet MS",Arial,sans-serif'};
  document.body.style.fontFamily=fonts[appearanceSettings.fontFamily]||fonts.system;
  ["themeSetting","fontSizeSetting","fontFamilySetting","fontColorSetting"].forEach((id,index)=>{
    const el=$(id);if(el)el.value=[appearanceSettings.theme,appearanceSettings.fontSize,appearanceSettings.fontFamily,appearanceSettings.fontColor||"auto"][index];
  });
  document.querySelectorAll(".color-choice[data-color]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.color===appearanceSettings.accent)));
  document.querySelectorAll(".bubble-color-choice").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.bubbleColor===(appearanceSettings[button.dataset.bubbleTarget]||"auto"))));
}
function updateAppearanceSetting(key,value){
  if(key==="accent"&&!/^#[0-9a-f]{6}$/i.test(value))return;
  if(["outgoingBubble","incomingBubble"].includes(key)&&value!=="auto"&&!/^#[0-9a-f]{6}$/i.test(value))return;
  const allowed={theme:["dark","light","system"],fontSize:["small","medium","large"],fontFamily:["system","serif","rounded"]};
  if(allowed[key]&&!allowed[key].includes(value))return;
  appearanceSettings={...appearanceSettings,[key]:value};
  try{localStorage.setItem(APPEARANCE_KEY,JSON.stringify(appearanceSettings));}catch(_){}
  applyAppearanceSettings();
  if($("settingsStatus"))$("settingsStatus").textContent=english?"Settings saved on this device.":"تنظیمات روی این دستگاه ذخیره شد.";
}
function resetAppearanceSettings(){
  appearanceSettings={...APPEARANCE_DEFAULTS};
  try{localStorage.setItem(APPEARANCE_KEY,JSON.stringify(appearanceSettings));}catch(_){}
  applyAppearanceSettings();
  if($("settingsStatus"))$("settingsStatus").textContent=english?"Default settings restored.":"تنظیمات اولیه بازگردانده شد.";
}
function applySettingsLanguage(){
  const labels={
    navSettings:["تنظیمات","Settings"],settingsHeading:["تنظیمات","Settings"],
    settingsIntro:["ظاهر فرناز را مطابق سلیقه‌ات تنظیم کن؛ تغییرات روی همین دستگاه ذخیره می‌شوند.","Personalize Farnaz. Your choices are saved on this device."],
    appearanceTitle:["ظاهر برنامه","Appearance"],themeLabel:["حالت نمایش","Theme"],
    themeHint:["روشن، تیره یا هماهنگ با دستگاه","Light, dark, or follow device"],
    fontSizeLabel:["اندازه نوشته","Text size"],fontSizeHint:["اندازه متن در سراسر برنامه","Text size across the app"],
    fontFamilyLabel:["فونت فارسی","Font style"],fontFamilyHint:["انتخاب فونت خوانا","Choose a readable font style"],
    fontColorLabel:["رنگ نوشته","Font color"],fontColorHint:["رنگ متن برنامه را انتخاب کن","Choose the app text color"],
    accentTitle:["رنگ اصلی","Accent color"],accentLabel:["رنگ تأکیدی فرناز","Farnaz accent color"],
    accentHint:["برای دکمه‌ها و جزئیات رابط کاربری","Used for buttons and interface details"],
    outgoingBubbleTitle:["رنگ حباب پیام‌های من","My message bubble color"],
    outgoingBubbleLabel:["پیام‌های ارسالی","Outgoing messages"],
    outgoingBubbleHint:["رنگ حباب پیام‌هایی که خودت می‌فرستی","Color of messages you send"],
    incomingBubbleLabel:["پیام‌های دریافتی","Incoming messages"],
    incomingBubbleHint:["رنگ حباب پیام‌هایی که مخاطب می‌فرستد","Color of messages you receive"],
    languageTitle:["زبان","Language"],languageLabel:["زبان برنامه","App language"],
    languageHint:["فارسی یا انگلیسی","Persian or English"],
    resetSettingsButton:["بازگردانی تنظیمات اولیه","Reset to defaults"]
  };
  Object.entries(labels).forEach(([id,pair])=>{if($(id))$(id).textContent=pair[english?1:0];});
  const optionSets={
    themeSetting:[["dark","تیره","Dark"],["light","روشن","Light"],["system","مطابق دستگاه","System"]],
    fontSizeSetting:[["small","کوچک","Small"],["medium","معمولی","Medium"],["large","بزرگ","Large"]],
    fontFamilySetting:[["system","پیش‌فرض دستگاه","Device default"],["serif","سریف","Serif"],["rounded","گرد و نرم","Rounded"]],
    fontColorSetting:[["auto","خودکار بر اساس تم","Automatic by theme"],["white","سفید","White"],["black","سیاه","Black"]]
  };
  Object.entries(optionSets).forEach(([id,items])=>{const el=$(id);if(el)Array.from(el.options).forEach((o,i)=>{o.textContent=items[i][english?2:1];});});
  if($("settingsLanguageButton"))$("settingsLanguageButton").textContent=english?"Switch to فارسی":"English / فارسی";
}
window.addEventListener("storage",event=>{if(event.key===APPEARANCE_KEY){appearanceSettings=readAppearanceSettings();applyAppearanceSettings();}});
if(window.matchMedia){window.matchMedia("(prefers-color-scheme: light)").addEventListener?.("change",()=>{if(appearanceSettings.theme==="system")applyAppearanceSettings();});}
applyAppearanceSettings();



function getClient(){
  if(farnazClient)return farnazClient;

  const c=window.FARNAZ_CONFIG;

  if(!c?.supabaseUrl||!c?.supabasePublishableKey){
    throw new Error("تنظیمات Supabase ناقص است.");
  }

  if(!window.supabase?.createClient){
    throw new Error("کتابخانه Supabase بارگذاری نشده؛ صفحه را تازه‌سازی کن.");
  }

  farnazClient=window.supabase.createClient(
    c.supabaseUrl,
    c.supabasePublishableKey,
    {
      auth:{
        persistSession:true,
        autoRefreshToken:true,
        detectSessionInUrl:true
      }
    }
  );

  return farnazClient;
}

function setStatus(id,msg,isError=false){
  const e=$(id);if(!e)return;
  e.textContent=msg;e.classList.toggle("error-text",isError);
}
function setConnectionBanner(message,show=true){
  const banner=$("connectionBanner");if(!banner)return;
  banner.textContent=message||"";
  banner.hidden=!show||!message;
}
function isTransientError(error){
  const status=Number(error?.status||error?.statusCode||error?.cause?.status||0);
  const code=String(error?.code||"").toUpperCase();
  const message=String(error?.message||error||"").toLowerCase();
  if(status===401||status===403||code.startsWith("23")||code.startsWith("42"))return false;
  return status===408||status===425||status===429||status>=500||
    /network|fetch failed|failed to fetch|timeout|timed out|temporar|connection reset|connection closed|load failed|offline|gateway|too many requests/.test(message);
}
const recoveryDelay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function retryRead(label,operation,maxAttempts=3){
  let lastError;
  for(let attempt=1;attempt<=maxAttempts;attempt++){
    try{
      if(typeof navigator!=="undefined"&&navigator.onLine===false){
        setConnectionBanner(english?"You are offline. Farnaz will reconnect automatically.":"اتصال اینترنت قطع است؛ فرناز پس از وصل‌شدن خودکار تلاش می‌کند.");
        throw new Error("NETWORK_OFFLINE");
      }
      const result=await operation();
      if(result?.error)throw result.error;
      if(Array.isArray(result)){
        const failed=result.find(item=>item?.error);
        if(failed)throw failed.error;
      }
      return result;
    }catch(error){
      lastError=error;
      if(!isTransientError(error)||attempt===maxAttempts)throw error;
      setConnectionBanner(english?"Connection interrupted. Retrying automatically…":"ارتباط موقتاً قطع شده؛ تلاش مجدد خودکار…");
      await recoveryDelay(300*Math.pow(2,attempt-1)+Math.floor(Math.random()*180));
    }
  }
  throw lastError;
}
let recoveryInProgress=false;
function scheduleReconnect(){
  if(reconnectTimer||!currentUser||typeof navigator!=="undefined"&&navigator.onLine===false)return;
  const delay=Math.min(30000,1000*Math.pow(2,Math.min(reconnectAttempts,5)));
  reconnectAttempts++;
  reconnectTimer=setTimeout(()=>{
    reconnectTimer=null;
    recoverConnection();
  },delay);
}
async function recoverConnection(){
  if(recoveryInProgress||!currentUser||typeof navigator!=="undefined"&&navigator.onLine===false)return;
  recoveryInProgress=true;
  try{
    await subscribeToMessages();
    await retryRead("conversation refresh",()=>refreshConversationList(),2);
    if(currentChatUser)await loadMessages(false);
    setConnectionBanner("",false);
  }catch(error){
    console.warn("Automatic connection recovery:",error);
    setConnectionBanner(english?"Still reconnecting. You can keep using Farnaz; it will retry automatically.":"هنوز اتصال برقرار نشده؛ می‌توانی با فرناز کار کنی و برنامه دوباره تلاش می‌کند.");
    scheduleReconnect();
  }finally{recoveryInProgress=false;}
}
function normalizeDigits(v){
  return String(v||"")
    .replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}
function normalizePhone(v,countryCode="98"){
  const raw=normalizeDigits(v).trim();
  if(!raw)return "";
  const hasPlus=raw.startsWith("+");
  let digits=raw.replace(/\D/g,"");
  if(!digits)return "";
  if(raw.startsWith("00"))digits=digits.slice(2);
  else if(!hasPlus&&digits.startsWith("0"))digits=String(countryCode)+digits.replace(/^0+/,"");
  else if(!hasPlus&&String(countryCode)==="98"&&digits.startsWith("9")&&digits.length===10)digits="98"+digits;
  else if(!hasPlus&&!digits.startsWith(String(countryCode)))digits=String(countryCode)+digits;
  return "+"+digits;
}
function setPhoneCountry(selectId,phone){
  const digits=normalizeDigits(phone).replace(/\D/g,"");
  const select=$(selectId);if(!select)return;
  const match=["98","49","1","44","90"].find(code=>digits.startsWith(code));
  if(match)select.value=match;
}
function initials(name){return(name||"F").trim().charAt(0).toLocaleUpperCase()||"F";}
function renderAvatar(el,url,name){
  if(!el)return;
  el.replaceChildren();
  if(url){
    const img=document.createElement("img");
    img.src=url;img.alt=english?"Profile picture":"تصویر پروفایل";
    img.onerror=()=>{el.replaceChildren();el.textContent=initials(name);};
    el.appendChild(img);
  }else el.textContent=initials(name);
}
function startNewChat(){
  if(!currentUser){openAuth();return;}
  toggleContactSearch(false);
  toggleNewChatPopover();
}
function toggleNewChatPopover(force){
  const panel=$("newChatPopover"),button=$("topNewChatButton");
  if(!panel||!button)return;
  const open=typeof force==="boolean"?force:panel.hidden;
  panel.hidden=!open;button.setAttribute("aria-expanded",String(open));
  if(open){
    $("savedContactFilter").value="";
    filterSavedContactsForNewChat();
    refreshSavedContacts();
    requestAnimationFrame(()=> $("savedContactFilter").focus({preventScroll:true}));
  }
}
function filterSavedContactsForNewChat(){
  const query=($("savedContactFilter")?.value||"").trim().toLocaleLowerCase();
  let visible=0;
  $("newChatContactsList")?.querySelectorAll(".list-item").forEach(item=>{
    const name=(item.dataset.contactName||"").toLocaleLowerCase();
    const show=!query||name.includes(query);item.hidden=!show;if(show)visible++;
  });
  const hasItems=$("newChatContactsList")?.children.length||0;
  $("newChatContactsStatus").textContent=hasItems?(visible?"":(english?"No matching saved contacts.":"مخاطب ذخیره‌شده‌ای با این نام پیدا نشد.")):(english?"No saved contacts yet.":"هنوز مخاطبی ذخیره نشده است.");
}
function toggleContactSearch(force){
  const panel=$("contactSearchPopover"),button=$("contactSearchButton");
  if(!panel||!button)return;
  const open=typeof force==="boolean"?force:panel.hidden;
  panel.hidden=!open;
  button.setAttribute("aria-expanded",String(open));
  if(open)requestAnimationFrame(()=> $("recipientValue").focus({preventScroll:true}));
}
function toggleAttachmentMenu(force){
  const menu=$("attachmentMenu"),button=$("attachmentMenuButton");
  if(!menu||!button)return;
  const shouldOpen=typeof force==="boolean"?force:menu.hidden;
  menu.hidden=!shouldOpen;
  button.setAttribute("aria-expanded",String(shouldOpen));
}
function chooseAttachment(kind){
  toggleAttachmentMenu(false);
  const target=kind==="photo"?"photoFile":kind==="camera"?"cameraFile":"attachmentFile";
  $(target)?.click();
}
document.addEventListener("click",event=>{
  const menu=$("attachmentMenu"),button=$("attachmentMenuButton");
  if(menu&&!menu.hidden&&!menu.contains(event.target)&&!button.contains(event.target))toggleAttachmentMenu(false);
});
function navigate(pageId){
  if(!currentUser){openAuth();return;}
  if(!$(pageId))return;
  if(pageId==="chatPage"&&!currentChatUser)return;
  document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id===pageId));
  document.querySelector(".app").classList.toggle("chat-mode",pageId==="chatPage");
  document.body.classList.toggle("chat-mode",pageId==="chatPage");
  const brandHeader=document.querySelector(".app>header");
  if(brandHeader)brandHeader.hidden=pageId==="chatPage";
  if(pageId!=="chatPage"){document.documentElement.style.removeProperty("--chat-viewport-offset");document.documentElement.style.removeProperty("--chat-viewport-height");}
  document.querySelectorAll(".nav-button").forEach(b=>b.classList.toggle("active",b.dataset.page===pageId));
  $("bottomNav").classList.toggle("visible",pageId!=="homePage"&&pageId!=="chatPage");
  $("topNewChatButton").classList.toggle("visible",pageId==="chatsPage");
  if(pageId!=="chatsPage")toggleNewChatPopover(false);
  if(pageId!=="contactsPage")toggleContactSearch(false);
  if(pageId==="chatsPage")refreshConversationList();
  if(pageId==="contactsPage")refreshSavedContacts();
  window.scrollTo({top:0,behavior:"instant"});
}
function backFromChat(){dismissMessageMenus();exitMessageSelection();cancelReply();cancelMessageEdit();navigate(previousPage==="contactsPage"?"contactsPage":"chatsPage");}
function openAdjacentConversation(direction){
  const cards=[...$("conversationList").querySelectorAll(".conversation-card")];
  if(!cards.length)return;
  const ids=cards.map(card=>card.querySelector(".list-item")?.dataset.contactId||null);
  const index=ids.indexOf(String(currentChatUser?.user_id||""));
  const nextIndex=index+direction;
  if(nextIndex<0||nextIndex>=cards.length)return;
  cards[nextIndex].querySelector(".list-item")?.click();
}
(function installChatSwipeNavigation(){
  const area=$("messageList");if(!area)return;
  let startX=0,startY=0,startAt=0;
  area.addEventListener("touchstart",event=>{
    if(event.touches.length!==1)return;
    if(event.target.closest("button,a,input,textarea,audio,video,select")){startAt=0;return;}
    startX=event.touches[0].clientX;startY=event.touches[0].clientY;startAt=Date.now();
  },{passive:true});
  area.addEventListener("touchend",event=>{
    if(!startAt||!event.changedTouches.length)return;
    const dx=event.changedTouches[0].clientX-startX,dy=event.changedTouches[0].clientY-startY;
    const elapsed=Date.now()-startAt;startAt=0;
    if(Math.abs(dx)<85||Math.abs(dy)>65||elapsed>900)return;
    dismissMessageMenus();
    if(messageSelectionMode)exitMessageSelection();
    if(dx>0)backFromChat();
    else openAdjacentConversation(1);
  },{passive:true});
  area.addEventListener("touchcancel",()=>{startAt=0;},{passive:true});
})();
function setConversationView(view){conversationView=view;refreshConversationList();}
function prefFor(id){return conversationPrefs.get(id)||{pinned:false,archived:false,hidden_at:null};}
async function saveConversationPref(contactId,patch){
  const next={...prefFor(contactId),...patch,user_id:currentUser.id,contact_user_id:contactId,updated_at:new Date().toISOString()};
  const {error}=await getClient().from("conversation_preferences").upsert(next,{onConflict:"user_id,contact_user_id"});
  if(error)throw error;conversationPrefs.set(contactId,next);await refreshConversationList();
}
async function conversationAction(contactId,action){
  try{
    const old=prefFor(contactId);
    if(action==="delete"){
      if(!confirm(english?"Hide this conversation from your list? The other person keeps their messages.":"این گفتگو فقط از فهرست شما پنهان شود؟ پیام‌های طرف مقابل حذف نمی‌شود."))return;
      await saveConversationPref(contactId,{hidden_at:new Date().toISOString(),archived:false,pinned:false});
    }else if(action==="pin")await saveConversationPref(contactId,{pinned:!old.pinned,archived:false});
    else if(action==="archive")await saveConversationPref(contactId,{archived:!old.archived,pinned:false});
  }catch(e){alert((english?"Action failed: ":"عملیات ناموفق بود: ")+e.message);}
}
function showConversationActions(card,contactId){
  card.querySelector(".conversation-action-menu")?.remove();
  const p=prefFor(contactId),menu=document.createElement("div");menu.className="conversation-tools conversation-action-menu";
  const items=[[p.pinned?(english?"Unpin":"برداشتن پین"):(english?"Pin":"پین"),"pin"],[p.archived?(english?"Unarchive":"خروج از آرشیو"):(english?"Archive":"آرشیو"),"archive"],[english?"Delete chat":"حذف گفتگو","delete"]];
  for(const [label,action] of items){const b=document.createElement("button");b.type="button";b.className="mini-button"+(action==="delete"?" danger":"");b.textContent=label;b.onclick=()=>conversationAction(contactId,action);menu.appendChild(b);}
  card.appendChild(menu);
}
function openAuth(){
  $("authBox").style.display="flex";setStatus("authStatus","");
  $("authName").value="";$("authEmail").value="";$("authPassword").value="";
  updateAuthTexts();
}
function closeAuth(){$("authBox").style.display="none";}
async function signInSocial(provider="google"){
  const button=$("googleAuth");
  const label=button?.querySelector("span:last-child");
  if(button)button.disabled=true;
  setStatus("authStatus",english?"Connecting to Google…":"در حال اتصال به گوگل…");
  try{
    const client=getClient();
    const {error}=await client.auth.signInWithOAuth({
      provider,
      options:{redirectTo:"https://kalaghkocholo.github.io/Farnaz/"}
    });
    if(error)throw error;
  }catch(e){
    console.error("Social sign-in:",e);
    const message=(e.message||"").toLowerCase();
    const setupMissing=/provider is not enabled|unsupported provider|client_id|provider not found|invalid request/.test(message);
    setStatus("authStatus",setupMissing
      ?(english?"This sign-in provider is not configured yet. Enable it in Supabase Auth and add its OAuth credentials first.":"此登入方式尚未設定。請先在 Supabase Auth 啟用服務並填入 OAuth 憑證。")
      :(english?"Sign-in could not start: ":"無法開始登入：")+e.message,true);
    if(button)button.disabled=false;
  }
}
function switchAuthMode(){
  authMode=authMode==="signup"?"login":"signup";
  const signup=authMode==="signup";
  $("nameField").style.display=signup?"block":"none";
  $("authName").required=signup;
  $("authPassword").autocomplete=signup?"new-password":"current-password";
  setStatus("authStatus","");updateAuthTexts();
}
function updateAuthTexts(){
  const v=english;
  $("authTitle").textContent=authMode==="signup"?(v?"Create your Farnaz account":"ثبت‌نام در فرناز"):(v?"Sign in to Farnaz":"ورود به فرناز");
  $("authMessage").textContent=authMode==="signup"?(v?"Create an account to stay connected.":"برای ارتباط نزدیک‌تر، حساب خودت را بساز."):(v?"Sign in with your email and password.":"با ایمیل و رمز عبورت وارد شو.");
  $("authSubmit").textContent=authMode==="signup"?(v?"Sign up":"ثبت‌نام"):(v?"Sign in":"ورود");
  $("authSwitch").textContent=authMode==="signup"?(v?"Already have an account? Sign in":"قبلاً حساب ساخته‌ام؛ ورود"):(v?"Need an account? Sign up":"حساب ندارم؛ ثبت‌نام");
  $("googleAuthLabel").textContent=v?"Continue with Google":"ادامه با Google";
  $("authOrLabel").textContent=v?"or continue with email":"یا با ایمیل";
}
function toggleLanguage(){
  english=!english;
  document.documentElement.lang=english?"en":"fa";
  document.documentElement.dir=english?"ltr":"rtl";
  const labels={
    brand:["فرناز","Farnaz"],subtitle:["ارتباطی نزدیک‌تر، در هر کجا","Closer, wherever you are"],
    welcome:["خوش آمدی به فرناز","WELCOME TO FARNAZ"],
    headline:["آدم‌های مهم زندگی‌ات، همیشه نزدیک تو","The people who matter, closer to you"],
    description:["یک فضای ساده برای گفتگو و ارتباط با کسانی که برایت مهم‌اند.","A simple space to stay connected."],
    start:["شروع کنیم ←","Let's begin →"],f1:["گفتگوی خصوصی","Private chat"],
    f1d:["پیام‌هایت را مرتب دنبال کن.","Keep conversations organized."],
    f2:["عکس و فایل","Photos & files"],f2d:["لحظه‌ها و فایل‌ها را به اشتراک بگذار.","Share moments and files."],
    f3:["یادآوری‌ها","Reminders"],f3d:["کارهای مهم را فراموش نکن.","Remember what matters."],
    f4:["تماس صوتی و تصویری","Voice & video calls"],f4d:["ارتباطی فراتر از پیام متنی.","Connect beyond text."],
    chatsHeading:["گفتگوها","Chats"],chatsIntro:["گفتگوهای اخیرت را اینجا می‌بینی.","Your recent conversations appear here."],
    contactsHeading:["مخاطبان","Contacts"],
    contactsIntro:["مخاطبان ذخیره‌شده را انتخاب کن یا از جست‌وجوی پایین حساب جدیدی پیدا کن.","Choose a saved contact or find a new account using the search control below."],
    recipientLabel:["ایمیل یا شماره تلفن با کد کشور","Email or phone with country code"],
    recipientCountryLabel:["کد کشور شماره تلفن","Phone country code"],
    findRecipientBtn:["پیدا کردن مخاطب","Find contact"],foundHeading:["نتیجه جست‌وجو","Search result"],
    savedContactsStatus:["",""],
    profilePhoneCountryLabel:["کد کشور شماره تلفن","Phone country code"],
    contactNote:["جست‌وجو فقط برای حساب‌های ثبت‌شده در فرناز انجام می‌شود.","Search works for registered Farnaz accounts."],
    profileHeading:["پروفایل من","My profile"],profileIntro:["اطلاعات حساب خود را مدیریت کن.","Manage your account information."],
    profileNameLabel:["نام نمایشی","Display name"],profilePhoneLabel:["شماره موبایل با کد کشور","Phone number with country code"],
    avatarFileLabel:["تصویر پروفایل","Profile picture"],avatarNote:["فرمت JPG، PNG یا WebP؛ حداکثر ۳ مگابایت.","JPG, PNG or WebP; maximum 3 MB."],
    saveProfileButton:["ذخیره تغییرات","Save changes"],logoutButton:["خروج از حساب","Sign out"],
    navChats:["گفتگوها","Chats"],navContacts:["مخاطبان","Contacts"],navProfile:["پروفایل","Profile"],navSettings:["تنظیمات","Settings"],
    messagePrivacyNote:["",""],homeLogin:["ورود یا ثبت‌نام","Sign in or sign up"]
  };
  Object.entries(labels).forEach(([id,pair])=>{if($(id))$(id).textContent=pair[english?1:0];});
  if($("language"))$("language").textContent=english?"فا":"EN";
  ["recipientCountry","profilePhoneCountry"].forEach(id=>{
    const select=$(id);if(!select)return;
    const names=english?["Iran","Germany","United States / Canada","United Kingdom","Turkey"]:["ایران","آلمان","آمریکا / کانادا","بریتانیا","ترکیه"];
    Array.from(select.options).forEach((option,i)=>{option.textContent=names[i]+" (+"+option.value+")";});
  });
  $("footerText").textContent="Farnaz · Closer, wherever you are.";
  $("recipientValue").placeholder=english?"email@example.com or +98912...":"email@example.com یا +98912...";
  $("messageText").placeholder=english?"Write a message...":"پیامت را بنویس...";
  $("showActiveChats").textContent=english?"Chats":"گفتگوها";$("showArchivedChats").textContent=english?"Archive":"آرشیو";
  $("attachmentMenuButton").title=english?"Add attachment":"افزودن پیوست";
  $("attachmentPhotoOption").lastElementChild.textContent=english?"Choose photo":"انتخاب عکس";
  $("attachmentCameraOption").lastElementChild.textContent=english?"Take a photo":"گرفتن عکس با دوربین";
  $("attachmentFileOption").lastElementChild.textContent=english?"Choose file":"انتخاب فایل";
  $("topNewChatButton").title=english?"New chat":"گفتگوی جدید";
  $("topNewChatButton").setAttribute("aria-label",english?"New chat":"گفتگوی جدید");
  $("newChatPopoverTitle").textContent=english?"Start a new chat":"گفتگوی جدید";
  $("savedContactFilter").placeholder=english?"Search saved contacts by name":"جستجو با نام مخاطب ذخیره‌شده";
  $("savedContactFilter").setAttribute("aria-label",english?"Search saved contacts by name":"جستجو با نام مخاطب ذخیره‌شده");
  $("contactSearchButtonLabel").textContent=english?"Find contact":"جستجوی مخاطب";
  $("contactSearchTitle").textContent=english?"Find a new contact":"پیدا کردن مخاطب جدید";
  $("contactSearchButton").setAttribute("aria-label",english?"Find a new contact":"جستجوی مخاطب جدید");
  $("recordAudioButton").title=english?"Record voice message":"ضبط پیام صوتی";$("attachmentHint").textContent=english?"Files up to 20 MB":"فایل تا ۲۰ مگابایت";
  $("loadOlderButton").textContent=english?"Load older messages":"پیام‌های قدیمی‌تر";$("cancelEditButton").textContent=english?"Cancel edit":"لغو ویرایش";
  const selectionButtons=$("selectionToolbar").querySelectorAll("button");
  if(selectionButtons.length===4){selectionButtons[0].textContent=english?"Reply":"پاسخ";selectionButtons[1].textContent=english?"Forward":"فوروارد";selectionButtons[2].textContent=english?"Delete":"حذف";selectionButtons[3].textContent=english?"Cancel":"لغو";}

  $("authNameLabel").textContent=english?"Display name":"نام نمایشی";
  $("authEmailLabel").textContent=english?"Email":"ایمیل";
  $("authPasswordLabel").textContent=english?"Password (at least 8 characters)":"رمز عبور (حداقل ۸ کاراکتر)";
  updateAuthTexts();
  applySettingsLanguage();
  if(currentUser){refreshConversationList();refreshSavedContacts();}
}
function renderUser(user,name){
  currentUser=user;currentProfileName=(name||"").trim();
  $("userName").textContent=currentProfileName||(english?"Farnaz user":"کاربر فرناز");
  $("userEmail").textContent=user.email||"";
  $("userPhone").textContent=currentPhone||"";
  renderAvatar($("userAvatar"),currentAvatarUrl,$("userName").textContent);
}
async function showUser(user){
  const request=++profileRequestNumber;
  currentUser=user;renderUser(user,user.user_metadata?.display_name||"");
  setStatus("profileStatus",english?"Loading profile...":"در حال بارگذاری پروفایل...");
  try{
    const {data,error}=await getClient().from("profiles")
      .select("id,display_name,avatar_url,phone").eq("id",user.id).maybeSingle();
    if(request!==profileRequestNumber||currentUser?.id!==user.id)return;
    if(error)throw error;
    let profile=data;
    if(!profile){
      const fallbackName=(user.user_metadata?.display_name||user.email?.split("@")[0]||"Farnaz user").trim();
      const created=await getClient().from("profiles")
        .upsert({id:user.id,display_name:fallbackName,phone:user.phone||null},{onConflict:"id"})
        .select("id,display_name,avatar_url,phone").single();
      if(created.error)throw created.error;
      profile=created.data;
    }
    currentProfileName=profile?.display_name||user.user_metadata?.display_name||"";
    currentAvatarUrl=profile?.avatar_url||"";currentPhone=profile?.phone||"";
    renderUser(user,currentProfileName);
    $("profileNameInput").value=currentProfileName;
    $("profilePhoneInput").value=currentPhone;
    setPhoneCountry("profilePhoneCountry",currentPhone);
    setStatus("profileStatus",english?"Profile loaded.":"پروفایل بارگذاری شد.");
  }catch(e){
    console.error("Profile read:",e);
    setStatus("profileStatus",(english?"Could not load profile: ":"بارگذاری پروفایل ناموفق بود: ")+e.message,true);
  }
}
function showGuest(){
  profileRequestNumber++;currentUser=null;currentProfileName="";currentAvatarUrl="";currentPhone="";
  currentChatUser=null;
  $("bottomNav").classList.remove("visible");
  $("userName").textContent=english?"Farnaz user":"کاربر فرناز";
  $("userEmail").textContent="";$("userPhone").textContent="";
  $("profileForm").reset();
  $("conversationList").replaceChildren();$("foundContact").replaceChildren();
  $("savedContactsList").replaceChildren();setStatus("savedContactsStatus","");
  $("recipientValue").value="";setStatus("recipientStatus","");
  $("messageList").replaceChildren();
  document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id==="homePage"));
}
async function saveProfile(event){
  event.preventDefault();if(!currentUser)return;
  const name=$("profileNameInput").value.trim();
  const phone=normalizePhone($("profilePhoneInput").value,$("profilePhoneCountry").value);
  const file=$("avatarFile").files[0];
  const button=$("saveProfileButton");
  if(!name||name.length>60){
    setStatus("profileStatus",english?"Enter a name up to 60 characters.":"نامی بین ۱ تا ۶۰ نویسه وارد کن.",true);return;
  }
  if(phone&&!/^\+[1-9]\d{7,14}$/.test(phone)){
    setStatus("profileStatus",english?"Use international phone format, e.g. +98912...":"شماره را با کد کشور وارد کن؛ مثل +98912...",true);return;
  }
  if(file&&!["image/jpeg","image/png","image/webp"].includes(file.type)){
    setStatus("profileStatus",english?"Use JPG, PNG or WebP.":"فقط عکس JPG، PNG یا WebP مجاز است.",true);return;
  }
  if(file&&file.size>3*1024*1024){
    setStatus("profileStatus",english?"Image must be 3 MB or smaller.":"حجم عکس باید حداکثر ۳ مگابایت باشد.",true);return;
  }
  button.disabled=true;setStatus("profileStatus",english?"Saving profile...":"در حال ذخیره پروفایل...");
  try{
    const client=getClient();let avatarUrl=currentAvatarUrl;
    if(file){
      const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
      const path=currentUser.id+"/avatar-"+Date.now()+"."+ext;
      const {error}=await client.storage.from("avatars").upload(path,file,{contentType:file.type,upsert:false});
      if(error)throw error;
      avatarUrl=client.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    }
    const {data,error}=await client.from("profiles")
      .upsert({id:currentUser.id,display_name:name,phone:phone||null,avatar_url:avatarUrl||null},{onConflict:"id"})
      .select("id,display_name,phone,avatar_url").single();
    if(error)throw error;
    currentProfileName=data.display_name||name;currentPhone=data.phone||"";
    currentAvatarUrl=data.avatar_url||"";
    setPhoneCountry("profilePhoneCountry",currentPhone);
    const {error:metadataError}=await client.auth.updateUser({data:{display_name:currentProfileName}});
    if(metadataError)console.warn("Auth metadata update:",metadataError);
    renderUser(currentUser,currentProfileName);$("avatarFile").value="";
    setStatus("profileStatus",english?"Profile saved.":"پروفایل ذخیره شد.");
  }catch(e){
    console.error("Profile save:",e);
    setStatus("profileStatus",(english?"Could not save profile: ":"ذخیره پروفایل ناموفق بود: ")+e.message,true);
  }finally{button.disabled=false;}
}
async function logout(){
  $("logoutButton").disabled=true;
  try{
    const {error}=await getClient().auth.signOut();if(error)throw error;
    await stopMessageSubscription();showGuest();
  }catch(e){
    setStatus("profileStatus",(english?"Sign out failed: ":"خروج ناموفق بود: ")+e.message,true);
  }finally{$("logoutButton").disabled=false;}
}
async function stopMessageSubscription(){
  if(!messageSubscription||!farnazClient)return;
  const ch=messageSubscription;messageSubscription=null;
  try{await farnazClient.removeChannel(ch);}catch(e){console.warn(e);}
}
async function getContactProfile(id){
  const {data,error}=await getClient().rpc("get_farnaz_user_profile",{search_user_id:id});
  if(error)throw error;
  return Array.isArray(data)?(data[0]||null):(data||null);
}
function openChat(contact,fromPage="chatsPage"){
  currentChatUser=contact;previousPage=fromPage;
  $("conversationTitle").textContent=contact.display_name||(english?"Farnaz user":"مخاطب فرناز");
  $("chatSubtitle").textContent=english?"Private conversation":"گفتگوی خصوصی";
  renderAvatar($("chatAvatar"),contact.avatar_url||"",$("conversationTitle").textContent);
  setStatus("sendMessageStatus","");
  navigate("chatPage");loadMessages();
}
function makeContactButton(contact,preview="",timeText="",fromPage="chatsPage"){
  const button=document.createElement("button");
  button.type="button";button.className="list-item";button.dataset.contactId=String(contact.user_id||"");
  const avatar=document.createElement("span");avatar.className="avatar medium";
  renderAvatar(avatar,contact.avatar_url||"",contact.display_name);
  const details=document.createElement("span");details.className="list-details";
  const name=document.createElement("span");name.className="list-name";
  name.textContent=contact.display_name||(english?"Farnaz user":"مخاطب فرناز");
  const desc=document.createElement("span");desc.className="list-preview";
  desc.textContent=preview;
  details.append(name,desc);button.append(avatar,details);
  if(timeText){const time=document.createElement("span");time.className="list-time";time.textContent=timeText;details.appendChild(time);}
  button.addEventListener("click",()=>{if(button.dataset.suppressOpen==="1"){button.dataset.suppressOpen="0";return;}openChat(contact,fromPage);});
  return button;
}
async function refreshSavedContacts(){
  const list=$("savedContactsList");if(!list||!currentUser)return;
  const myId=currentUser.id;
  list.replaceChildren();
  setStatus("savedContactsStatus",english?"Loading saved contacts...":"در حال بارگذاری مخاطبان ذخیره‌شده...");
  try{
    const {data,error}=await retryRead("saved contacts",()=>getClient().from("contacts")
      .select("contact_user_id,created_at")
      .eq("user_id",myId).order("created_at",{ascending:false}));
    if(currentUser?.id!==myId)return;
    if(!data?.length){
      $("newChatContactsList")?.replaceChildren();filterSavedContactsForNewChat();
      setStatus("savedContactsStatus",english?"No saved contacts yet. Search using the button below.":"هنوز مخاطبی ذخیره نشده؛ از دکمه جست‌وجوی پایین استفاده کن.");
      return;
    }
    const profiles=await Promise.all(data.map(async item=>{
      try{return await getContactProfile(item.contact_user_id);}
      catch(e){console.warn("Saved contact profile:",e);return null;}
    }));
    if(currentUser?.id!==myId)return;
    const dropdownList=$("newChatContactsList");if(dropdownList)dropdownList.replaceChildren();
    const seenContacts=new Set();
    data.forEach((item,i)=>{
      const contactId=String(item.contact_user_id||"");if(!contactId||seenContacts.has(contactId))return;seenContacts.add(contactId);
      const p=profiles[i]||{};
      const contact={user_id:contactId,display_name:p.display_name||(english?"Farnaz user":"کاربر فرناز"),avatar_url:p.avatar_url||"",phone:p.phone||""};
      list.appendChild(makeContactButton(contact,p.phone||(english?"Saved contact":"مخاطب ذخیره‌شده"),
        new Date(item.created_at).toLocaleDateString(english?"en":"fa-IR"),"contactsPage"));
      if(dropdownList){const quick=makeContactButton(contact,p.phone||(english?"Saved contact":"مخاطب ذخیره‌شده"),"","chatsPage");quick.dataset.contactName=contact.display_name;dropdownList.appendChild(quick);}
    });
    filterSavedContactsForNewChat();
    setStatus("savedContactsStatus","");
  }catch(e){
    console.error("Saved contacts:",e);
    setStatus("savedContactsStatus",(english?"Could not load saved contacts: ":"بارگذاری مخاطبان ناموفق بود: ")+e.message,true);
  }
}
let conversationListRequestNumber=0;
async function refreshConversationList(){
  if(!currentUser)return;
  const request=++conversationListRequestNumber;
  const myId=currentUser.id;
  try{
    const prefResult=await retryRead("conversation preferences",()=>getClient().from("conversation_preferences").select("*").eq("user_id",myId));
    if(currentUser?.id!==myId||request!==conversationListRequestNumber)return;
    conversationPrefs=new Map((prefResult.data||[]).map(p=>[String(p.contact_user_id),p]));
  }catch(prefError){
    console.warn("Conversation preferences:",prefError);
    if(!conversationPrefs.size)setConnectionBanner(english?"Some conversation settings could not load. Retrying…":"بخشی از تنظیمات گفتگو بارگذاری نشد؛ دوباره تلاش می‌کنیم.");
  }

  const list=$("conversationList");if(!list||!currentUser||request!==conversationListRequestNumber)return;
  setStatus("inboxStatus",english?"Loading conversations...":"در حال بارگذاری گفتگوها...");
  try{
    const {data,error}=await retryRead("conversation list",()=>getClient().from("messages")
      .select("id,sender_id,receiver_id,body,created_at,message_type,attachment_name")
      .or("sender_id.eq."+myId+",receiver_id.eq."+myId)
      .order("created_at",{ascending:false}).limit(1000));
    if(currentUser?.id!==myId||request!==conversationListRequestNumber)return;
    const conversations=new Map();
    for(const m of data||[]){
      const id=String(m.sender_id===myId?m.receiver_id:m.sender_id||"");
      if(!id||id===myId||conversations.has(id))continue;
      const pref=prefFor(id);
      if(pref.hidden_at&&new Date(m.created_at)<=new Date(pref.hidden_at))continue;
      conversations.set(id,{user_id:id,lastMessage:m.body||((m.message_type||"text")==="image"?(english?"📷 Photo":"📷 عکس"):""),created_at:m.created_at,lastSender:m.sender_id});
    }
    list.replaceChildren();
    const entries=[...conversations.values()].filter(c=>conversationView==="archived"?prefFor(c.user_id).archived:!prefFor(c.user_id).archived)
      .sort((a,b)=>Number(prefFor(b.user_id).pinned)-Number(prefFor(a.user_id).pinned)||new Date(b.created_at)-new Date(a.created_at));
    if(!entries.length){setStatus("inboxStatus",conversationView==="archived"?(english?"No archived conversations.":"گفتگوی آرشیوشده‌ای وجود ندارد."):(english?"No conversations yet. Start one from Contacts.":"هنوز گفتگویی نداری؛ از بخش مخاطبان گفتگوی جدید بساز."));return;}
    setStatus("inboxStatus","");
    const profiles=await Promise.all(entries.map(async c=>{
      try{return await getContactProfile(c.user_id);}catch(e){console.warn("Contact profile:",e);return null;}
    }));
    if(currentUser?.id!==myId||request!==conversationListRequestNumber)return;
    entries.forEach((c,i)=>{
      const p=profiles[i]||{};
      const name=p.display_name||(english?"Farnaz user":"مخاطب فرناز");
      const pref=prefFor(c.user_id);
      const preview=(c.lastSender===myId?(english?"You: ":"شما: "):"")+(pref.pinned?"📌 ":"")+(pref.archived?"🗄 ":"")+c.lastMessage;
      const contact={user_id:c.user_id,display_name:name,avatar_url:p.avatar_url||""};
      const card=document.createElement("div");card.className="conversation-card"+(pref.pinned?" pinned":"")+(pref.archived?" archived":"");
      const btn=makeContactButton(contact,preview,new Date(c.created_at).toLocaleString(english?"en":"fa-IR"));
      btn.addEventListener("contextmenu",e=>{e.preventDefault();showConversationActions(card,c.user_id);});
      let hold;btn.addEventListener("pointerdown",()=>{hold=setTimeout(()=>{btn.dataset.suppressOpen="1";showConversationActions(card,c.user_id);},550);});
      ["pointerup","pointercancel","pointerleave"].forEach(ev=>btn.addEventListener(ev,()=>clearTimeout(hold)));
      let sx=0;btn.addEventListener("touchstart",e=>{sx=e.changedTouches[0].clientX;},{passive:true});
      btn.addEventListener("touchend",e=>{if(Math.abs(e.changedTouches[0].clientX-sx)>65){btn.dataset.suppressOpen="1";showConversationActions(card,c.user_id);}},{passive:true});
      card.appendChild(btn);list.appendChild(card);
    });
  }catch(e){
    console.error("Inbox load:",e);
    setStatus("inboxStatus",(english?"Could not load conversations: ":"بارگذاری گفتگوها ناموفق بود: ")+e.message,true);
  }
}
async function findRecipient(event){
  event.preventDefault();
  if(!currentUser){openAuth();return;}
  const value=$("recipientValue").value.trim();
  if(!value){setStatus("recipientStatus",english?"Enter an email or phone number.":"ایمیل یا شماره را وارد کن.",true);return;}
  const button=$("findRecipientBtn");button.disabled=true;
  $("foundContact").replaceChildren();
  setStatus("recipientStatus",english?"Searching...":"در حال جست‌وجو...");
  try{
    const client=getClient();let data,error;
    if(value.includes("@")){
      ({data,error}=await client.rpc("find_farnaz_user",{search_email:value}));
    }else{
      const phone=normalizePhone(value,$("recipientCountry").value);
      if(!/^\+[1-9]\d{7,14}$/.test(phone))
        throw new Error(english?"Enter a valid phone number.":"شماره تلفن معتبر وارد کن.");
      ({data,error}=await client.rpc("find_farnaz_user_by_phone",{search_phone:phone}));
    }
    if(error)throw error;
    if(!data||!data.length){
      setStatus("recipientStatus",english?"No account found. Check the details.":"حسابی پیدا نشد؛ اطلاعات را بررسی کن.");return;
    }
    const r=data[0];
    const id=r.user_id||r.id;
    if(!id)throw new Error(english?"Search did not return a user ID.":"جست‌وجو شناسهٔ کاربر را برنگرداند.");
    if(id===currentUser.id){
      setStatus("recipientStatus",english?"You cannot message yourself.":"نمی‌توانی به حساب خودت پیام بدهی.",true);return;
    }
    const {error:saveError}=await client.from("contacts")
      .upsert({user_id:currentUser.id,contact_user_id:id},{onConflict:"user_id,contact_user_id",ignoreDuplicates:true});
    if(saveError)throw saveError;
    let profile=null;
    try{profile=await getContactProfile(id);}catch(e){console.warn(e);}
    const contact={
      user_id:id,
      display_name:r.display_name||profile?.display_name||(english?"Farnaz user":"کاربر فرناز"),
      avatar_url:r.avatar_url||profile?.avatar_url||"",
      phone:r.phone||profile?.phone||""
    };
    $("foundContact").appendChild(makeContactButton(
      contact,english?"Tap to open a private conversation":"برای باز کردن گفتگوی خصوصی بزن"
    ));
    setStatus("recipientStatus",english?"Contact found and saved.":"مخاطب پیدا و ذخیره شد.");
    previousPage="contactsPage";
    await refreshSavedContacts();
  }catch(e){
    console.error("Find recipient:",e);
    setStatus("recipientStatus",(english?"Search failed: ":"جست‌وجوی مخاطب ناموفق بود: ")+e.message,true);
  }finally{button.disabled=false;}
}
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
async function deleteMessage(m){
  const all=m.sender_id===currentUser.id&&confirm(english?"Delete for everyone? Choose Cancel to hide only for you.":"برای همه حذف شود؟ برای حذف فقط از صفحه خودت «لغو» را بزن.");
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
