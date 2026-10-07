// 追加意図: 複数写真の仮判定・最大20点の確認・一括保存導線をスマホ表示も含めて回帰確認する。処理日時: 2026-10-07 13:29 JST
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8").replace(/\ninit\(\);\s*$/, "\n");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

assert.match(html, /id="item-photo"[^>]+multiple/, "通常登録から複数写真を選べるようにしてください");
assert.match(html, /id="batch-photo-picker"[^>]+multiple/, "クローゼットに一括登録の入口が必要です");
assert.match(html, /id="batch-dialog"/, "一括登録の確認画面が必要です");
assert.match(html, /app\.js\?v=17/, "公開キャッシュ番号を更新してください");
assert.match(html, /styles\.css\?v=16/, "一括登録のスマホ調整を確実に配信してください");
assert.match(appSource, /const MAX_BATCH_ITEMS = 20;/, "スマホ負荷を抑える上限が必要です");
assert.match(appSource, /await putMany\("items", newItems\)/, "一括登録は単一トランザクションで保存してください");
assert.match(appSource, /queueCloudSync\(\);\s*showToast\(`\$\{count\}点をクローゼットに追加しました`\)/s, "保存後の同期は一度だけ実行してください");

const context = vm.createContext({
  console, URL, Blob, FormData, Intl, Date, Math, Set, Map, JSON,
  localStorage: { getItem: () => "{}", setItem: () => {} },
  document: { querySelector: () => null, querySelectorAll: () => [] },
  window: {},
});
vm.runInContext(appSource, context, { filename: "app.js" });

const denim = vm.runInContext('batchDraftMetadata("navy-jeans.jpg", "green")', context);
assert.equal(denim.category, "bottoms");
assert.equal(denim.color, "navy");
assert.equal(denim.name, "ネイビーのボトムス");
assert.equal(denim.material, "denim");

const fallback = vm.runInContext('batchDraftMetadata("closet-photo.jpg", "green")', context);
assert.equal(fallback.category, "tops");
assert.equal(fallback.color, "green");
assert.equal(fallback.name, "グリーンのトップス");

const categoryFilename = vm.runInContext('batchDraftMetadata("bottoms-02.jpg", "beige")', context);
assert.equal(categoryFilename.category, "bottoms");
assert.equal(categoryFilename.name, "ベージュのボトムス");

console.log("batch registration tests passed");
