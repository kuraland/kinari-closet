// 更新意図: 詳細な服属性とクラウド画像の軽量URL同期を回帰確認する。処理日時: 2026-10-09 12:20 JST
const assert = require("node:assert/strict");
const cloud = require("../cloud-sync.js");
const { __test } = cloud;

assert.equal(typeof cloud.rankOutfits, "function", "AI再順位付けのEdge Function呼び出しを公開してください");
assert.equal(typeof cloud.analyzeGarment, "function", "AI画像解析のEdge Function呼び出しを公開してください");
assert.equal(typeof cloud.confirmGarmentAnalysis, "function", "画像解析の確定値を記録できる必要があります");

const item = {
  id: "item-1",
  name: "白シャツ",
  category: "tops",
  subcategory: "オックスフォードシャツ",
  color: "white",
  secondaryColors: ["blue"],
  season: "all",
  warmth: 2,
  formality: 4,
  pattern: "solid",
  material: "cotton",
  silhouette: "regular",
  garmentLength: "cropped",
  sleeveLength: "long",
  thickness: "light",
  layerRole: "standalone",
  attributeSource: "user_confirmed",
  attributeConfidence: 100,
  style: "clean",
  statement: 2,
  status: "ready",
  notes: "仕事用",
  createdAt: "2026-09-28T00:00:00.000Z",
  updatedAt: "2026-09-29T00:00:00.000Z",
  lastWornAt: null,
};

const row = __test.toGarmentRow(item, "00000000-0000-0000-0000-000000000001", "user/item-1.jpg");
assert.equal(row.photo_path, "user/item-1.jpg");
assert.equal(row.updated_at, item.updatedAt);
assert.equal(row.subcategory, "オックスフォードシャツ");
assert.deepEqual(row.secondary_colors, ["blue"]);
assert.equal(row.garment_length, "cropped");
assert.equal(row.sleeve_length, "long");
assert.equal(row.thickness, "light");
assert.equal(row.layer_role, "standalone");
assert.equal(row.attribute_source, "user_confirmed");

const restored = __test.fromGarmentRow(row, "photo-blob");
assert.equal(restored.name, item.name);
assert.equal(restored.photo, "photo-blob");
assert.equal(restored.subcategory, "オックスフォードシャツ");
assert.deepEqual(restored.secondaryColors, ["blue"]);
assert.equal(restored.isSample, false);
assert.equal(restored.garmentLength, "cropped");
assert.equal(restored.attributeConfidence, 100);
assert.equal(__test.isLocalNewer("2026-09-29T01:00:00Z", "2026-09-29T00:00:00Z"), true);
assert.equal(__test.isLocalNewer("2026-09-28T23:00:00Z", "2026-09-29T00:00:00Z"), false);
assert.equal(__test.isLocalNewer("2026-09-29T00:00:00Z", "2026-09-29T00:00:00Z"), false);
const feedback = {
  id: "feedback-1",
  type: "like",
  reason: "color",
  itemIds: ["item-1"],
  conditions: { occasion: "work" },
  createdAt: "2026-09-29T00:30:00.000Z",
};
const feedbackRow = __test.toFeedbackRow(feedback, "00000000-0000-0000-0000-000000000001");
assert.equal(feedbackRow.conditions.feedbackReason, "color");
assert.deepEqual(__test.fromFeedbackRow(feedbackRow), feedback);

console.log("cloud sync mapping tests passed");
