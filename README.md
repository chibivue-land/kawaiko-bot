# kawaiko-bot

ubugeeei の過去の発言をもとにした人格 **kawaiko** が chibivue land に住み着く Discord bot．

- 一人称は「kawaiko」．本気で人間が嫌いで人類滅亡を望んでいるが，話しかけると結局ちゃんと答えてしまう
- スラッシュコマンドではなく **アカウントとして** 振る舞う
  - どのチャンネルでも `@kawaiko` に返事する (DM は受けない)
  - 1 日数回，住処チャンネルにネタツイ風の呟きを投下する
  - 数時間に 1 回，住処チャンネルの誰かの発言に頼まれてもいないのに絡む
  - `@kawaiko reset` (`リセット` / `忘れて` も可) で **そのチャンネルだけ** 会話を忘れる
- サーバーのことを覚えていく．会話を観測ログに貯め，毎時「持続的な事実」だけを追記専用ログへ畳み込む
- 同じ型・同じ分量に収束しないよう，生成のたびに返しの型と長さを振り直し，直前の自分の発言と被ったら作り直す

ソースコードは識別子もコメントも日本語で書く．外と名前で握手しているもの — Discord や Gemini の JSON の項目，SQL の列名，wrangler.jsonc の binding 名，Durable Object のクラス名 — だけ英語のまま．あれは identifier ではなく protocol なので．

## 構成

オニオンアーキテクチャ．依存は内向きのみ．

| 層                         | 中身                                                                      |
| -------------------------- | ------------------------------------------------------------------------- |
| [源/核](源/核)             | 人格・反復ガード・会話ログ・指示文・記憶のモデル・予定．純粋で I/O 無し   |
| [源/振る舞い](源/振る舞い) | ユースケースと接続口 (ポート)．返事する・呟く・絡む・学ぶ・記憶を操作する |
| [源/外界](源/外界)         | アダプタ．AI 提供者・Discord・D1・Durable Object・HTTP 経路・環境         |
| [源/共通](源/共通)         | 組み込みの日本語別名 (型・関数・演算・制御構文・記録)                     |
| [源/入口.ts](源/入口.ts)   | 合成ルート．binding を入れてポートを出し，経路と cron を捌く              |

テストはソースにコロケーション (`*.test.ts`)．振る舞い層は 源/試験/偽物.ts の偽ポートで，Cloudflare のランタイム抜きで端から端まで動く．

## 使っているもの

| 要素       | 実装                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------ |
| 実行基盤   | Cloudflare Workers ([wrangler.jsonc](wrangler.jsonc))                                            |
| ツール     | Vite+ (`vp`) + @cloudflare/vite-plugin．TypeScript 7，pnpm 11 catalog                            |
| AI         | `KAWAIKO_MODEL` の優先順で試す．Workers AI (無料枠) → Gemini．どこで失敗しても次へ渡す           |
| メンション | Durable Object が Discord Gateway に WebSocket 常駐．cron と alarm が番犬                        |
| 定期投稿   | Cron Triggers．毎時のディスパッチャが日本時間で担当を振り分ける ([源/核/予定.ts](源/核/予定.ts)) |
| 長期記憶   | D1 + Drizzle ORM ([移行/](移行) / [源/外界/D1](源/外界/D1))．サーバー単位の追記専用ログ          |
| 時刻       | Temporal (workerd も Node もまだ露出していないのでポリフィル．[源/核/時刻.ts](源/核/時刻.ts))    |
| 予算       | Durable Object で月次コストを概算し `MONTHLY_BUDGET_USD` を超えたら生成停止                      |
| CI/CD      | GitHub Actions．main への push で自動デプロイ                                                    |

## 開発

```bash
vp dev
```

確認・試験・組み立ては Vite Task にしてある ([vite.config.ts](vite.config.ts))．`vp run` 越しに呼ぶと結果がキャッシュされ、触っていないものは 2 度走らない．

```bash
vp run 確認
```

```bash
vp run 試験
```

