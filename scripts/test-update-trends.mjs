/**
 * 追加意図: 外部サイトへ接続せず、トレンド抽出・分類・安全弁を継続検証する。
 * 処理日時: 2026-09-27 JST
 */
import assert from "node:assert/strict";
import { buildTrendUpdate, extractTrendKeywords, mapKeyword, SOURCES } from "./update-trends.mjs";

const page = `
  <html><body>
    <nav><a href="/">ホーム</a></nav>
    <h1>トレンドキーワード</h1>
    <a href="/tag/1">モノトーンコーデ</a>
    <a href="/tag/2"><span>ワイドデニム</span></a>
    <a href="/tag/3">シアートップス</a>
    <h2>カテゴリー</h2>
    <a href="/category/tops">トップス</a>
  </body></html>`;

assert.deepEqual(extractTrendKeywords(page), ["モノトーンコーデ", "ワイドデニム", "シアートップス"]);
assert.deepEqual(mapKeyword("モノトーンコーデ"), {
  colors: ["black", "white", "gray"], patterns: ["solid"], styles: ["minimal"]
});
assert.deepEqual(mapKeyword("ワイドデニム"), { colors: ["blue"], materials: ["denim"], silhouettes: ["wide"] });

const prior = {
  updatedAt: "2026-09-10",
  current: {
    season: "2026 秋", title: "旧トレンド", updatedAt: "2026-09-10", validUntil: "2026-10-01",
    colors: ["red", "navy"], patterns: ["check"], materials: ["wool"],
    silhouettes: ["long"], styles: ["classic"], tags: ["旧"], sourceLabel: "旧", sourceUrl: "https://example.com"
  }
};
const keywords = ["モノトーンコーデ", "ワイドデニム", "シアートップス", "白シャツ", "レザージャケット", "スポーツミックス", "赤ニット", "チェック柄"];
const result = buildTrendUpdate(prior, SOURCES.slice(0, 2).map((source) => ({ ...source, keywords })), new Date("2026-09-27T03:00:00Z"));

assert.equal(result.trendData.current.updatedAt, "2026-09-27");
assert.equal(result.trendData.current.validUntil, "2026-11-08");
assert.equal(result.trendData.current.automation.reviewRequired, true);
assert.ok(result.trendData.current.colors.includes("black"));
assert.ok(result.trendData.current.silhouettes.includes("wide"));
assert.equal(result.snapshot.sources.length, 2);
assert.match(result.snapshot.privacy, /ユーザー名/);
assert.throws(() => buildTrendUpdate(prior, [{ ...SOURCES[0], keywords }]), /2種類以上/);

console.log("trend updater: all tests passed");

