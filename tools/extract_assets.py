"""
Extract game assets from the AI Office 2D RPG reference spec sheet.
Source is a flat 1536x1024 illustration. We crop labelled regions,
auto-trim to content, and key out the dark panel background to alpha.
"""
import os
from PIL import Image

SRC = r"C:\Users\dpras\Downloads\ChatGPT Image Jun 3, 2026, 09_11_25 PM.png"
OUT = r"C:\Users\dpras\source\repos\GitHub\ai-office-os\frontend\public\assets"

im = Image.open(SRC).convert("RGBA")
W, H = im.size
print("source", W, H)

# ── Background key colour (sampled from top-left dark panel) ─────────────
bg_sample = im.getpixel((5, 300))[:3]
print("bg sample", bg_sample)


def remove_bg(img: Image.Image, key=bg_sample, tol=42) -> Image.Image:
    """Make pixels close to the dark panel colour transparent."""
    img = img.convert("RGBA")
    px = img.load()
    kr, kg, kb = key
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if abs(r - kr) <= tol and abs(g - kg) <= tol and abs(b - kb) <= tol:
                px[x, y] = (r, g, b, 0)
    return img


def autotrim(img: Image.Image, pad=2) -> Image.Image:
    """Crop to non-transparent bounding box."""
    bbox = img.getbbox()
    if not bbox:
        return img
    l, t, r, b = bbox
    l = max(0, l - pad); t = max(0, t - pad)
    r = min(img.width, r + pad); b = min(img.height, b + pad)
    return img.crop((l, t, r, b))


def crop(box):
    return im.crop(box)


def save(img, folder, name):
    d = os.path.join(OUT, folder)
    os.makedirs(d, exist_ok=True)
    img.save(os.path.join(d, name))
    print(f"  {folder}/{name}  {img.size}")


# ════════════════════════════════════════════════════════════════════════
# 1. MAIN OFFICE MAP (big render, top-right) — highest quality piece
# ════════════════════════════════════════════════════════════════════════
print("\n[maps]")
office = crop((540, 16, 1532, 612))
save(office, "maps", "office_full.png")

# 1b. Two background thumbnails (top-left panel)
bg1 = crop((16, 38, 258, 168))
bg2 = crop((262, 38, 512, 168))
save(bg1, "maps", "office_floor_1.png")
save(bg2, "maps", "rooftop_terrace.png")

# ════════════════════════════════════════════════════════════════════════
# 2. FURNITURE GRID — 5 cols, rows of items on dark panel
#    region roughly x16..512, y228..560
# ════════════════════════════════════════════════════════════════════════
print("\n[furniture]")
FURN_NAMES = [
    ["desk", "computer", "chair", "sofa", "coffee_table"],
    ["plant", "bookshelf", "cabinet", "locker", "vending_machine"],
    ["whiteboard", "notice_board", "box", "door", "stairs"],
]
fx0, fy0 = 16, 226
cell_w, cell_h = 99, 92      # includes label band
icon_h = 64                   # icon portion (above the text label)
for row, names in enumerate(FURN_NAMES):
    for col, name in enumerate(names):
        x0 = fx0 + col * cell_w
        y0 = fy0 + row * cell_h
        cell = crop((x0, y0, x0 + cell_w - 6, y0 + icon_h))
        cell = autotrim(remove_bg(cell))
        save(cell, "furniture", f"{name}.png")
# water cooler + umbrella sit on row 2 col 5-ish / row3; grab extras
extra = crop((fx0 + 4 * cell_w, fy0 + 1 * cell_h, fx0 + 5 * cell_w - 6, fy0 + 1 * cell_h + icon_h))
save(autotrim(remove_bg(extra)), "furniture", "water_dispenser.png")

# ════════════════════════════════════════════════════════════════════════
# 3. CHARACTERS — 5 cols x 2 rows of mini sprite blocks
#    region roughly x16..512, y610..830
# ════════════════════════════════════════════════════════════════════════
print("\n[characters]")
CHAR_NAMES = [
    ["dev_agent", "dba_agent", "pm_agent", "qa_agent", "ba_agent"],
    ["rag_agent", "ceo_agent", "green_agent", "purple_agent", "npc_female"],
]
cx0, cy0 = 16, 606
cc_w, cc_h = 99, 112
cblock_h = 92
for row, names in enumerate(CHAR_NAMES):
    for col, name in enumerate(names):
        x0 = cx0 + col * cc_w
        y0 = cy0 + row * cc_h
        cell = crop((x0, y0, x0 + cc_w - 6, y0 + cblock_h))
        cell = autotrim(remove_bg(cell))
        save(cell, "characters", f"{name}.png")

# ════════════════════════════════════════════════════════════════════════
# 4. UI ELEMENTS
# ════════════════════════════════════════════════════════════════════════
print("\n[ui]")
save(autotrim(remove_bg(crop((16, 870, 232, 968)))), "ui", "dialog_box.png")
save(autotrim(remove_bg(crop((250, 858, 408, 892)))), "ui", "name_box.png")
save(autotrim(remove_bg(crop((376, 846, 470, 892)))), "ui", "button.png")

print("\nDONE")
