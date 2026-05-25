import io
import re
import aiohttp
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pilmoji import Pilmoji
import emoji

IMG_W = 800
IMG_H = 800
PADDING = 120

DISCORD_EMOJI_REGEX = re.compile(r'<a?:[a-zA-Z0-9_]+:\d+>')


def get_text_length(draw: ImageDraw.ImageDraw, text: str, font) -> float:
    # Replace Discord custom emojis and Unicode emojis with 'M' (standard proxy width)
    text_without_custom = DISCORD_EMOJI_REGEX.sub('M', text)
    clean_text = ''.join('M' if emoji.is_emoji(c) else c for c in text_without_custom)
    return draw.textlength(clean_text, font=font)


def _wrap_text(draw: ImageDraw.ImageDraw, text: str, font, max_width: int) -> list[str]:
    paragraphs = text.split('\n')
    lines = []
    for paragraph in paragraphs:
        if not paragraph:
            lines.append('')
            continue
        words = paragraph.split(' ')
        current = ''
        for word in words:
            if not word:
                continue
            candidate = (current + ' ' + word).strip()
            if get_text_length(draw, candidate, font=font) <= max_width:
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

    with Pilmoji(img) as pilmoji:
        for line in lines:
            if line:
                x = int((IMG_W - get_text_length(draw, line, font_quote)) // 2)
                pilmoji.text((x + 2, y + 2), line, font=font_quote, fill=(0, 0, 0, 180))
                pilmoji.text((x, y), line, font=font_quote, fill=(255, 255, 255, 255))
            y += line_h

        # Author centered near bottom
        author_str = f'\u2014 {author}'
        ax = int((IMG_W - get_text_length(draw, author_str, font_author)) // 2)
        ay = IMG_H - 90
        pilmoji.text((ax + 2, ay + 2), author_str, font=font_author, fill=(0, 0, 0, 180))
        pilmoji.text((ax, ay), author_str, font=font_author, fill=(200, 200, 200, 255))

    out = io.BytesIO()
    img.convert('RGB').save(out, format='JPEG', quality=92)
    return out.getvalue()


async def generate_quote_image(quote: str, author: str, font_path: str) -> bytes:
    timeout = aiohttp.ClientTimeout(total=10)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(f'https://picsum.photos/{IMG_W}/{IMG_H}', allow_redirects=True) as resp:
            if resp.status != 200:
                raise aiohttp.ClientError(f"Failed to fetch background image: HTTP {resp.status}")
            bg_data = await resp.read()
    return _render(bg_data, quote, author, font_path)
