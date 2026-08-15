#!/usr/bin/env python3
"""Snapshot English Wikisource pages into raw/ws/<collection>/.

Each page is stored as the rendered HTML the API returns, alongside the exact
revision id, so a build is reproducible against a moving wiki.

Usage: wikisource.py <collection> <page title> [<page title> ...]
"""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

API = "https://en.wikisource.org/w/api.php"
UA = "ClassicBooks/1.0 (offline reader; contact: repository issues)"
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


def api(params):
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 4:
                time.sleep(5 * (attempt + 1))
                continue
            raise
    raise RuntimeError("unreachable")


def slug_for(title):
    leaf = title.split("/")[-1]
    return re.sub(r"[^a-z0-9]+", "-", leaf.lower()).strip("-")


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 1
    collection = sys.argv[1]
    titles = sys.argv[2:]
    dest = os.path.join(ROOT, "raw", "ws", collection)
    os.makedirs(dest, exist_ok=True)

    pages = []
    for title in titles:
        data = api({
            "action": "parse", "page": title, "prop": "text|revid",
            "formatversion": "2", "format": "json",
        })["parse"]
        slug = slug_for(title)
        with open(os.path.join(dest, slug + ".html"), "w") as f:
            f.write(data["text"])
        pages.append({"title": title, "file": slug + ".html", "revid": data["revid"]})
        print(f"  {slug}.html <- {title} @ rev {data['revid']}")
        time.sleep(1.0)  # be polite to the API

    with open(os.path.join(dest, "SNAPSHOT.json"), "w") as f:
        json.dump({
            "source": "wikisource",
            "url": "https://en.wikisource.org/",
            "retrieved": time.strftime("%Y-%m-%d"),
            "pages": pages,
        }, f, indent=2)
    print(f"{len(pages)} pages -> raw/ws/{collection}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
