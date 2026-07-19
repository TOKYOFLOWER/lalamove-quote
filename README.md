# lalamove-quote

生花店の当日配達用に、Lalamove API（Market: JP）で配送料金を即座に見積もれるWebサービスです。
店舗スタッフが「お届け先住所」を入力するだけで、利用可能な全車種（バイク・軽貨物など）の料金・距離を比較表示します。

## 構成

```
[スタッフのスマホ/PC]
      │  ブラウザ
      ▼
docs/ (GitHub Pages / ロリポップ等の静的ホスティング)
  index.html / style.css / app.js / config.js
      │  fetch (POST, text/plain でCORSプリフライト回避)
      ▼
gas/ (Google Apps Script Webアプリ = プロキシ)
  ・APIキー/シークレットを秘匿 (Script Properties)
  ・住所 → 座標変換 (Maps.newGeocoder)
  ・HMAC-SHA256署名を生成してLalamove APIを呼び出し
      │  HTTPS + HMAC署名
      ▼
Lalamove REST API v3 (Sandbox / Production)
  GET  /v3/cities        … 利用可能車種の取得
  POST /v3/quotations    … 見積取得
```

フロントエンド(`docs/`)にAPIキーは一切含まれません。すべてGAS側のScript Propertiesに保管されます。

## セットアップ手順

### 1. Lalamove Partner Portalでキーを取得

1. [Lalamove Partner Portal](https://partner.lalamove.com/) にログイン
2. Sandbox環境の API Key (`pk_test_...`) / API Secret (`sk_test_...`) を発行
3. 本番稼働時は同様にProduction環境の `pk_prod_...` / `sk_prod_...` を発行（後述）

### 2. GASプロジェクトのデプロイ (clasp)

```bash
cd gas
clasp login          # 初回のみ。ブラウザでGoogleアカウント認証
clasp push            # ソースをApps Scriptプロジェクトへ反映
clasp deploy --deploymentId <デプロイID>
```

本プロジェクトは既に以下でデプロイ済みです。

- Apps Scriptエディタ: `https://script.google.com/d/11Ncifx2L0WA9lZ1bDBP3Z7BnF9AJJkmMza_okXkhrcEmEnG5qGWTLBNt/edit`
- WebアプリURL: `https://script.google.com/macros/s/AKfycbyZehgB-IWjSoEG93TS8o5n_SUfsFnnIoZ8CMFlk0IFP4phWvwoWnxtoFKpcjTkgesR/exec`

> **注意**: `clasp push` はソースを反映するだけで、公開中のWebアプリURL(`/exec`)には反映されません。
> コード変更後は必ず `clasp deploy --deploymentId <上記URLのID>` を実行してデプロイを更新してください
> （エディタの「実行」ボタンは常に最新コードを使いますが、`/exec` URLはデプロイ時点のスナップショットです）。

### 3. APIキーの投入（初回のみ・手動）

セキュリティのため、APIキー/シークレットはソースコードやGitに一切含めていません。
上記のApps Scriptエディタを開き、次の手順で一度だけ設定してください。

1. `Setup.gs` を開く
2. 関数一覧から `setCredentials` を選択できないため、エディタ下部のコンソール、または一時的に次の関数を追記して実行します（実行後は削除して保存）。

   ```js
   function _oneTimeSetup() {
     setCredentials(
       'pk_test_xxxxxxxxxxxxxxxx',   // Partner Portalで発行したAPI Key
       'sk_test_xxxxxxxxxxxxxxxx',   // Partner Portalで発行したAPI Secret
       'sandbox',                     // 本番は 'production'
       '東京都中央区銀座1-20-2'         // 集荷元(店舗)住所
     );
     checkConfig();
   }
   ```

3. 関数ドロップダウンで `_oneTimeSetup` を選び「実行」。初回は権限の承認ダイアログが出るので許可する
4. 「実行数」または「ログ」で `checkConfig()` の出力を確認し、キーが設定されたことを確認
5. 追記した `_oneTimeSetup` 関数を削除して保存（平文のキーをコード上に残さないため）
6. 続けて `testCities` → `testQuote` を実行し、Sandboxと疎通できることを確認する

以後の運用でキーをローテーションする場合も同じ手順で `setCredentials(...)` を再実行してください。

### 4. フロントエンドの公開 (GitHub Pages)

このリポジトリの `docs/` フォルダをGitHub Pagesとして公開しています。
`docs/config.js` の `GAS_URL` が上記WebアプリURLを指していることを確認してください。

### 5. ロリポップ等、他のホスティングに配置する場合

`docs/` フォルダの中身（`index.html` / `style.css` / `app.js` / `config.js`）をそのままFTPでアップロードするだけで動作します。
`config.js` の `GAS_URL` は変更不要です（GAS側が住所→料金変換のプロキシとして機能するため）。

## 本番環境への切り替え

1. Lalamove Partner Portalで **Production環境** のAPIキー (`pk_prod_...` / `sk_prod_...`) を発行
   - 本番はウォレットへの事前チャージが必要です（残高不足だと配車依頼が失敗します。見積取得自体は通常無料です）
2. Apps Scriptエディタで `setCredentials('pk_prod_...', 'sk_prod_...', 'production', '<集荷元住所>')` を実行
3. `LALAMOVE_ENV` が `production` になっていることを `checkConfig()` で確認
4. `testQuote()` で本番エンドポイント (`rest.lalamove.com`) への疎通を確認

## レート制限

- Sandbox環境の見積取得(`POST /v3/quotations`)は **30リクエスト/分** に制限されています。
- 本サービスは全車種一括見積時、直列実行 + リクエスト間 **2.2秒** のスリープ (`Code.gs` の `QUOTE_REQUEST_INTERVAL_MS`) でレート制限を回避しています。
- `GET /v3/cities` の結果は `CacheService` で **6時間** キャッシュし、無駄なAPI呼び出しを削減しています。

## 既知の制約

- 見積の有効期限は取得から **約5分** (`expiresAt`)。表示から時間が経った見積は再取得が必要です。
- 日本国内でLalamoveが対応しているのは **関東・関西エリアのみ** です。対象外の住所は `ERR_OUT_OF_SERVICE_AREA` としてエラー表示されます。
- 車種(`serviceType`)キーはハードコードせず `GET /v3/cities` から動的取得しているため、Lalamove側の対応車種変更に自動追従します。
- 集荷元と届け先が別地域（関東⇔関西など）にまたがる場合は配達不可としてエラーになります。

## ディレクトリ構成

```
gas/    Google Apps Script (clasp管理)
  Code.gs        doPost エントリポイント・見積ハンドラ
  Lalamove.gs    HMAC署名・Lalamove APIクライアント
  Geocode.gs     住所ジオコーディング
  Setup.gs       資格情報設定・疎通テスト用関数
  appsscript.json

docs/   静的フロントエンド (GitHub Pages / 他ホスティング共通)
  index.html
  style.css
  app.js
  config.js      GAS_URL 設定
```
