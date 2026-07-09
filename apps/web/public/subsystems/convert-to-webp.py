#!/usr/bin/env python3
"""Phase 103 — convert subsystem hero JPGs to WebP.

The `SUBSYSTEMS` registry (`libs/contracts/src/subsystems/subsystem.schema.ts`)
points `heroImage` at `/subsystems/<id>.jpg`; that contract string is unchanged.
`SubsystemDrawer.tsx`'s `heroBandStyle` derives a sibling `.webp` path from it
(swap the extension) and serves it via CSS `image-set()` with the jpg as the
fallback source, so browsers that support WebP fetch the smaller file.

Re-runnable: reads every `*.jpg` in this directory and (re)writes the matching
`*.webp` next to it, quality 80 / method 6 (Pillow's slowest-but-smallest
encoder effort — these are one-off build assets, not a hot path). The source
JPGs are kept as the fallback and are NOT deleted or modified.

Usage:
    python3 apps/web/public/subsystems/convert-to-webp.py
"""

from pathlib import Path

from PIL import Image

WEBP_QUALITY = 80
WEBP_METHOD = 6  # 0 (fast) .. 6 (slowest, best compression)


def convert_all(directory: Path) -> None:
    jpgs = sorted(directory.glob("*.jpg"))
    if not jpgs:
        print(f"No .jpg files found in {directory}")
        return

    for jpg_path in jpgs:
        webp_path = jpg_path.with_suffix(".webp")
        with Image.open(jpg_path) as img:
            img.save(webp_path, "WEBP", quality=WEBP_QUALITY, method=WEBP_METHOD)

        jpg_size = jpg_path.stat().st_size
        webp_size = webp_path.stat().st_size
        saved_pct = 100 * (1 - webp_size / jpg_size)
        print(
            f"{jpg_path.name}: {jpg_size:,}B -> {webp_path.name}: {webp_size:,}B "
            f"({saved_pct:.0f}% smaller)"
        )


if __name__ == "__main__":
    convert_all(Path(__file__).resolve().parent)
