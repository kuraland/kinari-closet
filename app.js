/* 更新意図: Gemini画像解析を任意で追加し、確信度表示・ユーザー確認・端末内推測への自動復帰を一体化する。処理日時: 2026-10-07 23:35 JST */
const DB_NAME = "kinari-closet";
const DB_VERSION = 2;
const SETTINGS_KEY = "kinari-stylist-settings";
const PREFERENCE_HALF_LIFE_DAYS = 120;
const MAX_CANDIDATE_OUTFITS = 10;
const MAX_BATCH_ITEMS = 20;
const MAX_AI_RANKING_CANDIDATES = 12;
const AI_RANKING_WEIGHT = .35;
const AI_AUTO_APPLY_THRESHOLD = 60;
const AI_HIGH_CONFIDENCE_THRESHOLD = 80;
const AI_BATCH_CONCURRENCY = 3;
const CANDIDATE_QUALITY = Object.freeze({ score: 62, practical: 50, harmony: 58 });
const FEEDBACK_REASONS = Object.freeze({
  like: [
    ["color", "色が好き"], ["silhouette", "形が好き"], ["style", "雰囲気が好き"],
    ["combination", "組み合わせが好き"], ["comfortable", "着やすそう"],
  ],
  dislike: [
    ["color", "色が苦手"], ["silhouette", "形が合わない"], ["tooFormal", "きちんとしすぎ"],
    ["tooCasual", "カジュアルすぎ"], ["combination", "組み合わせが苦手"],
  ],
});
const RETIRED_SAMPLE_IDS = new Set([
  "sample-bottoms-04",
  "sample-onepiece-01",
  "sample-onepiece-02",
  "sample-onepiece-03",
  "sample-onepiece-04",
  "sample-onepiece-05",
  "sample-shoes-04",
]);

const labels = {
  category: { tops: "トップス", bottoms: "ボトムス", onepiece: "ワンピース", outer: "アウター", shoes: "靴", accessory: "小物" },
  color: { white: "白", black: "黒", gray: "グレー", navy: "ネイビー", blue: "ブルー", beige: "ベージュ", brown: "ブラウン", green: "グリーン", red: "レッド", yellow: "イエロー", pink: "ピンク", purple: "パープル", multi: "マルチ" },
  season: { all: "通年", spring: "春", summer: "夏", autumn: "秋", winter: "冬" },
  status: { ready: "着用可能", laundry: "洗濯中", cleaning: "クリーニング", archived: "アーカイブ" },
  occasion: { daily: "普段のお出かけ", work: "仕事・打ち合わせ", active: "よく歩く日", special: "食事・特別な予定" },
  mood: { relaxed: "リラックス", clean: "きちんと", minimal: "シンプル", adventure: "少し冒険" },
  pattern: { solid: "無地", stripe: "ストライプ", check: "チェック", floral: "花柄", graphic: "柄・グラフィック", other: "その他" },
  material: { cotton: "コットン", knit: "ニット", denim: "デニム", linen: "リネン", wool: "ウール", leather: "レザー", synthetic: "化繊", other: "その他" },
  silhouette: { skinny: "スキニー", slim: "細身", regular: "標準", relaxed: "ゆったり", oversized: "オーバーサイズ", straight: "ストレート", tapered: "テーパード", wide: "ワイド", flare: "フレア", short: "短丈", long: "ロング" },
  garmentLength: { cropped: "短丈", regular: "標準丈", long: "ロング丈" },
  sleeveLength: { unknown: "不明", sleeveless: "ノースリーブ", short: "半袖", threeQuarter: "七分袖", long: "長袖" },
  thickness: { light: "薄手", medium: "普通", heavy: "厚手" },
  layerRole: { inner: "インナー向き", standalone: "1枚で着る", layer: "羽織りにも使う", outer: "アウター", none: "対象外" },
  style: { casual: "カジュアル", clean: "きれいめ", minimal: "ミニマル", classic: "クラシック", natural: "ナチュラル", sporty: "スポーティ", trendy: "トレンド" },
};

const colorHex = { white: "#f6f5ef", black: "#282a28", gray: "#92958f", navy: "#263b55", blue: "#6585a3", beige: "#c8b797", brown: "#765846", green: "#647a61", red: "#a8534e", yellow: "#d3b34c", pink: "#c58f99", purple: "#7b6886", multi: "linear-gradient(90deg,#b38b67,#6e8290,#8a6b77)" };

const SILHOUETTE_OPTIONS = Object.freeze({
  bottoms: ["skinny", "slim", "straight", "tapered", "wide", "flare"],
  default: ["slim", "regular", "relaxed", "oversized"],
});

const DEFAULT_TREND_PROFILE = {
  season: "2026 秋冬",
  title: "ブラウンとレッドでつくる、端正なレトロ・トラッド",
  updatedAt: "2026-09-30",
  validUntil: "2026-11-30",
  colors: ["brown", "black", "gray", "red", "navy"],
  patterns: ["solid", "check"],
  materials: ["leather", "knit", "wool"],
  silhouettes: ["slim", "wide", "regular", "short"],
  styles: ["classic", "clean", "sporty"],
  tags: ["モノトーン＆ブラウン", "深みのあるレッド", "チェック", "レザーとコーデュロイ"],
  sourceLabel: "2026秋冬メンズ（UNITED ARROWS / Vogue / GQ / WEAR）",
  sourceUrl: "https://store.united-arrows.co.jp/ua_columns/brand/bym/feature/article/men_autumn_outfits",
};

const SAMPLE_ITEMS = [
  { id: "sample-tops-01", name: "白のオックスフォードシャツ", category: "tops", color: "white", season: "all", warmth: 2, formality: 4, photo: "assets/samples/tops-01.jpg" },
  { id: "sample-tops-02", name: "ネイビーのクルーネックニット", category: "tops", color: "navy", season: "winter", warmth: 4, formality: 3, photo: "assets/samples/tops-02.jpg" },
  { id: "sample-tops-03", name: "セージグリーンのTシャツ", category: "tops", color: "green", season: "summer", warmth: 1, formality: 1, photo: "assets/samples/tops-03.jpg" },
  { id: "sample-tops-04", name: "ブルーのストライプシャツ", category: "tops", color: "blue", season: "all", warmth: 2, formality: 3, photo: "assets/samples/tops-04.jpg" },
  { id: "sample-tops-05", name: "ベージュのスウェット", category: "tops", color: "beige", season: "autumn", warmth: 3, formality: 1, photo: "assets/samples/tops-05.jpg" },
  { id: "sample-bottoms-01", name: "濃紺ストレートデニム", category: "bottoms", color: "navy", season: "all", warmth: 3, formality: 2, photo: "assets/samples/bottoms-01.jpg" },
  { id: "sample-bottoms-02", name: "ベージュのチノパン", category: "bottoms", color: "beige", season: "all", warmth: 2, formality: 3, photo: "assets/samples/bottoms-02.jpg" },
  { id: "sample-bottoms-03", name: "黒のテーパードパンツ", category: "bottoms", color: "black", season: "all", warmth: 2, formality: 4, photo: "assets/samples/bottoms-03.jpg" },
  { id: "sample-trend-corduroy-bottoms-01", name: "チョコブラウンのコーデュロイパンツ", category: "bottoms", color: "brown", season: "autumn", warmth: 4, formality: 3, pattern: "solid", material: "cotton", silhouette: "wide", style: "classic", statement: 4, photo: "assets/samples/trend-corduroy-trousers-01.jpg", notes: "2026秋メンズ：太畝コーデュロイとブラウン" },
  { id: "sample-bottoms-05", name: "ブルーのワイドデニム", category: "bottoms", color: "blue", season: "all", warmth: 3, formality: 1, photo: "assets/samples/bottoms-05.jpg" },
  { id: "sample-trend-burgundy-knit-01", name: "バーガンディのモックネックニット", category: "tops", color: "red", season: "autumn", warmth: 4, formality: 4, pattern: "solid", material: "knit", silhouette: "slim", style: "clean", statement: 4, photo: "assets/samples/trend-burgundy-knit-01.jpg", notes: "2026秋メンズ：深みのあるレッドと細身トップス" },
  { id: "sample-trend-tartan-overshirt-01", name: "ネイビーのタータンチェックシャツ", category: "tops", color: "navy", season: "autumn", warmth: 3, formality: 2, pattern: "check", material: "wool", silhouette: "regular", style: "classic", statement: 4, photo: "assets/samples/trend-tartan-overshirt-01.jpg", notes: "2026秋メンズ：大きめチェックのトラッド" },
  { id: "sample-trend-leather-coverall-01", name: "ダークブラウンのレザーカバーオール", category: "outer", color: "brown", season: "autumn", warmth: 4, formality: 3, pattern: "solid", material: "leather", silhouette: "regular", style: "classic", statement: 4, photo: "assets/samples/trend-leather-coverall-01.jpg", notes: "2026秋メンズ：ブラウンレザーのラギッドラグジュアリー" },
  { id: "sample-trend-retro-windbreaker-01", name: "バーガンディのレトロウインドブレーカー", category: "outer", color: "red", season: "autumn", warmth: 3, formality: 1, pattern: "graphic", material: "synthetic", silhouette: "short", style: "sporty", statement: 5, photo: "assets/samples/trend-retro-windbreaker-01.jpg", notes: "2026秋メンズ：色とボリュームを効かせたレトロスポーツ" },
  { id: "sample-trend-navy-parka-01", name: "ネイビーのテクニカルパーカ", category: "outer", color: "navy", season: "winter", warmth: 5, formality: 3, pattern: "solid", material: "synthetic", silhouette: "long", style: "sporty", statement: 3, photo: "assets/samples/trend-navy-parka-01.jpg", notes: "2026秋冬メンズ：端正な着こなしに重ねる実用パーカ" },
  { id: "sample-outer-01", name: "ベージュのトレンチコート", category: "outer", color: "beige", season: "spring", warmth: 3, formality: 4, photo: "assets/samples/outer-01.jpg" },
  { id: "sample-outer-02", name: "ブルーのデニムジャケット", category: "outer", color: "blue", season: "spring", warmth: 3, formality: 1, photo: "assets/samples/outer-02.jpg" },
  { id: "sample-outer-03", name: "黒のテーラードジャケット", category: "outer", color: "black", season: "all", warmth: 3, formality: 5, photo: "assets/samples/outer-03.jpg" },
  { id: "sample-outer-04", name: "オリーブのフィールドジャケット", category: "outer", color: "green", season: "autumn", warmth: 3, formality: 2, photo: "assets/samples/outer-04.jpg" },
  { id: "sample-outer-05", name: "チャコールのウールコート", category: "outer", color: "gray", season: "winter", warmth: 5, formality: 4, photo: "assets/samples/outer-05.jpg" },
  { id: "sample-shoes-01", name: "白のローカットスニーカー", category: "shoes", color: "white", season: "all", warmth: 2, formality: 1, photo: "assets/samples/shoes-01.jpg" },
  { id: "sample-shoes-02", name: "黒のレザーローファー", category: "shoes", color: "black", season: "all", warmth: 2, formality: 4, photo: "assets/samples/shoes-02.jpg" },
  { id: "sample-shoes-03", name: "ブラウンのアンクルブーツ", category: "shoes", color: "brown", season: "winter", warmth: 4, formality: 3, photo: "assets/samples/shoes-03.jpg" },
  { id: "sample-trend-brown-derby-01", name: "ダークブラウンのレザーダービー", category: "shoes", color: "brown", season: "all", warmth: 3, formality: 4, pattern: "solid", material: "leather", silhouette: "regular", style: "classic", statement: 3, photo: "assets/samples/trend-brown-derby-01.jpg", notes: "2026秋メンズ：トラッドにもスポーツミックスにも使える革靴" },
  { id: "sample-shoes-05", name: "ネイビーのランニングシューズ", category: "shoes", color: "navy", season: "all", warmth: 2, formality: 1, photo: "assets/samples/shoes-05.jpg", notes: "よく歩く日に向くサンプル" },
  { id: "sample-accessory-01", name: "ブラウンのレザートート", category: "accessory", color: "brown", season: "all", warmth: 2, formality: 3, photo: "assets/samples/accessory-01.jpg" },
  { id: "sample-accessory-02", name: "黒のショルダーバッグ", category: "accessory", color: "black", season: "all", warmth: 2, formality: 4, photo: "assets/samples/accessory-02.jpg" },
  { id: "sample-accessory-03", name: "ベージュのキャップ", category: "accessory", color: "beige", season: "all", warmth: 1, formality: 1, photo: "assets/samples/accessory-03.jpg" },
  { id: "sample-accessory-04", name: "ライトグレーのマフラー", category: "accessory", color: "gray", season: "winter", warmth: 5, formality: 3, photo: "assets/samples/accessory-04.jpg" },
  { id: "sample-accessory-05", name: "ブラウンのレザーベルト", category: "accessory", color: "brown", season: "all", warmth: 2, formality: 3, photo: "assets/samples/accessory-05.jpg" },
];

let db;
let items = [];
let feedback = [];
let purchaseCandidates = [];
let trendProfile = DEFAULT_TREND_PROFILE;
let trendFreshness = { factor: 1, label: "最新", ageDays: 0 };
let currentPhoto = null;
let currentPhotoUrl = null;
let lastSuggestedItemName = "";
let currentItemAnalysis = null;
let currentCandidatePhoto = null;
let currentCandidatePhotoUrl = null;
let lastSuggestedCandidateName = "";
let currentCandidateAnalysis = null;
let garmentAnalysisAvailability = "unknown";
let toastTimer;
let cloudUser = null;
let cloudSyncPromise = null;
let cloudSyncTimer = null;
let pendingLook = null;
let lookGenerationInProgress = false;
let outfitRankingRequestId = 0;
let batchDrafts = [];
let batchProcessing = false;
let batchSessionId = 0;
const displayPhotoURLCache = new WeakMap();

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("items")) database.createObjectStore("items", { keyPath: "id" });
      if (!database.objectStoreNames.contains("feedback")) database.createObjectStore("feedback", { keyPath: "id" });
      if (!database.objectStoreNames.contains("candidates")) database.createObjectStore("candidates", { keyPath: "id" });
    };
    request.onblocked = () => showToast("KINARIを開いている別のタブを閉じて、このページを再読み込みしてください");
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error);
  });
}

function storeRequest(store, mode, action, value) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const request = transaction.objectStore(store)[action](value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const getAll = (store) => storeRequest(store, "readonly", "getAll");
const put = (store, value) => storeRequest(store, "readwrite", "put", value);
const remove = (store, key) => storeRequest(store, "readwrite", "delete", key);

function putMany(store, values) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, "readwrite");
    const objectStore = transaction.objectStore(store);
    values.forEach((value) => objectStore.put(value));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("一括保存を中断しました"));
  });
}

async function retireLegacyWomenSamples() {
  const savedItems = await getAll("items");
  const legacySamples = savedItems.filter((item) => item.isSample && RETIRED_SAMPLE_IDS.has(item.id));
  for (const item of legacySamples) await remove("items", item.id);
}

async function ensureSampleItems() {
  const savedItems = await getAll("items");
  const savedIds = new Set(savedItems.map((item) => item.id));
  const seedTime = Date.now();

  for (const [index, sample] of SAMPLE_ITEMS.entries()) {
    if (savedIds.has(sample.id)) continue;
    const createdAt = new Date(seedTime - index * 1000).toISOString();
    await put("items", {
      ...sample,
      status: "ready",
      notes: sample.notes || "KINARIのサンプルデータ",
      isSample: true,
      createdAt,
      updatedAt: createdAt,
      lastWornAt: null,
    });
  }
}

async function restoreSampleItems() {
  const savedItems = await getAll("items");
  const savedById = new Map(savedItems.map((item) => [item.id, item]));
  const restoreTime = Date.now();
  let addedCount = 0;
  let restoredCount = 0;

  for (const [index, sample] of SAMPLE_ITEMS.entries()) {
    const existing = savedById.get(sample.id);
    const updatedAt = new Date(restoreTime - index).toISOString();
    await put("items", {
      ...sample,
      ...existing,
      id: sample.id,
      photo: existing?.photo || sample.photo,
      status: "ready",
      notes: existing?.notes || sample.notes || "KINARIのサンプルデータ",
      isSample: true,
      createdAt: existing?.createdAt || updatedAt,
      updatedAt,
      restoredAt: updatedAt,
      lastWornAt: existing?.lastWornAt || null,
    });
    if (existing) restoredCount += 1;
    else addedCount += 1;
  }

  items = await getAll("items");
  $("#closet-search").value = "";
  $("#category-filter").value = "all";
  $("#status-filter").value = "ready";
  renderAll();
  switchView("closet");
  queueCloudSync();
  const detail = addedCount && restoredCount
    ? `（新規${addedCount}点・復元${restoredCount}点）`
    : addedCount ? `（新規${addedCount}点）` : `（復元${restoredCount}点）`;
  showToast(`サンプル30点を戻しました${detail}`);
}

