(function(){
"use strict";
const SPACE_SHARED_IDS=Object.freeze({backSpaces:"backToChats",spaceIcon:"chatAvatar",spaceName:"conversationTitle",spaceMeta:"chatSubtitle",spaceMessages:"messageList",spaceMessageStatus:"sendMessageStatus",spaceComposer:"sendMessageForm",spaceVoicePreview:"voicePreview",spaceDiscardVoice:"removeVoicePreview",spaceVoicePlayer:"voicePreviewPlayer",spaceVoiceSize:"voicePreviewSize",spaceText:"messageText",spaceAttachmentButton:"attachmentMenuButton",spaceAttachmentMenu:"attachmentMenu",spaceVoiceButton:"recordAudioButton",spaceSendButton:"sendMessageButton",spacePhotoFile:"photoFile",spaceCameraFile:"cameraFile",spaceAttachmentFile:"attachmentFile",spaceReplyPreview:"replyPreview"});
const q=id=>document.getElementById(SPACE_SHARED_IDS[id]||id);
let active=null,sub=null,spaces=[];let privateComposerDraft="",draftOwnerId=null;const spaceComposerDrafts=new Map();let spaceTypingTimer=null,spaceRemoteTypingTimer=null,spaceOpenToken=0,spaceRefreshToken=0;
const spacePinnedMessageIds=new Set();
let pendingSpaceSend=null;
const tr=(fa,en)=>typeof english!=="undefined"&&english?en:fa;
function build(){
 const app=document.querySelector(".app"),foot=q("footerText"),p=document.createElement("section");p.className="page";p.id="spacesPage";
 p.innerHTML='<div class="spaces-head"><div class="page-heading"><h2 id="spacesTitle">گروه‌ها و کانال‌ها</h2><p id="spacesIntro">گفت‌وگوهای جمعی و کانال‌های اطلاع‌رسانی</p></div><button class="space-primary" id="createSpaceBtn">＋ ایجاد</button></div><div class="spaces-tabs"><button class="active" data-filter="all">همه</button><button data-filter="group">گروه‌ها</button><button data-filter="channel">کانال‌ها</button><button data-filter="archived">آرشیو</button><button data-filter="hidden">پنهان‌شده‌ها</button></div><div class="spaces-actions"><input id="spaceInvite" type="text" placeholder="کد دعوت گروه یا کانال" style="flex:1;min-width:150px"><button class="space-secondary" id="joinSpaceBtn">عضویت با کد</button></div><div id="spaceList" class="list"></div><p id="spacesStatus" class="status muted-note" role="status"></p><div id="spaceDetail" hidden><div class="space-detail-head chat-header conversation-header"><button class="space-secondary conversation-back-button" id="backSpaces" aria-label="بازگشت" title="بازگشت"><span>← بازگشت</span></button><div class="space-title-wrap chat-heading"><span class="space-avatar avatar medium" id="spaceIcon">◎</span><div class="space-title-copy chat-person"><h3 id="spaceName"></h3><small id="spaceMeta" class="space-muted"></small></div></div><div class="space-call-actions call-actions"><button class="space-call-button call-button" type="button" onclick="startCall(&quot;audio&quot;)" aria-label="تماس صوتی" title="تماس صوتی"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.7a14 14 0 0 0 4.8 4.8L15 13l5 2v4c0 1.1-.9 2-2 2C9.2 21 3 14.8 3 6c0-1.1.9-2 2-2Z"></path></svg></button><button class="space-call-button call-button" type="button" onclick="startCall(&quot;video&quot;)" aria-label="تماس تصویری" title="تماس تصویری"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="12" height="12" rx="2"></rect><path d="m15 10 6-3v10l-6-3z"></path></svg></button></div></div><p id="spaceDescription" class="space-muted"></p><div id="spaceActions" class="space-actions"></div><div id="spaceMessages" class="space-messages conversation-message-list" role="log" aria-live="polite"></div><p id="spaceMessageStatus" class="status muted-note"></p><form id="spaceComposer" class="space-composer conversation-composer"><div class="composer-shell conversation-composer-shell"><div class="voice-preview space-voice-preview" id="spaceVoicePreview" hidden><div class="voice-preview-heading space-voice-preview-heading"><span>پیام صوتی آماده ارسال</span><button class="voice-preview-remove" type="button" id="spaceDiscardVoice" aria-label="حذف صدای ضبط‌شده">×</button></div><audio id="spaceVoicePlayer" controls preload="metadata"></audio><small class="voice-preview-size" id="spaceVoiceSize"></small></div><div class="send-row space-send-row"><textarea id="spaceText" maxlength="5000" rows="1" placeholder="پیامت را بنویس…" aria-label="متن پیام گروهی"></textarea></div><div class="composer-actions space-composer-actions"><div class="composer-left"><button class="composer-icon" id="spaceAttachmentButton" type="button" aria-label="افزودن پیوست" title="افزودن پیوست" aria-haspopup="menu" aria-expanded="false">＋</button><div class="attachment-menu space-attachment-menu" id="spaceAttachmentMenu" role="menu" aria-label="گزینه‌های پیوست" hidden><button type="button" class="attachment-option" data-space-attachment="photo" role="menuitem"><span class="attachment-option-icon">🖼</span><span>انتخاب عکس</span></button><button type="button" class="attachment-option" data-space-attachment="camera" role="menuitem"><span class="attachment-option-icon">📷</span><span>گرفتن عکس با دوربین</span></button><button type="button" class="attachment-option" data-space-attachment="file" role="menuitem"><span class="attachment-option-icon">📎</span><span>انتخاب فایل</span></button></div></div><div class="composer-right"><button class="composer-icon" id="spaceVoiceButton" type="button" aria-label="ضبط پیام صوتی" title="پیام صوتی">🎙</button><button class="composer-icon send" id="spaceSendButton" type="submit" aria-label="ارسال پیام" title="ارسال پیام">➤</button></div></div><input id="spacePhotoFile" type="file" accept="image/*" hidden><input id="spaceCameraFile" type="file" accept="image/*" capture="environment" hidden><input id="spaceAttachmentFile" type="file" hidden></div></form></div>'; const detail=p.querySelector("#spaceDetail");
 if(detail){const description=detail.querySelector("#spaceDescription"),actions=detail.querySelector("#spaceActions");detail.replaceChildren(...[description,actions].filter(Boolean));detail.classList.add("space-context-panel");const chatPage=q("chatPage"),anchor=chatPage?.querySelector("#selectionToolbar");if(chatPage)chatPage.insertBefore(detail,anchor||chatPage.firstChild);}
 if(foot&&foot.parentNode===app)app.insertBefore(p,foot);else app.appendChild(p);
 const nav=document.querySelector(".nav-inner");if(nav){let b=q("navSpacesBtn");if(!b){b=document.createElement("button");b.className="nav-button";b.id="navSpacesBtn";b.dataset.page="spacesPage";b.type="button";b.innerHTML='<span class="nav-icon">◎</span><span>گروه‌ها</span>';b.onclick=()=>navigate("spacesPage");}const contactsButton=nav.querySelector('[data-page="contactsPage"]');if(contactsButton)nav.insertBefore(b,contactsButton);else nav.appendChild(b);b.addEventListener("click",()=>{if(currentUser)refresh();});}
 const d=document.createElement("div");d.className="space-dialog";d.id="spaceCreateDialog";d.hidden=true;d.setAttribute("role","dialog");d.setAttribute("aria-modal","true");d.innerHTML='<div class="space-dialog-card"><button type="button" id="closeSpaceDialog" class="contact-search-close">×</button><h3>ایجاد گروه یا کانال</h3><form id="spaceCreateForm"><label for="spaceType">نوع</label><select id="spaceType"><option value="group">گروه</option><option value="channel">کانال</option></select><label for="spaceNewName">نام</label><input id="spaceNewName" type="text" maxlength="80" required><label for="spaceNewDesc">توضیحات</label><textarea id="spaceNewDesc" maxlength="500"></textarea><div id="spacePrivacyWrap" hidden><label for="spacePrivacy">دسترسی کانال</label><select id="spacePrivacy"><option value="public">عمومی</option><option value="private">خصوصی با کد دعوت</option></select></div><div id="spaceContactsWrap"><label>افزودن اعضای گروه</label><div id="spaceContacts" class="space-muted">در حال بارگذاری مخاطبین…</div></div><p class="space-muted">در گروه همه اعضا پیام می‌فرستند؛ در کانال فقط مدیران می‌توانند مطلب منتشر کنند.</p><div class="space-dialog-actions"><button type="button" id="cancelSpaceCreate" class="space-secondary">انصراف</button><button type="submit" id="saveSpaceCreate" class="space-primary">ایجاد</button></div><p id="spaceCreateStatus" class="status"></p></form></div>';document.body.appendChild(d);
 const m=document.createElement("div");m.className="space-dialog";m.id="spaceAddDialog";m.hidden=true;m.setAttribute("role","dialog");m.setAttribute("aria-modal","true");m.innerHTML='<div class="space-dialog-card"><button type="button" id="closeAddDialog" class="contact-search-close">×</button><h3>افزودن اعضا</h3><div id="spaceAddContacts"></div><div class="space-dialog-actions"><button id="cancelAddContacts" class="space-secondary" type="button">انصراف</button><button id="saveAddContacts" class="space-primary" type="button">افزودن انتخاب‌شده‌ها</button></div><p id="spaceAddStatus" class="status"></p></div>';document.body.appendChild(m);

 const info=document.createElement("div");info.className="space-dialog";info.id="spaceInfoDialog";info.hidden=true;info.setAttribute("role","dialog");info.setAttribute("aria-modal","true");info.innerHTML='<div class="space-dialog-card"><button type="button" id="closeSpaceInfo" class="space-info-back" aria-label="بازگشت"><span aria-hidden="true">←</span><span>بازگشت</span></button><h3 id="spaceInfoTitle">اطلاعات گروه</h3><div class="space-info-top"><div class="space-info-avatar" id="spaceInfoAvatar">👥</div><div class="space-info-top-copy"><strong id="spaceInfoName"></strong><div class="space-info-meta"><span id="spaceInfoMemberCount">در حال دریافت اعضا…</span><span class="space-info-meta-separator">·</span><span id="spaceInfoOnlineCount">در حال بررسی آنلاین‌ها…</span></div><p id="spaceInfoDescription"></p></div></div><div class="space-info-actions" id="spaceInfoActions"></div><div class="space-info-accordion"><button type="button" id="spaceShowMembers" class="space-info-section-button" aria-expanded="false"><span class="space-info-section-leading"><span class="space-info-section-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20v-1.5A4.5 4.5 0 0 1 7 14h4a4.5 4.5 0 0 1 4.5 4.5V20"/><path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.5a4.5 4.5 0 0 1 3.5 4.3V20"/></svg></span><span>اعضای گروه</span></span><span class="space-info-section-trailing"><span id="spaceMemberSummary" class="space-info-section-summary"></span><span class="space-info-section-chevron" aria-hidden="true">⌄</span></span></button><div id="spaceMembersAccordion" class="space-info-accordion-content" hidden><h4 id="spaceMemberHeading">اعضای گروه</h4><div id="spaceMemberList"></div></div><button type="button" id="spaceShowSettings" class="space-info-section-button" aria-expanded="false" hidden><span class="space-info-section-leading"><span class="space-info-section-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.5 2.6-1.7-.7a8 8 0 0 1-1.7 1l-.3 1.8h-3l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.7-1.5-2.6 1.4-1.1a7 7 0 0 1 0-2l-1.4-1.1 1.5-2.6 1.7.7a8 8 0 0 1 1.7-1l.3-1.8h3l.3 1.8a8 8 0 0 1 1.7 1l1.7-.7 1.5 2.6-1.4 1.1a7 7 0 0 1 0 2Z"/></svg></span><span>تنظیمات و دسترسی گروه</span></span><span class="space-info-section-chevron" aria-hidden="true">⌄</span></button><div id="spaceSettingsAccordion" class="space-info-accordion-content" hidden><section class="space-admin-settings" id="spaceAdminSettings" hidden><h4>تنظیمات اعضا و دسترسی‌ها</h4><label for="spaceMemberVisibility">نمایش فهرست اعضا</label><select id="spaceMemberVisibility"><option value="members">همه اعضای گروه</option><option value="managers">فقط مدیران</option></select><label class="space-setting-toggle"><input id="spaceMembersCanSend" type="checkbox"><span>اعضای عادی بتوانند پیام بفرستند</span></label><label class="space-setting-toggle"><input id="spaceMembersCanAdd" type="checkbox"><span>اعضای عادی بتوانند عضو اضافه کنند</span></label><label class="space-setting-toggle"><input id="spaceAllowReplies" type="checkbox"><span>پاسخ و گفتگو زیر پست‌های کانال فعال باشد</span></label><label class="space-setting-toggle"><input id="spaceAllowMedia" type="checkbox"><span>ارسال عکس و فایل مجاز باشد</span></label><label class="space-setting-toggle"><input id="spaceRequireApproval" type="checkbox"><span>پیام اعضا پیش از نمایش تأیید شود</span></label><label class="space-setting-toggle"><input id="spaceNotifyChanges" type="checkbox"><span>اعلان ورود و خروج اعضا فعال باشد</span></label><button type="button" class="space-primary" id="saveSpaceSettings">ذخیره تنظیمات</button><div id="pendingSpaceApprovals"></div><p id="spaceSettingsStatus" class="status" role="status"></p></section></div><p id="spaceInfoStatus" class="status" role="status"></p></div>';document.body.appendChild(info);
 const invite=document.createElement("div");invite.className="space-dialog";invite.id="spaceInviteDialog";invite.hidden=true;invite.setAttribute("role","dialog");invite.setAttribute("aria-modal","true");invite.innerHTML='<div class="space-dialog-card"><button type="button" id="closeSpaceInvite" class="contact-search-close" aria-label="بستن">×</button><h3 id="spaceInviteTitle">لینک و کد دعوت</h3><p id="spaceInviteHelp" class="space-muted">این لینک یا کد را فقط با افرادی که می‌خواهی عضو شوند به اشتراک بگذار.</p><label for="spaceInviteCodeDisplay">کد دعوت</label><div class="space-invite-copy-row" style="display:flex;align-items:center;gap:8px;width:100%"><input id="spaceInviteCodeDisplay" type="text" readonly dir="ltr" aria-label="کد دعوت" style="flex:1;min-width:0;text-align:center;letter-spacing:1px;font-weight:700"><button type="button" id="copySpaceInviteCode" class="space-secondary">کپی کد</button></div><label for="spaceInviteLinkDisplay" style="display:block;margin-top:14px">لینک دعوت</label><div class="space-invite-copy-row" style="display:flex;align-items:center;gap:8px;width:100%"><input id="spaceInviteLinkDisplay" type="text" readonly dir="ltr" aria-label="لینک دعوت" style="flex:1;min-width:0;font-size:12px"><button type="button" id="copySpaceInviteLink" class="space-primary">کپی لینک</button></div><button type="button" id="regenerateSpaceInvite" class="space-secondary" style="width:100%;margin-top:14px">لغو لینک قبلی و ساخت دعوت جدید</button><p id="spaceInviteStatus" class="status" role="status"></p></div>';document.body.appendChild(invite);
 const edit=document.createElement("div");edit.className="space-dialog";edit.id="spaceEditDialog";edit.hidden=true;edit.setAttribute("role","dialog");edit.setAttribute("aria-modal","true");edit.innerHTML='<div class="space-dialog-card"><button type="button" id="closeSpaceEdit" class="contact-search-close" aria-label="بستن">×</button><h3 id="spaceEditTitle">ویرایش اطلاعات گروه</h3><form id="spaceEditForm"><label for="spaceEditName">نام گروه</label><input id="spaceEditName" type="text" maxlength="80" required><label for="spaceEditDescription">توضیحات</label><textarea id="spaceEditDescription" maxlength="500"></textarea><div class="space-edit-photo"><label for="spaceEditPhoto">عکس گروه</label><input id="spaceEditPhoto" type="file" accept="image/*"></div><p class="space-muted">عکس انتخابی برای نمایش گروه استفاده می‌شود. اطلاعات خصوصی اعضا نمایش داده نمی‌شود.</p><div class="space-dialog-actions"><button type="button" id="cancelSpaceEdit" class="space-secondary">انصراف</button><button type="submit" id="saveSpaceEdit" class="space-primary">ذخیره</button></div><p id="spaceEditStatus" class="status" role="status"></p></form></div>';document.body.appendChild(edit);
 const crop=document.createElement("div");crop.id="spaceCropDialog";crop.hidden=true;crop.setAttribute("role","dialog");crop.setAttribute("aria-modal","true");crop.innerHTML='<div class="space-crop-card"><h3 id="spaceCropTitle">تنظیم کادر عکس</h3><p id="spaceCropHelp">عکس را بکش تا قسمت دلخواه داخل دایره قرار بگیرد.</p><div id="spaceCropViewport"><img id="spaceCropImage" alt="پیش‌نمایش برش عکس"></div><label id="spaceCropZoomLabel" for="spaceCropZoom">بزرگ‌نمایی</label><input id="spaceCropZoom" type="range" min="1" max="3" step=".01" value="1"><div class="space-crop-actions"><button type="button" id="spaceCropCancel" class="space-secondary">انصراف</button><button type="button" id="spaceCropConfirm" class="space-primary">تأیید کادر</button></div></div>';document.body.appendChild(crop);

}
async function contacts(containerId){
 const box=q(containerId);if(!box)return;
 if(!currentUser){box.textContent=tr("ابتدا وارد حساب شو.","Sign in first.");return;}
 const myId=String(currentUser.id),request=String(Number(box.dataset.loadRequest||0)+1);
 box.dataset.loadRequest=request;
 box.textContent=tr("در حال بارگذاری…","Loading…");
 const isCurrent=()=>String(currentUser?.id||"")===myId&&box.dataset.loadRequest===request;
 try{
  const {data,error}=await getClient().from("contacts").select("contact_user_id").eq("user_id",myId);
  if(!isCurrent())return;
  if(error)throw error;
  const rows=data||[];
  if(!rows.length){box.textContent=tr("مخاطب ذخیره‌شده‌ای نداری؛ ابتدا از بخش مخاطبین افراد را اضافه کن.","No saved contacts. Add contacts from Contacts first.");return;}
  const profiles=await getContactProfiles(rows.map(row=>row.contact_user_id));
  if(!isCurrent())return;
  const fragment=document.createDocumentFragment();
  for(const row of rows){
   const prof=profiles.get(String(row.contact_user_id))||{};
   const label=document.createElement("label");label.className="space-contact";
   const cb=document.createElement("input");cb.type="checkbox";cb.value=row.contact_user_id;
   const name=document.createElement("span");name.textContent=prof.display_name||tr("کاربر فرناز","Farnaz user");
   label.append(cb,name);fragment.appendChild(label);
  }
  box.replaceChildren(fragment);
 }catch(e){
  if(!isCurrent())return;
  console.warn("Space contact picker:",e);
  box.textContent=tr("خطا در دریافت مخاطبین: ","Could not load contacts: ")+(e?.message||String(e));
 }
}
function selected(box){return [...(q(box)?.querySelectorAll('input[type="checkbox"]:checked')||[])].map(x=>x.value).filter(x=>x!==currentUser?.id);}
function syncType(){const g=q("spaceType").value==="group";q("spacePrivacyWrap").hidden=g;q("spaceContactsWrap").hidden=!g;}
async function create(event){
 event.preventDefault();
 const btn=q("saveSpaceCreate");
 if(btn.disabled)return;
 btn.disabled=true;
 q("spaceCreateStatus").textContent="";
 let memberWarning="";
 try{
  const {data:{user:authUser},error:authError}=await getClient().auth.getUser();
  if(authError)throw authError;
  if(!authUser)throw Error(tr("نشست ورود معتبر نیست؛ خارج شو و دوباره وارد شو.","No valid login session. Sign out and sign in again."));
  if(currentUser?.id!==authUser.id)throw Error(tr("نشست کاربر تازه‌سازی نشده؛ صفحه را تازه کن و دوباره وارد شو.","The user session is out of sync. Refresh and sign in again."));
  const type=q("spaceType").value;
  const name=q("spaceNewName").value.trim();
  const description=q("spaceNewDesc").value.trim();
  const is_public=type==="channel"&&q("spacePrivacy").value==="public";
  if(!name)throw Error(tr("نام را وارد کن.","Enter a name."));
  const invite_code=crypto.randomUUID().replace(/-/g,"").slice(0,16).toUpperCase();
  const {data:s,error}=await getClient().from("spaces").insert({type,name,description,is_public,created_by:authUser.id,invite_code}).select("*").single();
  if(error)throw error;
  const {error:ownerError}=await getClient().from("space_members").insert({space_id:s.id,user_id:authUser.id,role:"owner"});
  if(ownerError){
   q("spaceCreateStatus").textContent=tr("فضا ساخته شد، اما ثبت مالکیت کامل نشد. شناسه فضا: ","The space was created, but owner membership could not be recorded. Space ID: ")+s.id+" · "+ownerError.message;
   throw ownerError;
  }
  if(type==="group"){
   const ids=selected("spaceContacts");
   if(ids.length){
    const {error:membersError}=await getClient().from("space_members").insert(ids.map(user_id=>({space_id:s.id,user_id,role:"member"})));
    if(membersError)memberWarning=tr("گروه ساخته شد، اما افزودن اعضای انتخاب‌شده کامل نشد. از گزینه «افزودن اعضا» داخل گروه دوباره تلاش کن. ","The group was created, but adding selected members failed. Use Add members inside the group to retry. ")+membersError.message;
   }
  }
  q("spaceCreateDialog").hidden=true;
  await refresh();
  await open(s.id);
  if(memberWarning)q("spaceMessageStatus").textContent=memberWarning;
 }catch(e){
  if(!q("spaceCreateStatus").textContent)q("spaceCreateStatus").textContent=tr("ایجاد ناموفق بود: ","Could not create: ")+(e?.message||String(e));
 }finally{
  btn.disabled=false;
 }
}
function spaceMuteStorageKey(){return "farnaz-muted-spaces:"+String(currentUser?.id||"anonymous");}
function spaceListStorageKey(kind){return "farnaz-"+kind+"-spaces:"+String(currentUser?.id||"anonymous");}
function getSpaceSet(kind){try{const v=JSON.parse(localStorage.getItem(spaceListStorageKey(kind))||"[]");return new Set(Array.isArray(v)?v.map(String):[]);}catch(e){return new Set();}}
function setSpaceFlag(kind,id,on){const ids=getSpaceSet(kind);if(on)ids.add(String(id));else ids.delete(String(id));try{localStorage.setItem(spaceListStorageKey(kind),JSON.stringify([...ids]));return true;}catch(e){return false;}}
function isSpaceArchived(id){return getSpaceSet("archived").has(String(id));}
function isSpaceHidden(id){return getSpaceSet("hidden").has(String(id));}
function isSpacePinned(id){return getSpaceSet("pinned").has(String(id));}
function getMutedSpaceIds(){try{const v=JSON.parse(localStorage.getItem(spaceMuteStorageKey())||"[]");return new Set(Array.isArray(v)?v.map(String):[]);}catch(e){return new Set();}}
function isSpaceMuted(id){return getMutedSpaceIds().has(String(id));}
function setSpaceMuted(id,muted){const ids=getMutedSpaceIds();if(muted)ids.add(String(id));else ids.delete(String(id));try{localStorage.setItem(spaceMuteStorageKey(),JSON.stringify([...ids]));return true;}catch(e){return false;}}
function closeSpaceSwipeActions(except){q("spaceList").querySelectorAll(".space-row-shell.swiped").forEach(el=>{if(el!==except)el.classList.remove("swiped");});}
function buildSpaceSwipeActions(space,role,shell,card){
 const panel=document.createElement("div");panel.className="space-card-actions";panel.setAttribute("aria-label",tr("گزینه‌های گروه یا کانال","Group or channel actions"));
 const addAction=(label,fn,disabled=false)=>{const b=document.createElement("button");b.type="button";b.className="space-swipe-action";b.textContent=label;b.disabled=disabled;b.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();fn(b);});panel.appendChild(b);return b;};
 const muted=isSpaceMuted(space.id),hidden=isSpaceHidden(space.id);
 if(hidden)addAction(tr("↩ بازگردانی گفتگو","↩ Restore chat"),()=>{if(!setSpaceFlag("hidden",space.id,false)){q("spacesStatus").textContent=tr("بازگردانی گفتگو ممکن نشد.","Could not restore chat.");return;}refresh();});
 else addAction(tr("حذف گفتگو","Delete chat"),()=>{if(!window.confirm(tr("گفتگو از فهرست شما پنهان شود؟ عضویت شما در گروه یا کانال باقی می‌ماند.","Hide this chat from your list? You will remain a member of the group or channel.")))return;if(!setSpaceFlag("hidden",space.id,true)){q("spacesStatus").textContent=tr("حذف گفتگو ممکن نشد.","Could not hide chat.");return;}refresh();});
 if(role)addAction(muted?tr("🔔 خارج از سایلنت","🔔 Unmute"):tr("🔕 سایلنت","🔕 Mute"),()=>{if(!setSpaceMuted(space.id,!muted)){q("spacesStatus").textContent=tr("ذخیره تنظیم سایلنت ممکن نشد.","Could not save mute setting.");return;}refresh();});
 const pinned=isSpacePinned(space.id);
 addAction(pinned?tr("📌 برداشتن پین","📌 Unpin"):tr("📌 پین","📌 Pin"),()=>{if(!setSpaceFlag("pinned",space.id,!pinned)){q("spacesStatus").textContent=tr("ذخیره پین ممکن نشد.","Could not save pin.");return;}refresh();});
 const archived=isSpaceArchived(space.id);
 addAction(archived?tr("📂 بازگردانی","📂 Unarchive"):tr("🗃️ آرشیو","🗃️ Archive"),()=>{if(!setSpaceFlag("archived",space.id,!archived)){q("spacesStatus").textContent=tr("ذخیره آرشیو ممکن نشد.","Could not save archive.");return;}refresh();});
 if(role){
  const leave=addAction(tr("خروج","Leave"),async button=>{if(role==="owner"){q("spacesStatus").textContent=tr("مالک ابتدا باید مالکیت را منتقل کند یا فضا را حذف کند.","Owners must transfer ownership or delete the space first.");return;}if(!window.confirm(tr("از «"+space.name+"» خارج می‌شوی؟","Leave “"+space.name+"”?")))return;button.disabled=true;try{const {error}=await getClient().from("space_members").delete().eq("space_id",space.id).eq("user_id",currentUser.id);if(error)throw error;setSpaceMuted(space.id,false);setSpaceFlag("archived",space.id,false);setSpaceFlag("pinned",space.id,false);await refresh();q("spacesStatus").textContent=tr("از فضا خارج شدی.","You left the space.");}catch(e){q("spacesStatus").textContent=tr("خروج ناموفق بود: ","Could not leave: ")+(e?.message||String(e));button.disabled=false;}});
  if(role==="owner"){leave.disabled=true;leave.title=tr("مالک ابتدا باید مالکیت را منتقل کند یا فضا را حذف کند.","Owners must transfer ownership or delete the space first.");}
 }else if(!(space.type==="channel"&&space.is_public)){addAction(tr("عضویت لازم است","Join first"),()=>{},true);}
 shell.appendChild(panel);
 let startX=0,startY=0,moved=false;
 card.addEventListener("touchstart",e=>{const t=e.touches&&e.touches[0];if(!t)return;startX=t.clientX;startY=t.clientY;moved=false;},{passive:true});
 card.addEventListener("touchmove",e=>{const t=e.touches&&e.touches[0];if(!t)return;if(Math.abs(t.clientX-startX)>10&&Math.abs(t.clientX-startX)>Math.abs(t.clientY-startY))moved=true;},{passive:true});
 card.addEventListener("touchend",e=>{const t=e.changedTouches&&e.changedTouches[0];if(!t||!moved)return;const dx=t.clientX-startX;if(dx < -45){closeSpaceSwipeActions(shell);shell.classList.add("swiped");}else if(dx>45){shell.classList.remove("swiped");}},{passive:true});
 card.addEventListener("click",()=>{if(!shell.classList.contains("swiped"))open(space.id);});
}
async function refresh(){
 if(!currentUser)return;if(active&&q("spaceDetail")&&!q("spaceDetail").hidden)return;
 const myId=String(currentUser.id),request=++spaceRefreshToken;
 q("spacesStatus").textContent=tr("در حال بارگذاری…","Loading…");
 let cached=null;
 try{cached=await window.FarnazLocalStore?.getSnapshot(myId,"spaces");}catch(cacheError){console.warn("Cached spaces read:",cacheError);}
 if(String(currentUser?.id||"")!==myId||request!==spaceRefreshToken)return;
 if(cached&&Array.isArray(cached.spaces)){
  spaces=cached.spaces;
  const cachedRoles=new Map((cached.memberships||[]).map(x=>[String(x.space_id),x.role]));
  renderSpacesList(spaces,cachedRoles,true);
 }
 try{
  const {data,error}=await withTimeout(getClient().from("spaces").select("*").order("created_at",{ascending:false}).limit(200),9000,"فهرست گروه‌ها و کانال‌ها");
  if(error)throw error;
  if(String(currentUser?.id||"")!==myId||request!==spaceRefreshToken)return;
  const nextSpaces=data||[];
  const {data:mem,error:memberError}=await withTimeout(getClient().from("space_members").select("space_id,role").eq("user_id",myId),9000,"عضویت‌های گروه‌ها");
  if(memberError)throw memberError;
  if(String(currentUser?.id||"")!==myId||request!==spaceRefreshToken)return;
  const memberships=mem||[];
  try{await window.FarnazLocalStore?.saveSnapshot(myId,"spaces",{spaces:nextSpaces,memberships});}catch(cacheError){console.warn("Cached spaces save:",cacheError);}
  if(String(currentUser?.id||"")!==myId||request!==spaceRefreshToken)return;
  spaces=nextSpaces;
  renderSpacesList(spaces,new Map(memberships.map(x=>[String(x.space_id),x.role])),false);
 }catch(e){
  if(String(currentUser?.id||"")!==myId||request!==spaceRefreshToken)return;
  if(cached&&Array.isArray(cached.spaces))q("spacesStatus").textContent=tr("گروه‌ها و کانال‌های ذخیره‌شده نمایش داده می‌شوند؛ همگام‌سازی انجام نشد.","Showing saved groups and channels; refresh failed.");
  else q("spacesStatus").textContent=tr("بارگذاری ناموفق بود: ","Could not load: ")+e.message;
 }
}
function renderSpacesList(spaceRows,mm,fromCache){
 const f=document.querySelector("[data-filter].active")?.dataset.filter||"all";const archivedIds=getSpaceSet("archived"),pinnedIds=getSpaceSet("pinned"),hiddenIds=getSpaceSet("hidden");let rows=(spaceRows||[]).filter(s=>f==="hidden"?hiddenIds.has(String(s.id)):f==="archived"?archivedIds.has(String(s.id))&&!hiddenIds.has(String(s.id)):!archivedIds.has(String(s.id))&&!hiddenIds.has(String(s.id))&&(f==="all"||s.type===f));rows.sort((a,b)=>(pinnedIds.has(String(b.id))?1:0)-(pinnedIds.has(String(a.id))?1:0));q("spaceList").replaceChildren();
 if(!rows.length){const e=document.createElement("div");e.className="space-empty";e.textContent=f==="archived"?tr("آرشیو خالی است.","Archive is empty."):f==="hidden"?tr("گفتگوی پنهان‌شده‌ای نداری.","No hidden chats."):tr("هنوز گروه یا کانالی نداری؛ از دکمه ایجاد شروع کن.","No groups or channels yet. Create one to get started.");q("spaceList").appendChild(e);}
 for(const s of rows){
 const role=mm.get(s.id)||null,muted=isSpaceMuted(s.id),pinned=isSpacePinned(s.id),archived=isSpaceArchived(s.id);
 const shell=document.createElement("div");shell.className="space-row-shell";
 const b=document.createElement("div");b.className="space-card";b.style.cursor="pointer";b.setAttribute("role","group");
 const i=document.createElement("span");i.className="space-avatar";renderSpaceAvatar(i,s.avatar_url,s.type==="group"?"👥":"📣",true);
 const copy=document.createElement("span");copy.className="space-copy";
 const n=document.createElement("strong");n.textContent=(pinned?"📌 ":"")+s.name;n.title=tr("برای باز کردن، به چپ بکش تا گزینه‌ها را ببینی","Swipe left to reveal actions; tap to open");
 const sm=document.createElement("small");sm.textContent=(s.type==="group"?tr("گروه","Group"):s.is_public?tr("کانال عمومی","Public channel"):tr("کانال خصوصی","Private channel"))+" · "+(role?tr("عضو","Joined"):s.type==="channel"&&s.is_public?tr("برای عضویت باز کن","Open to join"):tr("خصوصی","Private"))+(muted?" · 🔕 "+tr("سایلنت","Muted"):"")+(archived?" · 🗃️ "+tr("آرشیوشده","Archived"):"");
 copy.append(n,sm);const swipeHint=document.createElement("span");swipeHint.className="space-swipe-hint";swipeHint.textContent="←";swipeHint.setAttribute("aria-hidden","true");b.append(i,copy,swipeHint);shell.appendChild(b);buildSpaceSwipeActions(s,role,shell,b);q("spaceList").appendChild(shell);
}
  q("spacesStatus").textContent="";
}
async function open(id){
 if(!currentUser)return;
 const myId=String(currentUser.id),token=++spaceOpenToken;
 const isCurrent=()=>String(currentUser?.id||"")===myId&&token===spaceOpenToken;
 try{
  let s,cachedSpace=false,cachedSpacesSnapshot=null;
  try{const latest=await withTimeout(getClient().from("spaces").select("*").eq("id",id).single(),8000,"اطلاعات گروه یا کانال");if(latest.error)throw latest.error;if(!isCurrent())return;s=latest.data;}
  catch(fetchError){
   if(!isCurrent())return;
   cachedSpacesSnapshot=await window.FarnazLocalStore?.getSnapshot(myId,"spaces").catch(()=>null);
   if(!isCurrent())return;
   s=cachedSpacesSnapshot?.spaces?.find(item=>String(item.id)===String(id));
   if(!s)throw fetchError;
   cachedSpace=true;
  }
  if(!isCurrent())return;
  if(active)spaceComposerDrafts.set(String(active.id),q("spaceText").value);else if(window.FarnazConversationMode!=="space")privateComposerDraft=q("spaceText").value;
  if(String(active?.id||"")!==String(s.id))cancelSpaceReply();
  active=s;spaces=spaces.map(x=>x.id===s.id?s:x);window.FarnazConversationMode="space";window.FarnazConversationBack=back;window.FarnazOpenSpaceInfo=openSpaceInfo;q("spaceText").value=spaceComposerDrafts.get(String(s.id))||"";
  document.querySelector(".app")?.classList.add("spaces-chat-mode");document.body.classList.add("spaces-chat-mode");document.querySelector("#chatPage .space-call-actions")?.setAttribute("hidden","");
  q("bottomNav")?.classList.remove("visible");q("spaceList").hidden=true;document.querySelector(".spaces-head").hidden=true;document.querySelector(".spaces-tabs").hidden=true;document.querySelector(".spaces-actions").hidden=true;q("spacesStatus").hidden=true;q("spaceDetail").hidden=false;if(typeof navigate==="function")navigate("chatPage");
 q("spaceName").textContent=s.name;if(["group","channel"].includes(s.type)){q("spaceName").setAttribute("role","button");q("spaceName").tabIndex=0;q("spaceName").setAttribute("aria-label",s.type==="channel"?tr("باز کردن اطلاعات کانال","Open channel information"):tr("باز کردن اطلاعات گروه","Open group information"));q("spaceName").style.cursor="pointer";}else{q("spaceName").removeAttribute("role");q("spaceName").removeAttribute("tabindex");q("spaceName").removeAttribute("aria-label");q("spaceName").style.cursor="default";}renderSpaceAvatar(q("spaceIcon"),s.avatar_url,s.type==="group"?"👥":"📣",true);q("spaceIcon").style.cursor=["group","channel"].includes(s.type)?"pointer":"default";q("spaceDescription").textContent=s.description||"";q("spaceDescription").hidden=!q("spaceDescription").textContent.trim();
 let membership=null;
 try{const result=await withTimeout(getClient().from("space_members").select("role").eq("space_id",s.id).eq("user_id",myId).maybeSingle(),7000,"عضویت در گروه یا کانال");if(result.error)throw result.error;if(!isCurrent())return;membership=result.data;}
 catch(membershipError){
   if(!isCurrent())return;
   if(!cachedSpace)throw membershipError;
  membership=(cachedSpacesSnapshot?.memberships||[]).find(item=>String(item.space_id)===String(s.id))||null;
  q("spaceMessageStatus").textContent=tr("نمایش اطلاعات ذخیره‌شده؛ بعضی قابلیت‌ها تا اتصال اینترنت در دسترس نیستند.","Showing saved details; some features need an internet connection.");
 }
 const joined=!!membership,manager=membership&&["owner","admin"].includes(membership.role);
 q("spaceMeta").textContent=(s.type==="group"?tr("گروه","Group"):s.is_public?tr("کانال عمومی","Public channel"):tr("کانال خصوصی","Private channel"))+(membership?" · "+(membership.role==="owner"?tr("سازنده","Owner"):membership.role==="admin"?tr("مدیر","Admin"):tr("عضو","Member")):"");if(["group","channel"].includes(s.type)){q("spaceMeta").setAttribute("role","button");q("spaceMeta").tabIndex=0;q("spaceMeta").setAttribute("aria-label",s.type==="channel"?tr("باز کردن اطلاعات کانال","Open channel information"):tr("باز کردن اطلاعات گروه","Open group information"));q("spaceMeta").style.cursor="pointer";}else{q("spaceMeta").removeAttribute("role");q("spaceMeta").removeAttribute("tabindex");q("spaceMeta").removeAttribute("aria-label");q("spaceMeta").style.cursor="default";}
 const acts=q("spaceActions");acts.replaceChildren();
 if(s.type==="channel"&&s.is_public&&!joined){const b=document.createElement("button");b.className="space-primary";b.textContent=tr("عضویت در کانال","Join channel");b.onclick=async()=>{const r=await getClient().from("space_members").insert({space_id:s.id,user_id:currentUser.id,role:"member"});if(r.error)q("spaceMessageStatus").textContent=r.error.message;else{await open(s.id);refresh();}};acts.appendChild(b);}
 if(s.type==="channel"&&!s.is_public&&manager&&s.invite_code){const span=document.createElement("span");span.className="space-muted space-code";span.textContent=tr("کد دعوت: ","Invite code: ")+s.invite_code;acts.appendChild(span);const b=document.createElement("button");b.className="space-secondary";b.textContent=tr("کپی کد","Copy code");b.onclick=()=>navigator.clipboard.writeText(s.invite_code).then(()=>q("spaceMessageStatus").textContent=tr("کد کپی شد.","Invite code copied.")).catch(()=>q("spaceMessageStatus").textContent=s.invite_code);acts.appendChild(b);}
 acts.hidden=acts.childElementCount===0;q("spaceDetail").hidden=!q("spaceDescription").textContent.trim()&&acts.childElementCount===0;
 q("spaceComposer").hidden=!(s.type==="group"?(joined&&(s.members_can_send_messages!==false||manager)):!!manager);if(s.allow_media===false){q("spaceAttachmentButton").hidden=true;q("spaceVoiceButton").hidden=true;}else{q("spaceAttachmentButton").hidden=false;q("spaceVoiceButton").hidden=false;}q("spaceMessageStatus").textContent=!joined&&s.type==="channel"?tr("برای دنبال‌کردن کانال عضو شو؛ فقط مدیران می‌توانند پیام منتشر کنند.","Join to follow this channel. Only admins can publish posts."):"";
 await loadMessages(s.id);if(!isCurrent())return;
  if(sub){const previous=sub;sub=null;await getClient().removeChannel(previous);if(!isCurrent())return;}
  sub=getClient().channel("space-"+s.id,{config:{private:true}}).on("postgres_changes",{event:"*",schema:"public",table:"space_messages",filter:"space_id=eq."+s.id},()=>{if(active?.id===s.id){clearTimeout(messageReloadTimer);messageReloadTimer=setTimeout(()=>{if(active?.id===s.id)loadMessages(s.id);},220);}}).on("broadcast",{event:"typing"},event=>{const p=event?.payload||{};if(String(p.from)===String(currentUser?.id)||privacySettings?.show_typing===false)return;let indicator=q("spaceTypingIndicator");if(!indicator){indicator=document.createElement("p");indicator.id="spaceTypingIndicator";indicator.className="space-typing-indicator";q("spaceMessages")?.parentNode?.insertBefore(indicator,q("spaceMessages"));}indicator.textContent=p.typing?(tr("یکی از اعضا","A member")+" "+tr("در حال نوشتن…","is typing…")):"";if(spaceRemoteTypingTimer)clearTimeout(spaceRemoteTypingTimer);if(p.typing)spaceRemoteTypingTimer=setTimeout(()=>{if(indicator)indicator.textContent="";},2200);}).on("postgres_changes",{event:"INSERT",schema:"public",table:"space_message_reads",filter:"space_id=eq."+s.id},payload=>{if(active?.id===s.id&&String(payload?.new?.user_id)!==String(currentUser?.id)){clearTimeout(messageReloadTimer);messageReloadTimer=setTimeout(()=>{if(active?.id===s.id)loadMessages(s.id);},220);}}).on("postgres_changes",{event:"*",schema:"public",table:"space_message_reactions",filter:"space_id=eq."+s.id},()=>{if(active?.id===s.id){clearTimeout(messageReloadTimer);messageReloadTimer=setTimeout(()=>{if(active?.id===s.id)loadMessages(s.id);},220);}}).subscribe();
 }catch(e){if(isCurrent())q("spacesStatus").textContent=tr("بازکردن فضا ناموفق بود: ","Could not open space: ")+e.message;}
}

 function renderSpaceAvatar(el,path,fallback,privateGroup=false){
  if(!el)return;
  if(el.dataset.previewBound!=="1"){el.dataset.previewBound="1";el.addEventListener("click",event=>{const img=event.target?.closest?.("img");if(!img||!el.contains(img)||(!img.currentSrc&&!img.src))return;event.preventDefault();event.stopPropagation();window.openFarnazAvatarPreview?.(img.currentSrc||img.src,active?.name||"");});}
  el.replaceChildren();el.dataset.avatarPath=path||"";
  if(!path){el.textContent=fallback||"👥";return;}
  const setImage=url=>{if(!url||el.dataset.avatarPath!==path)return;el.style.setProperty("display","grid","important");el.style.setProperty("position","relative","important");el.style.setProperty("overflow","hidden","important");el.style.setProperty("visibility","visible","important");el.style.setProperty("opacity","1","important");if(el.classList.contains("space-info-avatar")){el.style.removeProperty("width");el.style.removeProperty("height");el.style.removeProperty("min-width");el.style.removeProperty("min-height");el.style.removeProperty("flex-shrink");el.style.removeProperty("border-radius");}else{el.style.setProperty("width","44px","important");el.style.setProperty("height","44px","important");el.style.setProperty("min-width","44px","important");el.style.setProperty("min-height","44px","important");el.style.setProperty("flex-shrink","0","important");el.style.setProperty("border-radius","50%","important");}const img=document.createElement("img");img.alt="";img.decoding="async";img.style.cssText="display:block!important;position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;object-fit:cover!important;border-radius:50%!important;visibility:visible!important;opacity:1!important;z-index:2!important";img.onerror=()=>{if(el.dataset.avatarPath!==path)return;if(privateGroup&&!el.dataset.avatarFallbackTried){el.dataset.avatarFallbackTried="1";const pub=getClient().storage.from("group-avatars").getPublicUrl(path).data?.publicUrl;if(pub&&pub!==url){img.src=pub;return;}}el.replaceChildren(document.createTextNode(fallback||"👥"));};el.replaceChildren(img);img.src=url;};
  delete el.dataset.avatarFallbackTried;
  if(path.startsWith("https://")||path.startsWith("http://")){setImage(path);return;}
  if(privateGroup){getClient().storage.from("group-avatars").createSignedUrl(path,3600).then(({data,error})=>{if(!error&&data?.signedUrl)setImage(data.signedUrl);else{const pub=getClient().storage.from("group-avatars").getPublicUrl(path).data?.publicUrl;if(pub)setImage(pub);else if(el.dataset.avatarPath===path)el.replaceChildren(document.createTextNode(fallback||"👥"));}}).catch(()=>{if(el.dataset.avatarPath===path)el.replaceChildren(document.createTextNode(fallback||"👥"));});return;}
  const url=getClient().storage.from("avatars").getPublicUrl(path).data?.publicUrl;setImage(url);
 }
 function inviteLink(code){const url=new URL(window.location.href);url.searchParams.delete("join");url.searchParams.set("join",code);url.hash="";return url.toString();}
