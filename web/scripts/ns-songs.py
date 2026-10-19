"""Build web/lib/stationSongs.json for nightshift radio: mood stations of YouTube songs with real durations.

  python scripts/ns-songs.py                 # rebuild every mood from MOODS below
  python scripts/ns-songs.py romantic <url>  # add a playlist / video to one mood, then rebuild

Playlists are read from their public pages (no API key). Each video's
watch page is then read for its length and whether its owner allows embedding; blocked or short videos
are dropped so the station never stalls on them.
"""
import json
import time
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "lib" / "stationSongs.json"
MOODS = {
    "trending": ["PLNCA1T91UH31M7mN8iKSxMwwWB_mkzwT6", "PL6_AX-gRSOpuWInKGtQUJuF7QWabStH9j", "PLO7-VO1D0_6NYoMAN0XncJu4tvibirSmN",
                 "PLhGslrRCBNB_3kz5lgkOTWwxPiio-CXk_", "PLkCEdVkZvreMnWmY3GhgmKhPD3pnbp6Tv", "PL-QvSRz8uhNHYPsQFUyZ4vEDURCBqLiR1"],
    "romantic": ["PLEK4199_zBwBcKBo-Sk6R52pBULxw0ApQ", "PLtzd6aavJNLgGx3tivZKYKHZQpfdi3Lw4"],
    "sad": ["PLEK4199_zBwBrB0nny6i-paleDWIXAmA-", "PL6_AX-gRSOpt2lmwQNj21YpRKBB1S4tuI"],
    "bhangra": ["PLNCA1T91UH30ow0qUL08QUC0AxaG3xQzD", "PL6_AX-gRSOpvlnXTxg73GRn6qDLUsdG2O"],
    "gym": ["PLjwbNj9NASKOFMOm5ZbUTRar8lWX7fUpD"],
    "lofi": ["PLhGslrRCBNB_oAEP-hNhM_-K-akLjWbaK", "PLNIuWZtqInuQUeansIUBbeV0p5onXXrP5"],
    "retro": ["PLBSvs4HoMIEJxOLygNnr7wCh8adtJYaGI"],
    "rap": ["PLAm3S553q8pC3qulzj4jRTLW-Nzj76PJD", "PLgP_WFDJWjxTQhOAPyXf_IedXOX7eQlSr"],
    "wedding": ["PL-FunsM0ZBoA6Axq3wt8Mr1LWvodFrYCe"],
    "sufi": ["PL4ZJnEUgawnTFBopyqmkfdN4RHZl9elbf", "PLqMtStrmKvO9mqk_LTyBAtka8KMYMJbwg"],
    "drive": ["PLvWfwCPLBQ5-OfZBJFlqTd6yyJqn0wMDJ", "PLHvybnsTYyfX336Tn6Pych7U_uDuMNZIL"],
    "haryanvi": ["PLeMt84V2r-u-O7pyuY3o8ocJpvhk0caUi", "PL78VkdACg9wzNYNmdUbCkvGu6IQu0QzvX", "PL3RMrwAhqFtZZztewmlpDvtYcwOOBmZZ0"],
    "english": ["PL3oW2tjiIxvSoyqkKFBJ5gctW9pnBy6Yn", "PL3oW2tjiIxvQcljtDpKQVNhAfK-vsZkV_", "PLR5L9iRTwxbZtuupVmMh5ZMfJ-B05uTwL"],
    "bollywood": ["PLw-VjHDlEOgvh3fIZ8VSWWE09eYGO8uFI", "PLO7-VO1D0_6NmK47v6tpOcxurcxdW-hZa", "PL4fXyPNB21BPBL_303vRBbmbac2I9j7qn"],
    "oldhindi": ["PL4OqLl4qvLkc66m2pNiD0CBRyISex0qwW"],
}
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126 Safari/537.36",
           "Accept-Language": "en-US,en;q=0.9", "Cookie": "CONSENT=YES+1; SOCS=CAI"}


def expand(list_id):
    """Video ids on a playlist's public page (its first ~100 entries)."""
    try:
        req = urllib.request.Request(f"https://www.youtube.com/playlist?list={list_id}&hl=en", headers=HEADERS)
        html = urllib.request.urlopen(req, timeout=20).read().decode("utf-8", "ignore")
    except Exception:
        return []
    ids = re.findall(r'"playlistVideoRenderer":\{"videoId":"([\w-]{11})"', html) or re.findall(r'"videoId":"([\w-]{11})"', html)
    return list(dict.fromkeys(ids))


def probe(vid):
    """Seconds, or -1 when the video is gone, private or not embeddable."""
    time.sleep(0.4)
    try:
        req = urllib.request.Request(f"https://www.youtube.com/watch?v={vid}&hl=en", headers=HEADERS)
        html = urllib.request.urlopen(req, timeout=20).read().decode("utf-8", "ignore")
    except Exception:
        return -1
    m = re.search(r'"lengthSeconds":"(\d+)"', html)
    if not m or '"playableInEmbed":false' in html or '"status":"UNPLAYABLE"' in html or '"status":"LOGIN_REQUIRED"' in html:
        return -1
    return int(m.group(1))


def main(args):
    moods = {k: list(v) for k, v in MOODS.items()}
    if len(args) >= 2:
        moods.setdefault(args[0], []).extend(args[1:])
    ids_by_mood = {}
    for mood, sources in moods.items():
        got = []
        for src in sources:
            if m := re.search(r"(?:list=)?((?:PL|RD|OL)[\w-]+)", src):
                ids = expand(m.group(1))
                print(f"    {mood:9} {m.group(1)}: {len(ids)}")
                got += ids
            elif m := re.search(r"(?:v=|youtu\.be/|shorts/)([\w-]{11})", src):
                got.append(m.group(1))
        ids_by_mood[mood] = list(dict.fromkeys(got))
    every = sorted({i for v in ids_by_mood.values() for i in v})
    # Durations never change: reuse the ones already on file and only probe new videos, gently.
    known = json.loads(OUT.read_text(encoding="utf-8")).get("songs", {}) if OUT.exists() else {}
    todo = [i for i in every if i not in known]
    print(f"probing {len(todo)} new videos ({len(every) - len(todo)} already known)")
    with ThreadPoolExecutor(4) as pool:
        lengths = {**{i: known[i] for i in every if i in known}, **dict(zip(todo, pool.map(probe, todo)))}
    if todo and all(lengths[i] == -1 for i in todo):
        sys.exit("every probe failed - YouTube is probably rate-limiting; try again later (nothing written)")
    ok = {i: d for i, d in lengths.items() if 90 <= d <= 600}  # songs, not mixes or shorts
    out = {"songs": ok, "moods": {m: [i for i in v if i in ok] for m, v in ids_by_mood.items()}}
    OUT.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    for m, v in out["moods"].items():
        print(f"  {m:9} {len(v):4} playable")
    print(f"wrote {len(ok)} songs ({len(every) - len(ok)} dropped) -> {OUT}")


if __name__ == "__main__":
    main(sys.argv[1:])
