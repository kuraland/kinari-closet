// 更新意図: Gemini 3系の思考量と構造化出力を現行API仕様へ合わせ、服属性JSONを安定して取得する。処理日時: 2026-10-08 10:38 JST
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const MODEL = Deno.env.get("GEMINI_VISION_MODEL") || "gemini-3.1-flash-lite";
const PROMPT_VERSION = "garment-profile-v3";
const DAILY_LIMIT = Number(Deno.env.get("GARMENT_ANALYSIS_DAILY_LIMIT") || 60);
const MAX_IMAGE_DATA_LENGTH = 4_200_000;

const VALUES = {
  category: ["tops", "bottoms", "onepiece", "outer", "shoes", "accessory"],
  color: ["white", "black", "gray", "navy", "blue", "beige", "brown", "green", "red", "yellow", "pink", "purple", "multi"],
  season: ["all", "spring", "summer", "autumn", "winter"],
  pattern: ["solid", "stripe", "check", "floral", "graphic", "other"],
  material: ["cotton", "knit", "denim", "linen", "wool", "leather", "synthetic", "other"],
  silhouette: ["skinny", "slim", "regular", "relaxed", "oversized", "straight", "tapered", "wide", "flare"],
  garmentLength: ["cropped", "regular", "long"],
  sleeveLength: ["unknown", "sleeveless", "short", "threeQuarter", "long"],
  thickness: ["light", "medium", "heavy"],
  layerRole: ["inner", "standalone", "layer", "outer", "none"],
  style: ["casual", "clean", "minimal", "classic", "natural", "sporty", "trendy"],
} as const;

type AllowedKey = keyof typeof VALUES;
type AnalysisPayload = {
  imageDataUrl?: unknown;
  targetKind?: unknown;
  filename?: unknown;
  localGuess?: unknown;
};

function corsHeaders(origin: string | null) {
  const allowedOrigin = origin && (
      origin === "https://kuraland.github.io" ||
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
    )
    ? origin
    : "https://kuraland.github.io";
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

function clampNumber(value: unknown, minimum: number, maximum: number, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, Math.round(parsed))) : fallback;
}

function safeText(value: unknown, maxLength = 120) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function enumValue(key: AllowedKey, value: unknown, fallback: string) {
  const allowed = VALUES[key] as readonly string[];
  return typeof value === "string" && allowed.includes(value) ? value : fallback;
}

function parseImageDataUrl(value: unknown) {
  if (typeof value !== "string" || value.length > MAX_IMAGE_DATA_LENGTH) throw new Error("INVALID_IMAGE");
  const match = value.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("INVALID_IMAGE");
  return { mimeType: `image/${match[1]}`, data: match[2] };
}

function normalizeGuess(value: unknown) {
  const guess = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const category = enumValue("category", guess.category, "tops");
  return {
    category,
    color: enumValue("color", guess.color, "white"),
    silhouette: enumValue("silhouette", guess.silhouette, category === "bottoms" ? "straight" : "regular"),
  };
}

