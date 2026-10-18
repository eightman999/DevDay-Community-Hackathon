#!/usr/bin/env python3
"""Bundle the local-only prototype into a single opening HTML file."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
html=(root/'public'/'index.html').read_text(encoding='utf-8')
css=(root/'public'/'styles.css').read_text(encoding='utf-8')
js=(root/'public'/'app.js').read_text(encoding='utf-8')
assert '</script' not in js.lower(), 'Script includes an unsafe closing tag for inlining'
assert '</style' not in css.lower(), 'Stylesheet includes an unsafe closing tag for inlining'
html=html.replace('<link rel="stylesheet" href="./styles.css">',f'<style>\n{css}\n</style>')
html=html.replace('<script src="./app.js" defer></script>',f'<script>\n{js}\n</script>')
assert './styles.css' not in html and './app.js' not in html
output=root/'standalone-preview.html'
output.write_text(html,encoding='utf-8')
print(f'Created {output} ({len(html.encode("utf-8"))} bytes)')