async function loadTrendProfile() {
  try {
    const response = await fetch("./trends.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Trend profile: ${response.status}`);
    const data = await response.json();
    trendProfile = { ...DEFAULT_TREND_PROFILE, ...(data.current || data) };
  } catch (error) {
    console.info("同梱トレンド設定を使用します", error);
    trendProfile = DEFAULT_TREND_PROFILE;
  }
  trendFreshness = getTrendFreshness(trendProfile);
}

function getTrendFreshness(profile) {
  const updatedAt = new Date(`${profile.updatedAt}T00:00:00`);
  const validUntil = profile.validUntil ? new Date(`${profile.validUntil}T23:59:59`) : null;
  if (Number.isNaN(updatedAt.getTime())) return { factor: .35, label: "更新日不明", ageDays: null };
  const ageDays = Math.max(0, Math.floor((Date.now() - updatedAt.getTime()) / 86400000));
  if (validUntil && Date.now() > validUntil.getTime()) return { factor: .35, label: "更新期限切れ", ageDays };
  if (ageDays <= 45) return { factor: 1, label: "最新", ageDays };
  if (ageDays <= 90) return { factor: .75, label: "更新推奨", ageDays };
  return { factor: .45, label: "情報が古いため影響を縮小", ageDays };
}

function readStylistSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
  } catch (error) {
    console.info("スタイリスト設定を読み込めませんでした", error);
    return {};
  }
}

function loadStylistSettings(settings = readStylistSettings()) {
  if (Number.isFinite(Number(settings.preferenceBalance))) {
    $("#preference-balance").value = String(clamp(Number(settings.preferenceBalance)));
  }
  if (typeof settings.avoidRecent === "boolean") $("#avoid-recent").checked = settings.avoidRecent;
  const realReady = items.filter((item) => !item.isSample && item.status === "ready");
  const hasRealOutfit = realReady.some((item) => item.category === "onepiece")
    || (realReady.some((item) => item.category === "tops") && realReady.some((item) => item.category === "bottoms"));
  $("#actual-only").checked = typeof settings.actualOnly === "boolean" ? settings.actualOnly : hasRealOutfit;
  updateActualOnlyHint();
}

function saveStylistSettings() {
  const settings = {
    preferenceBalance: Number($("#preference-balance").value),
    avoidRecent: $("#avoid-recent").checked,
    actualOnly: $("#actual-only").checked,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  queueCloudSync();
  return settings;
}

function updateActualOnlyHint() {
  const hint = $("#actual-only-hint");
  if (!hint) return;
  const realReadyCount = items.filter((item) => !item.isSample && item.status === "ready").length;
  hint.textContent = $("#actual-only").checked
    ? `登録した実物 ${realReadyCount}点だけで提案します`
    : "サンプルを含めて提案します";
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "long" }).format(date);
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function silhouetteChoices(category) {
  return category === "bottoms" ? SILHOUETTE_OPTIONS.bottoms : SILHOUETTE_OPTIONS.default;
}

function optionMarkup(values, selected, dictionary) {
  return values.map((value) => `<option value="${value}"${value === selected ? " selected" : ""}>${dictionary[value]}</option>`).join("");
}

function configureProfileFields(prefix, category, profile = {}) {
  const panel = $(`#${prefix}-profile-confirmation`);
  if (!panel) return;
  const wearable = !["shoes", "accessory"].includes(category);
  panel.hidden = !wearable;
  const shape = $(`#${prefix}-silhouette`);
  if (shape) {
    const choices = silhouetteChoices(category);
    const selected = choices.includes(profile.silhouette) ? profile.silhouette : (category === "bottoms" ? "straight" : "regular");
    shape.innerHTML = optionMarkup(choices, selected, labels.silhouette);
    const title = panel.querySelector(`[data-profile-label="silhouette"]`);
    if (title) title.textContent = category === "bottoms" ? "パンツの形" : "ゆとり";
  }
  const applicability = {
    garmentLength: wearable,
    sleeveLength: ["tops", "onepiece", "outer"].includes(category),
    thickness: wearable,
    layerRole: ["tops", "outer"].includes(category),
  };
  Object.entries(applicability).forEach(([field, visible]) => {
    const wrapper = panel.querySelector(`[data-profile-field="${field}"]`);
    if (wrapper) wrapper.hidden = !visible;
  });
  if ($(`#${prefix}-garment-length`) && profile.garmentLength) $(`#${prefix}-garment-length`).value = profile.garmentLength;
  if ($(`#${prefix}-sleeve-length`) && profile.sleeveLength) $(`#${prefix}-sleeve-length`).value = profile.sleeveLength;
  if ($(`#${prefix}-thickness`) && profile.thickness) $(`#${prefix}-thickness`).value = profile.thickness;
  if ($(`#${prefix}-layer-role`)) {
    const layerRole = category === "outer" ? "outer" : (profile.layerRole || "standalone");
    $(`#${prefix}-layer-role`).value = layerRole;
    $(`#${prefix}-layer-role`).disabled = category === "outer";
  }
}

function getItemProfile(item) {
  const text = `${item.name || ""} ${item.notes || ""}`.toLowerCase();
  const inferredPattern = /ストライプ|stripe/.test(text) ? "stripe"
    : /チェック|check/.test(text) ? "check"
      : /花柄|floral/.test(text) ? "floral"
        : /柄|graphic|プリント/.test(text) ? "graphic" : "solid";
  const inferredMaterial = /ニット|スウェット|knit/.test(text) ? "knit"
    : /デニム|denim/.test(text) ? "denim"
      : /リネン|linen/.test(text) ? "linen"
        : /ウール|マフラー|wool/.test(text) ? "wool"
          : /レザー|ブーツ|ローファー|ベルト|leather/.test(text) ? "leather"
            : ["tops", "bottoms", "onepiece"].includes(item.category) ? "cotton" : "synthetic";
  const bottomSilhouette = /スキニー|skinny/.test(text) ? "skinny"
    : /テーパード|tapered/.test(text) ? "tapered"
      : /ワイド|wide/.test(text) ? "wide"
        : /フレア|ブーツカット|flare/.test(text) ? "flare"
          : /細身|スリム|slim/.test(text) ? "slim" : "straight";
  const upperSilhouette = /オーバーサイズ|ビッグシルエット|oversized/.test(text) ? "oversized"
    : /スウェット|フィールド|ゆったり|relaxed/.test(text) ? "relaxed"
      : /細身|タイト|slim/.test(text) ? "slim" : "regular";
  const allowedSilhouettes = silhouetteChoices(item.category);
  const storedSilhouette = allowedSilhouettes.includes(item.silhouette) ? item.silhouette : null;
  const inferredSilhouette = item.category === "bottoms" ? bottomSilhouette : upperSilhouette;
  const inferredLength = /短丈|クロップド|cropped/.test(text) || item.silhouette === "short" ? "cropped"
    : /ロング|マキシ|long/.test(text) || item.silhouette === "long" ? "long" : "regular";
  const inferredSleeveLength = /ノースリーブ|タンクトップ|sleeveless/.test(text) ? "sleeveless"
    : /半袖|Tシャツ|Ｔシャツ|ポロシャツ|short.?sleeve/.test(text) ? "short"
      : /七分袖|three.?quarter/.test(text) ? "threeQuarter"
        : ["tops", "onepiece", "outer"].includes(item.category) ? (Number(item.warmth) <= 1 ? "short" : "long") : "unknown";
  const inferredThickness = /薄手|シアー|ライトウェイト|lightweight/.test(text) ? "light"
    : /厚手|ヘビーウェイト|中綿|ダウン|heavyweight/.test(text) ? "heavy"
      : Number(item.warmth) <= 2 ? "light" : Number(item.warmth) >= 4 ? "heavy" : "medium";
  const inferredLayerRole = item.category === "outer" ? "outer"
    : item.category === "tops" && /オーバーシャツ|シャツジャケット|羽織|overshirt/.test(text) ? "layer"
      : item.category === "tops" && /インナー|肌着|タンクトップ/.test(text) ? "inner"
        : ["tops", "onepiece"].includes(item.category) ? "standalone" : "none";
  const inferredStyle = /ランニング|スニーカー|キャップ|sport/.test(text) ? "sporty"
    : /ワイド|テラコッタ|trend/.test(text) ? "trendy"
      : Number(item.formality) >= 4 ? "classic"
        : /リネン|セージ|オリーブ|natural/.test(text) ? "natural"
          : Number(item.formality) === 3 ? "clean"
            : ["black", "white", "gray", "navy", "beige"].includes(item.color) ? "minimal" : "casual";
  const inferredStatement = ["red", "yellow", "pink", "purple", "multi"].includes(item.color) || inferredPattern !== "solid" || ["wide", "short"].includes(inferredSilhouette) ? 4 : 2;

  return {
    pattern: item.pattern || inferredPattern,
    material: item.material || inferredMaterial,
    silhouette: storedSilhouette || inferredSilhouette,
    garmentLength: item.garmentLength || inferredLength,
    sleeveLength: item.sleeveLength || inferredSleeveLength,
    thickness: item.thickness || inferredThickness,
    layerRole: item.layerRole || inferredLayerRole,
    style: item.style || inferredStyle,
    statement: Number(item.statement || inferredStatement),
  };
}

function profileKeys(item) {
  const profile = getItemProfile(item);
  return [
    `color:${item.color}`,
    `pattern:${profile.pattern}`,
    `material:${profile.material}`,
    `silhouette:${profile.silhouette}`,
    `garmentLength:${profile.garmentLength}`,
    `sleeveLength:${profile.sleeveLength}`,
    `thickness:${profile.thickness}`,
    `style:${profile.style}`,
  ];
}

function feedbackProfileKeys(item, reason = null) {
  const keys = profileKeys(item);
  const kindsByReason = {
    color: new Set(["color"]),
    silhouette: new Set(["silhouette", "garmentLength"]),
    style: new Set(["style"]),
    tooFormal: new Set(["style"]),
    tooCasual: new Set(["style"]),
    comfortable: new Set(["material", "silhouette", "thickness"]),
    combination: new Set(),
  };
  const allowedKinds = kindsByReason[reason];
  return allowedKinds ? keys.filter((key) => allowedKinds.has(key.split(":")[0])) : keys;
}

function itemPairKeys(set) {
  const ids = set.map((item) => item.id).sort();
  const pairs = [];
  for (let first = 0; first < ids.length; first += 1) {
    for (let second = first + 1; second < ids.length; second += 1) pairs.push(`${ids[first]}::${ids[second]}`);
  }
  return pairs;
}

function objectURL(photo) {
  if (!photo) return "";
  if (typeof photo === "string") return photo;
  return URL.createObjectURL(photo);
}

function displayPhotoURL(photo) {
  if (!photo || typeof photo === "string") return photo || "";
  if (!displayPhotoURLCache.has(photo)) displayPhotoURLCache.set(photo, URL.createObjectURL(photo));
  return displayPhotoURLCache.get(photo);
}

function revokePhotoURL(url) {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function setCloudState(state, detail = "") {
  const button = $("#cloud-status");
  const label = $("#cloud-status-label");
  const description = $("#cloud-status-detail");
  if (!button || !label || !description) return;
  button.dataset.state = state;
  const stateLabels = {
    local: "この端末だけ",
    signedOut: "クラウド同期OFF",
    syncing: "同期しています…",
    synced: "クラウド同期ON",
    error: "同期を確認",
  };
  label.textContent = stateLabels[state] || stateLabels.local;
  description.textContent = detail || ({
    local: "Supabaseを設定すると端末間で共有できます。",
    signedOut: "ログインするとスマホとPCで共有できます。",
    syncing: "端末内のデータはそのまま利用できます。",
    synced: cloudUser?.email || "最新の状態です。",
    error: "端末内には保存されています。",
  })[state];
}

function renderCloudDialog() {
  const configured = Boolean(window.KinariCloud?.isConfigured());
  $("#cloud-config-panel").hidden = configured;
  $("#cloud-auth-panel").hidden = !configured || Boolean(cloudUser);
  $("#cloud-session-panel").hidden = !configured || !cloudUser;
  $("#cloud-user-email").textContent = cloudUser?.email || "";
  if (!configured) setCloudState("local");
  else if (!cloudUser) setCloudState("signedOut");
}

async function writeCloudResultToLocal(result) {
  for (const item of result.items) await put("items", item);
  for (const entry of result.feedback) await put("feedback", entry);
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(result.settings || {}));
  [items, feedback] = await Promise.all([getAll("items"), getAll("feedback")]);
  loadStylistSettings(result.settings);
  renderAll();
}

async function syncCloudData({ announce = false } = {}) {
  if (!cloudUser || !window.KinariCloud?.isConfigured()) return null;
  if (cloudSyncPromise) return cloudSyncPromise;
  setCloudState("syncing");
  $("#cloud-sync-now").disabled = true;
  cloudSyncPromise = window.KinariCloud.syncAll({
    items,
    feedback,
    settings: {
      preferenceBalance: Number($("#preference-balance").value),
      avoidRecent: $("#avoid-recent").checked,
      actualOnly: $("#actual-only").checked,
      updatedAt: readStylistSettings().updatedAt || new Date(0).toISOString(),
    },
  }).then(async (result) => {
    await writeCloudResultToLocal(result);
    setCloudState("synced", `${cloudUser.email}・${new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit" }).format(new Date(result.syncedAt))} 同期`);
    if (announce) showToast("クラウドと同期しました");
    return result;
  }).catch((error) => {
    console.error("クラウド同期に失敗しました", error);
    setCloudState("error", error.message);
    if (announce) showToast("同期できませんでした。端末内には保存されています");
    return null;
  }).finally(() => {
    cloudSyncPromise = null;
    $("#cloud-sync-now").disabled = false;
  });
  return cloudSyncPromise;
}

function queueCloudSync() {
  if (!cloudUser) return;
  clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(() => syncCloudData(), 700);
}

async function initializeCloud() {
  if (!window.KinariCloud) {
    setCloudState("local", "同期モジュールを読み込めませんでした。");
    return;
  }
  renderCloudDialog();
  if (!window.KinariCloud.isConfigured()) return;
  try {
    const state = await window.KinariCloud.init((_event, user) => {
      cloudUser = user;
      renderCloudDialog();
    });
    cloudUser = state.user;
    renderCloudDialog();
    if (cloudUser) await syncCloudData();
  } catch (error) {
    console.error("クラウド同期を初期化できません", error);
    setCloudState("error", "接続設定を確認してください。");
  }
}

async function handleCloudAuth(action) {
  const email = $("#cloud-email").value.trim();
  const password = $("#cloud-password").value;
  const message = $("#cloud-message");
  if (!email || password.length < 8) {
    message.textContent = "メールアドレスと8文字以上のパスワードを入力してください。";
    return;
  }
  const buttons = $$("button", $("#cloud-auth-panel"));
  buttons.forEach((button) => button.disabled = true);
  message.textContent = action === "signup" ? "アカウントを作成しています…" : "ログインしています…";
  try {
    if (action === "signup") {
      const result = await window.KinariCloud.signUp(email, password);
      if (result.needsEmailConfirmation) {
        message.textContent = "確認メールを送りました。メール内のリンクを開いてからログインしてください。";
        return;
      }
      cloudUser = result.user;
    } else {
      cloudUser = await window.KinariCloud.signIn(email, password);
    }
    renderCloudDialog();
    await syncCloudData({ announce: true });
    $("#cloud-password").value = "";
  } catch (error) {
    console.error(error);
    message.textContent = error.message;
  } finally {
    buttons.forEach((button) => button.disabled = false);
  }
}

function switchView(view) {
  $$(".view").forEach((node) => node.classList.toggle("is-active", node.id === `view-${view}`));
  $$(".nav-item").forEach((node) => node.classList.toggle("is-active", node.dataset.view === view));
  $(".sidebar").classList.remove("is-open");
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (view === "closet") renderCloset();
  if (view === "shopping") renderCandidates();
}

function categoryFromName(filename, fallback = "tops") {
  const name = filename.toLowerCase();
  const groups = [
    ["shoes", /shoe|sneaker|boot|derby|loafer|sandal|靴|スニーカー|ブーツ|ローファー|サンダル/],
    ["bottoms", /bottom|pants|jeans|skirt|trouser|パンツ|デニム|スカート/],
    ["outer", /outer|jacket|coat|cardigan|ジャケット|コート|カーディガン/],
    ["onepiece", /dress|onepiece|ワンピ|ドレス/],
    ["accessory", /accessory|bag|hat|belt|バッグ|帽子|ベルト/],
    ["tops", /top|shirt|sweater|knit|sweat|hoodie|tee|シャツ|ニット|スウェット|パーカー|Tシャツ/],
  ];
  return groups.find(([, pattern]) => pattern.test(name))?.[0] || fallback;
}

