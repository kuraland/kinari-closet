// 更新意図: 一括登録の導線に加え、写真形状によるボトムス判定を回帰確認する。処理日時: 2026-10-07 14:17 JST
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
assert.match(html, /app\.js\?v=19/, "公開キャッシュ番号を更新してください");
assert.match(html, /styles\.css\?v=16/, "一括登録のスマホ調整を確実に配信してください");
assert.match(appSource, /const MAX_BATCH_ITEMS = 20;/, "スマホ負荷を抑える上限が必要です");
assert.match(appSource, /await putMany\("items", newItems\)/, "一括登録は単一トランザクションで保存してください");
assert.match(appSource, /queueCloudSync\(\);\s*showToast\(`\$\{count\}点をクローゼットに追加しました`\)/s, "保存後の同期は一度だけ実行してください");
assert.match(appSource, /\.\.\.\(existing \|\| \{\}\)/, "編集時は写真パスなど既存情報を保持してください");
assert.match(appSource, /currentPhoto \?\? existing\?\.photo \?\? null/, "カテゴリ変更だけで写真を失ってはいけません");
assert.match(appSource, /lastSuggestedItemName = item\.name === genericName \? genericName : ""/, "自動生成名はカテゴリ修正に合わせて更新してください");

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

function flatPixels(width, height, background = [245, 243, 237]) {
  const pixels = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    pixels.set([...background, 255], index * 4);
  }
  return pixels;
}

function fillRect(pixels, width, x1, y1, x2, y2, color = [60, 62, 61]) {
  for (let y = y1; y <= y2; y += 1) {
    for (let x = x1; x <= x2; x += 1) pixels.set([...color, 255], (y * width + x) * 4);
  }
}

const pantsPixels = flatPixels(48, 48);
fillRect(pantsPixels, 48, 12, 4, 35, 11);
fillRect(pantsPixels, 48, 13, 12, 21, 43);
fillRect(pantsPixels, 48, 27, 12, 35, 43);
context.testPixels = pantsPixels;
assert.equal(vm.runInContext("inferCategoryFromImageData(testPixels, 48, 48)", context), "bottoms", "縦長で裾が二股の写真はボトムスと判定してください");
const cameraFilename = vm.runInContext('batchDraftMetadata("IMG_4821.jpg", "beige", "bottoms")', context);
assert.equal(cameraFilename.category, "bottoms", "スマホの一般的なファイル名では画像形状の判定を使ってください");

const topPixels = flatPixels(48, 48);
fillRect(topPixels, 48, 7, 8, 40, 16);
fillRect(topPixels, 48, 13, 17, 34, 38);
context.testPixels = topPixels;
assert.equal(vm.runInContext("inferCategoryFromImageData(testPixels, 48, 48)", context), null, "トップスをボトムスへ誤判定してはいけません");

context.testPhoto = new Blob(["photo"], { type: "image/jpeg" });
context.testItem = { id: "photo-1", name: "グリーンのアウター", category: "outer", color: "green", photo: context.testPhoto };
const firstMarkup = vm.runInContext("itemPhotoMarkup(testItem)", context);
const secondMarkup = vm.runInContext("itemPhotoMarkup(testItem)", context);
assert.equal(firstMarkup, secondMarkup, "編集後の再描画でも同じ画像URLを安定して使ってください");

console.log("batch registration tests passed");
