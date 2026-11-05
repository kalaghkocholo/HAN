"use strict";

window.FARNAZ_CONFIG = {
  supabaseUrl: "https://iemykhluluoymsbqpjsn.supabase.co",
  supabasePublishableKey: "sb_publishable_LhUmVjXJlazgYRtEvXna6g_GGKxi_kC"
};

let english=false,authMode="signup",farnazClient=null,currentUser=null,profileCompletionRequired=false;
let currentProfileName="",currentAvatarUrl="",currentPhone="",currentChatPresenceLabel="گفتگوی خصوصی";
let currentChatUser=null,messageSubscription=null,reconnectTimer=null,reconnectAttempts=0;
let profileRequestNumber=0,chatRequestNumber=0,previousPage="chatsPage";
let swipePageHistory=[],swipePageHistoryIndex=-1,swipeGesture=null,swipeTransitionTimer=null;
let conversationView="active",conversationPrefs=new Map(),messageLoadedCount=50,messageHasMore=false;
let contactsCategory="all";
let selectedMessageIds=new Set(),replyTarget=null,editingMessageId=null,messageSelectionMode=false,preEditDraft="";
let recordedVoiceFile=null,recordedVoiceUrl=null,mediaRecorder=null,recordedAudioChunks=[],recordingStream=null;

const $=id=>document.getElementById(id);

const APPEARANCE_DEFAULTS={theme:"dark",accent:"#7896c5",fontSize:"medium",fontFamily:"system",fontColor:"auto",outgoingBubble:"#c6d2e8",incomingBubble:"#bde7fa"};
const APPEARANCE_KEY="farnaz-appearance-v2";
function readAppearanceSettings(){
  try{
    const saved=localStorage.getItem(APPEARANCE_KEY);
    if(saved){const parsed=JSON.parse(saved);if(parsed.accent==="#50e3c2")parsed.accent=APPEARANCE_DEFAULTS.accent;return {...APPEARANCE_DEFAULTS,...parsed};}
    const legacy=JSON.parse(localStorage.getItem("farnaz-appearance-v1")||"{}");
    if(!legacy.outgoingBubble||legacy.outgoingBubble==="auto")legacy.outgoingBubble=APPEARANCE_DEFAULTS.outgoingBubble;
    if(!legacy.incomingBubble||legacy.incomingBubble==="auto")legacy.incomingBubble=APPEARANCE_DEFAULTS.incomingBubble;
    const migrated={...APPEARANCE_DEFAULTS,...legacy};
    localStorage.setItem(APPEARANCE_KEY,JSON.stringify(migrated));
    return migrated;
  }catch(_){return {...APPEARANCE_DEFAULTS};}
}
let appearanceSettings=readAppearanceSettings();
let privacySettings={presence_visibility:"contacts",last_seen_visibility:"contacts",show_typing:true,show_read_receipts:true,show_space_online_count:true};
let farnazPresenceChannel=null,farnazPresenceTimer=null,farnazPresenceMap=new Map(),farnazPresenceContactCache=new Map(),farnazPresenceChannels=new Map(),farnazTypingChannel=null,farnazVisibilityHandler=null,farnazPresenceSessionId=null;
let privateTypingTimer=null,remoteTypingTimer=null;
function applyAppearanceSettings(){
  const root=document.documentElement;
  let theme=appearanceSettings.theme||"dark";
  if(theme==="system")theme=window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";
  document.body.dataset.theme=theme;
  const palette=theme==="light"
    ?{bg:"#f4f6fa",panel:"#ffffff",panel2:"#edf1f7",border:"#dce3ed",muted:"#68778d",white:"#172237",danger:"#b42318",mint:"#7896c5"}
    :{bg:"#101722",panel:"#182231",panel2:"#222e3e",border:"#303d4f",muted:"#a4b1c3",white:"#f4f7fb",danger:"#ffaaa9",mint:"#91acd8"};
  Object.entries(palette).forEach(([key,value])=>root.style.setProperty("--"+key,value));
  root.style.setProperty("--bg",palette.bg);root.style.setProperty("--panel",palette.panel);
  root.style.setProperty("--panel2",palette.panel2);root.style.setProperty("--border",palette.border);
  root.style.setProperty("--muted",palette.muted);root.style.setProperty("--danger",palette.danger);
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
  const isDefaultOutgoing=outgoing==="#c6d2e8"||outgoing==="auto";
  const isDefaultIncoming=incoming==="#bde7fa"||incoming==="auto";
  const outgoingColor=isDefaultOutgoing?(theme==="light"?"#dce6f5":"#293d59") : outgoing;
  const incomingColor=isDefaultIncoming?(theme==="light"?"#ffffff":"#222d3b"):incoming;
  root.style.setProperty("--my-message-bg",outgoingColor);
  root.style.setProperty("--my-message-ink",readableInk(outgoingColor));
  root.style.setProperty("--their-message-bg",incomingColor);
  root.style.setProperty("--their-message-ink",readableInk(incomingColor));
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
     notificationsHeading:["اعلان‌ها","Notifications"],
     notificationsLabel:["اعلان پیام‌ها","Message notifications"],
     notificationsHint:["اجازه نمایش اعلان روی این دستگاه؛ اعلان پس از بسته‌شدن برنامه به پیکربندی Push سرور هم نیاز دارد.","Allow notifications on this device. Push server setup is also required after the app is closed."],
     enableNotificationsButton:["فعال‌سازی اعلان","Enable notifications"],
    privacyTitle:["حضور و حریم خصوصی","Presence & privacy"],
    presenceVisibilityLabel:["نمایش آنلاین بودن","Online status"],presenceVisibilityHint:["چه کسانی وضعیت آنلاین تو را ببینند؟","Who can see when you are online?"],
    lastSeenVisibilityLabel:["آخرین بازدید","Last seen"],lastSeenVisibilityHint:["چه کسانی زمان آخرین حضورت را ببینند؟","Who can see your last seen time?"],
    showTypingLabel:["نمایش «در حال نوشتن…»","Show typing status"],showTypingHint:["وضعیت نوشتن در گفتگوها نمایش داده شود.","Show when you are typing in chats."],
    showReadReceiptsLabel:["رسید خواندن پیام‌ها","Read receipts"],showReadReceiptsHint:["اجازه بده دیگران خوانده‌شدن پیام را ببینند.","Let others know when you have read their messages."],
    showSpaceOnlineCountLabel:["تعداد اعضای آنلاین گروه","Online group members"],showSpaceOnlineCountHint:["نمایش تعداد آنلاین‌ها در گروه‌ها فعال باشد.","Show the number of members currently online in groups."],
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
    fontColorSetting:[["auto","خودکار بر اساس تم","Automatic by theme"],["white","سفید","White"],["black","سیاه","Black"]],
    presenceVisibilitySetting:[["everyone","همه","Everyone"],["contacts","فقط مخاطبانم","My contacts"],["nobody","هیچ‌کس","Nobody"]],
    lastSeenVisibilitySetting:[["everyone","همه","Everyone"],["contacts","فقط مخاطبانم","My contacts"],["nobody","هیچ‌کس","Nobody"]]
  };
  Object.entries(optionSets).forEach(([id,items])=>{const el=$(id);if(el)Array.from(el.options).forEach((o,i)=>{o.textContent=items[i][english?2:1];});});
  if($("settingsLanguageButton"))$("settingsLanguageButton").textContent=english?"Switch to فارسی":"English / فارسی";
}
window.addEventListener("storage",event=>{if(event.key===APPEARANCE_KEY){appearanceSettings=readAppearanceSettings();applyAppearanceSettings();}});
if(window.matchMedia){window.matchMedia("(prefers-color-scheme: light)").addEventListener?.("change",()=>{if(appearanceSettings.theme==="system")applyAppearanceSettings();});}
applyAppearanceSettings();
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initPhoneContactsImport);else initPhoneContactsImport();
// Register the offline cache after the first load. Check for new app versions
// when the PWA returns to the foreground or reconnects, and reload only at a safe moment.
let farnazHadController=false;
let farnazReloadAfterUpdate=false;
let farnazUpdateCheckBusy=false;
function farnazHasUnsavedInteraction(){
  const active=document.activeElement;
  if(active&&active!==document.body&&active!==document.documentElement&&
     active.matches("input,textarea,select,[contenteditable='true']"))return true;
  for(const id of ["messageText","spaceText"]){
    const composer=document.getElementById(id);
    if(composer&&String(composer.value||"").trim())return true;
  }
  const authPassword=document.getElementById("authPassword");
  if(authPassword&&authPassword.value)return true;
  if(document.querySelector("form button[type='submit']:disabled,form input[type='submit']:disabled,[aria-busy='true']"))return true;
  const fileInputs=Array.from(document.querySelectorAll("input[type='file']"));
  if(fileInputs.some(input=>input.files&&input.files.length))return true;
  if(typeof mediaRecorder!=="undefined"&&mediaRecorder&&
     (mediaRecorder.state==="recording"||mediaRecorder.state==="paused"))return true;
  if(typeof recordedVoiceFile!=="undefined"&&recordedVoiceFile)return true;
  return false;
}
function applyFarnazUpdateWhenSafe(){
  if(!farnazReloadAfterUpdate||document.visibilityState==="hidden"||farnazHasUnsavedInteraction())return;
  farnazReloadAfterUpdate=false;
  window.location.reload();
}
function checkFarnazForUpdates(){
  const reg=window.farnazServiceWorkerRegistration;
  if(!reg||farnazUpdateCheckBusy||!navigator.onLine)return;
  farnazUpdateCheckBusy=true;
  Promise.resolve(reg.update())
    .catch(error=>console.warn("Farnaz update check:",error))
    .finally(()=>{farnazUpdateCheckBusy=false;});
}
function registerFarnazServiceWorker(){
  if(!("serviceWorker" in navigator)||location.protocol==="file:")return;
  farnazHadController=!!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange",()=>{
    if(!farnazHadController){farnazHadController=!!navigator.serviceWorker.controller;return;}
    farnazReloadAfterUpdate=true;
    applyFarnazUpdateWhenSafe();
  });
  navigator.serviceWorker.register("./service-worker.js")
    .then(reg=>{
      window.farnazServiceWorkerRegistration=reg;
      reg.update().catch(()=>{});
      reg.addEventListener("updatefound",()=>{
        const worker=reg.installing;
        if(!worker)return;
        worker.addEventListener("statechange",()=>{
          if(worker.state==="installed"&&navigator.serviceWorker.controller){
            farnazReloadAfterUpdate=true;
            applyFarnazUpdateWhenSafe();
          }
        });
      });
    })
    .catch(error=>console.warn("Farnaz service worker registration:",error));
}
if(document.readyState==="complete"){
  (window.requestIdleCallback||((fn)=>setTimeout(fn,900)))(registerFarnazServiceWorker,{timeout:2500});
}else{
  window.addEventListener("load",()=>{
    (window.requestIdleCallback||((fn)=>setTimeout(fn,900)))(registerFarnazServiceWorker,{timeout:2500});
  },{once:true});
}
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible"){checkFarnazForUpdates();applyFarnazUpdateWhenSafe();}
});
window.addEventListener("focus",()=>{checkFarnazForUpdates();applyFarnazUpdateWhenSafe();});
window.addEventListener("online",()=>{
  checkFarnazForUpdates();
  if(currentUser)scheduleReconnect();
});
document.addEventListener("focusout",()=>{window.setTimeout(applyFarnazUpdateWhenSafe,180);});
document.addEventListener("input",event=>{
  if(event.target&&event.target.matches("#messageText,#spaceText"))window.setTimeout(applyFarnazUpdateWhenSafe,180);
});
window.setInterval(()=>{
  if(document.visibilityState==="visible"){checkFarnazForUpdates();applyFarnazUpdateWhenSafe();}
},5*60*1000);
window.notifyFarnazIncomingMessage=async function(){
  if(!("Notification" in window)||Notification.permission!=="granted"||!document.hidden)return;
  try{
    const reg=await navigator.serviceWorker?.ready;
    if(reg)await reg.showNotification(english?"New message in Farnaz":"پیام جدید در فرناز",{
      body:english?"Open Farnaz to view the message.":"برای مشاهده پیام، فرناز را باز کن.",
      tag:"farnaz-incoming-message",icon:"./farnaz-icon.svg",badge:"./farnaz-icon.svg",data:{url:"./"}
    });
  }catch(error){console.warn("Farnaz message notification:",error);}
}



