from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
SIZE = 1024


def load_font(px: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in [
        Path("C:/Windows/Fonts/arialbd.ttf"),
        Path("C:/Windows/Fonts/segoeuib.ttf"),
        Path("C:/Windows/Fonts/calibrib.ttf"),
    ]:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), px)
    return ImageFont.load_default()


def main() -> None:
    ASSETS.mkdir(exist_ok=True)

    image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    pad = 76
    radius = 220
    draw.rounded_rectangle((pad, pad, SIZE - pad, SIZE - pad), radius=radius, fill=(0, 20, 48, 255))

    for i in range(28):
        inset = pad + i * 5
        alpha = max(0, 110 - i * 4)
        draw.rounded_rectangle((inset, inset, SIZE - inset, SIZE - inset), radius=max(20, radius - i * 5), outline=(3, 180, 251, alpha), width=7)

    band = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    band_draw = ImageDraw.Draw(band)
    band_draw.polygon([(120, 760), (760, 120), (910, 120), (270, 760)], fill=(3, 180, 251, 40))
    image.alpha_composite(band.filter(ImageFilter.GaussianBlur(1.2)))

    font = load_font(410)
    text = "CC"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = (SIZE - text_width) / 2 - bbox[0]
    y = (SIZE - text_height) / 2 - bbox[1] - 18

    draw.text((x + 18, y + 22), text, font=font, fill=(0, 6, 20, 180), stroke_width=20, stroke_fill=(0, 6, 20, 180))
    draw.text((x, y), text, font=font, fill=(230, 250, 255, 255), stroke_width=18, stroke_fill=(3, 180, 251, 255))
    draw.text((x, y), text, font=font, fill=(244, 253, 255, 255), stroke_width=3, stroke_fill=(244, 253, 255, 255))

    png_path = ASSETS / "icon.png"
    ico_path = ASSETS / "icon.ico"
    image.save(png_path)
    image.save(ico_path, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

    print(png_path)
    print(ico_path)


if __name__ == "__main__":
    main()
