/* 更新意図: カメラ・ライブラリ両方の購入候補写真入力と、良質なコーデだけを最大10案まで生成することを回帰確認する。処理日時: 2026-10-01 JST */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8").replace(/\ninit\(\);\s*$/, "\n");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

for (const id of [
  "view-shopping", "candidate-list", "candidate-history", "candidate-dialog", "candidate-form",
  "candidate-camera-photo", "candidate-photo", "candidate-name", "candidate-category", "candidate-color", "save-candidate",
]) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `${id} がHTMLに必要です`);
}
assert.match(html, /id="candidate-camera-photo"[^>]+capture="environment"/, "カメラ入力には背面カメラ指定が必要です");
assert.match(html, /id="candidate-photo"[^>]+accept="image\/\*"(?![^>]+capture)/, "ライブラリ入力にはcapture指定を付けないでください");

const context = vm.createContext({
  console,
  URL,
  Blob,
  FormData,
  Intl,
  Date,
  Math,
  Set,
  Map,
  JSON,
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
const wardrobe = [
  { ...base, id: "top-1", name: "白シャツ", category: "tops", color: "white", formality: 3, style: "clean" },
  { ...base, id: "top-2", name: "グレーニット", category: "tops", color: "gray", formality: 3, style: "clean" },
  { ...base, id: "top-3", name: "ベージュTシャツ", category: "tops", color: "beige" },
  { ...base, id: "bottom-1", name: "ネイビーパンツ", category: "bottoms", color: "navy", formality: 3 },
  { ...base, id: "bottom-2", name: "黒パンツ", category: "bottoms", color: "black", formality: 3 },
  { ...base, id: "bottom-3", name: "ベージュチノ", category: "bottoms", color: "beige" },
  { ...base, id: "shoe-1", name: "白スニーカー", category: "shoes", color: "white" },
  { ...base, id: "shoe-2", name: "黒ローファー", category: "shoes", color: "black", formality: 3, style: "classic" },
  { ...base, id: "shoe-3", name: "ブラウンシューズ", category: "shoes", color: "brown", formality: 3, style: "classic" },
  { ...base, id: "bag-1", name: "黒バッグ", category: "accessory", color: "black" },
  { ...base, id: "bag-2", name: "ブラウントート", category: "accessory", color: "brown" },
  { ...base, id: "outer-1", name: "ベージュジャケット", category: "outer", color: "beige", warmth: 4 },
  { ...base, id: "outer-2", name: "ネイビージャケット", category: "outer", color: "navy", warmth: 4 },
];
context.testItems = wardrobe;
vm.runInContext("items = testItems; feedback = [];", context);

let largestSuggestionCount = 0;
for (const category of ["tops", "bottoms", "outer", "shoes", "accessory", "onepiece"]) {
  const candidate = {
    ...base,
    id: `candidate-${category}`,
    name: `候補${category}`,
    category,
    color: "brown",
    warmth: category === "outer" ? 4 : 2,
  };
  context.testCandidate = candidate;
  const outfits = vm.runInContext("candidateOutfits(testCandidate)", context);
  largestSuggestionCount = Math.max(largestSuggestionCount, outfits.length);
  assert.ok(outfits.length > 0 && outfits.length <= 10, `${category} は良質な案を1〜10件生成する必要があります`);
  assert.ok(outfits.every((outfit) => outfit.items.some((item) => item.id === candidate.id)), `${category} の全案に購入候補が必要です`);
  assert.ok(outfits.every((outfit) => outfit.score >= 62 && outfit.components.practical >= 50 && outfit.components.harmony >= 58), `${category} に品質基準未満の案が含まれています`);
}
assert.ok(largestSuggestionCount > 3, "十分な候補がある場合は3案を超えて提案する必要があります");

context.qualityCandidates = [
  { id: "good", score: 75, components: { practical: 70, preference: 50, harmony: 72, trend: 65 }, items: wardrobe.slice(0, 3) },
  { id: "bad-score", score: 61, components: { practical: 90, preference: 50, harmony: 90, trend: 50 }, items: wardrobe.slice(1, 4) },
  { id: "bad-practical", score: 75, components: { practical: 49, preference: 50, harmony: 90, trend: 70 }, items: wardrobe.slice(2, 5) },
  { id: "bad-harmony", score: 75, components: { practical: 90, preference: 50, harmony: 57, trend: 70 }, items: wardrobe.slice(3, 6) },
];
const qualified = vm.runInContext("selectQualityCandidateOutfits(qualityCandidates)", context);
assert.equal(qualified.map((outfit) => outfit.id).join(","), "good", "品質基準未満の案を水増し表示してはいけません");

console.log("shopping candidate flow tests passed");
