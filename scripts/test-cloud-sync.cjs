// 追加意図: Supabaseとのデータ変換で、実物のみ設定と評価理由を含む端末内形式・DB形式の互換性を回帰確認する。処理日時: 2026-10-01 22:48 JST
const assert = require("node:assert/strict");
const { __test } = require("../cloud-sync.js");

const item = {
  id: "item-1",
  name: "白シャツ",
  category: "tops",
  color: "white",
  season: "all",
  warmth: 2,
  formality: 4,
  pattern: "solid",
  material: "cotton",
  silhouette: "regular",
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

const restored = __test.fromGarmentRow(row, "photo-blob");
assert.equal(restored.name, item.name);
assert.equal(restored.photo, "photo-blob");
assert.equal(restored.isSample, false);
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
