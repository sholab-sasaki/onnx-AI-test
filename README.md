# onnx-test

ブラウザ（ONNX Runtime Web）でジオラマ風の人物切り抜き・スタイル合成を試す静的サイトです。

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
docker build -t onnx-test .
docker run --rm -p 8080:80 onnx-test
```

ブラウザで `http://localhost:8080/` を開きます。

### ホストの `models/` をマウントする例

リポジトリに巨大な `.onnx` を含めず、サーバー上だけ置く場合:

```bash
docker run --rm -p 8080:80 -v "%CD%/models:/usr/share/nginx/html/models:ro" onnx-test
```

（PowerShell では `-v "${PWD}/models:/usr/share/nginx/html/models:ro"`）

## GitHub に登録する

```bash
git init
git add .
git commit -m "chore: 初期コミット"
git branch -M main
git remote add origin https://github.com/<あなたのユーザー>/onnx-test.git
git push -u origin main
```

## デプロイ先の例（Docker なし）

- **GitHub Pages**: リポジトリ Settings → Pages → Branch `main` / folder `/ (root)`
- **Cloudflare Pages**: ビルドコマンドなし、出力ディレクトリをリポジトリルートに

ONNX はサイズが大きいことが多いので、**Git LFS** や **オブジェクトストレージ**に置き、ページから相対 URL で読む構成も検討してください。

## モデルファイルの取得例

`download_model.py` で Hugging Face から取得できます（別リポジトリのモデル用）。

```bash
pip install huggingface_hub
python download_model.py
```

ジオラマ用の既定パスは `models/u2netp/u2netp.onnx` と `models/mosaic-8/mosaic-8.onnx` です。
