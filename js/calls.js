(function(){
"use strict";
let signedInUserId=null,inboxChannel=null,activeCall=null,userSwitchSequence=0,callStartInProgress=false;
const processedSignals=new Set(),pendingIncomingSessions=new Set();
const byId=id=>document.getElementById(id);
const tr=(fa,en)=>typeof english!=="undefined"&&english?en:fa;
let ringtoneContext=null,ringtoneTimer=null,ringtoneUnlocked=false;
function unlockRingtoneAudio(){
  try{
    const AudioContextClass=window.AudioContext||window.webkitAudioContext;
    if(!AudioContextClass)return;
    if(!ringtoneContext)ringtoneContext=new AudioContextClass();
    if(ringtoneContext.state==="suspended")ringtoneContext.resume().then(()=>{ringtoneUnlocked=ringtoneContext.state==="running";}).catch(()=>{});
    else ringtoneUnlocked=true;
  }catch(error){console.warn("Ringtone audio unavailable:",error);}
}
function playRingBurst(){
  if(!ringtoneContext||ringtoneContext.state!=="running")return;
  const ctx=ringtoneContext,now=ctx.currentTime;
  [440,480].forEach((frequency,index)=>{
    const oscillator=ctx.createOscillator(),gain=ctx.createGain();
    oscillator.type="sine";oscillator.frequency.value=frequency;
    gain.gain.setValueAtTime(0,now);
    gain.gain.linearRampToValueAtTime(0.075,now+0.045);
    gain.gain.setValueAtTime(0.075,now+0.72);
    gain.gain.linearRampToValueAtTime(0,now+0.82);
    oscillator.connect(gain);gain.connect(ctx.destination);
    oscillator.start(now);oscillator.stop(now+0.84);
  });
}
function startRingtone(){
  stopRingtone();
  unlockRingtoneAudio();
  if(ringtoneContext?.state==="running")playRingBurst();
  ringtoneTimer=setInterval(()=>playRingBurst(),2600);
}
function stopRingtone(){
  if(ringtoneTimer){clearInterval(ringtoneTimer);ringtoneTimer=null;}
}
document.addEventListener("pointerdown",unlockRingtoneAudio,{capture:true,passive:true});
document.addEventListener("touchend",unlockRingtoneAudio,{capture:true,passive:true});


function ensureDialog(){
  let dialog=byId("farnazCallDialog");
  // Older or partially restored UI may contain the dialog shell without all
  // required controls. Rebuild its contents instead of returning an incomplete
  // dialog that later causes null-element errors during call startup.
  if(dialog&&byId("farnazCallHangup"))return dialog;
  if(!dialog){
    dialog=document.createElement("section");
    dialog.id="farnazCallDialog";dialog.className="farnaz-call-dialog";dialog.hidden=true;
    dialog.setAttribute("role","dialog");dialog.setAttribute("aria-modal","true");
    dialog.setAttribute("aria-labelledby","farnazCallTitle");
  }
  dialog.innerHTML='<div class="farnaz-call-card"><div class="farnaz-call-top"><strong id="farnazCallTitle">تماس فرناز</strong><button type="button" id="farnazCallClose" aria-label="بستن پنجره تماس">×</button></div><p id="farnazCallStatus" role="status" aria-live="polite"></p><div class="farnaz-call-media"><video id="farnazLocalVideo" autoplay muted playsinline hidden></video><video id="farnazRemoteVideo" autoplay playsinline hidden></video><audio id="farnazRemoteAudio" autoplay playsinline></audio></div><div class="farnaz-call-toolbar"><div class="farnaz-call-controls" id="farnazCallControls" hidden><button type="button" id="farnazCallSpeaker" aria-label="بلندگو" aria-pressed="false" title="بلندگو"><span class="farnaz-call-control-icon">🔊</span></button><button type="button" id="farnazCallMic" aria-label="میکروفون" aria-pressed="true" title="میکروفون"><span class="farnaz-call-control-icon">🎙️</span></button><button type="button" id="farnazCallCamera" aria-label="دوربین" aria-pressed="true" title="دوربین" hidden><span class="farnaz-call-control-icon">📷</span></button><button type="button" id="farnazCallSwitchCamera" aria-label="تعویض دوربین" title="تعویض دوربین" hidden><span class="farnaz-call-control-icon">🔄</span></button></div><div class="farnaz-call-actions"><button type="button" id="farnazCallAccept" class="farnaz-call-accept" aria-label="پاسخ" title="پاسخ" hidden>✓</button><button type="button" id="farnazCallReject" class="farnaz-call-reject" aria-label="رد تماس" title="رد تماس" hidden>✕</button><button type="button" id="farnazCallHangup" class="farnaz-call-reject" aria-label="پایان تماس" title="پایان تماس" hidden>✕</button></div></div></div>';
  document.body.appendChild(dialog);
  byId("farnazCallClose").onclick=()=>{if(activeCall)endCall(true);else dialog.hidden=true;};
  byId("farnazCallAccept").onclick=acceptIncoming;
  byId("farnazCallReject").onclick=rejectIncoming;
  byId("farnazCallHangup").onclick=()=>endCall(true);
  byId("farnazCallSpeaker").onclick=toggleSpeaker;
  byId("farnazCallMic").onclick=toggleMicrophone;
  byId("farnazCallCamera").onclick=toggleCamera;
  byId("farnazCallSwitchCamera").onclick=switchCamera;
  return dialog;
}
function setCallStatus(text){const p=byId("farnazCallStatus");if(p)p.textContent=text;}
function refreshCallControls(){
  const call=activeCall,controls=byId("farnazCallControls");
  if(!controls)return;
  const ready=!!(call&&call.localStream&&call.pc);
  controls.hidden=!ready;
  if(!ready)return;
  const video=call.session.call_type==="video";
  byId("farnazCallCamera").hidden=!video;
  byId("farnazCallSwitchCamera").hidden=!video;
  const micEnabled=(call.localStream.getAudioTracks()[0]?.enabled)!==false;
  const cameraEnabled=(call.localStream.getVideoTracks()[0]?.enabled)!==false;
  byId("farnazCallMic").setAttribute("aria-pressed",String(micEnabled));
  byId("farnazCallMic").setAttribute("aria-label",tr(micEnabled?"خاموش‌کردن میکروفون":"روشن‌کردن میکروفون",micEnabled?"Mute microphone":"Unmute microphone"));
  byId("farnazCallCamera").setAttribute("aria-pressed",String(cameraEnabled));
  byId("farnazCallCamera").setAttribute("aria-label",tr(cameraEnabled?"خاموش‌کردن دوربین":"روشن‌کردن دوربین",cameraEnabled?"Turn camera off":"Turn camera on"));
  byId("farnazCallSpeaker").setAttribute("aria-pressed",String(!!call.speakerEnabled));
  byId("farnazCallSpeaker").setAttribute("aria-label",tr(call.speakerEnabled?"خاموش‌کردن بلندگو":"روشن‌کردن بلندگو",call.speakerEnabled?"Turn speaker off":"Turn speaker on"));
}
async function toggleSpeaker(){
  const call=activeCall,audio=byId("farnazRemoteAudio");
  if(!call||!audio)return;
  if(typeof audio.setSinkId!=="function"){
    setCallStatus(tr("در Safari آیفون، وب‌اپ اجازه تغییر مستقیم بلندگو و گوشی را نمی‌دهد. از کنترل صوتی خود آیفون استفاده کن.","Safari on iPhone does not let web apps switch between earpiece and speaker. Use the iPhone audio controls."));
    return;
  }
  try{
    if(call.speakerEnabled){
      await audio.setSinkId(call.defaultSinkId||"default");
      if(activeCall!==call)return;
      call.speakerEnabled=false;
      call.speakerDeviceId=null;
      refreshCallControls();
      setCallStatus(tr("بلندگو خاموش شد.","Speaker off."));
      return;
    }
    const devices=await navigator.mediaDevices.enumerateDevices();
    if(activeCall!==call)return;
    const outputs=devices.filter(d=>d.kind==="audiooutput");
    const speaker=outputs.find(d=>/speaker|loudspeaker|haut-parleur|lautsprecher|بلندگو/i.test(d.label||""));
    const target=speaker||outputs.find(d=>d.deviceId!=="default"&&d.deviceId!=="communications"&&d.deviceId!==(call.defaultSinkId||""));
    if(!target){setCallStatus(tr("مرورگر خروجی بلندگوی جداگانه‌ای معرفی نکرد.","The browser did not expose a separate speaker output."));return;}
    await audio.setSinkId(target.deviceId);
    if(activeCall!==call)return;
    call.speakerEnabled=true;call.speakerDeviceId=target.deviceId;
    refreshCallControls();setCallStatus(tr("بلندگو روشن شد.","Speaker on."));
  }catch(error){
    console.warn("Speaker output switch:",error);
    setCallStatus(tr("تغییر خروجی صدا انجام نشد. از کنترل صوتی دستگاه استفاده کن.","Could not switch audio output. Use device audio controls."));
  }
}
function toggleMicrophone(){
  const call=activeCall,track=call?.localStream?.getAudioTracks()[0];
  if(!track)return;
  track.enabled=!track.enabled;
  refreshCallControls();
}
function toggleCamera(){
  const call=activeCall,track=call?.localStream?.getVideoTracks()[0];
  if(!track)return;
  track.enabled=!track.enabled;
  refreshCallControls();
}
async function switchCamera(){
  const call=activeCall;
  if(!call?.pc||!call.localStream)return;
  const oldTrack=call.localStream.getVideoTracks()[0];
  if(!oldTrack)return;
  try{
    const devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==="videoinput");
    const currentId=oldTrack.getSettings().deviceId;
    const next=devices.find(d=>d.deviceId!==currentId);
    if(!next){setCallStatus(tr("دوربین دیگری پیدا نشد.","No alternate camera was found."));return;}
    const stream=await navigator.mediaDevices.getUserMedia({video:{deviceId:{exact:next.deviceId}},audio:false});
    if(activeCall!==call){stream.getTracks().forEach(t=>t.stop());return;}
    const newTrack=stream.getVideoTracks()[0];
    const sender=call.pc.getSenders().find(s=>s.track?.kind==="video");
    if(!sender||!newTrack){stream.getTracks().forEach(t=>t.stop());throw new Error("Camera track could not be replaced.");}
    await sender.replaceTrack(newTrack);
    call.localStream.removeTrack(oldTrack);call.localStream.addTrack(newTrack);
    oldTrack.stop();
    const local=byId("farnazLocalVideo");local.srcObject=call.localStream;
    refreshCallControls();
  }catch(error){
    console.warn("Switch camera:",error);
    setCallStatus(tr("تعویض دوربین انجام نشد.","Could not switch camera."));
  }
}
function showDialog(title,status){
  const d=ensureDialog();byId("farnazCallTitle").textContent=title;setCallStatus(status);d.hidden=false;
  byId("farnazCallAccept").hidden=true;byId("farnazCallReject").hidden=true;byId("farnazCallHangup").hidden=true;
  byId("farnazLocalVideo").hidden=true;byId("farnazRemoteVideo").hidden=true;
  byId("farnazCallControls").hidden=true;
}
async function notifyBackground(title,body,tag){
  if(!("Notification" in window)||Notification.permission!=="granted")return;
  try{
    const reg=await navigator.serviceWorker?.ready;
    if(reg)await reg.showNotification(title,{body,tag,icon:"./farnaz-icon.svg",badge:"./farnaz-icon.svg",data:{url:"./"}});
    else new Notification(title,{body,tag});
  }catch(e){console.warn("Notification unavailable:",e);}
}
function otherId(session){return String(session.caller_id)===String(signedInUserId)?session.receiver_id:session.caller_id;}
async function subscribeSignalChannel(session){
  const client=getClient();
  const ch=client.channel("farnaz-call-signals-"+session.id);
  activeCall.signalChannel=ch;
  ch.on("postgres_changes",{event:"INSERT",schema:"public",table:"call_signals",filter:"call_id=eq."+session.id},payload=>{
    const signal=payload.new;
    if(signal&&String(signal.target_id)===String(signedInUserId))handleSignal(signal).catch(e=>{console.error(e);setCallStatus(tr("خطا در برقراری تماس: ","Call signaling failed: ")+e.message);});
  });
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error("Call signaling connection timed out.")),12000);
    ch.subscribe(status=>{
      if(status==="SUBSCRIBED"){clearTimeout(timer);resolve();}
      else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"||status==="CLOSED"){clearTimeout(timer);reject(new Error("Call signaling channel could not connect."));}
    });
  });
}
async function sendSignal(type,payload=null){
  if(!activeCall||!signedInUserId)throw new Error("No active call.");
  const {error}=await getClient().from("call_signals").insert({
    call_id:activeCall.session.id,sender_id:signedInUserId,target_id:activeCall.otherId,signal_type:type,payload
  });
  if(error)throw error;
}
async function preparePeer(session,role){
  const call=activeCall;
  if(!call||String(call.session?.id)!==String(session.id))throw new Error("Call is no longer active.");
  const type=session.call_type==="video"?"video":"audio";
  try{if(navigator.audioSession)navigator.audioSession.type="play-and-record";}catch(error){console.warn("Audio session mode:",error);}
  const media=await navigator.mediaDevices.getUserMedia({audio:true,video:type==="video"});
  // The permission prompt can remain open after the caller cancels or signs out.
  // Never attach a late media stream to a different call, and always release it.
  if(activeCall!==call){media.getTracks().forEach(track=>track.stop());throw new Error("Call was cancelled before media became ready.");}
  call.localStream=media;
  call.speakerDeviceId=null;
  call.speakerEnabled=false;
  call.defaultSinkId=byId("farnazRemoteAudio")?.sinkId||"default";
  call.pendingCandidates=call.pendingCandidates||[];
  refreshCallControls();
  const local=byId("farnazLocalVideo");local.srcObject=media;local.hidden=type!=="video";
  const pc=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"},{urls:"stun:stun1.l.google.com:19302"}]});
  call.pc=pc;
  refreshCallControls();
  media.getTracks().forEach(track=>pc.addTrack(track,media));
  pc.ontrack=event=>{
    if(activeCall!==call)return;
    const stream=event.streams?.[0];if(!stream)return;
    if(type==="video"){const v=byId("farnazRemoteVideo");v.srcObject=stream;v.muted=true;v.hidden=false;v.play().catch(()=>{});}
    const audio=byId("farnazRemoteAudio");audio.srcObject=stream;audio.play().catch(()=>{});
  };
  pc.onicecandidate=event=>{
    if(event.candidate&&activeCall===call)sendSignal("ice-candidate",event.candidate.toJSON()).catch(e=>console.warn("ICE signal:",e));
  };
  pc.onconnectionstatechange=()=>{
    if(activeCall!==call)return;
    if(pc.connectionState==="connected"){stopRingtone();setCallStatus(tr("تماس برقرار است","Call connected"));}
    else if(pc.connectionState==="connecting")setCallStatus(tr("در حال برقراری ارتباط…","Connecting…"));
    else if(pc.connectionState==="failed")setCallStatus(tr("اتصال مستقیم برقرار نشد؛ احتمالاً شبکه به TURN نیاز دارد.","Direct connection failed; this network may require a TURN server."));
    else if(pc.connectionState==="disconnected")setCallStatus(tr("ارتباط ناپایدار است…","Connection is unstable…"));
  };
  await subscribeSignalChannel(session);
  if(activeCall!==call)throw new Error("Call was cancelled while connecting.");
  if(role==="caller"){
    const offer=await pc.createOffer();
    if(activeCall!==call)throw new Error("Call was cancelled while preparing the offer.");
    await pc.setLocalDescription(offer);
    if(activeCall!==call)throw new Error("Call was cancelled before sending the offer.");
    await sendSignal("offer",{type:pc.localDescription.type,sdp:pc.localDescription.sdp});
    if(activeCall!==call)return;
    setCallStatus(tr("در انتظار پاسخ…","Waiting for answer…"));
  }else{
    const {data,error}=await getClient().from("call_signals").select("id,signal_type,payload,sender_id,target_id").eq("call_id",session.id).eq("target_id",String(signedInUserId)).order("created_at",{ascending:true});
    if(activeCall!==call)return;
    if(error)throw error;
    for(const signal of data||[]){if(activeCall!==call)return;await handleSignal(signal);}
  }
}
async function flushPendingCandidates(call=activeCall){
  const pc=call?.pc;
  if(!pc?.remoteDescription||!call.pendingCandidates?.length)return;
  const queued=call.pendingCandidates.splice(0);
  for(const candidate of queued){
    if(activeCall!==call)return;
    try{await pc.addIceCandidate(new RTCIceCandidate(candidate));}catch(e){console.warn("Queued ICE candidate:",e);}
  }
}
async function handleSignal(signal){
  const call=activeCall;
  if(!call||String(signal.call_id)!==String(call.session.id)||processedSignals.has(signal.id))return;
  processedSignals.add(signal.id);
  if(String(signal.sender_id)===String(signedInUserId))return;
  const pc=call.pc;
  if(signal.signal_type==="offer"&&call.role==="receiver"){
    if(!pc)return;
    await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
    if(activeCall!==call)return;
    await flushPendingCandidates(call);
    if(activeCall!==call)return;
    const answer=await pc.createAnswer();
    if(activeCall!==call)return;
    await pc.setLocalDescription(answer);
    if(activeCall!==call)return;
    await sendSignal("answer",{type:pc.localDescription.type,sdp:pc.localDescription.sdp});
    if(activeCall!==call)return;
    const {error}=await getClient().from("call_sessions").update({status:"active"}).eq("id",call.session.id);
    if(activeCall!==call)return;
    if(error)throw error;
    setCallStatus(tr("پاسخ ارسال شد؛ در حال اتصال…","Answer sent; connecting…"));
  }else if(signal.signal_type==="answer"&&call.role==="caller"){
    stopRingtone();
    call.answered=true;
    if(call.timeout){clearTimeout(call.timeout);call.timeout=null;}
    if(pc&&!pc.currentRemoteDescription){
      await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
      if(activeCall!==call)return;
      await flushPendingCandidates(call);
    }
  }else if(signal.signal_type==="ice-candidate"){
    if(pc&&signal.payload){
      if(pc.remoteDescription){
        if(activeCall!==call)return;
        try{await pc.addIceCandidate(new RTCIceCandidate(signal.payload));}catch(e){console.warn("ICE candidate:",e);}
      }else{call.pendingCandidates=call.pendingCandidates||[];call.pendingCandidates.push(signal.payload);}
    }
  }else if(signal.signal_type==="reject"||signal.signal_type==="hangup"){
    await cleanupCall(false);
    if(activeCall)return;
    setCallStatus(signal.signal_type==="reject"?tr("تماس رد شد","Call declined"):tr("تماس پایان یافت","Call ended"));
    setTimeout(()=>{const d=byId("farnazCallDialog");if(d&&!activeCall)d.hidden=true;},1400);
  }
}
async function acceptIncoming(){
  stopRingtone();
  const call=activeCall;
  if(!call||call.role!=="receiver")return;
  byId("farnazCallAccept").disabled=true;
  try{
    byId("farnazCallAccept").hidden=true;byId("farnazCallReject").hidden=true;byId("farnazCallHangup").hidden=false;
    setCallStatus(tr("در حال دسترسی به میکروفن و دوربین…","Requesting microphone and camera…"));
    await preparePeer(call.session,"receiver");
    if(activeCall!==call)return;
    const {error}=await getClient().from("call_sessions").update({status:"active"}).eq("id",call.session.id);
    if(activeCall!==call)return;
    if(error)throw error;
  }catch(e){if(activeCall===call){console.error("Accept call:",e);setCallStatus(tr("شروع تماس ناموفق بود: ","Could not start call: ")+e.message);}}
  finally{byId("farnazCallAccept").disabled=false;}
}
async function rejectIncoming(){
  const call=activeCall;if(!call)return;
  try{
    await sendSignal("reject");if(activeCall!==call)return;
    await getClient().from("call_sessions").update({status:"rejected"}).eq("id",call.session.id);
    if(activeCall!==call)return;
  }catch(e){console.warn(e);}
  if(activeCall!==call)return;
  await cleanupCall(false);
  if(activeCall)return;
  const d=byId("farnazCallDialog");if(d)d.hidden=true;
}
async function cleanupCall(updateStatus){
  stopRingtone();
  const call=activeCall;activeCall=null;
  // Release local media and close the peer connection before waiting on any
  // network cleanup. A suspended mobile Realtime socket must not keep the
  // microphone/camera active or hold the UI in the ending-call state.
  if(call){
    if(call.timeout)clearTimeout(call.timeout);
    if(call.pc){call.pc.ontrack=null;call.pc.onicecandidate=null;try{call.pc.close();}catch(_){}}
    if(call.localStream)call.localStream.getTracks().forEach(track=>{try{track.stop();}catch(_){}});
  }
  ["farnazLocalVideo","farnazRemoteVideo","farnazRemoteAudio"].forEach(id=>{const el=byId(id);if(el){el.pause?.();el.srcObject=null;el.hidden=true;}});
  const controls=byId("farnazCallControls");if(controls)controls.hidden=true;
  try{if(navigator.audioSession)navigator.audioSession.type="auto";}catch(error){console.warn("Audio session reset:",error);}
  if(!call)return;
  // Realtime removal and status persistence are best-effort. They may continue
  // in the background, but neither is allowed to delay local call teardown.
  try{
    const client=getClient();
    if(call.signalChannel){
      Promise.race([
        Promise.resolve(client.removeChannel(call.signalChannel)),
        new Promise(resolve=>setTimeout(resolve,1500))
      ]).catch(error=>console.warn("Call channel cleanup:",error));
    }
    if(updateStatus){
      Promise.race([
        Promise.resolve(client.from("call_sessions").update({status:"ended"}).eq("id",call.session.id)),
        new Promise(resolve=>setTimeout(()=>resolve({timedOut:true}),2500))
      ]).then(result=>{
        if(result?.error)console.warn("Call status update:",result.error);
        if(result?.timedOut)console.warn("Call status update timed out; local call teardown is complete.");
      }).catch(error=>console.warn("Call status update:",error));
    }
  }catch(error){console.warn("Call cleanup scheduling:",error);}
}
async function endCall(notifyPeer){
  const call=activeCall;
  if(!call)return;
  // A failed signaling write must not prevent the local microphone/camera from
  // being released. Bound the wait, then always tear down the active call.
  if(notifyPeer){
    try{
      await Promise.race([
        sendSignal("hangup"),
        new Promise(resolve=>setTimeout(resolve,1200))
      ]);
    }catch(error){console.warn("Call hangup signal:",error);}
  }
  if(activeCall===call)await cleanupCall(true);
  const d=byId("farnazCallDialog");if(d)d.hidden=true;
}
async function startCall(type){
  if(window.FARNAZ_LIVEKIT_CALLS_ENABLED===true){
    if(!window.FarnazLiveKitCallUI){alert(tr("بخش تماس جدید هنوز آماده نیست؛ صفحه را تازه‌سازی کن.","The new call module is not ready yet. Refresh the app."));return;}
    try{await window.FarnazLiveKitCallUI.start(type);}catch(error){console.error("[Farnaz LiveKit call]",error);}
    return;
  }
  if(!signedInUserId||!currentUser){alert(tr("برای تماس ابتدا وارد حساب شو.","Sign in before starting a call."));return;}
  if(!currentChatUser?.user_id){alert(tr("تماس گروهی هنوز فعال نشده؛ فعلاً از گفت‌وگوی خصوصی تماس بگیر.","Group calls are not enabled yet. Start a call from a private chat."));return;}
  if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection){alert(tr("این مرورگر امکان تماس WebRTC را ندارد.","This browser does not support WebRTC calls."));return;}
  if(activeCall||callStartInProgress){alert(tr("یک تماس در حال شروع یا اجراست.","A call is already starting or active."));return;}
  const initiatingUserId=String(signedInUserId),receiverId=String(currentChatUser.user_id);
  if(receiverId===initiatingUserId)return;
  callStartInProgress=true;
  let startedCall=null,keepDialog=false;
  showDialog(type==="video"?tr("تماس تصویری","Video call"):tr("تماس صوتی","Audio call"),tr("در حال بررسی وضعیت تماس…","Checking call status…"));
  try{
    const {data:blocked,error:blockError}=await Promise.race([
      getClient().from("blocked_contacts").select("blocked_user_id").eq("blocker_id",initiatingUserId).eq("blocked_user_id",receiverId).maybeSingle(),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error("Call setup timed out while checking contact permissions.")),12000))
    ]);
    if(String(signedInUserId)!==initiatingUserId||String(currentUser?.id||"")!==initiatingUserId)return;
    if(String(currentChatUser?.user_id||"")!==receiverId)return;
    if(activeCall)return;
    if(blockError)throw blockError;
    if(blocked){alert(tr("این مخاطب را مسدود کرده‌ای؛ برای تماس ابتدا مسدودسازی را بردار.","This contact is blocked. Unblock them before calling."));return;}
    // Close abandoned call records for this user only. A call should not remain
    // ringing/active for a full day; preserve all recent/live sessions.
    const staleBefore=new Date(Date.now()-24*60*60*1000).toISOString();
    setCallStatus(tr("در حال آماده‌سازی تماس…","Preparing call…"));
    const {error:staleCleanupError}=await Promise.race([
      getClient().from("call_sessions").update({status:"ended",updated_at:new Date().toISOString()})
        .in("status",["ringing","active"]).lt("created_at",staleBefore)
        .or("caller_id.eq."+initiatingUserId+",receiver_id.eq."+initiatingUserId),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error("Call setup timed out while preparing the session.")),12000))
    ]);
    if(staleCleanupError)throw staleCleanupError;
    if(String(signedInUserId)!==initiatingUserId||String(currentUser?.id||"")!==initiatingUserId)return;
    if(String(currentChatUser?.user_id||"")!==receiverId||activeCall)return;
    setCallStatus(tr("در حال ثبت تماس…","Creating call…"));
    // The database derives caller identity from auth.uid() and repeats contact/block checks.
    const {data,error}=await getClient().rpc("start_farnaz_call",{
      p_receiver_id:receiverId,
      p_call_type:type
    });
    if(error)throw error;
    if(!data?.id||String(data.caller_id)!==initiatingUserId||String(data.receiver_id)!==receiverId){
      throw new Error(tr("پاسخ سرور تماس معتبر نبود؛ دوباره وارد حساب شو و تلاش کن.","The server returned an invalid call session. Sign in again and retry."));
    }
    if(String(signedInUserId)!==initiatingUserId||String(currentUser?.id||"")!==initiatingUserId||String(currentChatUser?.user_id||"")!==receiverId){
      try{await getClient().from("call_sessions").update({status:"ended"}).eq("id",data.id);}catch(_){}
      return;
    }
    if(activeCall){try{await getClient().from("call_sessions").update({status:"ended"}).eq("id",data.id);}catch(_){}return;}
    activeCall={session:data,role:"caller",otherId:receiverId,signalChannel:null,pc:null,localStream:null,pendingCandidates:[],timeout:null};
    startedCall=activeCall;
    keepDialog=true;
    startRingtone();
    byId("farnazCallHangup").hidden=false;
    await preparePeer(data,"caller");
    if(activeCall!==startedCall)return;
    startedCall.timeout=setTimeout(async()=>{
      if(activeCall!==startedCall||startedCall.answered||startedCall.pc?.connectionState==="connected")return;
      try{
        await sendSignal("hangup");
        if(activeCall!==startedCall)return;
        await getClient().from("call_sessions").update({status:"missed"}).eq("id",data.id);
      }catch(e){console.warn("Missed call status:",e);}
      if(activeCall!==startedCall)return;
      await cleanupCall(false);
      if(activeCall)return;
      showDialog(tr("تماس بی‌پاسخ","Missed call"),tr("پاسخی دریافت نشد.","No answer received."));
      setTimeout(()=>{const d=byId("farnazCallDialog");if(d&&!activeCall)d.hidden=true;},1800);
    },45000);
  }catch(e){
    if(startedCall&&activeCall!==startedCall){
      if(!activeCall)setCallStatus(tr("تماس لغو شد.","Call was cancelled."));
      return;
    }
    console.error("Start call:",e);
    if(e?.code==="23505"){
      setCallStatus(tr("یک تماس قبلی هنوز در حال اجراست. اگر تماس دیگری باز است آن را پایان بده؛ سپس دوباره تلاش کن.","A previous call is still marked active. End any other open call, then try again."));
    }
    if(startedCall&&activeCall===startedCall){
      try{await getClient().from("call_sessions").update({status:"ended"}).eq("id",startedCall.session.id);}catch(_){}
      if(activeCall===startedCall)await cleanupCall(false);
    }
    if(!activeCall){setCallStatus(tr("تماس شروع نشد: ","Call could not start: ")+e.message);const hangup=byId("farnazCallHangup");if(hangup)hangup.hidden=true;keepDialog=true;}
  }finally{
    callStartInProgress=false;
    if(!keepDialog&&!activeCall){const dialog=byId("farnazCallDialog");if(dialog)dialog.hidden=true;}
  }
}
async function refreshFarnazCallHistory(){
  const list=byId("callHistoryList"),status=byId("callHistoryStatus");
  if(!list||!status||!currentUser)return;
  const myId=String(currentUser.id);
  list.replaceChildren();
  status.textContent=tr("در حال بارگذاری تماس‌ها…","Loading calls…");
  try{
    const {data,error}=await getClient().from("call_sessions")
      .select("id,caller_id,receiver_id,call_type,status,created_at")
      .or("caller_id.eq."+myId+",receiver_id.eq."+myId)
      .order("created_at",{ascending:false}).limit(50);
    if(String(currentUser?.id||"")!==myId)return;
    if(error)throw error;
    const rows=data||[];
    if(!rows.length){status.textContent=tr("هنوز سابقه تماسی نداری.","No call history yet.");return;}
    let profiles=new Map();
    try{profiles=await getContactProfiles(rows.map(row=>String(row.caller_id)===myId?row.receiver_id:row.caller_id));}
    catch(profileError){console.warn("Call history profile lookup:",profileError);}
    if(String(currentUser?.id||"")!==myId)return;
    for(const row of rows){
      const outgoing=String(row.caller_id)===myId;
      const otherId=String(outgoing?row.receiver_id:row.caller_id);
      const profile=profiles.get(otherId)||{user_id:otherId,display_name:tr("مخاطب فرناز","Farnaz contact")};
      const name=profile.display_name||tr("مخاطب فرناز","Farnaz contact");
      const item=document.createElement("button");item.type="button";item.className="call-history-item";
      const avatar=document.createElement("span");avatar.className="avatar";renderAvatar(avatar,profile.avatar_url||"",name);
      const copy=document.createElement("span");copy.className="call-history-copy";
      const title=document.createElement("strong");title.textContent=name;
      const detail=document.createElement("small");
      const type=row.call_type==="video"?tr("تصویری","Video"):tr("صوتی","Audio");
      const state=row.status==="missed"?tr("بی‌پاسخ","Missed"):row.status==="rejected"?tr("ردشده","Declined"):row.status==="active"?tr("فعال","Active"):row.status==="ringing"?tr("در حال زنگ‌خوردن","Ringing"):tr("پایان‌یافته","Ended");
      detail.textContent=(outgoing?tr("تماس خروجی","Outgoing call"):tr("تماس ورودی","Incoming call"))+" · "+type+" · "+state;
      copy.append(title,detail);
      const time=document.createElement("time");time.className="call-history-time";
      const date=new Date(row.created_at);time.dateTime=date.toISOString();time.textContent=date.toLocaleString(english?"en":"fa-IR",{dateStyle:"short",timeStyle:"short"});
      item.append(avatar,copy,time);
      item.addEventListener("click",()=>{if(typeof openChat==="function")openChat({...profile,user_id:otherId},"callsPage");});
      list.appendChild(item);
    }
    status.textContent="";
  }catch(error){
    if(String(currentUser?.id||"")!==myId)return;
    status.textContent=tr("بارگذاری سابقه تماس‌ها ناموفق بود: ","Could not load call history: ")+String(error?.message||error);
  }
}
window.refreshFarnazCallHistory=refreshFarnazCallHistory;
async function setUser(userId){
  const request=++userSwitchSequence,next=userId?String(userId):null;
  if(window.FARNAZ_LIVEKIT_CALLS_ENABLED===true){
    signedInUserId=next;
    if(!window.FarnazLiveKitCallUI)throw new Error("The feature-gated LiveKit call UI was not loaded.");
    await window.FarnazLiveKitCallUI.setUser(next);
    return;
  }
  if(next===signedInUserId&&inboxChannel)return;
  if(activeCall)await endCall(false);
  if(request!==userSwitchSequence)return;
  const previousChannel=inboxChannel;inboxChannel=null;
  if(previousChannel){try{await getClient().removeChannel(previousChannel);}catch(_){}}
  if(request!==userSwitchSequence)return;
  signedInUserId=next;
  if(!signedInUserId)return;
  const myId=signedInUserId,client=getClient();
  const channel=client.channel("farnaz-incoming-calls-"+myId);
  inboxChannel=channel;
  channel
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"call_sessions",filter:"receiver_id=eq."+myId},payload=>{if(signedInUserId===myId)handleIncomingSession(payload.new,client);})
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"call_sessions",filter:"receiver_id=eq."+myId},payload=>{if(signedInUserId===myId)handleCallStatusUpdate(payload.new);})
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"call_sessions",filter:"caller_id=eq."+myId},payload=>{if(signedInUserId===myId)handleCallStatusUpdate(payload.new);})
    .subscribe(status=>{if(signedInUserId===myId&&(status==="CHANNEL_ERROR"||status==="TIMED_OUT"))console.warn("Incoming call listener:",status);});
  // Recover a ringing invitation if the app reconnects after the INSERT event.
  client.from("call_sessions").select("*").eq("receiver_id",myId).eq("status","ringing")
    .gte("created_at",new Date(Date.now()-120000).toISOString()).order("created_at",{ascending:false}).limit(1)
    .then(({data,error})=>{if(signedInUserId!==myId)return;if(error)console.warn("Pending call lookup:",error);else if(data?.[0])handleIncomingSession(data[0],client);});
}
async function handleCallStatusUpdate(session){
  if(!activeCall||String(activeCall.session.id)!==String(session?.id))return;
  if(["ended","missed","rejected"].includes(session.status)){
    const wasReceiver=activeCall.role==="receiver";
    await cleanupCall(false);
    if(wasReceiver||session.status==="rejected"){
      showDialog(session.status==="missed"?tr("تماس بی‌پاسخ","Missed call"):tr("تماس پایان یافت","Call ended"),
        session.status==="missed"?tr("تماس‌گیرنده ارتباط را قطع کرد.","The caller ended the call."):tr("تماس پایان یافت.","The call has ended."));
      setTimeout(()=>{const d=byId("farnazCallDialog");if(d)d.hidden=true;},1600);
    }else{const d=byId("farnazCallDialog");if(d)d.hidden=true;}
  }
}
async function handleIncomingSession(session,client){
  if(!session||session.status!=="ringing"||String(session.caller_id)===String(signedInUserId))return;
  const sessionId=String(session.id);
  if((activeCall&&String(activeCall.session.id)===sessionId)||pendingIncomingSessions.has(sessionId))return;
  if(activeCall){try{await client.from("call_sessions").update({status:"missed"}).eq("id",session.id);}catch(_){}return;}
  pendingIncomingSessions.add(sessionId);
  try{
    let profile=null;
    try{const {data}=await client.rpc("get_farnaz_user_profile",{search_user_id:session.caller_id});profile=Array.isArray(data)?data[0]:data;}catch(e){console.warn("Caller profile lookup:",e);}
    if(String(signedInUserId)!==String(session.receiver_id))return;
    if(activeCall){
      if(String(activeCall.session.id)===sessionId)return;
      try{await client.from("call_sessions").update({status:"missed"}).eq("id",session.id);}catch(_){}
      return;
    }
    const name=profile?.display_name||tr("مخاطب فرناز","Farnaz contact");
    activeCall={session,role:"receiver",otherId:String(session.caller_id),signalChannel:null,pc:null,localStream:null,pendingCandidates:[],timeout:null};
    showDialog(session.call_type==="video"?tr("تماس تصویری ورودی","Incoming video call"):tr("تماس صوتی ورودی","Incoming audio call"),tr("تماس از طرف ","Incoming call from ")+name);
    startRingtone();
    byId("farnazCallAccept").hidden=false;byId("farnazCallReject").hidden=false;
    await notifyBackground(tr("تماس ورودی در فرناز","Incoming Farnaz call"),name,"call-"+session.id);
  }finally{pendingIncomingSessions.delete(sessionId);}
}
window.startCall=startCall;
// Use delegated click handling rather than relying only on inline HTML handlers.
// This remains reliable if the chat header is rebuilt during navigation.
document.addEventListener("click",event=>{
  const button=event.target?.closest?.("[data-farnaz-call-type]");
  if(!button)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const type=button.getAttribute("data-farnaz-call-type")==="video"?"video":"audio";
  button.disabled=true;
  Promise.resolve(startCall(type)).catch(error=>{
    console.error("Call button action failed:",error);
    alert(tr("اجرای تماس با خطا روبه‌رو شد: ","Call action failed: ")+String(error?.message||error));
  }).finally(()=>{button.disabled=false;});
},true);
window.enableFarnazNotifications=async function(){
  const status=byId("notificationsStatus");
  if(!("Notification" in window)||!navigator.serviceWorker){if(status)status.textContent=tr("اعلان‌ها در این مرورگر پشتیبانی نمی‌شوند.","Notifications are not supported in this browser.");return;}
  try{
    const permission=await Notification.requestPermission();
    if(permission!=="granted"){if(status)status.textContent=tr("اجازه اعلان داده نشد. تنظیمات اعلان مرورگر را بررسی کن.","Permission was not granted. Check browser notification settings.");return;}
    await navigator.serviceWorker.register("./service-worker.js");
    if(status)status.textContent=tr("اجازه اعلان فعال شد. برای اعلان حتی پس از بسته‌شدن برنامه، سرویس Push سرور هم باید پیکربندی شود.","Notification permission is enabled. Server push must also be configured for notifications after the app is closed.");
  }catch(e){if(status)status.textContent=tr("فعال‌سازی اعلان ناموفق بود: ","Could not enable notifications: ")+e.message;}
};
window.FarnazCalls={setUser,notifyMessage:async function(){await notifyBackground(tr("پیام جدید در فرناز","New message in Farnaz"),tr("برای مشاهده پیام، فرناز را باز کن.","Open Farnaz to view the message."),"farnaz-message");}};
window.addEventListener("farnaz-auth-user",event=>{setUser(event.detail?.userId||null).catch(console.error);});
if(typeof currentUser!=="undefined"&&currentUser?.id)setUser(currentUser.id).catch(console.error);
})();