async function openInviteDialog(){
 if(!active||!["group","channel"].includes(active.type))return;
 q("spaceInviteDialog").hidden=false;q("spaceInviteTitle").textContent=tr("لینک و کد دعوت","Invite link & code");q("spaceInviteHelp").textContent=tr("این لینک یا کد را فقط با افرادی که می‌خواهی عضو شوند به اشتراک بگذار.","Share this link or code only with people you want to invite.");q("spaceInviteStatus").textContent=tr("در حال آماده‌سازی دعوت…","Preparing invite…");
 try{let code=active.invite_code;if(!code){code=crypto.randomUUID().replace(/-/g,"").slice(0,16).toUpperCase();const {data,error}=await getClient().from("spaces").update({invite_code:code}).eq("id",active.id).select("*").single();if(error)throw error;active=data;}q("spaceInviteCodeDisplay").value=code;q("spaceInviteLinkDisplay").value=inviteLink(code);q("spaceInviteStatus").textContent=tr("آماده اشتراک‌گذاری است.","Ready to share.");}
 catch(e){q("spaceInviteStatus").textContent=tr("ساخت دعوت ناموفق بود: ","Could not prepare invite: ")+(e?.message||String(e));}
}
async function regenerateInvite(){
 if(!active||!["group","channel"].includes(active.type))return;const btn=q("regenerateSpaceInvite");btn.disabled=true;q("spaceInviteStatus").textContent=tr("در حال ساخت کد جدید…","Generating a new code…");
 try{let data,error;for(let attempt=0;attempt<3;attempt++){const code=crypto.randomUUID().replace(/-/g,"").slice(0,16).toUpperCase();const result=await getClient().from("spaces").update({invite_code:code}).eq("id",active.id).select("*").single();data=result.data;error=result.error;if(!error)break;if(String(error.code||"")!=="23505")throw error;}if(error)throw error;active=data;spaces=spaces.map(s=>s.id===data.id?data:s);q("spaceInviteCodeDisplay").value=data.invite_code;q("spaceInviteLinkDisplay").value=inviteLink(data.invite_code);q("spaceInviteStatus").textContent=tr("کد قبلی باطل شد و دعوت جدید آماده است.","The previous code was revoked; a new invite is ready.");}
 catch(e){q("spaceInviteStatus").textContent=tr("تغییر کد ناموفق بود: ","Could not renew invite: ")+(e?.message||String(e));}finally{btn.disabled=false;}
}
async function copyInvite(kind){const code=q("spaceInviteCodeDisplay").value;if(!code)return;const value=kind==="link"?inviteLink(code):code;try{await navigator.clipboard.writeText(value);q("spaceInviteStatus").textContent=kind==="link"?tr("لینک دعوت کپی شد.","Invite link copied."):tr("کد دعوت کپی شد.","Invite code copied.");}catch(_){const temp=document.createElement("textarea");temp.value=value;temp.setAttribute("readonly","");temp.style.position="fixed";temp.style.opacity="0";document.body.appendChild(temp);temp.select();let copied=false;try{copied=document.execCommand("copy");}catch(e){}temp.remove();q("spaceInviteStatus").textContent=copied?(kind==="link"?tr("لینک دعوت کپی شد.","Invite link copied."):tr("کد دعوت کپی شد.","Invite code copied.")):tr("کپی خودکار ممکن نشد؛ متن را دستی کپی کن.","Copy failed; copy the text manually.");}}

