from PIL import Image, ImageDraw

# Build an explanatory sprite-sheet spec template
fw, fh = 96, 112
cols, rows = 2, 4
margin_l, margin_t = 150, 40
W = margin_l + cols*fw + 40
H = margin_t + rows*fh + 40
im = Image.new("RGB", (W, H), (24, 26, 34))
d = ImageDraw.Draw(im)

dirs = [
    ("DOWN  (row 0)", "หันหน้าเข้าหากล้อง — เห็นหน้า", (90,160,90)),
    ("LEFT  (row 1)", "หันข้างซ้าย — เห็นด้านข้าง", (90,130,200)),
    ("RIGHT (row 2)", "หันข้างขวา (= LEFT กลับด้าน)", (200,140,80)),
    ("UP    (row 3)", "หันหลัง — เห็นท้ายทอย", (180,90,170)),
]
arrows = ["↓","←","→","↑"]

d.text((10, 8), "Sprite Sheet 4 ทิศ ที่ถูกต้อง  (cols=2 frames, rows=4 directions)", fill=(230,230,240))

for r,(label,desc,col) in enumerate(dirs):
    y = margin_t + r*fh
    # row label
    d.text((10, y + fh//2 - 20), f"{arrows[r]}  {label}", fill=(235,235,245))
    d.text((10, y + fh//2 + 2), desc, fill=(150,150,165))
    for c in range(cols):
        x = margin_l + c*fw
        d.rectangle([x,y,x+fw-4,y+fh-4], outline=(70,74,90), width=1)
        # draw a simple facing figure to illustrate direction
        cxp = x+(fw-4)//2; cyp = y+(fh-4)//2
        # head
        d.ellipse([cxp-16,cyp-34,cxp+16,cyp-6], fill=(255,218,170))
        # face direction indicator (nose dot)
        nose = {0:(0,12),1:(-14,-2),2:(14,-2),3:(0,-30)}[r]
        if r != 3:
            d.ellipse([cxp+nose[0]-3,cyp-20+nose[1]-3,cxp+nose[0]+3,cyp-20+nose[1]+3], fill=(40,40,40))
        # body
        d.rectangle([cxp-14,cyp-4,cxp+14,cyp+30], fill=col)
        # legs (alternate per frame to show walk)
        if c==0:
            d.rectangle([cxp-12,cyp+30,cxp-3,cyp+48], fill=(50,55,70))
            d.rectangle([cxp+3,cyp+34,cxp+12,cyp+48], fill=(50,55,70))
        else:
            d.rectangle([cxp-12,cyp+34,cxp-3,cyp+48], fill=(50,55,70))
            d.rectangle([cxp+3,cyp+30,cxp+12,cyp+48], fill=(50,55,70))
        d.text((x+4,y+2), f"frame {c}", fill=(110,114,130))

o = r"C:\Users\dpras\source\repos\GitHub\ai-office-os\tools\sprite_spec.png"
im.save(o); print("saved", o, im.size)
