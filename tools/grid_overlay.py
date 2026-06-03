from PIL import Image, ImageDraw, ImageFont
import sys

src = r"C:\Users\dpras\Downloads\ChatGPT Image Jun 3, 2026, 09_11_25 PM.png"
im = Image.open(src).convert("RGB")
W, H = im.size

draw = ImageDraw.Draw(im)
step = 100
for x in range(0, W, step):
    draw.line([(x, 0), (x, H)], fill=(255, 0, 255), width=1)
    draw.text((x + 2, 2), str(x), fill=(255, 255, 0))
    draw.text((x + 2, H - 14), str(x), fill=(255, 255, 0))
for y in range(0, H, step):
    draw.line([(0, y), (W, y)], fill=(255, 0, 255), width=1)
    draw.text((2, y + 2), str(y), fill=(0, 255, 255))

out = r"C:\Users\dpras\source\repos\GitHub\ai-office-os\tools\grid_preview.png"
im.save(out)
print("saved", out, im.size)
