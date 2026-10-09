// 更新意図: AI画像解析の認証・秘密鍵保護・現行Gemini構造化出力・確信度確認・端末内フォールバックを回帰確認する。処理日時: 2026-10-08 10:45 JST
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const cloud = fs.readFileSync(path.join(root, "cloud-sync.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const edge = fs.readFileSync(path.join(root, "supabase/functions/analyze-garment/index.ts"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/202610070002_garment_analysis_runs.sql"), "utf8");

assert.match(edge, /Deno\.env\.get\("GEMINI_API_KEY"\)/, "Geminiの秘密鍵はEdge Functionだけで読む必要があります");
assert.doesNotMatch(app, /GEMINI_API_KEY/, "ブラウザへGeminiの秘密鍵を置いてはいけません");
assert.match(edge, /supabase\.auth\.getUser\(\)/, "画像解析はログイン済みユーザーだけに制限してください");
assert.match(edge, /garment_analysis_runs/, "AI推測履歴を保存してください");
assert.match(edge, /DAILY_LIMIT/, "API費用を守る日次上限が必要です");
assert.match(edge, /responseFormat[\s\S]+APPLICATION_JSON[\s\S]+schema/, "Geminiから現行API仕様の構造化JSONを受け取ってください");

for (const field of ["category", "color", "pattern", "material", "silhouette", "garmentLength", "sleeveLength", "thickness", "layerRole", "style", "confidence", "fieldConfidences", "imageQuality"]) {
  assert.match(edge, new RegExp(`\\b${field}\\b`), `${field} を画像解析結果に含めてください`);
}

assert.match(migration, /create table if not exists public\.garment_analysis_runs/, "画像解析履歴テーブルが必要です");
assert.match(migration, /predicted_attributes jsonb/, "AI推測値を保存してください");
assert.match(migration, /final_attributes jsonb/, "ユーザー確定値を保存してください");
assert.match(migration, /corrected_fields text\[\]/, "修正された項目を保存してください");
assert.match(migration, /enable row level security/, "画像解析履歴へRLSが必要です");
assert.doesNotMatch(migration, /policy[\s\S]+delete/i, "画像解析履歴をユーザー操作で削除するポリシーは作らないでください");

assert.match(cloud, /async function analyzeGarment/, "ブラウザから画像解析Edge Functionを呼べる必要があります");
assert.match(cloud, /async function confirmGarmentAnalysis/, "AI推測と確定値の差分を記録できる必要があります");
assert.match(app, /AI_AUTO_APPLY_THRESHOLD = 60/, "低確信度を自動適用しない境界が必要です");
assert.match(app, /AI_HIGH_CONFIDENCE_THRESHOLD = 80/, "高確信度の表示境界が必要です");
assert.match(app, /canUseGarmentAI\(\)/, "AI未設定時のフォールバック判定が必要です");
assert.match(app, /applyItemVisionAnalysis/, "通常登録へAI結果を反映してください");
assert.match(app, /applyCandidateVisionAnalysis/, "購入候補へAI結果を反映してください");
assert.match(app, /applyBatchVisionAnalysis/, "一括登録へAI結果を反映してください");
assert.match(app, /AI_BATCH_CONCURRENCY = 3/, "一括解析の同時実行数を制限してください");
assert.match(app, /confirmVisionAnalysis\(currentItemAnalysis/, "通常登録のユーザー修正を学習用履歴へ残してください");
assert.match(styles, /data-ai-state="review"/, "要確認項目を視覚的に区別してください");
assert.match(html, /cloud-sync\.js\?v=7/, "クラウド処理のキャッシュ番号を更新してください");
assert.match(html, /app\.js\?v=22/, "アプリ処理のキャッシュ番号を更新してください");

console.log("garment vision AI tests passed");