function colorFromName(filename) {
  const name = filename.toLowerCase();
  const colors = [
    ["black", /black|黒/], ["white", /white|白/], ["gray", /gray|grey|グレー/],
    ["navy", /navy|ネイビー|紺/], ["blue", /blue|ブルー|青/], ["beige", /beige|ベージュ/],
    ["brown", /brown|ブラウン|茶/], ["green", /green|olive|グリーン|緑|オリーブ/],
    ["red", /red|burgundy|レッド|赤|バーガンディ/], ["yellow", /yellow|イエロー|黄/],
    ["pink", /pink|ピンク/], ["purple", /purple|パープル|紫/],
  ];
  return colors.find(([, pattern]) => pattern.test(name))?.[0] || null;
}

function materialFromName(filename) {
  const name = filename.toLowerCase();
  const materials = [
    ["leather", /leather|レザー|革|derby|loafer|boot/], ["denim", /denim|jeans|デニム|ジーンズ/],
    ["knit", /knit|sweater|ニット|セーター/], ["wool", /wool|tweed|ウール|ツイード/],
    ["linen", /linen|リネン|麻/], ["synthetic", /nylon|polyester|ナイロン|ポリエステル/],
  ];
  return materials.find(([, pattern]) => pattern.test(name))?.[0] || null;
}

function closestColor([r, g, b]) {
  const palette = {
    white: [238, 235, 225], black: [42, 44, 42], gray: [138, 140, 136], navy: [41, 55, 73], blue: [91, 128, 164],
    beige: [194, 173, 137], brown: [111, 79, 57], green: [91, 117, 80], red: [157, 65, 61], yellow: [208, 173, 65], pink: [196, 128, 145], purple: [116, 89, 130],
  };
  return Object.entries(palette).sort((a, b2) => distance(a[1]) - distance(b2[1]))[0][0];
  function distance(sample) { return Math.sqrt((r - sample[0]) ** 2 + (g - sample[1]) ** 2 + (b - sample[2]) ** 2); }
}

async function loadPhoto(file) {
  if ("createImageBitmap" in window) return createImageBitmap(file);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("画像を読み込めませんでした"));
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function inferCategoryFromImageData(pixels, width, height) {
  const borderPixels = [];
  const addPixel = (x, y) => {
    const index = (y * width + x) * 4;
    if (pixels[index + 3] > 32) borderPixels.push([pixels[index], pixels[index + 1], pixels[index + 2]]);
  };
  for (let x = 0; x < width; x += 1) {
    addPixel(x, 0);
    addPixel(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    addPixel(0, y);
    addPixel(width - 1, y);
  }
  if (!borderPixels.length) return null;

  const background = borderPixels.reduce((sum, color) => color.map((value, index) => value + sum[index]), [0, 0, 0])
    .map((value) => value / borderPixels.length);
  const distanceFromBackground = (red, green, blue) => Math.sqrt(
    (red - background[0]) ** 2 + (green - background[1]) ** 2 + (blue - background[2]) ** 2
  );
  const borderDistances = borderPixels.map((color) => distanceFromBackground(...color));
  const borderMean = borderDistances.reduce((sum, value) => sum + value, 0) / borderDistances.length;
  const borderDeviation = Math.sqrt(borderDistances.reduce((sum, value) => sum + (value - borderMean) ** 2, 0) / borderDistances.length);
  const threshold = clamp(borderMean + borderDeviation * 2.5, 14, 46);
  const mask = new Uint8Array(width * height);
  let foregroundCount = 0;
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      if (pixels[index + 3] <= 32 || distanceFromBackground(pixels[index], pixels[index + 1], pixels[index + 2]) <= threshold) continue;
      mask[y * width + x] = 1;
      foregroundCount += 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  if (foregroundCount < width * height * .035 || maxX <= minX || maxY <= minY) return null;
  const garmentWidth = maxX - minX + 1;
  const garmentHeight = maxY - minY + 1;
  const aspectRatio = garmentHeight / garmentWidth;
  if (aspectRatio < 1.2) return null;

  const centerX = (minX + maxX) / 2;
  const centerHalfWidth = Math.max(1, Math.round(garmentWidth * .075));
  const sideInset = Math.max(1, Math.round(garmentWidth * .08));
  const lowerStart = minY + Math.round(garmentHeight * .48);
  const lowerEnd = minY + Math.round(garmentHeight * .94);
  let splitRows = 0;
  let inspectedRows = 0;
  for (let y = lowerStart; y <= lowerEnd; y += 1) {
    inspectedRows += 1;
    let center = 0;
    let left = 0;
    let right = 0;
    for (let x = minX + sideInset; x <= maxX - sideInset; x += 1) {
      if (!mask[y * width + x]) continue;
      if (x < centerX - centerHalfWidth) left += 1;
      else if (x > centerX + centerHalfWidth) right += 1;
      else center += 1;
    }
    if (left && right && center <= 1) splitRows += 1;
  }
  const legSplitRatio = splitRows / Math.max(1, inspectedRows);
  return aspectRatio >= 1.3 && legSplitRatio >= .24 ? "bottoms" : null;
}

async function compressAndAnalyze(file) {
  const bitmap = await loadPhoto(file);
  const max = 1000;
  const ratio = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = 48; sampleCanvas.height = 48;
  const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
  sampleCtx.drawImage(canvas, 0, 0, 48, 48);
  const imageData = sampleCtx.getImageData(0, 0, 48, 48);
  const pixels = imageData.data;
  const colorVotes = {};
  let sampledCount = 0;
  for (let y = 6; y < 42; y += 1) {
    for (let x = 6; x < 42; x += 1) {
      const i = (y * 48 + x) * 4;
      const rgb = [pixels[i], pixels[i + 1], pixels[i + 2]];
      const maxChannel = Math.max(...rgb);
      const minChannel = Math.min(...rgb);
      const chroma = maxChannel - minChannel;
      const brightness = (rgb[0] + rgb[1] + rgb[2]) / 3;
      if (brightness > 225 && chroma < 24) continue;
      const color = closestColor(rgb);
      const weight = 1 + chroma / 50;
      colorVotes[color] = (colorVotes[color] || 0) + weight;
      sampledCount += 1;
    }
  }
  const detectedColor = sampledCount
    ? Object.entries(colorVotes).sort((a, b) => b[1] - a[1])[0][0]
    : "white";
  const detectedCategory = inferCategoryFromImageData(pixels, 48, 48);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", .82));
  if (typeof bitmap.close === "function") bitmap.close();
  return { blob, detectedColor, detectedCategory };
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("画像を送信形式へ変換できません"));
    reader.readAsDataURL(blob);
  });
}

function canUseGarmentAI() {
  return garmentAnalysisAvailability !== "unavailable" && Boolean(
    cloudUser && window.KinariCloud?.isConfigured?.() && window.KinariCloud?.analyzeGarment
  );
}

function confidenceFor(analysis, field) {
  return Number(analysis?.fieldConfidences?.[field] ?? analysis?.confidence ?? 0);
}

function shouldApplyAIField(analysis, field) {
  return analysis?.imageQuality?.usable !== false && confidenceFor(analysis, field) >= AI_AUTO_APPLY_THRESHOLD;
}

function setSelectValue(selector, value) {
  const select = $(selector);
  if (!select || value === undefined || value === null) return false;
  const resolved = String(value);
  if (![...select.options].some((option) => option.value === resolved)) return false;
  select.value = resolved;
  return true;
}

function analysisBadgeMarkup(analysis) {
  if (!analysis) return "";
  const confidence = Number(analysis.confidence || 0);
  const quality = analysis.imageQuality || {};
  if (quality.usable === false) return `<em class="analysis-badge low">撮り直し推奨</em>`;
  if (confidence >= AI_HIGH_CONFIDENCE_THRESHOLD) return `<em class="analysis-badge high">AI解析 ${confidence}%</em>`;
  if (confidence >= AI_AUTO_APPLY_THRESHOLD) return `<em class="analysis-badge review">AI解析 ${confidence}%・要確認</em>`;
  return `<em class="analysis-badge low">AI解析 ${confidence}%・参考</em>`;
}

function clearAnalysisFieldStates(rootSelector) {
  $$(`${rootSelector} .field`).forEach((field) => {
    delete field.dataset.aiConfidence;
    delete field.dataset.aiState;
  });
}

function renderAnalysisFieldStates(prefix, analysis) {
  const formSelector = prefix === "item" ? "#item-form" : "#candidate-form";
  clearAnalysisFieldStates(formSelector);
  if (!analysis) return;
  const idByField = {
    category: `${prefix}-category`, color: `${prefix}-color`, silhouette: `${prefix}-silhouette`,
    garmentLength: `${prefix}-garment-length`, sleeveLength: `${prefix}-sleeve-length`,
    thickness: `${prefix}-thickness`, layerRole: `${prefix}-layer-role`,
    season: `${prefix}-season`, warmth: `${prefix}-warmth`, formality: `${prefix}-formality`,
    pattern: `${prefix}-pattern`, material: `${prefix}-material`, style: `${prefix}-style`, statement: `${prefix}-statement`,
  };
  Object.entries(idByField).forEach(([field, id]) => {
    const input = document.getElementById(id);
    const wrapper = input?.closest(".field");
    if (!wrapper) return;
    const confidence = confidenceFor(analysis, field);
    wrapper.dataset.aiConfidence = String(confidence);
    wrapper.dataset.aiState = confidence >= AI_HIGH_CONFIDENCE_THRESHOLD ? "high" : confidence >= AI_AUTO_APPLY_THRESHOLD ? "review" : "low";
  });
}

function localGuessFor(category, color, name = "", filename = "") {
  return { name, category, color, ...candidateDefaults(category, color, name, filename) };
}

async function requestGarmentAnalysis(blob, targetKind, filename, localGuess) {
  if (!canUseGarmentAI()) return null;
  try {
    const result = await window.KinariCloud.analyzeGarment({
      imageDataUrl: await blobToDataUrl(blob),
      targetKind,
      filename,
      localGuess,
    });
    garmentAnalysisAvailability = "available";
    return result;
  } catch (error) {
    if (["AI_NOT_CONFIGURED", "DAILY_LIMIT"].includes(error.code)) garmentAnalysisAvailability = "unavailable";
    throw error;
  }
}

function applyItemVisionAnalysis(analysis) {
  if (!analysis?.attributes) return;
  const attrs = analysis.attributes;
  currentItemAnalysis = analysis;
  if (shouldApplyAIField(analysis, "category")) setSelectValue("#item-category", attrs.category);
  if (shouldApplyAIField(analysis, "color")) setSelectValue("#item-color", attrs.color);
  const category = $("#item-category").value;
  configureProfileFields("item", category, attrs);
  const fieldSelectors = {
    season: "#item-season", warmth: "#item-warmth", formality: "#item-formality", pattern: "#item-pattern",
    material: "#item-material", silhouette: "#item-silhouette", garmentLength: "#item-garment-length",
    sleeveLength: "#item-sleeve-length", thickness: "#item-thickness", layerRole: "#item-layer-role",
    style: "#item-style", statement: "#item-statement",
  };
  Object.entries(fieldSelectors).forEach(([field, selector]) => {
    if (shouldApplyAIField(analysis, field)) setSelectValue(selector, attrs[field]);
  });
  const nameInput = $("#item-name");
  if (attrs.displayName && Number(analysis.confidence || 0) >= AI_AUTO_APPLY_THRESHOLD && (!nameInput.value.trim() || nameInput.value === lastSuggestedItemName)) {
    nameInput.value = attrs.displayName;
    lastSuggestedItemName = attrs.displayName;
  }
  renderAnalysisFieldStates("item", analysis);
  updateItemAnalysisSummary();
}

function applyCandidateVisionAnalysis(analysis) {
  if (!analysis?.attributes) return;
  const attrs = analysis.attributes;
  currentCandidateAnalysis = analysis;
  if (shouldApplyAIField(analysis, "category")) setSelectValue("#candidate-category", attrs.category);
  if (shouldApplyAIField(analysis, "color")) setSelectValue("#candidate-color", attrs.color);
  configureProfileFields("candidate", $("#candidate-category").value, attrs);
  const fieldSelectors = {
    silhouette: "#candidate-silhouette", garmentLength: "#candidate-garment-length",
    sleeveLength: "#candidate-sleeve-length", thickness: "#candidate-thickness", layerRole: "#candidate-layer-role",
  };
  Object.entries(fieldSelectors).forEach(([field, selector]) => {
    if (shouldApplyAIField(analysis, field)) setSelectValue(selector, attrs[field]);
  });
  const nameInput = $("#candidate-name");
  if (attrs.displayName && Number(analysis.confidence || 0) >= AI_AUTO_APPLY_THRESHOLD && (!nameInput.value.trim() || nameInput.value === lastSuggestedCandidateName)) {
    nameInput.value = attrs.displayName;
    lastSuggestedCandidateName = attrs.displayName;
  }
  renderAnalysisFieldStates("candidate", analysis);
  updateCandidateAnalysisSummary();
}

function confirmedItemAttributes(item) {
  return {
    category: item.category, color: item.color, season: item.season, warmth: item.warmth, formality: item.formality,
    pattern: item.pattern, material: item.material, silhouette: item.silhouette, garmentLength: item.garmentLength,
    sleeveLength: item.sleeveLength, thickness: item.thickness, layerRole: item.layerRole, style: item.style,
    statement: item.statement,
  };
}

async function confirmVisionAnalysis(analysis, targetLocalId, finalAttributes) {
  if (!analysis?.analysisId || !cloudUser || !window.KinariCloud?.confirmGarmentAnalysis) return;
  try {
    await window.KinariCloud.confirmGarmentAnalysis({
      analysisId: analysis.analysisId,
      targetLocalId,
      predictedAttributes: analysis.attributes,
      finalAttributes,
    });
  } catch (error) {
    console.warn("画像解析の確認結果をクラウドへ記録できませんでした", error);
  }
}

function suggestedItemName(category = $("#item-category").value, color = $("#item-color").value) {
  return `${labels.color[color] || ""}の${labels.category[category] || "服"}`;
}

function updateItemAnalysisSummary() {
  const category = $("#item-category").value;
  const color = $("#item-color").value;
  const profile = getItemProfile({
    name: $("#item-name").value,
    category,
    color,
    formality: Number($("#item-formality").value),
    pattern: $("#item-pattern").value,
    material: $("#item-material").value,
    silhouette: $("#item-silhouette").value,
    garmentLength: $("#item-garment-length").value,
    sleeveLength: $("#item-sleeve-length").value,
    thickness: $("#item-thickness").value,
    layerRole: $("#item-layer-role").value,
    style: $("#item-style").value,
    statement: Number($("#item-statement").value),
  });
  $("#item-analysis-summary").innerHTML = `
    <span aria-hidden="true">✦</span>
    <p><strong>${labels.color[color]}・${labels.category[category]}・${labels.style[profile.style]} ${analysisBadgeMarkup(currentItemAnalysis)}</strong><small>${labels.material[profile.material]}／${labels.silhouette[profile.silhouette]}／${labels.thickness[profile.thickness]}。${currentItemAnalysis?.imageQuality?.guidance ? escapeHTML(currentItemAnalysis.imageQuality.guidance) : "写真だけで曖昧な特徴は下で確認できます"}</small></p>`;
}

function applyQuickItemInference({ updateName = true, filename = "" } = {}) {
  const category = $("#item-category").value;
  const color = $("#item-color").value;
  const nextSuggestedName = suggestedItemName(category, color);
  const nameInput = $("#item-name");
  if (updateName && (!nameInput.value.trim() || nameInput.value === lastSuggestedItemName)) {
    nameInput.value = nextSuggestedName;
    lastSuggestedItemName = nextSuggestedName;
  }

  if (!$("#item-advanced").open) {
    const categoryDefaults = {
      tops: ["all", 2], bottoms: ["all", 2], onepiece: ["all", 2],
      outer: ["autumn", 4], shoes: ["all", 2], accessory: ["all", 2],
    };
    const [season, warmth] = categoryDefaults[category] || ["all", 3];
    $("#item-season").value = season;
    $("#item-warmth").value = String(warmth);
    const inferred = getItemProfile({
      name: nameInput.value,
      category,
      color,
      formality: Number($("#item-formality").value),
    });
    configureProfileFields("item", category, inferred);
    $("#item-pattern").value = inferred.pattern;
    $("#item-material").value = materialFromName(filename) || (category === "shoes" ? "leather" : inferred.material);
    $("#item-silhouette").value = inferred.silhouette;
    $("#item-garment-length").value = inferred.garmentLength;
    $("#item-sleeve-length").value = inferred.sleeveLength;
    $("#item-thickness").value = inferred.thickness;
    $("#item-layer-role").value = category === "outer" ? "outer" : inferred.layerRole;
    $("#item-style").value = inferred.style;
    $("#item-statement").value = inferred.statement;
  } else {
    const currentProfile = getItemProfile({
      name: nameInput.value,
      category,
      color,
      warmth: Number($("#item-warmth").value),
      silhouette: $("#item-silhouette").value,
      garmentLength: $("#item-garment-length").value,
      sleeveLength: $("#item-sleeve-length").value,
      thickness: $("#item-thickness").value,
      layerRole: ["tops", "outer"].includes(category) ? $("#item-layer-role").value : undefined,
    });
    configureProfileFields("item", category, currentProfile);
  }
  updateItemAnalysisSummary();
}

