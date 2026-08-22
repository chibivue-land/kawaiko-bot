/**
 * kawaiko にとっての「発言」と，その読み方．
 *
 * ゲートウェイと REST API はそれぞれ別の形の JSON を返してくるが，内側に渡る前に
 * 必ずこの形へ正規化する．おかげで核にもユースケースにも Discord の JSON を
 * 直接読んでいる箇所は一つもない．
 */
import { 文字列, 真偽 } from "../共通/型";

export interface 発言 {
  id: 文字列;
  本文: 文字列;
  /** チャットプラットフォームが振った ISO 時刻． */
  時刻: 文字列;
  発言者id: 文字列;
  /** ニックネーム・表示名・ユーザー名のうち，実際に表示されているもの． */
  発言者名: 文字列;
  bot発言か: 真偽;
}

/** 明示的に名指しされたか (@everyone / @here は含まない)． */
export function 名指しされたか(
  自分のid: 文字列,
  本文: 文字列,
  言及されたid一覧: readonly 文字列[] | undefined,
): 真偽 {
  if (言及されたid一覧?.some((id) => id === 自分のid)) return true;
  return 本文.includes(`<@${自分のid}>`) || 本文.includes(`<@!${自分のid}>`);
}

/** 自分宛てのメンションタグを取り除いて残りを整える． */
export function メンションを取り除く(自分のid: 文字列, 本文: 文字列): 文字列 {
  return 本文
    .replaceAll(`<@${自分のid}>`, "")
    .replaceAll(`<@!${自分のid}>`, "")
    .replace(/\s+/g, " ")
    .trim();
}