async function farnazNetworkFetch(input,init){
  const nativeFetch=window.fetch.bind(window);
  const requestUrl=typeof input==="string"?input:(input?.url||"");
  const isStorageUpload=/\/storage\/v1\//i.test(requestUrl)&&/\/object(?:\/|$)/i.test(requestUrl);
  const isAuthRequest=/\/auth\/v1\/(?:token|signup)(?:\?|\/|$)/i.test(requestUrl);
  const isProfileRequest=/\/rest\/v1\/profiles(?:\?|$)/i.test(requestUrl)||/\/auth\/v1\/user(?:\?|$)/i.test(requestUrl);
  // Bound every Supabase REST request. An unanswered inbox/contact query must not
  // leave the app's recovery banner and all screens waiting forever.
  const isRestRequest=/\/rest\/v1\//i.test(requestUrl);
  const needsRequestTimeout=isStorageUpload||isProfileRequest||isAuthRequest||isRestRequest;
  const requestTimeoutMs=isAuthRequest?15000:(isRestRequest?15000:25000);
  const isPasswordLogin=/\/auth\/v1\/token\?grant_type=password(?:&|$)/i.test(requestUrl);
  const requestMethod=String(init?.method||(typeof Request!=="undefined"&&input instanceof Request?input.method:"GET")).toUpperCase();
  // Only replay safe non-REST HTTP methods here. REST reads are retried by retryRead(),
  // whose deadline is shorter than this wrapper’s former three-attempt loop; keeping
  // both retry layers active could leave an abandoned request running beside its retry.
  // Supabase writes and RPCs often use
  // JSON-string POST bodies; a lost response does not mean the server rejected
  // the write, so retrying those requests can duplicate messages or side effects.
  const canRetry=isStorageUpload||(!isRestRequest&&!isAuthRequest&&["GET","HEAD","OPTIONS"].includes(requestMethod));
  let lastError;
  for(let attempt=0;attempt<3;attempt++){
    let timeoutId=null;
    let controller=null;
    try{
      const requestInput=(typeof Request!=="undefined"&&input instanceof Request)?input.clone():input;
      let requestInit=init;
      if(needsRequestTimeout&&typeof AbortController!=="undefined"){
        controller=new AbortController();
        const originalSignal=init?.signal||(typeof Request!=="undefined"&&input instanceof Request?input.signal:null);
        if(originalSignal){
          if(originalSignal.aborted)controller.abort(originalSignal.reason);
          else originalSignal.addEventListener("abort",()=>controller.abort(originalSignal.reason),{once:true});
        }
        timeoutId=setTimeout(()=>controller.abort(new DOMException("درخواست پس از مهلت انتظار پاسخ نگرفت.","TimeoutError")),requestTimeoutMs);
        requestInit={...(init||{}),signal:controller.signal};
      }
      const response=await nativeFetch(requestInput,requestInit);
      if(timeoutId)clearTimeout(timeoutId);
      return response;
    }catch(error){
      if(timeoutId)clearTimeout(timeoutId);
      lastError=error;
      if(error?.name==="AbortError"||error?.name==="TimeoutError"){
        // Safari can time out while Supabase is healthy or while the response is
        // delayed in transit. Password sign-in is safe to retry; sign-up is not.
        if((isStorageUpload||isPasswordLogin)&&attempt<2){
          await new Promise(resolve=>setTimeout(resolve,isPasswordLogin?(attempt===0?500:1200):500));
          continue;
        }
        if(isAuthRequest)throw new Error(english?"The server did not respond after retries. Check your connection and try again.":"سرور پس از چند تلاش پاسخ نداد. اتصال اینترنت را بررسی کن و دوباره تلاش کن.");
        if(isStorageUpload)throw new Error("بارگذاری عکس پس از دو تلاش ۲۵ ثانیه‌ای پاسخ نگرفت. اتصال شبکه را بررسی کن و دوباره ذخیره را بزن.");
        if(isProfileRequest)throw new Error("بارگذاری مشخصات پس از ۱۵ ثانیه پاسخ نگرفت. اتصال شبکه را بررسی کن و دوباره تلاش کن.");
        if(isRestRequest)throw new Error(english?"Supabase data request timed out after 15 seconds. Check the connection and retry.":"درخواست دریافت اطلاعات از سوپابیس پس از ۱۵ ثانیه پاسخ نگرفت؛ اتصال را بررسی کن و دوباره تلاش کن.");
        throw error;
      }
      const message=String(error?.message||error||"");
      const networkFailure=error instanceof TypeError||/network|fetch failed|load failed|connection|timeout/i.test(message);
      // A password sign-in is safe to retry after a transport-level failure:
      // Supabase may have completed the request while Safari lost the response.
      // Do not replay sign-up, which could turn a successful first attempt into
      // a misleading "user already exists" error.
      if(isPasswordLogin&&networkFailure&&attempt<2){
        await new Promise(resolve=>setTimeout(resolve,attempt===0?500:1200));
        continue;
      }
      if(isAuthRequest||!canRetry||!networkFailure||attempt===2)throw error;
      await new Promise(resolve=>setTimeout(resolve,attempt===0?450:1100));
    }
  }
  throw lastError;
}

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
      global:{fetch:farnazNetworkFetch},
      auth:{
        // Keep one stable storage key across reloads and GitHub Pages launches.
        storageKey:"sb-iemykhluluoymsbqpjsn-auth-token",
        storage:window.localStorage,
        persistSession:true,
        autoRefreshToken:true,
        detectSessionInUrl:true,
        flowType:"pkce"
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
    /network|fetch failed|failed to fetch|timeout|timed out|temporar|connection reset|connection closed|load failed|offline|gateway|too many requests|پاسخ نگرفت|مهلت انتظار|زمان.?تمام|طول کشید/.test(message);
}
const recoveryDelay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function withTimeout(operation,timeoutMs=9000,label="درخواست"){
  let timer;
  const timeout=new Promise((_,reject)=>{
    timer=setTimeout(()=>{
      const error=new Error(english
        ?(label+" did not respond within "+Math.round(timeoutMs/1000)+" seconds.")
        :(label+" پس از "+Math.round(timeoutMs/1000)+" ثانیه پاسخ نداد."));
      error.name="TimeoutError";
      reject(error);
    },timeoutMs);
  });
  return Promise.race([Promise.resolve(operation),timeout]).finally(()=>clearTimeout(timer));
}
async function retryRead(label,operation,maxAttempts=2,timeoutMs=16000){
  let lastError;
  for(let attempt=1;attempt<=maxAttempts;attempt++){
    try{
      if(typeof navigator!=="undefined"&&navigator.onLine===false){
        setConnectionBanner(english?"You are offline. Farnaz will reconnect automatically.":"اتصال اینترنت قطع است؛ فرناز پس از وصل‌شدن خودکار تلاش می‌کند.");
        throw new Error("NETWORK_OFFLINE");
      }
      // Supabase REST calls have a 15-second fetch deadline. Keep the default
      // wrapper deadline longer so retries do not overlap a still-running request.
      const result=await withTimeout(operation(),timeoutMs,label);
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
      // Profile reads can take up to two bounded network attempts. Update the
      // profile status as soon as a retry starts so the screen never looks frozen.
      if(label==="current user profile"||label==="create current user profile"){
        setStatus("profileStatus",english
          ?"Profile connection interrupted; retrying automatically…"
          :"ارتباط پروفایل قطع شده؛ تلاش مجدد خودکار…");
      }
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
  const recoveryUserId=String(currentUser.id);
  try{
    await subscribeToMessages();
    if(!currentUser||String(currentUser.id)!==recoveryUserId)return;
    // Reconcile the active private chat after downtime so messages missed while
    // Realtime was disconnected are restored without forcing the view to bottom.
    if(currentChatUser&&document.body.classList.contains("chat-mode")&&typeof loadPrivateMessages==="function"){
      const chatRefreshed=await loadPrivateMessages(false,true);
      if(!currentUser||String(currentUser.id)!==recoveryUserId)return;
      if(chatRefreshed===false)throw new Error("Private chat refresh did not complete");
    }
    // These refresh functions already own their bounded retries and return false
    // when their data request fails. Wrapping them in retryRead previously treated
    // false as success and cleared the recovery banner without restoring the data.
    const inboxRefreshed=await refreshConversationList();
    if(!currentUser||String(currentUser.id)!==recoveryUserId)return;
    if(inboxRefreshed===false)throw new Error("Conversation refresh did not complete");
    const contactsRefreshed=await refreshSavedContacts();
    if(!currentUser||String(currentUser.id)!==recoveryUserId)return;
    if(contactsRefreshed===false)throw new Error("Contacts refresh did not complete");
    // Reconnecting the realtime channel must never rebuild the open chat history.
    // Existing messages stay in the DOM; incoming messages are appended by the realtime handler.
    setConnectionBanner("",false);
  }catch(error){
    if(!currentUser||String(currentUser.id)!==recoveryUserId)return;
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
function formatContactPhone(phone){
  const raw=normalizeDigits(phone).trim();
  if(!raw)return "";
  let digits=raw.replace(/\D/g,"");
  if(digits.startsWith("00"))digits=digits.slice(2);
  const countries=[
    {code:"98",national:"0",length:10},
    {code:"49",national:"0"},
    {code:"44",national:"0"},
    {code:"90",national:"0"},
    {code:"1",national:""}
  ];
  const country=countries.sort((a,b)=>b.code.length-a.code.length).find(c=>digits.startsWith(c.code));
  if(country){
    let local=digits.slice(country.code.length);
    if(country.national==="0")local=local.replace(/^0+/,"");
    return country.national+local;
  }
  return "+"+digits;
}
function setPhoneDisplay(el,phone){
  if(!el)return;
  el.textContent=formatContactPhone(phone);
  el.setAttribute("dir","ltr");
  el.style.direction="ltr";
  el.style.unicodeBidi="isolate";
  el.style.textAlign="left";
}
function setPhoneCountry(selectId,phone){
  const digits=normalizeDigits(phone).replace(/\D/g,"");
  const select=$(selectId);if(!select)return;
  const match=["98","49","1","44","90"].find(code=>digits.startsWith(code));
  if(match)select.value=match;
}
function initials(name){return(name||"F").trim().charAt(0).toLocaleUpperCase()||"F";}
function openFarnazAvatarPreview(src,label=""){
  if(!src)return;
  let overlay=document.getElementById("farnazAvatarPreview");
  if(!overlay){
    overlay=document.createElement("div");overlay.id="farnazAvatarPreview";overlay.hidden=true;
    overlay.setAttribute("role","dialog");overlay.setAttribute("aria-modal","true");
    overlay.style.cssText="position:fixed;inset:0;z-index:100000;align-items:center;justify-content:center;padding:22px;background:rgba(0,0,0,.88);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)";
    const close=document.createElement("button");close.type="button";close.setAttribute("aria-label","Close image");close.textContent="×";
    close.style.cssText="position:absolute;top:max(18px,env(safe-area-inset-top));right:18px;width:44px;height:44px;border:0;border-radius:50%;background:rgba(255,255,255,.16);color:#fff;font-size:32px;line-height:1;cursor:pointer";
    const img=document.createElement("img");img.id="farnazAvatarPreviewImage";img.alt="";img.style.cssText="display:block;max-width:min(88vw,680px);max-height:78vh;object-fit:contain;border-radius:12px;box-shadow:0 12px 48px rgba(0,0,0,.35)";
    const caption=document.createElement("div");caption.id="farnazAvatarPreviewCaption";caption.style.cssText="position:absolute;bottom:max(18px,env(safe-area-inset-bottom));left:20px;right:20px;text-align:center;color:#fff;font:500 14px system-ui,sans-serif;overflow-wrap:anywhere";
    const panel=document.createElement("div");panel.style.cssText="display:flex;flex-direction:column;align-items:center;gap:12px;max-width:100%;max-height:100%";panel.append(img,caption);overlay.append(close,panel);
    const hide=()=>{overlay.hidden=true;overlay.style.display="none";document.body.style.removeProperty("overflow");};
    close.addEventListener("click",hide);overlay.addEventListener("click",e=>{if(e.target===overlay)hide();});
    document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!overlay.hidden)hide();});
    document.body.appendChild(overlay);
  }
  const image=document.getElementById("farnazAvatarPreviewImage"),caption=document.getElementById("farnazAvatarPreviewCaption");
  image.src=src;image.alt=label||"Profile photo";caption.textContent=label||"";
  overlay.hidden=false;overlay.style.display="flex";document.body.style.overflow="hidden";
  overlay.querySelector("button")?.focus({preventScroll:true});
}
window.openFarnazAvatarPreview=openFarnazAvatarPreview;
function bindAvatarPreview(el,label=""){
  if(!el||el.dataset.previewBound==="1")return;
  el.dataset.previewBound="1";
  el.addEventListener("click",event=>{
    const img=event.target?.closest?.("img");
    if(!img||!el.contains(img)||(!img.currentSrc&&!img.src))return;
    event.preventDefault();event.stopPropagation();
    openFarnazAvatarPreview(img.currentSrc||img.src,label||img.alt||"");
  });
}
function renderAvatar(el,url,name){
  if(!el)return;
  bindAvatarPreview(el,name||"");
  el.replaceChildren();
  if(url){
    const img=document.createElement("img");
    img.src=url;img.alt=english?"Profile picture":"تصویر پروفایل";
    img.onerror=()=>{el.replaceChildren();el.textContent=initials(name);};
    el.appendChild(img);
  }else el.textContent=initials(name);
}
let newPrivateChatModal=null;
let newPrivateChatMovedNodes=[];
let newPrivateChatReturnFocus=null;
function markPrivateChatContactRows(active){
  $("savedContactsList")?.querySelectorAll(".contact-swipe-shell .list-item").forEach(button=>{
    if(active)button.dataset.openFromPage="chatsPage";
    else delete button.dataset.openFromPage;
  });
}
function closeNewPrivateChat(){
  const modal=newPrivateChatModal;
  if(!modal)return;
  modal.hidden=true;
  markPrivateChatContactRows(false);
  for(const item of newPrivateChatMovedNodes){
    if(item.placeholder.parentNode)item.placeholder.parentNode.insertBefore(item.node,item.placeholder);
    item.placeholder.remove();
  }
  newPrivateChatMovedNodes=[];
  modal.remove();
  newPrivateChatModal=null;
  if(newPrivateChatReturnFocus?.isConnected)newPrivateChatReturnFocus.focus({preventScroll:true});
  newPrivateChatReturnFocus=null;
}
function startNewChat(){
  if(!currentUser){openAuth();return;}
  if(newPrivateChatModal){closeNewPrivateChat();return;}
  const filter=$("savedFarnazContactFilter"),list=$("savedContactsList");
  if(!filter||!list)return;
  newPrivateChatReturnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const modal=document.createElement("div");
  modal.id="newPrivateChatModal";
  modal.className="new-private-chat-overlay";
  modal.setAttribute("role","presentation");
  modal.innerHTML='<section class="new-private-chat-dialog" role="dialog" aria-modal="true" aria-labelledby="newPrivateChatTitle"><header class="new-private-chat-header"><h2 id="newPrivateChatTitle"></h2><button class="new-private-chat-close" type="button" aria-label="Close">×</button></header><p class="new-private-chat-hint"></p><div class="new-private-chat-search"></div><div class="new-private-chat-status"></div><div class="new-private-chat-list"></div><div class="new-private-chat-footer"><button class="new-private-chat-cancel" type="button"></button></div></section>';
  const title=modal.querySelector("#newPrivateChatTitle");
  const hint=modal.querySelector(".new-private-chat-hint");
  const searchSlot=modal.querySelector(".new-private-chat-search");
  const statusSlot=modal.querySelector(".new-private-chat-status");
  const listSlot=modal.querySelector(".new-private-chat-list");
  const footer=modal.querySelector(".new-private-chat-cancel");
  title.textContent=english?"New private chat":"گفتگوی خصوصی جدید";
  hint.textContent=english?"Choose a contact to open your private conversation.":"مخاطب را انتخاب کن تا گفتگوی خصوصی او باز شود.";
  footer.textContent=english?"Cancel":"انصراف";
  modal.querySelector(".new-private-chat-close").setAttribute("aria-label",english?"Close":"بستن");
  const movable=[filter,$("savedFarnazContactSearchStatus"),list,$("savedContactsStatus")].filter(Boolean);
  for(const node of movable){
    const placeholder=document.createComment("farnaz-private-chat-placeholder");
    node.parentNode?.insertBefore(placeholder,node);
    newPrivateChatMovedNodes.push({node,placeholder});
  }
  searchSlot.appendChild(filter);
  const searchStatus=$("savedFarnazContactSearchStatus");
  if(searchStatus)statusSlot.appendChild(searchStatus);
  listSlot.appendChild(list);
  const contactsStatus=$("savedContactsStatus");
  if(contactsStatus)statusSlot.appendChild(contactsStatus);
  filter.value="";
  filterSavedFarnazContacts();
  markPrivateChatContactRows(true);
  modal.querySelector(".new-private-chat-close").addEventListener("click",closeNewPrivateChat);
  footer.addEventListener("click",closeNewPrivateChat);
  modal.addEventListener("click",event=>{if(event.target===modal)closeNewPrivateChat();});
  modal.addEventListener("keydown",event=>{if(event.key==="Escape"){event.preventDefault();closeNewPrivateChat();}});
  document.body.appendChild(modal);
  newPrivateChatModal=modal;
  requestAnimationFrame(()=>filter.focus({preventScroll:true}));
  if(!list.children.length){
    refreshSavedContacts().then(()=>{if(newPrivateChatModal===modal)markPrivateChatContactRows(true);})
      .catch(error=>console.warn("Could not refresh contacts for new chat:",error));
  }
}
function normalizeContactSearchText(value){
  return String(value||"").normalize("NFKC").replace(/[يى]/g,"ی").replace(/ك/g,"ک").replace(/[\u200c\u200f\u202a-\u202e]/g,"").trim().toLocaleLowerCase();
}
function normalizeContactPhoneSearch(value){
  let digits=normalizeDigits(value).replace(/\D/g,"");
  if(digits.startsWith("00"))digits=digits.slice(2);
  if(digits.startsWith("0")&&digits.length===11)digits="98"+digits.slice(1);
  else if(digits.startsWith("9")&&digits.length===10)digits="98"+digits;
  return digits;
}
function contactMatchesSearch(shell,query){
  const name=normalizeContactSearchText(shell.dataset.searchName||"");
  if(!query||name.includes(query))return true;
  const queryDigits=normalizeContactPhoneSearch(query);
  if(!queryDigits)return false;
  const rawQueryDigits=normalizeDigits(query).replace(/\D/g,"");
  const phoneValue=shell.dataset.searchPhone||"";
  const rawPhoneDigits=normalizeDigits(phoneValue).replace(/\D/g,"");
  const phoneDigits=normalizeContactPhoneSearch(phoneValue);
  return rawPhoneDigits.includes(rawQueryDigits)||phoneDigits.includes(queryDigits);
}
function setContactsCategory(category){
  contactsCategory=category==="members"?"members":"all";
  const all=$("contactsAllTab"),members=$("contactsMembersTab");
  if(all){all.classList.toggle("is-active",contactsCategory==="all");all.setAttribute("aria-pressed",String(contactsCategory==="all"));}
  if(members){members.classList.toggle("is-active",contactsCategory==="members");members.setAttribute("aria-pressed",String(contactsCategory==="members"));}
  const unmatched=$("unmatchedPhoneContactsSection");
  if(unmatched)unmatched.hidden=contactsCategory==="members";
  filterSavedFarnazContacts();
}
function filterSavedFarnazContacts(){
  const filter=$("savedFarnazContactFilter");
  const status=$("savedFarnazContactSearchStatus");
  const saved=$("savedContactsList"),phone=$("unmatchedPhoneContactsList");
  if(!filter||!status||!saved||!phone)return;
  const query=normalizeContactSearchText(filter.value);
  let visible=0;
  saved.querySelectorAll(".contact-swipe-shell").forEach(shell=>{
    const matches=contactMatchesSearch(shell,query);
    shell.hidden=!matches;
    if(matches)visible++;
  });
  if(contactsCategory==="all"){
    phone.querySelectorAll(".phone-contact-swipe-shell").forEach(shell=>{
      const matches=contactMatchesSearch(shell,query);
      shell.hidden=!matches;
      if(matches)visible++;
    });
  }
  status.textContent=query&&!visible
    ?(english?"No contacts match that name.":"مخاطبی با این نام پیدا نشد.")
    :"";
}
function applyConversationSearch(){
  const query=normalizeContactSearchText($("conversationSearch")?.value||"");
  $("conversationList")?.querySelectorAll(".conversation-card").forEach(card=>{
    const name=card.dataset.searchName||"";
    card.hidden=!!query&&!normalizeContactSearchText(name).includes(query);
  });
}
function toggleContactsImport(force){
  const panel=$("phoneContactsImport"),button=$("contactsImportToggle");
  if(!panel||!button)return;
  const open=typeof force==="boolean"?force:panel.hidden;
  panel.hidden=!open;
  button.setAttribute("aria-expanded",String(open));
  button.textContent=open?"×":"＋";
  button.setAttribute("aria-label",open?(english?"Close contact import":"بستن بخش افزودن مخاطب"):(english?"Add or sync contacts":"افزودن یا همگام‌سازی مخاطب"));
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
function navigate(pageId,options={}){
  if(!currentUser){openAuth();return;}
  if(profileCompletionRequired&&pageId!=="profilePage")pageId="profilePage";
  if(!$(pageId))return;
  if(pageId==="chatPage"&&!currentChatUser&&window.FarnazConversationMode!=="space")return;
  const activePageId=document.querySelector(".page.active")?.id||null;
  if(activePageId!==pageId){
    // Welcome/login is an auth boundary, not a navigable page in signed-in history.
    if(pageId==="homePage"){swipePageHistory=[];swipePageHistoryIndex=-1;}
    else if(swipePageHistoryIndex<0){
      const safePreviousPage=activePageId&&activePageId!=="homePage"&&currentUser?activePageId:null;
      swipePageHistory=safePreviousPage?[safePreviousPage,pageId]:[pageId];
      swipePageHistoryIndex=swipePageHistory.length-1;
    }else if(swipePageHistory[swipePageHistoryIndex-1]===pageId)swipePageHistoryIndex--;
    else if(swipePageHistory[swipePageHistoryIndex+1]===pageId)swipePageHistoryIndex++;
    else{swipePageHistory=swipePageHistory.slice(0,swipePageHistoryIndex+1);swipePageHistory.push(pageId);swipePageHistoryIndex=swipePageHistory.length-1;}
  }
  document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id===pageId));
  document.querySelector(".app").classList.toggle("chat-mode",pageId==="chatPage");
  document.body.classList.toggle("chat-mode",pageId==="chatPage");
  const brandHeader=document.querySelector(".app>header");
  if(brandHeader)brandHeader.hidden=pageId==="chatPage";
  const headerFButton=$("headerFButton");
  if(headerFButton)headerFButton.hidden=pageId==="homePage"||pageId==="chatPage";
  if(pageId!=="chatPage"){document.documentElement.style.removeProperty("--chat-viewport-offset");document.documentElement.style.removeProperty("--chat-viewport-height");}
  document.querySelectorAll(".nav-button").forEach(b=>b.classList.toggle("active",b.dataset.page===pageId));
  $("bottomNav").classList.toggle("visible",pageId!=="homePage"&&pageId!=="chatPage");
  if(pageId==="chatsPage")applyConversationSearch();
  if(options.refreshData!==false){
    if(pageId==="chatsPage")refreshConversationList();
    if(pageId==="contactsPage")refreshSavedContacts();
  }
  window.scrollTo({top:0,behavior:"instant"});
}
function backFromChat(){if(window.FarnazConversationMode==="space"&&typeof window.FarnazConversationBack==="function"){window.FarnazConversationBack();return;}dismissMessageMenus();exitMessageSelection();cancelReply();cancelMessageEdit();navigate(previousPage==="contactsPage"?"contactsPage":"chatsPage");}
function openAdjacentConversation(direction){
  const cards=[...$("conversationList").querySelectorAll(".conversation-card")];
  if(!cards.length)return;
  const ids=cards.map(card=>card.querySelector(".list-item")?.dataset.contactId||null);
  const index=ids.indexOf(String(currentChatUser?.user_id||""));
  const nextIndex=index+direction;
  if(nextIndex<0||nextIndex>=cards.length)return;
  cards[nextIndex].querySelector(".list-item")?.click();
}
/* Bidirectional page swipes use the same history as ordinary navigation. */
const SWIPE_PAGE_ORDER=["profilePage","chatsPage","spacesPage","contactsPage","settingsPage"];
const FARNAZ_SWIPE_PAGE_ORDER=["settingsPage","contactsPage","chatsPage","profilePage"];
function swipeNavigationBasePage(pageId){
  if(pageId==="callsPage"||pageId==="spacesPage")return "chatsPage";
  return FARNAZ_SWIPE_PAGE_ORDER.includes(pageId)?pageId:null;
}
function swipeHistoryTarget(direction){
  if(!currentUser)return null;
  const activePage=document.querySelector(".page.active");
  if(!activePage)return null;

  // Shared chatPage hosts both private and group/channel conversations.
  if(direction>0&&activePage.id==="chatPage"){
    if(window.FarnazConversationMode==="space")return {kind:"spaceBack",targetId:"spacesPage"};
    const targetId=$(previousPage)&&previousPage!=="chatPage"?previousPage:"chatsPage";
    return {kind:"privateBack",targetId};
  }
  if(activePage.id==="chatPage")return null;

  const basePage=swipeNavigationBasePage(activePage.id);
  if(!basePage)return null;
  const currentIndex=FARNAZ_SWIPE_PAGE_ORDER.indexOf(basePage);
  const targetIndex=currentIndex+(direction>0?-1:1);
  const targetId=FARNAZ_SWIPE_PAGE_ORDER[targetIndex];
  if(!targetId||!$(targetId))return null;
  return {kind:"page",targetId};
}
function clearSwipeTransition(){
  if(swipeTransitionTimer){clearTimeout(swipeTransitionTimer);swipeTransitionTimer=null;}
  document.querySelector(".app")?.classList.remove("farnaz-swipe-active");
  document.querySelectorAll(".page.farnaz-swipe-current,.page.farnaz-swipe-underlay,#spaceDetail.farnaz-swipe-current,#spaceList.farnaz-swipe-underlay").forEach(page=>{
    page.classList.remove("farnaz-swipe-current","farnaz-swipe-underlay");
    page.style.removeProperty("transform");page.style.removeProperty("transition");
  });
  swipeGesture=null;
}
function finishSwipeNavigation(commit){
  const g=swipeGesture;if(!g)return;
  if(commit&&g.targetId){
    const transition="transform 220ms cubic-bezier(.22,.75,.25,1)";
    g.current.style.transition=transition;g.target.style.transition=transition;
    g.current.style.transform="translate3d("+(g.direction*g.width)+"px,0,0)";
    g.target.style.transform="translate3d(0,0,0)";
    swipeGesture=null;
    swipeTransitionTimer=setTimeout(()=>{
      swipeTransitionTimer=null;
      try{
        if(currentUser&&document.querySelector(".page.active")===g.page){
          if(g.action==="privateBack"){
            dismissMessageMenus();exitMessageSelection();cancelReply();cancelMessageEdit();
            navigate(g.targetId);
          }else if(g.action==="spaceBack"){
            window.FarnazConversationBack?.();
          }else navigate(g.targetId);
        }
      }catch(error){
        console.warn("Farnaz swipe navigation:",error);
      }finally{
        clearSwipeTransition();
      }
    },230);
  }else{
    const transition="transform 180ms cubic-bezier(.22,.75,.25,1)";
    g.current.style.transition=transition;g.target.style.transition=transition;
    g.current.style.transform="translate3d(0,0,0)";
    g.target.style.transform="translate3d("+(g.direction>0?-g.width:g.width)+"px,0,0)";
    swipeGesture=null;
    swipeTransitionTimer=setTimeout(()=>{
      swipeTransitionTimer=null;
      clearSwipeTransition();
    },190);
  }
}
function installFarnazSwipeNavigation(){
  if(document.documentElement.dataset.farnazSwipeNavigation==="ready")return;
  document.documentElement.dataset.farnazSwipeNavigation="ready";
  // Use native Touch Events on iOS Safari. Pointer Events may be canceled by
  // WebKit's gesture recognizer before a horizontal drag can be completed.
  document.addEventListener("touchstart",event=>{
    if(event.touches.length!==1||swipeGesture||swipeTransitionTimer)return;
    if(document.body.classList.contains("keyboard-open")||document.body.classList.contains("chat-mode")&&document.activeElement?.matches?.("input,textarea,[contenteditable='true']")||messageSelectionMode)return;
    const app=event.target?.closest?.(".app"),page=app?.querySelector(".page.active");
    if(!currentUser||!app||!page||page.id==="homePage"||app.classList.contains("farnaz-swipe-active"))return;
    const appRect=app.getBoundingClientRect(),touch=event.touches[0];
    // Reserve a wider 44px strip on both sides for Safari back/forward gestures.
    // Farnaz only recognizes horizontal swipes that begin in the central content area.
    if(touch.clientX-appRect.left<44||appRect.right-touch.clientX<44)return;
    if(event.target.closest("input,textarea,select,button,a,[contenteditable='true'],.bottom-nav,.conversation-card,.space-card,#conversationList,#spacesList,.dialog,.modal,.message,.space-message,.message-action-menu,.message-selection-toolbar,#sendMessageForm,#spaceComposer,.composer-shell"))return;
    if(!swipeHistoryTarget(-1)&&!swipeHistoryTarget(1))return;
    swipeGesture={app,page,current:null,target:null,targetId:null,action:null,startX:touch.clientX,startY:touch.clientY,lastX:touch.clientX,lastTime:performance.now(),velocity:0,dx:0,width:Math.max(1,appRect.width),direction:0,locked:false};
  },{capture:true,passive:true});
  document.addEventListener("touchmove",event=>{
    const g=swipeGesture;if(!g||event.touches.length!==1)return;
    const touch=event.touches[0],dx=touch.clientX-g.startX,dy=touch.clientY-g.startY,now=performance.now();
    g.velocity=(touch.clientX-g.lastX)/Math.max(1,now-g.lastTime);g.lastX=touch.clientX;g.lastTime=now;g.dx=dx;
    if(!g.locked){
      if(Math.abs(dx)<12&&Math.abs(dy)<12)return;
      if(Math.abs(dx)<Math.abs(dy)*1.2){swipeGesture=null;return;}
      const direction=dx>0?1:-1,destination=swipeHistoryTarget(direction);
      if(!destination){swipeGesture=null;return;}
      g.direction=direction;g.targetId=destination.targetId;g.action=destination.kind;g.locked=true;
      g.target=document.getElementById(destination.targetId);
      if(!g.target){swipeGesture=null;return;}
      g.app.classList.add("farnaz-swipe-active");
      g.current=g.page;
      if(!g.current){swipeGesture=null;return;}
      g.current.classList.add("farnaz-swipe-current");g.target.classList.add("farnaz-swipe-underlay");
      g.target.style.transition="none";g.current.style.transition="none";
      g.target.style.transform="translate3d("+(direction>0?-g.width:g.width)+"px,0,0)";
    }
    if(g.locked){
      if(event.cancelable)event.preventDefault();
      const x=Math.max(-g.width,Math.min(g.width,dx));
      g.current.style.transform="translate3d("+x+"px,0,0)";
      g.target.style.transform="translate3d("+((g.direction>0?-g.width:g.width)+x)+"px,0,0)";
    }
  },{capture:true,passive:false});
  document.addEventListener("touchend",event=>{
    const g=swipeGesture;if(!g)return;
    if(!g.locked){swipeGesture=null;return;}
    finishSwipeNavigation(Math.abs(g.dx)>=Math.max(72,g.width*.22)||(Math.abs(g.velocity)>.55&&Math.abs(g.dx)>44));
  },{capture:true,passive:true});
  document.addEventListener("touchcancel",()=>{
    if(swipeGesture?.locked)finishSwipeNavigation(false);else swipeGesture=null;
  },{capture:true,passive:true});
}
installFarnazSwipeNavigation();

