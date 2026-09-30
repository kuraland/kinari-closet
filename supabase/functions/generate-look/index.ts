// 追加意図: 公開サイトへAPIキーを置かず、認証・回数制限・非公開保存を経由して匿名モデルの着用イメージを生成する。処理日時: 2026-09-30 JST
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const OPENAI_MODEL = "gpt-image-2.5-flare";
const ORCHESTRATOR_MODEL = "gpt-5";
const DAILY_LIMIT = 3;
const MAX_IMAGES = 5;
const MAX_IMAGE_DATA_LENGTH = 3_000_000;
const ALLOWED_CATEGORIES = new Set(["tops", "bottoms", "onepiece", "outer", "shoes", "accessory"]);

type GarmentInput = {
  id: string;
  name: string;
  category: string;
  color?: string;
  imageDataUrl: string;
};

type RequestBody = {
  items?: GarmentInput[];
  conditions?: Record<string, unknown>;
};

function corsHeaders(origin: string | null) {
  const allowedOrigin = origin && (
    origin === "https://kuraland.github.io"
    || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  ) ? origin : "https://kuraland.github.io";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function jsonResponse(body: Record<string, unknown>, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

function startOfTodayJst() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(`${value.year}-${value.month}-${value.day}T00:00:00+09:00`).toISOString();
}

function validateItems(value: unknown): GarmentInput[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_IMAGES) {
    throw new Error("INVALID_ITEMS");
  }
  return value.map((raw) => {
    const item = raw as Partial<GarmentInput>;
    const imageDataUrl = typeof item.imageDataUrl === "string" ? item.imageDataUrl : "";
    const category = typeof item.category === "string" ? item.category : "";
    if (
      typeof item.id !== "string"
      || typeof item.name !== "string"
      || !ALLOWED_CATEGORIES.has(category)
      || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(imageDataUrl)
      || imageDataUrl.length > MAX_IMAGE_DATA_LENGTH
    ) throw new Error("INVALID_ITEMS");
    return {
      id: item.id.slice(0, 160),
      name: item.name.trim().slice(0, 120),
      category,
      color: typeof item.color === "string" ? item.color.slice(0, 40) : "",
      imageDataUrl,
    };
  });
}