function resetItemForm() {
  $("#item-form").reset();
  $("#item-id").value = "";
  $("#item-dialog-title").textContent = "服を登録";
  $("#save-item").textContent = "この内容で登録";
  $("#item-advanced").open = false;
  $("#photo-preview").hidden = true;
  $("#photo-placeholder").hidden = false;
  $("#analysis-hint").textContent = "写真を選ぶと服の特徴を仮入力します。ログイン中はAI解析も利用します。";
  $("#item-analysis-summary").innerHTML = `<span aria-hidden="true">✦</span><p><strong>写真を選ぶと仮判定します</strong><small>違うところだけ後から直せます</small></p>`;
  revokePhotoURL(currentPhotoUrl);
  currentPhoto = null;
  currentPhotoUrl = null;
  lastSuggestedItemName = "";
  currentItemAnalysis = null;
  clearAnalysisFieldStates("#item-form");
  configureProfileFields("item", "tops", getItemProfile({ category: "tops", warmth: 2 }));
}

function openItemDialog(item = null) {
  resetItemForm();
  if (item) {
    const profile = getItemProfile(item);
    $("#item-dialog-title").textContent = "服の情報を編集";
    $("#save-item").textContent = "変更を保存";
    $("#item-id").value = item.id;
    $("#item-name").value = item.name;
    $("#item-category").value = item.category;
    $("#item-color").value = item.color;
    const genericName = suggestedItemName(item.category, item.color);
    lastSuggestedItemName = item.name === genericName ? genericName : "";
    $("#item-season").value = item.season;
    $("#item-warmth").value = item.warmth;
    $("#item-formality").value = item.formality;
    $("#item-pattern").value = profile.pattern;
    $("#item-material").value = profile.material;
    configureProfileFields("item", item.category, profile);
    $("#item-silhouette").value = profile.silhouette;
    $("#item-garment-length").value = profile.garmentLength;
    $("#item-sleeve-length").value = profile.sleeveLength;
    $("#item-thickness").value = profile.thickness;
    $("#item-layer-role").value = profile.layerRole;
    $("#item-style").value = profile.style;
    $("#item-statement").value = profile.statement;
    $("#item-status").value = item.status === "archived" ? "ready" : item.status;
    $("#item-notes").value = item.notes || "";
    currentPhoto = item.photo || null;
    if (item.photo) {
      currentPhotoUrl = objectURL(item.photo);
      $("#photo-preview").src = currentPhotoUrl;
      $("#photo-preview").hidden = false;
      $("#photo-placeholder").hidden = true;
    }
    updateItemAnalysisSummary();
  }
  $("#item-dialog").showModal();
}

async function saveItem(event) {
  event.preventDefault();
  const form = $("#item-form");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const saveButton = $("#save-item");
  const defaultLabel = saveButton.textContent;
  saveButton.disabled = true;
  saveButton.textContent = "保存しています…";

  try {
    const existing = items.find((item) => item.id === $("#item-id").value);
    const now = new Date().toISOString();
    const item = {
      ...(existing || {}),
      id: existing?.id || createId(),
      name: $("#item-name").value.trim(), category: $("#item-category").value, color: $("#item-color").value,
      subcategory: currentItemAnalysis?.attributes?.subcategory || existing?.subcategory || "",
      secondaryColors: currentItemAnalysis?.attributes?.secondaryColors || existing?.secondaryColors || [],
      season: $("#item-season").value, warmth: Number($("#item-warmth").value), formality: Number($("#item-formality").value),
      pattern: $("#item-pattern").value, material: $("#item-material").value, silhouette: $("#item-silhouette").value,
      garmentLength: $("#item-garment-length").value, sleeveLength: $("#item-sleeve-length").value,
      thickness: $("#item-thickness").value, layerRole: $("#item-layer-role").value,
      attributeSource: "user_confirmed", attributeConfidence: 100,
      style: $("#item-style").value, statement: Number($("#item-statement").value),
      status: existing?.status === "archived" ? "archived" : $("#item-status").value,
      notes: $("#item-notes").value.trim(), photo: currentPhoto ?? existing?.photo ?? null,
      visionAnalysisId: currentItemAnalysis?.analysisId || existing?.visionAnalysisId || null,
      createdAt: existing?.createdAt || now, updatedAt: now, lastWornAt: existing?.lastWornAt || null,
    };
    await put("items", item);
    await confirmVisionAnalysis(currentItemAnalysis, item.id, confirmedItemAttributes(item));
    items = await getAll("items");
    $("#item-dialog").close();
    renderAll();
    queueCloudSync();
    showToast(existing ? "服の情報を更新しました" : "クローゼットに追加しました");
  } catch (error) {
    console.error("服の保存に失敗しました", error);
    showToast("保存できませんでした。通常モードのブラウザで、もう一度お試しください");
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = defaultLabel;
  }
}

function candidateDefaults(category, color, name, filename = "") {
  const categoryDefaults = {
    tops: ["all", 2, 2], bottoms: ["all", 2, 2], onepiece: ["all", 2, 3],
    outer: ["autumn", 4, 3], shoes: ["all", 2, 2], accessory: ["all", 2, 2],
  };
  const [season, warmth, formality] = categoryDefaults[category] || ["all", 3, 3];
  const profile = getItemProfile({ name, notes: filename, category, color, formality, warmth });
  return {
    season,
    warmth,
    formality,
    pattern: profile.pattern,
    material: materialFromName(filename) || (category === "shoes" ? "leather" : profile.material),
    silhouette: profile.silhouette,
    garmentLength: profile.garmentLength,
    sleeveLength: profile.sleeveLength,
    thickness: profile.thickness,
    layerRole: profile.layerRole,
    attributeSource: "assisted",
    attributeConfidence: 60,
    style: profile.style,
    statement: profile.statement,
  };
}

function batchDraftMetadata(filename, detectedColor = "white", detectedCategory = null) {
  const category = categoryFromName(filename, detectedCategory || "tops");
  const color = colorFromName(filename) || detectedColor;
  const name = `${labels.color[color] || ""}の${labels.category[category] || "服"}`;
  return { name, category, color, ...candidateDefaults(category, color, name, filename) };
}

function applyBatchVisionAnalysis(draft, analysis) {
  if (!draft || !analysis?.attributes) return;
  const attrs = analysis.attributes;
  const category = shouldApplyAIField(analysis, "category") ? attrs.category : draft.category;
  const color = shouldApplyAIField(analysis, "color") ? attrs.color : draft.color;
  const fallback = candidateDefaults(category, color, draft.name, draft.filename);
  Object.assign(draft, fallback, { category, color });
  [
    "season", "warmth", "formality", "pattern", "material", "silhouette", "garmentLength",
    "sleeveLength", "thickness", "layerRole", "style", "statement",
  ].forEach((field) => {
    if (shouldApplyAIField(analysis, field)) draft[field] = attrs[field];
  });
  if (attrs.displayName && Number(analysis.confidence || 0) >= AI_AUTO_APPLY_THRESHOLD && (!draft.name.trim() || draft.name === draft.suggestedName)) {
    draft.name = attrs.displayName;
    draft.suggestedName = attrs.displayName;
  }
  draft.subcategory = attrs.subcategory || "";
  draft.secondaryColors = attrs.secondaryColors || [];
  draft.visionAnalysisId = analysis.analysisId || null;
  draft.visionAnalysisConfidence = Number(analysis.confidence || 0);
  draft.visionAnalysis = analysis;
}

