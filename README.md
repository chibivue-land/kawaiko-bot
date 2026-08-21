# kawaiko-bot

ubugeeei の過去の発言をもとにした人格 **kawaiko** が chibivue land に住み着く Discord bot。

- 一人称は「kawaiko」。本気で人間が嫌いで人類滅亡を望んでいるが、話しかけると結局ちゃんと答えてしまう
- スラッシュコマンドではなく **アカウントとして** 振る舞う:
  - サーバーの任意のチャンネルで `@kawaiko` メンションすると返事する (DM は受けない)
  - 1 日数回、住処チャンネルにネタツイ風の呟きを投下する
  - 2 時間に 1 回くらい、住処チャンネルの誰かの発言に頼まれてもいないのにリプライする
  - 返事の生成中は「kawaiko が入力中…」が出る
  - `@kawaiko reset` (または `リセット` / `忘れて`) で **そのチャンネルだけ** 記憶を捨てる
- 最新情報が必要なら web 検索 (Google Search グラウンディング) して答える
- 同じ言い回し・同じ分量に収束しないよう、生成のたびに「返しの型」と「長さ」を振り直し、直前の自分の発言との類似度を測って被ったら生成し直す

## アーキテクチャ

すべて Cloudflare で完結し、すべてコードで管理する (IaC)。

