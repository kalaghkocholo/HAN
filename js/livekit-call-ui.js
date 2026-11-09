(function (root) {
  "use strict";

  let controller = null;
  let signedInUserId = null;
  let activeSession = null;
  let activeRole = null;
  let callType = "audio";
  let startedAt = 0;
  let timerId = null;
  let endingCall = false;
  let microphoneEnabled = true;
  let cameraEnabled = true;
  let remoteVideoTrack = null;
  let localVideoTrack = null;
  const remoteAudioTracks = new Set();
  const byId = id => root.document.getElementById(id);
  const tr = (fa, en) => typeof english !== "undefined" && english ? en : fa;
  const icon = (name) => ({
    mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3m-4 0h8"/></svg>',
    micOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 9v3a3 3 0 0 0 5.1 2.1M15 9V5.5a3 3 0 0 0-5.8-1M5.5 11.5a6.5 6.5 0 0 0 11.8 3.8M12 18v3m-4 0h8M3 3l18 18"/></svg>',
    speaker: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M17 9a5 5 0 0 1 0 6m2.5-8.5a8.5 8.5 0 0 1 0 11"/></svg>',
    camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="12" height="12" rx="2"/><path d="m15 10 6-3v10l-6-3z"/></svg>',
    cameraOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8M15 10l6-3v10l-4-2M3 3l18 18"/></svg>',
    flip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7h-3l-2-3H9L7 7H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h6"/><circle cx="11" cy="13" r="3"/><path d="m16 16 3 3 3-3m-3 3v-7"/></svg>',
    end: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 15.5c4.8-4.2 13.2-4.2 18 0l-2.3 4a1.5 1.5 0 0 1-1.8.6l-3.2-1.2a1.5 1.5 0 0 1-1-1.4v-1.2a12 12 0 0 0-3.4 0v1.2a1.5 1.5 0 0 1-1 1.4l-3.2 1.2a1.5 1.5 0 0 1-1.8-.6L3 15.5Z"/></svg>',
    accept: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.8 10.6a14.2 14.2 0 0 0 7.6 7.6l2.2-2.2a1 1 0 0 1 1.02-.24 11.6 11.6 0 0 0 3.62.58 1 1 0 0 1 1 1V21a1 1 0 0 1-1 1A18.2 18.2 0 0 1 2 4.8a1 1 0 0 1 1-1h3.7a1 1 0 0 1 1 1 11.6 11.6 0 0 0 .58 3.62 1 1 0 0 1-.24 1.02z"/></svg>',
    volume: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M17 9a5 5 0 0 1 0 6"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>'
  })[name] || "";

  function ensureDialog() {
    let dialog = byId("farnazLiveKitDialog");
    if (dialog) return dialog;
    dialog = root.document.createElement("section");
    dialog.id = "farnazLiveKitDialog";
    dialog.className = "farnaz-livekit-dialog";
    dialog.hidden = true;
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "farnazLiveKitTitle");
    dialog.innerHTML =
      '<div class="farnaz-livekit-card">' +
        '<header class="farnaz-livekit-header">' +
          '<div class="farnaz-livekit-status-dot" id="farnazLiveKitDot"></div>' +
          '<div class="farnaz-livekit-heading"><strong id="farnazLiveKitTitle">تماس فرناز</strong><span id="farnazLiveKitStatus" role="status" aria-live="polite">در حال آماده‌سازی…</span></div>' +
          '<button type="button" class="farnaz-livekit-close" id="farnazLiveKitClose" aria-label="بستن پنجره تماس" title="بستن">' + icon("close") + '</button>' +
        '</header>' +
        '<main class="farnaz-livekit-stage" id="farnazLiveKitStage">' +
          '<div class="farnaz-livekit-avatar" id="farnazLiveKitAvatar" aria-hidden="true">F</div>' +
          '<video id="farnazLiveKitRemoteVideo" class="farnaz-livekit-remote-video" autoplay playsinline hidden></video>' +
          '<video id="farnazLiveKitLocalVideo" class="farnaz-livekit-local-video" autoplay muted playsinline hidden></video>' +
          '<div class="farnaz-livekit-stage-caption"><time id="farnazLiveKitTimer" hidden>00:00</time><span id="farnazLiveKitQuality" hidden></span></div>' +
        '</main>' +
        '<div class="farnaz-livekit-audio" id="farnazLiveKitRemoteAudio"></div>' +
        '<div class="farnaz-livekit-audio-unlock" id="farnazLiveKitUnlockWrap" hidden><button type="button" id="farnazLiveKitUnlock">فعال‌سازی صدای تماس</button></div>' +
        '<footer class="farnaz-livekit-footer">' +
          '<div class="farnaz-livekit-controls" id="farnazLiveKitControls" hidden>' +
            '<button type="button" class="farnaz-livekit-control" id="farnazLiveKitMute" aria-label="خاموش‌کردن میکروفون" aria-pressed="true" title="میکروفون">' + icon("mic") + '<span>میکروفون</span></button>' +
            '<button type="button" class="farnaz-livekit-control" id="farnazLiveKitAudioRoute" aria-label="خروجی صدا" title="خروجی صدا">' + icon("speaker") + '<span>بلندگو</span></button>' +
            '<button type="button" class="farnaz-livekit-control" id="farnazLiveKitCamera" aria-label="خاموش‌کردن دوربین" aria-pressed="true" title="دوربین" hidden>' + icon("camera") + '<span>دوربین</span></button>' +
            '<button type="button" class="farnaz-livekit-control" id="farnazLiveKitFlip" aria-label="تعویض دوربین" title="تعویض دوربین" hidden>' + icon("flip") + '<span>تعویض</span></button>' +
          '</div>' +
          '<div class="farnaz-livekit-actions">' +
            '<button type="button" id="farnazLiveKitAccept" class="farnaz-livekit-action is-accept" aria-label="پاسخ به تماس" title="پاسخ" hidden>' + icon("accept") + '</button>' +
            '<button type="button" id="farnazLiveKitReject" class="farnaz-livekit-action is-end" aria-label="رد تماس" title="رد تماس" hidden>' + icon("end") + '</button>' +
            '<button type="button" id="farnazLiveKitEnd" class="farnaz-livekit-action is-end" aria-label="پایان تماس" title="پایان تماس" hidden>' + icon("end") + '</button>' +
          '</div>' +
        '</footer>' +
      '</div>';
    root.document.body.appendChild(dialog);
    byId("farnazLiveKitClose").addEventListener("click", end);
    byId("farnazLiveKitAccept").addEventListener("click", answer);
    byId("farnazLiveKitReject").addEventListener("click", reject);
    byId("farnazLiveKitEnd").addEventListener("click", end);
    byId("farnazLiveKitMute").addEventListener("click", toggleMicrophone);
    byId("farnazLiveKitAudioRoute").addEventListener("click", toggleAudioRoute);
    byId("farnazLiveKitCamera").addEventListener("click", toggleCamera);
    byId("farnazLiveKitFlip").addEventListener("click", switchCamera);
    byId("farnazLiveKitUnlock").addEventListener("click", unlockAudio);
    return dialog;
  }

  function setAvatar(name, avatarUrl) {
    const node = byId("farnazLiveKitAvatar");
    if (!node) return;
    const initial = (String(name || "F").trim().charAt(0) || "F").toLocaleUpperCase();
    node.replaceChildren();
    node.dataset.hasImage = "false";
    const url = typeof avatarUrl === "string" && /^https:\/\//i.test(avatarUrl.trim()) ? avatarUrl.trim() : "";
    if (!url) {
      node.textContent = initial;
      return;
    }
    const image = root.document.createElement("img");
    image.alt = "";
    image.referrerPolicy = "no-referrer";
    image.decoding = "async";
    image.onload = function () {
      node.dataset.hasImage = "true";
      node.replaceChildren(image);
    };
    image.onerror = function () {
      node.dataset.hasImage = "false";
      node.textContent = initial;
    };
    image.src = url;
  }

  function setStatus(message, state) {
    const node = byId("farnazLiveKitStatus");
    if (node) node.textContent = message;
    const dialog = byId("farnazLiveKitDialog");
    if (dialog && state) dialog.dataset.callState = state;
    const dot = byId("farnazLiveKitDot");
    if (dot && state) dot.dataset.state = state;
  }

  function formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    return String(minutes).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
  }

  function stopTimer() {
    if (timerId) root.clearInterval(timerId);
    timerId = null;
    startedAt = 0;
    const node = byId("farnazLiveKitTimer");
    if (node) { node.hidden = true; node.textContent = "00:00"; }
  }

  function startTimer() {
    stopTimer();
    startedAt = Date.now();
    const node = byId("farnazLiveKitTimer");
    if (node) node.hidden = false;
    timerId = root.setInterval(function () {
      if (node) node.textContent = formatDuration(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
  }

  function detachTrack(track) {
    if (track && typeof track.detach === "function") {
      try { track.detach(); } catch (_) {}
    }
  }

  function resetMedia() {
    detachTrack(remoteVideoTrack);
    detachTrack(localVideoTrack);
    remoteVideoTrack = null;
    localVideoTrack = null;
    remoteAudioTracks.forEach(detachTrack);
    remoteAudioTracks.clear();
    const remote = byId("farnazLiveKitRemoteVideo");
    const local = byId("farnazLiveKitLocalVideo");
    if (remote) { remote.pause(); remote.srcObject = null; remote.hidden = true; }
    if (local) { local.pause(); local.srcObject = null; local.hidden = true; }
    const audio = byId("farnazLiveKitRemoteAudio");
    if (audio) audio.replaceChildren();
    const stage = byId("farnazLiveKitStage");
    if (stage) stage.classList.remove("has-video");
  }

  function attachLocalCamera(track, enabled) {
    const video = byId("farnazLiveKitLocalVideo");
    if (localVideoTrack && localVideoTrack !== track) detachTrack(localVideoTrack);
    localVideoTrack = track || null;
    if (!video) return;
    if (!enabled || !track || callType !== "video") {
      video.pause();
      video.srcObject = null;
      video.hidden = true;
      return;
    }
    track.attach(video);
    video.hidden = false;
    video.play().catch(() => {});
  }

  function show(title, status, incoming) {
    ensureDialog();
    byId("farnazLiveKitTitle").textContent = title || tr("تماس فرناز", "Farnaz call");
    setAvatar(title, null);
    byId("farnazLiveKitDialog").hidden = false;
    byId("farnazLiveKitDialog").classList.toggle("is-video-call", callType === "video");
    byId("farnazLiveKitDialog").classList.toggle("is-audio-call", callType !== "video");
    byId("farnazLiveKitDialog").dataset.callType = callType;
    byId("farnazLiveKitDialog").dataset.callState = incoming ? "incoming" : "outgoing";
    byId("farnazLiveKitControls").hidden = incoming;
    byId("farnazLiveKitMute").disabled = true;
    byId("farnazLiveKitAudioRoute").disabled = true;
    byId("farnazLiveKitCamera").disabled = true;
    byId("farnazLiveKitFlip").disabled = true;
    byId("farnazLiveKitAccept").hidden = !incoming;
    byId("farnazLiveKitReject").hidden = !incoming;
    byId("farnazLiveKitEnd").hidden = incoming;
    byId("farnazLiveKitEnd").disabled = false;
    endingCall = false;
    byId("farnazLiveKitCamera").hidden = true;
    byId("farnazLiveKitFlip").hidden = true;
    byId("farnazLiveKitUnlockWrap").hidden = true;
    byId("farnazLiveKitRemoteVideo").hidden = true;
    byId("farnazLiveKitLocalVideo").hidden = true;
    byId("farnazLiveKitQuality").hidden = true;
    setStatus(status, incoming ? "ringing" : "connecting");
    stopTimer();
    resetMedia();
  }

  async function showIncoming(event) {
    const session = event && event.session;
    if (!session) return;
    activeSession = session;
    activeRole = "receiver";
    callType = session.call_type === "video" ? "video" : "audio";
    show(callType === "video" ? tr("تماس تصویری ورودی", "Incoming video call") : tr("تماس صوتی ورودی", "Incoming audio call"),
      tr("تماس ورودی…", "Incoming call…"), true);
    root.FarnazCalls?.startRingtone?.();
    try {
      const result = await getClient().rpc("get_farnaz_user_profile", { search_user_id: session.caller_id });
      const profile = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!activeSession || String(activeSession.id) !== String(session.id)) return;
      if (profile) {
        const displayName = String(profile.display_name || tr("مخاطب فرناز", "Farnaz contact")).trim();
        byId("farnazLiveKitTitle").textContent = displayName;
        setAvatar(displayName, profile.avatar_url || profile.photo_url || null);
        setStatus(tr("تماس ورودی از ", "Incoming call from ") + displayName, "ringing");
      }
    } catch (error) {
      console.warn("[Farnaz LiveKit UI] Caller profile lookup failed:", error);
    }
  }

  function showConnectedControls() {
    byId("farnazLiveKitControls").hidden = false;
    byId("farnazLiveKitEnd").hidden = false;
    byId("farnazLiveKitAccept").hidden = true;
    byId("farnazLiveKitReject").hidden = true;
    byId("farnazLiveKitCamera").hidden = callType !== "video";
    byId("farnazLiveKitFlip").hidden = callType !== "video";
    byId("farnazLiveKitUnlockWrap").hidden = true;
    byId("farnazLiveKitMute").disabled = false;
    byId("farnazLiveKitAudioRoute").disabled = false;
    byId("farnazLiveKitCamera").disabled = callType !== "video";
    byId("farnazLiveKitFlip").disabled = callType !== "video";
    updateControlState();
  }

  function updateControlState() {
    const mic = byId("farnazLiveKitMute");
    const camera = byId("farnazLiveKitCamera");
    if (mic) {
      mic.setAttribute("aria-pressed", String(microphoneEnabled));
      mic.setAttribute("aria-label", tr(microphoneEnabled ? "خاموش‌کردن میکروفون" : "روشن‌کردن میکروفون", microphoneEnabled ? "Mute microphone" : "Unmute microphone"));
      mic.innerHTML = icon(microphoneEnabled ? "mic" : "micOff") + "<span>" + tr(microphoneEnabled ? "میکروفون" : "میکروفون خاموش", microphoneEnabled ? "Microphone" : "Mic muted") + "</span>";
      mic.classList.toggle("is-off", !microphoneEnabled);
    }
    if (camera) {
      camera.setAttribute("aria-pressed", String(cameraEnabled));
      camera.setAttribute("aria-label", tr(cameraEnabled ? "خاموش‌کردن دوربین" : "روشن‌کردن دوربین", cameraEnabled ? "Turn camera off" : "Turn camera on"));
      camera.innerHTML = icon(cameraEnabled ? "camera" : "cameraOff") + "<span>" + tr(cameraEnabled ? "دوربین" : "دوربین خاموش", cameraEnabled ? "Camera" : "Camera off") + "</span>";
      camera.classList.toggle("is-off", !cameraEnabled);
    }
  }

  function onControllerEvent(event) {
    if (!event) return;
    const detail = event.detail || {};
    if (event.type === "session-incoming") {
      showIncoming(detail).catch(error => setStatus(error.message, "error"));
    } else if (event.type === "session-outgoing") {
      activeSession = detail.session || null;
      activeRole = "caller";
      callType = activeSession && activeSession.call_type === "video" ? "video" : "audio";
      const title = typeof currentChatUser !== "undefined" && currentChatUser
        ? (currentChatUser.display_name || currentChatUser.name || tr("مخاطب فرناز", "Farnaz contact"))
        : tr("تماس فرناز", "Farnaz call");
      show(title, tr("در انتظار پاسخ…", "Ringing…"), false);
      setAvatar(title, typeof currentChatUser !== "undefined" && currentChatUser ? currentChatUser.avatar_url : null);
      setStatus(tr("در انتظار پاسخ…", "Ringing…"), "ringing");
    } else if (event.type === "session-accepted") {
      root.FarnazCalls?.stopRingtone?.();
      activeSession = detail.session || activeSession;
      activeRole = detail.role || activeRole;
      microphoneEnabled = true;
      cameraEnabled = callType === "video";
      setStatus(tr("تماس برقرار است", "Call connected"), "connected");
      showConnectedControls();
      startTimer();
    } else if (event.type === "session-finished") {
      root.FarnazCalls?.stopRingtone?.();
      endingCall = false;
      const endButton = byId("farnazLiveKitEnd");
      if (endButton) endButton.disabled = false;
      activeSession = null;
      activeRole = null;
      stopTimer();
      resetMedia();
      setStatus(tr("تماس پایان یافت", "Call ended"), "ended");
      const dialog = byId("farnazLiveKitDialog");
      if (dialog) root.setTimeout(() => { if (!activeSession) dialog.hidden = true; }, 900);
    } else if (event.type === "media-track-subscribed") {
      const track = detail.track;
      if (!track || typeof track.attach !== "function") return;
      if (track.kind === "video") {
        const video = byId("farnazLiveKitRemoteVideo");
        if (remoteVideoTrack && remoteVideoTrack !== track) detachTrack(remoteVideoTrack);
        remoteVideoTrack = track;
        track.attach(video);
        video.hidden = false;
        video.play().catch(() => {});
        byId("farnazLiveKitStage").classList.add("has-video");
      } else if (track.kind === "audio") {
        const audio = root.document.createElement("audio");
        audio.autoplay = true;
        audio.playsInline = true;
        audio.setAttribute("aria-label", tr("صدای مخاطب", "Contact audio"));
        byId("farnazLiveKitRemoteAudio").appendChild(audio);
        track.attach(audio);
        remoteAudioTracks.add(track);
        audio.play().catch(() => {
          byId("farnazLiveKitUnlockWrap").hidden = false;
          setStatus(tr("برای شنیدن صدا، فعال‌سازی صدا را بزن.", "Tap Enable audio to hear the call."), "connected");
        });
      }
    } else if (event.type === "media-track-unsubscribed") {
      const track = detail.track;
      detachTrack(track);
      remoteAudioTracks.delete(track);
      if (remoteVideoTrack === track) {
        remoteVideoTrack = null;
        const video = byId("farnazLiveKitRemoteVideo");
        video.pause(); video.srcObject = null; video.hidden = true;
        byId("farnazLiveKitStage").classList.remove("has-video");
      }
    } else if (event.type === "media-local-camera-track") {
      attachLocalCamera(detail.track, detail.enabled);
    } else if (event.type === "media-audio-playback-status") {
      if (detail.canPlaybackAudio === false) byId("farnazLiveKitUnlockWrap").hidden = false;
    } else if (event.type === "media-connection-quality") {
      const quality = String(detail.quality || "").toLowerCase();
      const label = ({ excellent: tr("شبکه عالی", "Excellent network"), good: tr("شبکه خوب", "Good network"), poor: tr("شبکه ضعیف", "Weak network"), lost: tr("اتصال ناپایدار", "Unstable connection") })[quality];
      const node = byId("farnazLiveKitQuality");
      if (node && label) { node.textContent = label; node.hidden = false; node.dataset.quality = quality; }
    } else if (event.type === "media-reconnecting") {
      setStatus(tr("ارتباط ناپایدار است؛ در حال اتصال مجدد…", "Connection interrupted; reconnecting…"), "reconnecting");
    } else if (event.type === "media-reconnected") {
      setStatus(tr("ارتباط دوباره برقرار شد", "Connection restored"), "connected");
    } else if (event.type === "error" || event.type === "media-error") {
      const error = detail.error || detail;
      setStatus(tr("خطا: ", "Call error: ") + String(error && error.message || error), "error");
    }
  }

  async function setUser(userId) {
    const next = userId ? String(userId) : null;
    if (next === signedInUserId && controller) return;
    const previous = controller;
    controller = null;
    signedInUserId = next;
    activeSession = null;
    activeRole = null;
    stopTimer();
    resetMedia();
    root.FarnazCalls?.stopRingtone?.();
    if (previous) await previous.close();
    const dialog = byId("farnazLiveKitDialog");
    if (!next && dialog) dialog.hidden = true;
    if (!next) return;
    controller = root.FarnazCallController.create({
      supabase: getClient(),
      userId: next,
      onEvent: onControllerEvent
    });
    await controller.watchIncoming();
  }

  async function start(type) {
    if (!signedInUserId || !currentUser) throw new Error(tr("ابتدا وارد حساب شو.", "Sign in before calling."));
    if (typeof currentChatUser === "undefined" || !currentChatUser || !currentChatUser.user_id) {
      throw new Error(tr("تماس فقط از گفت‌وگوی خصوصی پشتیبانی می‌شود.", "Calls can only be started from a private chat."));
    }
    if (!controller) await setUser(signedInUserId);
    if (activeSession) throw new Error(tr("یک تماس در حال اجراست.", "A call is already active."));
    const peerId = String(currentChatUser.user_id);
    if (peerId === signedInUserId) throw new Error(tr("امکان تماس با خودت وجود ندارد.", "You cannot call yourself."));
    const blocked = await getClient().from("blocked_contacts")
      .select("blocked_user_id").eq("blocker_id", signedInUserId).eq("blocked_user_id", peerId).maybeSingle();
    if (blocked.error) throw blocked.error;
    if (blocked.data) throw new Error(tr("این مخاطب را مسدود کرده‌ای.", "This contact is blocked."));
    callType = type === "video" ? "video" : "audio";
    const title = currentChatUser.display_name || currentChatUser.name || tr("مخاطب فرناز", "Farnaz contact");
    show(title, tr("در حال شروع تماس…", "Starting call…"), false);
    setAvatar(title, currentChatUser.avatar_url);
    try {
      await controller.start({ peerId: peerId, callType: callType });
    } catch (error) {
      activeSession = null;
      setStatus(tr("تماس شروع نشد: ", "Call could not start: ") + error.message, "error");
      throw error;
    }
  }

  async function answer() {
    if (!controller || !activeSession) return;
    root.FarnazCalls?.stopRingtone?.();
    const button = byId("farnazLiveKitAccept");
    button.disabled = true;
    try {
      button.hidden = true;
      byId("farnazLiveKitReject").hidden = true;
      setStatus(tr("در حال اتصال…", "Connecting…"), "connecting");
      await controller.answer();
    } catch (error) {
      setStatus(tr("پاسخ به تماس ناموفق بود: ", "Could not answer: ") + error.message, "error");
    } finally {
      button.disabled = false;
    }
  }

  async function reject() {
    if (!controller) return;
    root.FarnazCalls?.stopRingtone?.();
    try { await controller.reject(); }
    catch (error) { setStatus(tr("رد تماس ناموفق بود: ", "Could not decline: ") + error.message, "error"); }
  }

  async function end() {
    if (endingCall) return;
    endingCall = true;
    root.FarnazCalls?.stopRingtone?.();
    const button = byId("farnazLiveKitEnd");
    if (button) button.disabled = true;
    if (!controller || !activeSession) {
      const dialog = byId("farnazLiveKitDialog");
      if (dialog) dialog.hidden = true;
      endingCall = false;
      if (button) button.disabled = false;
      return;
    }
    setStatus(tr("در حال پایان تماس…", "Ending call…"), "ending");
    try {
      await controller.end();
    } catch (error) {
      setStatus(tr("پایان تماس ناموفق بود: ", "Could not end call: ") + error.message, "error");
    } finally {
      endingCall = false;
      if (button) button.disabled = false;
    }
  }

  async function toggleMicrophone() {
    if (!controller) return;
    const next = !microphoneEnabled;
    try {
      await controller.setMicrophoneEnabled(next);
      microphoneEnabled = next;
      updateControlState();
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  async function toggleCamera() {
    if (!controller || callType !== "video") return;
    const next = !cameraEnabled;
    try {
      await controller.setCameraEnabled(next);
      cameraEnabled = next;
      updateControlState();
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  async function switchCamera() {
    if (!controller || callType !== "video") return;
    const button = byId("farnazLiveKitFlip");
    button.disabled = true;
    try {
      await controller.switchCamera();
    } catch (error) {
      setStatus(tr("تعویض دوربین انجام نشد: ", "Could not switch camera: ") + error.message, "error");
    } finally {
      button.disabled = false;
    }
  }

  function isIOSBrowser() {
    const ua = root.navigator && root.navigator.userAgent || "";
    const platform = root.navigator && root.navigator.platform || "";
    return /iPhone|iPad|iPod/i.test(ua) || (platform === "MacIntel" && root.navigator.maxTouchPoints > 1);
  }

  async function toggleAudioRoute() {
    if (isIOSBrowser()) {
      // WebKit may resolve setSinkId() without changing the real speaker route
      // for a single remote WebRTC audio track. Never show a false success state.
      setStatus(tr("برای انتخاب بلندگو یا هدفون، هنگام تماس مرکز کنترل آیفون را باز کن و مسیر صدا را از کنترل پخش انتخاب کن. این محدودیت iOS است.", "To choose speaker or headphones, open iPhone Control Center during the call and select the audio route from playback controls. This is an iOS limitation."), "connected");
      return;
    }
    const mediaDevices = root.navigator && root.navigator.mediaDevices;
    if (!mediaDevices || typeof mediaDevices.enumerateDevices !== "function") {
      setStatus(tr("انتخاب خروجی صدا در این مرورگر پشتیبانی نمی‌شود.", "Audio output selection is not supported by this browser."), "connected");
      return;
    }
    if (typeof root.HTMLMediaElement !== "undefined" && !("setSinkId" in root.HTMLMediaElement.prototype)) {
      setStatus(tr("این مرورگر امکان انتخاب مستقیم خروجی صدا را ندارد.", "This browser cannot select an audio output directly."), "connected");
      return;
    }
    try {
      const outputs = (await mediaDevices.enumerateDevices()).filter(device => device.kind === "audiooutput");
      if (!outputs.length) throw new Error(tr("خروجی صدایی پیدا نشد.", "No audio output devices were found."));
      const state = controller && controller.getState ? controller.getState() : null;
      const currentId = state && state.media && state.media.audioOutputDeviceId || "default";
      const index = outputs.findIndex(device => device.deviceId === currentId);
      const next = outputs[(index + 1 + outputs.length) % outputs.length];
      await controller.setAudioOutput(next.deviceId);
      setStatus(tr("خروجی صدا تغییر کرد: ", "Audio output changed: ") + (next.label || tr("دستگاه صوتی", "Audio device")), "connected");
    } catch (error) {
      setStatus(tr("تغییر خروجی صدا انجام نشد: ", "Could not change audio output: ") + error.message, "error");
    }
  }

  async function unlockAudio() {
    if (!controller) return;
    try {
      const ready = await controller.startAudioPlayback();
      if (ready) {
        byId("farnazLiveKitUnlockWrap").hidden = true;
        setStatus(tr("صدای تماس فعال است", "Call audio is enabled"), "connected");
      } else {
        setStatus(tr("مرورگر هنوز پخش صدا را مسدود کرده است.", "The browser is still blocking audio playback."), "error");
      }
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  root.FarnazLiveKitCallUI = Object.freeze({
    setUser: setUser,
    start: start,
    toggleAudioRoute: toggleAudioRoute
  });
})(typeof window !== "undefined" ? window : globalThis);
