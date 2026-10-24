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

# ---- calendar reminders: one .ics per possible test start date ----
# Times are "floating" (no timezone) so they land at 9am / 8pm wherever the tester is.
import datetime
APP_URL = "https://dagmawit28-spec.github.io/ICAT/"
EVENTS = [
    (0, 9, "ICAT Day 1: get set up", "Add ICAT to your home screen, charge your battery, do one full check-in with a tool, and write an I am line."),
    (0, 20, "ICAT: rate day 1", "Open ICAT and tap the star (Review) at the top. 10 seconds."),
    (1, 9, "ICAT Day 2: charge your battery", "Charge your battery, then check in the moment something hits you today. Try a tool you haven't used."),
    (1, 20, "ICAT: rate day 2", "Open ICAT and tap the star (Review) at the top."),
    (2, 9, "ICAT Day 3: habit test", "Charge your battery, do a check-in, and use Rethink it on something that bugged you."),
    (2, 20, "ICAT: send your full feedback", "Feedback tab in ICAT. Be brutal, this is the part Dag needs most."),
]
def esc(t): return t.replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;")
cal = dist / "cal"; cal.mkdir()
stamp = datetime.datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
start0 = datetime.date.today() - datetime.timedelta(days=7)
for n in range(160):
    d0 = start0 + datetime.timedelta(days=n)
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ICAT//Test plan//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:ICAT test"]
    for i, (off, hr, title, desc) in enumerate(EVENTS):
        d = d0 + datetime.timedelta(days=off)
        st = datetime.datetime(d.year, d.month, d.day, hr, 0)
        lines += ["BEGIN:VEVENT", f"UID:icat-{d0.isoformat()}-{i}@icat", f"DTSTAMP:{stamp}",
                  f"DTSTART:{st.strftime('%Y%m%dT%H%M%S')}", f"DTEND:{(st + datetime.timedelta(minutes=10)).strftime('%Y%m%dT%H%M%S')}",
                  f"SUMMARY:{esc(title)}", f"DESCRIPTION:{esc(desc + ' ' + APP_URL)}", f"URL:{APP_URL}",
                  "BEGIN:VALARM", "ACTION:DISPLAY", f"DESCRIPTION:{esc(title)}", "TRIGGER:PT0M", "END:VALARM", "END:VEVENT"]
    lines.append("END:VCALENDAR")
    (cal / f"{d0.isoformat()}.ics").write_text("\r\n".join(lines) + "\r\n")
print("Built dist/ for", base)