function setConversationView(view){conversationView=view;refreshConversationList();}
$("conversationSearch")?.addEventListener("input",applyConversationSearch);
$("savedFarnazContactFilter")?.addEventListener("input",filterSavedFarnazContacts);
function prefFor(id){return conversationPrefs.get(id)||{pinned:false,archived:false,hidden_at:null};}
async function saveConversationPref(contactId,patch){
  if(!currentUser)throw new Error(english?"Sign in to change conversation settings.":"برای تغییر تنظیمات گفتگو ابتدا وارد شو.");
  const userId=String(currentUser.id);
  const next={...prefFor(contactId),...patch,user_id:userId,contact_user_id:contactId,updated_at:new Date().toISOString()};
  const {error}=await getClient().from("conversation_preferences").upsert(next,{onConflict:"user_id,contact_user_id"});
  if(error)throw error;
  if(String(currentUser?.id)!==userId)return;
  conversationPrefs.set(String(contactId),next);
  await refreshConversationList();
}
async function conversationAction(contactId,action){
  if(!currentUser)return;
  const userId=String(currentUser.id);
  try{
    const old=prefFor(contactId);
    if(action==="delete"){
      if(!confirm(english?"Hide this conversation from your list? The other person keeps their messages.":"این گفتگو فقط از فهرست شما پنهان شود؟ پیام‌های طرف مقابل حذف نمی‌شود."))return;
      await saveConversationPref(contactId,{hidden_at:new Date().toISOString(),archived:false,pinned:false});
    }else if(action==="pin")await saveConversationPref(contactId,{pinned:!old.pinned,archived:false});
    else if(action==="archive")await saveConversationPref(contactId,{archived:!old.archived,pinned:false});
  }catch(e){
    if(String(currentUser?.id)!==userId)return;
    alert((english?"Action failed: ":"عملیات ناموفق بود: ")+e.message);
  }
}
function showConversationActions(card,contactId){
  card.querySelector(".conversation-action-menu")?.remove();
  const p=prefFor(contactId),menu=document.createElement("div");menu.className="conversation-tools conversation-action-menu";
  const items=[[p.pinned?(english?"Unpin":"برداشتن پین"):(english?"Pin":"پین"),"pin"],[p.archived?(english?"Unarchive":"خروج از آرشیو"):(english?"Archive":"آرشیو"),"archive"],[english?"Delete chat":"حذف گفتگو","delete"]];
  for(const [label,action] of items){const b=document.createElement("button");b.type="button";b.className="mini-button"+(action==="delete"?" danger":"");b.textContent=label;b.onclick=()=>conversationAction(contactId,action);menu.appendChild(b);}
  card.appendChild(menu);
}
function openSignup(){authMode="signup";openAuth();}
function openLogin(){authMode="login";openAuth();}
function openAuth(){
  const signup=authMode==="signup";
  $("nameField").style.display=signup?"block":"none";
  $("authName").required=signup;
  $("authEmail").autocomplete="username";
  $("authPassword").autocomplete=signup||authMode==="recovery"?"new-password":"current-password";
  $("authPassword").type="password";
  const passwordToggle=$("toggleAuthPassword");
  if(passwordToggle){passwordToggle.textContent=english?"Show":"نمایش";passwordToggle.setAttribute("aria-pressed","false");}
  document.querySelector(".app")?.classList.add("auth-open");
  if($("headerFButton"))$("headerFButton").hidden=true;
  $("authBox").style.display="flex";setStatus("authStatus","");
  $("authName").value="";$("authEmail").value="";$("authPassword").value="";
  setAuthMode(authMode);
}
function closeAuth(){$("authBox").style.display="none";document.querySelector(".app")?.classList.remove("auth-open");}
function getAuthRedirectUrl(){
  // Return to the exact app origin currently in use; allow-list each origin in Supabase Auth.
  return new URL("./",window.location.href).href;
}
function getAuthRecoveryRedirectUrl(){
  const url=new URL(getAuthRedirectUrl());
  url.searchParams.set("auth","recovery");
  return url.href;
}
function isAuthRecoveryCallback(){
  return new URLSearchParams(window.location.search).get("auth")==="recovery";
}
async function requestPasswordRecovery(){
  const email=$("authEmail")?.value.trim()||"";
  const button=$("authForgotPassword");
  if(!email){
    setStatus("authStatus",english?"Enter your email address first.":"ابتدا آدرس ایمیلت را وارد کن.",true);
    $("authEmail")?.focus();
    return;
  }
  if(navigator.onLine===false){
    setStatus("authStatus",english?"You are offline. Reconnect and try again.":"اتصال اینترنت قطع است؛ پس از اتصال دوباره تلاش کن.",true);
    return;
  }
  if(button?.disabled)return;
  if(button)button.disabled=true;
  setStatus("authStatus",english?"Sending recovery instructions…":"در حال ارسال راهنمای بازیابی…");
  try{
    const {error}=await getClient().auth.resetPasswordForEmail(email,{redirectTo:getAuthRecoveryRedirectUrl()});
    if(error)throw error;
    // Keep the response generic so the screen does not reveal whether an email has an account.
    setStatus("authStatus",english
      ?"If an account can be recovered with this address, recovery instructions will be sent. Check your inbox and spam folder."
      :"اگر برای این ایمیل حسابی وجود داشته باشد، راهنمای بازیابی ارسال می‌شود. صندوق ورودی و هرزنامه را بررسی کن.");
  }catch(error){
    console.warn("Password recovery request failed:",error);
    const status=Number(error?.status||error?.statusCode||0);
    const network=error?.name==="TypeError"||error?.name==="TimeoutError"||/network|fetch failed|load failed|timeout|connection|did not respond/i.test(String(error?.message||""));
    setStatus("authStatus",status===429
      ?(english?"Too many recovery requests. Wait a little and try again.":"درخواست‌های بازیابی زیاد بوده؛ کمی صبر کن و دوباره تلاش کن.")
      :network
        ?(english?"The recovery request could not reach the server. Check your connection and retry.":"درخواست بازیابی به سرور نرسید؛ اتصال را بررسی کن و دوباره تلاش کن.")
        :(english?"Recovery could not be started. Please try again later.":"شروع بازیابی ممکن نشد؛ کمی بعد دوباره تلاش کن."),true);
  }finally{
    if(button)button.disabled=false;
  }
}
function toggleAuthPassword(){
  const field=$("authPassword"),button=$("toggleAuthPassword");
  if(!field||!button)return;
  const reveal=field.type==="password";
  field.type=reveal?"text":"password";
  button.textContent=english?(reveal?"Hide":"Show"):(reveal?"مخفی":"نمایش");
  button.setAttribute("aria-pressed",String(reveal));
  button.setAttribute("aria-label",english?(reveal?"Hide password":"Show password"):(reveal?"مخفی‌کردن رمز عبور":"نمایش رمز عبور"));
}
async function signInSocial(provider="google"){
  const button=$("googleAuth");
  if(button?.disabled)return;
  if(button)button.disabled=true;
  setStatus("authStatus",english?"Connecting to Google…":"در حال اتصال به گوگل…");
  try{
    const client=getClient();
    const {error}=await client.auth.signInWithOAuth({
      provider,
      options:{redirectTo:getAuthRedirectUrl()}
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
function setAuthMode(mode){
  if(!["login","signup","recovery"].includes(mode))return;
  authMode=mode;
  const signup=authMode==="signup",recovery=authMode==="recovery";
  $("nameField").style.display=signup?"block":"none";
  $("authName").required=signup;
  $("authEmailLabel").hidden=recovery;
  $("authEmail").hidden=recovery;
  $("authEmail").required=!recovery;
  $("authEmail").autocomplete="username";
  $("authPassword").required=true;
  $("authPassword").minLength=8;
  $("authPassword").autocomplete=signup||recovery?"new-password":"current-password";
  $("authPassword").type="password";
  const passwordToggle=$("toggleAuthPassword");
  if(passwordToggle){passwordToggle.textContent=english?"Show":"نمایش";passwordToggle.setAttribute("aria-pressed","false");}
  $("authModeTabs").hidden=recovery;
  $("authForgotPassword").hidden=authMode!=="login";
  $("authRecoveryBack").hidden=!recovery;
  $("authSwitch").hidden=recovery;
  setStatus("authStatus","");updateAuthTexts();
}
function switchAuthMode(){setAuthMode(authMode==="signup"?"login":"signup");}
function updateAuthTexts(){
  const v=english,recovery=authMode==="recovery",signup=authMode==="signup";
  $("authTitle").textContent=recovery
    ?(v?"Choose a new password":"انتخاب رمز عبور جدید")
    :signup?(v?"Create your Farnaz account":"ثبت‌نام در فرناز"):(v?"Sign in to Farnaz":"ورود به فرناز");
  $("authMessage").textContent=recovery
    ?(v?"Enter a new password for your Farnaz account.":"رمز عبور جدید حساب فرنازت را وارد کن.")
    :signup?(v?"Create an account to stay connected.":"برای ارتباط نزدیک‌تر، حساب خودت را بساز."):(v?"Sign in with your email and password.":"با ایمیل و رمز عبورت وارد شو.");
  $("authSubmit").textContent=recovery?(v?"Save new password":"ذخیره رمز جدید"):signup?(v?"Sign up":"ثبت‌نام"):(v?"Sign in":"ورود");
  $("authSwitch").textContent=signup
    ?(v?"You can add your mobile number after email confirmation.":"شماره موبایل را پس از تأیید ایمیل تکمیل می‌کنی.")
    :(v?"Use your email and password to continue.":"با ایمیل و رمز عبورت وارد فرناز شو.");
  $("authNameLabel").textContent=v?"Display name":"نام نمایشی";
  $("authEmailLabel").textContent=v?"Email":"ایمیل";
  $("authPasswordLabel").textContent=recovery?(v?"New password (at least 8 characters)":"رمز عبور جدید (حداقل ۸ کاراکتر)"):(v?"Password (at least 8 characters)":"رمز عبور (حداقل ۸ کاراکتر)");
  $("authPassword").placeholder=recovery?(v?"New password":"رمز عبور جدید"):(v?"Password":"رمز عبور");
  $("authLoginTab").textContent=v?"Sign in":"ورود";
  $("authSignupTab").textContent=v?"Create account":"ثبت‌نام";
  $("authLoginTab").classList.toggle("is-active",authMode==="login");
  $("authSignupTab").classList.toggle("is-active",authMode==="signup");
  $("authLoginTab").setAttribute("aria-pressed",String(authMode==="login"));
  $("authSignupTab").setAttribute("aria-pressed",String(authMode==="signup"));
  $("authModeTabs").hidden=recovery;
  $("googleAuth").hidden=recovery;
  document.querySelector(".social-auth").hidden=recovery;
  document.querySelector(".auth-divider").hidden=recovery;
  $("authForgotPassword").hidden=authMode!=="login";
  $("authRecoveryBack").hidden=!recovery;
  $("authSwitch").hidden=recovery;
  $("googleAuthLabel").textContent=v?"Continue with Google":"ادامه با Google";
  $("authOrLabel").textContent=v?"or continue with email":"یا با ایمیل";
  $("authForgotPassword").textContent=v?"Forgot password?":"رمز عبور را فراموش کرده‌اید؟";
  $("authRecoveryBack").textContent=v?"Back to sign in":"بازگشت به ورود";
  const languageButton=$("authLanguageButton");
  if(languageButton)languageButton.textContent=v?"فا":"EN";
  const passwordToggle=$("toggleAuthPassword");
  if(passwordToggle){
    const visible=$("authPassword").type==="text";
    passwordToggle.textContent=v?(visible?"Hide":"Show"):(visible?"مخفی":"نمایش");
    passwordToggle.setAttribute("aria-label",v?(visible?"Hide password":"Show password"):(visible?"مخفی‌کردن رمز عبور":"نمایش رمز عبور"));
  }
}
/* Keep one welcome language toggle globally; preserve the separate Settings language control. */
function normalizeWelcomeLanguageButton(){
  const home=document.getElementById("homePage");
  if(!home)return;
  const buttons=Array.from(document.querySelectorAll(".welcome-language-switch, #welcomeLanguageButton"));
  let keep=home.querySelector(":scope > #welcomeLanguageButton")||home.querySelector(".welcome-language-switch");
  if(!keep)return;
  buttons.forEach(button=>{if(button!==keep)button.remove();});
  keep.id="welcomeLanguageButton";
  keep.classList.add("welcome-language-switch");
  if(keep.parentElement!==home)home.prepend(keep);
}
document.addEventListener("DOMContentLoaded",normalizeWelcomeLanguageButton);
window.addEventListener("pageshow",normalizeWelcomeLanguageButton);
setTimeout(normalizeWelcomeLanguageButton,0);

function toggleLanguage(){
  english=!english;
  document.documentElement.lang=english?"en":"fa";
  document.documentElement.dir=english?"ltr":"rtl";
  const labels={
    brand:["فرناز","Farnaz"],subtitle:["ارتباطی نزدیک‌تر، در هر کجا","Closer, wherever you are"],
    welcome:["خوش آمدی به فرناز","WELCOME TO FARNAZ"],
    headline:["آدم‌های مهم زندگی‌ات، همیشه نزدیک تو","The people who matter, closer to you"],
    description:["یک فضای ساده برای گفتگو و ارتباط با کسانی که برایت مهم‌اند.","A simple space to stay connected."],
    start:["ورود / ثبت‌نام","Sign in / Sign up"],f1:["گفتگوی خصوصی","Private chat"],
    f1d:["پیام‌هایت را مرتب دنبال کن.","Keep conversations organized."],
    f2:["عکس و فایل","Photos & files"],f2d:["لحظه‌ها و فایل‌ها را به اشتراک بگذار.","Share moments and files."],
    f3:["مخاطبان","Contacts"],f3d:["مخاطبان مهمت را ذخیره و سریع پیدا کن.","Save and find important contacts quickly."],
    f4:["گروه‌ها و کانال‌ها","Groups & channels"],f4d:["گفت‌وگوهای جمعی و اطلاع‌رسانی در یک جا.","Group conversations and updates in one place."],
    chatsHeading:["گفتگوها","Chats"],chatsIntro:["گفتگوهای اخیرت را اینجا می‌بینی.","Your recent conversations appear here."],
    contactsHeading:["مخاطبان","Contacts"],
    phoneContactsImportTitle:["افزودن و همگام‌سازی مخاطبان","Add and sync contacts"],
    phoneContactsImportIntro:["می‌توانی مخاطب را دستی اضافه کنی یا از دفترچه تلفن انتخاب کنی. مخاطبان ذخیره‌شده فقط برای حساب خودت هستند.","Add a contact manually or choose one from your phone book. Saved contacts are private to your account."],
    manualContactTitle:["افزودن دستی مخاطب","Add contact manually"],
    manualContactNameLabel:["نام مخاطب","Contact name"],
    manualContactPhoneLabel:["شماره موبایل","Mobile number"],
    manualContactSaveButton:["ذخیره مخاطب","Save contact"],
    pickPhoneContactsButton:["انتخاب مخاطبان از دفترچه تلفن","Choose contacts from address book"],
    phoneContactsVcfFallbackLabel:["روش جایگزین: واردکردن فایل VCF","Alternative: import a VCF file"],
    phoneContactsCountryLabel:["کد کشور برای شماره‌های محلی","Country code for local numbers"],
    importPhoneContactsButton:["واردکردن / به‌روزرسانی فایل VCF","Import / update VCF file"],
    phoneContactsPrivacyNote:["برای همگام‌سازی دوباره، فایل به‌روز مخاطبان را از آیفون انتخاب کن. حذف فایل یا مخاطب از گوشی، مخاطبان ذخیره‌شده فرناز را خودکار حذف نمی‌کند.","To sync again, select an updated VCF file from your iPhone. Removing a contact from your phone does not automatically delete saved Farnaz contacts."],
    savedFarnazContactsTitle:["مخاطبان فرناز","Farnaz members"],
    unmatchedPhoneContactsTitle:["مخاطبان گوشی که هنوز عضو فرناز نیستند","Phone contacts not on Farnaz yet"],
    contactsAllTab:["همه","All"],
    contactsMembersTab:["عضو فرناز","Farnaz members"],
    contactsIntro:["مخاطبان ذخیره‌شده را انتخاب کن یا از جست‌وجوی پایین حساب جدیدی پیدا کن.","Choose a saved contact or find a new account using the search control below."],
    savedContactsStatus:["",""],
    profilePhoneCountryLabel:["کد کشور شماره تلفن","Phone country code"],
    showPhoneSettingLabel:["نمایش شماره موبایل به مخاطبان (پیش‌فرض روشن)","Show my phone number to contacts (on by default)"],
    showPhoneSettingHint:["اگر خاموشش کنی، شماره‌ات در اطلاعات مخاطب نمایش داده نمی‌شود.","Turn this off to hide your number from contact info."],
    profileHeading:["پروفایل من","My profile"],profileIntro:["اطلاعات حساب خود را مدیریت کن.","Manage your account information."],
    profileNameLabel:["نام نمایشی","Display name"],profilePhoneLabel:["شماره موبایل با کد کشور","Phone number with country code"],
    avatarFileLabel:["تصویر پروفایل","Profile picture"],avatarNote:["فرمت JPG، PNG یا WebP؛ حداکثر ۳ مگابایت.","JPG, PNG or WebP; maximum 3 MB."],
    saveProfileButton:["ذخیره تغییرات","Save changes"],logoutButton:["خروج از حساب","Sign out"],
    navChats:["گفتگوها","Chats"],navContacts:["مخاطبان","Contacts"],navProfile:["پروفایل","Profile"],navSettings:["تنظیمات","Settings"],
    messagePrivacyNote:["",""],homeLogin:["ورود یا ثبت‌نام","Sign in or sign up"]
  };
  Object.entries(labels).forEach(([id,pair])=>{if($(id))$(id).textContent=pair[english?1:0];});
  if($("language"))$("language").textContent=english?"فا":"EN";
  if($("welcomeLanguageButton")){$("welcomeLanguageButton").textContent=english?"فا":"EN";$("welcomeLanguageButton").setAttribute("aria-label",english?"Switch to Persian":"Switch to English");}
  if($("contactsImportToggle"))$("contactsImportToggle").textContent=$("phoneContactsImport")&&!$("phoneContactsImport").hidden?"×":"＋";
  if($("start"))$("start").textContent=english?"Sign in to Farnaz →":"ورود به فرناز ←";
  ["profilePhoneCountry"].forEach(id=>{
    const select=$(id);if(!select)return;
    const names=english?["Iran","Germany","United States / Canada","United Kingdom","Turkey"]:["ایران","آلمان","آمریکا / کانادا","بریتانیا","ترکیه"];
    Array.from(select.options).forEach((option,i)=>{option.textContent=names[i]+" (+"+option.value+")";});
  });
  $("footerText").textContent="Farnaz · Closer, wherever you are.";
  $("messageText").placeholder=english?"Write a message...":"پیامت را بنویس...";
  $("showActiveChats").textContent=english?"Chats":"گفتگوها";$("showArchivedChats").textContent=english?"Archive":"آرشیو";
  $("attachmentMenuButton").title=english?"Add attachment":"افزودن پیوست";
  $("attachmentPhotoOption").lastElementChild.textContent=english?"Choose photo":"انتخاب عکس";
  $("attachmentCameraOption").lastElementChild.textContent=english?"Take a photo":"گرفتن عکس با دوربین";
  $("attachmentFileOption").lastElementChild.textContent=english?"Choose file":"انتخاب فایل";
  const newChatButton=$("topNewChatButton")||document.querySelector(".chats-new-button");
  if(newChatButton){newChatButton.title=english?"New chat":"گفتگوی جدید";newChatButton.setAttribute("aria-label",english?"New chat":"گفتگوی جدید");}
  const importToggle=$("contactsImportToggle");
  if(importToggle){importToggle.setAttribute("aria-label",english?"Add or sync contacts":"افزودن یا همگام‌سازی مخاطب");importToggle.title=importToggle.getAttribute("aria-label");}
  if($("savedFarnazContactFilter")){
    $("savedFarnazContactFilter").placeholder=english?"Search saved Farnaz contacts by name":"جستجو در مخاطبان فرناز بر اساس نام";
    $("savedFarnazContactFilter").setAttribute("aria-label",english?"Search saved Farnaz contacts by name":"جستجو در مخاطبان فرناز بر اساس نام");
  }
  if($("savedFarnazContactSearchStatus"))$("savedFarnazContactSearchStatus").textContent="";
  if($("manualContactTitle"))$("manualContactTitle").textContent=english?"Add contact manually":"افزودن دستی مخاطب";
  if($("manualContactNameLabel"))$("manualContactNameLabel").textContent=english?"Contact name":"نام مخاطب";
  if($("manualContactPhoneLabel"))$("manualContactPhoneLabel").textContent=english?"Mobile number":"شماره موبایل";
  if($("manualContactCountryLabel"))$("manualContactCountryLabel").textContent=english?"Country code":"کد کشور";
  if($("manualContactCountry"))Array.from($("manualContactCountry").options).forEach((option,i)=>{const names=english?["Iran","Germany","United States / Canada","United Kingdom","Turkey"]:["ایران","آلمان","آمریکا / کانادا","بریتانیا","ترکیه"];option.textContent=names[i]+" (+"+option.value+")";});
  if($("manualContactSaveButton"))$("manualContactSaveButton").textContent=english?"Save contact":"ذخیره مخاطب";
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
  document.body.dataset.authState="user";
  $("userName").textContent=currentProfileName||(english?"Farnaz user":"کاربر فرناز");
  $("userEmail").textContent=user.email||"";
  setPhoneDisplay($("userPhone"),currentPhone);
  renderAvatar($("userAvatar"),currentAvatarUrl,$("userName").textContent);
}
async function showUser(user){
  profileCompletionRequired=true;
  const request=++profileRequestNumber;
  currentUser=user;renderUser(user,user.user_metadata?.display_name||"");
  if(!window.__farnazPersistenceRequested){window.__farnazPersistenceRequested=true;void window.FarnazLocalStore?.requestPersistentStorage().catch(error=>console.warn("Persistent storage request:",error));}
  window.dispatchEvent(new CustomEvent("farnaz-auth-user",{detail:{userId:user.id}}));
  setStatus("profileStatus",english?"Loading profile...":"در حال بارگذاری پروفایل...");
  let cachedProfile=null;
  try{cachedProfile=await window.FarnazLocalStore?.getSnapshot(user.id,"profile");}catch(cacheError){console.warn("Cached profile read:",cacheError);}
  if(request!==profileRequestNumber||currentUser?.id!==user.id)return;
  if(cachedProfile){
    privacySettings={presence_visibility:cachedProfile.presence_visibility||"contacts",last_seen_visibility:cachedProfile.last_seen_visibility||"contacts",show_typing:cachedProfile.show_typing!==false,show_read_receipts:cachedProfile.show_read_receipts!==false,show_space_online_count:cachedProfile.show_space_online_count!==false};
    applyPrivacySettings();
    currentProfileName=cachedProfile.display_name||user.user_metadata?.display_name||"";
    currentAvatarUrl=cachedProfile.avatar_url||"";currentPhone=cachedProfile.phone||"";
    renderUser(user,currentProfileName);
    if($("profileNameInput"))$("profileNameInput").value=currentProfileName;
    setPhoneCountry("profilePhoneCountry",currentPhone);
    if($("profilePhoneInput"))$("profilePhoneInput").value=formatContactPhone(currentPhone);
    if($("showPhoneSetting"))$("showPhoneSetting").checked=cachedProfile.show_phone!==false;
    setStatus("profileStatus",english?"Showing saved profile while refreshing…":"نمایش پروفایل ذخیره‌شده؛ در حال همگام‌سازی…");
  }
  try{
    const {data,error}=await retryRead("current user profile",()=>getClient().from("profiles")
      .select("id,display_name,avatar_url,phone,show_phone,presence_visibility,last_seen_visibility,show_typing,show_read_receipts,show_space_online_count").eq("id",user.id).maybeSingle(),2,18000);
    if(request!==profileRequestNumber||currentUser?.id!==user.id)return;
    if(error)throw error;
    let profile=data;
    if(!profile){
      const fallbackName=(user.user_metadata?.display_name||user.email?.split("@")[0]||"Farnaz user").trim();
      const created=await retryRead("create current user profile",()=>getClient().from("profiles")
        .upsert({id:user.id,display_name:fallbackName,phone:user.phone||null,show_phone:true},{onConflict:"id"})
        .select("id,display_name,avatar_url,phone,show_phone,presence_visibility,last_seen_visibility,show_typing,show_read_receipts,show_space_online_count").single(),2,18000);
      if(created.error)throw created.error;
      // Logout/account switching may happen while profile creation is pending.
      if(request!==profileRequestNumber||currentUser?.id!==user.id)return;
      profile=created.data;
    }
    privacySettings={presence_visibility:profile?.presence_visibility||"contacts",last_seen_visibility:profile?.last_seen_visibility||"contacts",show_typing:profile?.show_typing!==false,show_read_receipts:profile?.show_read_receipts!==false,show_space_online_count:profile?.show_space_online_count!==false};
    applyPrivacySettings();
    startFarnazPresence().catch(e=>console.warn("Farnaz presence:",e));
    currentProfileName=profile?.display_name||user.user_metadata?.display_name||"";
    currentAvatarUrl=profile?.avatar_url||"";currentPhone=profile?.phone||"";
    renderUser(user,currentProfileName);
    $("profileNameInput").value=currentProfileName;
    setPhoneCountry("profilePhoneCountry",currentPhone);
    $("profilePhoneInput").value=formatContactPhone(currentPhone);
    $("showPhoneSetting").checked=profile?.show_phone!==false;
    try{await window.FarnazLocalStore?.saveSnapshot(user.id,"profile",profile);}catch(cacheError){console.warn("Cached profile save:",cacheError);}
    // A completed cache write must not let a stale profile request update the UI after logout.
    if(request!==profileRequestNumber||currentUser?.id!==user.id)return;
    profileCompletionRequired=!(String(profile?.display_name||"").trim()&&String(profile?.phone||"").trim());
    if(profileCompletionRequired){
      $("profileIntro").textContent=english
        ?"Complete your profile to continue. Your mobile number helps friends find you on Farnaz; it is not SMS-verified."
        :"برای ادامه، تکمیل پروفایل الزامی است. شماره موبایل برای پیدا کردن مخاطبان در فرناز استفاده می‌شود و تأیید پیامکی نمی‌شود.";
      $("profileHeading").textContent=english?"Complete your profile":"تکمیل پروفایل";
      navigate("profilePage",{refreshData:false});
      setStatus("profileStatus",english?"Add your name and mobile number, then save to continue.":"نام و شماره موبایل را وارد کن و ذخیره را بزن تا وارد فرناز شوی.");
    }else{
      $("profileHeading").textContent=english?"My profile":"پروفایل من";
      $("profileIntro").textContent=english?"Manage your account information.":"اطلاعات حساب خود را مدیریت کن.";
      if(document.querySelector(".page.active")?.id==="profilePage")navigate("chatsPage",{refreshData:false});
      setStatus("profileStatus",english?"Profile loaded.":"پروفایل بارگذاری شد.");
    }
  }catch(e){
    // Ignore a late profile failure after logout or a newer account/profile request.
    // Otherwise it can overwrite the cleared guest UI with a stale loading/error status.
    if(request!==profileRequestNumber||currentUser?.id!==user.id)return;
    console.error("Profile read:",e);
    if(cachedProfile){
      setStatus("profileStatus",english?"Showing saved profile; server refresh failed.":"پروفایل ذخیره‌شده نمایش داده می‌شود؛ به‌روزرسانی سرور ناموفق بود.");
      return;
    }
    navigate("profilePage",{refreshData:false});
    setStatus("profileStatus",(english?"Could not load profile: ":"بارگذاری پروفایل ناموفق بود: ")+e.message,true);
  }
}
function showGuest(){
  swipePageHistory=[];swipePageHistoryIndex=-1;clearSwipeTransition();
  profileCompletionRequired=false;
  const previousUserId=currentUser?.id;
  if(previousUserId)window.FarnazLocalStore?.clearUser(previousUserId).catch(cacheError=>console.warn("Could not clear local account data:",cacheError));
  stopFarnazPresence().catch(()=>{});farnazPresenceContactCache.clear();
  profileRequestNumber++;
  // Invalidate every in-flight list request before clearing the signed-in UI.
  // Also invalidate private-chat work so a late response cannot repopulate the guest screen.
  chatRequestNumber++;contactInfoRequest++;messageSearchRequest++;
  conversationListRequestNumber++;savedContactsRequestNumber++;unmatchedPhoneContactsRequestNumber++;
  if(contactInfoDialog)contactInfoDialog.hidden=true;
  if(messageSearchDialog)messageSearchDialog.hidden=true;
  currentUser=null;currentProfileName="";currentAvatarUrl="";currentPhone="";
  currentChatUser=null;
  // Logout can happen from a private chat or the spaces chat view. Reset their
  // layout state as well as the active page so the guest/auth screen is clean.
  document.querySelector(".app")?.classList.remove("chat-mode","spaces-chat-mode");
  document.body.classList.remove("chat-mode","spaces-chat-mode");
  const brandHeader=document.querySelector(".app>header");if(brandHeader)brandHeader.hidden=false;
  document.body.dataset.authState="guest";if($("headerFButton"))$("headerFButton").hidden=true;
  window.dispatchEvent(new CustomEvent("farnaz-auth-user",{detail:{userId:null}}));
  // Clear any in-flight profile/connection status so a cancelled request cannot
  // leave a stale "Loading profile…" message after logout or account switching.
  setStatus("profileStatus","");
  setStatus("authStatus","");
  setConnectionBanner("",false);
  $("bottomNav").classList.remove("visible");
  $("userName").textContent=english?"Farnaz user":"کاربر فرناز";
  $("userEmail").textContent="";$("userPhone").textContent="";
  $("profileForm").reset();
  $("conversationList").replaceChildren();
  $("savedContactsList").replaceChildren();setStatus("savedContactsStatus","");
  // Clear account-specific contact surfaces so a logout or account switch cannot
  // leave the previous user’s imported names or quick-chat results visible.
  $("unmatchedPhoneContactsList").replaceChildren();setStatus("unmatchedPhoneContactsStatus","");
  $("messageList").replaceChildren();
  document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id==="homePage"));
}


/* Auth entry points own the initial inbox/contact refresh; do not schedule a duplicate refresh here. */
let farnazPresenceStartPromise=null,farnazPresenceStartUserId=null;
async function startFarnazPresence(forceRestart=false){
 if(!currentUser)return;
 const uid=String(currentUser.id);
 const existing=farnazPresenceChannel;
 if(!forceRestart&&existing&&farnazPresenceStartUserId===uid&&(existing.state==="joining"||existing.state==="joined"))return;
 if(farnazPresenceStartPromise){
  const pending=farnazPresenceStartPromise;
  try{await pending;}catch(_){}
  if(!currentUser)return;
  if(String(currentUser.id)!==uid)return startFarnazPresence(forceRestart);
  if(!forceRestart&&farnazPresenceChannel&&farnazPresenceStartUserId===uid&&
    (farnazPresenceChannel.state==="joining"||farnazPresenceChannel.state==="joined"))return;
  return startFarnazPresence(forceRestart);
 }
 const task=startFarnazPresenceNow(uid);
 farnazPresenceStartPromise=task;
 farnazPresenceStartUserId=uid;
 try{await task;}finally{if(farnazPresenceStartPromise===task)farnazPresenceStartPromise=null;}
}
async function startFarnazPresenceNow(expectedUid){
 if(!currentUser||String(currentUser.id)!==expectedUid)return;
 const client=getClient(),uid=String(currentUser.id);
 if(uid!==expectedUid)return;
 await stopFarnazPresence();
 if(!currentUser||String(currentUser.id)!==uid)return;
 if(!farnazPresenceSessionId)farnazPresenceSessionId=crypto.randomUUID();
 const ownTopic="farnaz-presence:"+uid;
 const ownChannel=client.channel(ownTopic,{config:{private:true,presence:{key:uid+":"+farnazPresenceSessionId}}});
 farnazPresenceChannel=ownChannel;
 const notifyPresence=()=>window.dispatchEvent(new CustomEvent("farnaz-presence-updated",{detail:{userIds:[...farnazPresenceMap.keys()]}}));
 const trackOwn=async()=>{
  if(!currentUser||String(currentUser.id)!==uid||farnazPresenceChannel!==ownChannel)return;
  if(document.visibilityState!=="visible"||privacySettings.presence_visibility==="nobody"){try{await ownChannel.untrack();}catch(_){}if(document.visibilityState==="visible"){try{await client.rpc("set_farnaz_presence_session",{p_session_id:farnazPresenceSessionId,p_active:true});}catch(_){}}return;}
  const now=new Date().toISOString();
  try{await client.rpc("set_farnaz_presence_session",{p_session_id:farnazPresenceSessionId,p_active:true});}catch(_){}
  try{await ownChannel.track({user_id:uid,online:true,updated_at:now});}catch(_){}
 };
 ownChannel.subscribe(async status=>{
  if(status==="SUBSCRIBED")await trackOwn();
 });
 if(farnazPresenceTimer)clearInterval(farnazPresenceTimer);
 farnazPresenceTimer=setInterval(trackOwn,60000);
 try{
  const {data,error}=await client.rpc("get_farnaz_mutual_contact_ids");
  if(error)throw error;
  if(!currentUser||String(currentUser.id)!==uid||farnazPresenceChannel!==ownChannel)return;
  for(const row of data||[]){
   if(!currentUser||String(currentUser.id)!==uid||farnazPresenceChannel!==ownChannel)return;
   const contactId=String(row.contact_user_id||"");
   if(!contactId||contactId===uid)continue;
   const ch=client.channel("farnaz-presence:"+contactId,{config:{private:true,presence:{key:contactId}}});
   farnazPresenceChannels.set(contactId,ch);
   ch.on("presence",{event:"sync"},()=>{
    if(farnazPresenceChannels.get(contactId)!==ch)return;
    const state=ch.presenceState()||{};
    const entries=Object.values(state).flat();
    const entry=entries.find(x=>String(x.user_id||"")===contactId&&x.online===true);
    if(entry)farnazPresenceMap.set(contactId,entry);else farnazPresenceMap.delete(contactId);
    window.farnazPresenceMap=farnazPresenceMap;notifyPresence();
   }).subscribe();
  }
 }catch(e){console.warn("Could not subscribe to mutual-contact presence:",e);}
 if(farnazVisibilityHandler)document.removeEventListener("visibilitychange",farnazVisibilityHandler);
 farnazVisibilityHandler=()=>{
  if(document.visibilityState==="visible"){
   startFarnazPresence(true).catch(e=>console.warn("Farnaz presence resume:",e));
   return;
  }
  if(farnazPresenceTimer){clearInterval(farnazPresenceTimer);farnazPresenceTimer=null;}
  try{client.rpc("set_farnaz_presence_session",{p_session_id:farnazPresenceSessionId,p_active:false});}catch(_){}
  try{ownChannel.untrack();}catch(_){}
  for(const [id,ch] of farnazPresenceChannels){client.removeChannel(ch).catch(()=>{});farnazPresenceChannels.delete(id);farnazPresenceMap.delete(id);}
  if(farnazTypingChannel){try{farnazTypingChannel.send({type:"broadcast",event:"typing",payload:{from:uid,typing:false}});}catch(_){}client.removeChannel(farnazTypingChannel).catch(()=>{});farnazTypingChannel=null;}
  window.farnazPresenceMap=farnazPresenceMap;notifyPresence();
 };
 document.addEventListener("visibilitychange",farnazVisibilityHandler);
}
async function startPrivateTypingChannel(contactId){
 if(!currentUser||!contactId)return;
 const client=getClient(),uid=String(currentUser.id),other=String(contactId);
 if(farnazTypingChannel){const old=farnazTypingChannel;farnazTypingChannel=null;try{await client.removeChannel(old);}catch(_){}}
 if(!currentUser||String(currentUser.id)!==uid||String(currentChatUser?.user_id)!==other)return;
 if(uid===other)return;
 const pair=[uid,other].sort();
 const ch=client.channel("farnaz-typing:"+pair.join(":"),{config:{private:true}});
 farnazTypingChannel=ch;
 ch.on("broadcast",{event:"typing"},event=>{
  const p=event?.payload||{};
  if(String(p.from)===uid||String(currentChatUser?.user_id)!==other||privacySettings.show_typing===false)return;
  const subtitle=$("chatSubtitle");if(!subtitle)return;
  subtitle.textContent=p.typing?(english?"Typing…":"در حال نوشتن…"):currentChatPresenceLabel;
  if(remoteTypingTimer)clearTimeout(remoteTypingTimer);
  if(p.typing)remoteTypingTimer=setTimeout(()=>{if(subtitle)subtitle.textContent=currentChatPresenceLabel;},2200);
 }).subscribe();
}
async function stopFarnazPresence(){
 if(farnazPresenceTimer){clearInterval(farnazPresenceTimer);farnazPresenceTimer=null;}
 if(farnazVisibilityHandler){document.removeEventListener("visibilitychange",farnazVisibilityHandler);farnazVisibilityHandler=null;}
 const client=farnazClient;
 if(client&&currentUser&&farnazPresenceSessionId){try{await client.rpc("set_farnaz_presence_session",{p_session_id:farnazPresenceSessionId,p_active:false});}catch(_){}}
 const own=farnazPresenceChannel;farnazPresenceChannel=null;
 if(own&&client){try{await own.untrack();await client.removeChannel(own);}catch(_){}}
 if(client){
  for(const ch of farnazPresenceChannels.values()){try{await client.removeChannel(ch);}catch(_){}}
  if(farnazTypingChannel){try{await client.removeChannel(farnazTypingChannel);}catch(_){}}
 }
 farnazPresenceChannels.clear();farnazTypingChannel=null;farnazPresenceMap=new Map();window.farnazPresenceMap=farnazPresenceMap;notifyFarnazPresenceChanged();
}
function notifyFarnazPresenceChanged(){window.dispatchEvent(new CustomEvent("farnaz-presence-updated",{detail:{userIds:[...farnazPresenceMap.keys()]}}));}
window.farnazCanSeePresence=async function(userId){
 const id=String(userId||"");if(!id||id===String(currentUser?.id))return true;
 return farnazPresenceMap.has(id);
};

function applyPrivacySettings(){
 const values={presenceVisibilitySetting:privacySettings.presence_visibility,lastSeenVisibilitySetting:privacySettings.last_seen_visibility,showTypingSetting:privacySettings.show_typing,showReadReceiptsSetting:privacySettings.show_read_receipts,showSpaceOnlineCountSetting:privacySettings.show_space_online_count};
 for(const [id,value] of Object.entries(values)){const el=$(id);if(el){if(el.type==="checkbox")el.checked=!!value;else el.value=value;}}
}
async function savePrivacySetting(key,value){
 if(!currentUser)return;
 const userId=String(currentUser.id);
 const allowed={presence_visibility:["everyone","contacts","nobody"],last_seen_visibility:["everyone","contacts","nobody"]};
 if(allowed[key]&&!allowed[key].includes(value))return;
 const previous=privacySettings[key];privacySettings={...privacySettings,[key]:value};
 const status=$("privacySettingsStatus");if(status)status.textContent=english?"Saving…":"در حال ذخیره…";
 try{
  const {error}=await getClient().from("profiles").update({[key]:value}).eq("id",userId);if(error)throw error;
  if(String(currentUser?.id)!==userId)return;
  if(status)status.textContent=english?"Privacy settings saved.":"تنظیمات حریم خصوصی ذخیره شد.";
  try{const cached=await window.FarnazLocalStore?.getSnapshot(userId,"profile");if(cached&&String(currentUser?.id)===userId)await window.FarnazLocalStore.saveSnapshot(userId,"profile",{...cached,[key]:value});}catch(cacheError){console.warn("Cached privacy settings update:",cacheError);}
  if(String(currentUser?.id)!==userId)return;
  window.dispatchEvent(new CustomEvent("farnaz-privacy-updated",{detail:{...privacySettings}}));
  if(farnazPresenceChannel)startFarnazPresence().then(()=>{if(String(currentUser?.id)===userId&&currentChatUser&&privacySettings.show_typing!==false)startPrivateTypingChannel(currentChatUser.user_id).catch(()=>{});}).catch(()=>{});
 }catch(error){
  if(String(currentUser?.id)!==userId)return;
  privacySettings={...privacySettings,[key]:previous};applyPrivacySettings();
  if(status)status.textContent=(english?"Could not save: ":"ذخیره ناموفق بود: ")+(error?.message||String(error));
 }
}

// Square crop editor: drag to reposition and use the slider to zoom.
function openAvatarCropEditor(file){
 if(!file)return;
 const reader=new FileReader(),image=new Image();
 reader.onload=()=>{image.onload=()=>showAvatarCropDialog(image);image.onerror=()=>setStatus("profileStatus",english?"Could not read this image.":"خواندن تصویر ناموفق بود.",true);image.src=String(reader.result||"");};
 reader.onerror=()=>setStatus("profileStatus",english?"Could not read this image.":"خواندن تصویر ناموفق بود.",true);
 reader.readAsDataURL(file);
}
function showAvatarCropDialog(image){
 document.getElementById("avatarCropDialog")?.remove();
 const modal=document.createElement("div");modal.id="avatarCropDialog";modal.setAttribute("role","dialog");modal.setAttribute("aria-modal","true");
 modal.style.cssText="position:fixed;inset:0;z-index:100001;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.75);backdrop-filter:blur(8px)";
 const card=document.createElement("section");card.style.cssText="width:min(100%,420px);max-height:calc(100dvh - 36px);overflow:auto;padding:20px;border-radius:22px;background:var(--panel,var(--bg,#fff));color:var(--text,#111);box-shadow:0 18px 60px rgba(0,0,0,.3);display:flex;flex-direction:column;gap:14px";
 const cropTheme=document.body.dataset.theme==="light"?"light":"dark";const cropInk=cropTheme==="light"?"#172237":"#f4f7fb";card.style.setProperty("color",cropInk,"important");
 const title=document.createElement("h3");title.textContent=english?"Crop profile photo":"برش و ویرایش عکس پروفایل";title.style.cssText="margin:0;font-size:17px;text-align:center;color:"+cropInk+";";
 const hint=document.createElement("p");hint.textContent=english?"Drag to reposition; use the slider to zoom.":"عکس را با انگشت جابه‌جا کن و با نوار زیر بزرگ‌نمایی را تنظیم کن.";hint.style.cssText="margin:0;font-size:13px;line-height:1.7;opacity:.8;text-align:center;color:"+cropInk+";";
 const canvas=document.createElement("canvas");canvas.width=320;canvas.height=320;canvas.style.cssText="width:min(76vw,320px);height:min(76vw,320px);max-height:38vh;align-self:center;border-radius:50%;touch-action:none;background:#222;cursor:grab";
 const label=document.createElement("label");label.textContent=english?"Zoom":"بزرگ‌نمایی";label.style.setProperty("display","block");label.style.setProperty("color",cropInk,"important");label.style.setProperty("font-size","14px","important");label.style.setProperty("font-weight","600","important");
 const zoom=document.createElement("input");zoom.type="range";zoom.min="1";zoom.max="3";zoom.step=".01";zoom.value="1";zoom.style.width="100%";
 const actions=document.createElement("div");actions.style.cssText="display:flex;gap:10px";
 const cancel=document.createElement("button");cancel.type="button";cancel.textContent=english?"Cancel":"انصراف";cancel.style.cssText="flex:1;padding:12px;border:1px solid var(--border,#888);border-radius:12px;background:transparent;color:inherit";
 const save=document.createElement("button");save.type="button";save.textContent=english?"Use photo":"استفاده از عکس";save.style.cssText="flex:1;padding:12px;border:0;border-radius:12px;background:var(--accent,#8aa9df);color:var(--accent-ink,#101722);font-weight:650";
 actions.append(cancel,save);card.append(title,hint,canvas,label,zoom,actions);modal.append(card);document.body.append(modal);
 const ctx=canvas.getContext("2d");let scale=1,dx=0,dy=0,drag=null;const base=Math.max(320/image.naturalWidth,320/image.naturalHeight);
 function draw(){ctx.clearRect(0,0,320,320);const w=image.naturalWidth*base*scale,h=image.naturalHeight*base*scale;ctx.save();ctx.beginPath();ctx.arc(160,160,159,0,Math.PI*2);ctx.clip();ctx.drawImage(image,(320-w)/2+dx,(320-h)/2+dy,w,h);ctx.restore();}
 zoom.addEventListener("input",()=>{scale=Number(zoom.value);draw();});
 canvas.addEventListener("pointerdown",e=>{drag={x:e.clientX,y:e.clientY,dx,dy};canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener("pointermove",e=>{if(!drag)return;const r=canvas.getBoundingClientRect();dx=drag.dx+(e.clientX-drag.x)*320/r.width;dy=drag.dy+(e.clientY-drag.y)*320/r.height;draw();});
 const end=()=>{drag=null;};canvas.addEventListener("pointerup",end);canvas.addEventListener("pointercancel",end);
 const close=()=>modal.remove();cancel.addEventListener("click",close);modal.addEventListener("click",e=>{if(e.target===modal)close();});
 save.addEventListener("click",()=>{const out=document.createElement("canvas");out.width=512;out.height=512;const c=out.getContext("2d");const ratio=1.6,w=image.naturalWidth*base*scale*ratio,h=image.naturalHeight*base*scale*ratio;c.save();c.beginPath();c.arc(256,256,256,0,Math.PI*2);c.clip();c.drawImage(image,(160-(image.naturalWidth*base*scale)/2+dx)*ratio,(160-(image.naturalHeight*base*scale)/2+dy)*ratio,w,h);c.restore();out.toBlob(blob=>{if(!blob){setStatus("profileStatus",english?"Image processing failed.":"پردازش تصویر ناموفق بود.",true);return;}try{const transfer=new DataTransfer();transfer.items.add(new File([blob],"profile-photo.jpg",{type:"image/jpeg",lastModified:Date.now()}));$("avatarFile").files=transfer.files;}catch(err){setStatus("profileStatus",english?"Please select the image again.":"لطفاً عکس را دوباره انتخاب کن.",true);close();return;}$("avatarNote").textContent=english?"Cropped photo ready. Save profile to upload.":"عکس برش‌خورده آماده است؛ برای بارگذاری ذخیره تغییرات را بزن.";setStatus("profileStatus",english?"Photo cropped. Save profile to upload it.":"عکس برش خورد؛ برای بارگذاری، ذخیره تغییرات را بزن.");close();},"image/jpeg",.9);});
 draw();save.focus({preventScroll:true});
}
if($("avatarFile"))$("avatarFile").addEventListener("change",event=>{const file=event.target.files?.[0];if(file)openAvatarCropEditor(file);});

async function saveProfile(event){
  event.preventDefault();if(!currentUser)return;
  // Capture the account and settings before the first await. A logout or quick
  // account switch must never redirect an in-flight save into the next profile.
  const userId=String(currentUser.id);
  const profilePrivacy={...privacySettings};
  const name=$("profileNameInput").value.trim();
  const phone=normalizePhone($("profilePhoneInput").value,$("profilePhoneCountry").value);
  const showPhone=$("showPhoneSetting").checked;
  const file=$("avatarFile").files[0];
  const button=$("saveProfileButton");
  if(!name||name.length>60){
    setStatus("profileStatus",english?"Enter a name up to 60 characters.":"نامی بین ۱ تا ۶۰ نویسه وارد کن.",true);return;
  }
  if(profileCompletionRequired&&!phone){
    setStatus("profileStatus",english?"A mobile number is required to continue.":"برای ادامه، واردکردن شماره موبایل الزامی است.",true);return;
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
  button.disabled=true;setStatus("profileStatus",english?"Preparing to save profile...":"آماده‌سازی ذخیره پروفایل...");
  try{
    const client=getClient();let avatarUrl=currentAvatarUrl;
    if(file){
      setStatus("profileStatus",english?"Uploading profile photo...":"در حال بارگذاری عکس پروفایل...");
      const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
      const path=userId+"/avatar-"+Date.now()+"."+ext;
      const {error}=await client.storage.from("avatars").upload(path,file,{contentType:file.type,upsert:true});
      if(error)throw error;
      avatarUrl=client.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    }
    if(String(currentUser?.id)!==userId)throw new Error("Account changed while saving; please retry on the current account.");
    setStatus("profileStatus",english?"Saving profile details...":"در حال ذخیره مشخصات پروفایل...");
    const {data,error}=await client.from("profiles")
      .upsert({id:userId,display_name:name,phone:phone||null,avatar_url:avatarUrl||null,show_phone:showPhone,presence_visibility:profilePrivacy.presence_visibility,last_seen_visibility:profilePrivacy.last_seen_visibility,show_typing:profilePrivacy.show_typing,show_read_receipts:profilePrivacy.show_read_receipts,show_space_online_count:profilePrivacy.show_space_online_count},{onConflict:"id"})
      .select("id,display_name,phone,avatar_url,show_phone").single();
    if(error)throw error;
    if(String(currentUser?.id)!==userId)return;
    currentProfileName=data.display_name||name;currentPhone=data.phone||"";
    currentAvatarUrl=data.avatar_url||"";
    setPhoneCountry("profilePhoneCountry",currentPhone);
    setStatus("profileStatus",english?"Updating account details...":"در حال به‌روزرسانی مشخصات حساب...");
    try{
      if(String(currentUser?.id)!==userId)return;
      const {error:metadataError}=await client.auth.updateUser({data:{display_name:currentProfileName}});
      if(metadataError)console.warn("Auth metadata update:",metadataError);
    }catch(metadataError){
      // The profile row is already saved; account metadata is secondary and must not block success.
      console.warn("Auth metadata update:",metadataError);
    }
    if(String(currentUser?.id)!==userId)return;
    renderUser(currentUser,currentProfileName);$("avatarFile").value="";
    try{await window.FarnazLocalStore?.saveSnapshot(userId,"profile",{...data,...profilePrivacy});}catch(cacheError){console.warn("Cached profile update:",cacheError);}
    if(String(currentUser?.id)!==userId)return;
    if(profileCompletionRequired){
      profileCompletionRequired=false;
      $("profileHeading").textContent=english?"My profile":"پروفایل من";
      $("profileIntro").textContent=english?"Manage your account information.":"اطلاعات حساب خود را مدیریت کن.";
      setStatus("profileStatus",english?"Profile complete. Welcome to Farnaz!":"پروفایل تکمیل شد؛ به فرناز خوش آمدی!");
      navigate("chatsPage",{refreshData:true});
    }else setStatus("profileStatus",english?"Profile saved.":"پروفایل ذخیره شد.");
  }catch(e){
    if(String(currentUser?.id)!==userId)return;
    console.error("Profile save:",e);
    const duplicatePhone=e?.code==="23505"&&/profiles_phone_unique|phone/i.test(String(e?.message||""));
    const reason=duplicatePhone
      ?(english?"This phone number is already used by another Farnaz profile. Use a different number or leave the phone field empty.":"این شماره موبایل قبلاً در پروفایل حساب دیگری ثبت شده است. شمارهٔ دیگری وارد کن یا این فیلد را خالی بگذار.")
      :e?.name==="AbortError"||e?.name==="TimeoutError"
        ?(english?"Photo upload timed out. Check your connection and try again.":"بارگذاری عکس به پایان مهلت رسید. اتصال را بررسی کن و دوباره تلاش کن.")
        :(e?.message||String(e));
    setStatus("profileStatus",(english?"Could not save profile: ":"ذخیره پروفایل ناموفق بود: ")+reason,true);
  }finally{button.disabled=false;}
}
async function logout(){
  const button=$("logoutButton");
  if(button)button.disabled=true;
  let logoutWarning="";
  try{
    // Local sign-out must not be held hostage by a stalled profile/realtime request.
    const client=getClient();
    const result=await Promise.race([
      client.auth.signOut({scope:"local"}),
      recoveryDelay(5000).then(()=>({timedOut:true}))
    ]);
    if(result?.timedOut||result?.error){
      // Supabase local sessions are persisted under this explicit storage key.
      // If its own local cleanup stalls/fails, remove only this app's auth session.
      try{localStorage.removeItem("sb-iemykhluluoymsbqpjsn-auth-token");}catch(storageError){
        console.warn("Could not clear persisted auth session:",storageError);
      }
      if(result?.error)console.warn("Supabase local sign-out failed; cleared persisted session:",result.error);
      logoutWarning=english
        ?"Local session storage was cleared, but sign-out cleanup did not finish normally."
        :"ذخیره نشست محلی پاک شد، اما فرایند خروج عادی کامل نشد.";
    }
  }catch(e){
    console.error("Farnaz logout failed:",e);
    try{localStorage.removeItem("sb-iemykhluluoymsbqpjsn-auth-token");}catch(storageError){
      console.warn("Could not clear persisted auth session:",storageError);
    }
    logoutWarning=english
      ?"The local session was cleared after a sign-out error."
      :"پس از خطای خروج، نشست ذخیره‌شدهٔ محلی پاک شد.";
  }finally{
    // Always return to the guest screen, even if auth cleanup or network state stalls.
    showGuest();
    if(logoutWarning)setStatus("authStatus",logoutWarning,true);
    else setStatus("authStatus",english?"You have signed out.":"با موفقیت از حساب خارج شدی.",false);
    // Cleanup is best-effort and deliberately runs after the UI has returned to guest.
    void stopMessageSubscription().catch(e=>console.warn("Message channel cleanup after logout:",e));
    if(button)button.disabled=false;
  }
}

function sendPrivateTyping(typing){
 if(!farnazTypingChannel||!currentUser||!currentChatUser||privacySettings.show_typing===false)return;
 farnazTypingChannel.send({type:"broadcast",event:"typing",payload:{from:currentUser.id,typing:!!typing}});
}
document.addEventListener("input",event=>{
 if(!event.target?.matches("#messageText"))return;
 if(privacySettings.show_typing===false)return;
 sendPrivateTyping(!!event.target.value.trim());
 if(privateTypingTimer)clearTimeout(privateTypingTimer);
 if(event.target.value.trim())privateTypingTimer=setTimeout(()=>sendPrivateTyping(false),1800);
});

async function stopMessageSubscription(){
  if(!messageSubscription||!farnazClient)return;
  const ch=messageSubscription;messageSubscription=null;messageSubscriptionUserId=null;
  // A suspended mobile realtime socket can make removeChannel never settle.
  // Continue app initialization after a short grace period instead of deadlocking.
  try{
    await Promise.race([
      farnazClient.removeChannel(ch),
      new Promise(resolve=>setTimeout(resolve,2000))
    ]);
  }catch(e){console.warn("Could not close previous realtime channel:",e);}
}
async function getContactProfile(id){
  const {data,error}=await getClient().rpc("get_farnaz_user_profile",{search_user_id:id});
  if(error)throw error;
  return Array.isArray(data)?(data[0]||null):(data||null);
}

// Fetch contact profiles in one authorized RPC instead of one network request
// per contact. This keeps the inbox responsive on mobile/slow connections.
async function getContactProfiles(ids){
  const unique=[...new Set((ids||[]).map(id=>String(id||"")).filter(Boolean))];
  if(!unique.length)return new Map();
  const {data,error}=await getClient().rpc("get_farnaz_user_profiles",{search_user_ids:unique});
  if(error)throw error;
  return new Map((data||[]).filter(p=>p?.user_id).map(p=>[String(p.user_id),p]));
}

let contactInfoDialog=null,contactInfoBlocked=false,contactInfoRequest=0;
/* Click is wired directly in index.html; avoid a second delegated click path. */
document.addEventListener("keydown",event=>{
  if((event.key==="Enter"||event.key===" ")&&event.target instanceof Element&&event.target.matches("#conversationTitle, #chatAvatar")&&currentUser&&currentChatUser){
    event.preventDefault();
    openContactInfo();
  }
});
function ensureContactInfoDialog(){
  if(contactInfoDialog)return contactInfoDialog;
  const modal=document.createElement("div");
  modal.id="contactInfoDialog";modal.className="contact-info-dialog";modal.hidden=true;
  modal.setAttribute("role","dialog");modal.setAttribute("aria-modal","true");modal.setAttribute("aria-labelledby","contactInfoTitle");
  modal.innerHTML='<section class="contact-info-card"><button type="button" class="contact-info-close" id="closeContactInfo" aria-label="بستن">×</button><div class="contact-info-profile"><div class="contact-info-avatar avatar large" id="contactInfoAvatar">F</div><h2 id="contactInfoTitle"></h2><p id="contactInfoAbout" class="muted-note"></p><div id="contactInfoPhone" class="contact-info-phone" hidden></div></div><div class="contact-info-actions" id="contactInfoActions"></div><section class="contact-info-media"><h3 id="contactInfoMediaTitle">رسانه‌ها و فایل‌ها</h3><p id="contactInfoMediaStatus" class="muted-note" role="status"></p><div id="contactInfoMediaList" class="contact-info-media-list"></div></section><p id="contactInfoStatus" class="status" role="status"></p><div class="contact-info-danger-actions"><button type="button" id="contactInfoBlock" class="contact-info-danger-button"></button><button type="button" id="contactInfoDelete" class="contact-info-danger-button">حذف گفتگو</button></div></section>';
  document.body.appendChild(modal);contactInfoDialog=modal;
  $("closeContactInfo").addEventListener("click",closeContactInfo);
  modal.addEventListener("click",event=>{if(event.target===modal)closeContactInfo();});
  $("contactInfoBlock").addEventListener("click",toggleContactBlock);
  $("contactInfoDelete").addEventListener("click",deleteContactConversation);
  const title=$("conversationTitle"),avatar=$("chatAvatar");
  [title,avatar].forEach(el=>{
    if(!el)return;
    el.style.cursor="pointer";el.setAttribute("role","button");el.setAttribute("tabindex","0");
    el.setAttribute("aria-haspopup","dialog");el.setAttribute("aria-label",english?"Contact information":"اطلاعات مخاطب");
  });
  return modal;
}
function closeContactInfo(){if(contactInfoDialog)contactInfoDialog.hidden=true;}
function contactInfoText(fa,en){return english?en:fa;}
function addContactInfoAction(label,icon,handler){
  const button=document.createElement("button");button.type="button";button.className="contact-info-action";
  const glyph=document.createElement("span");glyph.className="contact-info-action-icon";
  if(icon.startsWith("#chatPage")){
    const source=document.querySelector(icon);
    if(source)glyph.appendChild(source.cloneNode(true));
  }else glyph.textContent=icon;
  const text=document.createElement("span");text.textContent=label;button.append(glyph,text);button.addEventListener("click",handler);$("contactInfoActions").appendChild(button);
}
let messageSearchDialog=null,messageSearchRequest=0;
function ensureMessageSearchDialog(){
  if(messageSearchDialog)return messageSearchDialog;
  const modal=document.createElement("div");
  modal.id="messageSearchDialog";modal.className="message-search-dialog";modal.hidden=true;
  modal.setAttribute("role","dialog");modal.setAttribute("aria-modal","true");modal.setAttribute("aria-labelledby","messageSearchTitle");
  modal.innerHTML='<section class="message-search-card"><header class="message-search-heading"><h2 id="messageSearchTitle"></h2><button type="button" class="contact-info-close" id="closeMessageSearch" aria-label="Close">×</button></header><form id="messageSearchForm"><label for="messageSearchQuery" id="messageSearchQueryLabel"></label><input id="messageSearchQuery" type="search" maxlength="200" autocomplete="off"><div class="message-search-filters"><div><label for="messageSearchKind" id="messageSearchKindLabel"></label><select id="messageSearchKind"><option value="all"></option><option value="text"></option><option value="images"></option><option value="voice"></option><option value="files"></option></select></div><div><label for="messageSearchFrom" id="messageSearchFromLabel"></label><input id="messageSearchFrom" type="date"></div><div><label for="messageSearchTo" id="messageSearchToLabel"></label><input id="messageSearchTo" type="date"></div></div><button class="message-search-submit" id="messageSearchSubmit" type="submit"></button></form><p id="messageSearchStatus" class="muted-note" role="status" aria-live="polite"></p><div id="messageSearchResults" class="message-search-results"></div></section>';
  document.body.appendChild(modal);messageSearchDialog=modal;
  $("closeMessageSearch").addEventListener("click",closeMessageSearch);
  modal.addEventListener("click",e=>{if(e.target===modal)closeMessageSearch();});
  $("messageSearchForm").addEventListener("submit",searchMessageHistory);
  modal.addEventListener("keydown",e=>{if(e.key==="Escape")closeMessageSearch();});
  return modal;
}
function closeMessageSearch(){if(messageSearchDialog)messageSearchDialog.hidden=true;}
function searchCurrentConversation(){
  closeContactInfo();const modal=ensureMessageSearchDialog();
  $("messageSearchTitle").textContent=contactInfoText("جست‌وجوی پیشرفته","Advanced search");
  $("messageSearchQueryLabel").textContent=contactInfoText("عبارت جست‌وجو","Search phrase");
  $("messageSearchQuery").placeholder=contactInfoText("کلمه یا عبارت را بنویس…","Enter a word or phrase…");
  $("messageSearchKindLabel").textContent=contactInfoText("نوع پیام","Message type");
  $("messageSearchFromLabel").textContent=contactInfoText("از تاریخ","From date");
  $("messageSearchToLabel").textContent=contactInfoText("تا تاریخ","To date");
  $("messageSearchSubmit").textContent=contactInfoText("جست‌وجو","Search");
  [["all","همه","All"],["text","متنی","Text"],["images","تصاویر","Images"],["voice","صوتی","Voice"],["files","فایل‌ها","Files"]].forEach(([v,fa,en],i)=>{$("messageSearchKind").options[i].textContent=english?en:fa;});
  $("messageSearchStatus").textContent=contactInfoText("جست‌وجو در تمام تاریخچهٔ گفتگوی خصوصی","Search the full private conversation history");
  $("messageSearchResults").replaceChildren();modal.hidden=false;$("messageSearchQuery").focus();
}
function messageSearchQueryBase(client,myId,contactId,senderIsMe,kind,fromIso,toIso){
  let q=client.from("messages").select("id,sender_id,receiver_id,body,created_at,message_type,attachment_path,attachment_name,attachment_mime,reply_to_id,edited_at")
    .eq("sender_id",senderIsMe?myId:contactId).eq("receiver_id",senderIsMe?contactId:myId);
  if(fromIso)q=q.gte("created_at",fromIso);if(toIso)q=q.lt("created_at",toIso);
  if(kind==="text")q=q.is("attachment_path",null);
  if(kind==="images")q=q.eq("message_type","image").not("attachment_path","is",null);
  if(kind==="voice")q=q.ilike("attachment_mime","audio/%").not("attachment_path","is",null);
  if(kind==="files")q=q.not("attachment_path","is",null).not("attachment_mime","ilike","image/%").not("attachment_mime","ilike","audio/%").not("attachment_mime","ilike","video/%");
  return q.order("created_at",{ascending:false}).limit(101);
}
async function searchMessageHistory(event){
  event.preventDefault();if(!currentUser||!currentChatUser)return;
  const term=$("messageSearchQuery").value.trim(),kind=$("messageSearchKind").value,fromValue=$("messageSearchFrom").value,toValue=$("messageSearchTo").value;
  if(fromValue&&toValue&&fromValue>toValue){$("messageSearchStatus").textContent=contactInfoText("تاریخ شروع باید قبل از پایان باشد.","Start date must be before end date.");return;}
  if(!term&&!fromValue&&!toValue&&kind==="all"){$("messageSearchStatus").textContent=contactInfoText("عبارت، تاریخ یا نوع پیام را مشخص کن.","Enter a phrase, date range, or message type.");return;}
  const request=++messageSearchRequest,myId=currentUser.id,contactId=currentChatUser.user_id,client=getClient();
  const fromIso=fromValue?new Date(fromValue+"T00:00:00").toISOString():null;
  const toIso=toValue?new Date(new Date(toValue+"T00:00:00").getTime()+86400000).toISOString():null;
  const safeTerm=term.replace(/[%_\\]/g,c=>"\\"+c);
  const fields=term?(kind==="text"?["body"]:["body","attachment_name"]):[null];
  const submit=$("messageSearchSubmit");submit.disabled=true;$("messageSearchResults").replaceChildren();
  $("messageSearchStatus").textContent=contactInfoText("در حال جست‌وجو…","Searching…");
  try{
    const queries=[];
    for(const mine of [true,false])for(const field of fields){
      let q=messageSearchQueryBase(client,myId,contactId,mine,kind,fromIso,toIso);
      if(field)q=q.ilike(field,"%"+safeTerm+"%");
      queries.push(q);
    }
    const responses=await retryRead("message search",()=>Promise.all(queries));
    if(request!==messageSearchRequest||String(currentChatUser?.user_id)!==String(contactId))return;
    const unique=new Map();
    for(const r of responses){if(r.error)throw r.error;for(const m of r.data||[])unique.set(String(m.id),m);}
    let results=[...unique.values()];
    if(kind==="files")results=results.filter(m=>m.attachment_path&&!/^(image|audio|video)\//i.test(m.attachment_mime||""));
    if(kind==="images")results=results.filter(m=>m.attachment_path&&(m.message_type==="image"||(m.attachment_mime||"").startsWith("image/")));
    if(kind==="voice")results=results.filter(m=>m.attachment_path&&(m.message_type==="audio"||(m.attachment_mime||"").startsWith("audio/")));
    if(term){const n=term.toLocaleLowerCase();results=results.filter(m=>(m.body||"").toLocaleLowerCase().includes(n)||(m.attachment_name||"").toLocaleLowerCase().includes(n));}
    const hidden=await retryRead("hidden messages",()=>client.from("message_hidden").select("message_id").eq("user_id",myId));
    if(request!==messageSearchRequest||String(currentChatUser?.user_id)!==String(contactId))return;
    if(hidden.error)throw hidden.error;const hiddenIds=new Set((hidden.data||[]).map(x=>String(x.message_id)));
    results=results.filter(m=>!hiddenIds.has(String(m.id))).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    const total=results.length,list=$("messageSearchResults");list.replaceChildren();
    if(!total){$("messageSearchStatus").textContent=contactInfoText("نتیجه‌ای پیدا نشد.","No matching messages found.");return;}
    $("messageSearchStatus").textContent=total>100?contactInfoText("بیش از ۱۰۰ نتیجه؛ ۱۰۰ مورد تازه‌تر نمایش داده شده است.","More than 100 results; showing the 100 most recent."):contactInfoText(total+" نتیجه پیدا شد.",total+" result(s) found.");
    for(const m of results.slice(0,100)){
      const item=document.createElement("button");item.type="button";item.className="message-search-result";
      const snippet=document.createElement("span");snippet.className="message-search-snippet";
      snippet.textContent=m.body||m.attachment_name||(m.message_type==="image"?contactInfoText("تصویر","Image"):m.message_type==="audio"?contactInfoText("پیام صوتی","Voice message"):contactInfoText("پیوست","Attachment"));
      const meta=document.createElement("small");meta.className="message-search-meta";
      const date=new Date(m.created_at).toLocaleString(english?"en":"fa-IR",{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
      meta.textContent=(String(m.sender_id)===String(myId)?contactInfoText("شما","You"):(currentChatUser.display_name||contactInfoText("مخاطب","Contact")))+" · "+date;
      item.append(snippet,meta);item.addEventListener("click",()=>openSearchedMessage(m.id,m.created_at,contactId));list.appendChild(item);
    }
  }catch(error){if(request===messageSearchRequest)$("messageSearchStatus").textContent=(english?"Search failed: ":"جست‌وجو ناموفق بود: ")+(error?.message||String(error));}
  finally{if(request===messageSearchRequest)submit.disabled=false;}
}
async function openSearchedMessage(messageId,createdAt,contactId){
  if(!currentUser||!currentChatUser||String(currentChatUser.user_id)!==String(contactId))return;
  closeMessageSearch();
  const already=[...$("messageList").querySelectorAll(".message[data-message-id]")].find(el=>String(el.dataset.messageId)===String(messageId));
  if(already){already.classList.add("contact-info-search-match");already.scrollIntoView({behavior:"smooth",block:"center"});setTimeout(()=>already.classList.remove("contact-info-search-match"),2500);return;}
  const request=++chatRequestNumber,myId=currentUser.id,client=getClient();
  setStatus("sendMessageStatus",contactInfoText("در حال باز کردن پیام پیدا‌شده…","Opening matched message…"));
  try{
    const queries=[];
    for(const [sender,receiver] of [[myId,contactId],[contactId,myId]]){
      queries.push(client.from("messages").select("id,sender_id,receiver_id,body,created_at,message_type,attachment_path,attachment_name,attachment_mime,reply_to_id,edited_at").eq("sender_id",sender).eq("receiver_id",receiver).lte("created_at",createdAt).order("created_at",{ascending:false}).limit(26));
      queries.push(client.from("messages").select("id,sender_id,receiver_id,body,created_at,message_type,attachment_path,attachment_name,attachment_mime,reply_to_id,edited_at").eq("sender_id",sender).eq("receiver_id",receiver).gt("created_at",createdAt).order("created_at",{ascending:true}).limit(26));
    }
    const responses=await retryRead("messages around search result",()=>Promise.all(queries));
    if(request!==chatRequestNumber||currentUser?.id!==myId||String(currentChatUser?.user_id)!==String(contactId))return;
    for(const r of responses)if(r.error)throw r.error;
    const unique=new Map();responses.forEach(r=>(r.data||[]).forEach(m=>unique.set(String(m.id),m)));
    let messages=[...unique.values()].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
    const targetIndex=messages.findIndex(m=>String(m.id)===String(messageId));
    if(targetIndex<0)throw new Error(contactInfoText("پیام دیگر در دسترس نیست.","This message is no longer available."));
    const start=Math.max(0,Math.min(targetIndex-24,messages.length-50));messages=messages.slice(start,start+50);
    const hidden=await retryRead("hidden messages",()=>client.from("message_hidden").select("message_id").eq("user_id",myId));
    if(request!==chatRequestNumber||currentUser?.id!==myId||String(currentChatUser?.user_id)!==String(contactId))return;
    if(hidden.error)throw hidden.error;const hiddenIds=new Set((hidden.data||[]).map(m=>String(m.message_id)));
    messages=messages.filter(m=>!hiddenIds.has(String(m.id)));
    const ownIds=messages.filter(m=>String(m.sender_id)===String(myId)).map(m=>String(m.id));
    const received=messages.filter(m=>String(m.receiver_id)===String(myId)&&String(m.sender_id)!==String(myId)).map(m=>({message_id:m.id,sender_id:m.sender_id,receiver_id:m.receiver_id,reader_id:myId}));
    const receiptPromise=ownIds.length?client.from("message_read_receipts").select("message_id,reader_id,read_at").in("message_id",ownIds):Promise.resolve({data:[],error:null});
    const readPromise=(typeof privacySettings==="undefined"||privacySettings.show_read_receipts!==false)&&received.length?client.from("message_read_receipts").upsert(received,{onConflict:"message_id,reader_id",ignoreDuplicates:true}).then(({error})=>{if(error)console.warn("Could not save read receipts:",error.message);}):Promise.resolve();
    const [receipts]=await Promise.all([receiptPromise,readPromise]);
    if(request!==chatRequestNumber||currentUser?.id!==myId||String(currentChatUser?.user_id)!==String(contactId))return;
    readReceiptMessageIds=new Set((receipts?.data||[]).filter(r=>String(r.reader_id)!==String(myId)).map(r=>String(r.message_id)));
    await renderMessages(messages,myId);
    messageHasMore=start>0||responses[0].data?.length>=26||responses[2].data?.length>=26;$("loadOlderButton").hidden=true;
    const found=[...$("messageList").querySelectorAll(".message[data-message-id]")].find(el=>String(el.dataset.messageId)===String(messageId));
    if(found){found.classList.add("contact-info-search-match");found.scrollIntoView({behavior:"smooth",block:"center"});setTimeout(()=>found.classList.remove("contact-info-search-match"),3500);}
    setStatus("sendMessageStatus","");
  }catch(error){if(request===chatRequestNumber)setStatus("sendMessageStatus",(english?"Could not open search result: ":"باز کردن پیام پیدا‌شده ناموفق بود: ")+(error?.message||String(error)),true);}
}
async function renameCurrentContact(){
  if(!currentUser||!currentChatUser)return;
  const userId=String(currentUser.id),contactId=String(currentChatUser.user_id);
  const oldAlias=String(prefFor(contactId).display_name||"");
  const fallback=currentChatUser.profile_display_name||currentChatUser.display_name||(english?"Farnaz user":"مخاطب فرناز");
  const entered=window.prompt(
    english?"Choose a name for this contact. Leave blank to use their profile name.":"نام دلخواه این مخاطب را وارد کن؛ برای استفاده از نام پروفایل، کادر را خالی بگذار.",
    oldAlias||fallback
  );
  if(entered===null)return;
  const alias=entered.trim();
  if(alias.length>120){
    $("contactInfoStatus").textContent=contactInfoText("نام حداکثر ۱۲۰ نویسه باشد.","Name must be 120 characters or fewer.");
    return;
  }
  try{
    await saveConversationPref(contactId,{display_name:alias||null});
    if(String(currentUser?.id)!==userId)return;
    const displayName=alias||currentChatUser.profile_display_name||(english?"Farnaz user":"مخاطب فرناز");
    currentChatUser={...currentChatUser,display_name:displayName};
    $("conversationTitle").textContent=displayName;
    $("contactInfoTitle").textContent=displayName;
    renderAvatar($("chatAvatar"),currentChatUser.avatar_url||"",displayName);
    renderAvatar($("contactInfoAvatar"),currentChatUser.avatar_url||"",displayName);
    $("contactInfoStatus").textContent=contactInfoText("نام مخاطب ذخیره شد.","Contact name saved.");
    await refreshSavedContacts();
  }catch(error){
    if(String(currentUser?.id)!==userId)return;
    $("contactInfoStatus").textContent=(english?"Could not save contact name: ":"ذخیرهٔ نام مخاطب ناموفق بود: ")+(error?.message||String(error));
  }
}
async function openContactInfo(){
  if(!currentUser||!currentChatUser)return;
  ensureContactInfoDialog();
  const request=++contactInfoRequest,contactId=currentChatUser.user_id;
  $("contactInfoMediaTitle").textContent=contactInfoText("رسانه‌ها و فایل‌ها","Media and files");
  $("contactInfoDelete").textContent=contactInfoText("حذف گفتگو","Delete conversation");
  $("closeContactInfo").setAttribute("aria-label",contactInfoText("بستن","Close"));
  const name=currentChatUser.display_name||(english?"Farnaz user":"مخاطب فرناز");
  $("contactInfoTitle").textContent=name;
  $("contactInfoAbout").textContent=contactInfoText("گفتگوی خصوصی در فرناز","Private conversation on Farnaz");
  $("contactInfoPhone").hidden=true;$("contactInfoPhone").textContent="";
  renderAvatar($("contactInfoAvatar"),currentChatUser.avatar_url||"",name);
  $("contactInfoActions").replaceChildren();$("contactInfoMediaList").replaceChildren();
  $("contactInfoMediaStatus").textContent=contactInfoText("در حال بارگذاری رسانه‌ها…","Loading media and files…");
  $("contactInfoStatus").textContent="";
  $("contactInfoBlock").disabled=true;$("contactInfoDelete").disabled=false;
  $("contactInfoBlock").textContent=contactInfoText("در حال بررسی…","Checking…");
  contactInfoBlocked=false;contactInfoDialog.hidden=false;
  addContactInfoAction(contactInfoText("پیام","Message"),"✉",closeContactInfo);
  addContactInfoAction(contactInfoText("ویرایش نام مخاطب","Edit contact name"),"✎",renameCurrentContact);
  addContactInfoAction(contactInfoText("تماس صوتی","Audio call"),"#chatPage .call-actions button[onclick=\"startCall('audio')\"] svg",()=>{closeContactInfo();startCall("audio");});
  addContactInfoAction(contactInfoText("تماس تصویری","Video call"),"#chatPage .call-actions button[onclick=\"startCall('video')\"] svg",()=>{closeContactInfo();startCall("video");});
  addContactInfoAction(contactInfoText("جست‌وجو در گفتگو","Search chat"),"⌕",searchCurrentConversation);
  try{
    const client=getClient();
    const [profileResult,blockedResult]=await Promise.all([
      getContactProfile(contactId),
      client.from("blocked_contacts").select("blocked_user_id").eq("blocker_id",currentUser.id).eq("blocked_user_id",contactId).maybeSingle()
    ]);
    if(request!==contactInfoRequest||String(currentChatUser?.user_id)!==String(contactId))return;
    if(profileResult?.display_name){
      $("contactInfoTitle").textContent=profileResult.display_name;
      $("contactInfoAbout").textContent=contactInfoText("عضو فرناز","Farnaz member");
      if(profileResult.avatar_url)renderAvatar($("contactInfoAvatar"),profileResult.avatar_url,profileResult.display_name);
    }
    /* The profile RPC is the authority for phone visibility; never fall back to raw profile reads. */
    if(profileResult?.phone){
      $("contactInfoPhone").textContent=(english?"Phone: ":"شماره تلفن: ")+formatContactPhone(profileResult.phone);$("contactInfoPhone").setAttribute("dir","ltr");$("contactInfoPhone").style.direction="ltr";$("contactInfoPhone").style.unicodeBidi="isolate";
      $("contactInfoPhone").hidden=false;
    }
    if(blockedResult.error)throw blockedResult.error;
    contactInfoBlocked=!!blockedResult.data;
    $("contactInfoBlock").textContent=contactInfoBlocked?contactInfoText("رفع مسدودسازی","Unblock contact"):contactInfoText("مسدود کردن مخاطب","Block contact");
    $("contactInfoBlock").disabled=false;
    await loadContactInfoMedia(contactId,request);
  }catch(error){
    if(request===contactInfoRequest)$("contactInfoStatus").textContent=(english?"Could not load contact information: ":"بارگذاری اطلاعات مخاطب ناموفق بود: ")+error.message;
    $("contactInfoBlock").disabled=false;
    $("contactInfoBlock").textContent=contactInfoBlocked?contactInfoText("رفع مسدودسازی","Unblock contact"):contactInfoText("مسدود کردن مخاطب","Block contact");
  }
}
async function loadContactInfoMedia(contactId,request){
  const client=getClient(),myId=currentUser.id;
  const results=await Promise.all([
    client.from("messages").select("id,sender_id,receiver_id,created_at,message_type,attachment_path,attachment_name,attachment_mime,attachment_size").eq("sender_id",myId).eq("receiver_id",contactId).not("attachment_path","is",null).order("created_at",{ascending:false}).limit(60),
    client.from("messages").select("id,sender_id,receiver_id,created_at,message_type,attachment_path,attachment_name,attachment_mime,attachment_size").eq("sender_id",contactId).eq("receiver_id",myId).not("attachment_path","is",null).order("created_at",{ascending:false}).limit(60)
  ]);
  const failure=results.find(result=>result.error);if(failure)throw failure.error;
  if(request!==contactInfoRequest)return;
  const items=[...(results[0].data||[]),...(results[1].data||[])].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,80);
  const list=$("contactInfoMediaList");list.replaceChildren();
  if(!items.length){$("contactInfoMediaStatus").textContent=contactInfoText("هنوز رسانه یا فایلی در این گفتگو نیست.","No media or files in this conversation yet.");return;}
  $("contactInfoMediaStatus").textContent=contactInfoText("آخرین پیوست‌های گفتگو","Recent chat attachments");
  for(const item of items){
    const {data,error}=await client.storage.from("chat-attachments").createSignedUrl(item.attachment_path,3600);
    if(request!==contactInfoRequest)return;
    if(error||!data?.signedUrl)continue;
    const link=document.createElement("a");link.className="contact-info-media-item";link.href=data.signedUrl;link.target="_blank";link.rel="noopener noreferrer";
    const isImage=(item.attachment_mime||"").startsWith("image/")||item.message_type==="image";
    if(isImage){const image=document.createElement("img");image.src=data.signedUrl;image.alt=item.attachment_name||contactInfoText("تصویر گفتگو","Chat image");image.loading="lazy";link.appendChild(image);}
    else{const glyph=document.createElement("span");glyph.className="contact-info-file-icon";glyph.textContent=(item.attachment_mime||"").startsWith("audio/")?"♫":"↧";link.appendChild(glyph);}
    const name=document.createElement("span");name.className="contact-info-media-name";name.textContent=item.attachment_name||contactInfoText("فایل پیوست","Attachment");
    link.appendChild(name);list.appendChild(link);
  }
  if(!list.children.length)$("contactInfoMediaStatus").textContent=contactInfoText("پیوست‌ها در حال حاضر قابل نمایش نیستند.","Attachments are currently unavailable.");
}
async function toggleContactBlock(){
  if(!currentUser||!currentChatUser)return;
  const userId=String(currentUser.id),contactId=String(currentChatUser.user_id),name=currentChatUser.display_name||(english?"this contact":"این مخاطب");
  if(contactInfoBlocked){
    if(!confirm(contactInfoText("مسدودسازی این مخاطب برداشته شود؟","Unblock this contact?")))return;
  }else if(!confirm(contactInfoText("با مسدود کردن "+name+"، تبادل پیام و شروع تماس بین دو حساب متوقف می‌شود. ادامه می‌دهی؟","Blocking "+name+" prevents messaging and starting calls between both accounts. Continue?")))return;
  const button=$("contactInfoBlock");button.disabled=true;
  try{
    const client=getClient();
    const result=contactInfoBlocked
      ?await client.from("blocked_contacts").delete().eq("blocker_id",currentUser.id).eq("blocked_user_id",contactId)
      :await client.from("blocked_contacts").insert({blocker_id:currentUser.id,blocked_user_id:contactId});
    if(result.error)throw result.error;
    if(String(currentUser?.id)!==userId||String(currentChatUser?.user_id)!==contactId)return;
    contactInfoBlocked=!contactInfoBlocked;
    button.textContent=contactInfoBlocked?contactInfoText("رفع مسدودسازی","Unblock contact"):contactInfoText("مسدود کردن مخاطب","Block contact");
    $("chatSubtitle").textContent=contactInfoBlocked?contactInfoText("مخاطب مسدود شده است","Contact blocked"):contactInfoText("گفتگوی خصوصی","Private conversation");
    $("contactInfoStatus").textContent=contactInfoBlocked?contactInfoText("مخاطب مسدود شد؛ پیام و تماس جدید مجاز نیست.","Contact blocked. New messages and calls are disabled."):contactInfoText("مسدودسازی برداشته شد.","Contact unblocked.");
  }catch(error){
    if(String(currentUser?.id)!==userId||String(currentChatUser?.user_id)!==contactId)return;
    $("contactInfoStatus").textContent=(english?"Could not update block status: ":"تغییر وضعیت مسدودسازی ناموفق بود: ")+error.message;
  }finally{button.disabled=false;}
}
async function deleteContactConversation(){
  if(!currentUser||!currentChatUser)return;
  const userId=String(currentUser.id),contactId=String(currentChatUser.user_id);
  if(!confirm(contactInfoText("این گفتگو فقط از فهرست شما حذف می‌شود؛ پیام‌ها و فایل‌ها برای طرف مقابل باقی می‌مانند. ادامه می‌دهی؟","This removes the conversation from your list only. Messages and files remain for the other person. Continue?")))return;
  $("contactInfoDelete").disabled=true;
  try{
    await saveConversationPref(contactId,{hidden_at:new Date().toISOString(),archived:false,pinned:false});
    if(String(currentUser?.id)!==userId||String(currentChatUser?.user_id)!==contactId)return;
    closeContactInfo();backFromChat();
  }catch(error){
    if(String(currentUser?.id)!==userId||String(currentChatUser?.user_id)!==contactId)return;
    $("contactInfoStatus").textContent=(english?"Could not delete conversation: ":"حذف گفتگو ناموفق بود: ")+error.message;
  }finally{$("contactInfoDelete").disabled=false;}
}


async function refreshPrivatePresence(contactId){
 const subtitle=$("chatSubtitle");if(!subtitle||!currentUser||!contactId)return;
 const userId=String(currentUser.id),otherId=String(contactId);
 currentChatPresenceLabel=english?"Private conversation":"گفتگوی خصوصی";subtitle.textContent=currentChatPresenceLabel;
 try{
  const {data,error}=await getClient().rpc("get_farnaz_presence_status",{p_user_id:otherId});if(error)throw error;
  if(String(currentUser?.id)!==userId||String(currentChatUser?.user_id)!==otherId)return;
  const row=Array.isArray(data)?data[0]:data;if(!row)return;
  if(row.can_see_online&&row.is_online)currentChatPresenceLabel=english?"Online":"آنلاین";
  else if(row.can_see_last_seen&&row.last_seen_at){const when=new Date(row.last_seen_at);currentChatPresenceLabel=(english?"Last seen ":"آخرین بازدید: ")+when.toLocaleString(english?"en":"fa-IR",{dateStyle:"short",timeStyle:"short"});}
  subtitle.textContent=currentChatPresenceLabel;
 }catch(_){if(String(currentUser?.id)===userId&&String(currentChatUser?.user_id)===otherId)subtitle.textContent=currentChatPresenceLabel;}
}

window.addEventListener("farnaz-presence-updated",()=>{if(currentChatUser&&!remoteTypingTimer)refreshPrivatePresence(currentChatUser.user_id);});
function openChat(contact,fromPage="chatsPage"){
  ensureContactInfoDialog();
  const nextContactId=String(contact.user_id||""),previousContactId=String(currentChatUser?.user_id||""),draftInput=$("messageText");
  if(currentUser&&previousContactId&&previousContactId!==nextContactId&&draftInput){
    if(window.farnazDraftSaveTimer)clearTimeout(window.farnazDraftSaveTimer);
    window.FarnazLocalStore?.saveDraft(currentUser.id,previousContactId,draftInput.value).catch(cacheError=>console.warn("Could not preserve previous draft:",cacheError));
  }
  const switchingContacts=previousContactId!==nextContactId;
  currentChatUser=contact;previousPage=fromPage;startPrivateTypingChannel(contact.user_id).catch(()=>{});
  if(switchingContacts&&draftInput){
    draftInput.value="";draftInput.style.height="auto";
    const draftUserId=currentUser?.id,draftContactId=nextContactId;
    window.FarnazLocalStore?.getDraft(draftUserId,draftContactId).then(draft=>{
      if(currentUser?.id===draftUserId&&String(currentChatUser?.user_id)===draftContactId&&draftInput&&!draftInput.value){
        draftInput.value=draft||"";draftInput.style.height="auto";draftInput.style.height=Math.min(draftInput.scrollHeight,112)+"px";
      }
    }).catch(cacheError=>console.warn("Could not restore draft:",cacheError));
  }
  $("conversationTitle").textContent=contact.display_name||(english?"Farnaz user":"مخاطب فرناز");
  $("chatSubtitle").textContent=english?"Private conversation":"گفتگوی خصوصی";
  const chatAvatar=$("chatAvatar");
  renderAvatar(chatAvatar,contact.avatar_url||"",$("conversationTitle").textContent);
  chatAvatar.onclick=event=>{
    if(event.target?.closest?.("img"))return;
    if(typeof openContactInfo==="function")openContactInfo();
  };
  chatAvatar.setAttribute("role","button");chatAvatar.tabIndex=0;
  chatAvatar.setAttribute("aria-label",english?"View profile photo":"بزرگ‌نمایی عکس مخاطب");
  setStatus("sendMessageStatus","");
  currentChatPresenceLabel=english?"Private conversation":"گفتگوی خصوصی";
  navigate("chatPage");refreshPrivatePresence(contact.user_id);
  // Keep the deletion boundary. Opening a chat must never undelete its old history.
  // loadPrivateMessages filters both local cache and server results against hidden_at.
  loadPrivateMessages();
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
  if(fromPage==="contactsPage"){
    const swipeHint=document.createElement("span");swipeHint.className="contact-swipe-hint";
    swipeHint.textContent="‹";
    swipeHint.setAttribute("aria-hidden","true");
    swipeHint.title=english?"Swipe left for contact actions":"برای دیدن امکانات، به چپ بکش";
    button.appendChild(swipeHint);
  }
  if(timeText){const time=document.createElement("span");time.className="list-time";time.textContent=timeText;details.appendChild(time);}
  button.addEventListener("click",()=>{if(button.dataset.suppressOpen==="1"){button.dataset.suppressOpen="0";return;}const targetPage=button.dataset.openFromPage||fromPage;if(newPrivateChatModal)closeNewPrivateChat();openChat(contact,targetPage);});
  return button;
}
let unmatchedPhoneContactsRequestNumber=0;
async function refreshUnmatchedPhoneContacts(){
  const list=$("unmatchedPhoneContactsList");if(!list||!currentUser)return;
  const request=++unmatchedPhoneContactsRequestNumber,myId=String(currentUser.id);list.replaceChildren();
  try{
    const {data,error}=await retryRead("phone contacts",()=>getClient().from("user_phone_contacts")
      .select("id,display_name,phone,matched_user_id,updated_at,contact_group_id,is_primary,selected_user_id")
      .eq("user_id",myId).order("display_name",{ascending:true}).limit(5000));
    if(currentUser?.id!==myId||request!==unmatchedPhoneContactsRequestNumber)return;
    if(error)throw error;
    const groups=new Map();
    for(const item of data||[]){
      const key=String(item.contact_group_id||item.id);
      if(!groups.has(key))groups.set(key,{id:key,display_name:item.display_name||"",rows:[]});
      groups.get(key).rows.push(item);
    }
    let visibleGroups=0;
    for(const group of groups.values()){
      const rows=group.rows.slice().sort((a,b)=>Number(!!b.is_primary)-Number(!!a.is_primary));
      const matchedIds=[...new Set(rows.map(row=>String(row.matched_user_id||"")).filter(Boolean))];
      const selectedId=String(rows.find(row=>row.selected_user_id)?.selected_user_id||"");
      const selectedIsValid=!!selectedId&&matchedIds.includes(selectedId);
      const resolvedIds=selectedIsValid?[selectedId]:matchedIds;
      if(resolvedIds.length===1)continue;
      visibleGroups++;
      const shell=document.createElement("div");shell.className="phone-contact-swipe-shell";shell.dataset.phoneContactId=group.id;
      shell.dataset.searchName=group.display_name||"";
      shell.dataset.searchPhone=rows.map(item=>item.phone||"").filter(Boolean).join(" ");
      const actions=document.createElement("div");actions.className="phone-contact-swipe-actions";
      const remove=document.createElement("button");remove.type="button";remove.className="contact-swipe-action contact-swipe-delete";
      remove.setAttribute("aria-label",english?"Delete phone-book contact":"حذف مخاطب دفترچه تلفن");
      remove.title=english?"Delete phone-book contact":"حذف مخاطب دفترچه تلفن";
      const glyph=document.createElement("span");glyph.className="contact-swipe-glyph";glyph.textContent="×";
      const label=document.createElement("span");label.className="contact-swipe-label";label.textContent=english?"Delete":"حذف";
      remove.append(glyph,label);remove.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();deletePhoneContactGroup(group.id,remove);});
      actions.appendChild(remove);
      const row=document.createElement("div");row.className="phone-contact-row";
      const avatar=document.createElement("div");avatar.className="avatar";avatar.textContent=initials(group.display_name);
      const details=document.createElement("div");details.className="phone-contact-details";
      const name=document.createElement("strong");name.textContent=group.display_name||(english?"Phone contact":"مخاطب گوشی");
      const primaryPhone=rows.find(item=>item.is_primary&&item.phone)||rows.find(item=>item.phone)||null;
      const phone=document.createElement("span");phone.textContent=formatContactPhone(primaryPhone?.phone||"");
      phone.setAttribute("dir","ltr");phone.style.direction="ltr";phone.style.unicodeBidi="isolate";phone.style.textAlign="left";
      const otherNumbers=rows.filter(item=>item.phone&&String(item.id)!==String(primaryPhone?.id));
      const extraNumbers=document.createElement("details");extraNumbers.className="phone-contact-extra-numbers";
      if(otherNumbers.length){
        const summary=document.createElement("summary");
        summary.textContent=english?"Other numbers ("+otherNumbers.length+")":"شماره‌های دیگر ("+otherNumbers.length+")";
        summary.style.cursor="pointer";
        const numberList=document.createElement("div");numberList.className="phone-contact-extra-number-list";
        numberList.style.display="grid";numberList.style.gap="4px";numberList.style.marginTop="5px";
        for(const item of otherNumbers){
          const number=document.createElement("span");number.textContent=formatContactPhone(item.phone);
          number.setAttribute("dir","ltr");number.style.direction="ltr";number.style.unicodeBidi="isolate";number.style.textAlign="left";
          numberList.appendChild(number);
        }
        extraNumbers.append(summary,numberList);
      }
      const state=document.createElement("small");
      if(resolvedIds.length>1){
        state.textContent=english?"Several Farnaz accounts match this person. Choose one:":"چند حساب فرناز برای این مخاطب پیدا شد؛ یکی را انتخاب کن:";
      }else{
        state.textContent=english?"Not on Farnaz yet":"هنوز در فرناز ثبت‌نام نکرده";
      }
      details.append(name,phone);if(otherNumbers.length)details.appendChild(extraNumbers);details.appendChild(state);
      if(resolvedIds.length>1){
        const choices=document.createElement("div");choices.className="phone-contact-account-choices";
        for(const accountId of resolvedIds){
          let profile={};
          try{profile=await getContactProfile(accountId)||{};}catch(profileError){console.warn("Phone contact account profile:",profileError);}
          if(currentUser?.id!==myId||request!==unmatchedPhoneContactsRequestNumber)return;
          const choose=document.createElement("button");choose.type="button";choose.className="action-button phone-contact-account-choice";
          choose.textContent=profile.display_name||(english?"Farnaz account":"حساب فرناز");
          choose.addEventListener("click",()=>choosePhoneContactAccount(group.id,accountId,choose));
          choices.appendChild(choose);
        }
        details.appendChild(choices);
      }
      row.append(avatar,details);shell.append(actions,row);list.appendChild(shell);
      let startX=0,startY=0,tracking=false;
      shell.addEventListener("pointerdown",event=>{if(event.target.closest(".phone-contact-swipe-actions")||event.target.closest(".phone-contact-account-choices"))return;startX=event.clientX;startY=event.clientY;tracking=true;},{passive:true});
      shell.addEventListener("pointerup",event=>{
        if(!tracking)return;tracking=false;
        const dx=event.clientX-startX,dy=event.clientY-startY;
        if(Math.abs(dx)>48&&Math.abs(dx)>Math.abs(dy)*1.25){
          if(dx<0){shell.classList.add("is-open");shell.dataset.open="true";}
          else{shell.classList.remove("is-open");shell.dataset.open="false";}
        }
      },{passive:true});
      shell.addEventListener("pointercancel",()=>{tracking=false;},{passive:true});
    }
    filterSavedFarnazContacts();
    setStatus("unmatchedPhoneContactsStatus",visibleGroups
      ?(english?"Phone-book contacts needing attention are shown here.":"مخاطبان دفترچه تلفن که نیاز به انتخاب یا بررسی دارند در اینجا نمایش داده می‌شوند.")
      :(english?"All imported contacts are matched or no phone contacts have been imported.":"همه مخاطبان واردشده تطبیق یافته‌اند یا هنوز مخاطبی از دفترچه تلفن وارد نشده است."));
  }catch(e){
    if(currentUser?.id!==myId||request!==unmatchedPhoneContactsRequestNumber)return;
    console.error("Phone contacts:",e);
    setStatus("unmatchedPhoneContactsStatus",(english?"Could not load phone contacts: ":"بارگذاری مخاطبان گوشی ناموفق بود: ")+e.message,true);
  }
}
async function choosePhoneContactAccount(groupId,accountId,button){
  if(!currentUser||!groupId||!accountId)return;
  const myId=String(currentUser.id);
  if(button)button.disabled=true;
  try{
    const client=getClient();
    const {data:rows,error:readError}=await client.from("user_phone_contacts")
      .select("matched_user_id").eq("user_id",myId).eq("contact_group_id",groupId);
    if(readError)throw readError;
    const available=[...new Set((rows||[]).map(row=>String(row.matched_user_id||"")).filter(Boolean))];
    if(!available.includes(String(accountId)))throw new Error(english?"That account is no longer linked to this contact. Sync contacts again.":"این حساب دیگر به این مخاطب متصل نیست؛ مخاطبان را دوباره همگام‌سازی کن.");
    const {error:selectionError}=await client.rpc("choose_farnaz_phone_contact_account",{
      p_contact_group_id:groupId,p_account_id:accountId
    });
    if(selectionError)throw selectionError;
    if(String(currentUser?.id)!==myId)return;
    await refreshSavedContacts();
    if(String(currentUser?.id)!==myId)return;
    await refreshUnmatchedPhoneContacts();
    setStatus("unmatchedPhoneContactsStatus",english?"Account selected for this phone-book contact.":"حساب انتخاب‌شده برای این مخاطب ذخیره شد.");
  }catch(error){
    if(String(currentUser?.id)!==myId)return;
    console.error("Choose phone contact account:",error);
    setStatus("unmatchedPhoneContactsStatus",(english?"Could not choose account: ":"انتخاب حساب ناموفق بود: ")+error.message,true);
  }finally{if(button)button.disabled=false;}
}
async function deletePhoneContactGroup(groupId,button){
  if(!currentUser||!groupId)return;
  const myId=String(currentUser.id);
  if(!confirm(english?"Delete this phone-book contact and all its numbers from Farnaz?":"این مخاطب و همه شماره‌هایش از دفترچه تلفن فرناز حذف شوند؟"))return;
  if(button)button.disabled=true;
  try{
    const {error}=await getClient().from("user_phone_contacts").delete().eq("user_id",myId).eq("contact_group_id",groupId);
    if(error)throw error;
    if(String(currentUser?.id)!==myId)return;
    await refreshUnmatchedPhoneContacts();
    setStatus("phoneContactsImportStatus",english?"Phone-book contact deleted.":"مخاطب دفترچه تلفن حذف شد.");
  }catch(error){
    if(String(currentUser?.id)!==myId)return;
    setStatus("unmatchedPhoneContactsStatus",(english?"Could not delete contact: ":"حذف مخاطب ناموفق بود: ")+error.message,true);
  }finally{if(button)button.disabled=false;}
}
let savedContactsRequestNumber=0;
function makeContactSwipeAction(label,icon,action,contactId){
  const button=document.createElement("button");button.type="button";button.className="contact-swipe-action contact-swipe-"+action;
  button.dataset.action=action;button.setAttribute("aria-label",label);button.title=label;
  const glyph=document.createElement("span");glyph.className="contact-swipe-glyph";glyph.textContent=icon;
  const text=document.createElement("span");text.className="contact-swipe-label";text.textContent=label;
  button.append(glyph,text);
  button.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();runContactSwipeAction(contactId,action,button);});
  return button;
}
function makeSavedContactRow(contact,preview="",timeText=""){
  const shell=document.createElement("div");shell.className="contact-swipe-shell";shell.dataset.contactId=String(contact.user_id||"");
  shell.dataset.searchPhone=String(contact.phone||"");
  const actions=document.createElement("div");actions.className="contact-swipe-actions";
  const id=String(contact.user_id||"");
  const pref=prefFor(id);
  actions.append(
    makeContactSwipeAction(english?"Message":"پیام دادن","✉","message",id),
    makeContactSwipeAction(english?"Edit name":"ویرایش نام","✎","edit",id),
    makeContactSwipeAction(pref.pinned?(english?"Unpin":"برداشتن پین"):(english?"Pin":"پین کردن"),pref.pinned?"📌":"⌖","pin",id),
    makeContactSwipeAction(contact.blocked?(english?"Unblock":"رفع مسدودسازی"):(english?"Block":"مسدود کردن"),"⊘","block",id),
    makeContactSwipeAction(english?"Delete":"حذف مخاطب","×","delete",id)
  );
  const row=document.createElement("div");row.className="saved-contact-row"+(pref.pinned?" is-pinned":"");
  const button=makeContactButton(contact,preview,timeText,"contactsPage");
  button.dataset.contactPhone=normalizePhone(contact.phone||"");
  button.setAttribute("aria-label",(contact.display_name||"")+(english?", actions available by swiping left":"، برای عملیات بیشتر به چپ بکش"));
  row.appendChild(button);shell.append(actions,row);
  let startX=0,startY=0,tracking=false,swiped=false;
  const close=()=>{shell.classList.remove("is-open");shell.dataset.open="false";};
  const open=()=>{shell.classList.add("is-open");shell.dataset.open="true";};
  shell.addEventListener("pointerdown",event=>{
    if(event.target.closest(".contact-swipe-actions"))return;
    startX=event.clientX;startY=event.clientY;tracking=true;swiped=false;
  },{passive:true});
  shell.addEventListener("pointerup",event=>{
    if(!tracking)return;tracking=false;
    const dx=event.clientX-startX,dy=event.clientY-startY;
    if(Math.abs(dx)>12)swiped=true;
    if(Math.abs(dx)>46&&Math.abs(dx)>Math.abs(dy)*1.25){
      if(dx<0)open();else close();
      const mainButton=shell.querySelector(".list-item");if(mainButton)mainButton.dataset.suppressOpen="1";
    }
  },{passive:true});
  shell.addEventListener("pointercancel",()=>{tracking=false;},{passive:true});
  shell.addEventListener("click",event=>{
    if(event.target.closest(".contact-swipe-actions"))return;
    if(event.target.closest(".list-item")&&shell.classList.contains("is-open")){event.preventDefault();close();}
  });
  return shell;
}
async function runContactSwipeAction(contactId,action,button){
  if(!currentUser||!contactId)return;
  const userId=String(currentUser.id);
  const name=Array.from(document.querySelectorAll("#savedContactsList .contact-swipe-shell")).find(el=>el.dataset.contactId===String(contactId))?.querySelector(".list-name")?.textContent|| (english?"this contact":"این مخاطب");
  if(button)button.disabled=true;
  try{
    const client=getClient();
    if(action==="edit"){
      const row=document.querySelector('#savedContactsList .contact-swipe-shell[data-contact-id="'+CSS.escape(String(contactId))+'"]');
      const contactButton=row?.querySelector(".list-item");
      const currentName=contactButton?.querySelector(".list-name")?.textContent||name;
      const entered=window.prompt(english?"Choose a name for this contact. Leave blank to use their profile name.":"نام دلخواه مخاطب را وارد کن؛ برای برگشت به نام پروفایل، کادر را خالی بگذار.",currentName);
      if(entered===null)return;
      const alias=entered.trim();
      if(alias.length>120)throw new Error(english?"Name must be 120 characters or fewer.":"نام مخاطب باید حداکثر ۱۲۰ نویسه باشد.");
      await saveConversationPref(contactId,{display_name:alias||null});
      if(String(currentUser?.id)!==userId)return;
      await refreshSavedContacts();
      setStatus("savedContactsStatus",english?"Contact name updated.":"نام مخاطب تغییر کرد.");
      return;
    }
    if(action==="message"){
      const row=document.querySelector('#savedContactsList .contact-swipe-shell[data-contact-id="'+CSS.escape(String(contactId))+'"]');
      const contactButton=row?.querySelector(".list-item");
      if(!contactButton)throw new Error(english?"Contact is no longer in your list.":"این مخاطب دیگر در فهرست نیست.");
      const avatar=row.querySelector(".avatar");
      const contact={user_id:String(contactId),display_name:row.querySelector(".list-name")?.textContent||name,avatar_url:avatar?.querySelector("img")?.src||avatar?.dataset.avatarUrl||"",phone:row.querySelector(".list-item")?.dataset.contactPhone||""};
      row.classList.remove("is-open");row.dataset.open="false";openChat(contact,"contactsPage");return;
    }
    if(action==="pin"){
      const {data:old,error:readError}=await client.from("conversation_preferences").select("pinned,archived,hidden_at").eq("user_id",userId).eq("contact_user_id",contactId).maybeSingle();
      if(readError)throw readError;
      const pinned=!old?.pinned;
      const {error}=await client.from("conversation_preferences").upsert({user_id:userId,contact_user_id:contactId,pinned,archived:old?.archived||false,hidden_at:old?.hidden_at||null,updated_at:new Date().toISOString()},{onConflict:"user_id,contact_user_id"});
      if(error)throw error;
      conversationPrefs.set(String(contactId),{...prefFor(contactId),...old,pinned,archived:old?.archived||false,hidden_at:old?.hidden_at||null});
      await refreshConversationList();
      if(String(currentUser?.id)!==userId)return;
      await refreshSavedContacts();
      setStatus("savedContactsStatus",pinned?(english?"Contact pinned to the top.":"مخاطب به بالای فهرست سنجاق شد."):(english?"Contact unpinned.":"سنجاق مخاطب برداشته شد."));
      return;
    }
    if(action==="block"){
      const {data:existing,error:readError}=await client.from("blocked_contacts").select("blocked_user_id").eq("blocker_id",userId).eq("blocked_user_id",contactId).maybeSingle();
      if(readError)throw readError;
      if(existing){
        if(!confirm(english?"Unblock "+name+"?":"مسدودسازی «"+name+"» برداشته شود؟"))return;
        const {error}=await client.from("blocked_contacts").delete().eq("blocker_id",userId).eq("blocked_user_id",contactId);
        if(error)throw error;
        setStatus("savedContactsStatus",english?"Contact unblocked.":"مسدودسازی مخاطب برداشته شد.");
      }else{
        if(!confirm(english?"Block "+name+"? Messaging and calls between the two accounts will be stopped.":"مخاطب «"+name+"» مسدود شود؟ تبادل پیام و تماس بین دو حساب متوقف می‌شود."))return;
        const {error}=await client.from("blocked_contacts").insert({blocker_id:userId,blocked_user_id:contactId});
        if(error)throw error;
        setStatus("savedContactsStatus",english?"Contact blocked.":"مخاطب مسدود شد.");
      }
    }else if(action==="delete"){
      if(!confirm(english?"Remove "+name+" from your contacts? This will not delete messages or the other account.":"«"+name+"» از فهرست مخاطبانت حذف شود؟ پیام‌ها و حساب طرف مقابل حذف نمی‌شوند."))return;
      const {data:deleted,error}=await client.from("contacts").delete().eq("user_id",userId).eq("contact_user_id",contactId).select("contact_user_id");
      if(error)throw error;
      if(!deleted?.length)throw new Error(english?"No saved contact was removed. Refresh the list and try again.":"هیچ مخاطبی حذف نشد؛ فهرست را تازه‌سازی کن و دوباره امتحان کن.");
      if(String(currentUser?.id)!==userId)return;
      const {error:aliasError}=await client.from("user_phone_contacts").delete().eq("user_id",userId).eq("matched_user_id",contactId);
      if(aliasError)console.warn("Could not remove imported phone contact aliases:",aliasError);
      try{
        const cached=await window.FarnazLocalStore?.getSnapshot(userId,"contacts");
        if(Array.isArray(cached))await window.FarnazLocalStore?.saveSnapshot(userId,"contacts",cached.filter(entry=>String(entry?.contact?.user_id)!==String(contactId)));
      }catch(cacheError){console.warn("Could not update contacts cache:",cacheError);}
      await refreshSavedContacts();
      setStatus("savedContactsStatus",english?"Contact removed.":"مخاطب حذف شد.");
      return;
    }
    const shell=document.querySelector('#savedContactsList .contact-swipe-shell[data-contact-id="'+CSS.escape(String(contactId))+'"]');
    shell?.classList.remove("is-open");
    if(String(currentUser?.id)!==userId)return;
    await refreshSavedContacts();
  }catch(error){
    if(String(currentUser?.id)!==userId)return;
    console.error("Contact action failed:",action,error);
    setStatus("savedContactsStatus",(english?"Action failed: ":"عملیات ناموفق بود: ")+error.message,true);
  }finally{if(button)button.disabled=false;}
}
async function deleteSavedContact(contactId,button){
  return runContactSwipeAction(contactId,"delete",button);
}
function renderSavedContactsSnapshot(entries){
  const list=$("savedContactsList");if(!list)return;
  list.replaceChildren();
  const sortedEntries=[...(entries||[])].sort((a,b)=>Number(!!(b.pinned??b.contact?.pinned))-Number(!!(a.pinned??a.contact?.pinned)));
  for(const entry of sortedEntries){
    const contact=entry?.contact;if(!contact?.user_id)continue;
    const row=makeSavedContactRow(contact,entry.subtitle||"",entry.date||"");
    const legacySearchName=contact.display_name!==contact.profile_display_name?contact.display_name:"";
    row.dataset.searchName=String(contact.search_name||contact.local_contact_name||legacySearchName||contact.display_name||"");
    list.appendChild(row);
  }
  filterSavedFarnazContacts();
}
async function refreshSavedContacts(){
  const list=$("savedContactsList");if(!list||!currentUser)return;
  const request=++savedContactsRequestNumber,myId=currentUser.id;
  setStatus("savedContactsStatus",english?"Loading saved contacts...":"در حال بارگذاری مخاطبان ذخیره‌شده...");
  try{
    const cached=await window.FarnazLocalStore?.getSnapshot(myId,"contacts");
    if(currentUser?.id===myId&&request===savedContactsRequestNumber&&Array.isArray(cached)&&cached.length){
      renderSavedContactsSnapshot(cached);
      setStatus("savedContactsStatus",english?"Showing saved contacts while refreshing…":"نمایش مخاطبان ذخیره‌شده؛ در حال همگام‌سازی…");
    }
  }catch(cacheError){console.warn("Cached contacts read:",cacheError);}
  try{
    const {data,error}=await retryRead("saved contacts",()=>getClient().from("contacts").select("contact_user_id,created_at").eq("user_id",myId).order("created_at",{ascending:false}));
    if(currentUser?.id!==myId||request!==savedContactsRequestNumber)return;if(error)throw error;
    let phoneData=[];
    try{
      const phoneResult=await retryRead("phone contact names",()=>getClient().from("user_phone_contacts").select("display_name,matched_user_id").eq("user_id",myId).not("matched_user_id","is",null).limit(5000));
      phoneData=phoneResult.data||[];
    }catch(e){console.warn("Imported phone contact names:",e);}
    const importedNames=new Map();
    for(const item of phoneData){if(item.matched_user_id&&!importedNames.has(String(item.matched_user_id)))importedNames.set(String(item.matched_user_id),item.display_name);}
    let contactPreferences=new Map(),blockedContactIds=new Set();
    try{
      const preferenceResult=await retryRead("contact pin preferences",()=>getClient().from("conversation_preferences").select("contact_user_id,pinned,archived,hidden_at,display_name").eq("user_id",myId));
      if(preferenceResult.error)throw preferenceResult.error;
      contactPreferences=new Map((preferenceResult.data||[]).map(pref=>[String(pref.contact_user_id),pref]));
    }catch(preferenceError){console.warn("Contact pin preferences:",preferenceError);}
    try{
      const blockedResult=await retryRead("blocked contact list",()=>getClient().from("blocked_contacts").select("blocked_user_id").eq("blocker_id",myId));
      if(blockedResult.error)throw blockedResult.error;
      blockedContactIds=new Set((blockedResult.data||[]).map(item=>String(item.blocked_user_id)));
    }catch(blockedError){console.warn("Blocked contact list:",blockedError);}
    let profilesById=new Map(),profilesLoaded=true;
    try{profilesById=await getContactProfiles((data||[]).map(item=>item.contact_user_id));}
    catch(e){profilesLoaded=false;console.warn("Saved contact profiles:",e);setConnectionBanner(english?"Some contact profiles could not load. Retrying…":"اطلاعات بعضی مخاطبان بارگذاری نشد؛ دوباره تلاش می‌کنیم.");}
    if(currentUser?.id!==myId||request!==savedContactsRequestNumber)return;
    const snapshot=[];
    const seenContacts=new Set();
    (data||[]).forEach(item=>{
      const contactId=String(item.contact_user_id||"");if(!contactId||seenContacts.has(contactId))return;seenContacts.add(contactId);
      const p=profilesById.get(contactId)||{};
      const preference=contactPreferences.get(contactId)||{};
      const localContactName=String(preference.display_name||importedNames.get(contactId)||"").trim();
      const contact={user_id:contactId,display_name:localContactName||p.display_name||(english?"Farnaz user":"کاربر فرناز"),profile_display_name:p.display_name||"",search_name:localContactName,avatar_url:p.avatar_url||"",phone:p.phone||"",pinned:!!preference.pinned};
      conversationPrefs.set(contactId,preference);
      contact.blocked=blockedContactIds.has(contactId);
      snapshot.push({contact,subtitle:p.phone?formatContactPhone(p.phone):(english?"Farnaz member":"عضو فرناز"),date:item.created_at?new Date(item.created_at).toLocaleDateString(english?"en":"fa-IR"):"",pinned:!!preference.pinned});
    });
    renderSavedContactsSnapshot(snapshot);
    if(profilesLoaded){try{await window.FarnazLocalStore?.saveSnapshot(myId,"contacts",snapshot);}catch(cacheError){console.warn("Cached contacts save:",cacheError);}}
    // The account or a newer contacts refresh may have changed during the cache write.
    if(currentUser?.id!==myId||request!==savedContactsRequestNumber)return;
    setStatus("savedContactsStatus",snapshot.length?"":(english?"No saved Farnaz contacts yet.":"هنوز مخاطب عضو فرنازی ذخیره نشده است."));
    await refreshUnmatchedPhoneContacts();
    if(currentUser?.id!==myId||request!==savedContactsRequestNumber)return;
    return profilesLoaded;
  }catch(e){
    if(currentUser?.id!==myId||request!==savedContactsRequestNumber)return;
    console.error("Saved contacts:",e);
    setStatus("savedContactsStatus",(english?"Could not load saved contacts: ":"بارگذاری مخاطبان ناموفق بود: ")+e.message,true);
    await refreshUnmatchedPhoneContacts();
    return false;
  }
}
async function deletePhoneContact(contactRowId,button){
  if(!currentUser||!contactRowId)return;
  const userId=String(currentUser.id);
  if(!confirm(english?"Delete this saved phone contact?":"این مخاطب ذخیره‌شده حذف شود؟"))return;
  if(button)button.disabled=true;
  try{
    const {data:deletedRows,error}=await getClient().from("user_phone_contacts").delete().eq("id",contactRowId).eq("user_id",userId).select("id");
    if(error)throw error;
    if(!Array.isArray(deletedRows)||deletedRows.length!==1){
      throw new Error(english?"The contact was not deleted. It may already be removed or you may not have permission.":"مخاطب واقعاً حذف نشد؛ ممکن است قبلاً حذف شده باشد یا مجوز دسترسی کافی نباشد.");
    }
    if(String(currentUser?.id)!==userId)return;
    await refreshUnmatchedPhoneContacts();
    setStatus("phoneContactsImportStatus",english?"Contact deleted.":"مخاطب حذف شد.");
  }catch(error){
    if(String(currentUser?.id)!==userId)return;
    setStatus("phoneContactsImportStatus",(english?"Could not delete contact: ":"حذف مخاطب ناموفق بود: ")+error.message,true);
  }finally{if(button)button.disabled=false;}
}
async function addManualPhoneContact(event){
  event.preventDefault();
  if(!currentUser){openAuth();return;}
  const userId=String(currentUser.id),name=$("manualContactName").value.trim();
  const phone=normalizePhone($("manualContactPhone").value,$("manualContactCountry").value);
  const button=$("manualContactSaveButton");
  if(!name||name.length>120){setStatus("manualContactStatus",english?"Enter a contact name up to 120 characters.":"نام مخاطب را حداکثر در ۱۲۰ نویسه وارد کن.",true);return;}
  if(!/^\+[1-9]\d{7,14}$/.test(phone)){setStatus("manualContactStatus",english?"Enter a valid phone number.":"شماره موبایل معتبر وارد کن.",true);return;}
  button.disabled=true;setStatus("manualContactStatus",english?"Checking for duplicates…":"در حال بررسی تکراری نبودن مخاطب…");
  try{
    const client=getClient();
    const {data:phoneRows,error:phoneError}=await client.from("user_phone_contacts").select("phone").eq("user_id",userId).limit(5000);
    if(phoneError)throw phoneError;
    const {data:savedRows,error:savedRowsError}=await client.from("contacts").select("contact_user_id").eq("user_id",userId);
    if(savedRowsError)throw savedRowsError;
    const duplicateInPhoneBook=(phoneRows||[]).some(row=>normalizePhone(row.phone)===phone);
    const duplicateInSaved=[...($("savedContactsList")?.querySelectorAll(".saved-contact-row .list-item")||[])].some(row=>row.dataset.contactPhone===phone);
    const authPhones=[currentUser?.phone,currentUser?.user_metadata?.phone,currentUser?.user_metadata?.phone_number]
      .map(value=>normalizePhone(value)).filter(Boolean);
    let ownProfilePhone="";
    try{const ownProfile=await getContactProfile(userId);ownProfilePhone=normalizePhone(ownProfile?.phone||"");}
    catch(profileError){console.warn("Could not read own profile phone for self-contact check:",profileError);}
    if(authPhones.includes(phone)||ownProfilePhone===phone){
      setStatus("manualContactStatus",english?"This is the phone number on your own Farnaz profile. You cannot add yourself as a contact.":"این شماره متعلق به پروفایل خودت در فرناز است؛ نمی‌توانی خودت را به‌عنوان مخاطب اضافه کنی.",true);return;
    }
    let duplicateMatchedAccount=false;
    if(!duplicateInPhoneBook&&!duplicateInSaved){
      const lookup=await client.rpc("find_farnaz_user_by_phone",{search_phone:phone});
      if(lookup.error)throw lookup.error;
      const matches=lookup.data||[];
      if(matches.some(match=>String(match.user_id||match.id)===userId)){
        setStatus("manualContactStatus",english?"This number belongs to your own Farnaz account, so it cannot be added as a contact.":"این شماره به حساب خودت در فرناز متصل است؛ افزودن حساب خودت به مخاطبان ممکن نیست.",true);return;
      }
      duplicateMatchedAccount=matches.some(match=>(savedRows||[]).some(saved=>String(saved.contact_user_id)===String(match.user_id||match.id)));
    }
    if(duplicateInPhoneBook||duplicateInSaved||duplicateMatchedAccount){
      setStatus("manualContactStatus",english?"This phone number is already added or exists in your contact list.":"این شماره قبلاً اضافه شده یا در فهرست مخاطبان وجود دارد.",true);return;
    }
    if(String(currentUser?.id)!==userId)return;
    const {error}=await client.rpc("sync_farnaz_phone_contacts",{p_contacts:[{display_name:name,phones:[phone],primary_phone:phone}]});
    if(error)throw error;
    if(String(currentUser?.id)!==userId)return;
    $("manualContactName").value="";$("manualContactPhone").value="";
    await refreshSavedContacts();
    if(String(currentUser?.id)!==userId)return;
    await refreshUnmatchedPhoneContacts();
    setStatus("manualContactStatus",english?"Contact saved. If this number belongs to a Farnaz account, it will appear in Farnaz contacts.":"مخاطب ذخیره شد. اگر این شماره متعلق به حساب فرناز باشد، در فهرست مخاطبان فرناز نمایش داده می‌شود.");
  }catch(error){
    if(String(currentUser?.id)!==userId)return;
    console.error("Manual contact save:",error);
    setStatus("manualContactStatus",(english?"Could not save contact: ":"ذخیره مخاطب ناموفق بود: ")+error.message,true);
  }finally{button.disabled=false;}
}

function parseVCardContacts(text,countryCode){
  const normalized=String(text||"").replace(/\r\n/g,"\n").replace(/\r/g,"\n");
  const unfolded=normalized.replace(/\n[ \t]/g,"");
  const cards=unfolded.split(/BEGIN:VCARD/i).slice(1),results=[];
  for(const rawCard of cards){
    const body=rawCard.split(/END:VCARD/i)[0]||"",lines=body.split("\n");
    let name="";const phones=[];
    for(const line of lines){
      const colon=line.indexOf(":");if(colon<0)continue;
      const key=line.slice(0,colon).split(";")[0].split(".").pop().toUpperCase();
      let value=line.slice(colon+1).trim().replace(/^tel:/i,"");
      value=value.replace(/\\n/gi," ").replace(/\\,/g,",").replace(/\\;/g,";").replace(/\\\\/g,"\\");
      if(key==="FN"&&!name)name=value;
      if(key==="N"&&!name){const parts=value.split(";").map(part=>part.trim()).filter(Boolean);name=[parts[1],parts[0],parts.slice(2).join(" ")].filter(Boolean).join(" ");}
      if(key==="TEL"&&value){const phone=normalizePhone(value,countryCode);if(/^\+[1-9]\d{7,14}$/.test(phone)&&!phones.includes(phone))phones.push(phone);}
    }
    if(!name)name=english?"Phone contact":"مخاطب گوشی";
    if(phones.length)results.push({display_name:name.slice(0,120),phones,primary_phone:phones[0]});
  }
  return results;
}
async function syncSelectedPhoneContacts(contacts,button,expectedUserId=null){
  if(!currentUser)return;
  const myId=String(expectedUserId||currentUser.id);
  if(String(currentUser.id)!==myId)return;
  const seenPhones=new Set(),normalizedContacts=[];
  for(const contact of contacts||[]){
    const name=String(contact?.display_name||"").trim().slice(0,120)||(english?"Phone contact":"مخاطب گوشی");
    const incoming=Array.isArray(contact?.phones)?contact.phones:(contact?.phone?[contact.phone]:[]);
    const phones=[];
    for(const value of incoming){
      const phone=normalizePhone(value,$("phoneContactsCountry")?.value||"98");
      if(/^\+[1-9]\d{7,14}$/.test(phone)&&!seenPhones.has(phone)){seenPhones.add(phone);phones.push(phone);}
    }
    if(!phones.length)continue;
    const preferred=normalizePhone(contact.primary_phone||phones[0],$("phoneContactsCountry")?.value||"98");
    normalizedContacts.push({display_name:name,phones,primary_phone:phones.includes(preferred)?preferred:phones[0]});
  }
  if(!normalizedContacts.length)throw new Error(english?"No valid phone numbers were selected.":"از مخاطبان انتخاب‌شده شماره تلفن معتبری دریافت نشد.");
  const totalNumbers=normalizedContacts.reduce((sum,contact)=>sum+contact.phones.length,0);
  const {data,error}=await getClient().rpc("sync_farnaz_phone_contacts",{p_contacts:normalizedContacts});
  if(error)throw error;
  if(String(currentUser?.id)!==myId)return;
  const result=Array.isArray(data)?data[0]:(data||{});
  await refreshSavedContacts();
  if(String(currentUser?.id)!==myId)return;
  await refreshUnmatchedPhoneContacts();
  if(String(currentUser?.id)!==myId)return;
  const skippedSelf=Number(result.skipped_self||0);
  setStatus("phoneContactsImportStatus",english
    ?`Sync complete: ${result.processed??totalNumbers} numbers processed, ${result.matched??0} matched with Farnaz accounts, ${result.unmatched??0} not registered, ${skippedSelf} own number(s) skipped.`
    :`همگام‌سازی انجام شد: ${result.processed??totalNumbers} شماره پردازش شد؛ ${result.matched??0} شماره با حساب‌های فرناز تطبیق یافت، ${result.unmatched??0} شماره عضو نیست و ${skippedSelf} شماره متعلق به خودت نادیده گرفته شد.`);
}
async function syncPhoneContactsFromPicker(){
  const button=$("pickPhoneContactsButton");
  if(!currentUser){setStatus("phoneContactsImportStatus",english?"Sign in first.":"ابتدا وارد حساب فرناز شو.",true);return;}
  const myId=String(currentUser.id);
  if(!window.isSecureContext){setStatus("phoneContactsImportStatus",english?"Contact access requires a secure HTTPS connection.":"دسترسی به مخاطبان به اتصال امن HTTPS نیاز دارد.",true);return;}
  if(!navigator.contacts?.select){
    setStatus("phoneContactsImportStatus",english
      ?"Safari has not enabled Contact Picker API. Open iPhone Settings → Safari → Advanced → Feature Flags, enable Contact Picker API, fully close and reopen Safari, then return and tap this button again."
      :"قابلیت انتخاب مخاطب Safari هنوز فعال نیست. در آیفون برو به Settings ← Safari ← Advanced ← Feature Flags، گزینه Contact Picker API را روشن کن، Safari را کامل ببند و دوباره باز کن؛ سپس به فرناز برگرد و همین دکمه را بزن.",true);
    return;
  }
  button.disabled=true;
  setStatus("phoneContactsImportStatus",english?"Choose the contacts you want to share with Farnaz…":"مخاطبانی را که می‌خواهی با فرناز به اشتراک بگذاری انتخاب کن…");
  try{
    const picked=await navigator.contacts.select(["name","tel"],{multiple:true});
    if(String(currentUser?.id)!==myId)return;
    const contacts=[],country=$("phoneContactsCountry")?.value||"98";
    for(const item of picked||[]){
      const name=Array.isArray(item.name)?item.name[0]:item.name;
      const phones=[...new Set((Array.isArray(item.tel)?item.tel:[item.tel]).map(tel=>normalizePhone(tel,country)).filter(phone=>/^\+[1-9]\d{7,14}$/.test(phone)))];
      if(phones.length)contacts.push({display_name:String(name||"").trim().slice(0,120)||(english?"Phone contact":"مخاطب گوشی"),phones,primary_phone:phones[0]});
    }
    await syncSelectedPhoneContacts(contacts,button,myId);
  }catch(e){
    if(String(currentUser?.id)!==myId)return;
    if(e?.name==="AbortError"){setStatus("phoneContactsImportStatus",english?"Contact selection cancelled.":"انتخاب مخاطبان لغو شد.");return;}
    console.error("Phone contact picker:",e);
    setStatus("phoneContactsImportStatus",(english?"Could not sync selected contacts: ":"همگام‌سازی مخاطبان انتخاب‌شده ناموفق بود: ")+(e?.message||String(e)),true);
  }finally{button.disabled=false;}
}
async function handlePhoneContactsFile(event){
  const input=event?.target||$("phoneContactsFile"),file=input?.files?.[0];if(!file||!currentUser)return;
  const button=$("importPhoneContactsButton"),myId=String(currentUser.id);
  button.disabled=true;setStatus("phoneContactsImportStatus",english?"Reading VCF file…":"در حال خواندن فایل VCF…");
  try{
    if(file.size>15*1024*1024)throw new Error(english?"VCF file must be 15 MB or smaller.":"حجم فایل VCF باید حداکثر ۱۵ مگابایت باشد.");
    const fileText=await file.text();
    if(String(currentUser?.id)!==myId)return;
    const contacts=parseVCardContacts(fileText,$("phoneContactsCountry").value);
    if(!contacts.length)throw new Error(english?"No valid phone numbers were found in this VCF file.":"شماره تلفن معتبری در فایل VCF پیدا نشد.");
    await syncSelectedPhoneContacts(contacts,button,myId);
  }catch(e){
    if(String(currentUser?.id)!==myId)return;
    console.error("Phone contacts import:",e);
    setStatus("phoneContactsImportStatus",(english?"Could not sync contacts: ":"همگام‌سازی مخاطبان ناموفق بود: ")+e.message,true);
  }finally{button.disabled=false;if(input)input.value="";}
}
function initPhoneContactsImport(){
  const input=$("phoneContactsFile");if(input&&!input.dataset.bound){input.dataset.bound="1";input.addEventListener("change",handlePhoneContactsFile);}
}
let conversationListRequestNumber=0;
function renderConversationSnapshot(snapshot,myId){
  const list=$("conversationList");if(!list||!Array.isArray(snapshot))return;
  const visible=snapshot.filter(c=>conversationView==="archived"?!!c.pref?.archived:!c.pref?.archived)
    .sort((a,b)=>Number(!!b.pref?.pinned)-Number(!!a.pref?.pinned)||new Date(b.created_at)-new Date(a.created_at));
  list.replaceChildren();
  if(!visible.length){
    setStatus("inboxStatus",conversationView==="archived"?(english?"No archived conversations.":"گفتگوی آرشیوشده‌ای وجود ندارد."):(english?"No conversations yet. Start one from Contacts.":"هنوز گفتگویی نداری؛ از بخش مخاطبان گفتگوی جدید بساز."));
    return;
  }
  for(const c of visible){
    const p=c.profile||{},pref=c.pref||{};
    const name=pref.display_name||c.local_contact_name||p.display_name||(english?"Farnaz user":"مخاطب فرناز");
    const preview=(c.lastSender===myId?(english?"You: ":"شما: "):"")+(pref.pinned?"📌 ":"")+(pref.archived?"🗄 ":"")+c.lastMessage;
    const contact={user_id:c.user_id,display_name:name,profile_display_name:p.display_name||"",avatar_url:p.avatar_url||""};
    const card=document.createElement("div");card.className="conversation-card"+(pref.pinned?" pinned":"")+(pref.archived?" archived":"");
    card.dataset.searchName=String(pref.display_name||c.local_contact_name||"");
    const btn=makeContactButton(contact,preview,new Date(c.created_at).toLocaleString(english?"en":"fa-IR"));
    btn.addEventListener("contextmenu",e=>{e.preventDefault();showConversationActions(card,c.user_id);});
    let hold;btn.addEventListener("pointerdown",()=>{hold=setTimeout(()=>{btn.dataset.suppressOpen="1";showConversationActions(card,c.user_id);},550);});
    ["pointerup","pointercancel","pointerleave"].forEach(ev=>btn.addEventListener(ev,()=>clearTimeout(hold)));
    let sx=0;btn.addEventListener("touchstart",e=>{sx=e.changedTouches[0].clientX;},{passive:true});
    btn.addEventListener("touchend",e=>{if(Math.abs(e.changedTouches[0].clientX-sx)>65){btn.dataset.suppressOpen="1";showConversationActions(card,c.user_id);}},{passive:true});
    card.appendChild(btn);list.appendChild(card);
  }
  setStatus("inboxStatus","");
  applyConversationSearch();
}
async function refreshConversationList(){
  if(!currentUser)return;
  const request=++conversationListRequestNumber,myId=currentUser.id;
  const list=$("conversationList");if(!list)return;
  let cachedSnapshot=null;
  try{
    cachedSnapshot=await window.FarnazLocalStore?.getSnapshot(myId,"inbox");
    if(currentUser?.id===myId&&request===conversationListRequestNumber&&Array.isArray(cachedSnapshot)&&cachedSnapshot.length){
      conversationPrefs=new Map(cachedSnapshot.map(c=>[String(c.user_id),c.pref||{}]));
      renderConversationSnapshot(cachedSnapshot,myId);
      setStatus("inboxStatus",english?"Showing saved conversations while refreshing…":"نمایش گفتگوهای ذخیره‌شده؛ در حال همگام‌سازی…");
    }
  }catch(cacheError){console.warn("Cached inbox read:",cacheError);}
  let preferencesLoaded=true;
  try{
    const prefResult=await retryRead("conversation preferences",()=>getClient().from("conversation_preferences").select("*").eq("user_id",myId));
    if(currentUser?.id!==myId||request!==conversationListRequestNumber)return;
    conversationPrefs=new Map((prefResult.data||[]).map(p=>[String(p.contact_user_id),p]));
  }catch(prefError){
    // A failed preferences request may finish after logout or a newer refresh.
    if(currentUser?.id!==myId||request!==conversationListRequestNumber)return;
    preferencesLoaded=false;
    console.warn("Conversation preferences:",prefError);
    setConnectionBanner(english?"Some conversation settings could not load. Retrying…":"بخشی از تنظیمات گفتگو بارگذاری نشد؛ دوباره تلاش می‌کنیم.");
  }
  // Do not let a stale preferences read continue into the messages request or update guest UI.
  setStatus("inboxStatus",english?"Loading conversations...":"در حال بارگذاری گفتگوها...");
  try{
    const {data,error}=await retryRead("conversation list",()=>getClient().from("messages")
      .select("id,sender_id,receiver_id,body,created_at,message_type,attachment_name")
      .or("sender_id.eq."+myId+",receiver_id.eq."+myId)
      .order("created_at",{ascending:false}).limit(1000));
    if(currentUser?.id!==myId||request!==conversationListRequestNumber)return;
    if(error)throw error;
    const conversations=new Map();
    for(const m of data||[]){
      const id=String(m.sender_id===myId?m.receiver_id:m.sender_id||"");
      if(!id||id===myId||conversations.has(id))continue;
      const pref=prefFor(id);
      if(pref.hidden_at&&new Date(m.created_at)<=new Date(pref.hidden_at))continue;
      conversations.set(id,{user_id:id,lastMessage:m.body||((m.message_type||"text")==="image"?(english?"📷 Photo":"📷 عکس"):""),created_at:m.created_at,lastSender:m.sender_id,pref});
    }
    const entries=[...conversations.values()];
    let profilesById=new Map(),profilesLoaded=true;
    try{profilesById=await getContactProfiles(entries.map(c=>c.user_id));}catch(e){profilesLoaded=false;console.warn("Conversation contact profiles:",e);setConnectionBanner(english?"Some conversation profiles could not load. Retrying…":"اطلاعات بعضی مخاطبان گفتگو بارگذاری نشد؛ دوباره تلاش می‌کنیم.");}
    if(currentUser?.id!==myId||request!==conversationListRequestNumber)return;
    let importedPhoneNames=new Map();
    try{
      const phoneResult=await retryRead("conversation local contact names",()=>getClient().from("user_phone_contacts").select("display_name,matched_user_id").eq("user_id",myId).not("matched_user_id","is",null).limit(5000));
      for(const item of phoneResult.data||[]){
        const id=String(item.matched_user_id||"");
        if(id&&!importedPhoneNames.has(id)&&String(item.display_name||"").trim())importedPhoneNames.set(id,String(item.display_name).trim());
      }
    }catch(phoneNameError){console.warn("Conversation local contact names:",phoneNameError);}
    const snapshot=entries.map(c=>({...c,pref:prefFor(c.user_id),local_contact_name:String(prefFor(c.user_id).display_name||importedPhoneNames.get(String(c.user_id))||"").trim(),profile:profilesById.get(String(c.user_id))||{}}));
    renderConversationSnapshot(snapshot,myId);
    if(profilesLoaded){try{await window.FarnazLocalStore?.saveSnapshot(myId,"inbox",snapshot);}catch(cacheError){console.warn("Cached inbox save:",cacheError);}}
    // The visible inbox may be usable with cached data, but recovery is complete only
    // after server-side conversation preferences and participant profiles are confirmed.
    return preferencesLoaded&&profilesLoaded;
  }catch(e){
    console.error("Inbox load:",e);
    if(currentUser?.id!==myId||request!==conversationListRequestNumber)return;
    if(Array.isArray(cachedSnapshot)&&cachedSnapshot.length){
      renderConversationSnapshot(cachedSnapshot,myId);
      setStatus("inboxStatus",english?"Showing saved conversations; refresh failed.":"گفتگوهای ذخیره‌شده نمایش داده می‌شوند؛ به‌روزرسانی ناموفق بود.");
    }else setStatus("inboxStatus",(english?"Could not load conversations: ":"بارگذاری گفتگوها ناموفق بود: ")+e.message,true);
    return false;
  }
}

/* One viewport controller shared by private and group conversations. */
(function installChatKeyboardLayout(){
  const viewport=window.visualViewport;
  let keyboardWasOpen=false;
  let layoutObserver=null;
  function syncChatAnchors(){
    const privatePage=document.getElementById("chatPage");
    const spaceDetail=document.getElementById("spaceDetail");
    const header=document.querySelector("body.chat-mode #chatPage>.chat-header");
    const composer=document.querySelector("body.chat-mode #chatPage>#sendMessageForm");
    const page=privatePage;
    if(!page||!header||!composer)return;
    page.style.setProperty("--chat-header-height",Math.ceil(header.getBoundingClientRect().height||56)+"px");
    page.style.setProperty("--chat-composer-height",Math.ceil(composer.getBoundingClientRect().height||76)+"px");
    if(layoutObserver){layoutObserver.disconnect();layoutObserver=null;}
    if(typeof ResizeObserver==="function"){
      layoutObserver=new ResizeObserver(()=>{
        if(!page.isConnected)return;
        page.style.setProperty("--chat-header-height",Math.ceil(header.getBoundingClientRect().height||56)+"px");
        page.style.setProperty("--chat-composer-height",Math.ceil(composer.getBoundingClientRect().height||76)+"px");
      });
      layoutObserver.observe(header);layoutObserver.observe(composer);
    }
  }
  const isChatActive=()=>document.body.classList.contains("chat-mode")||
    document.body.classList.contains("spaces-chat-mode");
  const messageList=()=>document.getElementById("messageList");
  function syncViewport(){
    if(!isChatActive()){
      document.documentElement.style.removeProperty("--chat-viewport-height");
      document.documentElement.style.removeProperty("--chat-viewport-offset");
      document.body.classList.remove("keyboard-open");
      keyboardWasOpen=false;
      if(layoutObserver){layoutObserver.disconnect();layoutObserver=null;}
      return;
    }
    const height=Math.max(1,viewport?.height||window.innerHeight);
    // In iOS home-screen standalone mode, visualViewport.offsetTop can change
    // during keyboard focus/animation and drag the entire chat shell under the status bar.
    // Keep the shell anchored to the physical top; only its height follows the visual viewport.
    const offset=0;
    const keyboardOpen=!!viewport&&(window.innerHeight-height>120);
    document.documentElement.style.setProperty("--chat-viewport-height",height+"px");
    document.documentElement.style.setProperty("--chat-viewport-offset",offset+"px");
    syncChatAnchors();
    document.body.classList.toggle("keyboard-open",keyboardOpen);
    if(keyboardOpen&&!keyboardWasOpen){
      requestAnimationFrame(()=>{
        const list=messageList();
        if(list)list.scrollTop=list.scrollHeight;
      });
    }
    keyboardWasOpen=keyboardOpen;
  }
  function resyncAfterViewportTransition(){
    requestAnimationFrame(syncViewport);
    // iOS Safari and installed PWAs can publish the final visualViewport size
    // in stages during keyboard animation; remeasure without forcing a scroll.
    [80,180,320,500].forEach(delay=>setTimeout(syncViewport,delay));
  }
  document.addEventListener("focusin",event=>{
    if(event.target?.matches("#messageText,#spaceText"))resyncAfterViewportTransition();
  });
  document.addEventListener("focusout",event=>{
    if(!event.target?.matches("#messageText,#spaceText"))return;
    [160,320,500].forEach(delay=>setTimeout(()=>{
      if(!document.activeElement?.matches("#messageText,#spaceText"))syncViewport();
    },delay));
  });
  viewport?.addEventListener("resize",syncViewport);
  viewport?.addEventListener("scroll",syncViewport);
  window.addEventListener("resize",syncViewport);
  document.addEventListener("click",event=>{
    if(event.target.closest("#backToChats,#backSpaces,.nav-button"))requestAnimationFrame(syncViewport);
  });
  const originalNavigate=window.navigate;
  if(typeof originalNavigate==="function"&&!originalNavigate.__keyboardViewportWrapped){
    const wrapped=function(id){
      originalNavigate(id);
      if(id==="chatPage"||id==="spacesPage")requestAnimationFrame(syncViewport);
      else syncViewport();
    };
    wrapped.__keyboardViewportWrapped=true;
    window.navigate=wrapped;
  }
  requestAnimationFrame(syncViewport);
  
  // Keep email sign-up/sign-in wired to the active core script loaded by index.html.
  const authForm=$("authForm");
  if(authForm){
    authForm.addEventListener("submit",async event=>{
      event.preventDefault();
      const button=$("authSubmit"),email=$("authEmail").value.trim();
      const password=$("authPassword").value,name=$("authName").value.trim();
      const phone="";
      if(!button||button.disabled)return;
      button.disabled=true;
      const authStartedAt=performance.now();
      setStatus("authStatus",english?"Connecting to server…":"در حال اتصال به سرور…");
      const slowAuthTimer=setTimeout(()=>{
        if(button.disabled)setStatus("authStatus",english
          ?"The connection is taking longer than expected. Keep this page open…"
          :"اتصال بیشتر از حد معمول طول کشیده؛ صفحه را باز نگه دار…");
      },5000);
      try{
        const client=getClient();
        let result;
        if(authMode==="recovery"){
          result=await client.auth.updateUser({password});
          if(result.error)throw result.error;
          // Remove the one-time recovery marker only after Supabase accepts the new password.
          try{history.replaceState({},document.title,getAuthRedirectUrl());}catch(_){}
        }else if(authMode==="signup"){
          result=await client.auth.signUp({
            email,password,
            options:{
              emailRedirectTo:getAuthRedirectUrl(),
              data:{display_name:name}
            }
          });
          if(result.error)throw result.error;
          if(!result.data.session){
            setStatus("authStatus",english
              ?"Sign-up submitted. Confirm your email, then sign in."
              :"ثبت‌نام انجام شد. ایمیلت را تأیید کن و سپس وارد شو.");
            return;
          }
        }else{
          result=await client.auth.signInWithPassword({email,password});
          if(result.error)throw result.error;
        }
        console.info("Farnaz auth response time (ms):",Math.round(performance.now()-authStartedAt));
        if(!result.data.user)throw new Error("اطلاعات حساب دریافت نشد.");
        // Authentication succeeded: enter the app before loading optional profile/chat data.
        // A later conversation or realtime failure must not be reported as a failed login.
        const authenticatedUser=result.data.user;
        // Set the authenticated user before navigating. navigate() deliberately
        // opens the auth form when currentUser is empty; navigating first used to
        // reopen the form and erase the email/password immediately after login.
        currentUser=authenticatedUser;
        profileCompletionRequired=true;
        closeAuth();
        navigate("chatsPage",{refreshData:false});
        // Authentication has succeeded. Keep profile and inbox initialization
        // outside the authentication error path so they cannot undo a valid login.
        setStatus("authStatus","");
        setConnectionBanner(english?"Signed in. Loading your conversations…":"ورود موفق بود؛ در حال بارگذاری گفتگوها…");
        // Profile data is independent from authentication. Do not let a slow
        // profile query block realtime or other screens after successful sign-in.
        void showUser(authenticatedUser);
        try{
          await subscribeToMessages();
          // Reconcile inbox and contacts after auth and realtime setup. The
          // navigation-triggered refresh may have been superseded during startup.
          const initialDataResults=await Promise.allSettled([refreshConversationList(),refreshSavedContacts()]);
          const initialDataFailure=initialDataResults.find(result=>result.status==="rejected"||result.value===false);
          if(initialDataFailure)throw initialDataFailure.reason;
          setConnectionBanner("",false);
        }catch(connectionError){
          console.error("Post-login realtime initialization:",connectionError);
          setConnectionBanner(english
            ?"You are signed in, but live updates could not start. Farnaz will retry."
            :"ورود موفق است، اما اتصال زنده برقرار نشد؛ فرناز دوباره تلاش می‌کند.");
          scheduleReconnect();
        }
      }catch(error){
        console.error("Farnaz authentication error:",error);
        const message=String(error?.message||error||"Unknown error");
        const code=String(error?.code||"").toLowerCase();
        const status=Number(error?.status||error?.statusCode||0);
        const isCredentialsError=code==="invalid_credentials"||/invalid login credentials|invalid email or password/i.test(message);
        const isWeakPassword=code==="weak_password"||/password.*(weak|short)|weak password/i.test(message);
        const isNetwork=error?.name==="TypeError"||error?.name==="TimeoutError"||
          /failed to fetch|fetch failed|network|load failed|timeout|connection|did not respond|request could not reach|aborted/i.test(message);
        const safeMessage=isCredentialsError
          ?(english?"Email or password is incorrect. Check both and try again.":"ایمیل یا رمز عبور درست نیست؛ هر دو را بررسی کن و دوباره تلاش کن.")
          :isWeakPassword
            ?(english?"Choose a stronger password with at least 8 characters.":"رمز عبور قوی‌تری با حداقل ۸ کاراکتر انتخاب کن.")
            :isNetwork
              ?(english?"Could not complete the request to Supabase. Check your connection and retry.":"درخواست به سوپابیس کامل نشد؛ اتصال را بررسی کن و دوباره تلاش کن.")
              :(status===429
                ?(english?"Too many attempts. Wait a little and try again.":"تعداد تلاش‌ها زیاد بوده؛ کمی صبر کن و دوباره تلاش کن.")
                :(english?"The request could not be completed. Please check your details and try again.":"درخواست انجام نشد؛ اطلاعات را بررسی کن و دوباره تلاش کن."));
        const failureLabel=authMode==="recovery"
          ?(english?"Password update failed: ":"به‌روزرسانی رمز ناموفق بود: ")
          :(english?"Sign-up/sign-in failed: ":"ثبت‌نام یا ورود ناموفق بود: ");
        setStatus("authStatus",failureLabel+safeMessage,true);
      }finally{
        clearTimeout(slowAuthTimer);
        button.disabled=false;
      }
    });
  }
  // Restore the persisted Supabase session on app launch. Persisting a session is
  // not enough by itself: currentUser starts as null on every page reload.
  let sessionRestorePromise=null;
  let sessionRestoreNeedsRetry=false;
  async function restoreSavedSession(attempt=0){
    if(currentUser)return;
    if(sessionRestorePromise)return sessionRestorePromise;
    sessionRestorePromise=(async()=>{
      try{return await restoreSavedSessionAttempt(attempt);}
      finally{sessionRestorePromise=null;}
    })();
    return sessionRestorePromise;
  }
  async function restoreSavedSessionAttempt(attempt=0){
    // A single boot-time timeout must not permanently strand a valid local session
    // behind the guest screen. A manual sign-in takes precedence over this retry.
    if(currentUser)return;
    let client=null;
    try{
      client=getClient();
      // Keep this longer than the fetch wrapper's 15-second auth-request deadline.
      // A shorter outer timeout abandons a still-running refresh-token request; retrying
      // getSession concurrently can race token rotation when Safari is waking from sleep.
      const {data,error}=await withTimeout(client.auth.getSession(),18000,"saved session restore");
      if(error)throw error;
      // A user may finish manual sign-in while this boot-time read is pending.
      // Never let a late restore overwrite the newer authenticated identity.
      if(currentUser)return;
      const session=data?.session;
      if(!session?.user){
        sessionRestoreNeedsRetry=false;
        document.body.dataset.authState="guest";
        setConnectionBanner("",false);
        setStatus("profileStatus","");
        if(isAuthRecoveryCallback()){
          openLogin();
          setStatus("authStatus",english
            ?"This recovery link is invalid or expired. Request a new one."
            :"پیوند بازیابی نامعتبر یا منقضی شده است؛ دوباره درخواست بازیابی بده.",true);
        }else{
          // Guests land directly on the login/register screen; there is no welcome page.
          openSignup();
        }
        return;
      }
      sessionRestoreNeedsRetry=false;
      if(isAuthRecoveryCallback()){
        currentUser=session.user;
        profileCompletionRequired=true;
        document.body.dataset.authState="authenticated";
        authMode="recovery";
        openAuth();
        setAuthMode("recovery");
        setStatus("authStatus",english
          ?"Choose a new password to finish recovering your account."
          :"برای تکمیل بازیابی حساب، رمز عبور جدیدی انتخاب کن.");
        return;
      }
      currentUser=session.user;
      profileCompletionRequired=true;
      document.body.dataset.authState="authenticated";
      closeAuth();
      navigate("chatsPage",{refreshData:false});
      setConnectionBanner(english?"Restoring your session…":"در حال بازیابی نشست ورود…");
      // Profile loading is independent; it must not hold session restoration.
      void showUser(session.user);
      try{
        await subscribeToMessages();
        // Reconcile inbox and contacts after restoring the saved session.
        const initialDataResults=await Promise.allSettled([refreshConversationList(),refreshSavedContacts()]);
        const initialDataFailure=initialDataResults.find(result=>result.status==="rejected"||result.value===false);
        if(initialDataFailure)throw initialDataFailure.reason;
        setConnectionBanner("",false);
      }catch(connectionError){
        console.error("Restored-session initialization:",connectionError);
        setConnectionBanner(english
          ?"You are signed in, but some account data could not load. Check your connection; Farnaz will retry."
          :"نشست ورود بازیابی شد، اما بارگذاری بخشی از اطلاعات حساب ناموفق بود. اتصال را بررسی کن؛ فرناز دوباره تلاش می‌کند.");
        scheduleReconnect();
      }
    }catch(error){
      // A manual sign-in may have completed while getSession() was pending.
      // In that case this stale boot-time failure must not switch the UI back to guest.
      if(currentUser)return;
      // Retry transient startup failures before falling back to the guest screen.
      // getSession() can time out while Safari is waking a suspended PWA.
      const transientRestoreFailure=error?.name==="TimeoutError"||error?.name==="TypeError"||isTransientError(error);
      if(transientRestoreFailure&&attempt<2&&!currentUser){
        console.warn("Retrying saved-session restoration:",attempt+1);
        setConnectionBanner(english
          ?"Waking up your saved session… retrying connection."
          :"در حال بازیابی نشست ذخیره‌شده؛ اتصال دوباره بررسی می‌شود…");
        await recoveryDelay(700*(attempt+1));
        if(!currentUser)await restoreSavedSessionAttempt(attempt+1);
        return;
      }
      // Do not erase a potentially valid session on a transient network failure.
      // A later explicit sign-in can still use the existing credentials.
      sessionRestoreNeedsRetry=transientRestoreFailure;
      console.warn("Farnaz saved-session restore failed:",{
        name:error?.name||"Error",
        status:error?.status||error?.statusCode||null,
        code:error?.code||null,
        message:String(error?.message||error||"Unknown error")
      });
      document.body.dataset.authState="guest";
      setConnectionBanner(english
        ?"Farnaz could not restore your saved session. Check your connection and try signing in again."
        :"بازیابی نشست ورود کامل نشد. اتصال را بررسی کن و دوباره برای ورود تلاش کن.");
      // Keep the authentication screen available even when session restoration fails.
      openSignup();
      if(/refresh token.*(invalid|not found|expired)|invalid refresh token|session not found/i.test(String(error?.message||""))){
        try{if(client)await client.auth.signOut({scope:"local"});}catch(_){}
      }
    }
  }
  // The HTML loader calls this only after all required feature modules are ready.
  // This prevents the restored-session event from firing before spaces/calls listeners exist.
  let farnazBootStarted=false;
  window.FarnazBoot=()=>{
    if(farnazBootStarted)return;
    farnazBootStarted=true;
    void restoreSavedSession();
  };
  // Safari may suspend a standalone PWA while the network is unavailable.
  // If the bounded boot retries failed transiently, retry once the app is visible
  // or connectivity returns; share one in-flight restore to avoid overlapping reads.
  const retryDeferredSessionRestore=()=>{
    if(sessionRestoreNeedsRetry&&!currentUser&&document.visibilityState!=="hidden"){
      void restoreSavedSession();
    }
  };
  document.addEventListener("visibilitychange",retryDeferredSessionRestore);
  window.addEventListener("online",retryDeferredSessionRestore);
  window.addEventListener("offline",()=>{
    const message=english?"You are offline. Reconnect to continue.":"اتصال اینترنت قطع شده؛ برای ادامه دوباره متصل شو.";
    if(currentUser)setConnectionBanner(message);
    else setStatus("authStatus",message,true);
  });
  document.addEventListener("DOMContentLoaded",()=>{if(isChatActive())syncViewport();});
})();
