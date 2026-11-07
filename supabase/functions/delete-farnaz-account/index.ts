import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "600",
  "Cache-Control": "no-store",
  "Vary": "Origin",
};

function respond(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Method not allowed." }, 405);

  const authorization = req.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return respond({ error: "A signed-in session is required." }, 401);

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return respond({ error: "Content-Type must be application/json." }, 415);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return respond({ error: "Invalid request body." }, 400);
  }
  if (!body || typeof body !== "object" || (body as { confirmation?: unknown }).confirmation !== "DELETE") {
    return respond({ error: "Explicit account deletion confirmation is required." }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    console.error("Account deletion function is missing Supabase server configuration.");
    return respond({ error: "Account deletion is not configured." }, 503);
  }

  const jwt = match[1].trim();
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  try {
    // Resolve identity only from the validated bearer token; never accept a user ID from the body.
    const { data: authData, error: authError } = await userClient.auth.getUser(jwt);
    if (authError || !authData.user) return respond({ error: "Your session is invalid or expired. Sign in again." }, 401);
    const user = authData.user;
    const lastSignIn = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : 0;
    if (!lastSignIn || Date.now() - lastSignIn > 10 * 60 * 1000 || lastSignIn > Date.now() + 60_000) {
      return respond({ error: "For your security, sign in again before deleting your account." }, 403);
    }

    // Never assign group ownership implicitly during account deletion.
    // The owner must explicitly resolve every owned space before deletion can proceed.
    const { data: ownedSpaces, error: spacesError } = await admin
      .from("spaces")
      .select("id")
      .eq("created_by", user.id);
    if (spacesError) throw new Error("Could not inspect group ownership: " + spacesError.message);
    if ((ownedSpaces ?? []).length > 0) {
      return respond({
        error: "This account still owns one or more groups or channels. Transfer ownership explicitly from each group's management screen before deleting the account.",
        code: "OWNED_SPACES_REMAIN",
        owned_space_count: ownedSpaces.length,
      }, 409);
    }

    // Find every Storage object owned by this user, including group avatars whose paths
    // are based on space IDs rather than user IDs.
    const { data: objects, error: objectsError } = await admin.rpc(
      "farnaz_account_deletion_storage_objects",
      { p_user_id: user.id },
    );
    if (objectsError) throw new Error("Could not inspect account files: " + objectsError.message);

    const ownedObjects = (objects ?? []) as Array<{ bucket_id: string; name: string }>;
    for (const object of ownedObjects) {
      if (object.bucket_id === "chat-attachments") {
        for (const table of ["messages", "space_messages"] as const) {
          const { data: rows, error: readError } = await admin
            .from(table)
            .select("id,body")
            .eq("attachment_path", object.name);
          if (readError) throw new Error("Could not prepare retained message history: " + readError.message);
          for (const row of rows ?? []) {
            const { error: updateError } = await admin.from(table).update({
              body: row.body || "[FARNAZ_DELETED_ATTACHMENT]",
              message_type: "text",
              attachment_path: null,
              attachment_name: null,
              attachment_mime: null,
              attachment_size: null,
            }).eq("id", row.id);
            if (updateError) throw new Error("Could not preserve a message after removing its attachment: " + updateError.message);
          }
        }
      } else if (object.bucket_id === "group-avatars") {
        const { error: avatarError } = await admin
          .from("spaces")
          .update({ avatar_url: null })
          .eq("avatar_url", object.name);
        if (avatarError) throw new Error("Could not detach a group image: " + avatarError.message);
      }
    }

    // Delete all files owned by the account. Text messages and their sender IDs remain;
    // only the binary attachment is removed, with an explanatory placeholder if needed.
    const byBucket = new Map<string, string[]>();
    for (const object of ownedObjects) {
      if (!byBucket.has(object.bucket_id)) byBucket.set(object.bucket_id, []);
      byBucket.get(object.bucket_id)!.push(object.name);
    }
    for (const [bucket, names] of byBucket) {
      for (let offset = 0; offset < names.length; offset += 100) {
        const { error: removeError } = await admin.storage.from(bucket).remove(names.slice(offset, offset + 100));
        if (removeError) throw new Error("Could not remove account files from " + bucket + ": " + removeError.message);
      }
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id, false);
    if (deleteError) throw new Error("Account data was prepared, but the authentication account could not be deleted: " + deleteError.message);

    return respond({
      success: true,
      message: "Account deleted. Private and group message text was retained for the other participants.",
    });
  } catch (error) {
    console.error("Farnaz account deletion failed:", errorMessage(error));
    return respond({ error: "Account deletion could not be completed. Your account was not intentionally signed out; contact support if the problem persists." }, 500);
  }
});
