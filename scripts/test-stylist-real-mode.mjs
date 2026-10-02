/* 追加意図: 実物のみの候補生成、4方向の選出、理由別の好み学習を回帰確認する。処理日時: 2026-10-01 22:48 JST */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8").replace(/\ninit\(\);\s*$/, "\n");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

assert.match(html, /id="actual-only"/, "実物のみモードの切り替えが必要です");
assert.match(html, /4つの方向でコーデを作る/, "4方向の提案であることを画面に表示してください");
assert.match(appSource, /data-feedback-reason/, "評価理由の入力UIが必要です");

const context = vm.createContext({
  console, URL, Blob, FormData, Intl, Date, Math, Set, Map, JSON,
  localStorage: { getItem: () => "{}", setItem: () => {} },
  document: { querySelector: () => null, querySelectorAll: () => [] },
  window: {},
});
vm.runInContext(appSource, context, { filename: "app.js" });

const base = {
  color: "navy", season: "all", warmth: 2, formality: 2, status: "ready",
  pattern: "solid", material: "cotton", silhouette: "regular", style: "casual", statement: 2,
  createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", lastWornAt: null,
};
const realItems = [
  { ...base, id: "top-1", name: "白シャツ", category: "tops", color: "white", style: "clean", formality: 3 },
  { ...base, id: "top-2", name: "赤ニット", category: "tops", color: "red", style: "trendy", statement: 5 },
  { ...base, id: "top-3", name: "グレーT", category: "tops", color: "gray", style: "minimal" },
  { ...base, id: "bottom-1", name: "ネイビーパンツ", category: "bottoms", formality: 3 },
  { ...base, id: "bottom-2", name: "黒ワイドパンツ", category: "bottoms", color: "black", silhouette: "wide", statement: 4 },
  { ...base, id: "bottom-3", name: "ベージュチノ", category: "bottoms", color: "beige" },
  { ...base, id: "shoe-1", name: "白スニーカー", category: "shoes", color: "white" },
  { ...base, id: "shoe-2", name: "黒ローファー", category: "shoes", color: "black", style: "classic", formality: 4 },
  { ...base, id: "shoe-3", name: "茶ダービー", category: "shoes", color: "brown", style: "classic", formality: 3 },
];
const sampleItem = { ...base, id: "sample-top", name: "サンプル", category: "tops", color: "green", isSample: true };
context.testItems = [...realItems, sampleItem];
vm.runInContext("items = testItems; feedback = [];", context);

const conditions = { temperature: 24, weather: "sunny", occasion: "daily", mood: "relaxed", avoidRecent: false, actualOnly: true, preferenceBalance: 67 };
context.testConditions = conditions;
const candidates = vm.runInContext("generateCandidates(testConditions)", context);
assert.ok(candidates.length > 4, "4方向を選べる十分な実物候補が必要です");
assert.ok(candidates.every((outfit) => outfit.items.every((item) => !item.isSample)), "実物のみモードへサンプルを混ぜてはいけません");

const selected = vm.runInContext("selectDiverse(generateCandidates(testConditions))", context);
assert.deepEqual(Array.from(selected, (outfit) => outfit.role), ["classic", "personal", "trend", "adventure"]);
assert.equal(new Set(Array.from(selected, (outfit) => outfit.id)).size, 4, "4方向は異なるコーデである必要があります");

context.testFeedback = [{
  id: "feedback-1", type: "dislike", reason: "color", itemIds: ["top-2"], conditions,
  createdAt: new Date().toISOString(),
}];
vm.runInContext("feedback = testFeedback;", context);
const featureKeys = vm.runInContext("Array.from(buildPreferenceModel().featureWeights.keys())", context);
assert.deepEqual(Array.from(featureKeys), ["color:red"], "色が苦手という理由は色の特徴だけへ反映してください");

console.log("stylist real-mode tests passed");
