#!/usr/bin/env python3
"""Regenera la marca desde assets/branding/dnmusic-source.png. Requiere Pillow."""
import argparse
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
source = Image.open(ROOT / 'assets/branding/dnmusic-source.png').convert('RGBA')
# El original se conserva intacto; excluir píxeles casi invisibles al medir evita
# que el margen de exportación desplace el símbolo en las máscaras del sistema.
bounds = source.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
mark = source.crop(bounds)
BG = (18, 18, 18, 255)


def icon(size, fraction=.78, opaque=True, monochrome=False, safe_radius=None):
    scale = size * fraction / max(mark.size)
    if safe_radius:
        # Todo el dibujo visible dentro de la zona circular segura; no depende
        # de que el launcher elija una máscara redonda, cuadrada o squircle.
        alpha = mark.getchannel('A')
        cx, cy = mark.width / 2, mark.height / 2
        radius = max(((x-cx)**2 + (y-cy)**2)**.5
                     for y in range(mark.height) for x in range(mark.width)
                     if alpha.getpixel((x, y)) > 8)
        scale = min(scale, size * safe_radius / radius)
    art = mark.resize((round(mark.width * scale), round(mark.height * scale)), Image.Resampling.LANCZOS)
    if monochrome:
        white = Image.new('RGBA', art.size, 'white')
        white.putalpha(art.getchannel('A'))
        art = white
    result = Image.new('RGBA', (size, size), BG if opaque else (0, 0, 0, 0))
    result.alpha_composite(art, ((size-art.width)//2, (size-art.height)//2))
    return result.convert('RGB') if opaque else result


def save(path, im, **kwargs):
    destination = ROOT / path
    destination.parent.mkdir(parents=True, exist_ok=True)
    im.save(destination, **kwargs)
    print(path, im.size)


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--desktop-only', action='store_true', help='Regenerar sólo los recursos de Windows y Linux')
args = parser.parse_args()

# Windows y Linux dibujan la silueta del recurso, no aplican la máscara de iOS.
# Usamos la marca transparente existente, igual que en el splash.
save('assets/desktop-icon.png', icon(1024, opaque=False))
save('assets/icon.ico', icon(256, opaque=False), sizes=[(n, n) for n in (16, 20, 24, 32, 40, 48, 64, 128, 256)])
if args.desktop_only:
    raise SystemExit(0)

save('assets/icon.png', icon(1024))
save('assets/favicon.png', icon(64))
save('assets/branding/splash-dnmusic.png', icon(1024, .78, opaque=False))
save('assets/android-icon-background.png', Image.new('RGB', (1024, 1024), BG[:3]))
save('assets/android-icon-foreground.png', icon(1024, opaque=False, safe_radius=.30))
save('assets/android-icon-monochrome.png', icon(1024, opaque=False, monochrome=True, safe_radius=.30))
save('assets/notification-icon.png', icon(96, .88, opaque=False, monochrome=True))
for size in (192, 512):
    save(f'public/icons/icon-{size}.png', icon(size))
save('public/icons/icon-maskable-512.png', icon(512, safe_radius=.36))
save('public/icons/apple-touch-icon.png', icon(180))
