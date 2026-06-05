"""Generate clean RPG-style furniture sprites (3/4 view, transparent bg)."""
import os, math
from PIL import Image, ImageDraw

OUT = r"C:\Users\dpras\source\repos\GitHub\ai-office-os\frontend\public\assets\furniture"
os.makedirs(OUT, exist_ok=True)
S = 128  # canvas size


def new():
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def shadow(d, cx, cy, w, h):
    d.ellipse([cx - w/2, cy - h/2, cx + w/2, cy + h/2], fill=(0, 0, 0, 55))


def box(d, x, y, w, h, dep, top, front, side, outline=(0, 0, 0, 70)):
    """Isometric-ish box. (x,y)=front-face top-left, w wide, h tall, dep depth up-right."""
    # front
    d.polygon([(x, y), (x+w, y), (x+w, y+h), (x, y+h)], fill=front, outline=outline)
    # top
    d.polygon([(x, y), (x+w, y), (x+w+dep, y-dep), (x+dep, y-dep)], fill=top, outline=outline)
    # right side
    d.polygon([(x+w, y), (x+w+dep, y-dep), (x+w+dep, y-dep+h), (x+w, y+h)], fill=side, outline=outline)


def save(im, name):
    im.save(os.path.join(OUT, name + ".png"))
    print(name)


WOOD = ((0xC8,0x92,0x3A,255),(0xA6,0x78,0x1F,255),(0x86,0x60,0x18,255))
WOOD2= ((0xB0,0x80,0x2E,255),(0x8F,0x66,0x1A,255),(0x70,0x50,0x12,255))
METAL= ((0xB8,0xBE,0xC6,255),(0x98,0x9E,0xA8,255),(0x7C,0x82,0x8C,255))
DARK = ((0x3A,0x42,0x50,255),(0x2A,0x30,0x3C,255),(0x20,0x25,0x30,255))


# ── desk ────────────────────────────────────────────────────────────────
im, d = new(); shadow(d, 64, 104, 80, 22)
box(d, 30, 70, 64, 8, 22, *WOOD)           # desktop slab
for lx in (34, 88, 50):                      # legs (front)
    d.rectangle([lx, 78, lx+5, 104], fill=WOOD[1])
box(d, 44, 50, 22, 16, 8, (40,46,58,255),(28,32,42,255),(20,24,32,255))  # monitor
d.rectangle([50, 66, 60, 72], fill=(60,66,78,255))                       # stand
save(im, "desk")

# ── computer ────────────────────────────────────────────────────────────
im, d = new(); shadow(d, 64, 96, 56, 18)
box(d, 40, 50, 48, 32, 10, (60,66,80,255),(40,45,58,255),(30,34,44,255)) # monitor body
d.rectangle([46, 54, 92, 78], fill=(90,150,210,255))                      # screen
d.rectangle([46, 54, 92, 66], fill=(120,180,230,255))                     # screen glare
d.rectangle([58, 82, 70, 96], fill=(50,55,68,255))                        # stand
d.polygon([(48,96),(80,96),(86,104),(42,104)], fill=(40,45,58,255))       # base
save(im, "computer")

# ── chair ───────────────────────────────────────────────────────────────
im, d = new(); shadow(d, 64, 104, 46, 16)
d.rounded_rectangle([46, 40, 84, 78], 6, fill=(0xE0,0x8A,0x20,255))        # backrest
box(d, 44, 70, 40, 8, 12, (0xF0,0xA8,0x30,255),(0xC8,0x80,0x18,255),(0xA8,0x68,0x12,255))  # seat
for lx in (48, 80):
    d.rectangle([lx, 86, lx+5, 104], fill=(80,80,90,255))
save(im, "chair")

# ── sofa ────────────────────────────────────────────────────────────────
im, d = new(); shadow(d, 64, 100, 96, 22)
C=((0xC0,0x3A,0x5E,255),(0x9C,0x2A,0x48,255),(0x80,0x20,0x38,255))
box(d, 22, 64, 84, 22, 14, *C)                       # base
d.rounded_rectangle([20, 44, 38, 86], 6, fill=C[1])  # left arm
d.rounded_rectangle([90, 44, 108, 86], 6, fill=C[1]) # right arm
for cx in (44, 64, 84):                              # cushions
    d.rounded_rectangle([cx-12, 50, cx+12, 70], 5, fill=C[0])
