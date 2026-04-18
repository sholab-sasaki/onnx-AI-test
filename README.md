# onnx-AI-test

ブラウザ（ONNX Runtime Web）でジオラマ風の人物切り抜き・スタイル合成を試す静的サイトです。

**リポジトリ**: [`sholab-sasaki/onnx-AI-test`](https://github.com/sholab-sasaki/onnx-AI-test)（個人アカウント・開発はこちらで進める）

## 機能概要

- **ジオラマスタジオ**（`diorama-studio.html`）: U²-Net-P と mosaic 系 ONNX を WASM で実行
- **ONNX のキャッシュ**: 同一オリジンから取得した `.onnx` は **IndexedDB** に保存され、2 回目以降の読み込みが速くなります
- **プリセット画像**: 人物・背景を「デモ用（Canvas 生成）」や「同梱パス」から選べます（オフライン検証向け）

## ローカル確認

静的ファイルなので、どれか一方で十分です。

- エクスプローラーで `index.html` を開く（一部環境では `file://` 制限あり）
- 次の「Docker」で `http://localhost:8080` を使う（推奨）

## Docker で起動（自前サーバー向け）

静的サイトなので **Docker は必須ではありません**が、VPS などにそのまま載せるなら nginx コンテナが扱いやすいです。

```bash
docker build -t onnx-ai-test .
docker run --rm -p 8080:80 onnx-ai-test
```

ブラウザで `http://localhost:8080/` を開きます。

### ホストの `models/` をマウントする例

リポジトリに巨大な `.onnx` を含めず、サーバー上だけ置く場合:

```bash
docker run --rm -p 8080:80 -v "%CD%/models:/usr/share/nginx/html/models:ro" onnx-ai-test
```

（PowerShell では `-v "${PWD}/models:/usr/share/nginx/html/models:ro"`）

## GitHub に登録する

```bash
git init
git add .
git commit -m "chore: 初期コミット"
git branch -M main
git remote add origin git@github-sholab-sasaki:sholab-sasaki/onnx-AI-test.git
git push -u origin main
```

## 一般公開（GitHub Pages）

`main` に push すると **GitHub Actions** が静的ファイルを **GitHub Pages** にデプロイします（`.github/workflows/deploy-github-pages.yml`）。ONNX は **Git LFS の実体を取得したうえで**アップロードされます。

### 初回だけ（必須・これを先にやらないとデプロイが必ず失敗します）

**ワークフローを一度も走らせる前に**、次を設定してください。省略すると `configure-pages` で `Get Pages site failed` / `HttpError: Not Found` になります。

1. ブラウザで **Pages 設定**を開く:  
   [github.com/sholab-sasaki/onnx-AI-test/settings/pages](https://github.com/sholab-sasaki/onnx-AI-test/settings/pages)
2. **Build and deployment** の **Source** で、**GitHub Actions** を選ぶ  
   （「Deploy from a branch」のままでは、このリポジトリ用の Actions デプロイと一致しません）
3. 画面を保存したら、**Actions** タブで **Deploy to GitHub Pages** を **Re-run** する（または `main` に空コミットで push）

※ 新規リポジトリでは Source が未設定のままだと、Pages の「サイト」が API 上まだ存在せず 404 になります。**先に Source = GitHub Actions** が重要です。

個人リポジトリの URL は次の形です（実際の値は Settings の Pages に従ってください）。

`https://sholab-sasaki.github.io/onnx-AI-test/`

- トップ: `/` → `index.html`
- ジオラマスタジオ: `/diorama-studio.html`

#### Actions で `git lfs fetch` が 404 になるとき

リポジトリを移した直後など、**LFS の実体が GitHub 上にまだ無い**と、デプロイの checkout で失敗します。手元で次を実行してから、Actions を再実行してください。

```bash
git lfs push --all origin
```

（`git lfs ls-files` で LFS 管理されているファイルが一覧されます。）

#### `Get Pages site failed` / `configure-pages` の Not Found

上記のとおり **Settings → Pages → Source を GitHub Actions** にしていないときに出ます。設定後にワークフローを再実行してください。

### その他のホスティング（参考）

- **Cloudflare Pages**: Git 連携し、ビルドは空・出力はリポジトリルート。LFS はビルドで `git lfs pull` が必要な場合あり
- **Docker**（自前 VPS）: このリポジトリの `Dockerfile` で nginx が静的配信

ONNX はサイズが大きいことが多いので、リポジトリでは **Git LFS** を使うか、CDN に置いて相対 URL を変える運用も検討してください。

## モデルファイルの取得例

`download_model.py` で Hugging Face から取得できます（別リポジトリのモデル用）。

```bash
pip install huggingface_hub
python download_model.py
```

ジオラマ用の既定パスは `models/u2netp/u2netp.onnx` と `models/mosaic-8/mosaic-8.onnx` です。

## ライセンス・クレジット（公開サイト・再配布時）

各モデルは **配布元のライセンス**に従ってください。概要のみ以下に示します（詳細は各フォルダの `README.md` / `LICENSE`）。

| パス | 内容 | 備考 |
|------|------|------|
| `models/u2netp/` | U²-Net-P ONNX | README 上 **Apache License 2.0** |
| `models/mosaic-8/` | Fast Neural Style（mosaic-8） | README 本文 **BSD-3-Clause**（YAML では apache 表記あり。本文の SPDX / License 節を参照） |
| `models/background-removal/` | Trendyol 背景除去 | **`LICENSE` は CC BY-SA 4.0**。README 本文と差異がある場合は **LICENSE ファイルを優先**し、表示・派生物の条件に注意 |

公開ページ（`index.html` / `diorama-studio.html`）のフッターにも短いクレジットを記載しています。

## Cloudflare Pages（Private リポジトリ）

**GitHub を Private のまま**、静的サイトだけ **一般公開 URL**（`*.pages.dev` など）で配信できます。Cloudflare のアカウントは **個人メールで作成**して問題ありません。

### 個人リポジトリで連携する場合

本プロジェクトは **`sholab-sasaki` 個人アカウント**上の `onnx-AI-test` で進めます。Cloudflare の GitHub 連携では、インストール先に **個人アカウント `sholab-sasaki`** を選び、このリポジトリを指定すればよいです（Organization への App インストールは不要）。

### 手順の概要

1. [Cloudflare ダッシュボード](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. **GitHub** を接続し、アカウント **`sholab-sasaki`** を選び、リポジトリ **`onnx-AI-test`** を指定
3. ビルド設定の例:
   - **Framework preset**: None（または Static）
   - **Build command**: 空（静的のみ）※ Git LFS の実体がビルドに含まれない場合は `git lfs install && git lfs pull` を検討
   - **Build output directory**: `/`（リポジトリルートをそのまま公開）

**注意**: リポジトリが **Git LFS** の場合、Cloudflare のチェックアウトでポインタのままになることがあります。ビルドログで `.onnx` のサイズを確認し、必要なら上記の **Build command** で LFS を取得してください。

### GitHub Pages との違い

- **GitHub Pages（無料）**: Private リポジトリでは使えない（または有料プランが必要）ことが多い  
- **Cloudflare Pages**: Private リポジトリでも **接続・デプロイ可能**な構成が取りやすい（無料枠の範囲内で利用可能なことが多い）
