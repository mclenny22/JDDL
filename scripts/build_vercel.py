"""Export only the active site and CMS assets for Vercel's static CDN."""
from pathlib import Path
import shutil
root = Path(__file__).resolve().parents[1]
output = root / 'public'
if output.exists():
    shutil.rmtree(output)
shutil.copytree(root / 'frontend', output)
shutil.copytree(root / 'backend/static', output / 'admin-assets')
for image in (root / 'backend/static').iterdir():
    if image.suffix.lower() in {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'}:
        shutil.copy2(image, output / image.name)