save(im, "sofa")

# ── coffee_table ────────────────────────────────────────────────────────
im, d = new(); shadow(d, 64, 96, 64, 18)
box(d, 38, 70, 52, 7, 18, *WOOD2)
for lx in (40, 86):
    d.rectangle([lx, 77, lx+5, 96], fill=WOOD2[2])
save(im, "coffee_table")

# ── plant ───────────────────────────────────────────────────────────────
im, d = new(); shadow(d, 64, 104, 44, 16)
d.polygon([(52,80),(76,80),(72,104),(56,104)], fill=(0xA0,0x55,0x2A,255))  # pot
d.rectangle([52,80,76,86], fill=(0x8A,0x45,0x20,255))
for ang in range(0, 360, 40):                                              # leaves
    r=math.radians(ang); lx=64+math.cos(r)*16; ly=58+math.sin(r)*14
    d.ellipse([lx-12, ly-7, lx+12, ly+7], fill=(0x2E,0x9E,0x3E,255))
d.ellipse([54,46,74,66], fill=(0x3A,0xB8,0x4E,255))
save(im, "plant")

# ── bookshelf ───────────────────────────────────────────────────────────
im, d = new(); shadow(d, 64, 104, 60, 16)
box(d, 36, 34, 52, 70, 10, WOOD[0], (0x6E,0x4A,0x18,255), WOOD[2])
bookcols=[(0xE0,0x40,0x40),(0x40,0x80,0xE0),(0x40,0xC0,0x60),(0xF0,0xB0,0x30),(0x9A,0x50,0xD0)]
for row,yy in enumerate((40, 62, 84)):
    for i in range(7):
        c=bookcols[(row*7+i)%len(bookcols)]
        d.rectangle([40+i*6.6, yy, 40+i*6.6+5, yy+16], fill=c+(255,))
save(im, "bookshelf")

# ── cabinet ─────────────────────────────────────────────────────────────
im, d = new(); shadow(d, 64, 104, 52, 16)
box(d, 40, 44, 44, 60, 10, METAL[0], METAL[1], METAL[2])
for yy in (52, 74):
    d.rectangle([46, yy, 78, yy+18], outline=(0x60,0x66,0x70,255), width=2)
    d.rectangle([58, yy+7, 66, yy+11], fill=(0x50,0x56,0x60,255))           # handle
save(im, "cabinet")

# ── locker ──────────────────────────────────────────────────────────────
im, d = new(); shadow(d, 64, 106, 44, 14)
box(d, 44, 32, 36, 72, 10, (0x6E,0x8A,0x6E,255),(0x52,0x6E,0x52,255),(0x40,0x58,0x40,255))
d.rectangle([48, 38, 76, 100], outline=(0x38,0x4E,0x38,255), width=2)
for yy in (44, 50, 56): d.rectangle([56, yy, 68, yy+2], fill=(0x38,0x4E,0x38,255))  # vents
d.ellipse([70, 66, 76, 72], fill=(0xD0,0xD0,0x40,255))                              # lock
save(im, "locker")

# ── vending_machine ─────────────────────────────────────────────────────
im, d = new(); shadow(d, 64, 108, 50, 14)
box(d, 40, 24, 44, 80, 10, (0x30,0x50,0xC0,255),(0x22,0x3C,0x98,255),(0x18,0x2C,0x74,255))
d.rectangle([45, 30, 70, 74], fill=(0x14,0x24,0x44,255))                            # glass
for r in range(3):
    for c in range(3):
        col=[(0xE0,0x40,0x40),(0x40,0xC0,0x60),(0xF0,0xC0,0x30),(0x40,0x80,0xE0),(0x9A,0x50,0xD0),(0xE0,0x80,0x30),(0x30,0xC0,0xC0),(0xE0,0x40,0x90),(0x80,0xC0,0x40)][r*3+c]
        d.rectangle([47+c*8, 32+r*13, 47+c*8+6, 32+r*13+10], fill=col+(255,))
