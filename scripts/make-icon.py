"""Generate the repository's generic Q app mark; never process character artwork."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
output = root / "assets/icon.ico"
if output.exists():
    raise FileExistsError("Existing application icon is protected")
image = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((32, 32, 992, 992), radius=232, fill="#6850a4")
draw.ellipse((236, 224, 756, 744), outline="white", width=96)
draw.line((628, 632, 796, 800), fill="#e6ddff", width=104)
draw.ellipse((576, 580, 680, 684), fill="#e6ddff")
draw.ellipse((744, 748, 848, 852), fill="#e6ddff")
draw.ellipse((792, 140, 888, 236), fill="#cfbdff")
image = image.resize((256, 256), Image.Resampling.LANCZOS)
image.save(output, format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print(output)