async function runWithConcurrency(entries, worker, concurrency = AI_BATCH_CONCURRENCY) {
  let cursor = 0;
  async function runNext() {
    while (cursor < entries.length) {
      const index = cursor;
      cursor += 1;
      await worker(entries[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, () => runNext()));
}

function batchOptions(values, selected) {
  return Object.entries(values).map(([value, label]) =>
    `<option value="${value}"${value === selected ? " selected" : ""}>${escapeHTML(label)}</option>`
  ).join("");
}

function batchSilhouetteOptions(category, selected) {
  const choices = silhouetteChoices(category);
  const resolved = choices.includes(selected) ? selected : (category === "bottoms" ? "straight" : "regular");
  return optionMarkup(choices, resolved, labels.silhouette);
}

function renderBatchRegister() {
  const list = $("#batch-register-list");
  const progress = $("#batch-progress");
  const saveButton = $("#save-batch-items");
  const closeButtons = $$('[data-close-batch-dialog]');
  const addInput = $("#batch-add-photo");

  list.innerHTML = batchDrafts.length ? batchDrafts.map((draft, index) => `
    <article class="batch-register-item" data-batch-id="${draft.id}">
      <figure><img src="${escapeHTML(draft.photoUrl)}" alt="${escapeHTML(draft.name)}のプレビュー"><figcaption>${index + 1}</figcaption></figure>
      <div class="batch-register-fields">
        <label class="field full"><span>名前</span><input required maxlength="120" data-batch-field="name" value="${escapeHTML(draft.name)}"></label>
        <label class="field"><span>カテゴリ</span><select data-batch-field="category">${batchOptions(labels.category, draft.category)}</select></label>
        <label class="field"><span>色</span><select data-batch-field="color">${batchOptions(labels.color, draft.color)}</select></label>
        ${!["shoes", "accessory"].includes(draft.category) ? `<label class="field"><span>${draft.category === "bottoms" ? "パンツの形" : "ゆとり"}</span><select data-batch-field="silhouette">${batchSilhouetteOptions(draft.category, draft.silhouette)}</select></label>` : ""}
        <small title="${escapeHTML(draft.filename)}">${escapeHTML(draft.filename)} ${analysisBadgeMarkup(draft.visionAnalysis)}</small>
      </div>
      <button class="batch-remove-button" type="button" data-remove-batch-item="${draft.id}" aria-label="${escapeHTML(draft.name)}を一括登録から除外">除外</button>
    </article>
  `).join("") : `<div class="batch-empty"><strong>登録する写真がありません</strong><span>「写真を追加」から選んでください。</span></div>`;

  progress.textContent = batchProcessing
    ? `写真を判定しています… ${batchDrafts.length}/${MAX_BATCH_ITEMS}点準備済み`
    : `${batchDrafts.length}/${MAX_BATCH_ITEMS}点を登録予定`;
  saveButton.disabled = batchProcessing || !batchDrafts.length || batchDrafts.some((draft) => !draft.name.trim());
  saveButton.textContent = batchDrafts.length ? `${batchDrafts.length}点をまとめて登録` : "まとめて登録";
  closeButtons.forEach((button) => button.disabled = batchProcessing);
  addInput.disabled = batchProcessing || batchDrafts.length >= MAX_BATCH_ITEMS;
}

function clearBatchRegister() {
  batchSessionId += 1;
  batchDrafts.forEach((draft) => revokePhotoURL(draft.photoUrl));
  batchDrafts = [];
  batchProcessing = false;
  $("#batch-photo-picker").value = "";
  $("#batch-add-photo").value = "";
  renderBatchRegister();
}

async function addBatchFiles(selectedFiles) {
  if (batchProcessing) return;
  const existingKeys = new Set(batchDrafts.map((draft) => draft.fileKey));
  const available = MAX_BATCH_ITEMS - batchDrafts.length;
  const imageFiles = [...selectedFiles]
    .filter((file) => file.type.startsWith("image/"))
    .filter((file) => !existingKeys.has(`${file.name}:${file.size}:${file.lastModified}`));
  const files = imageFiles.slice(0, available);
  if (!files.length) {
    showToast(available ? "新しい画像を選んでください" : `一括登録は最大${MAX_BATCH_ITEMS}点です`);
    return;
  }
  if (imageFiles.length > available) showToast(`最大${MAX_BATCH_ITEMS}点までを登録対象にしました`);

  const sessionId = batchSessionId;
  batchProcessing = true;
  renderBatchRegister();
  let failedCount = 0;
  const aiTargets = [];
  for (const file of files) {
    if (sessionId !== batchSessionId) return;
    try {
      const { blob, detectedColor, detectedCategory } = await compressAndAnalyze(file);
      if (sessionId !== batchSessionId) return;
      const metadata = batchDraftMetadata(file.name, detectedColor, detectedCategory);
      const draft = {
        id: createId(),
        ...metadata,
        suggestedName: metadata.name,
        status: "ready",
        notes: "",
        photo: blob,
        photoUrl: objectURL(blob),
        filename: file.name,
        fileKey: `${file.name}:${file.size}:${file.lastModified}`,
      };
      batchDrafts.push(draft);
      aiTargets.push({ draft, blob, file });
      renderBatchRegister();
    } catch (error) {
      failedCount += 1;
      console.error("一括登録用の画像を読み込めませんでした", file.name, error);
    }
  }
  if (sessionId === batchSessionId && canUseGarmentAI() && aiTargets.length) {
    await runWithConcurrency(aiTargets, async ({ draft, blob, file }) => {
      if (sessionId !== batchSessionId || !canUseGarmentAI()) return;
      try {
        const analysis = await requestGarmentAnalysis(blob, "batch", file.name, localGuessFor(draft.category, draft.color, draft.name, file.name));
        if (sessionId !== batchSessionId || !analysis) return;
        applyBatchVisionAnalysis(draft, analysis);
        renderBatchRegister();
      } catch (error) {
        console.warn("一括登録のAI画像解析を利用できませんでした", file.name, error.code || error.message);
      }
    });
  }
  if (sessionId !== batchSessionId) return;
  batchProcessing = false;
  renderBatchRegister();
  if (failedCount) showToast(`${failedCount}枚は読み込めなかったため除外しました`);
}

function openBatchRegister(files) {
  clearBatchRegister();
  $("#batch-dialog").showModal();
  addBatchFiles(files);
}

function updateBatchDraft(event) {
  const field = event.target.dataset.batchField;
  if (!field) return;
  const card = event.target.closest("[data-batch-id]");
  const draft = batchDrafts.find((entry) => entry.id === card?.dataset.batchId);
  if (!draft) return;
  draft[field] = event.target.value;
  if (field === "category" || field === "color") {
    const nextSuggestedName = `${labels.color[draft.color] || ""}の${labels.category[draft.category] || "服"}`;
    if (!draft.name.trim() || draft.name === draft.suggestedName) draft.name = nextSuggestedName;
    draft.suggestedName = nextSuggestedName;
    Object.assign(draft, candidateDefaults(draft.category, draft.color, draft.name, draft.filename));
    renderBatchRegister();
  } else {
    $("#save-batch-items").disabled = batchDrafts.some((entry) => !entry.name.trim());
  }
}

async function saveBatchItems(event) {
  event.preventDefault();
  if (batchProcessing || !batchDrafts.length || batchDrafts.some((draft) => !draft.name.trim())) return;
  const saveButton = $("#save-batch-items");
  const count = batchDrafts.length;
  saveButton.disabled = true;
  saveButton.textContent = "まとめて保存しています…";
  try {
    const baseTime = Date.now();
    const preparedItems = batchDrafts.map((draft, index) => {
      const { photoUrl: _photoUrl, filename: _filename, fileKey: _fileKey, suggestedName: _suggestedName, visionAnalysis, ...item } = draft;
      const timestamp = new Date(baseTime + index).toISOString();
      const savedItem = { ...item, attributeSource: "user_confirmed", attributeConfidence: 100, createdAt: timestamp, updatedAt: timestamp, lastWornAt: null };
      return { item: savedItem, analysis: visionAnalysis };
    });
    await putMany("items", preparedItems.map(({ item }) => item));
    await Promise.all(preparedItems.map(({ item, analysis }) => confirmVisionAnalysis(analysis, item.id, confirmedItemAttributes(item))));
    items = await getAll("items");
    $("#batch-dialog").close();
    renderAll();
    switchView("closet");
    queueCloudSync();
    showToast(`${count}点をクローゼットに追加しました`);
  } catch (error) {
    console.error("服の一括保存に失敗しました", error);
    showToast("一括保存できませんでした。写真を減らしてもう一度お試しください");
    renderBatchRegister();
  }
}

function suggestedCandidateName() {
  const category = $("#candidate-category").value;
  const color = $("#candidate-color").value;
  return `${labels.color[color] || ""}の${labels.category[category] || "服"}`;
}

function updateCandidateAnalysisSummary() {
  const category = $("#candidate-category").value;
  const color = $("#candidate-color").value;
  const name = $("#candidate-name").value.trim() || suggestedCandidateName();
  const profile = {
    ...candidateDefaults(category, color, name),
    silhouette: $("#candidate-silhouette")?.value,
    garmentLength: $("#candidate-garment-length")?.value,
    sleeveLength: $("#candidate-sleeve-length")?.value,
    thickness: $("#candidate-thickness")?.value,
    layerRole: $("#candidate-layer-role")?.value,
  };
  $("#candidate-analysis-summary").innerHTML = `
    <span aria-hidden="true">✦</span>
    <p><strong>${labels.color[color]}・${labels.category[category]}・${labels.style[profile.style]} ${analysisBadgeMarkup(currentCandidateAnalysis)}</strong><small>${currentCandidateAnalysis?.imageQuality?.guidance ? escapeHTML(currentCandidateAnalysis.imageQuality.guidance) : "この候補を必ず含む、相性のよいコーデを最大10案まで探します"}</small></p>`;
}

function applyQuickCandidateInference({ filename = "", updateName = true } = {}) {
  const nextName = suggestedCandidateName();
  const nameInput = $("#candidate-name");
  if (updateName && (!nameInput.value.trim() || nameInput.value === lastSuggestedCandidateName)) {
    nameInput.value = nextName;
    lastSuggestedCandidateName = nextName;
  }
  const category = $("#candidate-category").value;
  const color = $("#candidate-color").value;
  configureProfileFields("candidate", category, candidateDefaults(category, color, nameInput.value || nextName, filename));
  updateCandidateAnalysisSummary();
}

function resetCandidateForm() {
  $("#candidate-form").reset();
  $("#candidate-photo-preview").hidden = true;
  $("#candidate-photo-placeholder").hidden = false;
  $("#candidate-analysis-hint").textContent = "写真を端末内で軽量化し、ログイン中はAIでも服の特徴を確認します。";
  $("#candidate-analysis-summary").innerHTML = `<span aria-hidden="true">✦</span><p><strong>写真を選ぶと仮判定します</strong><small>品質基準を満たす組み合わせだけを最大10案まで表示します</small></p>`;
  revokePhotoURL(currentCandidatePhotoUrl);
  currentCandidatePhoto = null;
  currentCandidatePhotoUrl = null;
  lastSuggestedCandidateName = "";
  currentCandidateAnalysis = null;
  clearAnalysisFieldStates("#candidate-form");
  configureProfileFields("candidate", "tops", candidateDefaults("tops", "white", ""));
}

function openCandidateDialog() {
  resetCandidateForm();
  $("#candidate-dialog").showModal();
}

async function loadCandidatePhoto(file) {
  if (!file) return;
  $("#candidate-analysis-hint").textContent = "写真を軽量化し、服の特徴を確認しています…";
  try {
    const { blob, detectedColor, detectedCategory } = await compressAndAnalyze(file);
    currentCandidatePhoto = blob;
    revokePhotoURL(currentCandidatePhotoUrl);
    currentCandidatePhotoUrl = objectURL(blob);
    $("#candidate-photo-preview").src = currentCandidatePhotoUrl;
    $("#candidate-photo-preview").hidden = false;
    $("#candidate-photo-placeholder").hidden = true;
    $("#candidate-color").value = colorFromName(file.name) || detectedColor;
    $("#candidate-category").value = categoryFromName(file.name, detectedCategory || "tops");
    applyQuickCandidateInference({ filename: file.name });
    if (canUseGarmentAI()) {
      $("#candidate-analysis-hint").textContent = "AIがカテゴリ・形・丈・素材を確認しています…";
      try {
        const localGuess = localGuessFor($("#candidate-category").value, $("#candidate-color").value, $("#candidate-name").value, file.name);
        const analysis = await requestGarmentAnalysis(blob, "candidate", file.name, localGuess);
        if (analysis) applyCandidateVisionAnalysis(analysis);
        $("#candidate-analysis-hint").textContent = analysis?.imageQuality?.usable === false
          ? (analysis.imageQuality.guidance || "服全体が明るく写るように撮り直すと、判定が正確になります。")
          : "AIが仮入力しました。黄色・赤色の項目を中心に確認してください。";
      } catch (error) {
        $("#candidate-analysis-hint").textContent = error.message || "AIを利用できないため、端末内で仮入力しました。";
      }
    } else {
      $("#candidate-analysis-hint").textContent = cloudUser
        ? "AI未設定のため、端末内で仮入力しました。違うところだけ修正してください。"
        : "端末内で仮入力しました。ログインするとAI画像解析も利用できます。";
    }
  } catch (error) {
    console.error(error);
    $("#candidate-analysis-hint").textContent = "画像を読み込めませんでした。別の写真をお試しください。";
  }
}

async function saveCandidate(event) {
  event.preventDefault();
  const form = $("#candidate-form");
  if (!form.checkValidity() || !currentCandidatePhoto) {
    form.reportValidity();
    if (!currentCandidatePhoto) showToast("まず候補の写真を撮るか選んでください");
    return;
  }

  const button = $("#save-candidate");
  const defaultLabel = button.textContent;
  button.disabled = true;
  button.textContent = "組み合わせを探しています…";
  try {
    const now = new Date().toISOString();
    const category = $("#candidate-category").value;
    const color = $("#candidate-color").value;
    const name = $("#candidate-name").value.trim();
    const defaults = candidateDefaults(category, color, name);
    const aiAttributes = currentCandidateAnalysis?.attributes || {};
    const candidate = {
      id: createId(),
      name,
      category,
      color,
      ...defaults,
      season: aiAttributes.season || defaults.season,
      warmth: Number(aiAttributes.warmth || defaults.warmth),
      formality: Number(aiAttributes.formality || defaults.formality),
      pattern: aiAttributes.pattern || defaults.pattern,
      material: aiAttributes.material || defaults.material,
      style: aiAttributes.style || defaults.style,
      statement: Number(aiAttributes.statement || defaults.statement),
      subcategory: aiAttributes.subcategory || "",
      secondaryColors: aiAttributes.secondaryColors || [],
      silhouette: $("#candidate-silhouette").value,
      garmentLength: $("#candidate-garment-length").value,
      sleeveLength: $("#candidate-sleeve-length").value,
      thickness: $("#candidate-thickness").value,
      layerRole: $("#candidate-layer-role").value,
      attributeSource: "user_confirmed",
      attributeConfidence: 100,
      visionAnalysisId: currentCandidateAnalysis?.analysisId || null,
      photo: currentCandidatePhoto,
      price: Number($("#candidate-price").value) || null,
      store: $("#candidate-store").value.trim(),
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    await put("candidates", candidate);
    await confirmVisionAnalysis(currentCandidateAnalysis, candidate.id, confirmedItemAttributes(candidate));
    purchaseCandidates = await getAll("candidates");
    $("#candidate-dialog").close();
    renderCandidates();
    switchView("shopping");
    showToast("購入候補に追加し、相性のよい組み合わせを探しました");
  } catch (error) {
    console.error("購入候補の保存に失敗しました", error);
    showToast("購入候補を保存できませんでした。もう一度お試しください");
  } finally {
    button.disabled = false;
    button.textContent = defaultLabel;
  }
}

async function archiveCandidate(id) {
  const candidate = purchaseCandidates.find((entry) => entry.id === id);
  if (!candidate || candidate.status !== "active") return;
  const now = new Date().toISOString();
  await put("candidates", { ...candidate, status: "archived", archivedAt: now, updatedAt: now });
  purchaseCandidates = await getAll("candidates");
  renderCandidates();
  showToast("候補を削除せず、見送り履歴へ移しました");
}

async function reopenCandidate(id) {
  const candidate = purchaseCandidates.find((entry) => entry.id === id);
  if (!candidate || candidate.status === "purchased") return;
  const now = new Date().toISOString();
  await put("candidates", { ...candidate, status: "active", reopenedAt: now, updatedAt: now });
  purchaseCandidates = await getAll("candidates");
  renderCandidates();
  showToast("検討中の候補へ戻しました");
}

async function purchaseCandidate(id) {
  const candidate = purchaseCandidates.find((entry) => entry.id === id);
  if (!candidate || candidate.status !== "active") return;
  const now = new Date().toISOString();
  const closetItem = {
    id: createId(),
    name: candidate.name,
    category: candidate.category,
    subcategory: candidate.subcategory || "",
    color: candidate.color,
    secondaryColors: candidate.secondaryColors || [],
    season: candidate.season,
    warmth: candidate.warmth,
    formality: candidate.formality,
    pattern: candidate.pattern,
    material: candidate.material,
    silhouette: candidate.silhouette,
    garmentLength: candidate.garmentLength,
    sleeveLength: candidate.sleeveLength,
    thickness: candidate.thickness,
    layerRole: candidate.layerRole,
    attributeSource: candidate.attributeSource || "user_confirmed",
    attributeConfidence: Number(candidate.attributeConfidence || 100),
    visionAnalysisId: candidate.visionAnalysisId || null,
    style: candidate.style,
    statement: candidate.statement,
    photo: candidate.photo,
    status: "ready",
    notes: [candidate.store ? `購入先: ${candidate.store}` : "", candidate.price ? `購入候補価格: ¥${candidate.price.toLocaleString("ja-JP")}` : ""].filter(Boolean).join(" / "),
    sourceCandidateId: candidate.id,
    createdAt: now,
    updatedAt: now,
    lastWornAt: null,
  };
  await put("items", closetItem);
  await put("candidates", { ...candidate, status: "purchased", purchasedAt: now, closetItemId: closetItem.id, updatedAt: now });
  [items, purchaseCandidates] = await Promise.all([getAll("items"), getAll("candidates")]);
  renderAll();
  queueCloudSync();
  showToast("購入した服をクローゼットへ追加しました");
}

async function archiveItem(id) {
  const item = items.find((entry) => entry.id === id);
  if (!item) return;
  item.status = "archived";
  item.archivedAt = new Date().toISOString();
  item.updatedAt = item.archivedAt;
  await put("items", item);
  items = await getAll("items");
  renderAll();
  queueCloudSync();
  showToast("削除せず、アーカイブへ移しました");
}

async function restoreItem(id) {
  const item = items.find((entry) => entry.id === id);
  if (!item) return;
  item.status = "ready";
  item.restoredAt = new Date().toISOString();
  item.updatedAt = item.restoredAt;
  await put("items", item);
  items = await getAll("items");
  renderAll();
  queueCloudSync();
  showToast("クローゼットへ戻しました");
}

function itemPhotoMarkup(item, alt = true) {
  if (item.photo) return `<img src="${displayPhotoURL(item.photo)}" alt="${alt ? escapeHTML(item.name) : ""}">`;
  const fill = colorHex[item.color] || "#ddd7ca";
  return `<svg viewBox="0 0 100 100" role="img" aria-label="${escapeHTML(item.name)}" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="${fill.startsWith("#") ? fill : "#b89b83"}"/><path d="M27 28 40 20h20l13 8 12 21-13 8-6-11v38H34V46l-6 11-13-8 12-21Z" fill="rgba(255,255,255,.35)" stroke="rgba(30,30,30,.18)"/></svg>`;
}

async function itemPhotoDataUrl(item) {
  if (!item.photo) throw new Error(`「${item.name}」に写真がありません。服の編集から写真を追加してください`);
  let blob;
  if (item.photo instanceof Blob) {
    blob = item.photo;
  } else if (typeof item.photo === "string" && item.photo.startsWith("data:image/")) {
    return item.photo;
  } else {
    const response = await fetch(item.photo);
    if (!response.ok) throw new Error(`「${item.name}」の写真を読み込めませんでした`);
    blob = await response.blob();
  }

  const bitmap = await loadPhoto(blob);
  const max = 768;
  const ratio = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", .82);
  if (typeof bitmap.close === "function") bitmap.close();
  return dataUrl;
}

function resetLookDialog() {
  if (lookGenerationInProgress) return;
  pendingLook = null;
  $("#look-setup").hidden = false;
  $("#look-loading").hidden = true;
  $("#look-result").hidden = true;
  $("#look-message").textContent = "";
  $("#look-result-image").removeAttribute("src");
  $("#generate-look").hidden = false;
  $("#generate-look").disabled = false;
  $("#generate-look").textContent = "AIイメージを生成";
  const cancel = $('[data-close-look-dialog]', $("#look-dialog .dialog-actions"));
  if (cancel) cancel.textContent = "キャンセル";
}

function openLookDialog(outfitId) {
  if (!window.KinariCloud?.isConfigured()) {
    showToast("着用イメージ生成にはクラウド設定が必要です");
    renderCloudDialog();
    $("#cloud-dialog").showModal();
    return;
  }
  if (!cloudUser) {
    renderCloudDialog();
    $("#cloud-message").textContent = "着用イメージを作るにはログインしてください。";
    $("#cloud-dialog").showModal();
    return;
  }
  const outfit = JSON.parse($("#outfit-results").dataset.outfits || "[]").find((entry) => entry.id === outfitId);
  if (!outfit) return;
  const outfitItems = outfit.itemIds.map((id) => items.find((item) => item.id === id)).filter(Boolean);
  resetLookDialog();
  pendingLook = { ...outfit, items: outfitItems };
  $("#look-reference-list").innerHTML = outfitItems.map((item) => `
    <article class="look-reference"><div>${itemPhotoMarkup(item)}</div><p>${escapeHTML(item.name)}</p></article>
  `).join("");
  $("#look-dialog").showModal();
}

async function generateLookPreview() {
  if (!pendingLook || lookGenerationInProgress) return;
  const button = $("#generate-look");
  const closeButtons = $$('[data-close-look-dialog]', $("#look-dialog"));
  lookGenerationInProgress = true;
  button.disabled = true;
  closeButtons.forEach((node) => { node.disabled = true; });
  $("#look-setup").hidden = true;
  $("#look-loading").hidden = false;
  $("#look-result").hidden = true;
  $("#look-message").textContent = "";

  try {
    const generatedItems = await Promise.all(pendingLook.items.map(async (item) => {
      const profile = getItemProfile(item);
      return {
        id: item.id,
        name: item.name,
        category: item.category,
        color: labels.color[item.color] || item.color,
        silhouette: labels.silhouette[profile.silhouette],
        garmentLength: labels.garmentLength[profile.garmentLength],
        sleeveLength: labels.sleeveLength[profile.sleeveLength],
        thickness: labels.thickness[profile.thickness],
        layerRole: labels.layerRole[profile.layerRole],
        imageDataUrl: await itemPhotoDataUrl(item),
      };
    }));
    const result = await window.KinariCloud.generateLook({
      items: generatedItems,
      conditions: pendingLook.conditions,
    });
    $("#look-result-image").src = result.imageUrl;
    $("#look-result-note").textContent = `本人専用領域へ保存しました。本日はあと${result.remaining}回生成できます。`;
    $("#look-loading").hidden = true;
    $("#look-result").hidden = false;
    button.hidden = true;
    const cancel = $('[data-close-look-dialog]', $("#look-dialog .dialog-actions"));
    if (cancel) cancel.textContent = "閉じる";
    showToast("AI着用イメージを作成しました");
  } catch (error) {
    console.error("着用イメージの生成に失敗しました", error);
    $("#look-loading").hidden = true;
    $("#look-setup").hidden = false;
    $("#look-message").textContent = error.message || "画像を生成できませんでした";
    button.disabled = false;
  } finally {
    lookGenerationInProgress = false;
    closeButtons.forEach((node) => { node.disabled = false; });
  }
}

function renderStats() {
  const actualOnly = Boolean($("#actual-only")?.checked);
  const active = items.filter((item) => item.status !== "archived" && (!actualOnly || !item.isSample));
  const currentMonth = new Date().toISOString().slice(0, 7);
  $("#stat-total").textContent = active.length;
  $("#stat-ready").textContent = active.filter((item) => item.status === "ready").length;
  $("#stat-worn").textContent = feedback.filter((entry) => entry.type === "worn" && entry.createdAt.startsWith(currentMonth)).length;

  const recent = [...active].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4);
  $("#recent-items").innerHTML = recent.length ? recent.map((item) => `<article class="mini-item"><div class="mini-image">${itemPhotoMarkup(item)}</div><p>${escapeHTML(item.name)}</p></article>`).join("") : `<div class="empty-mini">服を登録すると、ここに並びます</div>`;
}

function renderCloset() {
  const search = $("#closet-search").value.trim().toLowerCase();
  const category = $("#category-filter").value;
  const status = $("#status-filter").value;
  const filtered = items.filter((item) => {
    const profile = getItemProfile(item);
    const text = `${item.name} ${labels.color[item.color]} ${labels.pattern[profile.pattern]} ${labels.material[profile.material]} ${labels.silhouette[profile.silhouette]} ${labels.garmentLength[profile.garmentLength]} ${labels.sleeveLength[profile.sleeveLength]} ${labels.thickness[profile.thickness]} ${labels.style[profile.style]} ${item.notes || ""}`.toLowerCase();
    return (!search || text.includes(search)) && (category === "all" || item.category === category) && (status === "all" || item.status === status);
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  $("#closet-grid").innerHTML = filtered.length ? filtered.map((item) => {
    const profile = getItemProfile(item);
    return `
    <article class="closet-card">
      <div class="card-image">${itemPhotoMarkup(item)}<span class="status-pill">${labels.status[item.status]}</span>${item.isSample ? `<span class="sample-pill">サンプル</span>` : ""}</div>
      <div class="card-body">
        <h3>${escapeHTML(item.name)}</h3>
        <p class="card-meta"><span class="color-dot" style="background:${colorHex[item.color]}"></span>${labels.color[item.color]} ・ ${labels.category[item.category]} ・ ${labels.season[item.season]}</p>
        <div class="card-tags"><span>${labels.style[profile.style]}</span><span>${labels.silhouette[profile.silhouette]}</span><span>${labels.garmentLength[profile.garmentLength]}</span><span>${labels.pattern[profile.pattern]}</span></div>
        <div class="card-actions">
          <button data-edit-item="${item.id}">情報を編集</button>
          ${item.status !== "archived" ? `<button data-archive-item="${item.id}">アーカイブ</button>` : `<button data-restore-item="${item.id}">元に戻す</button>`}
        </div>
      </div>
    </article>`;
  }).join("") : `<div class="empty-state"><strong>該当する服がありません</strong><span>条件を変えるか、新しい服を登録してください。</span></div>`;
}

function candidateMeta(candidate) {
  const profile = getItemProfile(candidate);
  const details = [labels.color[candidate.color], labels.category[candidate.category]];
  if (!["shoes", "accessory"].includes(candidate.category)) details.push(labels.silhouette[profile.silhouette]);
  if (candidate.price) details.push(`¥${candidate.price.toLocaleString("ja-JP")}`);
  if (candidate.store) details.push(candidate.store);
  return details.map(escapeHTML).join(" ・ ");
}

function renderCandidateOutfit(outfit, candidateId, index) {
  const companionItems = outfit.items.filter((item) => item.id !== candidateId);
  const roleLabel = index === 0 ? "いちばんおすすめ" : {
    practical: "使いやすさ重視", preference: "あなたらしさ重視", harmony: "まとまり重視", trend: "今季らしさ重視",
  }[outfit.role] || "おすすめ";
  const strongest = Object.entries(outfit.components).sort((a, b) => b[1] - a[1])[0];
  const reasonLabel = { practical: "使いやすさ", preference: "好みとの近さ", harmony: "服同士の相性", trend: "今季らしさ" }[strongest[0]];
  return `
    <article class="candidate-outfit">
      <div class="candidate-outfit-top"><span>LOOK 0${index + 1}・${roleLabel}</span><strong>${outfit.score}</strong></div>
      <div class="candidate-pieces">${companionItems.map((item) => `<div><figure>${itemPhotoMarkup(item)}</figure><p>${escapeHTML(item.name)}</p></div>`).join("")}</div>
      <p class="candidate-outfit-reason">${reasonLabel}を特に高く評価。手持ちの${companionItems.slice(0, 2).map((item) => escapeHTML(item.name)).join("と")}が合わせやすい組み合わせです。</p>
    </article>`;
}

function candidateCompatibility(count) {
  if (count >= 8) return { tone: "high", title: "手持ち服とかなり合わせやすい候補です", detail: `${count}通りの良質な組み合わせが見つかりました。` };
  if (count >= 4) return { tone: "good", title: "手持ち服と合わせやすい候補です", detail: `${count}通りの良質な組み合わせが見つかりました。` };
  if (count >= 1) return { tone: "limited", title: "合うコーデ案は少なめです", detail: `品質基準を満たしたのは${count}通り。購入前に着回しやすさを確認しましょう。` };
  return { tone: "none", title: "相性のよいコーデ案が見つかりません", detail: "無理に案を作らず、今の手持ち服とは合わせにくい候補として表示しています。" };
}

function renderCandidates() {
  const active = purchaseCandidates.filter((candidate) => candidate.status === "active").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const history = purchaseCandidates.filter((candidate) => candidate.status !== "active").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  $("#candidate-count").textContent = `${active.length}点`;
  $("#candidate-list").innerHTML = active.length ? active.map((candidate) => {
    const outfits = candidateOutfits(candidate);
    const compatibility = candidateCompatibility(outfits.length);
    return `
      <article class="candidate-card">
        <div class="candidate-item">
          <div class="candidate-image">${itemPhotoMarkup(candidate)}<span>購入前</span></div>
          <div class="candidate-item-body">
            <p class="eyebrow">SHOPPING CANDIDATE</p>
            <h3>${escapeHTML(candidate.name)}</h3>
            <p class="candidate-meta">${candidateMeta(candidate)}</p>
            <div class="candidate-actions">
              <button class="primary-button" type="button" data-purchase-candidate="${candidate.id}">購入した → 追加</button>
              <button class="secondary-button" type="button" data-archive-candidate="${candidate.id}">今回は見送る</button>
            </div>
          </div>
        </div>
        <div class="candidate-recommendations">
          <div class="candidate-recommendations-heading"><div><p class="eyebrow">WITH MY CLOSET</p><h3>手持ち服と組めるコーデ</h3></div><span>${outfits.length} / 最大${MAX_CANDIDATE_OUTFITS}案</span></div>
          <div class="candidate-fit-signal" data-tone="${compatibility.tone}"><span aria-hidden="true">${outfits.length >= 4 ? "◎" : outfits.length ? "△" : "×"}</span><p><strong>${compatibility.title}</strong><small>${compatibility.detail}</small></p></div>
          ${outfits.length
            ? `<div class="candidate-outfits">${outfits.map((outfit, index) => renderCandidateOutfit(outfit, candidate.id, index)).join("")}</div>`
            : `<div class="candidate-no-outfits"><strong>品質基準を満たす組み合わせはありません</strong><span>手持ちのカテゴリが不足しているか、この候補と実用性・相性のよい案が見つかりませんでした。</span></div>`}
        </div>
      </article>`;
  }).join("") : `
    <button class="candidate-empty" type="button" data-open-candidate-dialog>
      <span aria-hidden="true">◎</span><strong>気になる服を撮ってみる</strong><small>仮登録なので、クローゼットにはまだ追加されません</small>
    </button>`;

  $("#candidate-history-wrap").hidden = history.length === 0;
  $("#candidate-history").innerHTML = history.map((candidate) => `
    <article class="candidate-history-item">
      <div>${itemPhotoMarkup(candidate)}</div>
      <p><strong>${escapeHTML(candidate.name)}</strong><small>${candidate.status === "purchased" ? "購入済み・クローゼットへ追加済み" : "見送り"}</small></p>
      ${candidate.status === "archived" ? `<button class="text-button" type="button" data-reopen-candidate="${candidate.id}">もう一度検討</button>` : `<span class="soft-badge">追加済み</span>`}
    </article>`).join("");
}

function desiredWarmth(temp) {
  if (temp <= 7) return 5;
  if (temp <= 14) return 4;
  if (temp <= 23) return 3;
  if (temp <= 29) return 2;
  return 1;
}

function targetFormality(occasion) {
  return { active: 1.8, daily: 2.4, work: 3.8, special: 4.1 }[occasion];
}

function seasonForTemperature(temp) {
  if (temp <= 12) return "winter";
  if (temp <= 20) return "autumn";
  if (temp <= 27) return "spring";
  return "summer";
}

function combinations(groups) {
  return groups.reduce((acc, group) => acc.flatMap((set) => group.map((item) => [...set, item])), [[]]);
}

function decisionWeights(preferenceBalance = 67) {
  const preference = 15 + Math.round(clamp(preferenceBalance) * .3);
  return { practical: 40, preference, harmony: 15, trend: 45 - preference };
}

function practicalScore(set, conditions) {
  const wearable = set.filter((item) => item.category !== "accessory");
  const wantedWarmth = desiredWarmth(conditions.temperature);
  const wantedFormality = targetFormality(conditions.occasion);
  const wantedSeason = seasonForTemperature(conditions.temperature);
  const recentLimit = Date.now() - 7 * 86400000;
  const avgWarmth = wearable.reduce((sum, item) => sum + Number(item.warmth), 0) / Math.max(1, wearable.length);
  const avgFormality = wearable.reduce((sum, item) => sum + Number(item.formality), 0) / Math.max(1, wearable.length);
  let score = 100;
  score -= Math.abs(avgWarmth - wantedWarmth) * 14;
  score -= Math.abs(upperBodyWarmth(set) - wantedWarmth) * 9;
  score -= Math.abs(avgFormality - wantedFormality) * 12;
  score -= wearable.filter((item) => item.season !== "all" && item.season !== wantedSeason).length * 10;
  if (conditions.weather === "rain" && set.some((item) => /撥水|防水/.test(item.notes || ""))) score += 8;
  if (conditions.weather === "rain" && set.some((item) => /雨.{0,4}(避け|苦手)|濡れ/.test(item.notes || ""))) score -= 18;
  if (conditions.occasion === "active" && set.some((item) => item.category === "shoes" && Number(item.formality) <= 2)) score += 8;
  if (conditions.avoidRecent && set.some((item) => item.lastWornAt && new Date(item.lastWornAt).getTime() > recentLimit)) score -= 18;
  const base = set.find((item) => item.category === "tops" || item.category === "onepiece");
  const baseProfile = base ? getItemProfile(base) : null;
  if (conditions.temperature >= 28 && baseProfile?.thickness === "heavy") score -= 24;
  if (conditions.temperature <= 14 && baseProfile?.thickness === "light" && !set.some((item) => item.category === "outer")) score -= 24;
  return Math.round(clamp(score));
}

function harmonyScore(set, conditions) {
  const neutrals = new Set(["white", "black", "gray", "navy", "beige", "brown"]);
  const uniqueColors = [...new Set(set.map((item) => item.color))];
  const accents = uniqueColors.filter((color) => !neutrals.has(color));
  const profiles = set.map(getItemProfile);
  const patterned = profiles.filter((profile) => profile.pattern !== "solid").length;
  const styles = new Set(profiles.map((profile) => profile.style));
  const targetStyles = {
    relaxed: new Set(["casual", "natural", "sporty"]),
    clean: new Set(["clean", "classic", "minimal"]),
    minimal: new Set(["minimal", "clean", "classic"]),
    adventure: new Set(["trendy", "casual"]),
  }[conditions.mood];
  let score = 55;
  score += uniqueColors.length <= 3 ? 12 : -12;
  score += accents.length <= 1 ? 8 : -8;
  score += patterned <= 1 ? 8 : -12;
  score += styles.size <= 2 ? 7 : -5;
  score += profiles.some((profile) => targetStyles.has(profile.style)) ? 10 : 0;
  if (conditions.mood === "minimal" && uniqueColors.every((color) => neutrals.has(color))) score += 8;
  if (conditions.mood === "adventure" && profiles.some((profile) => profile.statement >= 4)) score += 8;

  const top = set.find((item) => item.category === "tops");
  const bottom = set.find((item) => item.category === "bottoms");
  if (top && bottom) {
    const topProfile = getItemProfile(top);
    const bottomProfile = getItemProfile(bottom);
    if (["slim", "regular"].includes(topProfile.silhouette) && ["wide", "flare"].includes(bottomProfile.silhouette)) score += 9;
    if (["relaxed", "oversized"].includes(topProfile.silhouette) && ["skinny", "slim", "straight", "tapered"].includes(bottomProfile.silhouette)) score += 7;
    if (["relaxed", "oversized"].includes(topProfile.silhouette) && ["wide", "flare"].includes(bottomProfile.silhouette)) {
      score += topProfile.garmentLength === "cropped" ? 4 : -7;
    }
    if (topProfile.garmentLength === "long" && ["wide", "flare"].includes(bottomProfile.silhouette)) score -= 5;
    if (topProfile.layerRole === "inner" && !set.some((item) => item.category === "outer")) score -= 14;
  }
  const outer = set.find((item) => item.category === "outer");
  if (top && outer) {
    const topProfile = getItemProfile(top);
    const outerProfile = getItemProfile(outer);
    if (outerProfile.silhouette === "slim" && ["relaxed", "oversized"].includes(topProfile.silhouette)) score -= 10;
    if (["relaxed", "oversized"].includes(outerProfile.silhouette) && ["regular", "relaxed"].includes(topProfile.silhouette)) score += 4;
  }
  return Math.round(clamp(score));
}

function feedbackContextWeight(entry, conditions) {
  if (!conditions || !entry.conditions) return 1;
  let weight = .65;
  if (entry.conditions.occasion === conditions.occasion) weight += .15;
  if (entry.conditions.mood === conditions.mood) weight += .15;
  if (Math.abs(Number(entry.conditions.temperature) - Number(conditions.temperature)) <= 6) weight += .05;
  return clamp(weight, .65, 1);
}

function feedbackRecencyWeight(entry) {
  const createdAt = new Date(entry.createdAt).getTime();
  if (!Number.isFinite(createdAt)) return .5;
  const ageDays = Math.max(0, (Date.now() - createdAt) / 86400000);
  return Math.pow(.5, ageDays / PREFERENCE_HALF_LIFE_DAYS);
}

function buildPreferenceModel(conditions = null) {
  const itemWeights = new Map();
  const featureWeights = new Map();
  const pairWeights = new Map();
  const effects = { like: { item: 4, feature: 2 }, worn: { item: 3, feature: 1.25 }, dislike: { item: -7, feature: -2.5 } };
  let effectiveFeedback = 0;

  feedback.forEach((entry) => {
    const effect = effects[entry.type];
    if (!effect) return;
    const evidenceWeight = feedbackRecencyWeight(entry) * feedbackContextWeight(entry, conditions);
    effectiveFeedback += evidenceWeight;
    (entry.itemIds || []).forEach((id) => {
      itemWeights.set(id, (itemWeights.get(id) || 0) + effect.item * evidenceWeight);
      const item = items.find((candidate) => candidate.id === id);
      if (!item) return;
      feedbackProfileKeys(item, entry.reason).forEach((key) => featureWeights.set(key, (featureWeights.get(key) || 0) + effect.feature * evidenceWeight));
    });
    const entryItems = (entry.itemIds || []).map((id) => items.find((item) => item.id === id)).filter(Boolean);
    if (!entry.reason || entry.reason === "combination") {
      itemPairKeys(entryItems).forEach((key) => pairWeights.set(key, (pairWeights.get(key) || 0) + effect.feature * 1.35 * evidenceWeight));
    }
  });
  const confidence = effectiveFeedback ? clamp(.3 + effectiveFeedback / 8, .3, 1) : 0;
  return { itemWeights, featureWeights, pairWeights, effectiveFeedback, confidence };
}

function preferenceScore(set, model) {
  if (!model.effectiveFeedback) return 50;
  const learnedValue = set.reduce((sum, item) => {
    const direct = model.itemWeights.get(item.id) || 0;
    const features = profileKeys(item).reduce((featureSum, key) => featureSum + (model.featureWeights.get(key) || 0), 0);
    return sum + direct + features;
  }, 0) / Math.max(1, set.length);
  const pairValue = itemPairKeys(set).reduce((sum, key) => sum + (model.pairWeights.get(key) || 0), 0) / Math.max(1, set.length - 1);
  return Math.round(clamp(50 + (learnedValue * 1.25 + pairValue) * model.confidence));
}

function trendScore(set) {
  const profiles = set.map(getItemProfile);
  const matches = set.reduce((sum, item, index) => {
    const profile = profiles[index];
    return sum
      + (trendProfile.colors.includes(item.color) ? 1 : 0)
      + (trendProfile.patterns.includes(profile.pattern) ? 1 : 0)
      + (trendProfile.materials.includes(profile.material) ? 1 : 0)
      + (trendProfile.silhouettes.includes(profile.silhouette) ? 1 : 0)
      + (trendProfile.styles.includes(profile.style) ? 1 : 0);
  }, 0);
  const possible = Math.max(1, set.length * 5);
  let score = 35 + (matches / possible) * 55;
  const hasClassic = profiles.some((profile) => ["classic", "minimal", "clean"].includes(profile.style));
  const hasExpression = profiles.some((profile) => profile.style === "trendy" || profile.statement >= 4);
  if (hasClassic && hasExpression) score += 10;
  const freshAdjustedScore = 50 + (score - 50) * trendFreshness.factor;
  return Math.round(clamp(freshAdjustedScore));
}

function isStructurallyCompleteOutfit(set) {
  const categories = new Set(set.map((item) => item.category));
  return categories.has("onepiece") || (categories.has("tops") && categories.has("bottoms"));
}

function upperBodyWarmth(set) {
  const base = set.find((item) => item.category === "tops" || item.category === "onepiece");
  const outer = set.find((item) => item.category === "outer");
  return Number(base?.warmth || 0) + Number(outer?.warmth || 0) * .55;
}

function isTemperatureSuitableOutfit(set, conditions) {
  if (!isStructurallyCompleteOutfit(set)) return false;
  const hasOuter = set.some((item) => item.category === "outer");
  const base = set.find((item) => item.category === "tops" || item.category === "onepiece");
  const baseWarmth = Number(base?.warmth || 0);
  const baseProfile = base ? getItemProfile(base) : null;
  if (conditions.temperature <= 7 && !hasOuter) return false;
  if (conditions.temperature <= 14 && !hasOuter && baseWarmth < 4) return false;
  if (conditions.temperature <= 20 && !hasOuter && baseWarmth < 3) return false;
  if (conditions.temperature <= 20 && !hasOuter && ["sleeveless", "short"].includes(baseProfile?.sleeveLength)) return false;
  if (conditions.temperature <= 14 && !hasOuter && baseProfile?.thickness === "light") return false;
  if (conditions.temperature >= 28 && baseProfile?.thickness === "heavy") return false;
  if (conditions.temperature >= 28 && hasOuter && conditions.weather !== "rain") return false;
  return true;
}

function generateCandidates(conditions, sourceItems = items) {
  const ready = sourceItems.filter((item) => item.status === "ready" && (!conditions.actualOnly || !item.isSample));
  const group = (category) => ready.filter((item) => item.category === category);
  const bases = [];
  if (group("tops").length && group("bottoms").length) bases.push(...combinations([group("tops"), group("bottoms")]));
  if (group("onepiece").length) bases.push(...group("onepiece").map((item) => [item]));
  const optional = (base, category, shouldInclude, includeNone = false) => {
    const choices = group(category);
    if (!choices.length || !shouldInclude) return [base];
    const withItems = choices.map((item) => [...base, item]);
    return includeNone ? [base, ...withItems] : withItems;
  };
  const rankedCandidates = [];
  for (const base of bases) {
    const withOuter = optional(base, "outer", conditions.temperature <= 20 || conditions.weather === "rain");
    for (const set of withOuter) {
      const withShoes = optional(set, "shoes", true);
      for (const dressed of withShoes) rankedCandidates.push(...optional(dressed, "accessory", true, true));
    }
  }
  const eligibleCandidates = rankedCandidates.filter((set) => isTemperatureSuitableOutfit(set, conditions));
  if (!eligibleCandidates.length) return [];

  const model = buildPreferenceModel(conditions);
  const weights = decisionWeights(conditions.preferenceBalance);

  return eligibleCandidates.map((set) => {
    const components = {
      practical: practicalScore(set, conditions),
      preference: preferenceScore(set, model),
      harmony: harmonyScore(set, conditions),
      trend: trendScore(set),
    };
    const score = Object.entries(weights).reduce((sum, [key, weight]) => sum + components[key] * weight / 100, 0);
    return { id: set.map((item) => item.id).join("-"), items: set, score: Math.round(clamp(score, 40, 98)), components, weights, conditions };
  }).sort((a, b) => b.score - a.score);
}

function preferenceSnapshot(conditions) {
  const model = buildPreferenceModel(conditions);
  const featureEntries = [...model.featureWeights.entries()];
  const itemEntries = [...model.itemWeights.entries()];
  const strongest = (entries, direction, limit) => entries
    .filter(([, value]) => direction * value > 0)
    .sort((first, second) => direction * (second[1] - first[1]))
    .slice(0, limit)
    .map(([key, value]) => ({ key, weight: Math.round(value * 100) / 100 }));
  return {
    effectiveFeedback: Math.round(model.effectiveFeedback * 100) / 100,
    confidence: Math.round(model.confidence * 100) / 100,
    favoredFeatures: strongest(featureEntries, 1, 8),
    avoidedFeatures: strongest(featureEntries, -1, 8),
    favoredItemIds: strongest(itemEntries, 1, 6),
    avoidedItemIds: strongest(itemEntries, -1, 6),
  };
}

function aiCandidatePayload(candidate) {
  return {
    id: candidate.id,
    ruleScore: candidate.score,
    components: candidate.components,
    items: candidate.items.map((item) => {
      const profile = getItemProfile(item);
      return {
        id: item.id,
        name: item.name,
        category: item.category,
        color: item.color,
        pattern: profile.pattern,
        material: profile.material,
        silhouette: profile.silhouette,
        garmentLength: profile.garmentLength,
        sleeveLength: profile.sleeveLength,
        thickness: profile.thickness,
        layerRole: profile.layerRole,
        style: profile.style,
      };
    }),
  };
}

function aiCandidatePool(candidates, limit = MAX_AI_RANKING_CANDIDATES) {
  const selected = [];
  const ids = new Set();
  const add = (candidate) => {
    if (!candidate || ids.has(candidate.id) || selected.length >= limit) return;
    ids.add(candidate.id);
    selected.push(candidate);
  };
  candidates.slice(0, 5).forEach(add);
  ["practical", "preference", "harmony", "trend"].forEach((key) => {
    [...candidates].sort((first, second) => second.components[key] - first.components[key]).slice(0, 3).forEach(add);
  });
  candidates.forEach(add);
  return selected;
}

function applyAIRanking(candidates, ranking) {
  if (!ranking || !["jev", "claude"].includes(ranking.mode) || !ranking.scores) return candidates;
  return candidates.map((candidate) => {
    const aiScore = Number(ranking.scores[candidate.id]);
    if (!Number.isFinite(aiScore)) return candidate;
    const blendedScore = candidate.score * (1 - AI_RANKING_WEIGHT) + clamp(aiScore) * AI_RANKING_WEIGHT;
    return { ...candidate, ruleScore: candidate.score, aiScore: Math.round(clamp(aiScore)), aiMode: ranking.mode, score: Math.round(clamp(blendedScore, 40, 98)) };
  }).sort((first, second) => second.score - first.score);
}

async function rankOutfitsWithOptionalAI(candidates, conditions) {
  if (!candidates.length || !cloudUser || !window.KinariCloud?.rankOutfits) {
    return { candidates, meta: { mode: "rules", summary: "端末内のルールと好み学習で判定" } };
  }
  const pool = aiCandidatePool(candidates);
  const ranking = await window.KinariCloud.rankOutfits({
    candidates: pool.map(aiCandidatePayload),
    conditions,
    preferenceSnapshot: preferenceSnapshot(conditions),
  });
  const mode = ranking?.mode || "rules";
  return {
    candidates: ["jev", "claude"].includes(mode) ? applyAIRanking(pool, ranking) : candidates,
    meta: {
      mode,
      confidence: Number(ranking?.confidence),
      summary: ranking?.summary || "ルール判定を使用しました",
      feedbackCount: Number(ranking?.feedbackCount || 0),
      profileUpdated: Boolean(ranking?.profileUpdated),
    },
  };
}

function isTooSimilar(candidate, selected) {
  const signature = candidate.items.map((item) => item.id);
  return selected.some((picked) => {
    const overlap = signature.filter((id) => picked.items.some((item) => item.id === id)).length;
    return overlap >= Math.min(signature.length, picked.items.length) - 1;
  });
}

function selectDiverse(candidates) {
  if (!candidates.length) return [];
  const selected = [];
  const selectedIds = new Set();
  const choose = (role, scoreForRole, minimumPractical = 45) => {
    const pool = candidates
      .filter((candidate) => !selectedIds.has(candidate.id) && candidate.components.practical >= minimumPractical)
      .sort((a, b) => scoreForRole(b) - scoreForRole(a));
    const candidate = selected.length ? pool.find((option) => !isTooSimilar(option, selected)) : pool[0];
    if (candidate) {
      selected.push({ ...candidate, role });
      selectedIds.add(candidate.id);
    }
  };

  const averageStatement = (candidate) => candidate.items.reduce((sum, item) => sum + getItemProfile(item).statement, 0) / candidate.items.length;
  const hasClassicStyle = (candidate) => candidate.items.some((item) => ["classic", "clean", "minimal"].includes(getItemProfile(item).style));
  choose("classic", (candidate) => candidate.components.practical * .42 + candidate.components.harmony * .38 + candidate.score * .2 + (hasClassicStyle(candidate) ? 5 : 0) - averageStatement(candidate) * 1.5, 50);
  choose(
    "personal",
    (candidate) => feedback.length
      ? candidate.components.preference * .65 + candidate.score * .25 + candidate.components.harmony * .1
      : candidate.components.harmony * .65 + candidate.score * .35,
  );
  choose("trend", (candidate) => candidate.components.trend * .7 + candidate.score * .3, 55);
  choose("adventure", (candidate) => candidate.components.trend * .35 + candidate.components.harmony * .25 + candidate.score * .2 + averageStatement(candidate) * 7, 48);
  return selected;
}

function outfitSimilarity(first, second) {
  const firstIds = new Set(first.items.map((item) => item.id));
  const secondIds = new Set(second.items.map((item) => item.id));
  const overlap = [...firstIds].filter((id) => secondIds.has(id)).length;
  return overlap / Math.max(1, new Set([...firstIds, ...secondIds]).size);
}

function selectQualityCandidateOutfits(candidates, limit = MAX_CANDIDATE_OUTFITS) {
  const remaining = candidates.filter((outfit) => (
    outfit.score >= CANDIDATE_QUALITY.score
    && outfit.components.practical >= CANDIDATE_QUALITY.practical
    && outfit.components.harmony >= CANDIDATE_QUALITY.harmony
  ));
  const selected = [];
  while (remaining.length && selected.length < limit) {
    remaining.sort((first, second) => {
      const firstSimilarity = selected.length ? Math.max(...selected.map((picked) => outfitSimilarity(first, picked))) : 0;
      const secondSimilarity = selected.length ? Math.max(...selected.map((picked) => outfitSimilarity(second, picked))) : 0;
      return (second.score - secondSimilarity * 12) - (first.score - firstSimilarity * 12);
    });
    const next = remaining.shift();
    const strongestComponent = Object.entries(next.components).sort((a, b) => b[1] - a[1])[0][0];
    selected.push({ ...next, role: strongestComponent });
  }
  return selected;
}

function candidateOutfits(candidate) {
  const settings = readStylistSettings();
  const conditions = {
    temperature: candidate.category === "outer" ? 16 : 22,
    weather: "sunny",
    occasion: "daily",
    mood: "relaxed",
    avoidRecent: false,
    actualOnly: typeof settings.actualOnly === "boolean" ? settings.actualOnly : Boolean($("#actual-only")?.checked),
    preferenceBalance: Number.isFinite(Number(settings.preferenceBalance)) ? Number(settings.preferenceBalance) : 67,
  };
  const previewItem = { ...candidate, status: "ready", isPurchaseCandidate: true };
  const sourceItems = [...items.filter((item) => item.status === "ready"), previewItem];
  const matching = generateCandidates(conditions, sourceItems).filter((outfit) => outfit.items.some((item) => item.id === candidate.id));
  return selectQualityCandidateOutfits(matching);
}

function outfitReason(outfit) {
  const { conditions, items: set, components } = outfit;
  const names = set.map((item) => item.name);
  const strongest = Object.entries(components).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([key]) => ({
    practical: "気温・予定への実用性",
    preference: feedback.length ? "これまでの好み" : "これから学習する好み",
    harmony: "色・柄・シルエットのまとまり",
    trend: `${trendProfile.season}の要素`,
  }[key]));
  const lead = {
    classic: "実用性とまとまりを優先した、取り入れやすい定番案です。",
    personal: feedback.length
      ? "これまでの評価に近い、自分らしさを優先した案です。"
      : "好みを学習する起点として、まとまりのよさを優先した案です。",
    harmony: "好みの学習前でも取り入れやすい、まとまり重視の案です。",
    trend: trendFreshness.factor >= .75
      ? `${trendProfile.season}の要素を、無理なく試せる案です。`
      : "トレンド情報の鮮度を考慮し、控えめに新鮮さを加えた案です。",
    adventure: "まとまりを保ちながら、色・柄・シルエットに少し変化を加えた案です。",
  }[outfit.role] || "条件に合わせて選んだ案です。";
  return `${lead} ${names.slice(0, 2).join("と")}を軸に、${strongest.join("と")}を評価しました。`;
}

function rankingLabel(meta = {}) {
  if (meta.pending) return "ルール判定・AI確認中";
  if (meta.mode === "claude") return "ルール＋Jev＋Claude";
  if (meta.mode === "jev") return "ルール＋Jev";
  return "ルール判定";
}

function renderOutfits(outfits, conditions, rankingMeta = { mode: "rules" }) {
  $("#outfit-empty").hidden = true;
  const results = $("#outfit-results");
  results.hidden = false;
  if (!outfits.length) {
    const sampleOption = conditions.actualOnly && items.some((item) => item.isSample && item.status === "ready")
      ? `<button class="secondary-button" type="button" data-include-samples>サンプルを含めて試す</button>` : "";
    results.innerHTML = `<div class="empty-results"><span class="sparkle">!</span><h2>組み合わせを作るには服が足りません</h2><p>${conditions.actualOnly ? "実物だけで" : "着用可能な服から"}「トップス＋ボトムス」または「ワンピース」と、靴を登録してください。</p><div class="empty-result-actions"><button class="primary-button" data-open-item-form>服を登録する</button>${sampleOption}</div></div>`;
    results.dataset.outfits = "[]";
    return;
  }
  results.innerHTML = `
    <div class="result-header"><div><p class="eyebrow">${conditions.temperature}℃・${labels.occasion[conditions.occasion]}</p><h2>今日の${outfits.length}つの提案</h2></div><div class="result-badges"><span class="soft-badge">${conditions.actualOnly ? "実物のみ" : "サンプルを含む"}</span><span class="soft-badge ranking-badge" data-mode="${escapeHTML(rankingMeta.mode || "rules")}">${escapeHTML(rankingLabel(rankingMeta))}</span></div></div>
    <p class="ranking-summary">${escapeHTML(rankingMeta.summary || "既存ルールを土台に判定しています")}${rankingMeta.profileUpdated ? " 好みプロフィールも更新しました。" : ""}</p>
    <div class="outfit-list">${outfits.map((outfit, index) => `
      <article class="outfit-card">
        <div class="outfit-top"><div><span class="outfit-number">LOOK 0${index + 1}</span><h3>${({ classic: "定番・迷わない", personal: "自分好み", harmony: "自分好みを育てる", trend: "トレンド", adventure: "少し冒険" })[outfit.role] || "別の提案"}</h3></div><span class="score-ring">${outfit.score}</span></div>
        <div class="outfit-items">${outfit.items.map((item) => `<div class="outfit-piece"><div>${itemPhotoMarkup(item)}</div><p>${escapeHTML(item.name)}</p></div>`).join("")}</div>
        <div class="score-breakdown" aria-label="評価の内訳">
          <span><small>実用性</small><strong>${outfit.components.practical}</strong></span>
          <span><small>あなたの好み</small><strong>${outfit.components.preference}</strong></span>
          <span><small>服同士の相性</small><strong>${outfit.components.harmony}</strong></span>
          <span><small>今季らしさ</small><strong>${outfit.components.trend}</strong></span>
        </div>
        ${Number.isFinite(outfit.aiScore) ? `<p class="ai-score-note">${outfit.aiMode === "claude" ? "Claude" : "Jev"}補正 ${outfit.aiScore}点・ルール総合 ${outfit.ruleScore}点</p>` : ""}
        <p class="outfit-reason">${escapeHTML(outfitReason(outfit))}</p>
        <div class="outfit-actions">
          <button class="secondary-button look-button" type="button" data-generate-look="${outfit.id}"><span aria-hidden="true">✦</span>この服で着用イメージを作る</button>
          <div class="feedback-row" data-outfit-id="${outfit.id}"><span>理由も選ぶと、好みをより正確に学習します</span><button data-feedback="like">♡ 好き</button><button data-feedback="dislike">合わない</button><button data-feedback="worn">着た</button></div>
          <div class="feedback-reasons" data-feedback-reasons="${outfit.id}" hidden></div>
        </div>
      </article>`).join("")}</div>`;
  results.dataset.outfits = JSON.stringify(outfits.map((outfit) => ({ id: outfit.id, itemIds: outfit.items.map((item) => item.id), conditions })));
}

function showFeedbackReasons(button) {
  const row = button.closest(".feedback-row");
  const type = button.dataset.feedback;
  const panel = row.parentElement.querySelector(".feedback-reasons");
  row.dataset.pendingFeedback = type;
  $$('[data-feedback]', row).forEach((node) => node.classList.toggle("is-selected", node === button));
  panel.hidden = false;
  panel.innerHTML = `<span>${type === "like" ? "どこが好き？" : "どこが合わない？"}</span>${FEEDBACK_REASONS[type].map(([value, label]) => `<button type="button" data-feedback-reason="${value}">${label}</button>`).join("")}<button class="reason-skip" type="button" data-feedback-reason="">理由なし</button>`;
}

async function saveFeedback(button, reason = null) {
  const row = button.closest(".outfit-actions").querySelector(".feedback-row");
  const outfitData = JSON.parse($("#outfit-results").dataset.outfits || "[]").find((outfit) => outfit.id === row.dataset.outfitId);
  if (!outfitData) return;
  const type = button.dataset.feedback || row.dataset.pendingFeedback;
  const entry = { id: createId(), type, reason: reason || null, itemIds: outfitData.itemIds, conditions: outfitData.conditions, createdAt: new Date().toISOString() };
  await put("feedback", entry);
  feedback.push(entry);
  if (entry.type === "worn") {
    for (const id of entry.itemIds) {
      const item = items.find((candidate) => candidate.id === id);
      if (item) { item.lastWornAt = entry.createdAt; item.updatedAt = entry.createdAt; await put("items", item); }
    }
  }
  $$('[data-feedback]', row).forEach((node) => node.classList.toggle("is-selected", node.dataset.feedback === type));
  const reasonPanel = row.parentElement.querySelector(".feedback-reasons");
  reasonPanel.hidden = true;
  reasonPanel.innerHTML = "";
  delete row.dataset.pendingFeedback;
  renderStats();
  renderLearningSummary();
  queueCloudSync();
  showToast(entry.type === "worn" ? "着用履歴に記録しました" : reason ? "理由と一緒に好みを学習しました" : "好みとして学習しました");
}

function featureLabel(key) {
  const [kind, value] = key.split(":");
  return labels[kind]?.[value] || labels.color[value] || value;
}

function renderLearningSummary() {
  const summary = $("#learning-summary");
  if (!summary) return;
  if (!feedback.length) {
    summary.innerHTML = `<strong>好みはまだ学習前です</strong><span>提案に「好き・合わない・着た」を付けると、次回から色・柄・形へ反映します。</span>`;
    return;
  }
  const model = buildPreferenceModel();
  const rankedFeatures = [...model.featureWeights.entries()].sort((a, b) => b[1] - a[1]);
  const favorites = rankedFeatures.filter(([, value]) => value > 0).slice(0, 3).map(([key]) => featureLabel(key));
  const avoided = rankedFeatures.filter(([, value]) => value < 0).slice(-2).reverse().map(([key]) => featureLabel(key));
  const confidenceLabel = model.confidence >= .8 ? "高" : model.confidence >= .5 ? "中" : "学習中";
  const tendency = favorites.length ? `好き：${favorites.map(escapeHTML).join("・")}` : "好きな傾向を確認中";
  const avoidedText = avoided.length ? ` / 控えめ：${avoided.map(escapeHTML).join("・")}` : "";
  summary.innerHTML = `<strong>${feedback.length}回の評価を学習中（確度：${confidenceLabel}）</strong><span>${tendency}${avoidedText}</span>`;
}

function renderTrendCard() {
  $("#trend-season").textContent = trendProfile.season;
  $("#trend-title").textContent = trendProfile.title;
  $("#trend-tags").innerHTML = trendProfile.tags.map((tag) => `<span>${escapeHTML(tag)}</span>`).join("");
  const ageText = trendFreshness.ageDays === null ? "" : `・${trendFreshness.ageDays}日前`;
  $("#trend-updated").textContent = `${trendFreshness.label} ${trendProfile.updatedAt}${ageText}`;
  const source = $("#trend-source");
  source.textContent = trendProfile.sourceLabel;
  if (/^https:\/\//.test(trendProfile.sourceUrl || "")) source.href = trendProfile.sourceUrl;
}

function updateWeightOutput() {
  const balance = Number($("#preference-balance").value);
  const weights = decisionWeights(balance);
  $("#balance-output").value = `好み ${weights.preference}% / 流行 ${weights.trend}%`;
  $("#weight-practical").textContent = `${weights.practical}%`;
  $("#weight-preference").textContent = `${weights.preference}%`;
  $("#weight-harmony").textContent = `${weights.harmony}%`;
  $("#weight-trend").textContent = `${weights.trend}%`;
}

function renderAll() {
  renderStats();
  renderCloset();
  renderCandidates();
  renderLearningSummary();
  renderTrendCard();
  updateWeightOutput();
}

function bindEvents() {
  $$(".nav-item").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  $$('[data-view-link]').forEach((button) => button.addEventListener("click", () => switchView(button.dataset.viewLink)));
  document.addEventListener("click", (event) => {
    const opener = event.target.closest("[data-open-item-form]");
    const edit = event.target.closest("[data-edit-item]");
    const archive = event.target.closest("[data-archive-item]");
    const restore = event.target.closest("[data-restore-item]");
    const restoreSamples = event.target.closest("[data-restore-samples]");
    const openBatchPicker = event.target.closest("[data-open-batch-picker]");
    const closeBatch = event.target.closest("[data-close-batch-dialog]");
    const removeBatchItem = event.target.closest("[data-remove-batch-item]");
    const rating = event.target.closest("[data-feedback]");
    const feedbackReason = event.target.closest("[data-feedback-reason]");
    const includeSamples = event.target.closest("[data-include-samples]");
    const closeDialog = event.target.closest("[data-close-item-dialog]");
    const openCloud = event.target.closest("[data-open-cloud-dialog]");
    const closeCloud = event.target.closest("[data-close-cloud-dialog]");
    const generateLook = event.target.closest("[data-generate-look]");
    const closeLook = event.target.closest("[data-close-look-dialog]");
    const openCandidate = event.target.closest("[data-open-candidate-dialog]");
    const closeCandidate = event.target.closest("[data-close-candidate-dialog]");
    const purchase = event.target.closest("[data-purchase-candidate]");
    const archiveCandidateButton = event.target.closest("[data-archive-candidate]");
    const reopenCandidateButton = event.target.closest("[data-reopen-candidate]");
    if (opener) openItemDialog();
    if (edit) openItemDialog(items.find((item) => item.id === edit.dataset.editItem));
    if (archive) archiveItem(archive.dataset.archiveItem);
    if (restore) restoreItem(restore.dataset.restoreItem);
    if (restoreSamples) restoreSampleItems();
    if (openBatchPicker) $("#batch-photo-picker").click();
    if (closeBatch && !batchProcessing) $("#batch-dialog").close();
    if (removeBatchItem && !batchProcessing) {
      const draft = batchDrafts.find((entry) => entry.id === removeBatchItem.dataset.removeBatchItem);
      revokePhotoURL(draft?.photoUrl);
      batchDrafts = batchDrafts.filter((entry) => entry.id !== removeBatchItem.dataset.removeBatchItem);
      renderBatchRegister();
    }
    if (rating) {
      if (rating.dataset.feedback === "worn") saveFeedback(rating);
      else showFeedbackReasons(rating);
    }
    if (feedbackReason) saveFeedback(feedbackReason, feedbackReason.dataset.feedbackReason || null);
    if (includeSamples) {
      $("#actual-only").checked = false;
      updateActualOnlyHint();
      saveStylistSettings();
      renderStats();
      renderCandidates();
      $("#condition-form").requestSubmit();
    }
    if (closeDialog) $("#item-dialog").close();
    if (openCloud) { renderCloudDialog(); $("#cloud-dialog").showModal(); }
    if (closeCloud) $("#cloud-dialog").close();
    if (generateLook) openLookDialog(generateLook.dataset.generateLook);
    if (closeLook && !lookGenerationInProgress) $("#look-dialog").close();
    if (openCandidate) openCandidateDialog();
    if (closeCandidate) $("#candidate-dialog").close();
    if (purchase) purchaseCandidate(purchase.dataset.purchaseCandidate);
    if (archiveCandidateButton) archiveCandidate(archiveCandidateButton.dataset.archiveCandidate);
    if (reopenCandidateButton) reopenCandidate(reopenCandidateButton.dataset.reopenCandidate);
  });
  $("#mobile-menu").addEventListener("click", () => $(".sidebar").classList.toggle("is-open"));
  $("#closet-search").addEventListener("input", renderCloset);
  $("#category-filter").addEventListener("change", renderCloset);
  $("#status-filter").addEventListener("change", renderCloset);
  $("#temperature").addEventListener("input", (event) => $("#temperature-output").value = `${event.target.value}℃`);
  $("#preference-balance").addEventListener("input", updateWeightOutput);
  $("#preference-balance").addEventListener("change", saveStylistSettings);
  $("#avoid-recent").addEventListener("change", saveStylistSettings);
  $("#actual-only").addEventListener("change", () => {
    updateActualOnlyHint();
    saveStylistSettings();
    renderStats();
    renderCandidates();
  });
  $("#cloud-sign-in").addEventListener("click", () => handleCloudAuth("signin"));
  $("#cloud-sign-up").addEventListener("click", () => handleCloudAuth("signup"));
  $("#cloud-sync-now").addEventListener("click", () => syncCloudData({ announce: true }));
  $("#cloud-sign-out").addEventListener("click", async () => {
    try {
      await window.KinariCloud.signOut();
      cloudUser = null;
      renderCloudDialog();
      showToast("ログアウトしました。端末内のデータは残っています");
    } catch (error) {
      showToast(error.message);
    }
  });
  ["#candidate-camera-photo", "#candidate-photo"].forEach((selector) => {
    $(selector).addEventListener("change", (event) => loadCandidatePhoto(event.target.files[0]));
  });
  ["#candidate-category", "#candidate-color"].forEach((selector) => {
    $(selector).addEventListener("change", () => applyQuickCandidateInference());
  });
  ["#candidate-silhouette", "#candidate-garment-length", "#candidate-sleeve-length", "#candidate-thickness", "#candidate-layer-role"].forEach((selector) => {
    $(selector).addEventListener("change", updateCandidateAnalysisSummary);
  });
  $("#candidate-name").addEventListener("input", () => {
    if ($("#candidate-name").value !== lastSuggestedCandidateName) lastSuggestedCandidateName = "";
    updateCandidateAnalysisSummary();
  });
  $("#candidate-form").addEventListener("submit", saveCandidate);
  $("#candidate-dialog").addEventListener("close", resetCandidateForm);
  $("#batch-photo-picker").addEventListener("change", (event) => {
    const files = [...event.target.files];
    if (files.length) openBatchRegister(files);
  });
  $("#batch-add-photo").addEventListener("change", (event) => {
    const files = [...event.target.files];
    event.target.value = "";
    if (files.length) addBatchFiles(files);
  });
  $("#batch-register-list").addEventListener("input", updateBatchDraft);
  $("#batch-register-list").addEventListener("change", updateBatchDraft);
  $("#batch-form").addEventListener("submit", saveBatchItems);
  $("#batch-dialog").addEventListener("close", clearBatchRegister);
  $("#batch-dialog").addEventListener("cancel", (event) => {
    if (batchProcessing) event.preventDefault();
  });
  $("#item-photo").addEventListener("change", async (event) => {
    const files = [...event.target.files];
    if (files.length > 1) {
      event.target.value = "";
      $("#item-dialog").close();
      openBatchRegister(files);
      return;
    }
    const file = files[0];
    if (!file) return;
    $("#analysis-hint").textContent = "写真を軽量化し、服の特徴を確認しています…";
    try {
      const { blob, detectedColor, detectedCategory } = await compressAndAnalyze(file);
      const resolvedColor = colorFromName(file.name) || detectedColor;
      currentPhoto = blob;
      revokePhotoURL(currentPhotoUrl);
      currentPhotoUrl = objectURL(blob);
      $("#photo-preview").src = currentPhotoUrl;
      $("#photo-preview").hidden = false;
      $("#photo-placeholder").hidden = true;
      $("#item-color").value = resolvedColor;
      $("#item-category").value = categoryFromName(file.name, detectedCategory || "tops");
      applyQuickItemInference({ filename: file.name });
      if (canUseGarmentAI()) {
        $("#analysis-hint").textContent = "AIがカテゴリ・形・丈・素材を確認しています…";
        try {
          const localGuess = localGuessFor($("#item-category").value, $("#item-color").value, $("#item-name").value, file.name);
          const analysis = await requestGarmentAnalysis(blob, "item", file.name, localGuess);
          if (analysis) applyItemVisionAnalysis(analysis);
          $("#analysis-hint").textContent = analysis?.imageQuality?.usable === false
            ? (analysis.imageQuality.guidance || "服全体が明るく写るように撮り直すと、判定が正確になります。")
            : "AIが仮入力しました。黄色・赤色の項目を中心に確認してください。";
        } catch (error) {
          $("#analysis-hint").textContent = error.message || "AIを利用できないため、端末内で仮入力しました。";
        }
      } else {
        $("#analysis-hint").textContent = cloudUser
          ? "AI未設定のため、端末内で仮入力しました。違うところだけ修正してください。"
          : "端末内で仮入力しました。ログインするとAI画像解析も利用できます。";
      }
    } catch (error) {
      console.error(error);
      $("#analysis-hint").textContent = "画像を読み込めませんでした。別の写真をお試しください。";
    }
  });
  ["#item-category", "#item-color"].forEach((selector) => {
    $(selector).addEventListener("change", () => applyQuickItemInference());
  });
  $("#item-name").addEventListener("input", () => {
    if ($("#item-name").value !== lastSuggestedItemName) lastSuggestedItemName = "";
  });
  ["#item-season", "#item-warmth", "#item-formality", "#item-pattern", "#item-material", "#item-silhouette", "#item-garment-length", "#item-sleeve-length", "#item-thickness", "#item-layer-role", "#item-style", "#item-statement"].forEach((selector) => {
    $(selector).addEventListener("change", updateItemAnalysisSummary);
  });
  $("#item-form").addEventListener("submit", saveItem);
  $("#item-dialog").addEventListener("close", resetItemForm);
  $("#generate-look").addEventListener("click", generateLookPreview);
  $("#look-dialog").addEventListener("close", resetLookDialog);
  $("#look-dialog").addEventListener("cancel", (event) => {
    if (lookGenerationInProgress) event.preventDefault();
  });
  $("#condition-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const requestId = ++outfitRankingRequestId;
    const form = new FormData(event.currentTarget);
    const conditions = {
      temperature: Number($("#temperature").value), weather: form.get("weather"), occasion: form.get("occasion"), mood: form.get("mood"),
      avoidRecent: $("#avoid-recent").checked, actualOnly: $("#actual-only").checked, preferenceBalance: Number($("#preference-balance").value),
    };
    $("#quick-temperature").textContent = `${conditions.temperature}℃`;
    $("#quick-occasion").textContent = labels.occasion[conditions.occasion];
    $("#quick-mood").textContent = labels.mood[conditions.mood];
    const candidates = generateCandidates(conditions);
    const ruleOutfits = selectDiverse(candidates);
    const canCheckAI = Boolean(cloudUser && window.KinariCloud?.rankOutfits && candidates.length);
    renderOutfits(ruleOutfits, conditions, {
      mode: "rules",
      pending: canCheckAI,
      summary: canCheckAI ? "ルール結果を表示しながら、設定済みのAI補正を確認しています" : "端末内のルールと好み学習で判定",
    });
    if (!canCheckAI) return;
    try {
      const ranked = await rankOutfitsWithOptionalAI(candidates, conditions);
      if (requestId !== outfitRankingRequestId) return;
      renderOutfits(selectDiverse(ranked.candidates), conditions, ranked.meta);
    } catch (error) {
      console.info("AI補正を利用できないためルール結果を維持します", error);
      if (requestId !== outfitRankingRequestId) return;
      renderOutfits(ruleOutfits, conditions, { mode: "rules", summary: "AI補正を利用できなかったため、ルール判定を維持しました" });
    }
  });
}

async function init() {
  $("#today-label").textContent = formatDate(new Date());
  try {
    db = await openDB();
    await retireLegacyWomenSamples();
    await ensureSampleItems();
    await loadTrendProfile();
    [items, feedback, purchaseCandidates] = await Promise.all([getAll("items"), getAll("feedback"), getAll("candidates")]);
    loadStylistSettings();
    bindEvents();
    renderAll();
    await initializeCloud();
  } catch (error) {
    console.error(error);
    showToast("ブラウザ内の保存領域を開けませんでした");
  }
}

init();
