(function (root) {
  "use strict";

  const TERMINAL = new Set(["rejected", "ended", "missed"]);
  const LIVE = new Set(["ringing", "active"]);
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const SESSION_COLUMNS = "id,caller_id,receiver_id,call_type,status,created_at,updated_at";

  function create(options) {
    const settings = options || {};
    const supabase = settings.supabase;
    const expectedUserId = String(settings.userId || "");
    const onEvent = typeof settings.onEvent === "function" ? settings.onEvent : function () {};
    const ringingTimeoutMs = Number.isFinite(settings.ringingTimeoutMs) ? Math.max(1000, settings.ringingTimeoutMs) : 45000;
    const recoveryWindowMs = Number.isFinite(settings.recoveryWindowMs) ? Math.max(10000, settings.recoveryWindowMs) : 120000;

    let currentUserId = null;
    let activeSession = null;
    let activeRole = null;
    let callChannel = null;
    let inboxChannel = null;
    let ringingTimer = null;
    let disposed = false;
    let inboxStarting = null;
    let startInProgress = false;
    let transitionInProgress = false;
    const seenIncoming = new Set();

    function emit(type, details) {
      try { onEvent(Object.assign({ type: type }, details || {})); }
      catch (error) { console.warn("[Farnaz call sessions] Event handler failed:", error); }
    }

    function assertReady() {
      if (disposed) throw new Error("Call session manager has been disposed.");
      if (!supabase || typeof supabase.from !== "function" || typeof supabase.channel !== "function" ||
          !supabase.auth || typeof supabase.auth.getUser !== "function") {
        throw new Error("Supabase call-session services are not ready.");
      }
      if (!UUID_RE.test(expectedUserId)) throw new Error("A valid signed-in user ID is required.");
    }

    async function verifyUser() {
      assertReady();
      const result = await supabase.auth.getUser();
      if (result.error) throw result.error;
      const actual = result.data && result.data.user && String(result.data.user.id || "");
      if (!actual || actual !== expectedUserId) throw new Error("The signed-in account changed. Reopen the call screen.");
      currentUserId = actual;
      return actual;
    }

    function removeChannel(channel) {
      if (!channel) return Promise.resolve();
      try {
        return Promise.resolve(supabase.removeChannel(channel)).catch(function (error) {
          console.warn("[Farnaz call sessions] Channel cleanup failed:", error);
        });
      } catch (error) {
        console.warn("[Farnaz call sessions] Channel cleanup failed:", error);
        return Promise.resolve();
      }
    }

    function clearRingingTimer() {
      if (ringingTimer !== null) {
        clearTimeout(ringingTimer);
        ringingTimer = null;
      }
    }

    async function subscribeToSession(session) {
      assertReady();
      if (callChannel) await removeChannel(callChannel);
      const channel = supabase.channel("farnaz-livekit-session-" + session.id);
      callChannel = channel;
      channel.on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "call_sessions",
        filter: "id=eq." + session.id
      }, function (payload) {
        const updated = payload && payload.new;
        if (updated && String(updated.id) === String(activeSession && activeSession.id)) {
          applySessionUpdate(updated);
        }
      });

      await new Promise(function (resolve, reject) {
        let settled = false;
        const timer = setTimeout(function () {
          if (settled) return;
          settled = true;
          reject(new Error("Call status channel timed out."));
        }, 12000);
        channel.subscribe(function (status) {
          if (settled) {
            if (activeSession && String(activeSession.id) === String(session.id) && !disposed) {
              if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
                emit("error", { phase: "session-realtime", error: new Error("Call status updates were interrupted.") });
              } else if (status === "SUBSCRIBED") {
                emit("realtime-restored", { session: activeSession });
              }
            }
            return;
          }
          if (status === "SUBSCRIBED") {
            settled = true;
            clearTimeout(timer);
            resolve();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            settled = true;
            clearTimeout(timer);
            reject(new Error("Could not subscribe to call status updates."));
          }
        });
      });
    }

    async function clearActiveSession(finalStatus, emitFinal) {
      const session = activeSession;
      const role = activeRole;
      activeSession = null;
      activeRole = null;
      clearRingingTimer();
      const channel = callChannel;
      callChannel = null;
      await removeChannel(channel);
      if (session && emitFinal !== false) emit("finished", { session: session, role: role, status: finalStatus || session.status });
    }

    function armRingingTimeout(session) {
      clearRingingTimer();
      ringingTimer = setTimeout(async function () {
        if (disposed || !activeSession || String(activeSession.id) !== String(session.id) || activeSession.status !== "ringing") return;
        try {
          const result = await supabase.from("call_sessions")
            .update({ status: "missed" })
            .eq("id", session.id)
            .eq("status", "ringing")
            .select(SESSION_COLUMNS)
            .maybeSingle();
          if (result.error) throw result.error;
          if (result.data) {
            applySessionUpdate(result.data);
          } else if (activeSession && String(activeSession.id) === String(session.id)) {
            const latest = await supabase.from("call_sessions")
              .select(SESSION_COLUMNS)
              .eq("id", session.id)
              .maybeSingle();
            if (latest.error) throw latest.error;
            if (latest.data) applySessionUpdate(latest.data);
            else await clearActiveSession("missed", true);
          }
        } catch (error) {
          emit("error", { phase: "ringing-timeout", error: error });
        }
      }, ringingTimeoutMs);
    }

    async function refreshSession(sessionId) {
      const result = await supabase.from("call_sessions")
        .select(SESSION_COLUMNS)
        .eq("id", sessionId)
        .maybeSingle();
      if (result.error) throw result.error;
      if (result.data) applySessionUpdate(result.data);
      else if (activeSession && String(activeSession.id) === String(sessionId)) {
        await clearActiveSession("ended", true);
      }
      return result.data || null;
    }

    function applySessionUpdate(session) {
      if (!activeSession || String(activeSession.id) !== String(session.id)) return;
      const previousStatus = activeSession.status;
      activeSession = Object.assign({}, activeSession, session);
      if (session.status === "active") {
        clearRingingTimer();
        if (previousStatus !== "active") emit("accepted", { session: activeSession, role: activeRole });
      } else if (TERMINAL.has(session.status)) {
        clearActiveSession(session.status, true).catch(function (error) {
          emit("error", { phase: "session-cleanup", error: error });
        });
      } else if (previousStatus !== session.status) {
        emit("status", { session: activeSession, role: activeRole });
      }
    }

    async function adoptIncoming(session) {
      if (disposed || !session || session.status !== "ringing" || String(session.receiver_id) !== currentUserId) return;
      const id = String(session.id || "");
      if (!UUID_RE.test(id) || seenIncoming.has(id)) return;
      seenIncoming.add(id);
      if (activeSession) {
        emit("incoming-while-busy", { session: session, activeSession: activeSession });
        return;
      }
      activeSession = Object.assign({}, session);
      activeRole = "receiver";
      try {
        await subscribeToSession(activeSession);
        if (!activeSession || String(activeSession.id) !== id) return;
        await refreshSession(id);
        if (!activeSession || String(activeSession.id) !== id || activeSession.status !== "ringing") return;
        emit("incoming", { session: activeSession, role: activeRole });
      } catch (error) {
        if (activeSession && String(activeSession.id) === id) {
          activeSession = null;
          activeRole = null;
        }
        if (callChannel) {
          const failedChannel = callChannel;
          callChannel = null;
          await removeChannel(failedChannel);
        }
        seenIncoming.delete(id);
        emit("error", { phase: "incoming-subscription", error: error, session: session });
      }
    }

    async function start(input) {
      assertReady();
      if (startInProgress) throw new Error("A call invitation is already being created.");
      startInProgress = true;
      try {
        await verifyUser();
        if (activeSession) throw new Error("Another call is already active or ringing.");
        const target = input || {};
        const peerId = String(target.peerId || "");
        const callType = target.callType === "video" ? "video" : "audio";
        if (!UUID_RE.test(peerId) || peerId === currentUserId) throw new Error("A valid, different contact is required.");

        const result = await supabase.from("call_sessions").insert({
          caller_id: currentUserId,
          receiver_id: peerId,
          call_type: callType,
          status: "ringing"
        }).select(SESSION_COLUMNS).single();
        if (result.error) throw result.error;
        const createdSession = result.data;
        if (!createdSession || String(createdSession.caller_id) !== currentUserId ||
            String(createdSession.receiver_id) !== peerId || createdSession.status !== "ringing") {
          throw new Error("The call invitation returned an invalid session.");
        }
        if (disposed || activeSession) {
          try {
            await supabase.from("call_sessions").update({ status: "ended" })
              .eq("id", createdSession.id).eq("status", "ringing");
          } catch (_) {}
          if (disposed) throw new Error("The call manager was closed while creating the invitation.");
          throw new Error("Another incoming call arrived while this invitation was being created.");
        }

        activeSession = Object.assign({}, createdSession);
        activeRole = "caller";
        try {
          await subscribeToSession(activeSession);
          await refreshSession(createdSession.id);
        } catch (error) {
          try {
            await supabase.from("call_sessions").update({ status: "ended" })
              .eq("id", createdSession.id).eq("status", "ringing");
          } catch (_) {}
          if (activeSession && String(activeSession.id) === String(createdSession.id)) {
            await clearActiveSession("ended", false);
          }
          throw error;
        }
        if (activeSession && activeSession.status === "ringing") {
          armRingingTimeout(activeSession);
          emit("outgoing", { session: activeSession, role: activeRole });
        }
        return Object.assign({}, createdSession);
      } finally {
        startInProgress = false;
      }
    }

    async function updateStatus(nextStatus) {
      if (transitionInProgress) throw new Error("A call status change is already in progress.");
      transitionInProgress = true;
      try {
        await verifyUser();
        if (!activeSession) throw new Error("There is no active call session.");
        const session = activeSession;
        if (nextStatus === "active" || nextStatus === "rejected") {
          if (activeRole !== "receiver" || session.status !== "ringing") {
            throw new Error("Only the receiver can answer or reject a ringing call.");
          }
        } else if (nextStatus === "ended") {
          if (!LIVE.has(session.status)) throw new Error("This call has already finished.");
        } else {
          throw new Error("Unsupported call-session transition.");
        }

        let query = supabase.from("call_sessions").update({ status: nextStatus }).eq("id", session.id);
        if (nextStatus === "active" || nextStatus === "rejected") query = query.eq("receiver_id", currentUserId).eq("status", "ringing");
        else query = query.in("status", ["ringing", "active"]);
        const result = await query.select(SESSION_COLUMNS).maybeSingle();
        if (result.error) throw result.error;
        if (!result.data) throw new Error("The call changed or ended before this action completed.");
        applySessionUpdate(result.data);
        return result.data;
      } finally {
        transitionInProgress = false;
      }
    }

    async function answer() { return updateStatus("active"); }
    async function reject() { return updateStatus("rejected"); }
    async function end() { return updateStatus("ended"); }

    async function watchIncoming() {
      await verifyUser();
      if (inboxChannel) return true;
      if (inboxStarting) return inboxStarting;
      inboxStarting = (async function () {
        const channel = supabase.channel("farnaz-livekit-inbox-" + currentUserId);
        inboxChannel = channel;
        channel.on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "call_sessions",
          filter: "receiver_id=eq." + currentUserId
        }, function (payload) {
          adoptIncoming(payload && payload.new).catch(function (error) {
            emit("error", { phase: "incoming-event", error: error });
          });
        });

        await new Promise(function (resolve, reject) {
          let settled = false;
          const timer = setTimeout(function () {
            if (settled) return;
            settled = true;
            reject(new Error("Incoming-call listener timed out."));
          }, 12000);
          channel.subscribe(function (status) {
            if (settled) {
              if (!disposed) {
                if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
                  emit("error", { phase: "inbox-realtime", error: new Error("Incoming-call listener lost its connection.") });
                } else if (status === "SUBSCRIBED") {
                  emit("inbox-reconnected");
                }
              }
              return;
            }
            if (status === "SUBSCRIBED") {
              settled = true;
              clearTimeout(timer);
              resolve();
            } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
              settled = true;
              clearTimeout(timer);
              reject(new Error("Could not subscribe to incoming calls."));
            }
          });
        });

        if (disposed) return false;
        const since = new Date(Date.now() - recoveryWindowMs).toISOString();
        const pending = await supabase.from("call_sessions")
          .select(SESSION_COLUMNS)
          .eq("receiver_id", currentUserId)
          .eq("status", "ringing")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(10);
        if (pending.error) throw pending.error;
        if (disposed) return false;
        for (const session of pending.data || []) await adoptIncoming(session);
        emit("inbox-ready", { recovered: (pending.data || []).length });
        return true;
      })();
      try { return await inboxStarting; }
      catch (error) {
        const failedChannel = inboxChannel;
        inboxChannel = null;
        await removeChannel(failedChannel);
        emit("error", { phase: "inbox-start", error: error });
        throw error;
      } finally {
        inboxStarting = null;
      }
    }

    async function close() {
      if (disposed) return;
      disposed = true;
      clearRingingTimer();
      const channels = [callChannel, inboxChannel];
      callChannel = null;
      inboxChannel = null;
      activeSession = null;
      activeRole = null;
      await Promise.all(channels.map(removeChannel));
      emit("closed");
    }

    return Object.freeze({
      start: start,
      answer: answer,
      reject: reject,
      end: end,
      watchIncoming: watchIncoming,
      close: close,
      getState: function () {
        return {
          userId: currentUserId,
          role: activeRole,
          session: activeSession ? Object.assign({}, activeSession) : null,
          status: activeSession ? activeSession.status : "idle",
          disposed: disposed
        };
      }
    });
  }

  root.FarnazCallSessions = Object.freeze({
    create: create,
    integrationStatus: "isolated-session-lifecycle-not-enabled"
  });
})(typeof window !== "undefined" ? window : globalThis);