async function saveSpaceSettings(){
 if(!active||!currentUser)return;
 const status=q("spaceSettingsStatus"),button=q("saveSpaceSettings");button.disabled=true;
 const patch={member_list_visibility:q("spaceMemberVisibility").value,members_can_send_messages:q("spaceMembersCanSend").checked,members_can_add_members:q("spaceMembersCanAdd").checked,allow_channel_replies:q("spaceAllowReplies").checked,allow_media:q("spaceAllowMedia").checked,require_message_approval:q("spaceRequireApproval").checked,notify_member_changes:q("spaceNotifyChanges").checked,updated_at:new Date().toISOString()};
 try{const {data,error}=await getClient().from("spaces").update(patch).eq("id",active.id).select("*").single();if(error)throw error;active=data;spaces=spaces.map(x=>x.id===data.id?data:x);if(status)status.textContent=tr("تنظیمات ذخیره شد.","Settings saved.");await openSpaceInfo();await open(active.id);}
 catch(e){if(status)status.textContent=tr("ذخیره تنظیمات ناموفق بود: ","Could not save settings: ")+(e?.message||String(e));}
 finally{button.disabled=false;}
}
async function loadPendingSpaceApprovals(spaceId){
 const box=q("pendingSpaceApprovals");if(!box)return;box.replaceChildren();
 if(!active?.require_message_approval)return;
 const title=document.createElement("h4");title.textContent=tr("پیام‌های در انتظار تأیید","Messages awaiting approval");box.appendChild(title);
 const {data,error}=await getClient().from("space_messages").select("id,sender_id,body,created_at,message_type").eq("space_id",spaceId).eq("pending_approval",true).order("created_at",{ascending:true}).limit(50);
 if(error){const p=document.createElement("p");p.className="space-muted";p.textContent=error.message;box.appendChild(p);return;}
 if(!data?.length){const p=document.createElement("p");p.className="space-muted";p.textContent=tr("پیام معلقی وجود ندارد.","No pending messages.");box.appendChild(p);return;}
 for(const m of data){
  const row=document.createElement("div");row.className="space-pending-message";
  const body=document.createElement("p");body.textContent=m.body||("["+m.message_type+"]");row.appendChild(body);
  const approve=document.createElement("button");approve.type="button";approve.className="space-secondary";approve.textContent=tr("تأیید و انتشار","Approve & publish");
  approve.onclick=async()=>{approve.disabled=true;try{const {error:e}=await getClient().from("space_messages").update({pending_approval:false}).eq("id",m.id).eq("space_id",spaceId);if(e)throw e;await loadPendingSpaceApprovals(spaceId);await loadMessages(spaceId);}catch(e){approve.disabled=false;const p=document.createElement("small");p.textContent=e.message||String(e);row.appendChild(p);}};
  row.appendChild(approve);box.appendChild(row);
 }
}
function renderSpaceAdminSettings(mine,isChannel){
 const panel=q("spaceAdminSettings");if(!panel)return;
 const manager=!!mine&&["owner","admin"].includes(mine.role);panel.hidden=!manager;
 if(!manager)return;
 q("spaceMemberVisibility").value=active.member_list_visibility||"members";
 q("spaceMembersCanSend").checked=active.members_can_send_messages!==false;q("spaceMembersCanSend").closest("label").hidden=isChannel;
 q("spaceMembersCanAdd").checked=active.members_can_add_members===true;
 q("spaceAllowReplies").checked=active.allow_channel_replies===true;
 q("spaceAllowReplies").closest("label").hidden=!isChannel;
 q("spaceAllowMedia").checked=active.allow_media!==false;
 q("spaceRequireApproval").checked=active.require_message_approval===true;
 q("spaceNotifyChanges").checked=active.notify_member_changes!==false;
 q("saveSpaceSettings").onclick=saveSpaceSettings;
 loadPendingSpaceApprovals(active.id).catch(e=>console.warn("Pending approvals:",e));
}

