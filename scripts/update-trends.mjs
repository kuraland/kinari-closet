/**
 * 追加意図: WEARの公開トレンドキーワードを個人情報なしで週次集計し、推薦用の更新案を生成する。
 * 処理日時: 2026-09-27 JST
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const TREND_PATH = new URL("../trends.json", import.meta.url);
const SNAPSHOT_PATH = new URL("../data/trend-snapshot.json", import.meta.url);

export const SOURCES = [
  { id: "all", label: "総合", url: "https://wear.jp/keyword/", weight: 1.15 },
  { id: "men", label: "メンズ", url: "https://wear.jp/men-keyword/", weight: 1 },
  { id: "women", label: "レディース", url: "https://wear.jp/women-keyword/", weight: 1 }
];

const TAXONOMY = {
  colors: [
    [/モノトーン|白黒/, ["black", "white", "gray"]],
    [/ブラック|黒/, ["black"]],
    [/ホワイト|白/, ["white"]],
    [/グレー|灰/, ["gray"]],
    [/ネイビー|紺/, ["navy"]],
    [/ブルー|青|デニム/, ["blue"]],
    [/ベージュ|エクリュ|生成り/, ["beige"]],
    [/ブラウン|茶/, ["brown"]],
    [/グリーン|緑|カーキ|オリーブ/, ["green"]],
    [/レッド|赤/, ["red"]],
    [/イエロー|黄/, ["yellow"]],
    [/ピンク/, ["pink"]],
    [/パープル|紫/, ["purple"]]
  ],
  patterns: [
    [/ストライプ|ボーダー/, ["stripe"]],
    [/チェック|タータン/, ["check"]],
    [/花柄|フラワー/, ["floral"]],
    [/ロゴ|グラフィック|プリント|ドット|水玉|柄/, ["graphic"]],
    [/無地|ワントーン|モノトーン/, ["solid"]]
  ],
  materials: [
    [/ニット|セーター|カーディガン|スウェット/, ["knit"]],
    [/デニム|ジーンズ/, ["denim"]],
    [/リネン|麻/, ["linen"]],
    [/ウール|ツイード/, ["wool"]],
    [/レザー|革/, ["leather"]],
    [/ナイロン|メッシュ|シアー/, ["synthetic"]],
    [/コットン|綿|Tシャツ|シャツ/, ["cotton"]]
  ],
  silhouettes: [
    [/ワイド|バギー|ボリューム/, ["wide"]],
    [/オーバーサイズ|ゆったり|ルーズ/, ["relaxed"]],
    [/ショート|短丈|クロップ/, ["short"]],
    [/ロング|マキシ/, ["long"]],
    [/スリム|タイト|細身|カプリ/, ["slim"]]
  ],
  styles: [
    [/カジュアル|アメカジ|ストリート|フェス/, ["casual"]],
    [/きれいめ|オフィス|上品/, ["clean"]],
    [/モノトーン|ノームコア|ミニマル|ワントーン/, ["minimal"]],
    [/クラシック|トラッド|プレッピー|ナポレオン/, ["classic"]],
    [/ナチュラル|リネン/, ["natural"]],
    [/スポーツ|スニーカー|ゲームシャツ|アウトドア/, ["sporty"]],
    [/Y2K|韓国|トレンド|シアー/, ["trendy"]]
  ]
};

const LIMITS = { colors: 5, patterns: 3, materials: 3, silhouettes: 4, styles: 3 };
const EXCLUDED_TEXT = new Set([
  "ALL", "MEN", "WOMEN", "KIDS", "すべて", "メンズ", "レディース", "キッズ",
  "トレンドキーワード", "カテゴリー", "もっと見る"
]);

function decodeHtml(value) {
  const named = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
  return value
    .replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (_, entity) => {
      if (entity[0] === "#") {
        const isHex = entity[1].toLowerCase() === "x";
        return String.fromCodePoint(Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10));
      }
      return named[entity.toLowerCase()] || "";
    });
}

function cleanText(value) {
  return decodeHtml(value.replace(/<[^>]+>/g, " "))
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractTrendKeywords(html) {
  const withoutScripts = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  const heading = /<h[1-3]\b[^>]*>[\s\S]{0,300}?トレンドキーワード[\s\S]{0,100}?<\/h[1-3]>/i.exec(withoutScripts);
  if (!heading) return [];

  const afterHeading = withoutScripts.slice(heading.index + heading[0].length);
  const nextHeading = /<h[1-3]\b[^>]*>[\s\S]{0,200}?カテゴリー[\s\S]{0,100}?<\/h[1-3]>/i.exec(afterHeading);
  const section = nextHeading ? afterHeading.slice(0, nextHeading.index) : afterHeading.slice(0, 50000);
  const results = [];

  for (const match of section.matchAll(/<a\b[^>]*href=["'][^"']+["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = cleanText(match[1]);
    if (!text || text.length < 2 || text.length > 48 || EXCLUDED_TEXT.has(text.toUpperCase())) continue;
    if (/^(ログイン|会員登録|ホーム|コーディネート|アイテム|ブランド|ランキング)$/.test(text)) continue;
    if (!results.includes(text)) results.push(text);
    if (results.length >= 30) break;
  }
  return results;
}

export function mapKeyword(keyword) {
  const mapped = {};
  for (const [category, rules] of Object.entries(TAXONOMY)) {
    const values = [];
    for (const [pattern, additions] of rules) {
      if (pattern.test(keyword)) values.push(...additions);
    }
    if (values.length) mapped[category] = [...new Set(values)];
  }
  return mapped;
}

function scoreSignals(sourceResults) {
  const signals = new Map();
  const keywordScores = new Map();

  for (const source of sourceResults) {
    source.keywords.forEach((keyword, rank) => {
      const rankWeight = Math.max(0.25, 1 - rank / 30);
      const weight = source.weight * rankWeight;
      keywordScores.set(keyword, (keywordScores.get(keyword) || 0) + weight);
      const mapped = mapKeyword(keyword);

      for (const [category, values] of Object.entries(mapped)) {
        for (const value of values) {
          const key = `${category}:${value}`;
          const current = signals.get(key) || { category, value, score: 0, sources: new Set(), keywords: new Set() };
          current.score += weight;
          current.sources.add(source.id);
          current.keywords.add(keyword);
          signals.set(key, current);
        }
      }
    });
  }

  const accepted = [...signals.values()]
    .filter((signal) => signal.sources.size >= 2 || signal.score >= 1.1)
    .sort((a, b) => b.score - a.score)
    .map((signal) => ({
      category: signal.category,
      value: signal.value,
      score: Number(signal.score.toFixed(3)),
      sourceCount: signal.sources.size,
      keywords: [...signal.keywords]
    }));

  const rankedKeywords = [...keywordScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([keyword]) => keyword);

  return { accepted, rankedKeywords };
}

function formatJstDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(date);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00+09:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return formatJstDate(date);
}

function getSeason(date = new Date()) {
  const month = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", month: "numeric" }).format(date));
  const year = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", year: "numeric" }).format(date);
  const season = month <= 2 || month === 12 ? "冬" : month <= 5 ? "春" : month <= 8 ? "夏" : "秋";
  return `${year} ${season}`;
}

export function buildTrendUpdate(previousData, sourceResults, now = new Date()) {
  if (sourceResults.length < 2) throw new Error("安全のため、2種類以上のトレンドページを取得できた場合だけ更新します。");
  const uniqueKeywordCount = new Set(sourceResults.flatMap((source) => source.keywords)).size;
  if (uniqueKeywordCount < 8) throw new Error("取得できたトレンドキーワードが少なすぎるため更新を中止します。");

  const { accepted, rankedKeywords } = scoreSignals(sourceResults);
  if (accepted.length < 2) throw new Error("服の属性へ変換できる確度の高いシグナルが不足しています。");

  const previous = previousData.current || previousData;
  const generated = {};
  for (const [category, limit] of Object.entries(LIMITS)) {
    const detected = accepted.filter((signal) => signal.category === category).map((signal) => signal.value);
    generated[category] = [...new Set([...detected, ...(previous[category] || [])])].slice(0, limit);
  }

  const tags = rankedKeywords.filter((keyword) => Object.keys(mapKeyword(keyword)).length).slice(0, 4);
  const today = formatJstDate(now);
  const confidence = Math.min(1, sourceResults.length / SOURCES.length * 0.4 + Math.min(accepted.length / 8, 1) * 0.6);

  return {
    trendData: {
      ...previousData,
      updatedAt: today,
      updateIntent: `公開トレンドキーワードの週次集計を推薦属性へ変換。画像・投稿本文・ユーザー情報は保存しない。処理日時: ${today} JST`,
      current: {
        ...previous,
        season: getSeason(now),
        title: tags.length >= 2 ? `「${tags[0]}」と「${tags[1]}」の要素を取り入れる` : "公開キーワードから今季らしさを取り入れる",
        updatedAt: today,
        validUntil: addDays(today, 42),
        ...generated,
        tags: tags.length ? tags : previous.tags,
        sourceLabel: "WEARトレンドキーワード（公開集計）",
        sourceUrl: "https://wear.jp/keyword/",
        automation: {
          mode: "wear-public-keywords",
          confidence: Number(confidence.toFixed(2)),
          sampleSize: uniqueKeywordCount,
          sourceCount: sourceResults.length,
          reviewRequired: true
        }
      }
    },
    snapshot: {
      collectedAt: now.toISOString(),
      privacy: "公開キーワードのみ。画像・投稿本文・ユーザー名・プロフィールは収集しない。",
      sources: sourceResults.map(({ id, label, url, keywords }) => ({ id, label, url, keywords })),
      acceptedSignals: accepted
    }
  };
}

async function fetchKeywords(source) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(source.url, {
      headers: {
        "User-Agent": "KINARI-Trend-Collector/1.0 (+https://github.com/kuraland/kinari-closet)",
        Accept: "text/html,application/xhtml+xml"
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const keywords = extractTrendKeywords(await response.text());
    if (keywords.length < 3) throw new Error("トレンドキーワードを十分に抽出できませんでした");
    return { ...source, keywords };
  } finally {
    clearTimeout(timeout);
  }
}

async function collectSources() {
  const results = [];
  for (const source of SOURCES) {
    try {
      results.push(await fetchKeywords(source));
    } catch (error) {
      console.warn(`[skip] ${source.label}: ${error.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  return results;
}

async function main() {
  const shouldWrite = process.argv.includes("--write");
  const previousData = JSON.parse(await readFile(TREND_PATH, "utf8"));
  const sourceResults = await collectSources();
  const result = buildTrendUpdate(previousData, sourceResults);

  if (!shouldWrite) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  await mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await Promise.all([
    writeFile(TREND_PATH, `${JSON.stringify(result.trendData, null, 2)}\n`),
    writeFile(SNAPSHOT_PATH, `${JSON.stringify(result.snapshot, null, 2)}\n`)
  ]);
  console.log(`updated: ${fileURLToPath(TREND_PATH)}`);
  console.log(`snapshot: ${fileURLToPath(SNAPSHOT_PATH)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
