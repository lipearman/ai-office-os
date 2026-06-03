"""
Extract 8 characters x 4 directions x 2 frames from the walk sprite sheet,
clean the dark background per-frame (flood-fill from borders, keeps interior
darks like hair/outlines), and recomposite each character into a clean
2-col x 4-row spritesheet (cols=frames, rows=down/left/right/up).
"""
import os
from collections import deque
from PIL import Image

SRC = r"C:\Users\dpras\Downloads\ChatGPT Image Jun 3, 2026, 10_22_34 PM.png"
OUT = r"C:\Users\dpras\source\repos\GitHub\ai-office-os\frontend\public\assets\characters"
os.makedirs(OUT, exist_ok=True)

im = Image.open(SRC).convert("RGBA")
W, H = im.size

NAMES = ["boy_brown", "boy_cap", "boy_blonde", "girl_headphone",
         "girl_pink", "boy_green", "girl_purple", "girl_brown"]

# Character grid geometry (tuned to the 1536x1024 sheet)
GRID_X0 = 82
COL_W   = 181          # per character (contains 2 frames)
FRAME_W = COL_W / 2
ROW_Y0  = [88, 205, 322, 438]   # down, left, right, up
ROW_H   = 112
FRAMES  = 2


BG_MAX = 58   # a pixel is "background" if its brightest channel is below this


def is_bg(px):
    r, g, b, a = px
    return max(r, g, b) < BG_MAX


def flood_clear(cell):
    """Flood-fill from borders, clearing dark background while keeping
    interior darks (hair/outlines surrounded by the character)."""
    cell = cell.convert("RGBA")
    w, h = cell.size
    px = cell.load()
    seen = bytearray(w * h)
    q = deque()

    def push(x, y):
        i = y * w + x
        if not seen[i]:
            seen[i] = 1
            if is_bg(px[x, y]):
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
                i = ny * w + nx
                if not seen[i]:
                    seen[i] = 1
                    if is_bg(px[nx, ny]):
                        q.append((nx, ny))
    return cell


def autotrim(img):
    bb = img.getbbox()
    return img.crop(bb) if bb else img


for c, name in enumerate(NAMES):
    cx0 = GRID_X0 + c * COL_W
    frames = []          # frames[dir][frame] = trimmed image
    maxw = maxh = 0
    for d in range(4):
        ry0 = ROW_Y0[d]
        row_frames = []
        for f in range(FRAMES):
            x0 = int(cx0 + f * FRAME_W)
            x1 = int(cx0 + (f + 1) * FRAME_W)
            cell = im.crop((x0, ry0, x1, ry0 + ROW_H))
            cell = autotrim(flood_clear(cell))
            row_frames.append(cell)
            maxw = max(maxw, cell.width)
            maxh = max(maxh, cell.height)
        frames.append(row_frames)

    # Build clean sheet: FRAMES cols x 4 rows, each cell maxw x maxh, bottom-centered
    sheet = Image.new("RGBA", (maxw * FRAMES, maxh * 4), (0, 0, 0, 0))
    for d in range(4):
        for f in range(FRAMES):
            img = frames[d][f]
            px = f * maxw + (maxw - img.width) // 2
            py = d * maxh + (maxh - img.height)      # bottom align
            sheet.paste(img, (px, py), img)
    sheet.save(os.path.join(OUT, f"walk_{name}.png"))
    print(f"walk_{name}.png  sheet={sheet.size}  frame={maxw}x{maxh}")

print("DONE")
