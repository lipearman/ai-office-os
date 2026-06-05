from PIL import Image, ImageDraw
p = r"C:\Users\dpras\source\repos\GitHub\ai-office-os\frontend\public\assets\characters\walk_boy_brown.png"
im = Image.open(p).convert("RGBA")
W,H = im.size
fw, fh = W//2, H//4
labels = ["DOWN (row0)","LEFT (row1)","RIGHT (row2)","UP (row3)"]
# lay rows out horizontally with labels, on checkerboard
cellw = fw*2 + 10
out = Image.new("RGB",(cellw*4, fh+24),(255,255,255))
d = ImageDraw.Draw(out)
sq=12
for y in range(0,out.height,sq):
  for x in range(0,out.width,sq):
    if (x//sq+y//sq)%2==0: d.rectangle([x,y,x+sq,y+sq],fill=(205,205,210))
for r in range(4):
  row = im.crop((0, r*fh, W, (r+1)*fh))
  out.paste(row, (r*cellw, 20), row)
  d.text((r*cellw+2,2), labels[r], fill=(0,0,0))
o = r"C:\Users\dpras\source\repos\GitHub\ai-office-os\tools\rows_preview.png"
out.save(o); print("frame", fw, fh, "->", o)
