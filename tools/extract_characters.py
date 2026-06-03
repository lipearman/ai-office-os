"""
Extract 10 chibi characters from the 5x2 grid reference (white background).
Flood-fills the outer white to transparent (keeps interior whites like
shoes/shirts), auto-trims, and saves one PNG per character.
"""
import os
from collections import deque
from PIL import Image

SRC = r"C:\Users\dpras\source\repos\GitHub\ai-office-os\docs\710756008_122128877031102861_4175020106771808482_n.jpg"
OUT = r"C:\Users\dpras\source\repos\GitHub\ai-office-os\frontend\public\assets\characters"
os.makedirs(OUT, exist_ok=True)

im = Image.open(SRC).convert("RGBA")
W, H = im.size
COLS, ROWS = 5, 2
cw, ch = W // COLS, H // ROWS

# Names mapped to project agent roles (row-major)
NAMES = [
    "char_pink", "char_blonde_girl", "char_brown_boy", "char_blonde_boy", "char_catgirl",
    "char_cap_boy", "char_purple_girl", "char_green_boy", "char_headset_boy", "char_teal_girl",
]


def is_white(px, thr=232):
    r, g, b, a = px
    return r >= thr and g >= thr and b >= thr


def flood_clear_white(cell: Image.Image, thr=232) -> Image.Image:
    """BFS from all border pixels; clear connected near-white to alpha 0."""
    cell = cell.convert("RGBA")
    w, h = cell.size
    px = cell.load()
    seen = bytearray(w * h)
    q = deque()

    def push(x, y):
        idx = y * w + x
        if not seen[idx]:
            seen[idx] = 1
            if is_white(px[x, y], thr):
                q.append((x, y))

    for x in range(w):
        push(x, 0); push(x, h - 1)
    for y in range(h):
        push(0, y); push(w - 1, y)

    while q:
        x, y = q.popleft()
        r, g, b, a = px[x, y]
        px[x, y] = (r, g, b, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h:
                idx = ny * w + nx
                if not seen[idx]:
                    seen[idx] = 1
                    if is_white(px[nx, ny], thr):
                        q.append((nx, ny))
    return cell


def autotrim(img, pad=4):
    bbox = img.getbbox()
    if not bbox:
        return img
    l, t, r, b = bbox
    return img.crop((max(0, l - pad), max(0, t - pad),
                     min(img.width, r + pad), min(img.height, b + pad)))


for row in range(ROWS):
    for col in range(COLS):
        i = row * COLS + col
        cell = im.crop((col * cw, row * ch, (col + 1) * cw, (row + 1) * ch))
        cell = flood_clear_white(cell)
        cell = autotrim(cell)
        name = NAMES[i]
        cell.save(os.path.join(OUT, f"{name}.png"))
        print(f"{name}.png  {cell.size}")

print("DONE")
