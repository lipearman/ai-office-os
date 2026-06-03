import os
from PIL import Image, ImageDraw

OUT = r"C:\Users\dpras\source\repos\GitHub\ai-office-os\frontend\public\assets"
folders = ["maps", "furniture", "characters", "ui"]

cell = 110
cols = 6
items = []
for f in folders:
    d = os.path.join(OUT, f)
    if not os.path.isdir(d):
        continue
    for n in sorted(os.listdir(d)):
        if n.endswith(".png"):
            items.append((f, n, os.path.join(d, n)))

rows = (len(items) + cols - 1) // cols
sheet = Image.new("RGB", (cols * cell, rows * cell), (40, 44, 52))
draw = ImageDraw.Draw(sheet)

for i, (folder, name, path) in enumerate(items):
    c = i % cols
    r = i // cols
    img = Image.open(path).convert("RGBA")
    img.thumbnail((cell - 20, cell - 30))
    x = c * cell + (cell - img.width) // 2
    y = r * cell + 6
    # checkerboard behind to see transparency
    sheet.paste(img, (x, y), img)
    draw.text((c * cell + 4, r * cell + cell - 22), f"{folder}/", fill=(150, 150, 160))
    draw.text((c * cell + 4, r * cell + cell - 12), name[:16], fill=(220, 220, 230))

p = r"C:\Users\dpras\source\repos\GitHub\ai-office-os\tools\contact_sheet.png"
sheet.save(p)
print("saved", p, sheet.size)