function buildPrompt(items: GarmentInput[], conditions: Record<string, unknown>) {
  const garmentList = items.map((item, index) => (
    `Reference ${index + 1}: ${item.category}, ${item.name}${item.color ? `, color ${item.color}` : ""}`
  )).join("\n");
  const occasion = typeof conditions.occasion === "string" ? conditions.occasion : "daily";
  const mood = typeof conditions.mood === "string" ? conditions.mood : "relaxed";
  const weather = typeof conditions.weather === "string" ? conditions.weather : "sunny";

  return `Create one photorealistic, full-body editorial fashion photograph of one adult male-presenting anonymous model wearing the outfit assembled from the garment reference images.

Garments:
${garmentList}

Preserve each garment's recognizable color, pattern, material, proportions, and key details as faithfully as possible. Use each reference garment once when it is wearable in the outfit. Do not invent brand logos, lettering, extra garments, bags, hats, or jewelry. Natural standing pose, neutral warm-gray studio background, soft daylight, realistic fabric texture, accurate hands and feet. Keep the model's identity anonymous by framing the face above the mouth out of the image. Show the entire outfit including shoes. Vertical fashion catalog composition.

Context: occasion=${occasion}, mood=${mood}, weather=${weather}.
This is a styling preview, not an exact body-fit simulation.`;
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (request.method !== "POST") return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405, origin);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse({ error: "LOGIN_REQUIRED", message: "ログインが必要です" }, 401, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: "SERVER_NOT_CONFIGURED" }, 503, origin);
  }
  if (!openaiApiKey) {
    return jsonResponse({ error: "IMAGE_API_NOT_CONFIGURED", message: "画像生成機能の準備中です" }, 503, origin);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const userResult = await userClient.auth.getUser();
  const user = userResult.data.user;
  if (userResult.error || !user) {
    return jsonResponse({ error: "LOGIN_REQUIRED", message: "ログインし直してください" }, 401, origin);
  }

  let items: GarmentInput[];
  let conditions: Record<string, unknown>;
  try {
    const body = await request.json() as RequestBody;
    items = validateItems(body.items);
    conditions = body.conditions && typeof body.conditions === "object" ? body.conditions : {};
  } catch {
    return jsonResponse({ error: "INVALID_ITEMS", message: "服の画像を確認できませんでした" }, 400, origin);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const quotaResult = await admin
    .from("generated_looks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", startOfTodayJst())
    .neq("status", "failed");
  if (quotaResult.error) return jsonResponse({ error: "DATABASE_ERROR" }, 500, origin);
  const usedToday = quotaResult.count || 0;
  if (usedToday >= DAILY_LIMIT) {
    return jsonResponse({ error: "DAILY_LIMIT", message: "本日の生成上限（3回）に達しました", remaining: 0 }, 429, origin);
  }

  const lookId = crypto.randomUUID();
  const insertResult = await admin.from("generated_looks").insert({
    id: lookId,
    user_id: user.id,
    item_ids: items.map((item) => item.id),
    conditions,
    status: "pending",
    model: OPENAI_MODEL,
  });
  if (insertResult.error) return jsonResponse({ error: "DATABASE_ERROR" }, 500, origin);

  try {
    const content = [
      { type: "input_text", text: buildPrompt(items, conditions) },
      ...items.map((item) => ({ type: "input_image", image_url: item.imageDataUrl, detail: "high" })),
    ];
    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ORCHESTRATOR_MODEL,
        input: [{ role: "user", content }],
        tools: [{
          type: "image_generation",
          model: OPENAI_MODEL,
          action: "edit",
          size: "1024x1536",
          quality: "low",
          output_format: "png",
        }],
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const openaiBody = await openaiResponse.json();
    if (!openaiResponse.ok) {
      console.error("OpenAI image generation failed", openaiResponse.status, openaiBody?.error?.code);
      throw new Error(openaiBody?.error?.code || "OPENAI_ERROR");
    }
    const imageBase64 = openaiBody.output?.find((entry: { type?: string }) => entry.type === "image_generation_call")?.result;
    if (!imageBase64) throw new Error("NO_IMAGE_RETURNED");

    const imagePath = `${user.id}/${lookId}.png`;
    const uploadResult = await admin.storage.from("generated-looks").upload(
      imagePath,
      decodeBase64(imageBase64),
      { contentType: "image/png", cacheControl: "3600", upsert: false },
    );
    if (uploadResult.error) throw new Error("STORAGE_ERROR");

    const completeResult = await admin.from("generated_looks").update({
      status: "ready",
      image_path: imagePath,
      completed_at: new Date().toISOString(),
    }).eq("id", lookId).eq("user_id", user.id);
    if (completeResult.error) throw new Error("DATABASE_ERROR");

    const signedResult = await admin.storage.from("generated-looks").createSignedUrl(imagePath, 3600);
    if (signedResult.error || !signedResult.data?.signedUrl) throw new Error("SIGNED_URL_ERROR");
    return jsonResponse({
      id: lookId,
      imageUrl: signedResult.data.signedUrl,
      remaining: Math.max(0, DAILY_LIMIT - usedToday - 1),
      label: "AI着用イメージ",
    }, 200, origin);
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 80) : "GENERATION_ERROR";
    console.error("Look generation failed", code);
    await admin.from("generated_looks").update({
      status: "failed",
      error_code: code,
      completed_at: new Date().toISOString(),
    }).eq("id", lookId).eq("user_id", user.id);
    return jsonResponse({
      error: "GENERATION_FAILED",
      message: "画像を生成できませんでした。少し時間をおいて再度お試しください",
      remaining: Math.max(0, DAILY_LIMIT - usedToday),
    }, 502, origin);
  }
});
