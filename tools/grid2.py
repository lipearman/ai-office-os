from PIL import Image, ImageDraw
src = r"C:\Users\dpras\Downloads\ChatGPT Image Jun 3, 2026, 09_55_32 PM.png"
im = Image.open(src).convert("RGB")
W, H = im.size
print("size", W, H)
d = ImageDraw.Draw(im)
for x in range(0, W, 100):
    d.line([(x,0),(x,H)], fill=(255,0,255), width=1); d.text((x+2,2), str(x), fill=(255,255,0))
for y in range(0, H, 100):
    d.line([(0,y),(W,y)], fill=(255,0,255), width=1); d.text((2,y+2), str(y), fill=(0,255,255))
im.save(r"C:\Users\dpras\source\repos\GitHub\ai-office-os\tools\grid2.png")
print("ok")
