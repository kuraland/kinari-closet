// 追加意図: 形・丈・袖丈・厚み・重ね着役割の分離と、気温・シルエット相性への反映を回帰確認する。処理日時: 2026-10-07 22:07 JST
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8").replace(/\ninit\(\);\s*$/, "\n");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/202610070001_garment_profiles.sql"), "utf8");

for (const id of ["item-silhouette", "item-garment-length", "item-sleeve-length", "item-thickness", "item-layer-role"]) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `${id} が必要です`);
}
for (const column of ["garment_length", "sleeve_length", "thickness", "layer_role", "attribute_confidence"]) {
  assert.match(migration, new RegExp(`add column if not exists ${column}`), `${column} の非破壊マイグレーションが必要です`);
}

const context = vm.createContext({
  console, URL, Blob, FormData, Intl, Date, Math, Set, Map, JSON,
  localStorage: { getItem: () => "{}", setItem: () => {} },
  document: { querySelector: () => null, querySelectorAll: () => [] },
  window: {},
});
vm.runInContext(appSource, context, { filename: "app.js" });

context.profileItem = { category: "bottoms", name: "濃紺ワイドパンツ", warmth: 2 };
let profile = vm.runInContext("getItemProfile(profileItem)", context);
assert.equal(profile.silhouette, "wide");
assert.equal(profile.thickness, "light");

context.profileItem = { category: "bottoms", name: "黒のパンツ", warmth: 3, silhouette: "regular" };
profile = vm.runInContext("getItemProfile(profileItem)", context);
assert.equal(profile.silhouette, "straight", "旧データの標準パンツはストレートへ安全に読み替えてください");

context.profileItem = { category: "outer", name: "短丈ジャケット", warmth: 3, silhouette: "short" };
profile = vm.runInContext("getItemProfile(profileItem)", context);
assert.equal(profile.silhouette, "regular", "丈をゆとりとして扱ってはいけません");
assert.equal(profile.garmentLength, "cropped");

const base = { color: "navy", season: "all", warmth: 3, formality: 2, status: "ready", pattern: "solid", material: "cotton", style: "casual", statement: 2 };
context.shortTop = { ...base, id: "short-top", name: "半袖Tシャツ", category: "tops", silhouette: "regular", sleeveLength: "short", thickness: "light", garmentLength: "regular", layerRole: "standalone" };
context.bottom = { ...base, id: "bottom", name: "ストレートパンツ", category: "bottoms", silhouette: "straight", garmentLength: "regular", thickness: "medium", layerRole: "none" };
context.outer = { ...base, id: "outer", name: "ジャケット", category: "outer", silhouette: "regular", sleeveLength: "long", thickness: "medium", garmentLength: "regular", layerRole: "outer", warmth: 4 };
context.conditions = { temperature: 20, weather: "sunny" };
assert.equal(vm.runInContext("isTemperatureSuitableOutfit([shortTop, bottom], conditions)", context), false, "20℃で半袖だけの提案をしてはいけません");
assert.equal(vm.runInContext("isTemperatureSuitableOutfit([shortTop, bottom, outer], conditions)", context), true, "羽織りがあれば20℃の半袖を使えます");

context.regularTop = { ...context.shortTop, id: "regular-top", name: "標準丈シャツ", sleeveLength: "long", thickness: "medium", silhouette: "regular" };
context.oversizedTop = { ...context.regularTop, id: "oversized-top", name: "ロングオーバーシャツ", silhouette: "oversized", garmentLength: "long" };
context.wideBottom = { ...context.bottom, id: "wide-bottom", name: "ワイドパンツ", silhouette: "wide" };
context.harmonyConditions = { mood: "relaxed" };
const balanced = vm.runInContext("harmonyScore([regularTop, wideBottom], harmonyConditions)", context);
const bulky = vm.runInContext("harmonyScore([oversizedTop, wideBottom], harmonyConditions)", context);
assert.ok(balanced > bulky, "ワイドパンツにロング丈オーバートップスを無条件で高評価してはいけません");

console.log("garment profile tests passed");
