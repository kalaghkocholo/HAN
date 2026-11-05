(function (root) {
  "use strict";

  function create(options) {
    const settings = options || {};
    const supabase = settings.supabase;
    const userId = settings.userId;
    const onEvent = typeof settings.onEvent === "function" ? settings.onEvent : function () {};
    const loadSdk = settings.loadSdk || function () {
      if (!root.FarnazLiveKitSdk || typeof root.FarnazLiveKitSdk.load !== "function") {
        return Promise.reject(new Error("The local LiveKit SDK loader is unavailable."));
      }
      return root.FarnazLiveKitSdk.load();
    };
    const mediaFactory = settings.mediaFactory || function (mediaOptions) {
      if (!root.FarnazLiveKitCalls || typeof root.FarnazLiveKitCalls.create !== "function") {
        throw new Error("The isolated LiveKit media adapter is unavailable.");
      }
      return root.FarnazLiveKitCalls.create(mediaOptions);
    };
    const sessionFactory = settings.sessionFactory || function (sessionOptions) {
      if (!root.FarnazCallSessions || typeof root.FarnazCallSessions.create !== "function") {
        throw new Error("The isolated call-session manager is unavailable.");
      }
      return root.FarnazCallSessions.create(sessionOptions);
    };

    let sdk = null;
    let sessions = null;
    let media = null;
    let disposed = false;
    let mediaStartPromise = null;
    let mediaDisconnectPromise = null;
    let activeCallId = null;
    let acceptedBeforeMedia = false;
    let ending = false;

    function emit(type, detail) {
      try { onEvent({ type: type, detail: detail || null }); }
      catch (error) { console.warn("[Farnaz call controller] Event handler failed:", error); }
    }

    function assertReady() {
      if (disposed) throw new Error("The call controller has been disposed.");
      if (!supabase) throw new Error("Supabase is not ready.");
    }

    async function ensureSdk() {
      if (sdk) return sdk;
      sdk = await loadSdk();
      if (!sdk || typeof sdk.Room !== "function") throw new Error("The local LiveKit SDK did not expose the expected API.");
      return sdk;
    }

    function ensureSessions() {
      if (!sessions) {
        sessions = sessionFactory({
          supabase: supabase,
          userId: userId,
          onEvent: handleSessionEvent
        });
      }
      return sessions;
    }

    async function disconnectMedia() {
      if (mediaDisconnectPromise) return mediaDisconnectPromise;
      const current = media;
      media = null;
      acceptedBeforeMedia = false;
      if (!current) return;
      mediaDisconnectPromise = (async function () {
        try { await current.disconnect(); }
        catch (error) { emit("error", { phase: "media-disconnect", error: error }); }
      })();
      try { await mediaDisconnectPromise; }
      finally { mediaDisconnectPromise = null; }
    }

    async function handleSessionEvent(event) {
      if (!event) return;
      const eventCallId = event.session && String(event.session.id || "");
      if (event.type === "incoming" || event.type === "outgoing") {
        if (eventCallId) activeCallId = eventCallId;
      }
      if (event.type === "accepted") {
        if (eventCallId && activeCallId && eventCallId !== activeCallId) return;
        if (eventCallId && !activeCallId) activeCallId = eventCallId;
        if (event.role === "caller") {
          if (media && media.getState().connected) {
            try {
              await enableAcceptedMedia(media, event.session);
            } catch (error) {
              emit("error", { phase: "enable-media-after-answer", error: error });
              end().catch(failure => emit("error", { phase: "end-after-media-failure", error: failure }));
            }
          } else {
            acceptedBeforeMedia = true;
          }
        }
      } else if (event.type === "finished") {
        if (eventCallId && activeCallId && eventCallId !== activeCallId) return;
        activeCallId = null;
        await disconnectMedia();
      }
      emit("session-" + event.type, event);
    }

    async function enableAcceptedMedia(instance, session) {
      await instance.setMicrophoneEnabled(true);
      if (session && session.call_type === "video") {
        await instance.setCameraEnabled(true);
      }
    }

    function createMedia(session, publishMicrophone) {
      return mediaFactory({
        supabase: supabase,
        callSessionId: session.id,
        callType: session.call_type,
        livekitClient: sdk,
        publishMicrophoneOnConnect: publishMicrophone,
        publishCameraOnConnect: publishMicrophone,
        onEvent: event => {
          emit("media-" + event.type, event.detail);
          if (event.type === "disconnected" && !ending && sessions && sessions.getState().session) {
            sessions.end().catch(error => emit("error", { phase: "end-after-media-disconnect", error: error }));
          }
        }
      });
    }

    async function connectOutgoingMedia(session) {
      if (mediaStartPromise) return mediaStartPromise;
      mediaStartPromise = (async function () {
        if (mediaDisconnectPromise) await mediaDisconnectPromise;
        await ensureSdk();
        if (disposed) throw new Error("The call controller was closed before media setup.");
        const instance = createMedia(session, false);
        media = instance;
        await instance.connect();
        if (media !== instance || disposed) throw new Error("The call ended while media was connecting.");
        if (acceptedBeforeMedia) {
          await enableAcceptedMedia(instance, session);
          acceptedBeforeMedia = false;
        }
        emit("media-ready", { callSessionId: session.id, microphoneEnabled: instance.getState().microphoneEnabled });
        return instance;
      })();
      try { return await mediaStartPromise; }
      catch (error) {
        await disconnectMedia();
        throw error;
      } finally {
        mediaStartPromise = null;
      }
    }

    async function watchIncoming() {
      assertReady();
      return ensureSessions().watchIncoming();
    }

    async function start(input) {
      assertReady();
      const manager = ensureSessions();
      const session = await manager.start(input);
      activeCallId = String(session.id);
      try {
        await connectOutgoingMedia(session);
        return session;
      } catch (error) {
        try { await manager.end(); } catch (_) {}
        emit("error", { phase: "outgoing-media-connect", error: error });
        throw error;
      }
    }

    async function answer() {
      assertReady();
      const manager = ensureSessions();
      const state = manager.getState();
      if (!state.session || state.role !== "receiver" || state.status !== "ringing") {
        throw new Error("There is no incoming ringing call to answer.");
      }
      if (media) throw new Error("Media is already prepared for this call.");
      activeCallId = String(state.session.id);
      if (mediaDisconnectPromise) await mediaDisconnectPromise;
      await ensureSdk();
      const instance = createMedia(state.session, true);
      media = instance;
      try {
        // Connect and request microphone permission within the answer button's user gesture.
        await instance.connect();
        await manager.answer();
        emit("media-ready", { callSessionId: state.session.id, microphoneEnabled: true });
        return state.session;
      } catch (error) {
        await disconnectMedia();
        try {
          const latest = manager.getState();
          if (latest.session && latest.status === "ringing" && latest.role === "receiver") {
            await manager.end();
          }
        } catch (_) {}
        emit("error", { phase: "answer", error: error });
        throw error;
      }
    }

    async function reject() {
      assertReady();
      const manager = ensureSessions();
      try { return await manager.reject(); }
      finally { await disconnectMedia(); }
    }

    async function end() {
      assertReady();
      const manager = ensureSessions();
      ending = true;
      const statusPromise = manager.getState().session ? manager.end() : Promise.resolve(null);
      const mediaPromise = disconnectMedia();
      const results = await Promise.allSettled([statusPromise, mediaPromise]);
      ending = false;
      const failed = results.find(result => result.status === "rejected");
      if (failed) throw failed.reason;
      return results[0].value;
    }

    async function close() {
      if (disposed) return;
      try {
        if (sessions && sessions.getState().session) await end();
      } catch (error) {
        emit("error", { phase: "close-active-call", error: error });
        await disconnectMedia();
      }
      disposed = true;
      activeCallId = null;
      if (sessions) await sessions.close();
      emit("closed");
    }

    function requireMedia() {
      if (!media) throw new Error("There is no connected media session.");
      return media;
    }

    return Object.freeze({
      watchIncoming: watchIncoming,
      start: start,
      answer: answer,
      reject: reject,
      end: end,
      close: close,
      setMicrophoneEnabled: enabled => requireMedia().setMicrophoneEnabled(enabled),
      setCameraEnabled: enabled => requireMedia().setCameraEnabled(enabled),
      startAudioPlayback: () => requireMedia().startAudioPlayback(),
      getState: function () {
        const sessionState = sessions ? sessions.getState() : { status: "idle", role: null, session: null };
        return {
          status: sessionState.status,
          role: sessionState.role,
          session: sessionState.session,
          media: media ? media.getState() : null,
          disposed: disposed
        };
      }
    });
  }

  root.FarnazCallController = Object.freeze({
    create: create,
    integrationStatus: "isolated-audio-first-controller-not-enabled"
  });
})(typeof window !== "undefined" ? window : globalThis);
