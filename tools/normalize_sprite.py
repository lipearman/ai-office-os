"""
Normalize an irregular 2-col x 4-row character sheet into a clean,
uniform spritesheet. Finds the 8 figures via connected-components,
clusters them into 4 rows x 2 cols, then recomposites bottom-centered
into equal cells.
"""
import sys
from collections import deque
from PIL import Image

SRC = r"C:\Users\dpras\Downloads\ChatGPT Image Charactors 01.PNG"
OUT = r"C:\Users\dpras\source\repos\GitHub\ai-office-os\frontend\public\assets\characters\walk_boy_brown.png"
PREVIEW = r"C:\Users\dpras\source\repos\GitHub\ai-office-os\tools\normalized_preview.png"

ALPHA_T = 80      # opaque threshold
MIN_AREA = 350    # ignore smudges smaller than this

im = Image.open(SRC).convert("RGBA")
W, H = im.size
px = im.load()

# 1) Clean faint artifacts: drop low-alpha pixels
for y in range(H):
    for x in range(W):
        r, g, b, a = px[x, y]
        if a < ALPHA_T:
            px[x, y] = (r, g, b, 0)

# 2) Connected components (4-conn) over opaque pixels
seen = bytearray(W * H)
comps = []
for sy in range(H):
    for sx in range(W):
        i = sy * W + sx
        if seen[i] or px[sx, sy][3] == 0:
            continue
        q = deque([(sx, sy)])
        seen[i] = 1
        minx = maxx = sx
        miny = maxy = sy
        area = 0
        while q:
            x, y = q.popleft()
            area += 1
            if x < minx: minx = x
            if x > maxx: maxx = x
            if y < miny: miny = y
            if y > maxy: maxy = y
            for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                nx, ny = x+dx, y+dy
                if 0 <= nx < W and 0 <= ny < H:
                    j = ny*W+nx
                    if not seen[j] and px[nx,ny][3] > 0:
                        seen[j] = 1
                        q.append((nx,ny))
        comps.append({"box":[minx,miny,maxx,maxy], "area":area})

comps = [c for c in comps if c["area"] >= MIN_AREA and (c["box"][3]-c["box"][1]) > 35]
print("components kept:", len(comps))

# 3) Cluster into 4 rows by center-y
def cy(c): return (c["box"][1]+c["box"][3])/2
def cx(c): return (c["box"][0]+c["box"][2])/2
comps.sort(key=cy)

# split into 4 row-groups by the 3 largest vertical gaps
cys = [cy(c) for c in comps]
gaps = sorted(range(1,len(comps)), key=lambda i: cys[i]-cys[i-1], reverse=True)[:3]
cuts = sorted(gaps)
rows = []
start = 0
for cut in cuts + [len(comps)]:
    rows.append(comps[start:cut]); start = cut

# 4) Within each row, merge into <=2 columns by center-x
def merge_box(group):
    xs0=[g["box"][0] for g in group]; ys0=[g["box"][1] for g in group]
    xs1=[g["box"][2] for g in group]; ys1=[g["box"][3] for g in group]
    return [min(xs0),min(ys0),max(xs1),max(ys1)]

grid = []   # grid[row] = [box_left, box_right]
for row in rows:
    row.sort(key=cx)
    if len(row) <= 1:
        cells = [merge_box(row)] if row else []
    else:
        # split by largest x gap into 2 columns
        cxs=[cx(c) for c in row]
        gi = max(range(1,len(row)), key=lambda i: cxs[i]-cxs[i-1])
        left = row[:gi]; right = row[gi:]
        cells = [merge_box(left), merge_box(right)]
    grid.append(cells)

# 5) Determine uniform cell size from all boxes
all_boxes = [b for cells in grid for b in cells]
cellw = max(b[2]-b[0] for b in all_boxes) + 4
cellh = max(b[3]-b[1] for b in all_boxes) + 4
print("cell", cellw, cellh, "rows", len(grid))

# 6) Recompose 2 cols x 4 rows, bottom-centered
sheet = Image.new("RGBA", (cellw*2, cellh*4), (0,0,0,0))
for r, cells in enumerate(grid[:4]):
    for cidx, box in enumerate(cells[:2]):
        fig = im.crop((box[0], box[1], box[2]+1, box[3]+1))
        dx = cidx*cellw + (cellw - fig.width)//2
        dy = r*cellh + (cellh - fig.height)        # bottom align
        sheet.paste(fig, (dx, dy), fig)

sheet.save(OUT)
sheet.save(PREVIEW)
print("saved", OUT, sheet.size)
