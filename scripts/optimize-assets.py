"""Generate display assets without changing or replacing archive originals."""
from pathlib import Path
import json
from PIL import Image, ImageOps

root = Path(__file__).resolve().parents[1]
works = json.loads((root / 'src/data/gallery.json').read_text())
output = root / 'public/images/responsive'
output.mkdir(parents=True, exist_ok=True)
for work in works:
    with Image.open(root / 'public' / work['image'].lstrip('/')) as source:
        source = ImageOps.exif_transpose(source).convert('RGB')
        for size in (360, 720):
            width = min(size, source.width)
            image = source.resize((width, round(source.height * width / source.width)), Image.Resampling.LANCZOS)
            image.save(output / f"{work['id']}-{size}.webp", 'WEBP', quality=82, method=6)

hero = next(work for work in works if 'честер' in work['title'].lower())
with Image.open(root / 'public' / hero['image'].lstrip('/')) as source:
    source = ImageOps.exif_transpose(source).convert('RGB')
    for size in (720, 1280, 1600):
        image = source.copy()
        image.thumbnail((size, size), Image.Resampling.LANCZOS)
        image.save(output / f"hero-{size}.webp", 'WEBP', quality=88, method=6)

print(json.dumps({'gallery_variants': len(works) * 2, 'hero_variants': 3}))
