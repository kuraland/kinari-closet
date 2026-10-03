/* 更新意図: 実物のみ設定と評価理由の同期に加え、認証済みEdge Function経由の任意AI再順位付けを追加。処理日時: 2026-10-03 19:08 JST */
(function attachKinariCloud(root) {
  const STORAGE_BUCKET = "garment-images";
  const SDK_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  let client = null;
  let currentUser = null;
  let authSubscription = null;

  function config() {
    return root.KINARI_SUPABASE_CONFIG || {};
  }

  function isConfigured() {
    const value = config();
    return Boolean(value.url && value.anonKey);
  }

  function isoTime(value) {
    const time = Date.parse(value || "");
    return Number.isFinite(time) ? time : 0;
  }

  function isLocalNewer(localValue, remoteValue) {
    return isoTime(localValue) > isoTime(remoteValue);
  }

  function ensureNoError(result, fallbackMessage) {
    if (result?.error) throw new Error(result.error.message || fallbackMessage);
    return result?.data;
  }

  function toGarmentRow(item, userId, existingPhotoPath = null) {
    return {
      user_id: userId,
      id: item.id,
      name: item.name,
      category: item.category,
      color: item.color,
      season: item.season,
      warmth: Number(item.warmth),
      formality: Number(item.formality),
      pattern: item.pattern || "solid",
      material: item.material || "other",
      silhouette: item.silhouette || "regular",
      style: item.style || "casual",
      statement: Number(item.statement || 2),
      status: item.status || "ready",
      notes: item.notes || "",
      photo_path: existingPhotoPath,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
      last_worn_at: item.lastWornAt || null,
      archived_at: item.archivedAt || null,
      restored_at: item.restoredAt || null,
    };
  }

  function fromGarmentRow(row, photo = null) {
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      color: row.color,
      season: row.season,
      warmth: Number(row.warmth),
      formality: Number(row.formality),
      pattern: row.pattern,
      material: row.material,
      silhouette: row.silhouette,
      style: row.style,
      statement: Number(row.statement),
      status: row.status,
      notes: row.notes || "",
      photo,
      photoPath: row.photo_path || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastWornAt: row.last_worn_at,
      archivedAt: row.archived_at,
      restoredAt: row.restored_at,
      isSample: false,
    };
  }

  function toFeedbackRow(entry, userId) {
    return {
      user_id: userId,
      id: entry.id,
      type: entry.type,
      item_ids: entry.itemIds,
      conditions: { ...(entry.conditions || {}), feedbackReason: entry.reason || null },
      created_at: entry.createdAt,
    };
  }

  function fromFeedbackRow(row) {
    const conditions = { ...(row.conditions || {}) };
    const reason = conditions.feedbackReason || null;
    delete conditions.feedbackReason;
    return {
      id: row.id,
      type: row.type,
      itemIds: row.item_ids || [],
      conditions,
      reason,
      createdAt: row.created_at,
    };
  }

  async function loadSupabaseLibrary() {
    if (root.supabase?.createClient) return;
    if (typeof document === "undefined") throw new Error("Supabase SDKを読み込めません");
    await new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${SDK_URL}"]`);
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", () => reject(new Error("Supabase SDKを読み込めません")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = SDK_URL;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Supabase SDKを読み込めません"));
      document.head.append(script);
    });
    if (!root.supabase?.createClient) throw new Error("Supabase SDKを初期化できません");
  }

  async function init(onAuthChange) {
    if (!isConfigured()) return { configured: false, user: null };
    await loadSupabaseLibrary();
    const value = config();
    client = root.supabase.createClient(value.url, value.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    authSubscription?.unsubscribe?.();
    const authResult = await client.auth.getSession();
    ensureNoError(authResult, "ログイン状態を確認できません");
    currentUser = authResult.data.session?.user || null;
    const listener = client.auth.onAuthStateChange((event, session) => {
      currentUser = session?.user || null;
      onAuthChange?.(event, currentUser);
    });
    authSubscription = listener.data.subscription;
    return { configured: true, user: currentUser };
  }

  function requireClient() {
    if (!client) throw new Error("Supabaseが設定されていません");
    if (!currentUser) throw new Error("クラウド同期にはログインが必要です");
    return client;
  }

  async function signUp(email, password) {
    if (!client) throw new Error("Supabaseが設定されていません");
    const redirectTo = /^https?:/.test(root.location?.href || "")
      ? `${root.location.origin}${root.location.pathname}`
      : undefined;
    const result = await client.auth.signUp({
      email,
      password,
      options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
    });
    ensureNoError(result, "アカウントを作成できません");
    currentUser = result.data.user || null;
    return { user: result.data.user, session: result.data.session, needsEmailConfirmation: !result.data.session };
  }

  async function signIn(email, password) {
    if (!client) throw new Error("Supabaseが設定されていません");
    const result = await client.auth.signInWithPassword({ email, password });
    ensureNoError(result, "ログインできません");
    currentUser = result.data.user;
    return result.data.user;
  }

  async function signOut() {
    if (!client) return;
    ensureNoError(await client.auth.signOut(), "ログアウトできません");
    currentUser = null;
  }

  async function generateLook(payload) {
    requireClient();
    const result = await client.functions.invoke("generate-look", { body: payload });
    if (result.error) {
      const context = result.error.context;
      let body = null;
      try { body = await context?.json?.(); } catch { body = null; }
      const error = new Error(body?.message || result.error.message || "着用イメージを生成できません");
      error.code = body?.error || "GENERATION_FAILED";
      error.remaining = body?.remaining;
      throw error;
    }
    return result.data;
  }

  async function rankOutfits(payload) {
    requireClient();
    const result = await client.functions.invoke("rank-outfits", { body: payload });
    if (result.error) {
      const context = result.error.context;
      let body = null;
      try { body = await context?.json?.(); } catch { body = null; }
      const error = new Error(body?.message || result.error.message || "AI補正を利用できません");
      error.code = body?.error || "AI_RANKING_FAILED";
      throw error;
    }
    return result.data;
  }

  async function uploadPhoto(item, userId, previousPath) {
    if (!(item.photo instanceof Blob)) return previousPath || item.photoPath || null;
    const extension = item.photo.type === "image/png" ? "png" : "jpg";
    const path = `${userId}/garments/${item.id}.${extension}`;
    const result = await client.storage.from(STORAGE_BUCKET).upload(path, item.photo, {
      upsert: true,
      contentType: item.photo.type || "image/jpeg",
      cacheControl: "3600",
    });
    ensureNoError(result, "服の写真をアップロードできません");
    return path;
  }

  async function downloadPhoto(path) {
    if (!path) return null;
    try {
      const result = await client.storage.from(STORAGE_BUCKET).download(path);
      return ensureNoError(result, "服の写真をダウンロードできません");
    } catch (error) {
      console.info("写真は次回同期時に再取得します", error);
      return null;
    }
  }

  async function fetchCloudRows() {
    const [garmentsResult, feedbackResult, settingsResult] = await Promise.all([
      client.from("garments").select("*"),
      client.from("feedback").select("*"),
      client.from("user_settings").select("*").maybeSingle(),
    ]);
    return {
      garments: ensureNoError(garmentsResult, "服データを取得できません") || [],
      feedback: ensureNoError(feedbackResult, "評価履歴を取得できません") || [],
      settings: ensureNoError(settingsResult, "設定を取得できません") || null,
    };
  }

  async function syncAll({ items, feedback, settings }) {
    requireClient();
    const userId = currentUser.id;
    let remote = await fetchCloudRows();
    const remoteGarmentsById = new Map(remote.garments.map((row) => [row.id, row]));
    const localGarments = items.filter((item) => !item.isSample);

    const garmentRowsToPush = [];
    for (const item of localGarments) {
      const remoteRow = remoteGarmentsById.get(item.id);
      if (remoteRow && !isLocalNewer(item.updatedAt, remoteRow.updated_at)) continue;
      const photoPath = await uploadPhoto(item, userId, remoteRow?.photo_path);
      garmentRowsToPush.push(toGarmentRow(item, userId, photoPath));
    }
    if (garmentRowsToPush.length) {
      ensureNoError(
        await client.from("garments").upsert(garmentRowsToPush, { onConflict: "user_id,id" }),
        "服データを同期できません",
      );
    }

    const localFeedbackById = new Map(feedback.map((entry) => [entry.id, entry]));
    const remoteFeedbackIds = new Set(remote.feedback.map((row) => row.id));
    const feedbackRowsToPush = [...localFeedbackById.values()]
      .filter((entry) => !remoteFeedbackIds.has(entry.id))
      .map((entry) => toFeedbackRow(entry, userId));
    if (feedbackRowsToPush.length) {
      ensureNoError(
        await client.from("feedback").upsert(feedbackRowsToPush, { onConflict: "user_id,id" }),
        "評価履歴を同期できません",
      );
    }

    const localSettingsUpdatedAt = settings?.updatedAt || new Date(0).toISOString();
    if (!remote.settings || isLocalNewer(localSettingsUpdatedAt, remote.settings.updated_at)) {
      ensureNoError(await client.from("user_settings").upsert({
        user_id: userId,
        preference_balance: Number(settings?.preferenceBalance ?? 67),
        avoid_recent: settings?.avoidRecent !== false,
        actual_only: settings?.actualOnly !== false,
        updated_at: localSettingsUpdatedAt,
      }), "設定を同期できません");
    }

    remote = await fetchCloudRows();
    const localById = new Map(localGarments.map((item) => [item.id, item]));
    const mergedItems = items.filter((item) => item.isSample);
    for (const row of remote.garments) {
      const local = localById.get(row.id);
      let photo = local?.photo || null;
      const remoteIsNewer = !local || isLocalNewer(row.updated_at, local.updatedAt);
      if (row.photo_path && (remoteIsNewer || !photo)) {
        photo = await downloadPhoto(row.photo_path) || photo;
      }
      mergedItems.push(fromGarmentRow(row, photo));
    }

    const mergedFeedback = new Map(feedback.map((entry) => [entry.id, entry]));
    remote.feedback.map(fromFeedbackRow).forEach((entry) => mergedFeedback.set(entry.id, entry));
    const mergedSettings = remote.settings ? {
      preferenceBalance: Number(remote.settings.preference_balance),
      avoidRecent: remote.settings.avoid_recent,
      actualOnly: remote.settings.actual_only !== false,
      updatedAt: remote.settings.updated_at,
    } : settings;

    return {
      items: mergedItems,
      feedback: [...mergedFeedback.values()],
      settings: mergedSettings,
      syncedAt: new Date().toISOString(),
    };
  }

  const api = {
    isConfigured,
    init,
    signUp,
    signIn,
    signOut,
    generateLook,
    rankOutfits,
    syncAll,
    getUser: () => currentUser,
    __test: { isoTime, isLocalNewer, toGarmentRow, fromGarmentRow, toFeedbackRow, fromFeedbackRow },
  };

  root.KinariCloud = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
