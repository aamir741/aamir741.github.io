"""Sync mirakx.com with the public videos on the Mirak X YouTube channel (runs on GitHub Actions).

Reads the channel's public RSS feed, merges it into data/videos.json, then refreshes the video
sections on the home page and /videos/, and fills blog-post embeds whose marker matches a video title.
"""
import datetime
import html
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

CHANNEL_ID = "UCNe_bMAoNrQXzPuK4oRscgQ"
ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "videos.json"
NS = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015"}


def esc(s):
    return html.escape(str(s), quote=True)


def nice_date(iso):
    return datetime.date.fromisoformat(iso).strftime("%d %B %Y").lstrip("0")


def feed():
    url = f"https://www.youtube.com/feeds/videos.xml?channel_id={CHANNEL_ID}"
    xml = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "mirakx-sync"}), timeout=30).read()
    out = []
    for e in ET.fromstring(xml).findall("a:entry", NS):
        vid = e.find("yt:videoId", NS).text
        title = e.find("a:title", NS).text or ""
        if title.strip().lower() in ("untitled video", "") or title.strip().lower().endswith(" is live!"):
            continue
        out.append({"id": vid, "title": title, "date": e.find("a:published", NS).text[:10],
                    "description": "", "thumb": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"})
    return out


def cards(videos):
    return "".join(
        f'<a class="vcard" href="https://www.youtube.com/watch?v={v["id"]}" target="_blank" rel="noopener">'
        f'<div class="vthumb"><img src="{esc(v["thumb"])}" alt="{esc(v["title"])}" loading="lazy"></div>'
        f'<div class="t"><b>{esc(v["title"])}</b><small>{nice_date(v["date"])}</small></div></a>'
        for v in videos)


def replace_block(text, name, content):
    return re.sub(rf"(<!--{name}:START-->).*?(<!--{name}:END-->)", lambda m: m.group(1) + content + m.group(2), text, flags=re.S)


def embed(video):
    return (f'<div class="embed"><iframe src="https://www.youtube-nocookie.com/embed/{video["id"]}" title="{esc(video["title"])}" '
            f'loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>')


def main():
    known = json.loads(DATA.read_text(encoding="utf-8")) if DATA.exists() else []
    latest = feed()
    if not latest:
        return print("Feed empty; nothing to do.")
    live_ids = {v["id"] for v in latest}
    oldest_in_feed = min(v["date"] for v in latest)
    # keep older videos the feed no longer lists; drop recent ones that disappeared (made private or deleted)
    kept = [v for v in known if v["id"] not in live_ids and v["date"] < oldest_in_feed]
    videos = sorted(latest + kept, key=lambda v: v["date"], reverse=True)
    DATA.write_text(json.dumps(videos, indent=1, ensure_ascii=False), encoding="utf-8")

    grid = f'<div class="vgrid">{cards(videos)}</div>'
    for rel, content in (("index.html", f'<div class="vgrid">{cards(videos[:3])}</div>'), ("videos/index.html", grid)):
        p = ROOT / rel
        if p.exists():
            p.write_text(replace_block(p.read_text(encoding="utf-8"), "VIDEOS", content), encoding="utf-8")

    for post in (ROOT / "blog").glob("*/index.html"):
        text = post.read_text(encoding="utf-8")

        def fill(m):
            match = html.unescape(m.group(1)).strip().lower()
            video = next((v for v in videos if match and match in v["title"].lower()), None)
            if not video:
                return m.group(0)  # no public match yet: leave the post as it is
            return f"<!--EMBED:{m.group(1)}-->{embed(video)}<!--/EMBED-->"

        new = re.sub(r"<!--EMBED:(.*?)-->.*?<!--/EMBED-->", fill, text, flags=re.S)
        if new != text:
            post.write_text(new, encoding="utf-8")
    print(f"Synced {len(videos)} videos")


if __name__ == "__main__":
    main()
