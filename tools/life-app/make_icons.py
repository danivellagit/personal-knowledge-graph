# Renders the Life app icons (dark tile, 7-segment ring, green core) with headless Chromium.
import pathlib, math, shutil
from playwright.sync_api import sync_playwright
HERE = pathlib.Path(__file__).parent
def svg(pad):
    r = 50 * (1 - pad) - 7; c = 2 * math.pi * r; seg = c / 7
    rings = "".join(f'<circle cx="50" cy="50" r="{r:.2f}" fill="none" stroke="{"url(#g)" if i < 6 else "#2C353C"}" stroke-width="8" stroke-linecap="round" stroke-dasharray="{seg-9:.2f} {c:.2f}" transform="rotate({-90 + i*360/7 + 360/7*0.5*(9/seg):.2f} 50 50)"/>' for i in range(7))
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2A3843"/><stop offset=".55" stop-color="#121A20"/><stop offset="1" stop-color="#0B0E10"/></linearGradient>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00F19F"/><stop offset="1" stop-color="#16EC06"/></linearGradient>
<radialGradient id="core"><stop offset="0" stop-color="#03130D"/><stop offset=".7" stop-color="#0B3A2C"/><stop offset="1" stop-color="#46E3A4"/></radialGradient></defs>
<rect width="100" height="100" fill="url(#bg)"/>{rings}
<circle cx="50" cy="50" r="{r*0.55:.2f}" fill="url(#core)"/>
</svg>'''
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=shutil.which("google-chrome") or shutil.which("chromium"))
    for name, size, pad in [("apple-touch-icon.png", 180, .16), ("icon-192.png", 192, .16), ("icon-512.png", 512, .16), ("icon-maskable-512.png", 512, .28)]:
        pg = b.new_page(viewport={"width": size, "height": size})
        pg.set_content(f'<html><body style="margin:0;width:{size}px;height:{size}px">{svg(pad)}</body></html>')
        pg.screenshot(path=str(HERE / "icons" / name)); pg.close()
    b.close()
print("icons ok")
