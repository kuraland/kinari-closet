// 更新意図: 服の詳細な形状情報を渡した後も、Jev・Claude補正とルールフォールバックを回帰確認する。処理日時: 2026-10-07 22:07 JST
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8").replace(/\ninit\(\);\s*$/, "\n");
const cloudSource = fs.readFileSync(path.join(root, "cloud-sync.js"), "utf8");
const functionSource = fs.readFileSync(path.join(root, "supabase/functions/rank-outfits/index.ts"), "utf8");
const migrationSource = fs.readFileSync(path.join(root, "supabase/migrations/202610030001_ai_preference_profiles.sql"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

assert.match(cloudSource, /functions\.invoke\("rank-outfits"/, "AI判定はEdge Function経由にしてください");
assert.doesNotMatch(cloudSource, /TYPESAFE_API_KEY\s*[:=]/, "TypeSafeの秘密鍵をブラウザコードへ置いてはいけません");
assert.doesNotMatch(cloudSource, /ANTHROPIC_API_KEY\s*[:=]/, "Anthropicの秘密鍵をブラウザコードへ置いてはいけません");
assert.match(functionSource, /Deno\.env\.get\("TYPESAFE_API_KEY"\)/, "TypeSafeキーはサーバーsecretから取得してください");
assert.match(functionSource, /Deno\.env\.get\("ANTHROPIC_API_KEY"\)/, "Anthropicキーはサーバーsecretから取得してください");
assert.match(functionSource, /mode: "rules"/, "API未設定時のルールフォールバックが必要です");
assert.match(functionSource, /JEV_CONFIDENCE_THRESHOLD/, "Jevの低確信度をClaudeへ引き継いでください");
assert.match(migrationSource, /ai_preference_profiles/, "Claudeの好みプロフィール保存先が必要です");
assert.match(html, /app\.js\?v=20/, "公開キャッシュ番号を更新してください");
assert.match(functionSource, /garmentLength/, "AI再順位付けへ丈を渡してください");
assert.match(functionSource, /sleeveLength/, "AI再順位付けへ袖丈を渡してください");
assert.match(functionSource, /thickness/, "AI再順位付けへ生地の厚みを渡してください");

const context = vm.createContext({
  console, URL, Blob, FormData, Intl, Date, Math, Set, Map, JSON,
  localStorage: { getItem: () => "{}", setItem: () => {} },
  document: { querySelector: () => null, querySelectorAll: () => [] },
  window: {},
});
vm.runInContext(appSource, context, { filename: "app.js" });
context.testCandidates = [
  { id: "rule-high", score: 80, components: { practical: 80, preference: 70, harmony: 75, trend: 60 }, items: [] },
  { id: "rule-low", score: 70, components: { practical: 70, preference: 65, harmony: 70, trend: 55 }, items: [] },
];
context.testRanking = { mode: "jev", scores: { "rule-high": 100, "rule-low": 20 } };
const ranked = vm.runInContext("applyAIRanking(testCandidates, testRanking)", context);
assert.equal(ranked[0].id, "rule-high");
assert.equal(ranked[0].ruleScore, 80, "元のルール点を説明用に残してください");
assert.equal(ranked[0].score, 87, "ルール65%・AI35%で補正してください");

context.rulesOnly = { mode: "rules", scores: { "rule-high": 0 } };
const unchanged = vm.runInContext("applyAIRanking(testCandidates, rulesOnly)", context);
assert.equal(unchanged[0].score, 80, "AI未設定時はルール点を変更してはいけません");

console.log("AI ranking fallback tests passed");
