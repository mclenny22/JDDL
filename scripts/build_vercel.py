"""Export only the active site and CMS assets for Vercel's static CDN."""
from pathlib import Path
import shutil
root = Path(__file__).resolve().parents[1]
output = root / 'public'
if output.exists():
    shutil.rmtree(output)
output.mkdir()
for name in ('index.html', 'styles.css', 'app.js', 'projects.js', 'orbit.js'):
    shutil.copy2(root / 'frontend' / name, output / name)
admin_output = output / 'admin-assets'
admin_output.mkdir()
for name in ('admin.html', 'styles.css', 'admin.js'):
    shutil.copy2(root / 'backend/static' / name, admin_output / name)
for image in (root / 'backend/static').iterdir():
    if image.suffix.lower() in {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'}:
        shutil.copy2(image, output / image.name)
