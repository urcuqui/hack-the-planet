#!/usr/bin/env python3
"""Generate a Hack The Planet level trailer GIF."""
import os
import random
import shutil
import subprocess
import tempfile

W, H = 640, 360
FPS_DELAY = 7
TMPDIR = tempfile.mkdtemp(prefix="htp_trailer_")
ROOT = os.path.dirname(os.path.abspath(__file__))
OUTPUT = os.path.join(ROOT, "trailer.gif")
random.seed(2600)

BG = (0, 2, 8)
BLACK = (0, 0, 0)
GREEN_D = (0, 55, 18)
GREEN = (0, 210, 65)
GREEN_B = (0, 255, 95)
CYAN = (0, 230, 255)
CYAN_D = (0, 95, 120)
PINK = (255, 70, 185)
PINK_D = (95, 10, 70)
YELLOW = (255, 236, 88)
ORANGE = (255, 126, 52)
RED = (255, 51, 30)
WHITE = (235, 255, 245)
BLUE = (52, 112, 255)
PURPLE = (140, 92, 255)
GRAY = (75, 88, 105)
DKBLUE = (4, 10, 28)


def new_frame(color=BG):
    buf = bytearray(W * H * 3)
    r, g, b = color
    for i in range(0, len(buf), 3):
        buf[i] = r
        buf[i + 1] = g
        buf[i + 2] = b
    return buf


def fill_rect(buf, x, y, w, h, c):
    r, g, b = c
    x0, y0 = max(0, int(x)), max(0, int(y))
    x1, y1 = min(W, int(x + w)), min(H, int(y + h))
    for ry in range(y0, y1):
        base = ry * W * 3
        for rx in range(x0, x1):
            i = base + rx * 3
            buf[i] = r
            buf[i + 1] = g
            buf[i + 2] = b


def border(buf, x, y, w, h, c, t=2):
    fill_rect(buf, x, y, w, t, c)
    fill_rect(buf, x, y + h - t, w, t, c)
    fill_rect(buf, x, y, t, h, c)
    fill_rect(buf, x + w - t, y, t, h, c)


def line(buf, x0, y0, x1, y1, c, t=1):
    steps = max(abs(int(x1 - x0)), abs(int(y1 - y0)), 1)
    for s in range(steps + 1):
        p = s / steps
        x = x0 + (x1 - x0) * p
        y = y0 + (y1 - y0) * p
        fill_rect(buf, int(x), int(y), t, t, c)


def write_ppm(buf, path):
    with open(path, "wb") as f:
        f.write(f"P6\n{W} {H}\n255\n".encode())
        f.write(bytes(buf))


G = {
    " ": [0, 0, 0, 0, 0, 0, 0],
    "A": [14, 17, 17, 31, 17, 17, 17],
    "B": [30, 17, 17, 30, 17, 17, 30],
    "C": [14, 17, 16, 16, 16, 17, 14],
    "D": [28, 18, 17, 17, 17, 18, 28],
    "E": [31, 16, 16, 30, 16, 16, 31],
    "F": [31, 16, 16, 30, 16, 16, 16],
    "G": [14, 17, 16, 23, 17, 17, 14],
    "H": [17, 17, 17, 31, 17, 17, 17],
    "I": [31, 4, 4, 4, 4, 4, 31],
    "J": [1, 1, 1, 1, 17, 17, 14],
    "K": [17, 18, 20, 24, 20, 18, 17],
    "L": [16, 16, 16, 16, 16, 16, 31],
    "M": [17, 27, 21, 17, 17, 17, 17],
    "N": [17, 25, 21, 19, 17, 17, 17],
    "O": [14, 17, 17, 17, 17, 17, 14],
    "P": [30, 17, 17, 30, 16, 16, 16],
    "Q": [14, 17, 17, 17, 21, 18, 13],
    "R": [30, 17, 17, 30, 20, 18, 17],
    "S": [15, 16, 16, 14, 1, 1, 30],
    "T": [31, 4, 4, 4, 4, 4, 4],
    "U": [17, 17, 17, 17, 17, 17, 14],
    "V": [17, 17, 17, 17, 17, 10, 4],
    "W": [17, 17, 17, 21, 21, 27, 17],
    "X": [17, 17, 10, 4, 10, 17, 17],
    "Y": [17, 17, 10, 4, 4, 4, 4],
    "Z": [31, 1, 2, 4, 8, 16, 31],
    "0": [14, 17, 19, 21, 25, 17, 14],
    "1": [4, 12, 4, 4, 4, 4, 14],
    "2": [14, 17, 1, 2, 4, 8, 31],
    "3": [30, 1, 1, 14, 1, 1, 30],
    "4": [2, 6, 10, 18, 31, 2, 2],
    "5": [31, 16, 16, 30, 1, 1, 30],
    "6": [14, 16, 16, 30, 17, 17, 14],
    "7": [31, 1, 2, 4, 8, 8, 8],
    "8": [14, 17, 17, 14, 17, 17, 14],
    "9": [14, 17, 17, 15, 1, 1, 14],
    ">": [16, 8, 4, 2, 4, 8, 16],
    "/": [1, 2, 4, 8, 16, 0, 0],
    ".": [0, 0, 0, 0, 0, 4, 4],
    "-": [0, 0, 0, 31, 0, 0, 0],
    ":": [0, 4, 4, 0, 4, 4, 0],
    "!": [4, 4, 4, 4, 4, 0, 4],
    "[": [14, 8, 8, 8, 8, 8, 14],
    "]": [14, 2, 2, 2, 2, 2, 14],
    "_": [0, 0, 0, 0, 0, 0, 31],
}


