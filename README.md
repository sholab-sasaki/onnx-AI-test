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

## 一般公開（Cloudflare Pages・推奨）

**GitHub はコード管理のみ（Private のままでよい）**とし、**一般向け URL は Cloudflare Pages** で出す想定です。  
ダッシュボード: [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → プロジェクト作成 → **Connect to Git**。

### 手順の概要

1. **Create** → **Pages** → **Connect to Git** → GitHub を認可
2. インストール先に **個人 `sholab-sasaki`** を選び、リポジトリ **`onnx-AI-test`** を選択
3. ビルド設定の例:
   - **Framework preset**: None（Static）
   - **Build command**: 空、または Git LFS の実体が必要なら  
     `git lfs install && git lfs pull`
   - **Build output directory**: `/` またはプロジェクト作成画面の指示に従う（ルートをそのまま公開）

`main` へ push するたびに Cloudflare 側が再ビルド・公開します。公開 URL は `*.pages.dev` または独自ドメイン（プロジェクト設定で確認）。

### Cloudflare のファイルサイズ制限（25 MiB）

**Pages に載せられる静的ファイルは 1 ファイルあたり最大 25 MiB**です。  
`models/background-removal/model.onnx`（約 168 MiB）は制限を超えるため **リポジトリに含めていません**（ジオラマ機能もこのファイルは不要）。必要なら `download_model.py` でローカルに取得してください。

### Git LFS について

- **GitHub 上**に LFS オブジェクトが無いと、どの CI でも取得に失敗します。手元で一度: `git lfs push --all origin`
- Cloudflare のビルドでポインタのままになる場合は、上記の **Build command** に `git lfs install && git lfs pull` を入れる

### GitHub Pages は使わない

以前追加していた **GitHub Pages 用ワークフローは削除済み**です。Private リポジトリでは Pages が使えない／設定が煩雑なため、**公開は Cloudflare に統一**してください。

### その他

- **Docker**（自前 VPS）: このリポジトリの `Dockerfile` で nginx が静的配信

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
