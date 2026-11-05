#!/usr/bin/env python3
"""Build the HACK THE PLANET gameplay trailer GIF from real captured footage.

Usage:
    python3 gen_gif.py [OUTPUT]                   # capture + compose (default: trailer.gif)
    python3 gen_gif.py trailer.gif --frames DIR   # compose from an earlier capture
    python3 gen_gif.py --capture-only DIR         # only record the footage

Pipeline:
  1. tools/capture-trailer.js plays the four levels in headless Chrome with real
     keyboard/mouse input and records timestamped 1280x720 frames, plus a little
     game state per frame that is used here to find the action.
  2. This script picks each scene's window, crops and pushes in, adds titles,
     cuts and short glitch transitions, and encodes a looping 640x360 GIF at
     12 fps with ImageMagick. It also writes a contact sheet for review.

Needs Node 22+, Chrome/Chromium (CHROME_PATH to override) and ImageMagick 7
(`magick`). Fonts are looked up on the system; HTP_FONT_DISPLAY and
HTP_FONT_MONO override them. Every frame between the opening title and the
closing card is game footage; only titles and transitions are drawn here.
"""
import argparse
import json
import os
import random
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.abspath(__file__))
W, H = 640, 360
FPS = 12
FRAME_MS = 1000.0 / FPS
# Storyboard cut points (seconds): opening, four levels, call to action.
CUTS = [0.0, 0.6, 1.7, 2.8, 3.9, 5.1, 6.5]

BG = "#000300"
GREEN = "#00ff41"

