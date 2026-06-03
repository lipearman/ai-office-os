from PIL import Image, ImageDraw
src = r"C:\Users\dpras\Downloads\ChatGPT Image Jun 3, 2026, 10_22_34 PM.png"
im = Image.open(src).convert("RGB")
W, H = im.size
print("size", W, H)
d = ImageDraw.Draw(im)
for x in range(0, W, 50):
    col = (255,0,255) if x % 100 == 0 else (120,0,120)
    d.line([(x,0),(x,H)], fill=col, width=1)
    if x % 100 == 0: d.text((x+1,1), str(x), fill=(255,255,0))
for y in range(0, H, 50):
    col = (255,0,255) if y % 100 == 0 else (120,0,120)
    d.line([(0,y),(W,y)], fill=col, width=1)
    if y % 100 == 0: d.text((1,y+1), str(y), fill=(0,255,255))
im.save(r"C:\Users\dpras\source\repos\GitHub\ai-office-os\tools\grid3.png")
print("ok")