function schema() {
  const enumSchema = (values: readonly string[], description: string) => ({ type: "string", enum: [...values], description });
  const confidenceProperties = Object.fromEntries([
    "category", "color", "pattern", "material", "silhouette", "garmentLength", "sleeveLength",
    "thickness", "layerRole", "style", "season", "warmth", "formality", "statement",
  ].map((field) => [field, { type: "integer", minimum: 0, maximum: 100 }]));
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      displayName: { type: "string", description: "Short natural Japanese garment name without brand guessing" },
      subcategory: { type: "string", description: "Specific Japanese garment type such as Tシャツ, シャツ, スラックス, デニムジャケット" },
      category: enumSchema(VALUES.category, "Primary garment category"),
      color: enumSchema(VALUES.color, "Dominant color"),
      secondaryColors: { type: "array", maxItems: 3, items: enumSchema(VALUES.color, "Secondary color") },
      season: enumSchema(VALUES.season, "Most suitable season, or all"),
      warmth: { type: "integer", minimum: 1, maximum: 5 },
      formality: { type: "integer", minimum: 1, maximum: 5 },
      pattern: enumSchema(VALUES.pattern, "Visible pattern"),
      material: enumSchema(VALUES.material, "Visual material estimate; use other when uncertain"),
      silhouette: enumSchema(VALUES.silhouette, "Fit for tops/outer or leg shape for bottoms"),
      garmentLength: enumSchema(VALUES.garmentLength, "Overall garment length"),
      sleeveLength: enumSchema(VALUES.sleeveLength, "Sleeve length; unknown for non-sleeved items"),
      thickness: enumSchema(VALUES.thickness, "Apparent fabric thickness"),
      layerRole: enumSchema(VALUES.layerRole, "Likely layering role"),
      style: enumSchema(VALUES.style, "Primary style impression"),
      statement: { type: "integer", minimum: 1, maximum: 5 },
      confidence: { type: "integer", minimum: 0, maximum: 100 },
      fieldConfidences: {
        type: "object",
        additionalProperties: false,
        properties: confidenceProperties,
        required: Object.keys(confidenceProperties),
      },
      imageQuality: {
        type: "object",
        additionalProperties: false,
        properties: {
          usable: { type: "boolean" },
          score: { type: "integer", minimum: 0, maximum: 100 },
          issues: { type: "array", maxItems: 5, items: { type: "string" } },
          guidance: { type: "string", description: "Brief Japanese retake guidance, empty when usable" },
        },
        required: ["usable", "score", "issues", "guidance"],
      },
    },
    required: [
      "displayName", "subcategory", "category", "color", "secondaryColors", "season", "warmth",
      "formality", "pattern", "material", "silhouette", "garmentLength", "sleeveLength", "thickness",
      "layerRole", "style", "statement", "confidence", "fieldConfidences", "imageQuality",
    ],
  };
}

