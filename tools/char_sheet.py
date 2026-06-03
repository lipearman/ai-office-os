import os
from PIL import Image, ImageDraw

D = r"C:\Users\dpras\source\repos\GitHub\ai-office-os\frontend\public\assets\characters"
files = ["char_pink","char_blonde_girl","char_brown_boy","char_blonde_boy","char_catgirl",
         "char_cap_boy","char_purple_girl","char_green_boy","char_headset_boy","char_teal_girl"]

cell = 150
cols = 5
rows = 2
sheet = Image.new("RGB", (cols*cell, rows*cell), (255,255,255))
# checkerboard
d = ImageDraw.Draw(sheet)
sq = 15
for y in range(0, sheet.height, sq):
    for x in range(0, sheet.width, sq):
        if (x//sq + y//sq) % 2 == 0:
            d.rectangle([x,y,x+sq,y+sq], fill=(210,210,210))

for i, f in enumerate(files):
    p = os.path.join(D, f+".png")
    if not os.path.exists(p): continue
    img = Image.open(p).convert("RGBA")
    img.thumbnail((cell-20, cell-30))
    c, r = i % cols, i // cols
    x = c*cell + (cell-img.width)//2
    y = r*cell + 5
    sheet.paste(img, (x,y), img)
    d.text((c*cell+4, r*cell+cell-14), f, fill=(20,20,20))

out = r"C:\Users\dpras\source\repos\GitHub\ai-office-os\tools\char_sheet.png"
sheet.save(out); print("saved", out, sheet.size)
