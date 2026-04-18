from __future__ import annotations

import argparse
from pathlib import Path

from huggingface_hub import snapshot_download


def main() -> int:
    p = argparse.ArgumentParser(
        description="Hugging Face のリポジトリをローカルに snapshot_download する（任意の ONNX 等）。"
    )
    p.add_argument(
        "--repo-id",
        required=True,
        help='Hugging Face の repo id（例: "Trendyol/background-removal"）',
    )
    p.add_argument(
        "--local-dir",
        default="./models/hf-snapshot",
        help='保存先ディレクトリ（既定: "./models/hf-snapshot"）',
    )
    args = p.parse_args()

    local_dir = Path(args.local_dir).resolve()
    local_dir.parent.mkdir(parents=True, exist_ok=True)

    local_path = snapshot_download(
        repo_id=args.repo_id,
        local_dir=str(local_dir),
        local_dir_use_symlinks=False,
    )

    print(local_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
