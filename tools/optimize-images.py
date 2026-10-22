#!/usr/bin/env python3
"""Convert photos in src/assets/images to responsive WebP and make social-share JPGs.

    python3 tools/optimize-images.py            # needs Pillow (dev-time only; the site build stays stdlib)

For every PNG/JPG under properties/, gallery/, communities/, blog/, about/, team/ and hero/:
  name.webp        full size (quality 82)
  name-640.webp    640px wide variant, only when the original is wider than 720px
Originals are deleted after a successful conversion. Brand logos, favicons and
developer logos are left alone. Social images (1200x630 JPG) go to src/assets/og/.
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "src" / "assets" / "images"
OG = ROOT / "src" / "assets" / "og"
FOLDERS = ["properties", "gallery", "communities", "blog", "about", "team", "hero"]


def convert():
    before = after = 0
    for folder in FOLDERS:
        for p in sorted((IMG / folder).glob("*")):
            if p.suffix.lower() not in (".png", ".jpg", ".jpeg"):
                continue
            im = ImageOps.exif_transpose(Image.open(p))
            has_alpha = im.mode in ("RGBA", "LA") or "transparency" in im.info
            im = im.convert("RGBA" if has_alpha else "RGB")
            out = p.with_suffix(".webp")
            im.save(out, "WEBP", quality=82, method=6)
            if im.width > 720:
                small = im.copy()
                small.thumbnail((640, 4000), Image.LANCZOS)
                small.save(p.with_name(p.stem + "-640.webp"), "WEBP", quality=78, method=6)
            before += p.stat().st_size
            after += out.stat().st_size
            p.unlink()
    print(f"converted: {before / 1e6:.1f} MB -> {after / 1e6:.1f} MB (full-size files)")


def cover(src, dest, size=(1200, 630)):
    im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    im = ImageOps.fit(im, size, Image.LANCZOS, centering=(0.5, 0.45))
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, "JPEG", quality=84, optimize=True, progressive=True)


def social():
    props = json.loads((ROOT / "data" / "properties.json").read_text(encoding="utf-8"))
    for p in props:
        n = p["imageOrder"][0]
        cover(IMG / "properties" / f"{p['id']}-{n}.webp", OG / f"{p['id']}.jpg")
    for p in json.loads((ROOT / "data" / "blog.json").read_text(encoding="utf-8")):
        cover(IMG / p["image"].replace("assets/images/", "").replace(".jpg", ".webp"), OG / f"blog-{p['slug']}.jpg")
    cover(IMG / "about" / "swk-office.webp", OG / "about.jpg")
    print("social images:", len(list(OG.glob('*.jpg'))))


if __name__ == "__main__":
    if "--social-only" not in sys.argv:
        convert()
    social()
