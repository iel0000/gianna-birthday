"""Remove the near-white background from a fairy image and save as PNG.

Usage:
    python scripts/remove-bg.py public/fairy1.jpg public/fairy1.png

Pixels brighter than the threshold across all RGB channels become fully
transparent. Pixels close to the threshold get partial alpha so edges stay
soft (no jagged outlines). The cutoff is tuned for a clean white-ish bg —
adjust THRESHOLD if your source has off-white backgrounds.
"""

import sys
from PIL import Image

THRESHOLD = 240  # any pixel where R, G, AND B all >= this is treated as bg
SOFT_RANGE = 25   # how many channel values below threshold get partial alpha


def main(src, dst):
    img = Image.open(src).convert("RGBA")
    pixels = img.load()
    w, h = img.size

    for y in range(h):
        for x in range(w):
            r, g, b, _ = pixels[x, y]
            min_channel = min(r, g, b)
            if min_channel >= THRESHOLD:
                pixels[x, y] = (r, g, b, 0)
            elif min_channel >= THRESHOLD - SOFT_RANGE:
                # taper alpha across SOFT_RANGE values so the edge is smooth
                alpha = int(255 * (THRESHOLD - min_channel) / SOFT_RANGE)
                pixels[x, y] = (r, g, b, alpha)

    img.save(dst, "PNG")
    print(f"wrote {dst} ({w}x{h})")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: python remove-bg.py <input> <output.png>")
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
