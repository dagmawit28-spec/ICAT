"""Build the home-screen (web) version of ICAT into dist/.

Run from the repo root:  python3 scripts/build-web.py
Then publish dist/ to the gh-pages branch (see README).
"""
import json, shutil, subprocess, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
dist = root / "dist"
shutil.rmtree(dist, ignore_errors=True)
subprocess.run(["npx", "expo", "export", "--platform", "web"], cwd=root, check=True)

base = "/ICAT"
shutil.copy(root / "assets/apple-touch-icon.png", dist / "apple-touch-icon.png")
shutil.copy(root / "assets/icon.png", dist / "icon-1024.png")
(dist / ".nojekyll").write_text("")
(dist / "manifest.json").write_text(json.dumps({
    "name": "ICAT", "short_name": "ICAT", "start_url": base + "/", "scope": base + "/",
    "display": "standalone", "background_color": "#090D12", "theme_color": "#090D12",
    "icons": [{"src": base + "/apple-touch-icon.png", "sizes": "180x180", "type": "image/png"},
              {"src": base + "/icon-1024.png", "sizes": "1024x1024", "type": "image/png"}],
}, indent=2))

html = (dist / "index.html").read_text()
html = html.replace(
    '<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />')
head_extra = f"""
    <link rel="manifest" href="{base}/manifest.json">
    <link rel="apple-touch-icon" href="{base}/apple-touch-icon.png">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="ICAT">
    <style>html,body{{background:#090D12}}</style>
"""
html = html.replace("</head>", head_extra + "</head>", 1)
(dist / "index.html").write_text(html)
print("Built dist/ for", base)
