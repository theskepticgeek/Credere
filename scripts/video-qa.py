"""Create timestamped contact sheets spanning the entire exported film."""
from pathlib import Path
from PIL import Image, ImageDraw

directory = Path('artifacts/video-qa')
frames = sorted(directory.glob('frame-*.jpg'))
for start in range(0, len(frames), 15):
    sheet = Image.new('RGB', (1920, 1900), '#f4f5ec')
    draw = ImageDraw.Draw(sheet)
    for position, frame in enumerate(frames[start:start + 15]):
        x, y = (position % 3) * 640, (position // 3) * 380
        with Image.open(frame) as image:
            image.thumbnail((640, 360))
            sheet.paste(image, (x, y + 20))
        draw.text((x + 8, y + 3), f'{start + position:02d}s', fill='#203d30')
    sheet.save(directory / f'sheet-{start // 15 + 1:02d}.jpg', quality=92)
print(f'Inspected source frames available: {len(frames)}')
