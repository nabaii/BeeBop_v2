"""Regenerate Beebop app/favicon icons from the triad geometry.

The triad is three closed straight-line polygons (honeycomb cell + two
pentagons) defined in the 56-unit favicon viewBox. We draw them with a round
stroke directly in PIL at 4x supersample and downscale, on a full-bleed honey
rounded-square tile. `FILL_RATIO` controls how much of the tile the triad's
visual bounding box occupies (kept inside the ~80% maskable safe zone).
"""

from __future__ import annotations

import os

from PIL import Image, ImageDraw

HONEY = (240, 152, 15, 255)   # #F0980F
PAPER = (252, 250, 246, 255)  # #FCFAF6

# Triad geometry in the 56-unit viewBox (from beebop-favicon.svg).
HEX = [(28, 7), (35.5, 11.3), (35.5, 19.9), (28, 24.2), (20.5, 19.9), (20.5, 11.3)]
BR = [(43, 33), (41.2, 41.4), (32.8, 42.3), (28.2, 35.2), (32.5, 27.8)]
BL = [(13, 33), (14.8, 41.4), (23.2, 42.3), (27.8, 35.2), (23.5, 27.8)]
SHAPES = [HEX, BR, BL]
STROKE_UNITS = 5.5

# Geometric bbox of the mark, and its visual extent (bbox + stroke).
BBOX_CX, BBOX_CY = 28.0, 24.65
VISUAL_H = 40.8  # (42.3 - 7) + STROKE_UNITS

FILL_RATIO = 0.70   # triad visual height as a fraction of the tile
CORNER_RATIO = 0.22
SS = 4              # supersample factor


def render_tile(size: int, *, background: bool = True, mark_color=PAPER) -> Image.Image:
    """Render one square icon at `size` px."""
    r = size * SS
    img = Image.new("RGBA", (r, r), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    if background:
        cr = CORNER_RATIO * r
        draw.rounded_rectangle([0, 0, r - 1, r - 1], radius=cr, fill=HONEY)

    # Final px-per-unit so the visual height fills FILL_RATIO of the tile.
    k = (FILL_RATIO * size / VISUAL_H) * SS
    sw = STROKE_UNITS * k

    def to_px(p):
        x, y = p
        return (r / 2 + (x - BBOX_CX) * k, r / 2 + (y - BBOX_CY) * k)

    for shape in SHAPES:
        pts = [to_px(p) for p in shape]
        closed = pts + [pts[0]]
        draw.line(closed, fill=mark_color, width=max(1, round(sw)), joint="curve")
        # Round joins/caps: a disc at every vertex.
        rad = sw / 2
        for (px, py) in pts:
            draw.ellipse([px - rad, py - rad, px + rad, py + rad], fill=mark_color)

    return img.resize((size, size), Image.LANCZOS)


def save_png(size: int, path: str, **kw) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    render_tile(size, **kw).save(path, "PNG")
    print("wrote", path)


def save_ico(path: str) -> None:
    base = render_tile(256)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    base.save(path, format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (256, 256)])
    print("wrote", path)


if __name__ == "__main__":
    import sys

    root = sys.argv[1]  # repo root
    fe = os.path.join(root, "frontend")
    kit = os.path.join(root, "beebop branding", "beebop-logo-kit")

    # Frontend (served) assets.
    save_png(192, os.path.join(fe, "public", "icon-192.png"))
    save_png(512, os.path.join(fe, "public", "icon-512.png"))
    save_png(180, os.path.join(fe, "src", "app", "apple-icon.png"))
    save_ico(os.path.join(fe, "src", "app", "favicon.ico"))

    # Keep the logo kit in sync (manifest mirrors it).
    fav = os.path.join(kit, "assets", "favicon")
    save_png(192, os.path.join(fav, "icon-192.png"))
    save_png(512, os.path.join(fav, "icon-512.png"))
    save_png(180, os.path.join(fav, "apple-touch-icon.png"))
    save_ico(os.path.join(fav, "favicon.ico"))
    app = os.path.join(kit, "assets", "app-icon")
    save_png(180, os.path.join(app, "app-icon-honey-180.png"))
    save_png(192, os.path.join(app, "app-icon-honey-192.png"))
    save_png(512, os.path.join(app, "app-icon-honey-512.png"))
    save_png(1024, os.path.join(app, "app-icon-honey-1024.png"))