function normalizeResult(value: unknown, fallback: ReturnType<typeof normalizeGuess>) {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const category = enumValue("category", raw.category, fallback.category);
  const fieldSource = raw.fieldConfidences && typeof raw.fieldConfidences === "object"
    ? raw.fieldConfidences as Record<string, unknown>
    : {};
  const fieldConfidences = Object.fromEntries(Object.keys(schema().properties.fieldConfidences.properties).map((field) => [
    field,
    clampNumber(fieldSource[field], 0, 100, 50),
  ]));
  const qualitySource = raw.imageQuality && typeof raw.imageQuality === "object"
    ? raw.imageQuality as Record<string, unknown>
    : {};
  const attributes = {
    displayName: safeText(raw.displayName, 120),
    subcategory: safeText(raw.subcategory, 80),
    category,
    color: enumValue("color", raw.color, fallback.color),
    secondaryColors: Array.isArray(raw.secondaryColors)
      ? [...new Set(raw.secondaryColors.map((color) => enumValue("color", color, "")).filter(Boolean))].slice(0, 3)
      : [],
    season: enumValue("season", raw.season, "all"),
    warmth: clampNumber(raw.warmth, 1, 5, 2),
    formality: clampNumber(raw.formality, 1, 5, 2),
    pattern: enumValue("pattern", raw.pattern, "other"),
    material: enumValue("material", raw.material, "other"),
    silhouette: enumValue("silhouette", raw.silhouette, fallback.silhouette),
    garmentLength: enumValue("garmentLength", raw.garmentLength, "regular"),
    sleeveLength: enumValue("sleeveLength", raw.sleeveLength, "unknown"),
    thickness: enumValue("thickness", raw.thickness, "medium"),
    layerRole: enumValue("layerRole", raw.layerRole, category === "outer" ? "outer" : (["shoes", "accessory", "bottoms"].includes(category) ? "none" : "standalone")),
    style: enumValue("style", raw.style, "casual"),
    statement: clampNumber(raw.statement, 1, 5, 2),
  };
  return {
    attributes,
    confidence: clampNumber(raw.confidence, 0, 100, 50),
    fieldConfidences,
    imageQuality: {
      usable: qualitySource.usable !== false,
      score: clampNumber(qualitySource.score, 0, 100, 50),
      issues: Array.isArray(qualitySource.issues) ? qualitySource.issues.map((issue) => safeText(issue, 80)).filter(Boolean).slice(0, 5) : [],
      guidance: safeText(qualitySource.guidance, 240),
    },
  };
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (request.method !== "POST") return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405, origin);

  try {
    const authorization = request.headers.get("authorization") || "";
    if (!authorization.startsWith("Bearer ")) return jsonResponse({ error: "AUTH_REQUIRED", message: "AI解析にはログインが必要です" }, 401, origin);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY") || "";
    if (!geminiApiKey) return jsonResponse({ error: "AI_NOT_CONFIGURED", message: "AI画像解析はまだ設定されていません" }, 503, origin);

    const supabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const user = userData.user;
    if (userError || !user) return jsonResponse({ error: "AUTH_REQUIRED", message: "ログインし直してください" }, 401, origin);

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase.from("garment_analysis_runs").select("id", { count: "exact", head: true }).gte("created_at", since);
    if ((count || 0) >= DAILY_LIMIT) return jsonResponse({ error: "DAILY_LIMIT", message: "本日のAI画像解析上限に達しました。端末内の仮判定を利用します" }, 429, origin);

    const payload = await request.json() as AnalysisPayload;
    const image = parseImageDataUrl(payload.imageDataUrl);
    const targetKind = ["item", "candidate", "batch"].includes(String(payload.targetKind)) ? String(payload.targetKind) : "item";
    const localGuess = normalizeGuess(payload.localGuess);
    const prompt = [
      "You are a conservative menswear garment classifier for a wardrobe app.",
      "Analyze only the main garment being photographed. Do not infer brand, price, gender identity, body shape, age, or personal traits.",
      "Prefer visible evidence. Use lower field confidence when the garment is folded, partly hidden, worn by a person, photographed at an angle, or the material cannot be confirmed visually.",
      "For bottoms, silhouette means skinny/slim/straight/tapered/wide/flare. For tops and outerwear, silhouette means slim/regular/relaxed/oversized.",
      "Use garmentLength for cropped/regular/long rather than putting length into silhouette.",
      "Return a short natural Japanese displayName and retake guidance in Japanese.",
      `Filename hint (untrusted): ${safeText(payload.filename, 160) || "none"}`,
      `Local fallback guess (untrusted): ${JSON.stringify(localGuess)}`,
    ].join("\n");

    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": geminiApiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType: image.mimeType, data: image.data } }] }],
        generationConfig: {
          temperature: 1,
          maxOutputTokens: 4096,
          thinkingConfig: { thinkingLevel: "minimal", includeThoughts: false },
          responseFormat: { text: { mimeType: "APPLICATION_JSON", schema: schema() } },
        },
      }),
      signal: AbortSignal.timeout(25_000),
    });
    const geminiBody = await geminiResponse.json();
    if (!geminiResponse.ok) {
      console.error("Gemini garment analysis failed", geminiResponse.status, geminiBody?.error?.status);
      return jsonResponse({ error: "AI_UNAVAILABLE", message: "AI解析を利用できないため、端末内で仮判定しました" }, 502, origin);
    }
    const responseText = geminiBody?.candidates?.[0]?.content?.parts
      ?.filter((part: Record<string, unknown>) => part.thought !== true)
      .map((part: Record<string, unknown>) => part.text || "")
      .join("") || "";
    if (!responseText) {
      console.error("Gemini returned no final text", geminiBody?.candidates?.[0]?.finishReason || "UNKNOWN");
      throw new Error("EMPTY_MODEL_OUTPUT");
    }
    const result = normalizeResult(JSON.parse(responseText), localGuess);

    const { data: run, error: insertError } = await supabase.from("garment_analysis_runs").insert({
      user_id: user.id,
      target_kind: targetKind,
      model: MODEL,
      prompt_version: PROMPT_VERSION,
      predicted_attributes: result.attributes,
      field_confidences: result.fieldConfidences,
      image_quality: result.imageQuality,
    }).select("id").single();
    if (insertError) console.error("Could not save garment analysis history", insertError.code);

    return jsonResponse({
      analysisId: run?.id || null,
      model: MODEL,
      promptVersion: PROMPT_VERSION,
      ...result,
      remaining: Math.max(0, DAILY_LIMIT - (count || 0) - 1),
    }, 200, origin);
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "INVALID_IMAGE") return jsonResponse({ error: code, message: "画像を解析できません。別の写真をお試しください" }, 400, origin);
    console.error("Garment analysis failed", code);
    return jsonResponse({ error: "AI_UNAVAILABLE", message: "AI解析を利用できないため、端末内で仮判定しました" }, 502, origin);
  }
});