| 要素                     | 実装                                                                                                                                                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 実行基盤                 | Cloudflare Workers ([wrangler.jsonc](wrangler.jsonc))                                                                                                                                                                                    |
| ツールチェイン           | [Vite+](https://github.com/voidzero-dev/vite-plus) (`vp`) + [@cloudflare/vite-plugin](https://developers.cloudflare.com/workers/vite-plugin/)。タスクは npm scripts ではなく Vite Task ([vite.config.ts](vite.config.ts) の `run.tasks`) |
| AI                       | Gemini 3.7 Flash (`gemini-3.7-flash`)。激安 ($0.75/$3.75 per 1M tokens) + 無料枠あり + Google Search グラウンディングでブラウジング・推論の要件を満たす。`KAWAIKO_MODEL` で差し替え可                                                    |
| メンション受信           | Durable Object ([src/gateway.ts](src/gateway.ts)) が Discord Gateway に WebSocket 常駐接続。5 分ごとの cron + alarm が watchdog として再接続する                                                                                         |
| 定期呟き                 | Cron Triggers (4 スロット/日 × `POST_PROBABILITY` ≒ 平均 3 回/日、[src/mutter.ts](src/mutter.ts))                                                                                                                                        |
| ランダムリプ             | Cron (2 時間ごと × `REPLY_PROBABILITY`、[src/replier.ts](src/replier.ts))。住処チャンネルの直近 3 時間の人間の発言から 1 つ選んで絡む                                                                                                    |
| ユーザーごとのレート制限 | Durable Objects (SQLite)。Discord ユーザー ID ごとに 5 回/時・20 回/日 (vars で変更可)                                                                                                                                                   |
| 予算ガード               | Durable Objects で月次コストを概算し `MONTHLY_BUDGET_USD` (既定 $100) を超えたら生成停止                                                                                                                                                 |
| 反復ガード               | [src/repetition.ts](src/repetition.ts) が直前の自分の発言との類似度 (文字 bigram の Dice 係数) を測り、被ったら生成をやり直す                                                                                                            |
| チャンネル記憶           | Durable Object `ChannelMemory` (チャンネル ID ごとに 1 インスタンス)。`@kawaiko reset` の時刻を保持し、それ以前のログを無視する                                                                                                          |
| CI/CD                    | GitHub Actions ([ci.yml](.github/workflows/ci.yml) / [deploy.yml](.github/workflows/deploy.yml))。main への push で自動デプロイ                                                                                                          |
| 人格                     | [src/persona/ubugeeei.md](src/persona/ubugeeei.md) — 公開発言から観測した文体コーパス                                                                                                                                                    |
| アイコン                 | [chibivue-land/art の kawaiko_funny.png](https://github.com/chibivue-land/art/blob/main/kawaiko_funny.png) を `vp run sync-avatar` で同期                                                                                                |

## 導入に必要なもの

1. **Discord**: アプリケーション (Bot) の作成権限と、サーバーの招待権限
2. **Google**: [AI Studio](https://aistudio.google.com/) の API キー (**クレカ不要**。無料枠: Flash 系 1,000 リクエスト/日)
3. **Cloudflare**: アカウント (Workers 無料プランで可。Durable Objects は SQLite バックエンドなので無料プランで動く)
4. **GitHub**: このリポジトリの Actions に Secrets/Variables を設定できる権限

### 1. Discord アプリケーション

1. [Discord Developer Portal](https://discord.com/developers/applications) でアプリを作成
2. **General Information** から `APPLICATION ID` を控える
3. **Bot** タブ:
   - トークンを発行して控える
   - **Privileged Gateway Intents → MESSAGE CONTENT INTENT を ON** (メンション本文の読み取りに必須)
4. 招待 URL でサーバーに招待:
   `https://discord.com/oauth2/authorize?client_id=1540328713248440390&scope=bot&permissions=3378438455289920`
   (最低限必要なのは `View Channels` / `Send Messages` / `Read Message History`)
5. **Interactions Endpoint URL は空のまま** にする (この bot は Gateway 常駐型)

### 2. Gemini API キー (クレカ不要)

1. [Google AI Studio](https://aistudio.google.com/) にログイン → **Get API key** でキーを発行 (課金設定なしで OK)
2. 無料枠 (Flash 系 1,000 リクエスト/日 + Google Search グラウンディングの無料枠) で十分動く。**課金を紐付けない限り請求は発生しない** のが事実上のハードリミット
3. 将来有料化する場合は GCP の課金アカウントを紐付けて Budget アラートを設定 (コード側の `MONTHLY_BUDGET_USD` ソフトガードはそのまま効く)

### 3. Cloudflare へ初回デプロイ

```bash
pnpm install
```

`vp` が未インストールなら:

```bash
curl -fsSL https://vite.plus | bash
```

[wrangler.jsonc](wrangler.jsonc) の `vars` を確認・変更:

- `DISCORD_APPLICATION_ID` ← 手順 1-2 の値に書き換える
- `KAWAIKO_CHANNEL_ID` ← 住処チャンネル (既定: chibivue land の呟き部屋)

シークレットを登録:

```bash
pnpm exec wrangler secret put DISCORD_BOT_TOKEN
```

```bash
pnpm exec wrangler secret put GEMINI_API_KEY
```

デプロイとアイコン同期:

```bash
vp run deploy
```

```bash
DISCORD_BOT_TOKEN=... vp run sync-avatar
```

デプロイ後 5 分以内に watchdog cron が Gateway に接続し、bot がオンラインになる。
すぐ確認したい場合は `https://kawaiko-bot.<subdomain>.workers.dev/` を GET すると接続を蹴れる。

### 4. CI/CD (GitHub Actions)

リポジトリに以下を設定すると main への push で自動デプロイされる:

| 種別     | 名前                     | 内容                                |
| -------- | ------------------------ | ----------------------------------- |
| Secret   | `CLOUDFLARE_API_TOKEN`   | Workers 編集権限のある API トークン |
| Secret   | `CLOUDFLARE_ACCOUNT_ID`  | Cloudflare アカウント ID            |
| Secret   | `DISCORD_BOT_TOKEN`      | Discord Bot トークン                |
| Secret   | `GEMINI_API_KEY`         | Gemini API キー                     |
| Variable | `DISCORD_APPLICATION_ID` | アプリケーション ID                 |

**GitHub Secrets が Single Source of Truth。** deploy のたびに `wrangler secret bulk` で
Worker シークレット (`DISCORD_BOT_TOKEN` / `GEMINI_API_KEY`) が自動同期されるので、
CI 運用なら手順 3 の手動 `wrangler secret put` は不要 (ローカルから直接デプロイする場合のみ必要)。

## 開発

```bash
vp dev
```

```bash
vp test
```

```bash
vp check
```

ローカルでシークレットが要る場合は `.dev.vars.example` を `.dev.vars` にコピーして埋める。

## 運用メモ

- 呟き時刻・頻度: [wrangler.jsonc](wrangler.jsonc) の `triggers.crons` と `POST_PROBABILITY` / `REPLY_PROBABILITY`
- レート制限: `RATE_LIMIT_PER_HOUR` / `RATE_LIMIT_PER_DAY`
- 人格の調整: [src/persona/ubugeeei.md](src/persona/ubugeeei.md) (コーパス) と [src/persona/index.ts](src/persona/index.ts) (ルール)
- メンション応答はサーバーの任意のチャンネルで動く (bot が閲覧できれば)。呟きとランダムリプは `KAWAIKO_CHANNEL_ID` のみ

### チャンネルが同じ返事を繰り返すとき

kawaiko には会話 DB がなく、**チャンネルの直近ログそのものが記憶**である。そのため一度同じ型の返事が数回並ぶと、それが few-shot のお手本になって固定化しうる。対策は 3 段構え:

1. トランスクリプトを組むとき、kawaiko 自身のよく似た発言は最新の 1 件だけ残す ([src/discord/transcript.ts](src/discord/transcript.ts))
2. 生成のたびに「返しの型」と「長さ」を振り直す ([src/persona/index.ts](src/persona/index.ts) の `buildDeliveryBlock`)
3. 出力が直近の自分の発言と似すぎていたら作り直す。3 回やっても同じならループ検知の定型文に逃げる ([src/ai/generate.ts](src/ai/generate.ts) の `generateVaried`)

それでも詰まったら、そのチャンネルで `@kawaiko reset` と言えばリセットできる。リセットは `ChannelMemory` DO のチャンネル ID 単位なので、**他のチャンネルには一切影響しない**。認識するのは `reset` / `/reset` / `forget` / `リセット` / `記憶リセット` / `忘れて` など (完全一致、[src/commands.ts](src/commands.ts))。トークンを使わないのでレート制限・予算ガードより前に処理される。