FONT_CANDIDATES = {
    "display": [
        os.environ.get("HTP_FONT_DISPLAY"),
        "/System/Library/Fonts/Supplemental/Impact.ttf",
        "/Library/Fonts/Impact.ttf",
        "/usr/share/fonts/truetype/msttcorefonts/Impact.ttf",
        "/System/Library/Fonts/Supplemental/Arial Black.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ],
    "mono": [
        os.environ.get("HTP_FONT_MONO"),
        "/System/Library/Fonts/Supplemental/Courier New Bold.ttf",
        "/Library/Fonts/Courier New Bold.ttf",
        "/usr/share/fonts/truetype/msttcorefonts/courbd.ttf",
        "/usr/share/fonts/truetype/msttcorefonts/Courier_New_Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf",
    ],
}

# name, tagline, mission chip, accent. The footage keeps each level's own
# palette; only the accent of its title changes.
LEVELS = {
    "level1": ("FSYNDICATE", "HUNT ROGUE AGENTS", "MISSION 01 · THE AGENTIC FRONTIER", "#26e8ff"),
    "level2": ("AI INCIDENT LAB", "INVESTIGATE. PATCH. VERIFY.", "MISSION 02 · VULNERABILITY HUNTER", GREEN),
    "level3": ("OPERATION GHOST", "TRUST NO SIGNAL", "MISSION 03 · CYBER MIAMI NOIR", "#ff6eb4"),
    "level4": ("NEON GRAND PRIX", "DRIVE. DEFEND. WIN.", "MISSION 04 · MIAMI SMART CIRCUIT", "#ffe14d"),
}


def find_font(kind):
    for path in FONT_CANDIDATES[kind]:
        if path and os.path.exists(path):
            return path
    sys.exit(f"No {kind} font found; set HTP_FONT_{kind.upper()} to a .ttf/.otf file.")


def magick(*args):
    subprocess.run(["magick", *[str(a) for a in args]], check=True)


def scene_lengths():
    marks = [round(c * FPS) for c in CUTS]
    return [b - a for a, b in zip(marks, marks[1:])]


# ── Picking the moments (by recorded game state, not frame numbers) ──────

def sample(frames, t_start, n, speed=1.0):
    """Nearest captured frame for each output tick from t_start (ms)."""
    return [min(frames, key=lambda f: abs(f["t"] - (t_start + i * FRAME_MS * speed))) for i in range(n)]


def window_level1(frames, n):
    # End just after THE SCOUT is contained: pulses, hit, burst, banner.
    playing = [f for f in frames if f.get("phase", "playing") == "playing"]
    down = next((f for f in playing if f.get("alive") is False), None)
    t_end = min((down["t"] + 330) if down else playing[-1]["t"], playing[-1]["t"])
    return sample(playing, max(0, t_end - (n - 1) * FRAME_MS), n)


def window_level2(shots, n):
    n_walk, n_fix = 5, 4
    n_ver = n - n_walk - n_fix
    walk = shots["walk"]
    arrive = next((f for f in walk if f.get("d", 99) < 40), walk[-1])
    walk_sel = sample(walk, max(0, arrive["t"] - (n_walk - 2) * FRAME_MS * 1.6), n_walk, 1.6)
    fix = shots["mitigate"]
    fix_sel = sample(fix, max(0, fix[-1]["t"] - (n_fix + 1) * FRAME_MS * 1.3), n_fix, 1.3)
    ver = shots["verify"]
    done = next((f for f in ver if f.get("done")), ver[-1])
    ver_sel = sample(ver, max(0, done["t"] - 2 * FRAME_MS * 1.5), n_ver, 1.5)
    return walk_sel, fix_sel, ver_sel


def window_level3(frames, n):
    return sample(frames, 1100, n)                 # camera settled, GHOST mid-stride


def window_level4(frames, n, speed=1.2):
    # The fastest stretch with no decision panel open, slightly overcranked.
    span = (n - 1) * FRAME_MS * speed
    best, best_t = -1, 0
    for f in frames:
        if f["t"] + span > frames[-1]["t"]:
            break
        win = [g for g in frames if f["t"] <= g["t"] <= f["t"] + span]
        if any(g.get("decision") for g in win):
            continue
        score = sum(g.get("mph", 0) for g in win) / len(win)
        if score > best:
            best, best_t = score, f["t"]
    return sample(frames, best_t, n, speed)


# ── Drawing ──────────────────────────────────────────────────────────────

class Ink:
    """Text images measured by ImageMagick itself (label:), so layout is exact."""

    def __init__(self, tmp, fonts):
        self.tmp, self.fonts, self.n = tmp, fonts, 0

    def _path(self):
        self.n += 1
        return os.path.join(self.tmp, f"ink_{self.n}.png")

    def text(self, text, font, pt, fill, glow=None, kern=0):
        """Text with a drop shadow and an optional neon glow, on transparency."""
        p = self._path()
        args = ["-background", "none", "-font", self.fonts[font], "-pointsize", pt, "-kerning", kern,
                "-fill", fill, f"label:{text}", "-bordercolor", "none", "-border", 14,
                "-write", "mpr:t", "+delete"]
        # A soft dark halo keeps text legible over bright skies.
        args += ["(", "mpr:t", "-fill", "black", "-colorize", 100, "-blur", "0x4", "-channel", "A",
                 "-evaluate", "multiply", 0.7, "+channel", ")"]
        if glow:
            args += ["(", "mpr:t", "-fill", glow, "-colorize", 100, "-blur", "0x7", ")",
                     "(", "mpr:t", "-fill", glow, "-colorize", 100, "-blur", "0x2", ")"]
        args += ["(", "mpr:t", "-fill", "black", "-colorize", 100, "-channel", "A", "-evaluate", "multiply", 0.85,
                 "+channel", "-roll", "+2+2", ")", "mpr:t", "-background", "none", "-flatten"]
        magick(*args, p)
        return p, 14                                 # image, transparent margin

    def chip(self, text, bg, fg="#000000", pt=12, pad=(7, 3)):
        p = self._path()
        magick("-background", bg, "-font", self.fonts["mono"], "-pointsize", pt, "-kerning", 0.6, "-fill", fg,
               f"label:{text}", "-bordercolor", bg, "-border", f"{pad[0]}x{pad[1]}", p)
        return p

    def play_button(self, glow):
        p = self._path()
        magick("-background", GREEN, "-font", self.fonts["mono"], "-pointsize", 24, "-kerning", 3, "-fill", BG,
               "label:PLAY NOW", "-gravity", "west", "-splice", "30x0", "-bordercolor", GREEN, "-border", "16x10",
               "-fill", BG, "-draw", "polygon 18,14 18,36 36,25", p)
        if glow:
            magick(p, "(", "+clone", "-background", GREEN, "-shadow", "95x8+0+0", ")", "+swap",
                   "-background", "none", "-layers", "merge", "+repage", p)
        magick(p, "-gravity", "center", "-background", "none", "-extent", "260x100", p)
        return p


def layer(tmp, name, parts):
    """Composite parts onto a transparent 640x360 layer.
    parts: ("band", y, h, top_alpha, bottom_alpha) | ("img", path, x, y)"""
    path = os.path.join(tmp, name)
    args = ["-size", f"{W}x{H}", "xc:none"]
    for kind, *rest in parts:
        if kind == "band":
            y, h, a0, a1 = rest
            args += ["(", "-size", f"{W}x{h}", f"gradient:rgba(0,0,0,{a0})-rgba(0,0,0,{a1})", ")",
                     "-geometry", f"+0+{y}", "-composite"]
        else:
            img, x, y = rest
            args += [img, "-geometry", f"{x:+d}{y:+d}", "-composite"]
    magick(*args, path)
    return path


def level_overlay(tmp, ink, key, anchor):
    name, tag, chip, accent = LEVELS[key]
    title, m = ink.text(name, "display", 46, "#ffffff", glow=accent, kern=1.5)
    sub, sm = ink.text(tag, "mono", 17, accent, kern=2.5)
    chip_img = ink.chip(chip, accent)
    x, y = 24, (60 if anchor == "top" else 240)
    band = ("band", 40, 150, 0.7, 0) if anchor == "top" else ("band", 196, 164, 0, 0.82)
    return layer(tmp, f"ov_{key}.png", [
        band,
        ("img", chip_img, x, y),
        ("img", title, x - 2 - m, y + 12 - m),
        ("img", sub, x + 1 - sm, y + 66 - sm),
    ])


def footage_frame(src, rect, dst, overlay, dx=0, grade="0x0"):
    x, y, w, h = rect
    magick(src, "-crop", f"{w}x{h}+{x}+{y}", "+repage", "-resize", f"{W}x{H}!",
           "-brightness-contrast", grade, overlay, "-geometry", f"{dx:+d}+0", "-composite", dst)


def glitch(src, dst, shift, slices=0, seed=0):
    """RGB split plus a few displaced horizontal slices."""
    rnd = random.Random(seed)
    args = [src, "-write", "mpr:g", "+delete",
            "(", "mpr:g", "-channel", "R", "-separate", "+channel", "-roll", f"{shift:+d}+0", ")",
            "(", "mpr:g", "-channel", "G", "-separate", "+channel", ")",
            "(", "mpr:g", "-channel", "B", "-separate", "+channel", "-roll", f"{-shift:+d}+0", ")",
            "-combine"]
    for _ in range(slices):
        h = rnd.randint(6, 28)
        y = rnd.randint(0, H - h)
        args += ["-region", f"{W}x{h}+0+{y}", "-roll", f"{rnd.choice([-1, 1]) * rnd.randint(8, 40):+d}+0", "+region"]
    magick(*args, dst)


def lerp_rect(a, b, p):
    p = p * p * (3 - 2 * p)                          # ease in-out
    return [round(a[i] + (b[i] - a[i]) * p) for i in range(4)]


# ── Scenes ───────────────────────────────────────────────────────────────

def opening(tmp, ink, n, out):
    title, _ = ink.text("HACK THE PLANET", "mono", 52, "#eafff0", glow=GREEN, kern=4)
    base = os.path.join(tmp, "open_base.png")
    magick("-size", f"{W}x{H}", f"xc:{BG}",           # dark screen, faint terminal scanlines
           "(", "-size", f"{W}x2", "xc:rgba(0,255,65,0.045)", "-size", f"{W}x2", "xc:none", "-append",
           "-write", "mpr:sl", "+delete", "-size", f"{W}x{H}", "tile:mpr:sl", ")", "-composite", base)
    frames = []
    for i in range(n):
        dst = os.path.join(out, f"open_{i}.png")
        if i == 0:
            magick("-size", f"{W}x{H}", f"xc:{BG}", dst)  # matches the closing fade: seamless loop
        else:
            magick(base, "(", title, "-resize", f"{100 + i}%", ")", "-gravity", "center", "-geometry", "+0-4",
                   "-composite", dst)
            if i == 1:
                glitch(dst, dst, 10, slices=8, seed=1)
                magick(dst, "-brightness-contrast", "-30x0", dst)
            elif i == 2:
                glitch(dst, dst, 4, slices=3, seed=2)
            elif i == n - 1:
                glitch(dst, dst, 3, slices=2, seed=3)
        frames.append(dst)
    return frames


def closing(tmp, ink, stills, n, out):
    grid = os.path.join(tmp, "grid.png")             # one real frame from each level
    magick(*[a for s in stills for a in ("(", s, "-resize", f"{W // 2}x{H // 2}!", ")")],
           "(", "-clone", "0,1", "+append", ")", "(", "-clone", "2,3", "+append", ")", "-delete", "0-3",
           "-append", "-blur", "0x1", "-fill", BG, "-colorize", "55%", grid)
    title, tm = ink.text("HACK THE PLANET", "mono", 50, "#eafff0", glow=GREEN, kern=4)
    sub, _ = ink.text("4 MISSIONS. ONE CYBER WORLD.", "mono", 21, "#ffffff", kern=2)
    btn = {True: ink.play_button(True), False: ink.play_button(False)}
    frames = []
    for i in range(n):
        dst = os.path.join(out, f"end_{i}.png")
        zoom = 112 - min(i, 6) * 2                   # the grid settles from 112% to 100%
        args = [grid, "-gravity", "center", "-resize", f"{zoom}%", "-extent", f"{W}x{H}",
                "(", "-size", f"{W}x200", "xc:rgba(0,3,0,0.74)", ")", "-geometry", "+0-4", "-composite"]
        args += [title, "-geometry", "+0-62", "-composite"]
        if i >= 3:
            args += [sub, "-geometry", "+0-6", "-composite"]
        if i >= 5:
            args += [btn[(i // 2) % 2 == 1], "-geometry", "+0+56", "-composite"]
        magick(*args, dst)
        if i == 0:
            glitch(dst, dst, 7, slices=5, seed=11)
        elif i == 1:
            glitch(dst, dst, 3, slices=2, seed=12)
        fade = {n - 2: 45, n - 1: 85}.get(i)         # ease back toward the dark first frame
        if fade:
            magick(dst, "-fill", BG, "-colorize", f"{fade}%", dst)
        frames.append(dst)
    return frames


def compose(frames_dir, output, sheet_path, keep):
    manifest = json.load(open(os.path.join(frames_dir, "manifest.json")))
    for k in ("level1", "level2", "level3", "level4"):
        if k not in manifest:
            sys.exit(f"{frames_dir}/manifest.json has no {k}; capture all four levels.")
    fonts = {k: find_font(k) for k in FONT_CANDIDATES}
    tmp = tempfile.mkdtemp(prefix="htp_trailer_")
    out = os.path.join(tmp, "out")
    os.makedirs(out)
    ink = Ink(tmp, fonts)
    n_open, n1, n2, n3, n4, n_end = scene_lengths()
    src = lambda sub, f: os.path.join(frames_dir, sub, f["file"])
    seq = []                                         # (frame path, scene label)

    seq += [(p, "OPENING") for p in opening(tmp, ink, n_open, out)]

    def shoot(key, items, grade, anchor="bottom", whip_out=False):
        ov = level_overlay(tmp, ink, key, anchor)
        for i, (path, r0, r1, p) in enumerate(items):
            dst = os.path.join(out, f"{key}_{i:02d}.png")
            footage_frame(path, lerp_rect(r0, r1, p), dst, ov, [-44, -14][i] if i < 2 else 0, grade)
            if i == 0:
                glitch(dst, dst, 6, slices=4, seed=int(key[-1]))
            elif i == 1:
                glitch(dst, dst, 2, seed=5)
            if whip_out and i == len(items) - 1:
                magick(dst, "-motion-blur", "0x26+0", dst)
            seq.append((dst, LEVELS[key][0]))

    ramp = lambda sel: [i / (len(sel) - 1) for i in range(len(sel))]
    # Level 1: push in on the duel with THE SCOUT.
    sel1 = window_level1(manifest["level1"], n1)
    shoot("level1", [(src("l1", f), (0, 0, 1280, 720), (100, 50, 1080, 608), p) for f, p in zip(sel1, ramp(sel1))], "4x8")
    # Level 2: KUKY reaches the robot, picks controls, verification passes.
    # The lab's dark left margin carries the title; the action sits right of it.
    walk, fix, ver = window_level2(manifest["level2"], n2)
    items = [(src("l2walk", f), (0, 140, 620, 349), (70, 170, 540, 304), p) for f, p in zip(walk, ramp(walk))]
    items += [(src("l2mitigate", f), (214, 270, 840, 472), (220, 280, 800, 450), p) for f, p in zip(fix, ramp(fix))]
    items += [(src("l2verify", f), (214, 210, 840, 472), (226, 330, 704, 396), p) for f, p in zip(ver, ramp(ver))]
    shoot("level2", items, "2x10")
    # Level 3: GHOST walks into the sunset; framed right of centre to clear the title.
    sel3 = window_level3(manifest["level3"], n3)
    shoot("level3", [(src("l3", f), (0, 20, 1040, 585), (40, 50, 960, 540), p) for f, p in zip(sel3, ramp(sel3))],
          "0x6", whip_out=True)
    # Level 4: the fastest stretch; title up in the sky, the car stays clear.
    sel4 = window_level4(manifest["level4"], n4)
    shoot("level4", [(src("l4", f), (0, 0, 1280, 720), (32, 18, 1216, 684), p) for f, p in zip(sel4, ramp(sel4))],
          "2x10", anchor="top")

    stills = [src("l1", sel1[3]), src("l2walk", walk[-1]), src("l3", sel3[n3 // 2]), src("l4", sel4[n4 // 2])]
    seq += [(p, "CALL TO ACTION") for p in closing(tmp, ink, stills, n_end, out)]

    assert len(seq) == round(CUTS[-1] * FPS), len(seq)
    encode([p for p, _ in seq], output)
    if sheet_path:
        contact_sheet(seq, sheet_path, fonts)
    if keep:
        print("composed frames kept in", out)
    else:
        shutil.rmtree(tmp, ignore_errors=True)


def encode(paths, output):
    # 12 fps in GIF centiseconds: alternate 8/9 cs so the total is exact.
    args = []
    for i, p in enumerate(paths):
        args += ["-delay", round(100 * (i + 1) / FPS) - round(100 * i / FPS), p]
    tmp_out = output + ".tmp.gif"
    # The games are flat-shaded, so an undithered 255-colour palette per frame
    # looks the same as a dithered one and compresses far better.
    magick(*args, "-loop", "0", "+dither", "-colors", "255",
           "-fuzz", "2%", "-layers", "OptimizeTransparency", tmp_out)
    os.replace(tmp_out, output)


def contact_sheet(seq, path, fonts):
    """Opening, three frames per level, two of the closing card, with timestamps."""
    groups = {}
    for i, (_, label) in enumerate(seq):
        groups.setdefault(label, []).append(i)
    picks = []
    for label, idx in groups.items():
        k = {"OPENING": 1, "CALL TO ACTION": 2}.get(label, 3)
        for j in range(k):
            picks.append(idx[min(len(idx) - 1, (2 * j + 1) * len(idx) // (2 * k) + (2 if k == 1 else 1))])
    args = []
    for j in picks:
        args += ["-label", f"{j / FPS:4.2f}s  {seq[j][1]}", seq[j][0]]
    magick("montage", "-font", fonts["mono"], "-pointsize", 13, "-fill", "#d8ffe0", "-background", "#0b0f0b",
           *args, "-tile", "4x", "-geometry", "320x180+6+6", "-colors", "256", "PNG8:" + path)


def capture(dest, levels="1234"):
    subprocess.run(["node", os.path.join(ROOT, "tools", "capture-trailer.js"), dest, levels], check=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("output", nargs="?", default=os.environ.get("HTP_GIF_OUTPUT", os.path.join(ROOT, "trailer.gif")))
    ap.add_argument("--frames", help="compose from footage already captured in this directory")
    ap.add_argument("--capture-only", metavar="DIR", help="capture footage into DIR and stop")
    ap.add_argument("--sheet", help="contact sheet path (default: trailer-contact-sheet.png beside the GIF; 'none' skips)")
    ap.add_argument("--keep", action="store_true", help="keep the captured footage and composed frames")
    a = ap.parse_args()
    if not shutil.which("magick"):
        sys.exit("ImageMagick 7 (`magick`) is required.")
    if a.capture_only:
        capture(os.path.abspath(a.capture_only))
        return
    output = os.path.abspath(a.output)
    sheet = None if a.sheet == "none" else os.path.abspath(
        a.sheet or os.path.join(os.path.dirname(output), "trailer-contact-sheet.png"))
    frames_dir = os.path.abspath(a.frames) if a.frames else tempfile.mkdtemp(prefix="htp_capture_")
    try:
        if not a.frames:
            capture(frames_dir)
        compose(frames_dir, output, sheet, a.keep)
    finally:
        if not a.frames and not a.keep:
            shutil.rmtree(frames_dir, ignore_errors=True)
    print(f"{output}: {os.path.getsize(output) / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
