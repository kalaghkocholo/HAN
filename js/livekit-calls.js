(function (root) {
  "use strict";

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function create(options) {
    const settings = options || {};
    const supabase = settings.supabase;
    const spaceId = settings.spaceId;
    const callSessionId = settings.callSessionId;
    const isDirectCall = typeof callSessionId === "string";
    const callType = settings.callType === "video" ? "video" : "audio";
    const publishMicrophoneOnConnect = settings.publishMicrophoneOnConnect !== false;
    const publishCameraOnConnect = settings.publishCameraOnConnect !== false;
    const sdk = settings.livekitClient || root.LivekitClient;
    const onEvent = typeof settings.onEvent === "function" ? settings.onEvent : function () {};
    let room = null;
    let connected = false;
    let connecting = false;
    let disposed = false;
    let localMediaEnabled = false;
    let microphoneEnabled = false;
    let cameraEnabled = false;

    function emit(type, detail) {
      try { onEvent({ type: type, detail: detail || null }); }
      catch (error) { console.warn("[Farnaz LiveKit] Event handler failed:", error); }
    }

    function assertReady() {
      if (!supabase || !supabase.auth || !supabase.functions) {
        throw new Error("Supabase client is not ready.");
      }
      if (!sdk || typeof sdk.Room !== "function" || !sdk.RoomEvent || !sdk.Track) {
        throw new Error("LiveKit client SDK is not loaded. No external CDN is loaded automatically.");
      }
      const hasSpaceId = typeof spaceId === "string";
      const hasCallSessionId = typeof callSessionId === "string";
      if (hasSpaceId === hasCallSessionId) {
        throw new Error("Provide exactly one group ID or direct call session ID.");
      }
      const targetId = isDirectCall ? callSessionId : spaceId;
      if (!UUID_RE.test(String(targetId || ""))) {
        throw new Error("A valid call target identifier is required.");
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("This browser does not support microphone/camera capture.");
      }
    }

    async function connect() {
      assertReady();
      if (disposed) throw new Error("This call session has already been disposed.");
      if (connected) return api;
      if (connecting) throw new Error("This call session is already connecting.");
      connecting = true;
      emit("connecting", { callType: callType, spaceId: isDirectCall ? null : spaceId, callSessionId: isDirectCall ? callSessionId : null });

      try {
        const authResult = await supabase.auth.getSession();
        if (authResult.error) throw authResult.error;
        if (disposed) throw new Error("The call was cancelled before connecting.");
        const session = authResult.data && authResult.data.session;
        if (!session || !session.access_token) throw new Error("Sign in before joining a call.");

        const tokenBody = isDirectCall
          ? { callSessionId: callSessionId, callType: callType }
          : { spaceId: spaceId, callType: callType };
        const tokenResult = await supabase.functions.invoke("livekit-token", {
          body: tokenBody
        });
        if (tokenResult.error) throw tokenResult.error;
        if (disposed) throw new Error("The call was cancelled before connecting.");
        const credentials = tokenResult.data;
        if (!credentials || !credentials.token || !credentials.serverUrl || !credentials.roomName ||
          credentials.callType !== callType) {
          throw new Error("The call token service returned an invalid or mismatched response.");
        }

        // Do not persist the participant token or expose any LiveKit API secret.
        room = new sdk.Room({
          adaptiveStream: true,
          dynacast: true,
          stopLocalTrackOnUnpublish: true,
          disconnectOnPageLeave: true
        });

        const events = sdk.RoomEvent;
        room
          .on(events.TrackSubscribed, function (track, publication, participant) {
            emit("track-subscribed", { track: track, publication: publication, participant: participant });
          })
          .on(events.TrackUnsubscribed, function (track, publication, participant) {
            emit("track-unsubscribed", { track: track, publication: publication, participant: participant });
          })
          .on(events.ParticipantConnected, function (participant) {
            emit("participant-connected", { participant: participant });
          })
          .on(events.ParticipantDisconnected, function (participant, reason) {
            emit("participant-disconnected", { participant: participant, reason: reason });
          })
          .on(events.Reconnecting, function () { emit("reconnecting"); })
          .on(events.Reconnected, function () { emit("reconnected"); })
          .on(events.Disconnected, function (reason) {
            connected = false;
            localMediaEnabled = false;
            microphoneEnabled = false;
            cameraEnabled = false;
            emit("disconnected", { reason: reason });
          })
          .on(events.AudioPlaybackStatusChanged, function () {
            emit("audio-playback-status", { canPlaybackAudio: room ? room.canPlaybackAudio : false });
          })
          .on(events.MediaDevicesError, function (error) {
            emit("media-device-error", { message: String(error && error.message || error || "Media device error") });
          });

        await room.connect(credentials.serverUrl, credentials.token);
        if (disposed) {
          await room.disconnect(true);
          room = null;
          throw new Error("The call was cancelled while connecting.");
        }
        connected = true;
        emit("connected", {
          roomName: credentials.roomName,
          callType: callType,
          callSessionId: isDirectCall ? callSessionId : null,
          spaceId: isDirectCall ? null : spaceId,
          participantCount: room.remoteParticipants ? room.remoteParticipants.size + 1 : 1
        });

        // Keep media publication explicit. Outgoing callers can join the room silently
        // while ringing, then enable the microphone only after the receiver accepts.
        // Call connect from a user action on iOS when local media should be enabled.
        if (publishMicrophoneOnConnect) await room.localParticipant.setMicrophoneEnabled(true);
        if (callType === "video" && publishCameraOnConnect) {
          await room.localParticipant.setCameraEnabled(true);
        }
        microphoneEnabled = publishMicrophoneOnConnect;
        cameraEnabled = callType === "video" && publishCameraOnConnect;
        localMediaEnabled = microphoneEnabled || cameraEnabled;
        emit("local-media-enabled", {
          audio: publishMicrophoneOnConnect,
          video: callType === "video" && publishCameraOnConnect
        });
        return api;
      } catch (error) {
        if (room) {
          try { await room.disconnect(true); } catch (_) {}
          room = null;
        }
        connected = false;
        localMediaEnabled = false;
        microphoneEnabled = false;
        cameraEnabled = false;
        emit("error", { message: String(error && error.message || error || "Could not connect to call") });
        throw error;
      } finally {
        connecting = false;
      }
    }

    async function setMicrophoneEnabled(enabled) {
      if (!room || !connected) throw new Error("Not connected to a call.");
      microphoneEnabled = Boolean(enabled);
      await room.localParticipant.setMicrophoneEnabled(microphoneEnabled);
      localMediaEnabled = microphoneEnabled || cameraEnabled;
      emit("microphone-changed", { enabled: microphoneEnabled });
    }

    async function setCameraEnabled(enabled) {
      if (!room || !connected) throw new Error("Not connected to a call.");
      if (enabled && callType !== "video") {
        throw new Error("This session was created as audio-only.");
      }
      cameraEnabled = Boolean(enabled);
      await room.localParticipant.setCameraEnabled(cameraEnabled);
      localMediaEnabled = microphoneEnabled || cameraEnabled;
      emit("camera-changed", { enabled: cameraEnabled });
    }

    async function startAudioPlayback() {
      if (!room || !connected) throw new Error("Not connected to a call.");
      if (room.canPlaybackAudio) return true;
      await room.startAudio();
      return Boolean(room.canPlaybackAudio);
    }

    async function disconnect() {
      if (disposed) return;
      disposed = true;
      const currentRoom = room;
      room = null;
      connected = false;
      localMediaEnabled = false;
      microphoneEnabled = false;
      cameraEnabled = false;
      if (currentRoom) {
        try { await currentRoom.disconnect(true); }
        finally { emit("ended"); }
      } else {
        emit("ended");
      }
    }

    const api = {
      connect: connect,
      disconnect: disconnect,
      setMicrophoneEnabled: setMicrophoneEnabled,
      setCameraEnabled: setCameraEnabled,
      startAudioPlayback: startAudioPlayback,
      getState: function () {
        return {
          connected: connected,
          connecting: connecting,
          disposed: disposed,
          localMediaEnabled: localMediaEnabled,
          microphoneEnabled: microphoneEnabled,
          cameraEnabled: cameraEnabled,
          callType: callType,
          spaceId: isDirectCall ? null : spaceId,
          callSessionId: isDirectCall ? callSessionId : null
        };
      }
    };

    return api;
  }

  root.FarnazLiveKitCalls = Object.freeze({
    create: create,
    sdkVersion: "2.23.0",
    integrationStatus: "isolated-adapter-not-enabled"
  });
})(typeof window !== "undefined" ? window : globalThis);