function setSpaceActionContent(button,icon,label){
 const glyph=document.createElement("span");glyph.className="space-info-action-icon";glyph.setAttribute("aria-hidden","true");glyph.innerHTML=icon;
 const text=document.createElement("span");text.className="space-info-action-label";text.textContent=label;button.replaceChildren(glyph,text);
}
async function openSpaceInfo(){
  if(!active||!currentUser||!["group","channel"].includes(active.type))return;
  const spaceId=active.id,myId=String(currentUser.id),isChannel=active.type==="channel";
  const isCurrent=()=>String(currentUser?.id||"")===myId&&String(active?.id||"")===String(spaceId);
  q("spaceInfoDialog").hidden=false;q("spaceInfoTitle").textContent=isChannel?tr("اطلاعات کانال","Channel information"):tr("اطلاعات گروه","Group information");q("spaceInfoStatus").textContent=isChannel?tr("در حال بارگذاری اطلاعات کانال…","Loading channel information…"):tr("در حال بارگذاری اعضا…","Loading members…");
  q("spaceInfoName").textContent=active.name||"";q("spaceInfoDescription").textContent=active.description||"";
  renderSpaceAvatar(q("spaceInfoAvatar"),active.avatar_url,isChannel?"📣":"👥",true);
  const actions=q("spaceInfoActions");actions.replaceChildren();
  const infoCard=q("spaceInfoDialog").querySelector(".space-dialog-card");
  const memberHeading=q("spaceMemberHeading"),memberList=q("spaceMemberList"),adminPanel=q("spaceAdminSettings"),infoStatus=q("spaceInfoStatus");
  const membersAccordion=q("spaceMembersAccordion"),settingsAccordion=q("spaceSettingsAccordion");
  if(infoCard&&memberHeading&&memberList&&adminPanel&&infoStatus&&membersAccordion&&settingsAccordion){
   memberHeading.classList.add("space-info-members-heading");memberList.classList.add("space-info-members-list");
   membersAccordion.append(memberHeading,memberList);settingsAccordion.appendChild(adminPanel);
   memberHeading.hidden=false;memberList.hidden=false;membersAccordion.hidden=true;settingsAccordion.hidden=true;
   q("spaceInfoMemberCount").textContent=tr("در حال دریافت اعضا…","Loading members…");
   q("spaceInfoOnlineCount").textContent=tr("در حال بررسی آنلاین‌ها…","Checking online…");
   q("spaceShowMembers").querySelector(".space-info-section-leading span:last-child").textContent=isChannel?tr("جزئیات کانال","Channel details"):tr("اعضای گروه","Group members");
   q("spaceShowMembers").hidden=false;q("spaceShowSettings").hidden=true;
   q("spaceShowSettings").querySelector(".space-info-section-leading span:last-child").textContent=tr("تنظیمات و دسترسی گروه","Group settings & permissions");
   q("spaceShowMembers").setAttribute("aria-expanded","false");q("spaceShowSettings").setAttribute("aria-expanded","false");
   adminPanel.hidden=false;
  }
  const {data:mine,error:mineError}=await getClient().from("space_members").select("role").eq("space_id",spaceId).eq("user_id",myId).maybeSingle();
  if(!isCurrent())return;
  if(mineError){q("spaceInfoStatus").textContent=mineError.message;return;}
  if(!mine&&!isChannel){q("spaceInfoStatus").textContent=tr("برای مشاهده اعضا باید عضو این گروه باشی.","You must be a group member to view this roster.");return;}
  renderSpaceAdminSettings(mine,isChannel);
  const canManage=!!mine&&["owner","admin"].includes(mine.role);
  q("spaceAdminSettings").hidden=false;
  q("spaceShowSettings").hidden=!canManage;
  const setAccordion=(button,content,show)=>{content.hidden=!show;button.setAttribute("aria-expanded",String(show));button.querySelector(".space-info-section-chevron").textContent=show?"⌃":"⌄";button.classList.toggle("is-expanded",show);};
  q("spaceShowMembers").onclick=()=>{const show=membersAccordion.hidden;setAccordion(q("spaceShowMembers"),membersAccordion,show);};
  q("spaceShowSettings").onclick=()=>{const show=settingsAccordion.hidden;setAccordion(q("spaceShowSettings"),settingsAccordion,show);if(show)settingsAccordion.scrollIntoView({block:"nearest",behavior:"smooth"});};
  if(isChannel){
   q("spaceMemberHeading").textContent=tr("جزئیات کانال","Channel details");
   const detail=q("spaceMemberList");detail.replaceChildren();
   const visibility=document.createElement("p");visibility.className="space-muted";visibility.textContent=active.is_public?tr("کانال عمومی","Public channel"):tr("کانال خصوصی با کد دعوت","Private channel");
   const count=document.createElement("p");count.className="space-muted";count.textContent=tr("در حال دریافت تعداد اعضا…","Loading subscriber count…");detail.append(visibility,count);const onlineCount=document.createElement("p");onlineCount.className="space-muted";onlineCount.hidden=typeof privacySettings!=="undefined"&&privacySettings.show_space_online_count===false;onlineCount.textContent=tr("در حال محاسبه افراد آنلاین…","Calculating online members…");detail.appendChild(onlineCount);
   try{const {count:n,error:e}=await getClient().from("space_members").select("user_id",{count:"exact",head:true}).eq("space_id",spaceId);if(!isCurrent())return;if(e)throw e;count.textContent=tr("تعداد اعضا: ","Members: ")+(n??0);if(!onlineCount.hidden){const {data:memberRows}=await getClient().from("space_members").select("user_id").eq("space_id",spaceId);if(!isCurrent())return;let online=0;for(const row of memberRows||[]){try{const {data:presence}=await getClient().rpc("get_farnaz_presence_status",{p_user_id:row.user_id});const status=Array.isArray(presence)?presence[0]:presence;if(status?.can_see_online&&status.is_online)online++;}catch(_){}}onlineCount.textContent=tr("آنلاین: ","Online: ")+online;}}catch(e){count.textContent="";}
   if(mine&&["owner","admin"].includes(mine.role)){
    const edit=document.createElement("button");edit.type="button";edit.className="space-secondary";setSpaceActionContent(edit,'<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',tr("ویرایش عکس","Edit photo"));edit.classList.add("space-info-quick-action");edit.onclick=()=>{q("spaceEditTitle").textContent=tr("ویرایش اطلاعات کانال","Edit channel information");q("spaceEditForm").querySelector('label[for="spaceEditName"]').textContent=tr("نام کانال","Channel name");q("spaceEditForm").querySelector('label[for="spaceEditDescription"]').textContent=tr("توضیحات","Description");q("spaceEditForm").querySelector('label[for="spaceEditPhoto"]').textContent=tr("عکس کانال","Channel photo");q("spaceEditForm").querySelector(".space-muted").textContent=tr("عکس کانال برای اعضای کانال قابل مشاهده است.","The channel photo is visible to channel members.");q("cancelSpaceEdit").textContent=tr("انصراف","Cancel");q("saveSpaceEdit").textContent=tr("ذخیره","Save");q("spaceEditName").value=active.name||"";q("spaceEditDescription").value=active.description||"";q("spaceEditPhoto").value="";q("spaceEditStatus").textContent="";q("spaceEditDialog").hidden=false;};actions.appendChild(edit);
    const inviteContact=document.createElement("button");inviteContact.type="button";inviteContact.className="space-primary";setSpaceActionContent(inviteContact,'<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>',tr("دعوت مخاطب","Invite contact"));inviteContact.classList.add("space-info-quick-action");inviteContact.onclick=async()=>{await contacts("spaceAddContacts");q("spaceAddDialog").querySelector("h3").textContent=tr("دعوت مخاطب به کانال","Invite contact to channel");q("saveAddContacts").textContent=tr("دعوت انتخاب‌شده‌ها","Invite selected");q("spaceAddStatus").textContent="";q("spaceInfoDialog").hidden=true;q("spaceAddDialog").hidden=false;};actions.appendChild(inviteContact);
    const share=document.createElement("button");share.type="button";share.className="space-secondary";setSpaceActionContent(share,'<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.1 0l-3 3A5 5 0 0 0 11 21.1l1.7-1.7"/></svg>',tr("لینک و کد دعوت","Invite link & code"));share.classList.add("space-info-quick-action");share.onclick=openInviteDialog;actions.appendChild(share);
   }
   q("spaceInfoStatus").textContent=tr("اطلاعات کانال","Channel information");
   return;
  }
  if(["owner","admin"].includes(mine.role)){
   const edit=document.createElement("button");edit.type="button";edit.className="space-secondary";setSpaceActionContent(edit,'<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>',tr("ویرایش عکس گروه","Edit group photo"));edit.classList.add("space-info-quick-action");edit.onclick=()=>{q("spaceEditTitle").textContent=tr("ویرایش اطلاعات گروه","Edit group information");q("spaceEditForm").querySelector('label[for="spaceEditName"]').textContent=tr("نام گروه","Group name");q("spaceEditForm").querySelector('label[for="spaceEditDescription"]').textContent=tr("توضیحات","Description");q("spaceEditForm").querySelector('label[for="spaceEditPhoto"]').textContent=tr("عکس گروه","Group photo");q("spaceEditForm").querySelector(".space-muted").textContent=tr("عکس گروه فقط برای اعضای گروه قابل مشاهده است.","The group photo is visible only to group members.");q("cancelSpaceEdit").textContent=tr("انصراف","Cancel");q("saveSpaceEdit").textContent=tr("ذخیره","Save");q("spaceEditName").value=active.name||"";q("spaceEditDescription").value=active.description||"";q("spaceEditPhoto").value="";q("spaceEditStatus").textContent="";q("spaceEditDialog").hidden=false;};actions.appendChild(edit);
   const add=document.createElement("button");add.type="button";add.className="space-primary";setSpaceActionContent(add,'<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>',tr("افزودن عضو","Add member"));add.classList.add("space-info-quick-action");add.onclick=async()=>{await contacts("spaceAddContacts");q("spaceAddDialog").querySelector("h3").textContent=tr("افزودن اعضا","Add members");q("saveAddContacts").textContent=tr("افزودن انتخاب‌شده‌ها","Add selected");q("spaceAddStatus").textContent="";q("spaceInfoDialog").hidden=true;q("spaceAddDialog").hidden=false;};actions.appendChild(add);
   const share=document.createElement("button");share.type="button";share.className="space-secondary space-info-quick-action";setSpaceActionContent(share,'<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.1 0l-3 3A5 5 0 0 0 11 21.1l1.7-1.7"/></svg>',tr("لینک و کد دعوت","Invite link & code"));share.onclick=openInviteDialog;actions.appendChild(share);
  }
  if(mine.role==="member"&&active.members_can_add_members===true){
   const inviteMember=document.createElement("button");inviteMember.type="button";inviteMember.className="space-primary";inviteMember.textContent=tr("＋ افزودن عضو","＋ Add member");inviteMember.onclick=async()=>{await contacts("spaceAddContacts");q("spaceAddDialog").querySelector("h3").textContent=tr("افزودن اعضا","Add members");q("saveAddContacts").textContent=tr("افزودن انتخاب‌شده‌ها","Add selected");q("spaceAddStatus").textContent="";q("spaceInfoDialog").hidden=true;q("spaceAddDialog").hidden=false;};actions.appendChild(inviteMember);
  }
  if(active.member_list_visibility==="managers"&&mine.role==="member"){try{const {count}=await getClient().from("space_members").select("user_id",{count:"exact",head:true}).eq("space_id",spaceId);if(!isCurrent())return;q("spaceInfoMemberCount").textContent=tr((count??0)+" عضو",(count??0)+" members");q("spaceMemberSummary").textContent=count??0;const {data:ids}=await getClient().from("space_members").select("user_id").eq("space_id",spaceId);if(!isCurrent())return;let online=0;for(const row of ids||[]){try{const {data}=await getClient().rpc("get_farnaz_presence_status",{p_user_id:row.user_id});const st=Array.isArray(data)?data[0]:data;if(st?.can_see_online&&st.is_online)online++;}catch(_){}}q("spaceInfoOnlineCount").textContent=tr(online+" نفر آنلاین",online+" online");}catch(_){q("spaceInfoMemberCount").textContent="";q("spaceInfoOnlineCount").textContent="";}q("spaceMemberHeading").textContent=tr("اعضای گروه","Group members");q("spaceMemberList").replaceChildren();q("spaceMemberHeading").hidden=true;q("spaceMemberList").hidden=true;q("spaceShowMembers").hidden=true;membersAccordion.hidden=true;q("spaceInfoStatus").textContent=tr("فهرست اعضا فقط برای مدیران قابل مشاهده است.","Only managers can view the member list.");return;}
  const {data:members,error}=await getClient().rpc("get_space_member_profiles",{p_space_id:spaceId});
  if(!isCurrent())return;
  if(error){q("spaceInfoStatus").textContent=tr("دریافت فهرست اعضا ناموفق بود: ","Could not load members: ")+error.message;return;}
  const list=q("spaceMemberList");list.replaceChildren();
  q("spaceInfoMemberCount").textContent=tr((members||[]).length+" عضو",""+(members||[]).length+" members");q("spaceMemberSummary").textContent=(members||[]).length;
  q("spaceMemberHeading").textContent=tr("اعضای گروه","Group members")+" · "+(members||[]).length;
  if(typeof privacySettings==="undefined"||privacySettings.show_space_online_count!==false){
   try{const presenceRows=await Promise.all((members||[]).map(async member=>{try{const {data,error}=await getClient().rpc("get_farnaz_presence_status",{p_user_id:member.user_id});if(error)return false;const status=Array.isArray(data)?data[0]:data;return !!(status?.can_see_online&&status.is_online);}catch(_){return false;}}));if(!isCurrent())return;const onlineTotal=presenceRows.filter(Boolean).length;q("spaceInfoOnlineCount").textContent=tr(onlineTotal+" نفر آنلاین",onlineTotal+" online");q("spaceMemberHeading").textContent+=" · "+tr("آنلاین ","Online ")+onlineTotal;}catch(_){}
  }
  for(const member of members||[]){
   const row=document.createElement("div");row.className="space-member-row";
   const trigger=document.createElement("button");trigger.type="button";trigger.className="space-member-trigger";
   const av=document.createElement("span");av.className="space-avatar";
   const copy=document.createElement("span");copy.className="space-member-copy";
   const name=document.createElement("strong");name.textContent=member.user_id===currentUser.id?tr("شما","You"):(member.display_name||tr("کاربر فرناز","Farnaz user"));
   const role=document.createElement("small");role.textContent=member.role==="owner"?tr("مالک گروه","Group owner"):member.role==="admin"?tr("مدیر گروه","Group admin"):tr("عضو","Member");copy.append(name,role);const online=document.createElement("small");online.className="space-member-presence";online.textContent="";copy.appendChild(online);(async()=>{try{const {data,error}=await getClient().rpc("get_farnaz_presence_status",{p_user_id:member.user_id});if(error)throw error;const status=Array.isArray(data)?data[0]:data;if(!isCurrent())return;if(status?.can_see_online&&status.is_online){online.textContent=tr("آنلاین","Online");online.classList.add("is-online");}else if(status?.can_see_last_seen&&status.last_seen_at){online.textContent=tr("آخرین بازدید: ","Last seen: ")+new Date(status.last_seen_at).toLocaleString(english?"en":"fa-IR",{dateStyle:"short",timeStyle:"short"});}}catch(_){}})();
   trigger.append(av,copy);
   const tools=document.createElement("div");tools.className="space-member-tools";tools.hidden=true;
   const chevron=document.createElement("span");chevron.className="space-member-chevron";chevron.textContent="⌄";chevron.setAttribute("aria-hidden","true");trigger.appendChild(chevron);trigger.setAttribute("aria-expanded","false");
   trigger.onclick=()=>{const expand=tools.hidden;tools.hidden=!expand;trigger.setAttribute("aria-expanded",String(expand));chevron.textContent=expand?"⌃":"⌄";};
   if(member.user_id!==currentUser.id){
    const dm=document.createElement("button");dm.type="button";dm.className="space-secondary";dm.textContent=tr("پیام خصوصی","Private message");dm.onclick=()=>{q("spaceInfoDialog").hidden=true;openChat({user_id:member.user_id,display_name:member.display_name||tr("کاربر فرناز","Farnaz user"),avatar_url:member.avatar_url||""},"spacesPage");};tools.appendChild(dm);
    if(mine.role==="owner"&&member.role!=="owner"){
     const roleBtn=document.createElement("button");roleBtn.type="button";roleBtn.className="space-secondary";roleBtn.textContent=member.role==="admin"?tr("برداشتن مدیریت","Remove admin"):tr("مدیر کردن","Make admin");roleBtn.onclick=async()=>{roleBtn.disabled=true;try{const {error:e}=await getClient().rpc("set_space_member_role",{p_space_id:spaceId,p_user_id:member.user_id,p_role:member.role==="admin"?"member":"admin"});if(e)throw e;await openSpaceInfo();}catch(e){q("spaceInfoStatus").textContent=tr("عملیات ناموفق بود: ","Action failed: ")+(e?.message||String(e));}finally{roleBtn.disabled=false;}};tools.appendChild(roleBtn);
     const transfer=document.createElement("button");transfer.type="button";transfer.className="space-secondary";transfer.textContent=tr("انتقال مالکیت","Transfer ownership");transfer.onclick=async()=>{if(!window.confirm(tr("با انتقال مالکیت، شما مدیر می‌شوید و این عضو مالک گروه خواهد شد. ادامه می‌دهی؟","Transfer ownership to this member? You will become an admin.")))return;transfer.disabled=true;try{const {error:e}=await getClient().rpc("transfer_space_ownership",{p_space_id:spaceId,p_new_owner_id:member.user_id});if(e)throw e;await refresh();await open(spaceId);await openSpaceInfo();}catch(e){q("spaceInfoStatus").textContent=tr("انتقال مالکیت ناموفق بود: ","Ownership transfer failed: ")+(e?.message||String(e));}finally{transfer.disabled=false;}};tools.appendChild(transfer);
    }
    if(["owner","admin"].includes(mine.role)&&(mine.role==="owner"||member.role==="member")&&member.role!=="owner"){
     const remove=document.createElement("button");remove.type="button";remove.className="space-secondary";remove.textContent=tr("حذف عضو","Remove");remove.onclick=async()=>{if(!window.confirm(tr("این عضو از گروه حذف شود؟","Remove this member from the group?")))return;remove.disabled=true;try{const {error:e}=await getClient().from("space_members").delete().eq("space_id",spaceId).eq("user_id",member.user_id);if(e)throw e;await openSpaceInfo();}catch(e){q("spaceInfoStatus").textContent=tr("حذف عضو ناموفق بود: ","Could not remove member: ")+(e?.message||String(e));}finally{remove.disabled=false;}};tools.appendChild(remove);
    }
   }else{
    const selfNote=document.createElement("small");selfNote.textContent=member.role==="owner"?tr("شما مالک این گروه هستید.","You own this group."):tr("این حساب شماست.","This is your account.");tools.appendChild(selfNote);
   }
   row.append(trigger,tools);list.appendChild(row);renderSpaceAvatar(av,member.avatar_url,"👤");
  }
  q("spaceInfoStatus").textContent=tr("اطلاعات خصوصی حساب اعضا، مانند شماره تلفن و ایمیل، در این فهرست نمایش داده نمی‌شود.","Private account details such as phone numbers and email addresses are not shown here.");
 }