d.rectangle([74, 34, 80, 70], fill=(0x10,0x1C,0x34,255))                            # panel
d.rectangle([45, 80, 78, 96], fill=(0x12,0x20,0x40,255))                            # tray
save(im, "vending_machine")

# ── water_dispenser ─────────────────────────────────────────────────────
im, d = new(); shadow(d, 64, 106, 40, 14)
box(d, 48, 56, 30, 48, 8, (0xE8,0xEC,0xF0,255),(0xC8,0xCE,0xD6,255),(0xAC,0xB2,0xBC,255))
d.ellipse([50, 26, 78, 60], fill=(0xAE,0xD8,0xF0,200))                              # bottle
d.ellipse([50, 26, 78, 44], fill=(0xC8,0xE8,0xF8,220))
d.rectangle([56, 66, 62, 74], fill=(0x40,0x80,0xE0,255))                            # blue tap
d.rectangle([66, 66, 72, 74], fill=(0xE0,0x40,0x40,255))                            # red tap
save(im, "water_dispenser")

# ── whiteboard ──────────────────────────────────────────────────────────
im, d = new(); shadow(d, 64, 104, 76, 14)
d.rounded_rectangle([26, 36, 102, 90], 4, fill=(0x6A,0x70,0x7A,255))                # frame
d.rectangle([31, 41, 97, 85], fill=(0xF4,0xF6,0xF8,255))                            # board
d.line([38,52,68,52], fill=(0x40,0x80,0xE0,255), width=2)
d.line([38,60,80,60], fill=(0xE0,0x40,0x40,255), width=2)
d.line([38,68,60,68], fill=(0x40,0xA0,0x50,255), width=2)
for lx in (34, 92): d.rectangle([lx, 90, lx+5, 104], fill=(0x50,0x56,0x60,255))
save(im, "whiteboard")

# ── notice_board ────────────────────────────────────────────────────────
im, d = new(); shadow(d, 64, 102, 70, 14)
d.rounded_rectangle([30, 34, 98, 92], 4, fill=(0x7A,0x52,0x2A,255))                 # frame
d.rectangle([35, 39, 93, 87], fill=(0xCE,0xA8,0x70,255))                            # cork
notes=[(42,46,(0xF8,0xE0,0x60)),(64,44,(0xF0,0xA0,0xC0)),(44,66,(0xA0,0xD8,0xF0)),(70,66,(0xC0,0xF0,0xA0))]
for nx,ny,c in notes:
    d.rectangle([nx,ny,nx+16,ny+14], fill=c+(255,))
    d.ellipse([nx+6,ny-2,nx+10,ny+2], fill=(0xC0,0x30,0x30,255))                    # pin
save(im, "notice_board")

# ── box ─────────────────────────────────────────────────────────────────
im, d = new(); shadow(d, 64, 100, 56, 16)
box(d, 42, 56, 40, 38, 18, (0xD8,0xB0,0x78,255),(0xB8,0x90,0x58,255),(0x9C,0x78,0x44,255))
d.line([42,74,82,74], fill=(0x8A,0x68,0x38,255), width=2)                           # tape
d.line([60,56,60,94], fill=(0x8A,0x68,0x38,200), width=2)
save(im, "box")

# ── door ────────────────────────────────────────────────────────────────
im, d = new(); shadow(d, 64, 106, 44, 12)
box(d, 44, 24, 38, 80, 6, (0x7A,0x52,0x2A,255),(0x6A,0x46,0x22,255),(0x52,0x36,0x18,255))
d.rectangle([50, 32, 76, 60], outline=(0x52,0x36,0x18,255), width=2)
d.rectangle([50, 66, 76, 96], outline=(0x52,0x36,0x18,255), width=2)
d.ellipse([72, 64, 78, 70], fill=(0xE0,0xC0,0x40,255))                              # knob
save(im, "door")

# ── stairs ──────────────────────────────────────────────────────────────
im, d = new(); shadow(d, 64, 108, 70, 14)
for i in range(4):
    yy = 92 - i*16; w = 64 - i*8; x = 64 - w/2
    box(d, x, yy, w, 12, 8, (0x9A,0xA0,0xAA,255),(0x7C,0x82,0x8C,255),(0x64,0x6A,0x74,255))
save(im, "stairs")

print("DONE")
