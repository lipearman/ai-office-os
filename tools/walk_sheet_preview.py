import os
from PIL import Image, ImageDraw

D = r"C:\Users\dpras\source\repos\GitHub\ai-office-os\frontend\public\assets\characters"
names = ["boy_brown","boy_cap","boy_blonde","girl_headphone","girl_pink","boy_green","girl_purple","girl_brown"]
dirs = ["down","left","right","up"]

scale = 1
pad = 8
fw, fh = 91, 112
# each character block: 2 frames wide x 4 dir tall
block_w = fw*2 + pad
block_h = fh*4 + 16
cols = 4
rows = 2
sheet = Image.new("RGB", (cols*block_w, rows*block_h), (255,255,255))
d = ImageDraw.Draw(sheet)
sq=14
for y in range(0, sheet.height, sq):
    for x in range(0, sheet.width, sq):
        if (x//sq+y//sq)%2==0: d.rectangle([x,y,x+sq,y+sq], fill=(205,205,210))

for i, name in enumerate(names):
    img = Image.open(os.path.join(D, f"walk_{name}.png")).convert("RGBA")
    bc, br = i % cols, i // cols
    ox, oy = bc*block_w, br*block_h
    sheet.paste(img, (ox, oy+14), img)
    d.text((ox+2, oy+2), name, fill=(0,0,0))

out = r"C:\Users\dpras\source\repos\GitHub\ai-office-os\tools\walk_preview.png"
sheet.save(out); print("saved", sheet.size)