def draw_char(buf, ch, x, y, sc, color):
    rows = G.get(ch.upper(), G[" "])
    for r, bits in enumerate(rows):
        for c in range(5):
            if (bits >> (4 - c)) & 1:
                fill_rect(buf, x + c * sc, y + r * sc, sc, sc, color)


def str_w(text, sc):
    gap = max(1, sc // 2)
    return len(text) * (5 * sc + gap) - gap if text else 0


def draw_str(buf, text, x, y, sc, color):
    cx = int(x)
    for ch in text:
        draw_char(buf, ch, cx, int(y), sc, color)
        cx += 5 * sc + max(1, sc // 2)


def center(buf, text, y, sc, color):
    draw_str(buf, text, (W - str_w(text, sc)) // 2, y, sc, color)


def scanlines(buf):
    for sy in range(2, H, 4):
        base = sy * W * 3
        for sx in range(W):
            i = base + sx * 3
            buf[i] = buf[i] * 3 // 5
            buf[i + 1] = buf[i + 1] * 3 // 5
            buf[i + 2] = buf[i + 2] * 3 // 5


def glitch(buf, y0, y1, strength=12):
    for gy in range(max(0, y0), min(H, y1)):
        if random.random() < 0.18:
            off = random.choice([-strength, -strength // 2, strength // 2, strength])
            rs, re = gy * W * 3, gy * W * 3 + W * 3
            row = bytearray(buf[rs:re])
            ro = abs(off) * 3
            buf[rs:re] = row[-ro:] + row[:-ro] if off > 0 else row[ro:] + row[:ro]


def draw_grid(buf, fi):
    horizon = 214
    for i in range(18):
        y = horizon + i * i * 0.55
        line(buf, 0, y, W, y, CYAN_D if i % 2 else PINK_D, 1)
    for i in range(-12, 13):
        x = W / 2 + i * 26
        line(buf, W / 2, horizon, x + (i * 28), H, CYAN_D, 1)
    fill_rect(buf, 0, horizon - 2, W, 2, PINK)
    for k in range(0, W, 38):
        fill_rect(buf, (k + fi * 7) % W, horizon - 4, 16, 4, CYAN)


def matrix_bg(buf, fi):
    chars = "010101HTP"
    for x in range(0, W, 18):
        shift = (fi * 9 + x * 3) % (H + 80) - 80
        for y in range(shift, H, 22):
            ch = chars[(x + y + fi) % len(chars)]
            draw_char(buf, ch, x, y, 1, GREEN_D)


def city(buf, fi, palette):
    base = 250
    widths = [32, 44, 24, 52, 36, 28, 48, 30, 42, 26, 50]
    x = 30
    for i, bw in enumerate(widths):
        bh = 65 + ((i * 29 + fi * 2) % 86)
        color = palette[i % len(palette)]
        fill_rect(buf, x, base - bh, bw, bh, color)
        border(buf, x, base - bh, bw, bh, BLACK, 1)
        for wx in range(x + 6, x + bw - 4, 10):
            for wy in range(base - bh + 10, base - 8, 14):
                if (wx + wy + fi + i) % 3:
                    fill_rect(buf, wx, wy, 4, 5, YELLOW if i % 2 else CYAN)
        x += bw + 13


def title_frame(fi):
    buf = new_frame()
    matrix_bg(buf, fi)
    draw_grid(buf, fi)
    if fi % 9 in (3, 4):
        glitch(buf, 78, 160, 18)
    center(buf, "HACK THE PLANET", 82, 5, GREEN_B)
    center(buf, "LEVEL TRAILER", 148, 3, CYAN)
    center(buf, "> FOUR OPERATIONS // ONE SYSTEM", 300, 2, PINK)
    scanlines(buf)
    return buf


def story_frame(fi, headline, body, color=GREEN_B, accent=CYAN):
    buf = new_frame()
    matrix_bg(buf, fi)
    fill_rect(buf, 46, 58, 548, 230, (0, 8, 12))
    border(buf, 46, 58, 548, 230, color, 3)
    draw_str(buf, "> PANDECORP.GLOBAL", 76, 84, 2, RED)
    fill_rect(buf, 76, 118, 488, 2, GREEN_D)
    center(buf, headline, 142, 3, color)
    for i, text in enumerate(body):
        center(buf, text, 198 + i * 28, 2, accent if i % 2 else WHITE)
    if fi % 11 in (2, 3):
        glitch(buf, 132, 230, 18)
    scanlines(buf)
    return buf


def level_card(fi, num, name, tag, color, accent, art):
    buf = new_frame()
    matrix_bg(buf, fi)
    draw_grid(buf, fi)
    fill_rect(buf, 40, 42, 560, 210, (0, 8, 16))
    border(buf, 40, 42, 560, 210, color, 3)
    draw_str(buf, f"LEVEL {num:02d}", 68, 66, 3, color)
    draw_str(buf, name, 68, 108, 4, WHITE)
    draw_str(buf, tag, 70, 166, 2, accent)
    fill_rect(buf, 420, 68, 132, 130, (0, 0, 0))
    border(buf, 420, 68, 132, 130, accent, 2)
    art(buf, fi, 420, 68, 132, 130, color, accent)
    if fi % 10 in (1, 2):
        glitch(buf, 92, 150, 10)
    scanlines(buf)
    return buf


def draw_gameplay_shell(buf, label, objective, color, accent):
    fill_rect(buf, 22, 18, 596, 304, DKBLUE)
    border(buf, 22, 18, 596, 304, color, 3)
    fill_rect(buf, 22, 18, 596, 28, (0, 14, 20))
    draw_str(buf, label, 38, 28, 1, color)
    draw_str(buf, objective, 350, 28, 1, accent)
    fill_rect(buf, 48, 62, 138, 12, GREEN_D)
    fill_rect(buf, 48, 62, 110, 12, GREEN_B)
    draw_str(buf, "INTEGRITY", 50, 80, 1, GREEN_B)
    fill_rect(buf, 452, 62, 118, 12, PINK_D)
    fill_rect(buf, 452, 62, 72, 12, RED)
    draw_str(buf, "THREAT", 472, 80, 1, RED)


def gameplay_level1(fi):
    buf = new_frame()
    matrix_bg(buf, fi)
    draw_gameplay_shell(buf, "LEVEL 01 // ROOT ACCESS", "BREACH PANDECORP", GREEN_B, CYAN)
    for i, x in enumerate(range(82, 530, 74)):
        fill_rect(buf, x, 176 - (i % 2) * 24, 32, 96 + (i % 3) * 20, GREEN_D)
        border(buf, x, 176 - (i % 2) * 24, 32, 96 + (i % 3) * 20, GREEN, 1)
        for y in range(188 - (i % 2) * 24, 258, 18):
            fill_rect(buf, x + 8, y, 16, 4, GREEN_B)
    cx, cy = 320, 180
    line(buf, cx - 16, cy, cx + 16, cy, CYAN, 2)
    line(buf, cx, cy - 16, cx, cy + 16, CYAN, 2)
    enemy_x = 470 - fi * 5
    fill_rect(buf, enemy_x, 138, 26, 34, RED)
    fill_rect(buf, enemy_x + 6, 146, 5, 5, YELLOW)
    fill_rect(buf, enemy_x + 16, 146, 5, 5, YELLOW)
    line(buf, 340, 178, enemy_x + 12, 155, CYAN, 3)
    fill_rect(buf, 276, 284, 88, 18, (0, 22, 14))
    draw_str(buf, "EXPLOIT FIRED", 292, 290, 1, GREEN_B)
    scanlines(buf)
    return buf


def gameplay_level2(fi):
    buf = new_frame()
    matrix_bg(buf, fi)
    draw_gameplay_shell(buf, "LEVEL 02 // VULN HUNTER", "PATCH ROGUE AI", GREEN_B, RED)
    fill_rect(buf, 70, 106, 210, 170, (0, 12, 8))
    border(buf, 70, 106, 210, 170, GREEN_B, 2)
    for i in range(5):
        rx = 95 + i * 34
        ry = 166 + ((fi + i) % 3) * 6
        fill_rect(buf, rx, ry, 20, 34, GRAY)
        fill_rect(buf, rx + 5, ry - 10, 10, 10, RED)
        fill_rect(buf, rx + 4, ry + 8, 4, 4, YELLOW)
        fill_rect(buf, rx + 12, ry + 8, 4, 4, YELLOW)
    fill_rect(buf, 332, 106, 232, 170, (8, 0, 8))
    border(buf, 332, 106, 232, 170, RED, 2)
    draw_str(buf, "SCAN: PROMPT INJECTION", 354, 128, 1, RED)
    options = ["1 SANITIZE INPUT", "2 IGNORE SYSTEM", "3 LEAK TOKEN"]
    for i, opt in enumerate(options):
        y = 162 + i * 34
        col = GREEN_B if i == (fi // 6) % 3 == 0 else WHITE
        border(buf, 352, y, 170, 22, col, 1)
        draw_str(buf, opt, 362, y + 7, 1, col)
    if fi > 11:
        draw_str(buf, "PATCH APPLIED", 388, 250, 2, GREEN_B)
    scanlines(buf)
    return buf


def gameplay_level3(fi):
    buf = new_frame()
    matrix_bg(buf, fi)
    draw_gameplay_shell(buf, "LEVEL 03 // SOCIAL ENGINEER", "INFILTRATE EKOPARTY", PINK, YELLOW)
    fill_rect(buf, 50, 234, 540, 54, (22, 22, 36))
    fill_rect(buf, 220, 104, 200, 112, (14, 22, 62))
    border(buf, 220, 104, 200, 112, YELLOW, 2)
    draw_str(buf, "EKOPARTY", 264, 130, 3, YELLOW)
    for x in range(238, 392, 24):
        for y in range(172, 204, 18):
            fill_rect(buf, x, y, 9, 8, CYAN)
    px = 118 + fi * 6
    fill_rect(buf, px, 230, 12, 30, PINK)
    fill_rect(buf, px + 2, 220, 8, 8, WHITE)
    fill_rect(buf, 462, 230, 12, 30, CYAN)
    fill_rect(buf, 464, 220, 8, 8, WHITE)
    fill_rect(buf, 90, 292, 460, 22, (0, 0, 18))
    border(buf, 90, 292, 460, 22, YELLOW, 1)
    draw_str(buf, "CHOICE: I AM WITH SECURITY", 118, 299, 1, YELLOW)
    line(buf, px + 12, 226, 462, 226, PINK, 1)
    scanlines(buf)
    return buf


def gameplay_level4(fi):
    buf = new_frame()
    matrix_bg(buf, fi)
    draw_gameplay_shell(buf, "LEVEL 04 // NEON GRAND PRIX", "ESCAPE THE CITY", CYAN, PINK)
    horizon = 114
    fill_rect(buf, 70, horizon, 500, 184, (18, 18, 32))
    for i in range(12):
        y = horizon + i * i * 1.35
        line(buf, 70, y, 570, y, CYAN_D, 1)
    for i in range(-6, 7):
        line(buf, 320, horizon, 320 + i * 48, 298, PINK_D, 1)
    fill_rect(buf, 300 + (fi % 6), 236, 48, 22, PINK)
    fill_rect(buf, 308 + (fi % 6), 224, 32, 14, PINK)
    fill_rect(buf, 306 + (fi % 6), 256, 9, 9, BLACK)
    fill_rect(buf, 334 + (fi % 6), 256, 9, 9, BLACK)
    for i in range(3):
        ox = 164 + i * 104 - fi * 3
        fill_rect(buf, ox, 176 + i * 12, 32, 14, ORANGE if i % 2 else CYAN)
    draw_str(buf, "BOOST", 486, 286, 2, YELLOW)
    scanlines(buf)
    return buf


def art_fps(buf, fi, x, y, w, h, color, accent):
    for bx in range(x + 12, x + w - 10, 24):
        bh = 30 + (bx + fi) % 44
        fill_rect(buf, bx, y + h - bh - 12, 16, bh, GREEN_D)
        fill_rect(buf, bx + 4, y + h - bh - 4, 8, bh - 12, GREEN)
    fill_rect(buf, x + 52, y + 75, 50, 12, accent)
    fill_rect(buf, x + 92, y + 70, 18, 7, accent)
    fill_rect(buf, x + 32 + fi % 36, y + 38, 8, 8, RED)


def art_vuln(buf, fi, x, y, w, h, color, accent):
    for i in range(4):
        rx = x + 18 + i * 25
        fill_rect(buf, rx, y + 50 + (i % 2) * 16, 16, 28, GRAY)
        fill_rect(buf, rx + 4, y + 42 + (i % 2) * 16, 8, 8, RED)
        line(buf, rx + 8, y + 78, x + w // 2, y + h - 20, accent, 2)
    draw_str(buf, "PATCH", x + 30, y + 102, 2, GREEN_B)


def art_social(buf, fi, x, y, w, h, color, accent):
    city(buf, fi, [PINK_D, CYAN_D, PURPLE, BLUE])
    fill_rect(buf, x + 24, y + 42, 84, 62, (12, 18, 54))
    border(buf, x + 24, y + 42, 84, 62, YELLOW, 2)
    draw_str(buf, "EKOPARTY", x + 34, y + 64, 1, YELLOW)
    fill_rect(buf, x + 55, y + 112, 12, 16, PINK)
    fill_rect(buf, x + 82, y + 112, 12, 16, CYAN)


def art_race(buf, fi, x, y, w, h, color, accent):
    for i in range(8):
        yy = y + 28 + i * 12
        line(buf, x + 18, yy, x + w - 18, yy + 28, CYAN_D, 1)
    fill_rect(buf, x + 48 + fi % 22, y + 86, 36, 18, PINK)
    fill_rect(buf, x + 52 + fi % 22, y + 80, 24, 10, PINK)
    fill_rect(buf, x + 54 + fi % 22, y + 102, 7, 7, BLACK)
    fill_rect(buf, x + 75 + fi % 22, y + 102, 7, 7, BLACK)
    fill_rect(buf, x + 26, y + 116, 84, 4, YELLOW)


def final_frame(fi):
    buf = new_frame()
    matrix_bg(buf, fi)
    city(buf, fi, [GREEN_D, CYAN_D, PINK_D, PURPLE])
    draw_grid(buf, fi)
    center(buf, "ALL LEVELS ONLINE", 72, 4, YELLOW)
    center(buf, "01 FPS  02 VULNS  03 EKOPARTY  04 RACE", 150, 2, WHITE)
    center(buf, "> PLAY THE MISSION", 288, 3, GREEN_B)
    if fi % 8 in (0, 1):
        glitch(buf, 64, 130, 16)
    scanlines(buf)
    return buf


def add_frames(frames, count, maker):
    for fi in range(count):
        buf = maker(fi)
        path = os.path.join(TMPDIR, f"f{len(frames):04d}.ppm")
        write_ppm(buf, path)
        frames.append(path)


def find_magick():
    return shutil.which("magick") or shutil.which("convert")


def main():
    frames = []
    scenes = [
        (18, title_frame),
        (
            16,
            lambda fi: story_frame(
                fi,
                "PANDECORP CONTROLS THE NET",
                ["SURVEILLANCE IS THE PRODUCT", "THE SYSTEM IS WATCHING"],
                RED,
                WHITE,
            ),
        ),
        (
            14,
            lambda fi: story_frame(
                fi,
                "URCUQUI GOES OFF GRID",
                ["CODE IS THE WEAPON", "TRUTH IS THE PAYLOAD"],
                GREEN_B,
                CYAN,
            ),
        ),
        (24, gameplay_level1),
        (24, gameplay_level2),
        (24, gameplay_level3),
        (24, gameplay_level4),
        (18, final_frame),
    ]
    total = sum(count for count, _ in scenes)
    print(f"Generating {total} trailer frames into {TMPDIR}...")
    for count, maker in scenes:
        add_frames(frames, count, maker)
        print(f"  {len(frames)}/{total}")

    magick = find_magick()
    if not magick:
        raise SystemExit("ImageMagick is required. Install `magick` or `convert` and rerun gen_gif.py.")

    cmd = [
        magick,
        "-delay",
        str(FPS_DELAY),
        "-loop",
        "0",
        *frames,
        "-dither",
        "Riemersma",
        "-colors",
        "64",
        "-layers",
        "optimize",
        OUTPUT,
    ]
    print("Building trailer.gif with ImageMagick...")
    result = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0:
        raise SystemExit(result.stderr.decode())
    size = os.path.getsize(OUTPUT) // 1024
    print(f"Created: {OUTPUT} ({size} KB)")


if __name__ == "__main__":
    try:
        main()
    finally:
        shutil.rmtree(TMPDIR, ignore_errors=True)
