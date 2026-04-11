import io

import aiohttp
from PIL import Image, ImageDraw, ImageFont, ImageFilter

IMG_W = 800
IMG_H = 800
PADDING = 120


def _wrap_text(draw: ImageDraw.ImageDraw, text: str, font, max_width: int) -> list[str]:
    words = text.split()
    lines = []
    current = ''
    for word in words:
        candidate = (current + ' ' + word).strip()
        if draw.textlength(candidate, font=font) <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def _render(bg_data: bytes, quote: str, author: str, font_path: str) -> bytes:
    # Background: resize, blur, darken
    bg = Image.open(io.BytesIO(bg_data)).convert('RGBA').resize((IMG_W, IMG_H), Image.Resampling.LANCZOS)
    bg = bg.filter(ImageFilter.GaussianBlur(radius=5))
    overlay = Image.new('RGBA', bg.size, (0, 0, 0, 160))
    img = Image.alpha_composite(bg, overlay)

    draw = ImageDraw.Draw(img)

    font_quote = ImageFont.truetype(font_path, 54)
    font_author = ImageFont.truetype(font_path, 38)
    font_deco = ImageFont.truetype(font_path, 220)

    # Decorative opening quote mark (faint, top-left)
    draw.text((50, -40), '\u201c', font=font_deco, fill=(255, 255, 255, 45))

    # Wrap and vertically center quote text
    lines = _wrap_text(draw, quote, font_quote, IMG_W - PADDING * 2)
    _, _, _, line_h = draw.textbbox((0, 0), 'Ag', font=font_quote)
    line_h += 14
    y = (IMG_H - line_h * len(lines)) // 2 - 20

    for line in lines:
        x = int((IMG_W - draw.textlength(line, font=font_quote)) // 2)
        draw.text((x + 2, y + 2), line, font=font_quote, fill=(0, 0, 0, 180))
        draw.text((x, y), line, font=font_quote, fill=(255, 255, 255, 255))
        y += line_h

    # Author centered near bottom
    author_str = f'\u2014 {author}'
    ax = int((IMG_W - draw.textlength(author_str, font=font_author)) // 2)
    ay = IMG_H - 90
    draw.text((ax + 2, ay + 2), author_str, font=font_author, fill=(0, 0, 0, 180))
    draw.text((ax, ay), author_str, font=font_author, fill=(200, 200, 200, 255))

    out = io.BytesIO()
    img.convert('RGB').save(out, format='JPEG', quality=92)
    return out.getvalue()


async def generate_quote_image(quote: str, author: str, font_path: str) -> bytes:
    async with aiohttp.ClientSession() as session:
        async with session.get(f'https://picsum.photos/{IMG_W}/{IMG_H}', allow_redirects=True) as resp:
            bg_data = await resp.read()
    return _render(bg_data, quote, author, font_path)
