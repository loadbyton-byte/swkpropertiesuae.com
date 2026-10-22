#!/usr/bin/env python3
"""Dev-time: build favicon.ico and PWA icons from the brand logo (needs Pillow)."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
brand = ROOT / "src" / "assets" / "images" / "brand"
logo = Image.open(brand / "swk-logo-dark.png").convert("RGBA")
CREAM = (250, 247, 242, 255)


def tile(size, pad):
    canvas = Image.new("RGBA", (size, size), CREAM)
    inner = int(size * (1 - 2 * pad))
    w, h = logo.size
    scale = inner / max(w, h)
    lg = logo.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
    canvas.alpha_composite(lg, ((size - lg.width) // 2, (size - lg.height) // 2))
    return canvas.convert("RGB")


tile(192, 0.12).save(brand / "icon-192.png", optimize=True)
tile(512, 0.12).save(brand / "icon-512.png", optimize=True)
tile(512, 0.22).save(brand / "icon-512-maskable.png", optimize=True)
tile(256, 0.08).save(ROOT / "src" / "root" / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
print("icons written")