let cropState=null,cropPointer=null;
function cropClamp(){if(!cropState)return;let v=q("spaceCropViewport"),i=q("spaceCropImage"),w=v.clientWidth,h=v.clientHeight;cropState.x=Math.max(w-cropState.w,Math.min(0,cropState.x));cropState.y=Math.max(h-cropState.h,Math.min(0,cropState.y));Object.assign(i.style,{width:cropState.w+"px",height:cropState.h+"px",left:cropState.x+"px",top:cropState.y+"px"});}
function cropZoom(){if(!cropState)return;let v=q("spaceCropViewport"),cx=(v.clientWidth/2-cropState.x)/cropState.w,cy=(v.clientHeight/2-cropState.y)/cropState.h,z=cropState.base*Number(q("spaceCropZoom").value);cropState.w=cropState.nw*z;cropState.h=cropState.nh*z;cropState.x=v.clientWidth/2-cx*cropState.w;cropState.y=v.clientHeight/2-cy*cropState.h;cropClamp();}
function cropOpen(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),i=q("spaceCropImage"),v=q("spaceCropViewport"),dlg=q("spaceCropDialog");cropState={file,url,resolve,reject};cropPointer=null;q("spaceCropZoom").value=1;dlg.hidden=false;dlg.style.setProperty("display","flex","important");i.style.visibility="hidden";i.onload=()=>{if(!cropState||cropState.url!==url)return;try{const w=v.clientWidth,h=v.clientHeight;if(!w||!h)throw Error("Crop frame has no size");Object.assign(cropState,{nw:i.naturalWidth,nh:i.naturalHeight,base:Math.max(w/i.naturalWidth,h/i.naturalHeight)});cropState.w=cropState.nw*cropState.base;cropState.h=cropState.nh*cropState.base;cropState.x=(w-cropState.w)/2;cropState.y=(h-cropState.h)/2;Object.assign(i.style,{position:"absolute",display:"block",maxWidth:"none",maxHeight:"none",width:cropState.w+"px",height:cropState.h+"px",left:cropState.x+"px",top:cropState.y+"px",transform:"none",visibility:"visible"});cropClamp();}catch(err){URL.revokeObjectURL(url);dlg.hidden=true;dlg.style.removeProperty("display");cropState=null;reject(err);}};i.onerror=()=>{if(!cropState||cropState.url!==url)return;URL.revokeObjectURL(url);dlg.hidden=true;dlg.style.removeProperty("display");cropState=null;reject(Error("Could not read image"));};i.src=url;});}
async function cropFinish(cancel){if(!cropState)return;const a=cropState;if(cancel){cropState=null;q("spaceCropDialog").hidden=true;q("spaceCropDialog").style.removeProperty("display");q("spaceCropImage").style.visibility="hidden";URL.revokeObjectURL(a.url);a.resolve(null);return;}try{const v=q("spaceCropViewport"),sx=Math.max(0,-a.x*a.nw/a.w),sy=Math.max(0,-a.y*a.nh/a.h),sw=Math.min(v.clientWidth*a.nw/a.w,a.nw-sx),sh=Math.min(v.clientHeight*a.nh/a.h,a.nh-sy);if(!v.clientWidth||!v.clientHeight||![sx,sy,sw,sh].every(Number.isFinite)||sw<=0||sh<=0)throw Error("Invalid crop area");let source,bitmap=null;if(typeof createImageBitmap==="function"){try{bitmap=await createImageBitmap(a.file);source=bitmap;}catch(_){}}if(!source){source=new Image();source.src=a.url;if(typeof source.decode==="function")await source.decode();else await new Promise((resolve,reject)=>{source.onload=resolve;source.onerror=()=>reject(Error("Could not decode selected image"));});}const c=document.createElement("canvas");c.width=c.height=512;const ctx=c.getContext("2d",{alpha:false});if(!ctx)throw Error("Canvas is unavailable");ctx.fillStyle="#ffffff";ctx.fillRect(0,0,512,512);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";ctx.drawImage(source,sx,sy,sw,sh,0,0,512,512);bitmap?.close?.();const blob=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error("Could not create cropped image")),"image/png"));if(!blob||blob.size===0)throw Error("Cropped image is empty");const checkUrl=URL.createObjectURL(blob);try{const check=new Image();check.src=checkUrl;if(typeof check.decode==="function")await check.decode();else await new Promise((resolve,reject)=>{check.onload=resolve;check.onerror=reject;});if(!check.naturalWidth||!check.naturalHeight)throw Error("Cropped image could not be verified");}finally{URL.revokeObjectURL(checkUrl);}cropState=null;q("spaceCropDialog").hidden=true;q("spaceCropDialog").style.removeProperty("display");q("spaceCropImage").style.visibility="hidden";URL.revokeObjectURL(a.url);const baseName=a.file.name.replace(/\\.[^.]+$/,"")||"group-photo";a.resolve(new File([blob],baseName+".png",{type:"image/png"}));}catch(e){cropState=null;q("spaceCropDialog").hidden=true;q("spaceCropDialog").style.removeProperty("display");q("spaceCropImage").style.visibility="hidden";URL.revokeObjectURL(a.url);a.reject(e);}}function initCrop(){let v=q("spaceCropViewport");q("spaceCropZoom").oninput=cropZoom;q("spaceCropCancel").onclick=()=>cropFinish(true);q("spaceCropConfirm").onclick=()=>cropFinish(false);v.onpointerdown=e=>{if(!cropState)return;cropPointer={id:e.pointerId,x:e.clientX,y:e.clientY,ix:cropState.x,iy:cropState.y};v.setPointerCapture?.(e.pointerId);};v.onpointermove=e=>{if(!cropState||!cropPointer||cropPointer.id!==e.pointerId)return;cropState.x=cropPointer.ix+e.clientX-cropPointer.x;cropState.y=cropPointer.iy+e.clientY-cropPointer.y;cropClamp();};v.onpointerup=v.onpointercancel=()=>cropPointer=null;}
 async function saveSpaceInfo(event){
  event.preventDefault();if(!active||!currentUser)return;
  const btn=q("saveSpaceEdit");if(btn.disabled)return;btn.disabled=true;q("spaceEditStatus").textContent="";let uploadedGroupAvatar=null;
  try{
   const name=q("spaceEditName").value.trim(),description=q("spaceEditDescription").value.trim(),file=q("spaceEditPhoto").files[0];
   if(!name)throw Error(tr("نام گروه را وارد کن.","Enter a group name."));
   if(file&&(!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type)||file.size>5*1024*1024))throw Error(tr("عکس باید JPG، PNG، WebP یا GIF و حداکثر ۵ مگابایت باشد.","Choose a JPG, PNG, WebP or GIF image up to 5 MB."));
   let avatar_url=active.avatar_url||null;
   if(file){
    const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":file.type==="image/gif"?"gif":"jpg";
    const path=active.id+"/"+crypto.randomUUID()+"."+ext;
    const {error:uploadError}=await getClient().storage.from("group-avatars").upload(path,file,{contentType:file.type,upsert:false});
    if(uploadError)throw uploadError;uploadedGroupAvatar=path;avatar_url=path;
   }
   const {data,error}=await getClient().from("spaces").update({name,description,avatar_url,updated_at:new Date().toISOString()}).eq("id",active.id).select("*").single();
   if(error)throw error;
   active=data;spaces=spaces.map(s=>s.id===data.id?data:s);q("spaceEditDialog").hidden=true;q("spaceInfoDialog").hidden=true;
   await open(data.id);await openSpaceInfo();await refresh();
  }catch(e){if(uploadedGroupAvatar)try{await getClient().storage.from("group-avatars").remove([uploadedGroupAvatar]);}catch(_){}q("spaceEditStatus").textContent=tr("ذخیره تغییرات ناموفق بود: ","Could not save changes: ")+(e?.message||String(e));}
  finally{btn.disabled=false;}
 }

 let messageLoadToken=0,messageReloadTimer=null;
const selectedSpaceMessageIds=new Set();
let spaceMessageSelectionMode=false;
const spaceSenderProfileCache=new Map();
const spaceAttachmentUrlCache=new Map();
const SPACE_SIGNED_URL_TTL=50*60*1000;
async function getCachedSpaceSenderName(senderId){
 const key=String(senderId||"");
 if(!key)return "";
 if(spaceSenderProfileCache.has(key))return spaceSenderProfileCache.get(key);
 const pending=(async()=>{const profile=await getContactProfile(key);return profile?.display_name||"";})();
 spaceSenderProfileCache.set(key,pending);
 try{const name=await pending;spaceSenderProfileCache.set(key,name);return name;}
 catch(error){spaceSenderProfileCache.delete(key);throw error;}
}
async function getCachedSpaceAttachmentUrl(path){
 const key=String(path||"");
 if(!key)return null;
 const cached=spaceAttachmentUrlCache.get(key);
 if(cached?.pending)return cached.pending;
 if(cached&&cached.expiresAt>Date.now())return cached.url;
 const pending=(async()=>{const {data,error}=await getClient().storage.from("chat-attachments").createSignedUrl(key,3600);if(error)throw error;return data?.signedUrl||null;})();
 spaceAttachmentUrlCache.set(key,{pending,expiresAt:Date.now()+SPACE_SIGNED_URL_TTL});
 try{const url=await pending;spaceAttachmentUrlCache.set(key,{url,expiresAt:Date.now()+SPACE_SIGNED_URL_TTL});return url;}
 catch(error){spaceAttachmentUrlCache.delete(key);throw error;}
}

function askSpaceDeleteScope(count=1,allowEveryone=true){
 return new Promise(resolve=>{
  const overlay=document.createElement("div");overlay.className="space-delete-overlay";
  Object.assign(overlay.style,{position:"fixed",inset:"0",zIndex:"12000",display:"flex",alignItems:"center",justifyContent:"center",padding:"20px",background:"rgba(0,0,0,.48)",backdropFilter:"blur(3px)"});
  const dialog=document.createElement("section");Object.assign(dialog.style,{width:"min(100%,360px)",padding:"22px",border:"1px solid var(--line,rgba(128,128,128,.25))",borderRadius:"18px",background:"var(--panel,var(--card,#fff))",color:"var(--white,#222)",boxShadow:"0 16px 48px rgba(0,0,0,.22)",direction:"inherit"});
  dialog.setAttribute("role","dialog");dialog.setAttribute("aria-modal","true");
  const title=document.createElement("h3");title.textContent=count>1?tr("حذف پیام‌های انتخاب‌شده","Delete selected messages"):tr("حذف پیام","Delete message");
  const label=document.createElement("p");label.textContent=tr("مشخص کن پیام"+(count>1?"ها":"")+" کجا حذف "+(count>1?"شوند":"شود"),"Choose where to delete "+(count>1?"these messages":"this message")+".");
  const choices=document.createElement("div");Object.assign(choices.style,{display:"grid",gridTemplateColumns:allowEveryone?"1fr 1fr":"1fr",gap:"8px",margin:"0 0 18px"});
  let scope="me";
  const makeChoice=(value,labelText)=>{const b=document.createElement("button");b.type="button";b.textContent=labelText;b.dataset.scope=value;Object.assign(b.style,{minHeight:"46px",padding:"10px 8px",border:"1px solid rgba(128,128,128,.35)",borderRadius:"11px",background:value===scope?"var(--accent,#168f78)":"transparent",color:value===scope?"var(--accent-ink,#fff)":"inherit",font:"inherit",fontSize:"14px"});b.onclick=()=>{scope=value;[...choices.children].forEach(x=>{const on=x.dataset.scope===scope;x.style.background=on?"var(--accent,#168f78)":"transparent";x.style.color=on?"var(--accent-ink,#fff)":"inherit";x.setAttribute("aria-pressed",String(on));});};b.setAttribute("aria-pressed",String(value===scope));return b;};
  choices.append(makeChoice("me",tr("فقط برای من","Only for me")));if(allowEveryone)choices.append(makeChoice("all",tr("برای همه","For everyone")));
  const actions=document.createElement("div");Object.assign(actions.style,{display:"flex",gap:"10px"});
  const cancel=document.createElement("button");cancel.type="button";cancel.textContent=tr("لغو","Cancel");
  const confirm=document.createElement("button");confirm.type="button";confirm.textContent=tr("ادامه","Continue");
  for(const b of [cancel,confirm])Object.assign(b.style,{flex:"1",minHeight:"44px",padding:"10px 14px",border:"1px solid rgba(128,128,128,.3)",borderRadius:"11px",background:"transparent",color:"inherit",font:"inherit"});
  confirm.style.background="var(--accent,#168f78)";confirm.style.color="var(--accent-ink,#fff)";
  const finish=value=>{overlay.remove();document.removeEventListener("keydown",onKey);resolve(value);};
  const onKey=e=>{if(e.key==="Escape")finish(null);};cancel.onclick=()=>finish(null);confirm.onclick=()=>finish(scope);
  overlay.onclick=e=>{if(e.target===overlay)finish(null);};
  actions.append(cancel,confirm);dialog.append(title,label,choices,actions);overlay.append(dialog);document.body.append(overlay);document.addEventListener("keydown",onKey);
 });
}
async function hideSpaceMessagesForMe(ids){
 if(!ids.length||!currentUser)return;
 const rows=ids.map(id=>({user_id:currentUser.id,message_id:id}));
 const {error}=await getClient().from("space_message_hidden").upsert(rows,{onConflict:"user_id,message_id"});if(error)throw error;
}
async function deleteSelectedSpaceMessages(){
 if(!active||!currentUser)return;
 const ids=[...selectedSpaceMessageIds];
 if(!ids.length)return;
 const ownIds=ids.filter(id=>q("spaceMessages")?.querySelector('.space-message[data-message-id="'+CSS.escape(id)+'"]')?.dataset.messageSide==="own");
 const scope=await askSpaceDeleteScope(ids.length,ownIds.length===ids.length);
 if(!scope)return;
 const spaceId=active.id;
 try{
  const client=getClient();
  if(scope==="me")await hideSpaceMessagesForMe(ids);
  else {const {error}=await client.from("space_messages").delete().in("id",ownIds).eq("space_id",spaceId).eq("sender_id",currentUser.id);if(error)throw error;}
  selectedSpaceMessageIds.clear();spaceMessageSelectionMode=false;
  q("spaceMessageStatus").textContent=scope==="me"?tr("پیام‌ها فقط از صفحه شما پنهان شدند.","Messages hidden from your view."):tr("پیام‌های شما برای همه حذف شدند.","Your messages were deleted for everyone.");
  await loadMessages(spaceId);
 }catch(error){q("spaceMessageStatus").textContent=tr("حذف پیام ناموفق بود: ","Could not delete messages: ")+(error?.message||String(error));}
}
function updateSpaceMessageSelection(){
 const list=q("spaceMessages");if(!list)return;
 list.querySelectorAll(".space-message").forEach(el=>el.classList.toggle("space-message-selected",selectedSpaceMessageIds.has(el.dataset.messageId)));
 let bar=q("spaceMessageSelectionBar");
 if(!bar){bar=document.createElement("div");bar.id="spaceMessageSelectionBar";bar.className="space-message-selection-bar";bar.hidden=true;list.parentNode.insertBefore(bar,list);}
 bar.hidden=!spaceMessageSelectionMode;bar.replaceChildren();if(!spaceMessageSelectionMode)return;
 const count=document.createElement("span");count.textContent=tr(selectedSpaceMessageIds.size+" پیام انتخاب شده","Selected: "+selectedSpaceMessageIds.size);bar.appendChild(count);
 const forward=document.createElement("button");forward.type="button";forward.textContent=tr("فوروارد","Forward");forward.disabled=!selectedSpaceMessageIds.size;forward.onclick=forwardSelectedSpaceMessages;bar.appendChild(forward);
 const remove=document.createElement("button");remove.type="button";remove.textContent=tr("حذف","Delete");remove.disabled=!selectedSpaceMessageIds.size;remove.onclick=deleteSelectedSpaceMessages;bar.appendChild(remove);
 const cancel=document.createElement("button");cancel.type="button";cancel.textContent=tr("لغو","Cancel");cancel.onclick=()=>{spaceMessageSelectionMode=false;selectedSpaceMessageIds.clear();updateSpaceMessageSelection();};bar.appendChild(cancel);
}
async function forwardSelectedSpaceMessages(){
 if(!active||!currentUser||!selectedSpaceMessageIds.size)return;
 try{
  const client=getClient();
  const {data:messages,error}=await client.from("space_messages").select("id,body,message_type,attachment_path,attachment_name,attachment_mime,attachment_size,created_at").in("id",[...selectedSpaceMessageIds]).order("created_at",{ascending:true});
  if(error)throw error;
  const {data:destinations,error:destError}=await client.from("spaces").select("id,name,type").neq("id",active.id).order("name");
  if(destError)throw destError;
  if(!destinations?.length)throw Error(tr("فضای دیگری برای فوروارد وجود ندارد.","There is no other group or channel to forward to."));
  const choices=destinations.map((x,i)=>(i+1)+". "+x.name+" ("+x.type+")").join("\n");
  const choice=Number(prompt(tr("شماره مقصد را انتخاب کن:\n","Choose destination by number:\n")+choices));
  if(!Number.isInteger(choice)||choice<1||choice>destinations.length)return;
  const destination=destinations[choice-1];
  for(const m of messages||[]){
   let path=null;
   if(m.attachment_path){
    const {data:blob,error:downloadError}=await client.storage.from("chat-attachments").download(m.attachment_path);if(downloadError)throw downloadError;
    const ext=(m.attachment_name||"attachment").split(".").pop().toLowerCase().replace(/[^a-z0-9]/g,"")||"bin";
    path=currentUser.id+"/spaces/"+crypto.randomUUID()+"."+ext;
    const {error:uploadError}=await client.storage.from("chat-attachments").upload(path,blob,{contentType:m.attachment_mime||blob.type||"application/octet-stream",upsert:false});if(uploadError)throw uploadError;
   }
   const {error:insertError}=await client.from("space_messages").insert({space_id:destination.id,sender_id:currentUser.id,body:m.body||" ",message_type:m.message_type||"text",attachment_path:path,attachment_name:m.attachment_name||null,attachment_mime:m.attachment_mime||null,attachment_size:m.attachment_size||null});
   if(insertError){if(path)try{await client.storage.from("chat-attachments").remove([path]);}catch(_){}throw insertError;}
  }
  selectedSpaceMessageIds.clear();spaceMessageSelectionMode=false;updateSpaceMessageSelection();
  q("spaceMessageStatus").textContent=tr("پیام‌ها فوروارد شدند.","Messages forwarded.");
 }catch(error){q("spaceMessageStatus").textContent=tr("فوروارد ناموفق بود: ","Forward failed: ")+(error?.message||String(error));}
}
function setSpaceReplyTarget(message){
 const input=q("spaceText");if(!input||!message)return;
 if(active?.type==="channel"&&active?.allow_channel_replies!==true){q("spaceMessageStatus").textContent=tr("پاسخ در این کانال غیرفعال است.","Replies are disabled in this channel.");return;}
 spaceReplyTarget=message;
 let preview=q("spaceReplyPreview");
 if(!preview){preview=document.createElement("div");preview.id="spaceReplyPreview";preview.className="message-quote";preview.style.cssText="display:flex;align-items:center;gap:8px;padding:7px 10px;margin:0 10px 6px;border-inline-start:3px solid var(--accent,#22b8a5);border-radius:7px;background:rgba(120,130,145,.12)";input.parentElement?.before(preview);}
 preview.replaceChildren();
 const copy=document.createElement("div");copy.style.cssText="min-width:0;flex:1";
 const author=document.createElement("strong");author.style.cssText="display:block;font-size:11px;color:var(--accent,#159b8c)";author.textContent=(english?"Replying to ":"پاسخ به ")+(String(message.sender_id)===String(currentUser?.id)?(english?"you":"خودت"):(english?"member":"عضو"));
 const body=document.createElement("span");body.style.cssText="display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";body.textContent=message.body||message.attachment_name||tr("پیوست","Attachment");
 copy.append(author,body);
 const close=document.createElement("button");close.type="button";close.textContent="×";close.setAttribute("aria-label",english?"Cancel reply":"لغو پاسخ");close.style.cssText="border:0;background:transparent;font-size:22px;padding:3px 7px;color:inherit";close.onclick=cancelSpaceReply;
 preview.append(copy,close);input.focus();
}
function cancelSpaceReply(){spaceReplyTarget=null;q("spaceReplyPreview")?.remove();}
async function toggleSpaceMessageReaction(message,emoji){
 if(!currentUser||!active?.id)return;
 const messageId=String(message.id),spaceId=String(active.id),userId=String(currentUser.id);
 const existing=(spaceMessageReactionMap.get(messageId)||[]).find(group=>group.emoji===emoji&&group.users.includes(userId));
 try{
  const result=existing
   ?await getClient().from("space_message_reactions").delete().eq("message_id",messageId).eq("user_id",userId)
   :await getClient().from("space_message_reactions").upsert({message_id:messageId,space_id:spaceId,user_id:userId,emoji},{onConflict:"message_id,user_id"});
  if(result.error)throw result.error;
  await loadMessages(spaceId);
 }catch(error){const status=q("spaceMessageStatus");if(status)status.textContent=tr("ذخیره واکنش ناموفق بود: ","Could not save reaction: ")+(error?.message||String(error));}
}
function closeSpaceMessageMenu(){
 document.querySelectorAll(".space-message-actions,.space-message-action-backdrop,.space-message-action-clone,.message-tools,.message-action-backdrop,.message-action-clone").forEach(n=>n.remove());
 document.querySelectorAll(".space-message.context-active").forEach(n=>n.classList.remove("context-active"));
}
async function toggleSpaceMessagePin(message){
 const id=String(message.id),spaceId=String(active?.id||message.space_id||"");
 if(!spaceId)return;
 const status=q("spaceMessageStatus");
 try{
  if(spacePinnedMessageIds.has(id)){
   const {error}=await getClient().from("space_message_pins").delete().eq("message_id",id).eq("space_id",spaceId);
   if(error)throw error;
   spacePinnedMessageIds.delete(id);
   if(status)status.textContent=tr("سنجاق پیام برداشته شد.","Message unpinned.");
  }else{
   const {error}=await getClient().from("space_message_pins").insert({message_id:id,space_id:spaceId,pinned_by:currentUser.id});
   if(error)throw error;
   spacePinnedMessageIds.add(id);
   if(status)status.textContent=tr("پیام در گروه سنجاق شد.","Message pinned in this space.");
  }
  await loadMessages(spaceId);
 }catch(error){
  if(status)status.textContent=tr("سنجاق پیام ناموفق بود: ","Could not pin message: ")+(error?.message||String(error));
 }
}
function showSpaceMessageActions(m,item){
 if(spaceMessageSelectionMode){const id=String(m.id);selectedSpaceMessageIds.has(id)?selectedSpaceMessageIds.delete(id):selectedSpaceMessageIds.add(id);updateSpaceMessageSelection();return;}
 closeSpaceMessageMenu();
 const rect=item.getBoundingClientRect();
 const backdrop=document.createElement("div");backdrop.className="message-action-backdrop";backdrop.setAttribute("aria-hidden","true");
 backdrop.addEventListener("click",()=>closeSpaceMessageMenu());document.body.appendChild(backdrop);
 /* Keep the original message in place. No clone and no visibility toggling, so it cannot be left hidden after the menu closes. */
 item.classList.add("context-active");
 const restoreItem=()=>{item.classList.remove("context-active");};
 const menu=document.createElement("div");menu.className="message-tools message-tools-floating";
 const closeMenu=()=>{menu.remove();restoreItem();closeSpaceMessageMenu();};
 const add=(label,fn,cls="mini-button")=>{const b=document.createElement("button");b.type="button";b.className=cls;b.textContent=label;b.onclick=()=>{closeMenu();fn();};menu.appendChild(b);};
 const own=String(m.sender_id)===String(currentUser?.id);
 const quickReactions=document.createElement("div");quickReactions.className="message-quick-reactions";quickReactions.style.cssText="display:flex;align-items:center;justify-content:space-around;gap:7px;padding:7px 5px;margin:0 0 5px;border-radius:14px;background:var(--surface-2,rgba(128,128,128,.12))";
 for(const emoji of SPACE_MESSAGE_REACTION_CHOICES){const reaction=document.createElement("button");reaction.type="button";reaction.className="message-quick-reaction";reaction.textContent=emoji;reaction.setAttribute("aria-label",(english?"React ":"واکنش ")+emoji);reaction.style.cssText="border:0;background:transparent;padding:5px;font-size:22px;line-height:1;cursor:pointer";reaction.onclick=()=>{closeMenu();toggleSpaceMessageReaction(m,emoji);};quickReactions.appendChild(reaction);}
 menu.appendChild(quickReactions);
 add((spacePinnedMessageIds.has(String(m.id))?"📌  "+(english?"Unpin message":"برداشتن سنجاق"):"📌  "+(english?"Pin message":"سنجاق پیام")),()=>toggleSpaceMessagePin(m));
 if(active?.type!=="channel"||active?.allow_channel_replies===true)add("↩  "+(english?"Reply":"پاسخ"),()=>setSpaceReplyTarget(m));
 add("➦  "+(english?"Forward":"فوروارد"),()=>{selectedSpaceMessageIds.clear();selectedSpaceMessageIds.add(String(m.id));spaceMessageSelectionMode=true;updateSpaceMessageSelection();forwardSelectedSpaceMessages();});
 if(m.attachment_path)add("⬇  "+(english?"Download attachment":"دانلود فایل"),()=>downloadSpaceMessage(m),"mini-button download-message-action");
 add("☑  "+(english?"Select":"انتخاب"),()=>{spaceMessageSelectionMode=true;selectedSpaceMessageIds.add(String(m.id));updateSpaceMessageSelection();});
 if(own&&m.body)add("✎  "+(english?"Edit":"ویرایش"),()=>editSpaceMessage(m));
 add("🗑  "+(english?"Delete":"حذف"),async()=>{const scope=await askSpaceDeleteScope(1,own);if(!scope)return;try{if(scope==="me")await hideSpaceMessagesForMe([String(m.id)]);else{const {error}=await getClient().from("space_messages").delete().eq("id",m.id).eq("space_id",active.id).eq("sender_id",currentUser.id);if(error)throw error;}await loadMessages(active.id);q("spaceMessageStatus").textContent=scope==="me"?tr("پیام فقط از صفحه شما پنهان شد.","Message hidden from your view."):tr("پیام برای همه حذف شد.","Message deleted for everyone.");}catch(error){q("spaceMessageStatus").textContent=tr("حذف پیام ناموفق بود: ","Could not delete message: ")+(error?.message||String(error));}},"mini-button danger");
 const close=document.createElement("button");close.type="button";close.className="message-tools-dismiss";close.textContent="×";close.setAttribute("aria-label",english?"Close":"بستن");close.onclick=closeMenu;menu.appendChild(close);
 document.body.appendChild(menu);
 const menuRect=menu.getBoundingClientRect(),margin=12;let left=Math.max(margin,Math.min(rect.left+(rect.width-menuRect.width)/2,window.innerWidth-menuRect.width-margin));let top=rect.top-menuRect.height-8;
 if(top<margin)top=Math.min(window.innerHeight-menuRect.height-margin,rect.bottom+8);
 menu.style.left=left+"px";menu.style.top=Math.max(margin,top)+"px";
}
async function downloadSpaceMessage(message){
 let objectUrl=null;
 try{
  let blob,filename;
  if(message.attachment_path){const {data,error}=await getClient().storage.from("chat-attachments").download(message.attachment_path);if(error)throw error;blob=data;filename=message.attachment_name||("farnaz-"+(message.message_type||"file"));}
  else{blob=new Blob([message.body||""],{type:"text/plain;charset=utf-8"});filename="farnaz-message.txt";}
  objectUrl=URL.createObjectURL(blob);const a=document.createElement("a");a.href=objectUrl;a.download=filename;a.rel="noopener";a.style.display="none";document.body.appendChild(a);a.click();a.remove();
  if(/iPad|iPhone|iPod/.test(navigator.userAgent)&&!window.matchMedia("(display-mode: standalone)").matches)setTimeout(()=>{if(objectUrl)window.open(objectUrl,"_blank","noopener");},250);
  setTimeout(()=>{if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=null;},60000);
 }catch(error){q("spaceMessageStatus").textContent=tr("دانلود ناموفق بود: ","Download failed: ")+(error?.message||String(error));}
}
let editingSpaceMessageId=null;
function editSpaceMessage(message){
 if(String(message.sender_id)!==String(currentUser?.id)||!message.body)return;
 editingSpaceMessageId=String(message.id);const input=q("spaceText");input.value=message.body;input.focus();input.dispatchEvent(new Event("input",{bubbles:true}));q("spaceMessageStatus").textContent=tr("در حال ویرایش پیام؛ برای لغو متن را پاک کن و دکمه ارسال را بزن.","Editing message. Clear the text and submit to cancel.");
}
function bindSpaceMessageActions(element,message){
 let timer=null,startX=0,startY=0,held=false,lastTap=0,swipeX=0,swipeY=0;
 const cancel=()=>{if(timer){clearTimeout(timer);timer=null;}};
 const interactive=target=>!!target.closest("a,button,audio,video,input,textarea,select");
 element.addEventListener("click",event=>{
  if(held){event.preventDefault();event.stopPropagation();held=false;return;}
  if(spaceMessageSelectionMode){event.preventDefault();const id=String(message.id);selectedSpaceMessageIds.has(id)?selectedSpaceMessageIds.delete(id):selectedSpaceMessageIds.add(id);updateSpaceMessageSelection();return;}
  if(interactive(event.target))return;
  const now=Date.now();if(now-lastTap<330){lastTap=0;toggleSpaceMessageReaction(message,"👍");}else lastTap=now;
 });
 element.addEventListener("touchstart",event=>{if(event.touches.length===1&&!interactive(event.target)){swipeX=event.touches[0].clientX;swipeY=event.touches[0].clientY;}},{passive:true});
 element.addEventListener("touchend",event=>{if(!event.changedTouches.length||interactive(event.target))return;const dx=event.changedTouches[0].clientX-swipeX,dy=event.changedTouches[0].clientY-swipeY;if(dx>58&&Math.abs(dy)<48){event.preventDefault();event.stopPropagation();setSpaceReplyTarget(message);}},{passive:false});
 element.addEventListener("contextmenu",event=>{event.preventDefault();event.stopPropagation();showSpaceMessageActions(message,element);});
 element.addEventListener("touchstart",event=>{if(event.touches.length!==1||interactive(event.target))return;const t=event.touches[0];startX=t.clientX;startY=t.clientY;held=false;cancel();timer=setTimeout(()=>{held=true;showSpaceMessageActions(message,element);},500);},{passive:true});
 element.addEventListener("touchmove",event=>{const t=event.touches[0];if(t&&(Math.abs(t.clientX-startX)>12||Math.abs(t.clientY-startY)>12))cancel();},{passive:true});
 element.addEventListener("touchend",cancel,{passive:true});element.addEventListener("touchcancel",cancel,{passive:true});
 element.addEventListener("pointerdown",event=>{if(event.pointerType==="touch"||interactive(event.target))return;startX=event.clientX;startY=event.clientY;held=false;cancel();timer=setTimeout(()=>{held=true;showSpaceMessageActions(message,element);},500);});
 element.addEventListener("pointermove",event=>{if(event.pointerType!=="touch"&&(Math.abs(event.clientX-startX)>12||Math.abs(event.clientY-startY)>12))cancel();});
 ["pointerup","pointercancel","pointerleave"].forEach(type=>element.addEventListener(type,cancel));
}
async function loadMessages(id){
 if(!currentUser)return;
 const myId=String(currentUser.id),token=++messageLoadToken;const list=q("spaceMessages");if(!list)return;
 const isCurrent=()=>token===messageLoadToken&&String(currentUser?.id||"")===myId&&String(active?.id||"")===String(id);
 const wasNearBottom=list.scrollHeight-list.scrollTop-list.clientHeight<70;
 try{
  let data=[],fromLocalCache=false;
  try{
   const result=await withTimeout(getClient().from("space_messages").select("id,space_id,sender_id,body,created_at,edited_at,message_type,attachment_path,attachment_name,attachment_mime,attachment_size,reply_to_id").eq("space_id",id).order("created_at",{ascending:false}).order("id",{ascending:false}).limit(200),9000,"پیام‌های گروه یا کانال");
   if(result.error)throw result.error;
   data=(result.data||[]).reverse();
  }catch(fetchError){
   const cached=await window.FarnazLocalStore?.getSpaceMessages(myId,id).catch(()=>[]);
   if(!cached?.length)throw fetchError;
   data=cached;fromLocalCache=true;
   q("spaceMessageStatus").textContent=tr("پیام‌های ذخیره‌شده نمایش داده می‌شوند؛ اتصال را بررسی کن.","Showing saved messages; check your connection.");
  }
  if(!isCurrent())return;
  let hiddenIds=new Set();
  if(!fromLocalCache){
   try{const {data:hiddenRows,error:hiddenError}=await withTimeout(getClient().from("space_message_hidden").select("message_id").eq("user_id",myId),7000,"پیام‌های مخفی‌شده");if(hiddenError)throw hiddenError;if(!isCurrent())return;hiddenIds=new Set((hiddenRows||[]).map(x=>String(x.id||x.message_id)));}
   catch(e){if(!isCurrent())return;console.warn("Hidden space messages could not load:",e);const cachedVisible=await window.FarnazLocalStore?.getSpaceMessages(myId,id).catch(()=>[]);if(!isCurrent())return;if(cachedVisible?.length){data=cachedVisible;fromLocalCache=true;}else throw e;}
   try{const {data:pinnedRows,error:pinnedError}=await withTimeout(getClient().from("space_message_pins").select("message_id").eq("space_id",id),7000,"پیام‌های سنجاق‌شده");if(pinnedError)throw pinnedError;if(!isCurrent())return;spacePinnedMessageIds.clear();(pinnedRows||[]).forEach(row=>spacePinnedMessageIds.add(String(row.message_id)));}
   catch(e){console.warn("Pinned space messages could not load:",e);}
  }
  const rows=(data||[]).filter(m=>!hiddenIds.has(String(m.id)));
  spaceMessageReactionMap=new Map();
  if(!fromLocalCache&&rows.length){
   try{
    const ids=rows.map(m=>String(m.id));
    const {data:reactionRows,error:reactionError}=await getClient().from("space_message_reactions").select("message_id,user_id,emoji").eq("space_id",id).in("message_id",ids);
    if(reactionError)throw reactionError;
    const grouped=new Map();
    for(const reaction of reactionRows||[]){const key=String(reaction.message_id);if(!grouped.has(key))grouped.set(key,new Map());const byEmoji=grouped.get(key);if(!byEmoji.has(reaction.emoji))byEmoji.set(reaction.emoji,[]);byEmoji.get(reaction.emoji).push(String(reaction.user_id));}
    for(const [messageId,byEmoji] of grouped)spaceMessageReactionMap.set(messageId,[...byEmoji.entries()].map(([emoji,users])=>({emoji,users})));
   }catch(reactionError){console.warn("Space message reactions could not load:",reactionError);}
  }
  const replyIds=[...new Set(rows.map(m=>m.reply_to_id).filter(Boolean).map(String))];
  let repliedMessages=new Map();
  if(replyIds.length){try{const {data:replyRows,error:replyError}=await getClient().from("space_messages").select("id,sender_id,body,attachment_name").in("id",replyIds);if(replyError)throw replyError;repliedMessages=new Map((replyRows||[]).map(m=>[String(m.id),m]));}catch(replyError){console.warn("Space reply previews could not load:",replyError);}}
  const ownMessageIds=rows.filter(m=>!String(m.body||"").startsWith("[FARNAZ_SYSTEM]")&&String(m.sender_id)===String(currentUser?.id)).map(m=>String(m.id));
  const incomingMessageIds=rows.filter(m=>!String(m.body||"").startsWith("[FARNAZ_SYSTEM]")&&String(m.sender_id)!==String(currentUser?.id)).map(m=>String(m.id));
  let receiptResult={data:[],error:null};
  if(!fromLocalCache){
   try{
    const receiptRead=ownMessageIds.length?withTimeout(getClient().from("space_message_reads").select("message_id,user_id,read_at").eq("space_id",id).in("message_id",ownMessageIds),7000,"وضعیت خواندن پیام‌ها"):Promise.resolve({data:[],error:null});
    const markIncomingRead=(typeof privacySettings==="undefined"||privacySettings.show_read_receipts!==false)&&incomingMessageIds.length?getClient().from("space_message_reads").upsert(incomingMessageIds.map(message_id=>({space_id:id,message_id,user_id:myId})),{onConflict:"message_id,user_id",ignoreDuplicates:true}).then(({error})=>{if(error)console.warn("Farnaz read receipt could not be saved:",error.message);}):Promise.resolve();
    [receiptResult]=await Promise.all([receiptRead,markIncomingRead]);
    if(!isCurrent())return;
    if(receiptResult.error)throw receiptResult.error;
   }catch(e){if(!isCurrent())return;console.warn("Space read receipts unavailable:",e);}
  }
  const readByMessage=new Set((receiptResult?.data||[]).filter(r=>String(r.user_id)!==String(currentUser?.id)).map(r=>String(r.message_id)));
  if(!fromLocalCache){try{await window.FarnazLocalStore?.saveSpaceMessages(myId,id,rows);}catch(cacheError){console.warn("Cached space messages save:",cacheError);}}
  if(!isCurrent())return;
  const senderIds=[...new Set(rows.map(m=>m.sender_id).filter(Boolean).map(String))];
  const senderEntries=await Promise.all(senderIds.map(async senderId=>{try{return [senderId,await getCachedSpaceSenderName(senderId)];}catch(_){return [senderId,""];}}));
  const senderNames=new Map(senderEntries);
  const attachmentEntries=await Promise.all(rows.filter(m=>m.attachment_path).map(async m=>{try{return [String(m.id),await getCachedSpaceAttachmentUrl(m.attachment_path)];}catch(_){return [String(m.id),null];}}));
  const attachmentUrls=new Map(attachmentEntries);
  if(!isCurrent())return;
  const fragment=document.createDocumentFragment();
  // Force a physical left-to-right flex stack for group messages.
  list.style.setProperty("display","flex","important");
  list.style.setProperty("flex-direction","column","important");
  list.style.setProperty("direction","ltr","important");
  list.style.setProperty("align-items","stretch","important");
  if(!rows.length){const empty=document.createElement("div");empty.className="space-empty";empty.textContent=tr("هنوز پیامی نیست.","No posts yet.");fragment.appendChild(empty);}
  for(const m of rows){
   const isSystemNotice=String(m.body||"").startsWith("[FARNAZ_SYSTEM]");const el=document.createElement("div");el.className="space-message"+(isSystemNotice?" space-system-notice":"");el.dataset.messageId=String(m.id);el.dataset.messageSide=isSystemNotice?"system":String(m.sender_id)===String(currentUser?.id)?"own":"contact";if(selectedSpaceMessageIds.has(String(m.id))&&!isSystemNotice)el.classList.add("space-message-selected");
   const isOwnMessage=!isSystemNotice&&String(m.sender_id)===String(currentUser?.id);
   el.dataset.messageSide=isOwnMessage?"own":"contact";
   if(isOwnMessage)el.classList.add("mine");
   el.style.setProperty("display","block","important");
   el.style.setProperty("width","fit-content","important");
   el.style.setProperty("max-width","88%","important");
   el.style.setProperty("flex","0 0 auto","important");
   el.style.setProperty("position","relative","important");
   el.style.setProperty("align-self",isSystemNotice?"center":isOwnMessage?"flex-end":"flex-start","important");
   el.style.setProperty("margin-left","0","important");
   el.style.setProperty("margin-right","0","important");
   if(spacePinnedMessageIds.has(String(m.id))){const pin=document.createElement("small");pin.className="space-message-pin-indicator";pin.textContent="📌 "+tr("پیام سنجاق‌شده","Pinned message");pin.style.cssText="display:block;font-size:10px;font-weight:700;color:var(--mint,#50e3c2);margin:0 0 4px";el.appendChild(pin);}
   if(m.reply_to_id){
    const original=repliedMessages.get(String(m.reply_to_id));
    const quote=document.createElement("button");quote.type="button";quote.className="space-message-quote";quote.style.cssText="display:block;width:100%;text-align:start;border:0;border-inline-start:3px solid var(--accent,#22b8a5);border-radius:7px;padding:6px 9px;margin:0 0 6px;background:rgba(120,130,145,.12);color:inherit;font:inherit;cursor:pointer";
    const author=document.createElement("strong");author.style.cssText="display:block;font-size:11px;color:var(--accent,#159b8c)";author.textContent=original?(String(original.sender_id)===String(currentUser?.id)?tr("شما","You"):(senderNames.get(String(original.sender_id))||tr("عضو","Member"))):tr("پیام اصلی","Original message");
    const preview=document.createElement("span");preview.style.cssText="display:block;font-size:12px;opacity:.82;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";preview.textContent=original?(original.body||original.attachment_name||tr("پیوست","Attachment")):tr("پیام در دسترس نیست","Message unavailable");
    quote.append(author,preview);quote.addEventListener("click",event=>{event.stopPropagation();const target=list.querySelector('[data-message-id="'+String(m.reply_to_id)+'"]');if(target){target.scrollIntoView({behavior:"smooth",block:"center"});target.classList.add("contact-info-search-match");setTimeout(()=>target.classList.remove("contact-info-search-match"),1800);}});el.appendChild(quote);
   }
   const senderName=isSystemNotice?"":senderNames.get(String(m.sender_id))||"";
   if(senderName){const author=document.createElement("small");author.className="space-message-author";author.textContent=String(m.sender_id)===String(currentUser?.id)?tr("شما","You"):senderName;author.style.cssText="display:block;font-weight:700;font-size:11px;opacity:.85;margin:0 0 4px";el.appendChild(author);}
   if(m.body){const body=document.createElement("div");body.textContent=isSystemNotice?String(m.body).replace(/^\[FARNAZ_SYSTEM\]\s*/,""):String(m.body);el.appendChild(body);}
   if(m.attachment_path){const signedUrl=attachmentUrls.get(String(m.id));if(signedUrl){if((m.message_type||"file")==="image"){const img=document.createElement("img");img.src=signedUrl;img.alt=m.attachment_name||"Photo";img.loading="lazy";img.style.cssText="display:block;max-width:100%;max-height:320px;border-radius:10px;margin-top:5px";el.appendChild(img);}else if((m.attachment_mime||"").startsWith("audio/")){const audio=document.createElement("audio");audio.controls=true;audio.preload="metadata";audio.src=signedUrl;audio.style.cssText="display:block;max-width:240px;margin-top:5px";audio.setAttribute("aria-label",m.attachment_name||"Voice message");el.appendChild(audio);}else{const link=document.createElement("a");link.href=signedUrl;link.target="_blank";link.rel="noopener";link.download=m.attachment_name||"";link.textContent="📎 "+(m.attachment_name||tr("دریافت فایل","Download file"));link.style.cssText="display:block;margin-top:5px;overflow-wrap:anywhere;color:inherit";el.appendChild(link);}}else{const warn=document.createElement("small");warn.textContent=tr("پیوست در دسترس نیست","Attachment unavailable");el.appendChild(warn);}}
   const meta=document.createElement("div");meta.className="space-message-meta";
   const time=document.createElement("small");time.className="space-message-time";
   const created=m.created_at?new Date(m.created_at):new Date();
   time.textContent=created.toLocaleTimeString(typeof english!=="undefined"&&english?"en":"fa-IR",{hour:"2-digit",minute:"2-digit"})+(m.edited_at?tr(" · ویرایش‌شده"," · edited"):"");
   if(isOwnMessage){
    const receipt=document.createElement("small");receipt.className="space-message-read-status";receipt.textContent=readByMessage.has(String(m.id))?"✓✓":"✓";
    receipt.title=readByMessage.has(String(m.id))?tr("حداقل یک عضو خوانده است","Read by at least one member") : tr("ارسال‌شده؛ هنوز خوانده نشده","Sent; not read yet");
    receipt.setAttribute("aria-label",receipt.title);
    receipt.style.cssText="display:inline-block;margin:0;font-size:12px;letter-spacing:-2px;color:"+(readByMessage.has(String(m.id))?"#20a66a":"var(--muted,#8a94a6)")+";font-weight:700";
    meta.appendChild(receipt);
   }
   meta.appendChild(time);el.appendChild(meta);
   const reactionGroups=spaceMessageReactionMap.get(String(m.id))||[];
   if(reactionGroups.length){const bar=document.createElement("div");bar.className="message-reactions";bar.style.cssText="display:flex;flex-wrap:wrap;gap:4px;margin-top:5px";for(const group of reactionGroups){const chip=document.createElement("button");chip.type="button";chip.className="message-reaction-chip"+(group.users.includes(String(currentUser?.id))?" mine":"");chip.textContent=group.emoji+" "+group.users.length;chip.setAttribute("aria-label",group.emoji+" "+group.users.length);chip.addEventListener("click",event=>{event.stopPropagation();toggleSpaceMessageReaction(m,group.emoji);});bar.appendChild(chip);}el.appendChild(bar);}
   bindSpaceMessageActions(el,m);fragment.appendChild(el);
  }
  if(token!==messageLoadToken||active?.id!==id)return;
  list.replaceChildren(fragment);
  if(wasNearBottom)list.scrollTop=list.scrollHeight;
 }catch(e){if(!isCurrent())return;const status=q("spaceMessageStatus");if(status)status.textContent=tr("دریافت پیام ناموفق بود: ","Could not load posts: ")+(e?.message||String(e)||"Unknown error");}
}
let sendingMessage=false,spaceRecordedVoiceFile=null,spaceRecordingStream=null,spaceMediaRecorder=null,spaceAudioChunks=[],spaceVoiceUrl=null,spaceReplyTarget=null,spaceMessageReactionMap=new Map();
const SPACE_MESSAGE_REACTION_CHOICES=["👍","❤️","😂","😮","😢","🙏"];
function clearSpaceVoice(){const player=q("spaceVoicePlayer");if(player){player.pause();player.removeAttribute("src");player.load();}if(spaceVoiceUrl){URL.revokeObjectURL(spaceVoiceUrl);spaceVoiceUrl=null;}spaceRecordedVoiceFile=null;q("spaceVoicePreview").hidden=true;}
function showSpaceVoice(){const player=q("spaceVoicePlayer");if(spaceVoiceUrl)URL.revokeObjectURL(spaceVoiceUrl);spaceVoiceUrl=URL.createObjectURL(spaceRecordedVoiceFile);player.src=spaceVoiceUrl;q("spaceVoiceSize").textContent=Math.ceil(spaceRecordedVoiceFile.size/1024)+" KB";q("spaceVoicePreview").hidden=false;}
async function toggleSpaceVoice(){const btn=q("spaceVoiceButton");if(spaceMediaRecorder?.state==="recording"){btn.disabled=true;spaceMediaRecorder.stop();q("spaceMessageStatus").textContent=tr("در حال آماده‌سازی صدای ضبط‌شده…","Finishing recording…");return;}if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined"){q("spaceMessageStatus").textContent=tr("ضبط صدا در این مرورگر پشتیبانی نمی‌شود.","Audio recording is not supported in this browser.");return;}try{clearSpaceVoice();spaceRecordingStream=await navigator.mediaDevices.getUserMedia({audio:true});const types=["audio/mp4","audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus"],mime=types.find(t=>MediaRecorder.isTypeSupported?.(t));spaceMediaRecorder=mime?new MediaRecorder(spaceRecordingStream,{mimeType:mime}):new MediaRecorder(spaceRecordingStream);const recorder=spaceMediaRecorder;spaceAudioChunks=[];recorder.ondataavailable=e=>{if(e.data?.size)spaceAudioChunks.push(e.data);};recorder.onerror=()=>{spaceRecordingStream?.getTracks().forEach(t=>t.stop());spaceRecordingStream=null;spaceMediaRecorder=null;btn.disabled=false;btn.textContent="🎙";btn.classList.remove("recording");q("spaceMessageStatus").textContent=tr("ضبط صدا ناموفق بود؛ دوباره تلاش کن.","Recording failed; try again.");};recorder.onstop=()=>{const type=recorder.mimeType||spaceAudioChunks[0]?.type||"audio/mp4",blob=new Blob(spaceAudioChunks,{type}),ext=type.includes("mp4")?"m4a":type.includes("ogg")?"ogg":"webm";spaceRecordedVoiceFile=blob.size?new File([blob],"voice-message."+ext,{type}):null;spaceRecordingStream?.getTracks().forEach(t=>t.stop());spaceRecordingStream=null;spaceMediaRecorder=null;btn.disabled=false;btn.textContent="🎙";btn.classList.remove("recording");if(window.FarnazConversationMode!=="space"){spaceRecordedVoiceFile=null;return;}if(spaceRecordedVoiceFile){q("spacePhotoFile").value="";q("spaceCameraFile").value="";q("spaceAttachmentFile").value="";showSpaceVoice();q("spaceMessageStatus").textContent=tr("صدای ضبط‌شده آماده است؛ گوش بده و سپس ارسال کن.","Voice message ready. Review it, then send.");}else q("spaceMessageStatus").textContent=tr("صدایی ضبط نشد؛ دوباره تلاش کن.","No audio captured; try again.");};recorder.start();btn.classList.add("recording");btn.textContent="■";q("spaceMessageStatus").textContent=tr("در حال ضبط… برای پایان، دوباره دکمه را بزن.","Recording… tap again to stop.");}catch(e){spaceRecordingStream?.getTracks().forEach(t=>t.stop());spaceRecordingStream=null;q("spaceMessageStatus").textContent=tr("برای ضبط پیام صوتی باید اجازه دسترسی به میکروفون بدهی.","Microphone permission is required.");}}
function sendSpaceTyping(typing){
 if(!sub||!active||!currentUser||privacySettings?.show_typing===false)return;
 sub.send({type:"broadcast",event:"typing",payload:{from:currentUser.id,typing:!!typing}});
}
async function send(event){
 event.preventDefault();
 if(!active||sendingMessage||!currentUser)return;
 const senderId=String(currentUser.id),spaceId=String(active.id),editId=editingSpaceMessageId;
 const input=q("spaceText"),body=input.value.trim(),file=spaceRecordedVoiceFile||q("spaceAttachmentFile").files[0]||q("spacePhotoFile").files[0]||q("spaceCameraFile").files[0];
 const restoreComposerFocus=document.activeElement===input;
 if(!body&&!file)return;
 if(spaceMediaRecorder?.state==="recording"){q("spaceMessageStatus").textContent=tr("پیش از ارسال، ضبط را متوقف کن.","Stop recording before sending.");return;}
 if(file&&file.size>20*1024*1024){q("spaceMessageStatus").textContent=tr("حجم فایل باید حداکثر ۲۰ مگابایت باشد.","Choose a file up to 20 MB.");return;}
 if(editId&&file){q("spaceMessageStatus").textContent=tr("برای ویرایش پیام، ابتدا پیوست را جداگانه ارسال کن.","Attachments cannot be changed while editing a message.");return;}
 const sendFingerprint=JSON.stringify([senderId,spaceId,body,spaceReplyTarget?.id||null,file?.name||"",file?.size||0,file?.lastModified||0,file?.type||""]);
 const pendingSend=editId?null:(pendingSpaceSend?.fingerprint===sendFingerprint&&pendingSpaceSend.fileRef===(file||null)?pendingSpaceSend:{fingerprint:sendFingerprint,fileRef:file||null,id:crypto.randomUUID(),attachmentPath:null});
 if(pendingSend)pendingSpaceSend=pendingSend;
 const sameAccount=()=>String(currentUser?.id||"")===senderId;
 const sameSpace=()=>sameAccount()&&String(active?.id||"")===spaceId;
 sendingMessage=true;const btn=q("spaceSendButton");btn.disabled=true;input.readOnly=true;q("spaceMessageStatus").textContent=tr("در حال ارسال…","Sending…");
 let path=null;
 try{
  const client=getClient();
  const {data:sessionData,error:sessionError}=await client.auth.getSession();
  if(sessionError)throw sessionError;
  if(!sameAccount()||String(sessionData?.session?.user?.id||"")!==senderId)throw new Error(tr("نشست حساب تغییر کرده یا منقضی شده؛ دوباره وارد شو.","Session changed or expired. Sign in again."));
  let attachment_name=null,attachment_mime=null,attachment_size=null,message_type="text";
  if(file){
   const safeName=(file.name||"attachment").replace(/[^a-zA-Z0-9._-]/g,"_").slice(-120)||"attachment";
   const ext=(safeName.split(".").pop()||"bin").toLowerCase().replace(/[^a-z0-9]/g,"")||"bin";
   pendingSend.attachmentPath=pendingSend.attachmentPath||senderId+"/spaces/"+pendingSend.id+"."+ext;
   path=pendingSend.attachmentPath;
   const {error:uploadError}=await client.storage.from("chat-attachments").upload(path,file,{contentType:file.type||"application/octet-stream",upsert:false});
   if(uploadError){const conflict=String(uploadError.statusCode||uploadError.status||"")==="409"||/already exists|duplicate/i.test(String(uploadError.message||""));if(!conflict)throw uploadError;}
   if(!sameAccount())throw new Error(tr("حساب هنگام بارگذاری تغییر کرد؛ دوباره وارد شو.","Account changed while uploading. Sign in again."));
   attachment_name=safeName;attachment_mime=file.type||"application/octet-stream";attachment_size=file.size;message_type=file.type.startsWith("image/")?"image":"file";
  }
  if(!sameSpace())throw new Error(tr("فضای گفتگو تغییر کرده؛ دوباره تلاش کن.","The active conversation changed. Please retry."));
  if(editId){
   if(!body)throw new Error(tr("متن پیام نمی‌تواند خالی باشد.","Message text cannot be empty."));
   const {error}=await client.from("space_messages").update({body,edited_at:new Date().toISOString()}).eq("id",editId).eq("space_id",spaceId).eq("sender_id",senderId);
   if(error)throw error;
   if(!sameSpace())return;
   editingSpaceMessageId=null;
  }else{
   const {error:insertError}=await client.from("space_messages").insert({id:pendingSend.id,space_id:spaceId,sender_id:senderId,body:body||null,message_type,attachment_path:path,attachment_name,attachment_mime,attachment_size,reply_to_id:spaceReplyTarget?.id||null});
   if(insertError){
    // Reconcile an ambiguous mobile timeout before a manual retry can duplicate a post.
    const {data:existing,error:lookupError}=await client.from("space_messages").select("id,space_id,sender_id,body,created_at,edited_at,message_type,attachment_path,attachment_name,attachment_mime,attachment_size").eq("id",pendingSend.id).maybeSingle();
    if(!existing||lookupError)throw insertError;
   }
   path=null;pendingSpaceSend=null;
  }
  if(!sameSpace())return;
  input.value="";cancelSpaceReply();input.style.height="38px";q("spacePhotoFile").value="";q("spaceCameraFile").value="";q("spaceAttachmentFile").value="";clearSpaceVoice();q("spaceAttachmentMenu").hidden=true;q("spaceAttachmentButton").setAttribute("aria-expanded","false");
  await loadMessages(spaceId);
  if(sameSpace())q("spaceMessageStatus").textContent=tr("پیام ارسال شد.","Message sent.");
 }catch(e){
  // An insert may already be committed despite a lost response; keep its stable attachment path intact.
  if(!sameAccount())return;
  if(sameSpace())q("spaceMessageStatus").textContent=tr("ارسال پیام ناموفق بود؛ متن و پیوست را نگه داشته‌ایم. برای تلاش دوباره، دکمه ارسال را بزن: ","Could not send; your text and attachment are preserved. Tap Send to retry: ")+(e?.message||String(e));
 }finally{
  sendingMessage=false;btn.disabled=false;input.readOnly=false;
  if(restoreComposerFocus&&sameSpace()){try{input.focus({preventScroll:true});}catch(_){input.focus();}}
 }
}
async function join(){const code=q("spaceInvite").value.trim().toUpperCase();if(!code)return;q("spacesStatus").textContent=tr("در حال عضویت…","Joining…");try{const {data,error}=await getClient().rpc("join_space_by_invite",{p_invite_code:code});if(error)throw error;q("spaceInvite").value="";const url=new URL(window.location.href);if(url.searchParams.has("join")){url.searchParams.delete("join");history.replaceState(history.state,"",url.pathname+url.search+url.hash);}await refresh();await open(data);}catch(e){q("spacesStatus").textContent=tr("عضویت ناموفق بود: ","Could not join: ")+e.message;}}
async function addMembers(){const ids=selected("spaceAddContacts");if(!ids.length){q("spaceAddStatus").textContent=tr("مخاطبی انتخاب نشده.","Select at least one contact.");return;}try{const {error}=await getClient().from("space_members").upsert(ids.map(user_id=>({space_id:active.id,user_id,role:"member"})),{onConflict:"space_id,user_id",ignoreDuplicates:true});if(error)throw error;q("spaceAddDialog").hidden=true;await open(active.id);if(active&&["group","channel"].includes(active.type))await openSpaceInfo();}catch(e){q("spaceAddStatus").textContent=e.message;}}
function back(){if(active)spaceComposerDrafts.set(String(active.id),q("spaceText").value);window.FarnazConversationMode="private";if(spaceMediaRecorder?.state==="recording"){try{spaceMediaRecorder.stop();}catch(_){}}spaceRecordingStream?.getTracks().forEach(t=>t.stop());spaceRecordingStream=null;clearSpaceVoice();active=null;if(sub){getClient().removeChannel(sub);sub=null;}window.FarnazConversationBack=null;document.querySelector(".app")?.classList.remove("spaces-chat-mode");document.body.classList.remove("spaces-chat-mode");document.querySelector("#chatPage .space-call-actions")?.removeAttribute("hidden");q("spaceDetail").hidden=true;q("spaceComposer").hidden=false;q("spaceText").value=privateComposerDraft;q("spaceAttachmentButton").hidden=false;q("spaceVoiceButton").hidden=false;q("spaceMessageStatus").textContent="";q("spaceAttachmentMenu").hidden=true;q("spaceList").hidden=false;document.querySelector(".spaces-head").hidden=false;document.querySelector(".spaces-tabs").hidden=false;document.querySelector(".spaces-actions").hidden=false;q("spacesStatus").hidden=false;q("backSpaces").onclick=()=>backFromChat();q("spaceName").onclick=()=>openContactInfo();q("spaceName").onkeydown=null;q("spaceMeta").onclick=null;q("spaceMeta").onkeydown=null;q("spaceIcon").onclick=()=>openContactInfo();q("spaceComposer").onsubmit=null;q("spaceAttachmentButton").onclick=()=>toggleAttachmentMenu();q("spaceVoiceButton").onclick=()=>toggleAudioRecording();q("spaceDiscardVoice").onclick=()=>discardRecordedVoice();q("spaceAttachmentMenu").querySelectorAll("[data-space-attachment]").forEach(b=>b.onclick=()=>chooseAttachment(b.dataset.spaceAttachment));if(typeof navigate==="function")navigate("spacesPage");else q("bottomNav")?.classList.add("visible");refresh();}
window.FarnazConversationBack=back;
function setLanguage(){
 const en=typeof english!=="undefined"&&english;
 const ct=q("spaceCropTitle"),ch=q("spaceCropHelp"),cz=q("spaceCropZoomLabel"),cc=q("spaceCropCancel"),cf=q("spaceCropConfirm");if(ct)ct.textContent=en?"Adjust photo":"تنظیم کادر عکس";if(ch)ch.textContent=en?"Drag the photo to position the crop.":"عکس را بکش تا قسمت دلخواه داخل دایره قرار بگیرد.";if(cz)cz.textContent=en?"Zoom":"بزرگ‌نمایی";if(cc)cc.textContent=en?"Cancel":"انصراف";if(cf)cf.textContent=en?"Confirm crop":"تأیید کادر";
 const values={spacesTitle:en?"Groups & channels":"گروه‌ها و کانال‌ها",spacesIntro:en?"Group chats and broadcast channels":"گفت‌وگوهای جمعی و کانال‌های اطلاع‌رسانی",createSpaceBtn:en?"+ Create":"＋ ایجاد",navSpacesBtn:en?"◎ Spaces":"◎ گروه‌ها",joinSpaceBtn:en?"Join with code":"عضویت با کد",spaceInvite:en?"Group or channel invite code":"کد دعوت گروه یا کانال",backSpaces:en?"← Back":"← بازگشت"};const inviteUi={spaceInviteTitle:en?"Invite link & code":"لینک و کد دعوت",spaceInviteHelp:en?"Share this link or code only with people you want to invite.":"این لینک یا کد را فقط با افرادی که می‌خواهی عضو شوند به اشتراک بگذار.",copySpaceInviteCode:en?"Copy code":"کپی کد",copySpaceInviteLink:en?"Copy link":"کپی لینک",spaceInviteLinkDisplay:en?"Invite link":"لینک دعوت",regenerateSpaceInvite:en?"Revoke old invite and create a new one":"لغو لینک قبلی و ساخت دعوت جدید"};for(const [id,value] of Object.entries(inviteUi)){const el=q(id);if(el)el.textContent=value;}
 for(const [id,value] of Object.entries(values)){const el=q(id);if(!el)continue;if(id==="spaceInvite")el.placeholder=value;else if(id==="navSpacesBtn")el.lastElementChild.textContent=en?"Spaces":"گروه‌ها";else el.textContent=value;}
 const attachmentLabels=en?["Choose photo","Take photo","Choose file"]:["انتخاب عکس","گرفتن عکس با دوربین","انتخاب فایل"];q("spaceAttachmentMenu")?.querySelectorAll("[data-space-attachment]").forEach((b,i)=>{if(b.lastElementChild)b.lastElementChild.textContent=attachmentLabels[i];});const voiceLabel=q("spaceVoicePreview")?.querySelector(".space-voice-preview-heading span");if(voiceLabel)voiceLabel.textContent=en?"Voice message ready to send":"پیام صوتی آماده ارسال";const textInput=q("spaceText");if(textInput){textInput.placeholder=en?"Write a message…":"پیامت را بنویس…";textInput.setAttribute("aria-label",en?"Message text":"متن پیام گروهی");}const attachButton=q("spaceAttachmentButton");if(attachButton){attachButton.title=en?"Add attachment":"افزودن پیوست";attachButton.setAttribute("aria-label",attachButton.title);}const voiceButton=q("spaceVoiceButton");if(voiceButton){voiceButton.title=en?"Voice message":"پیام صوتی";voiceButton.setAttribute("aria-label",en?"Record voice message":"ضبط پیام صوتی");}const sendButton=q("spaceSendButton");if(sendButton){sendButton.title=en?"Send message":"ارسال پیام";sendButton.setAttribute("aria-label",sendButton.title);}
 document.querySelectorAll("[data-filter]").forEach(b=>{const k=b.dataset.filter;b.textContent=k==="all"?(en?"All":"همه"):k==="group"?(en?"Groups":"گروه‌ها"):k==="channel"?(en?"Channels":"کانال‌ها"):(en?"Archive":"آرشیو");});
}
function wire(){
 q("createSpaceBtn").onclick=()=>{if(!currentUser){openAuth();return;}q("spaceCreateStatus").textContent="";q("spaceNewName").value="";q("spaceNewDesc").value="";q("spaceType").value="group";syncType();q("spaceCreateDialog").hidden=false;contacts("spaceContacts");};
 q("closeSpaceDialog").onclick=q("cancelSpaceCreate").onclick=()=>q("spaceCreateDialog").hidden=true;
 q("spaceType").onchange=syncType;q("spaceCreateForm").onsubmit=create;q("joinSpaceBtn").onclick=join;q("spaceInvite").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();join();}};
 document.querySelectorAll("[data-filter]").forEach(b=>b.onclick=()=>{document.querySelectorAll("[data-filter]").forEach(x=>x.classList.toggle("active",x===b));closeSpaceSwipeActions();refresh();});
 q("backSpaces").onclick=back;q("spaceName").onclick=()=>{if(active&&["group","channel"].includes(active.type))openSpaceInfo();};q("spaceIcon").onclick=event=>{if(event?.target?.closest?.("img"))return;if(active&&["group","channel"].includes(active.type))openSpaceInfo();};q("spaceMeta").onclick=()=>{if(active&&["group","channel"].includes(active.type))openSpaceInfo();};q("spaceName").onkeydown=q("spaceMeta").onkeydown=e=>{if((e.key==="Enter"||e.key===" ")&&active&&["group","channel"].includes(active.type)){e.preventDefault();openSpaceInfo();}};q("closeSpaceInfo").onclick=()=>q("spaceInfoDialog").hidden=true;q("closeSpaceInvite").onclick=()=>q("spaceInviteDialog").hidden=true;q("copySpaceInviteCode").onclick=()=>copyInvite("code");q("copySpaceInviteLink").onclick=()=>copyInvite("link");q("regenerateSpaceInvite").onclick=regenerateInvite;q("closeSpaceEdit").onclick=q("cancelSpaceEdit").onclick=()=>q("spaceEditDialog").hidden=true;q("spaceEditForm").onsubmit=saveSpaceInfo;initCrop();q("spaceEditPhoto").addEventListener("change",async e=>{let input=e.currentTarget,file=input.files?.[0];if(!file)return;if(!file.type.startsWith("image/")||file.size>5*1024*1024){input.value="";q("spaceEditStatus").textContent=tr("عکس باید تصویری و حداکثر ۵ مگابایت باشد.","Choose an image up to 5 MB.");return;}try{let cropped=await cropOpen(file);if(!cropped){input.value="";return;}let dt=new DataTransfer();dt.items.add(cropped);input.files=dt.files;q("spaceEditStatus").textContent=tr("کادر تأیید شد؛ برای ثبت عکس گروه «ذخیره» را بزن.","Crop confirmed. Press Save to update the group photo.");}catch(err){input.value="";q("spaceEditStatus").textContent=err.message||String(err);}});q("spaceComposer").onsubmit=send;q("spaceText").addEventListener("input",()=>{if(!active)return;const t=q("spaceText");spaceComposerDrafts.set(String(active.id),t.value);t.style.height="auto";t.style.height=Math.min(t.scrollHeight,112)+"px";if(privacySettings?.show_typing!==false){sendSpaceTyping(!!t.value.trim());if(spaceTypingTimer)clearTimeout(spaceTypingTimer);if(t.value.trim())spaceTypingTimer=setTimeout(()=>sendSpaceTyping(false),1800);}});q("spaceText").addEventListener("keydown",e=>{if(!active)return;if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();q("spaceComposer").requestSubmit();}});q("spaceAttachmentButton").onclick=()=>{const menu=q("spaceAttachmentMenu"),open=menu.hidden;menu.hidden=!open;q("spaceAttachmentButton").setAttribute("aria-expanded",String(open));};q("spaceAttachmentMenu").querySelectorAll("[data-space-attachment]").forEach(b=>b.onclick=()=>{q("spaceAttachmentMenu").hidden=true;q("spaceAttachmentButton").setAttribute("aria-expanded","false");const kind=b.dataset.spaceAttachment,target=kind==="photo"?"spacePhotoFile":kind==="camera"?"spaceCameraFile":"spaceAttachmentFile";q(target).click();});["spacePhotoFile","spaceCameraFile","spaceAttachmentFile"].forEach(id=>q(id).addEventListener("change",()=>{const f=q(id).files[0];if(!f)return;clearSpaceVoice();if(f.size>20*1024*1024){q(id).value="";q("spaceMessageStatus").textContent=tr("حجم فایل باید حداکثر ۲۰ مگابایت باشد.","Choose a file up to 20 MB.");return;}q("spaceMessageStatus").textContent=tr("آماده ارسال: ","Ready to send: ")+f.name+" · "+Math.ceil(f.size/1024)+" KB";}));q("spaceVoiceButton").onclick=toggleSpaceVoice;q("spaceDiscardVoice").onclick=clearSpaceVoice;q("closeAddDialog").onclick=q("cancelAddContacts").onclick=()=>{q("spaceAddDialog").hidden=true;if(active&&["group","channel"].includes(active.type))q("spaceInfoDialog").hidden=false;};q("saveAddContacts").onclick=addMembers;
 setLanguage();const oldToggle=window.toggleLanguage;if(typeof oldToggle==="function"&&!oldToggle.__spacesWrapped){const wt=function(){oldToggle();setLanguage();};wt.__spacesWrapped=true;window.toggleLanguage=wt;}const old=window.navigate;if(typeof old==="function"&&!old.__spaces){const nw=function(id,options){if(active&&id!=="chatPage"&&q("spaceDetail")&&!q("spaceDetail").hidden)back();old(id,options);if(id==="chatPage"&&active){document.querySelector(".app")?.classList.add("spaces-chat-mode");document.body.classList.add("spaces-chat-mode");q("spaceList").hidden=true;document.querySelector(".spaces-head").hidden=true;document.querySelector(".spaces-tabs").hidden=true;document.querySelector(".spaces-actions").hidden=true;q("spacesStatus").hidden=true;}else if(id==="spacesPage"){document.querySelector(".app")?.classList.remove("spaces-chat-mode");document.body.classList.remove("spaces-chat-mode");q("spaceDetail").hidden=true;q("spaceList").hidden=false;document.querySelector(".spaces-head").hidden=false;document.querySelector(".spaces-tabs").hidden=false;document.querySelector(".spaces-actions").hidden=false;q("spacesStatus").hidden=false;refresh();}else{document.querySelector(".app")?.classList.remove("spaces-chat-mode");document.body.classList.remove("spaces-chat-mode");}};nw.__spaces=true;window.navigate=nw;}
}
window.addEventListener("farnaz-auth-user",event=>{
 const userId=event.detail?.userId;
 if(userId&&draftOwnerId&&draftOwnerId!==String(userId)){privateComposerDraft="";spaceComposerDrafts.clear();}
 draftOwnerId=userId?String(userId):null;
 if(!userId){
  privateComposerDraft="";spaceComposerDrafts.clear();window.FarnazConversationMode="private";window.FarnazConversationBack=null;
  spaceOpenToken++;spaceRefreshToken++;messageLoadToken++;
  active=null;spaces=[];
  if(sub){const previous=sub;sub=null;try{getClient().removeChannel(previous).catch(()=>{});}catch(_){}}
  if(q("spaceDetail"))q("spaceDetail").hidden=true;
  if(q("spaceList"))q("spaceList").replaceChildren();
  if(q("spaceMessages"))q("spaceMessages").replaceChildren();
  document.querySelector(".app")?.classList.remove("spaces-chat-mode");
  document.body.classList.remove("spaces-chat-mode");
  return;
 }
 setTimeout(()=>{
  if(currentUser?.id!==userId)return;
  if(q("spacesPage")?.classList.contains("active"))refresh();
 },500);
});
window.addEventListener("farnaz-presence-updated",()=>{if(active&&q("spaceInfoDialog")&&!q("spaceInfoDialog").hidden)openSpaceInfo().catch(()=>{});});
function boot(){const page=q("spacesPage");if(page&&q("spaceList")&&q("spaceDetail")&&q("spaceComposer")&&q("createSpaceBtn"))return;if(page)page.remove();const staleNav=q("navSpacesBtn");if(staleNav)staleNav.remove();try{build();wire();}catch(error){console.error("Farnaz groups initialization failed:",error);const status=q("spacesStatus");if(status)status.textContent=tr("راه‌اندازی صفحه گروه‌ها ناموفق بود: ","Groups page failed to initialize: ")+(error?.message||String(error));return;}const inviteParam=new URLSearchParams(window.location.search).get("join");if(inviteParam){q("spaceInvite").value=inviteParam.trim().toUpperCase();q("spacesStatus").textContent=tr("کد دعوت آماده است؛ برای عضویت، پس از ورود دکمه «عضویت با کد» را بزن.","Invite code loaded. Sign in, then tap Join with code.");if(typeof navigate==="function")navigate("spacesPage");}}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();