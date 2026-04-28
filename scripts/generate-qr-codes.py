"""Generate themed QR codes for the reserved-seats invitation links.

Usage:
    python scripts/generate-qr-codes.py
    python scripts/generate-qr-codes.py "https://my-custom-domain.com/"

Produces qr-codes/seats-1.png through qr-codes/seats-5.png — each opens
the invitation site with the matching ?seats=N param. The host can drop
each PNG into the printed/physical invitation for the corresponding
guest party size.
"""

import os
import sys
import qrcode
from qrcode.constants import ERROR_CORRECT_H
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.moduledrawers.pil import RoundedModuleDrawer
from qrcode.image.styles.colormasks import SolidFillColorMask
from PIL import Image, ImageDraw, ImageFont

DEFAULT_BASE_URL = "http://www.gianna-avery.xyz/"
OUTPUT_DIR = "qr-codes"
SEAT_COUNTS = range(1, 6)

# Pink-purple gradient brand colours — pulled from the app's --it-* palette
PINK = (217, 73, 148)      # var(--pink-700)
PURPLE = (111, 78, 209)    # var(--purple-700)
DEEP_PURPLE = (61, 42, 115)  # var(--purple-900)
SOFT_PINK = (255, 243, 249)  # near-white pink for backgrounds
WHITE = (255, 255, 255)


def find_font(size):
    """Try a few common system serif fonts; fall back to Pillow's default."""
    candidates = [
        "C:/Windows/Fonts/georgiai.ttf",  # Georgia Italic — Windows
        "C:/Windows/Fonts/georgia.ttf",
        "C:/Windows/Fonts/seguisb.ttf",   # Segoe UI Semibold
        "/System/Library/Fonts/Georgia.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVu-Sans-Bold.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def build_qr(url):
    qr = qrcode.QRCode(
        version=None,
        error_correction=ERROR_CORRECT_H,
        box_size=14,
        border=2,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(
        image_factory=StyledPilImage,
        module_drawer=RoundedModuleDrawer(),
        color_mask=SolidFillColorMask(
            front_color=DEEP_PURPLE,
            back_color=WHITE,
        ),
    )
    return img.convert("RGBA")


def compose_invitation(qr_img, seats):
    """Wrap the raw QR in a themed card with header text and seat label."""
    qr_w, qr_h = qr_img.size
    pad_x = 60
    pad_top = 110
    pad_bottom = 130
    canvas_w = qr_w + pad_x * 2
    canvas_h = qr_h + pad_top + pad_bottom

    canvas = Image.new("RGBA", (canvas_w, canvas_h), WHITE)
    draw = ImageDraw.Draw(canvas)

    # Pink → purple gradient strip across the top
    band_h = 70
    for y in range(band_h):
        t = y / band_h
        r = int(PINK[0] * (1 - t) + PURPLE[0] * t)
        g = int(PINK[1] * (1 - t) + PURPLE[1] * t)
        b = int(PINK[2] * (1 - t) + PURPLE[2] * t)
        draw.line([(0, y), (canvas_w, y)], fill=(r, g, b, 255))

    # Header text
    header_font = find_font(26)
    sub_font = find_font(14)
    seat_font = find_font(48)
    label_font = find_font(18)
    url_font = find_font(11)

    header = "Avery's Fairy Celebration"
    sub = "1st Birthday & Christening"
    _draw_centered(draw, header, canvas_w, 16, header_font, WHITE)
    _draw_centered(draw, sub, canvas_w, 48, sub_font, WHITE)

    # Paste QR
    canvas.paste(qr_img, (pad_x, pad_top), qr_img)

    # Seat count label below QR
    label_y = pad_top + qr_h + 18
    _draw_centered(draw, f"{seats}", canvas_w, label_y, seat_font, PINK)
    seat_word = "seat" if seats == 1 else "seats"
    _draw_centered(draw, f"{seat_word} reserved", canvas_w, label_y + 60, label_font, DEEP_PURPLE)

    # Faint URL hint at the very bottom (helpful if camera fails)
    hint = f"Or scan & open: ?seats={seats}"
    _draw_centered(draw, hint, canvas_w, canvas_h - 22, url_font, (138, 122, 170))

    return canvas


def _draw_centered(draw, text, canvas_w, y, font, fill):
    bbox = draw.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    draw.text(((canvas_w - w) / 2, y), text, font=font, fill=fill)


def main():
    base_url = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_BASE_URL
    if not base_url.endswith("/"):
        base_url += "/"
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    for seats in SEAT_COUNTS:
        url = f"{base_url}?seats={seats}"
        qr_img = build_qr(url)
        card = compose_invitation(qr_img, seats)
        out = f"{OUTPUT_DIR}/seats-{seats}.png"
        card.save(out, "PNG")
        print(f"wrote {out:30s} -> {url}")


if __name__ == "__main__":
    main()
