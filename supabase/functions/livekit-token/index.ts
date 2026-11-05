import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { AccessToken } from "npm:livekit-server-sdk@2.19.1";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://kalaghkocholo.github.io",
  "https://farnaz-eight.vercel.app",
  "https://farnaz-kalaghkochak-9847.vercel.app",
  "https://farnaz-git-main-kalaghkochak-9847.vercel.app",
  "https://farnaz-git-vercel-hosting-setup-kalaghkochak-9847.vercel.app",
  "https://farnaz-dygeaf36o-kalaghkochak-9847.vercel.app",
];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function allowedOrigins(): Set<string> {
  const configured = Deno.env.get("FARNAZ_ALLOWED_ORIGINS");
  const configuredValues = configured
    ? configured.split(",").map((value) => value.trim()).filter(Boolean)
    : [];
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configuredValues]);
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  origin: string | null,
): Response {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  });
  if (origin && allowedOrigins().has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "authorization, apikey, content-type, x-client-info");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (origin && !allowedOrigins().has(origin)) {
    return jsonResponse({ error: "Origin is not allowed." }, 403, null);
  }

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin ?? DEFAULT_ALLOWED_ORIGINS[0],
        "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Max-Age": "600",
        "Vary": "Origin",
      },
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, origin);
  }

  const authorization = req.headers.get("authorization") ?? "";
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (!bearerMatch) {
    return jsonResponse({ error: "Sign in is required." }, 401, origin);
  }
  const userJwt = bearerMatch[1].trim();

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return jsonResponse({ error: "Content-Type must be application/json." }, 415, origin);
  }

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 4096) {
    return jsonResponse({ error: "Request is too large." }, 413, origin);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400, origin);
  }

  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "A call target is required." }, 400, origin);
  }
  const requestBody = body as {
    spaceId?: unknown;
    callSessionId?: unknown;
    callType?: unknown;
  };
  const hasSpaceId = typeof requestBody.spaceId === "string";
  const hasCallSessionId = typeof requestBody.callSessionId === "string";
  if (hasSpaceId === hasCallSessionId) {
    return jsonResponse({ error: "Provide exactly one group spaceId or direct callSessionId." }, 400, origin);
  }
  if (requestBody.callType !== "audio" && requestBody.callType !== "video") {
    return jsonResponse({ error: "Invalid call type." }, 400, origin);
  }
  const spaceId = hasSpaceId ? requestBody.spaceId as string : null;
  const callSessionId = hasCallSessionId ? requestBody.callSessionId as string : null;
  const callType = requestBody.callType;
  const targetId = spaceId ?? callSessionId;
  if (!targetId || !UUID_RE.test(targetId)) {
    return jsonResponse({ error: "Invalid call target identifier." }, 400, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")
    ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const livekitApiKey = Deno.env.get("LIVEKIT_API_KEY");
  const livekitApiSecret = Deno.env.get("LIVEKIT_API_SECRET");
  const livekitUrl = Deno.env.get("LIVEKIT_URL");

  if (!supabaseUrl || !supabaseKey || !livekitApiKey || !livekitApiSecret || !livekitUrl) {
    console.error("LiveKit token endpoint is missing required server-side configuration.");
    return jsonResponse({ error: "Call service is not configured." }, 503, origin);
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${userJwt}` } },
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });

    // Validate the caller against Supabase Auth; never trust a user ID from the request body.
    const { data: authData, error: authError } = await supabase.auth.getUser(userJwt);
    if (authError || !authData.user) {
      return jsonResponse({ error: "Session is invalid or expired." }, 401, origin);
    }
    const userId = authData.user.id;

    let roomName: string;
    let authorizedCallType = callType;

    if (callSessionId) {
      // RLS exposes a direct call session only to its caller and receiver.
      // Still verify participant identity and live status explicitly before issuing a room token.
      const { data: callSession, error: callSessionError } = await supabase
        .from("call_sessions")
        .select("id, caller_id, receiver_id, call_type, status")
        .eq("id", callSessionId)
        .maybeSingle();

      if (callSessionError) {
        console.error("Could not verify direct call session:", callSessionError.message);
        return jsonResponse({ error: "Could not verify this call." }, 500, origin);
      }
      if (
        !callSession ||
        (callSession.caller_id !== userId && callSession.receiver_id !== userId) ||
        (callSession.status !== "ringing" && callSession.status !== "active")
      ) {
        return jsonResponse({ error: "This call is not available to this account." }, 403, origin);
      }
      if (callSession.call_type !== callType) {
        return jsonResponse({ error: "Requested call type does not match the call session." }, 403, origin);
      }
      authorizedCallType = callSession.call_type;
      roomName = `farnaz-direct-${callSession.id}`;
    } else {
      // Require an actual membership row. Public channel visibility alone must not grant call access.
      const { data: membership, error: membershipError } = await supabase
        .from("space_members")
        .select("space_id")
        .eq("space_id", spaceId)
        .eq("user_id", userId)
        .maybeSingle();

      if (membershipError) {
        console.error("Could not verify group membership:", membershipError.message);
        return jsonResponse({ error: "Could not verify group membership." }, 500, origin);
      }
      if (!membership) {
        return jsonResponse({ error: "You are not a member of this group." }, 403, origin);
      }

      const { data: space, error: spaceError } = await supabase
        .from("spaces")
        .select("id, type")
        .eq("id", spaceId)
        .maybeSingle();

      if (spaceError) {
        console.error("Could not load call group:", spaceError.message);
        return jsonResponse({ error: "Could not verify this group." }, 500, origin);
      }
      if (!space || space.type !== "group") {
        return jsonResponse({ error: "Calls are only available for group spaces." }, 403, origin);
      }
      roomName = `farnaz-group-${space.id}`;
    }

    // Room names are always derived server-side; API secrets never reach the client.
    const token = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: userId,
      ttl: "5m",
    });
    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const jwt = await token.toJwt();
    return jsonResponse({ token: jwt, serverUrl: livekitUrl, roomName, callType: authorizedCallType }, 200, origin);
  } catch (error) {
    console.error("LiveKit token issuance failed:", error instanceof Error ? error.message : "Unknown error");
    return jsonResponse({ error: "Could not issue a call token." }, 500, origin);
  }
});
