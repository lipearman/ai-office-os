from PIL import Image
src = r"C:\Users\dpras\Downloads\ChatGPT Image Jun 3, 2026, 09_55_32 PM.png"
im = Image.open(src).convert("RGB")
# Tight crop of rooftop_terrace (exclude label + neighbours)
crop = im.crop((458, 40, 872, 280))
out = r"C:\Users\dpras\source\repos\GitHub\ai-office-os\frontend\public\assets\maps\rooftop_terrace.png"
crop.save(out)
print("saved", out, crop.size)
# preview copy
crop.save(r"C:\Users\dpras\source\repos\GitHub\ai-office-os\tools\rooftop_test.png")