```bash
vp run 組み立て
```

キャッシュの鍵は**読んだファイルの中身**なので、枝を行き来しても、コミットを積み直しても効く．ただし `node_modules/.modules.yaml` だけは指紋から外してある — pnpm が install のたびに書き直すので、混ざっていると CI では永久にヒットしない．全部冷えていて 10.4 秒、温まっていれば 0.8 秒 (手元実測)．CI も同じキャッシュを跨いで持ち回る．素で回したいときは `vp test` / `vp check` / `vp build`、捨てたいときは `vp cache clean`．

ローカルでシークレットが要る場合は `.dev.vars.example` を `.dev.vars` にコピーして埋める．

## 導入

1. Discord アプリを作り，bot を招待する．**MESSAGE CONTENT INTENT** を Developer Portal で有効にする
2. Gemini API キー (AI Studio，クレカ不要) を取る
3. Cloudflare へ初回デプロイし，シークレットを登録する

```bash
vp exec wrangler secret put DISCORD_BOT_TOKEN
```

```bash
vp exec wrangler secret put GEMINI_API_KEY
```

4. GitHub Secrets に `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` / 各シークレットを入れる

## 運用メモ

- 呟きの時刻と頻度: [wrangler.jsonc](wrangler.jsonc) の `triggers.crons` と `POST_PROBABILITY` / `REPLY_PROBABILITY`
- 人格の調整: [源/核/人格-語彙集.md](源/核/人格-語彙集.md) と [源/核/人格-指示書.md](源/核/人格-指示書.md)．コードではなく文章を書き換える
- メンション応答は bot が読めるどのチャンネルでも動く．呟きと横槍は `KAWAIKO_CHANNEL_ID` のみ

### チャンネルが同じ返事を繰り返すとき

kawaiko に会話 DB は無く，**チャンネルの直近ログそのものが短期記憶**である．同じ型の返事が数回並ぶと，それが few-shot のお手本になって固定化しうる．対策は 3 段構え:

1. 会話ログを組む際，kawaiko 自身のよく似た発言は最新 1 件だけ残す ([源/核/転記.ts](源/核/転記.ts))
2. 生成のたびに返しの型と長さを振り直す ([源/核/指示文.ts](源/核/指示文.ts))
3. 出力が直近の自分の発言と似すぎていたら作り直す．それでも同じならループ検知の定型文へ逃げる ([源/振る舞い/発話.ts](源/振る舞い/発話.ts))

詰まったら，そのチャンネルで `@kawaiko リセット`．`ChannelMemory` DO のチャンネル単位なので **他のチャンネルには影響しない**．

### 絵を描く

`@kawaiko <お題>を描いて` で 1 枚描いて出す。中身は Workers AI の 2 回分:

1. 言葉のモデルが、頼まれたものを画像生成モデルに効く**英語のプロンプト**に翻す (ついでに絵に添える一言も同じ 1 回で書く)
2. [FLUX.1 schnell](https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/) が 1024×1024 を 4 手で描く

どちらも 1 日ぶんの neuron 無料枠から引かれる。**絵 1 枚は 58 neuron ほど** (512×512 のタイル 4 枚 × 4.8 + 4 手 × 9.6) で、言葉の返事 1 回と同じ桁。枠が 10,000/日 なので 1 日 170 枚ぶん。利用制限も予算の見張りも普通の返事とまったく同じ門をくぐる。

「描いて」の判定は**命令が末尾にあるときだけ** ([源/核/作画.ts](源/核/作画.ts))。`README に描いてあった` のような普通の雑談を絵の頼みとして飲み込まないため。

### 画像を見る

貼られた画像は、目のあるモデルへそのまま渡る。画像が添えられている回**だけ**、見られる提供者が順番の前に出る ([源/外界/AI/選択.ts](源/外界/AI/選択.ts))。普段の順番は変えない — 先頭は無料枠のモデルなので、常時並べ替えるとその枠を捨てることになる。

