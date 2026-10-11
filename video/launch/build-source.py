from pathlib import Path
import base64

root = Path(__file__).parent
source = (root / 'film.template.html').read_text(encoding='utf8')
for token, name, mime in [('ANTON', 'Anton.woff2', 'font/woff2'), ('SYNE', 'Syne.woff2', 'font/woff2'), ('MANROPE', 'Manrope.ttf', 'font/ttf'), ('MONO', 'Mono.woff2', 'font/woff2')]:
    source = source.replace('__' + token + '__', 'data:' + mime + ';base64,' + base64.b64encode((root / name).read_bytes()).decode())
(root / 'credere-launch.html').write_text(source, encoding='utf8')
print('Built self-contained HTML:', len(source), 'bytes')
