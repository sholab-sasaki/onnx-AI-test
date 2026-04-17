from __future__ import annotations

import argparse
from pathlib import Path

from huggingface_hub import snapshot_download


def main() -> int:
    p = argparse.ArgumentParser(
        description="Download a Hugging Face repo snapshot (e.g. ONNX models) to a local folder."
    )
    p.add_argument(
        "--repo-id",
        default="Trendyol/background-removal",
        help='Hugging Face repo id (default: "Trendyol/background-removal")',
    )
    p.add_argument(
        "--local-dir",
        default="./models/background-removal",
        help='Download destination (default: "./models/background-removal")',
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

