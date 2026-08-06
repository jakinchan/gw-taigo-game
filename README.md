# 营养工厂 / 栄養ファクトリー — 健康食品クロスボーダー EC ミニプログラム

WeChat ミニプログラム（Taro + React + TypeScript）と NestJS API による、健康食品の越境 EC システムです。
中国語（簡体字）をデフォルトに、日本語への切り替えに対応しています。

> **⚠️ 法規制について — 実装前に必ずお読みください**
> 本リポジトリはアプリケーションの雛形であり、法務レビューを代替するものではありません。
> 詳細は [法規制・コンプライアンス](#法規制コンプライアンス) を必ず確認してください。

---

## 目次

- [構成](#構成)
- [ディレクトリ構造](#ディレクトリ構造)
- [セットアップ](#セットアップ)
- [設計の要点](#設計の要点)
- [API 一覧](#api-一覧)
- [WeChat Pay 越境決済](#wechat-pay-越境決済)
- [多言語対応](#多言語対応)
- [デザインシステム](#デザインシステム)
- [セキュリティ](#セキュリティ)
- [パフォーマンス](#パフォーマンス)
- [法規制・コンプライアンス](#法規制コンプライアンス)
- [本番リリース前チェックリスト](#本番リリース前チェックリスト)

---

## 構成

| レイヤー | 技術 |
| --- | --- |
| ミニプログラム | Taro 3.6 / React 18 / TypeScript 5 / Sass |
| 状態管理 | zustand（カート・ユーザー・言語・表示設定） |
| 多言語 | 自前の軽量 i18n（`src/services/i18n.ts`） |
| API | NestJS 10 / TypeScript / Prisma 5 |
| DB | PostgreSQL |
| 決済 | WeChat Pay APIv3 小程序支付（越境収単） |

### なぜ i18next ではないのか

ミニプログラムのメインパッケージには 2MB のサイズ上限があります。必要なのは
「辞書の切り替え」と「プレースホルダ置換」だけなので、i18next（+ react-i18next）を
入れるより自前実装のほうが数十 KB 得をします。型安全性も `TranslationKey` 型で
確保しており、存在しないキーはコンパイルエラーになります。

---

## ディレクトリ構造

```
.
├── config/                     # Taro ビルド設定（dev / prod で API_BASE_URL を切替）
├── scripts/
│   └── gen-tabbar-icons.js     # tabBar アイコン・ロゴの PNG 生成（依存ゼロ）
├── src/
│   ├── app.tsx                 # 起動処理（言語同期・為替取得・セッション復元）
│   ├── app.config.ts           # ページ登録 / tabBar 定義
│   ├── app.scss                # グローバルスタイル
│   ├── index.html              # H5 ビルド用
│   ├── assets/                 # ロゴ・tabBar アイコン（スクリプトで生成）
│   ├── components/
│   │   ├── BrandHeader/        # ブランド行 + 検索バー（カプセルボタン回避込み）
│   │   ├── Banner/             # キャンペーンバナー（Swiper）
│   │   ├── QuickEntries/       # 首页のクイック導線 5 つ
│   │   ├── ChipTabs/           # 横スクロールのカテゴリチップ
│   │   ├── SideDock/           # 右端の縦フローティングボタン 4 つ
│   │   ├── ProductCard/        # 商品カード（grid3 / grid2 / compact）
│   │   ├── PriceTag/           # 価格表示（CNY + JPY 併記）
│   │   ├── QuantityStepper/    # 数量選択（− 1 ＋）
│   │   ├── LanguageSwitcher/   # 言語切替（compact / segmented）
│   │   ├── Loading/            # ローディング（長時間時にキャンセル導線）
│   │   └── Empty/              # 空状態
│   ├── hooks/
│   │   └── useHeaderHeight.ts  # カスタムヘッダーの実高さ計算
│   ├── locales/
│   │   ├── zh-CN.ts            # 简体中文（キーの正本）
│   │   ├── ja-JP.ts            # 日本語（キー欠落は型エラー）
│   │   └── index.ts            # TranslationKey 型
│   ├── pages/
│   │   ├── index/              # 首页（tabBar 1）バナー→5導線→チップ→3カラム
│   │   ├── products/           # 全部商品（tabBar 2）发货/众筹 + サイドバー + 2カラム
│   │   ├── user/               # 我的（tabBar 3）3指標 + 券包 + 注文5区分
│   │   ├── product/            # 商品详情页
│   │   ├── search/             # 検索（履歴・人気キーワード）
│   │   ├── cart/               # 购物车
│   │   ├── checkout/           # 确认订单・決済
│   │   ├── order/              # 订单列表
│   │   ├── address/            # 地址管理（一覧・編集）
│   │   ├── settings/           # 设置（言語・通貨表示）
│   │   ├── lottery/            # 幸运大抽奖（3x3 ルーレット）
│   │   ├── points/             # 积分商城（交換・クーポン・签到）
│   │   ├── consult/            # 加健康顾问（QR コード）
│   │   └── newarrival/         # 人气新品
│   ├── services/
│   │   ├── api.ts              # REST クライアント（キャッシュ TTL を一元管理）
│   │   ├── wechatPay.ts        # WeChat Pay 連携
│   │   ├── i18n.ts             # 多言語ストア + フック
│   │   └── mock.ts             # 開発用モック（本番では未使用）
│   ├── store/
│   │   ├── cart.ts             # カート（ローカル永続化 + tabBar バッジ）
│   │   ├── user.ts             # ユーザーセッション
│   │   └── preference.ts       # JPY 併記のオン/オフ
│   ├── styles/
│   │   ├── variables.scss      # デザイントークン
│   │   └── mixins.scss         # 共通 mixin
│   ├── types/index.ts          # ドメイン型（API と 1:1）
│   └── utils/
│       ├── currency.ts         # CNY/JPY 換算・整数金額のフォーマット
│       ├── image.ts            # 画像 CDN の WebP / リサイズ URL 生成
│       ├── request.ts          # 通信・認証・キャッシュ・エラー正規化
│       └── storage.ts          # 型付きローカルストレージ
│
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       # データモデル
│   │   └── seed.ts             # 開発用シード
│   ├── src/
│   │   ├── main.ts             # 起動（helmet / ValidationPipe / raw body）
│   │   ├── app.module.ts
│   │   ├── auth/               # 微信ログイン → JWT
│   │   ├── products/           # 商品・カテゴリ・レビュー
│   │   ├── orders/             # 注文（FEFO 在庫引き当て・金額確定）
│   │   ├── payment/            # WeChat Pay APIv3・支付通知
│   │   ├── users/              # プロフィール・住所
│   │   ├── coupons/            # クーポン検証・消し込み
│   │   ├── fx/                 # CNY→JPY 参考レート
│   │   └── common/             # Prisma・例外フィルタ・レスポンス整形
│   └── .env.example
└── project.config.json
```

---

## セットアップ

### 1. ミニプログラム

```bash
npm install
```

tabBar アイコンとロゴは Git 管理下にありますが、作り直す場合は次のコマンドで再生成できます。

```bash
node scripts/gen-tabbar-icons.js
```

開発ビルド（`dist/` に出力され、微信開発者ツールで開く）:

```bash
npm run dev:weapp
```

微信開発者ツールでプロジェクトルートを開き、`project.config.json` の `appid` を
自分の AppID に差し替えてください。バックエンドが `http://localhost:3000` の間は
開発者ツールの「詳細 → ローカル設定 → 合法域名のチェックをスキップ」を有効にします。

型チェックのみ:

```bash
npm run typecheck
```

> **webpack のバージョンについて**
> Taro 3.6.34 の `webpack5-runner` は webpack `^5.78.0` を前提にしており、
> webpack 5.95 以降で `ProgressPlugin` のオプション検証が厳格化された結果、
> ビルドが `ValidationError` で落ちます。`package.json` の `overrides` で
> `5.91.0` に固定しているので、外さないでください。

### プレースホルダ画像

商品写真・バナーは CDN 配信ですが、未入稿の段階で壊れた画像が並ぶと
レイアウトの検証ができません。ブランドカラーの代替画像を同梱しています。

```bash
node scripts/gen-placeholder-images.js
```

`components/SafeImage` が読み込み失敗時に自動でこれへ差し替えます。
1KB 未満の画像はビルド時に base64 としてインライン化されます。

### 2. バックエンド

```bash
cd backend
npm install
cp .env.example .env      # 値を埋める
npx prisma migrate dev --name init
npm run seed              # 開発用データ投入（本番では実行しないこと）
npm run start:dev
```

API は `http://localhost:3000/api`、Swagger は `http://localhost:3000/api/docs`（開発時のみ）。

### 3. バックエンドなしで画面だけ確認する

`NODE_ENV=development` のとき、商品系 API が失敗すると `src/services/mock.ts` の
データにフォールバックします。API サーバを立てずに UI を確認できます。
本番ビルドではフォールバックせずエラーになります（偽の在庫・価格を表示しないため）。

---

## 設計の要点

### 金額は必ず「最小通貨単位の整数」

CNY は分（`12800` = ¥128.00）、JPY は円で保持します。浮動小数で金額を持つと
丸め誤差で 1 分ずれ、決済照合が破綻します。DB も `Int` です。

### 請求額の正本はサーバ

`checkout` 画面が表示する金額は、すべて `POST /api/orders/preview` の戻り値です。
送料・税・割引をクライアントで計算して表示すると、サーバの確定額とズレたときに
「表示と違う額が引き落とされた」という最悪のクレームになります。
注文作成時もクライアントから受け取るのは `productId` と `quantity` だけで、
単価は必ず DB から引きます。

### 在庫は FEFO（First Expired, First Out）

健康食品は賞味期限管理が必須なので、在庫は `StockBatch`（ロット）単位で持ち、
期限が近いロットから引き当てます。商品詳細ページに表示する賞味期限も
「実際に出荷されるロット」のものです。

引き当ては `updateMany` の条件付き更新による楽観ロックで行い、同時注文で
在庫がマイナスになるのを防ぎます（`orders.service.ts` の `allocateFefo`）。

### 抽選はサーバが引く

景品に現物と免単（注文の無料化）が含まれるため、当選判定をクライアントに
置くとパッケージ解析で書き換えられ、金銭的な被害に直結します。
当選判定・積分の消費・在庫の減算は `backend/src/lottery` の 1 トランザクション
で完結させ、クライアントは返ってきた `slot` まで演出を回して止めるだけです。

乱数は `crypto.randomInt` を使います。`Math.random` は内部状態を推測すると
次の出目を予測できるため、景品が絡む抽選には使えません。

通信断による再送で二重に積分を引かないよう、`idempotencyKey` で
1 回だけ成立させます。

### 決済の確定は支付通知が正本

`wx.requestPayment` の `success` は「決済ダイアログが正常に閉じた」ことしか
保証しません。入金の確定は微信からサーバへの支付通知です。
小程序側は決済後にサーバへポーリングし（指数バックオフ、最大 5 回）、
サーバ側は通知が遅れている場合に備えて微信へ直接照会します。

---

## API 一覧

すべてのレスポンスは `{ code, message, data }` に統一されています（`code: 0` が成功）。

| メソッド | パス | 認証 | 説明 |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | – | 微信 `code` → JWT |
| GET | `/api/categories` | – | カテゴリ一覧 |
| GET | `/api/home-feed` | – | トップページ用データ（1 往復） |
| GET | `/api/products` | – | 商品一覧（カテゴリ・検索・並び替え・ページング） |
| GET | `/api/products/:id` | – | 商品詳細（在庫ロット・賞味期限込み） |
| GET | `/api/products/:id/reviews` | – | レビュー |
| GET | `/api/products/:id/related` | – | 関連商品 |
| GET | `/api/fx/cny-jpy` | – | CNY→JPY 参考レート |
| GET | `/api/lottery/board` | – | 抽選盤の賞品（確率・在庫は返さない） |
| GET | `/api/lottery/status` | ✔ | 保有積分と本日の残り回数 |
| POST | `/api/lottery/draw` | ✔ | 抽選の実行（サーバ抽選・冪等） |
| GET | `/api/lottery/prizes` | ✔ | 当選履歴 |
| POST | `/api/users/me/real-name` | ✔ | 実名認証の登録 |
| GET | `/api/users/me/cross-border-quota` | ✔ | 越境EC の年間購入枠 |
| POST | `/api/coupons/validate` | ✔ | クーポン検証・割引額算出 |
| GET | `/api/users/me` | ✔ | プロフィール |
| PUT | `/api/users/me` | ✔ | プロフィール更新 |
| GET/POST | `/api/users/me/addresses` | ✔ | 住所一覧・追加 |
| PUT/DELETE | `/api/users/me/addresses/:id` | ✔ | 住所更新・削除 |
| GET | `/api/users/me/coupons` | ✔ | 保有クーポン |
| POST | `/api/orders/preview` | ✔ | 金額プレビュー（送料・税・割引） |
| POST | `/api/orders` | ✔ | 注文作成（在庫引き当て） |
| GET | `/api/orders` | ✔ | 注文一覧 |
| GET | `/api/orders/:id` | ✔ | 注文詳細 |
| POST | `/api/orders/:id/cancel` | ✔ | キャンセル（未払いのみ） |
| POST | `/api/payment/wechat` | ✔ | 決済パラメータ発行 |
| GET | `/api/payment/status/:orderNo` | ✔ | 入金確定の確認 |
| GET | `/api/payment/quote/:orderNo` | ✔ | 越境決済の精算見込み |
| POST | `/api/payment/wechat/notify` | 署名 | 支付通知（微信から） |

---

## WeChat Pay 越境決済

### 決済フロー

```
小程序                        API サーバ                    微信支付
  │                             │                             │
  ├─ POST /orders ─────────────▶│  在庫引き当て・金額確定       │
  │◀─ order（orderNo, 金額）────┤                             │
  │                             │                             │
  ├─ POST /payment/wechat ─────▶├─ /v3/pay/transactions/jsapi ▶│
  │                             │◀─ prepay_id ────────────────┤
  │◀─ paySign 付きパラメータ ───┤  （署名はサーバ側で生成）     │
  │                             │                             │
  ├─ wx.requestPayment ────────────────────────────────────────▶│
  │◀─ ダイアログが閉じる ───────────────────────────────────────┤
  │                             │                             │
  │                             │◀─ 支付通知（AES-256-GCM）────┤
  │                             │   金額突合 → 注文を確定       │
  ├─ GET /payment/status ──────▶│                             │
  │◀─ { paid: true } ───────────┤                             │
```

### CNY 表示・JPY 入金

顧客は**人民元建て**で支払い、加盟店（海外法人）には契約通貨（JPY）で入金されます。
換算レートとタイミングは微信支付／決済代行が精算時に確定させるため、
**アプリが表示する日本円額は参考値であり、入金額と一致しません**。

この前提を守るため、実装は以下のようになっています。

- API に渡す金額は常に CNY の「分」（`amount.total`, `currency: 'CNY'`）
- JPY 換算は表示専用（`src/utils/currency.ts` / `backend/src/fx/`）
- 注文時のレートを `Order.fxRate` に固定保存し、後から注文履歴を見ても表示がブレない
- 為替 API が前回比 ±20% を超えるレートを返した場合は採用しない（異常値対策）
- UI には常に「汇率仅供参考，以实际结算为准 / 為替レートは参考値です」を併記

### 決済代行（SBPS など）を使う場合

小程序から見たフローは変わりません（`prepay_id` → `wx.requestPayment`）。
`prepay_id` を発行する相手が代行会社に変わるだけです。
`PAYMENT_PROVIDER` 環境変数で切り替えられるようにしてあります。
参考: https://developer.sbpayment.jp/en/payment-service/overseas/wechat-pay/4973/

### 秘密鍵の扱い

`paySign` は必ずサーバ側（APIv3 秘密鍵を持つ NestJS）で生成します。
秘密鍵をミニプログラムに埋め込むと、パッケージを解析されて悪用されます。
`.env` の `WECHAT_MCH_PRIVATE_KEY_PATH` はローカル開発用で、
**本番では KMS / Secrets Manager から読み込んでください**。

---

## 多言語対応

- デフォルトは簡体中国語。保存済み設定 → 端末言語 → 既定 の順に解決します
- 言語設定はローカルストレージ（`hfs:locale`）に保存されます
- 商品名・説明は API が `{ "zh-CN": "...", "ja-JP": "..." }` の形で返し、`tx()` で表示言語を選びます
- UI 文言は `t('product.addToCart')` のようにドット区切りキーで参照します。
  存在しないキーはコンパイルエラーになります
- `ja-JP.ts` は `TranslationSchema` 型により、`zh-CN.ts` のキーが 1 つでも欠けるとビルドが通りません
- tabBar のラベルは静的定義なので、切り替え時に `Taro.setTabBarItem` で書き換えます

### 文言を追加する

1. `src/locales/zh-CN.ts` にキーを追加
2. `src/locales/ja-JP.ts` に同じキーを追加（忘れると型エラーで気付けます）
3. `t('セクション.キー')` で参照

---

## デザインシステム

トークンは `src/styles/variables.scss` に集約しています。

### カラー

参照アプリ（营养工厂 / UndoAge）の実画面に合わせ、メインカラーは青です。

| 用途 | 値 |
| --- | --- |
| メイン | `#2B5CE6` |
| メイン（濃・押下時） | `#1F47BD` |
| 淡背景・タグバー・チップ | `#EAF1FF` |
| アクセント（抽選・セールリボン） | `#FF6B1A` |
| 券包バナー | `#FF3D8B` |
| 本文 | `#1A1A1A` |
| 参考価格（取り消し線） | `#B0B4BA` |
| 背景 | `#F2F3F5` |

価格・ボタン・チップ・リボンはすべてメインカラー系で統一しています。

### タイポグラフィ

`designWidth: 750` のため、SCSS に書く `px` は iPhone の論理ポイント（pt）と 1:1 で対応します。

| 用途 | サイズ |
| --- | --- |
| 見出し | 22px（= 22pt / 44rpx） |
| 本文 | 17px |
| 補助 | 15px |
| ボタン | 14px |
| 注釈 | 12px |

フォントは中国語・日本語の両方で破綻しないシステムフォントスタックを使用しています
（PingFang SC / Hiragino / Yu Gothic / Noto Sans SC・JP）。

### アクセシビリティ

- タップ領域は最低 44×44pt を確保（`@include expand-tap-area`）。
  視覚サイズが小さいアイコンボタンでも、擬似要素で判定範囲を広げています
- 本文は 17px（15px を下回らない）
- 画像に重ねるテキストにはグラデーションを敷いてコントラストを確保

### 画面構成（参照アプリ準拠）

tabBar は **3 つ**（首页 / 全部商品 / 我的）。カートは tabBar に置かず、
商品詳細のフッターから開きます。`Taro.switchTab` は tabBar ページにしか
使えないため、遷移先がこの 3 つ以外なら必ず `navigateTo` を使ってください。

商品カードは情報密度が高く、次の要素で構成されます。

| 要素 | 内容 |
| --- | --- |
| 斜めリボン（右上） | 「本品TOP1」「大牌保健」「历史低价」 |
| 容量バッジ | 「4个月量大规格」 |
| 価格 | 「折后」+ ¥69 + `/月` |
| 参考価格 | 「市面同品质 ¥300~¥500」（取り消し線） |
| サムネイル | 価格の右側に小さく配置 |
| 下部タグバー | 「现货·限时 85 折」「部分地区次日达」 |

これらは `Product` 型の `ribbon` / `specLabel` / `priceUnit` /
`marketPriceRange` / `footerTag` / `stockLabel` に対応します。

### ローディングとフィードバック

- アニメーションは 1 種類のみ（`loading-pulse`）。`src/components/Loading` に集約
- 5 秒を超えたらキャンセルボタンを表示
- 操作結果は Toast、確認は Modal
- フォームエラーは該当フィールドの直下に表示（`src/pages/address/edit.tsx`）

---

## セキュリティ

| 項目 | 実装 |
| --- | --- |
| 認証 | 微信 `code2session` → JWT（7 日）。401 で 1 回だけ自動再ログイン |
| `session_key` | サーバ内に留め、クライアントへは絶対に返さない |
| 入力値検証 | `ValidationPipe`（`whitelist` + `forbidNonWhitelisted`）で想定外フィールドを拒否 |
| SQL インジェクション | Prisma のパラメータ化クエリ。生 SQL は使用しない |
| 決済署名 | すべてサーバ側。秘密鍵はクライアントに置かない |
| 支付通知 | 生ボディで署名検証 → AES-256-GCM 復号 → **金額突合** → 冪等に処理 |
| 認可 | 注文・住所は `where: { id, userId }` で必ず所有者を条件に含める |
| レート制限 | グローバル 120 req/min、ログイン 10/min、注文作成 10/min、決済 20/min |
| エラー情報 | 本番では内部エラーの詳細を返さない（スタックトレース・SQL の漏洩防止） |
| 個人情報 | レビュアー名・電話番号はマスクして返す。身分証番号は暗号化保存 |
| HTTPS | 微信小程序の要件。`request` 合法域名への登録が必須 |
| HTTP ヘッダ | `helmet` |

### まだ実装が必要な箇所

- **支付通知の署名検証**：`payment.controller.ts` にコメントで手順を記載していますが、
  `/v3/certificates` からのプラットフォーム証明書取得とキャッシュ、
  証明書ローテーションへの追随は未実装です。**本番前に必ず実装してください**
- 身分証番号の AES-256-GCM 暗号化（スキーマは用意済み、暗号化処理は未実装）

---

## パフォーマンス

- **リクエスト数削減**：トップページは `/home-feed` で 1 往復
- **キャッシュ**：カテゴリ 30 分 / 商品一覧 3 分 / 商品詳細 1 分 / 為替 6 時間。
  TTL は `src/services/api.ts` に集約しています
- **画像**：CDN の URL パラメータで WebP 変換 + リサイズ + DPR 対応（`src/utils/image.ts`）。
  端末の `pixelRatio` に応じた解像度を要求し、最大 3 倍で頭打ちにします
- **遅延読み込み**：一覧の `<Image lazyLoad />`、詳細ページのレビュー・関連商品は
  タブが開かれてから取得
- **N+1 回避**：在庫集計は `groupBy` 相当のクエリ 1 回にまとめています
- **パッケージサイズ**：`lazyCodeLoading: 'requiredComponents'`、
  `optimizeMainPackage`、i18next 不採用

---

## 法規制・コンプライアンス

**このリポジトリのコードは法務レビューを代替しません。**
本番展開の前に、必ず中国の法規制に詳しい専門家の確認を受けてください。

### 確認が必要な主な事項

**健康食品の表示**

- 保健食品（「蓝帽子」）として販売するには**保健食品批准文号**が必要です。
  スキーマの `approvalNumber` は取得済みの番号を格納するためのもので、
  番号がない商品を保健食品として訴求することはできません
- 《广告法》《食品安全法》により、疾病の予防・治療効果を示唆する表現は禁止されています。
  「治る」「効く」「予防する」等の断定表現は使用できません
- `product.healthDisclaimer`（「本品不能代替药物」）を全ページに表示していますが、
  法定表記の要件は商品区分ごとに異なります
- 商品説明の文言は CMS 側で法務承認済みのもののみを登録する運用にしてください

**越境 EC（跨境电商）**

- 《跨境电子商务零售进口商品清单》（ポジティブリスト）に掲載された品目のみ販売可能です
- 購入者の**実名認証**が必要です（`User.realNameVerified`）。
  注文者・支払者・受取人の三者一致（「三单对碰」）が求められます
- 年間 26,000 元・1 回 5,000 元の購入限度額があります（**本リポジトリでは未実装**）
- 海关総署への注文・決済・物流の三伝票の申告が必要です（`CUSTOMS_*` 環境変数は枠のみ）
- 跨境电商综合税の税率は品目（HS コード）ごとに異なります。
  `orders.service.ts` の `CROSS_BORDER_TAX_RATE` は概算値なので、
  商品ごとの税率テーブルに置き換えてください

**個人情報**

- 《个人信息保护法》（PIPL）に基づく同意取得・越境移転の手続きが必要です。
  日本のサーバでデータを処理する場合、越境移転の安全評価または標準契約が求められます

**ミニプログラム審査**

- 食品販売には《食品经营许可证》の提出が必要です
- 越境 EC には対応する資質（跨境电商企業備案など）が必要です

---

## ビルド検証の状況

| 対象 | コマンド | 結果 |
| --- | --- | --- |
| ミニプログラム 型チェック | `npm run typecheck` | 通過 |
| ミニプログラム ビルド | `npm run build:weapp` | 通過（15 ページ / 0.53 MB） |
| バックエンド Prisma | `npx prisma generate` | 通過 |
| バックエンド 型チェック | `npx tsc --noEmit` | 通過 |
| バックエンド ビルド | `npm run build` | 通過 |

DB を用意しないと確認できない部分（マイグレーション適用、シード投入、
実際の注文フロー）は未検証です。`docker run -p 5432:5432 -e POSTGRES_PASSWORD=password postgres:16`
などで DB を立ててから `npx prisma migrate dev` を実行してください。

---

## 本番リリース前チェックリスト

- [ ] `project.config.json` の `appid` を実際の AppID に変更
- [ ] `config/prod.ts` の `API_BASE_URL` を本番ドメインに変更
- [ ] 微信公众平台で `request` / `downloadFile` の合法域名を登録
- [ ] `JWT_SECRET` を `openssl rand -base64 48` で生成した値に変更
- [ ] 商户 API 秘密鍵を KMS / Secrets Manager 経由に切り替え
- [ ] **支付通知の署名検証を実装**（プラットフォーム証明書の取得・キャッシュ含む）
- [ ] `WECHAT_PAY_NOTIFY_URL` を HTTPS の到達可能な URL に設定
- [ ] 越境 EC の購入限度額チェックを実装
- [ ] 海关申告連携を実装
- [ ] 商品ごとの HS コード・税率テーブルを整備
- [ ] 身分証番号の暗号化処理を実装
- [ ] `src/assets/` のロゴ・tabBar アイコンを本番デザインに差し替え
- [ ] 商品画像を CDN に配置し、`src/utils/image.ts` の CDN パラメータ形式を確認
- [ ] 商品説明・効能表記の法務レビュー
- [ ] `npm run seed` を本番 DB に対して実行しないことを確認
- [ ] Swagger（`/api/docs`）が本番で無効になっていることを確認
- [ ] Sentry など監視の設定

---

## ライセンス

社内利用を想定した雛形です。EC のドメインモデルは
[weiit-saas](https://gitee.com/wei-it/weiit-saas) の構成を参考にしていますが、
コードの流用はしていません。
