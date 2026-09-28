/**
 * 追加意図: trends.json の更新期限切れをCIで検知し、古い流行情報の放置を防ぐ。
 * 処理日時: 2026-09-27 JST
 */
import { readFile } from "node:fs/promises";

const profilePath = new URL("../trends.json", import.meta.url);
const data = JSON.parse(await readFile(profilePath, "utf8"));
const profile = data.current || data;
const validUntil = new Date(`${profile.validUntil || ""}T23:59:59Z`);
const updatedAt = new Date(`${profile.updatedAt || ""}T00:00:00Z`);
const dateArgument = process.argv.find((argument) => argument.startsWith("--date="));
const now = dateArgument ? new Date(`${dateArgument.split("=")[1]}T12:00:00Z`) : new Date();

if (Number.isNaN(updatedAt.getTime()) || Number.isNaN(validUntil.getTime())) {
  console.error("trends.json の updatedAt または validUntil が不正です。");
  process.exitCode = 1;
} else {
  const ageDays = Math.max(0, Math.floor((now.getTime() - updatedAt.getTime()) / 86400000));
  const remainingDays = Math.ceil((validUntil.getTime() - now.getTime()) / 86400000);
  const expired = now.getTime() > validUntil.getTime();
  console.log(`${profile.season}: 更新から${ageDays}日、期限まで${remainingDays}日`);

  if (expired) {
    console.error("トレンド情報の有効期限が切れています。出典を確認し、trends.jsonを更新してください。");
    process.exitCode = 1;
  } else if (remainingDays <= 14) {
    console.warn("トレンド情報の期限が14日以内です。次シーズンへの更新を準備してください。");
  }
}