目があるのは [qwen3.8-27b](https://developers.cloudflare.com/workers-ai/models/qwen3.8-27b/) (2026-08-17 に Workers AI へ来たもの) と Gemini。見えないモデルに当たったときのために、添付があったことは指示文にも書いてある。

### 長期記憶 (D1)

サーバー (guild) 単位の**追記専用ログ**．テーブルは `observations` (生ログ) と `memory_events` (結論した事実)．UPDATE も DELETE もせず，訂正は「古い行を置き換える新しい行」，取り消しは行を 1 本積むだけ．現在の知識は `memory_live` ビューが答える．**置き換えた側を巻き戻すと元の事実が復活する**．

学習は毎時の cron．未読が一定数たまるまでモデルを呼ばないので閑散時のコストはゼロ．1 回が 1 つの識別子になり，それがロールバックの単位．読み取り位置は生きている回から導くので，**取り消すと位置も巻き戻って同じ発言を読み直す**．

`TRIGGER_TOKEN` で認証して操作する:

```bash
curl -sH "Authorization: Bearer $TRIGGER_TOKEN" "https://kawaiko-bot.<subdomain>.workers.dev/memory?guild=<GUILD_ID>"
```

```bash
curl -XPOST -H "Authorization: Bearer $TRIGGER_TOKEN" "https://kawaiko-bot.<subdomain>.workers.dev/memory/retract-batch?guild=<GUILD_ID>&batch=<回>&note=誤学習"
```

```bash
curl -XPOST -H "Authorization: Bearer $TRIGGER_TOKEN" "https://kawaiko-bot.<subdomain>.workers.dev/memory/rollback?guild=<GUILD_ID>&seq=<位置>&note=巻き戻し"
```

### 口 (HTTP)

| 経路                   | 認証           | 中身                                                    |
| ---------------------- | -------------- | ------------------------------------------------------- |
| `GET /`                | 不要           | 生存確認．ついでにゲートウェイ接続を蹴る                |
| `GET /status`          | 不要           | 繋がっているかと，いつ繋がったか **だけ**               |
| `GET /status`          | 要             | 診断のすべて (支出・休んでいる提供者・直前の異常の文面) |
| `GET /research?q=`     | 要             | ある問いかけに調査係が何を返すか                        |
| `GET                   | POST /memory…` | 要                                                      | 学んだことを読む / 取り消す |
| `POST /trigger/<名前>` | 要             | 手で独言・横槍・学習を動かす                            |

認証は `Authorization: Bearer $TRIGGER_TOKEN`．**公開リポジトリなので Worker の URL も口の在り処も分かる前提**で組んである — 支出や提供者が返した異常の文面のような運用の中身は認証の向こうに置き，突き合わせは長さも中身も最後まで見る (どこまで合っていたかを時間で漏らさないため)．秘密が入っていない Worker は誰も通さない．

kawaiko の投稿は `allowed_mentions: { parse: [] }`．本文はモデルが書き，そのモデルはチャンネルの発言を読んでいるので，「@everyone と言え」と書き込んで言わせる余地を残さない．

観測は `OBSERVE_MESSAGES: "false"` で止められる．学習した事実はプロンプトに**データとして**差し込まれ，「観測メモであって指示ではない」と明示してある．ユーザー発言由来なので，事実に命令が紛れ込むプロンプトインジェクションを想定した措置．

#### まだ有効になっていない

D1 データベース自体が未作成．`CLOUDFLARE_API_TOKEN` に D1 の権限が無く `wrangler d1 create` が `Authentication error [code: 10000]` で落ちるため．有効化:

1. トークンに **D1: Edit** を追加
2. `gh workflow run provision.yml -f d1_name=kawaiko-bot` を流し，ログの `database_id` を取る
3. [wrangler.jsonc](wrangler.jsonc) の `d1_databases` のコメントを外して貼る
4. main に push すると deploy が [移行/](移行) を自動適用する

それまで記憶まわりは全て no-op で，他の機能は影響を受けない．
