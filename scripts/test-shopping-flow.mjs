/* 追加意図: 購入候補が必ず含まれる3案を既存の手持ち服から生成できることを回帰確認する。処理日時: 2026-10-01 JST */
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
  "candidate-photo", "candidate-name", "candidate-category", "candidate-color", "save-candidate",
]) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `${id} がHTMLに必要です`);
}

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
  { ...base, id: "bottom-1", name: "ネイビーパンツ", category: "bottoms", color: "navy", formality: 3 },
  { ...base, id: "shoe-1", name: "白スニーカー", category: "shoes", color: "white" },
  { ...base, id: "bag-1", name: "黒バッグ", category: "accessory", color: "black" },
  { ...base, id: "outer-1", name: "ベージュジャケット", category: "outer", color: "beige", warmth: 4 },
];
context.testItems = wardrobe;
vm.runInContext("items = testItems; feedback = [];", context);

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
  assert.ok(outfits.length > 0 && outfits.length <= 3, `${category} は1〜3案を生成する必要があります`);
  assert.ok(outfits.every((outfit) => outfit.items.some((item) => item.id === candidate.id)), `${category} の全案に購入候補が必要です`);
}

console.log("shopping candidate flow tests passed");
