import os
from PIL import Image, ImageDraw
D = r"C:\Users\dpras\source\repos\GitHub\ai-office-os\frontend\public\assets\furniture"
names = ["desk","computer","chair","sofa","coffee_table","plant","bookshelf","cabinet",
         "locker","vending_machine","water_dispenser","whiteboard","notice_board","box","door","stairs"]
cell=130; cols=8; rows=2
sheet=Image.new("RGB",(cols*cell,rows*cell),(40,44,52)); d=ImageDraw.Draw(sheet)
sq=14
for y in range(0,sheet.height,sq):
  for x in range(0,sheet.width,sq):
    if (x//sq+y//sq)%2==0: d.rectangle([x,y,x+sq,y+sq],fill=(52,56,64))
for i,n in enumerate(names):
  im=Image.open(os.path.join(D,n+".png")).convert("RGBA")
  c,r=i%cols,i//cols; sheet.paste(im,(c*cell,r*cell+4),im)
  d.text((c*cell+4,r*cell+cell-14),n,fill=(220,220,230))
p=r"C:\Users\dpras\source\repos\GitHub\ai-office-os\tools\furn_sheet.png"
sheet.save(p); print("saved",sheet.size)
