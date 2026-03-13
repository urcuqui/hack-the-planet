#!/usr/bin/env python3
"""Generate preview.gif for Hack The Planet README."""
import os, random, subprocess, tempfile, shutil

W, H   = 640, 320
TMPDIR = tempfile.mkdtemp(prefix='htp_gif_')
random.seed(1337)

# ── Colors (RGB) ──────────────────────────────────────────────────
BG       = (0,   3,   0)
TERMBG   = (0,   8,   2)
DKGREEN  = (0,   30,  8)
MDGREEN  = (0,   100, 25)
GREEN    = (0,   210, 55)
BGREEN   = (0,   255, 65)
LGREEN   = (160, 255, 170)
WHITE    = (255, 255, 255)
RED      = (255, 51,  0)

TRAIL    = [WHITE, BGREEN, BGREEN, GREEN, GREEN, MDGREEN, DKGREEN, (0,15,4)]

# ── Frame buffer (RGB bytearray) ─────────────────────────────────
def new_frame():
    buf = bytearray(W * H * 3)
    r,g,b = BG
    for i in range(0, len(buf), 3):
        buf[i]=r; buf[i+1]=g; buf[i+2]=b
    return buf

def fill_rect(buf, x, y, w, h, c):
    r,g,b = c
    for ry in range(max(0,y), min(H,y+h)):
        base = ry*W*3
        for rx in range(max(0,x), min(W,x+w)):
            i = base + rx*3
            buf[i]=r; buf[i+1]=g; buf[i+2]=b

def draw_rect_border(buf, x, y, w, h, c, t=2):
    fill_rect(buf,x,y,w,t,c);     fill_rect(buf,x,y+h-t,w,t,c)
    fill_rect(buf,x,y,t,h,c);     fill_rect(buf,x+w-t,y,t,h,c)

def write_ppm(buf, path):
    with open(path, 'wb') as f:
        f.write(f'P6\n{W} {H}\n255\n'.encode())
        f.write(bytes(buf))

# ── 5×7 pixel font ───────────────────────────────────────────────
G = {
    ' ':[0,0,0,0,0,0,0],
    'H':[17,17,17,31,17,17,17], 'A':[14,17,17,31,17,17,17],
    'C':[14,17,16,16,16,17,14], 'K':[17,18,20,24,20,18,17],
    'T':[31,4,4,4,4,4,4],       'E':[31,16,16,30,16,16,31],
    'P':[30,17,17,30,16,16,16], 'L':[16,16,16,16,16,16,31],
    'N':[17,25,21,19,17,17,17], 'U':[17,17,17,17,17,17,14],
    'R':[30,17,17,30,20,18,17], 'I':[31,4,4,4,4,4,31],
    'Q':[14,17,17,17,21,18,13], 'S':[15,16,16,14,1,1,30],
    'Y':[17,17,10,4,4,4,4],     'G':[14,17,16,23,17,17,14],
    'O':[14,17,17,17,17,17,14], 'B':[30,17,17,30,17,17,30],
    'F':[31,16,16,30,16,16,16], 'W':[17,17,17,21,21,27,17],
    'D':[28,18,17,17,17,18,28], 'M':[17,27,21,17,17,17,17],
    '>':[16,8,4,2,4,8,16],      '/':[1,2,4,8,16,0,0],
    '.':[0,0,0,0,0,4,4],        '-':[0,0,0,31,0,0,0],
    ':':[0,4,4,0,4,4,0],        '!':[4,4,4,4,4,0,4],
    '[':[14,8,8,8,8,8,14],      ']':[14,2,2,2,2,2,14],
    '*':[0,21,14,31,14,21,0],   '_':[0,0,0,0,0,0,31],
}

def draw_char(buf, ch, x, y, sc, color):
    rows = G.get(ch.upper(), G[' '])
    for r, bits in enumerate(rows):
        for c in range(5):
            if (bits >> (4-c)) & 1:
                fill_rect(buf, x+c*sc, y+r*sc, sc, sc, color)

def draw_str(buf, s, x, y, sc, color):
    cx = x
    for ch in s:
        draw_char(buf, ch, cx, y, sc, color)
        cx += 5*sc + max(1, sc//2)

def str_w(s, sc):
    if not s: return 0
    return len(s)*(5*sc+max(1,sc//2)) - max(1,sc//2)

# ══════════════════════════════════════════════════════════════════
# SCENE 1 — MATRIX RAIN
# ══════════════════════════════════════════════════════════════════
COL_W   = 20
N_COL   = W // COL_W       # 32 columns
CELL_H  = 14

col_y   = [random.uniform(-8, H//CELL_H) for _ in range(N_COL)]
col_spd = [0.5 + random.random() * 1.3   for _ in range(N_COL)]
col_trl = [7   + random.randint(0, 5)    for _ in range(N_COL)]

def make_matrix_frame():
    buf = new_frame()
    for ci in range(N_COL):
        head = int(col_y[ci])
        trl  = col_trl[ci]
        x    = ci * COL_W + 2
        cw   = 14 + random.randint(-2, 2)   # slight width variation per frame
        for ti in range(trl):
            row = head - ti
            y   = row * CELL_H
            if y < 0 or y + CELL_H > H + CELL_H: continue
            color = TRAIL[min(ti, len(TRAIL)-1)]
            fill_rect(buf, x, y, cw, CELL_H-2, color)
        # Advance
        col_y[ci] += col_spd[ci]
        if col_y[ci] > H//CELL_H + col_trl[ci]:
            col_y[ci]  = random.uniform(-10, -2)
            col_spd[ci]= 0.5 + random.random()*1.3
    # Subtle scanlines
    for sy in range(1, H, 3):
        base = sy*W*3
        for sx in range(W):
            i = base + sx*3
            buf[i]   = buf[i]   * 3 // 5
            buf[i+1] = buf[i+1] * 3 // 5
            buf[i+2] = buf[i+2] * 3 // 5
    return buf

# ══════════════════════════════════════════════════════════════════
# SCENE 2 — TERMINAL
# ══════════════════════════════════════════════════════════════════
TX,TY,TW,TH = 55,30,530,250
CONTENT_Y    = TY+42
LINE_H       = 28
TERM_LINES   = [
    ('> CONNECT PANDECORP.GLOBAL...', BGREEN),
    ('  STATUS: [OK]',                LGREEN),
    ('> BYPASS FIREWALL...',          BGREEN),
    ('  STATUS: [OK]',                LGREEN),
    ('> DEPLOY GHOST PROTOCOL...',    BGREEN),
    ('  INFILTRATION SUCCESSFUL!',    RED),
    ('> USER: URCUQUI',               LGREEN),
    ('> ROOT ACCESS GRANTED',         BGREEN),
]

def make_terminal_frame(lines_shown, cursor_on):
    buf = new_frame()
    fill_rect(buf, TX, TY, TW, TH, TERMBG)
    draw_rect_border(buf, TX, TY, TW, TH, BGREEN, 2)
    # Title bar
    fill_rect(buf, TX+2, TY+2, TW-4, 32, (0,18,5))
    draw_str(buf, 'PANDECORP.GLOBAL // SECURE SHELL', TX+14, TY+12, 1, GREEN)
    # Lines
    for li in range(min(lines_shown, len(TERM_LINES))):
        text, color = TERM_LINES[li]
        y = CONTENT_Y + li*LINE_H
        if y+14 > TY+TH-8: break
        draw_str(buf, text, TX+14, y, 2, color)
    # Cursor
    if cursor_on and lines_shown < len(TERM_LINES):
        cy = CONTENT_Y + lines_shown*LINE_H
        if cy+14 <= TY+TH-8:
            fill_rect(buf, TX+14, cy, 10, 14, BGREEN)
    return buf

# ══════════════════════════════════════════════════════════════════
# SCENE 3 — HACK THE PLANET TITLE
# ══════════════════════════════════════════════════════════════════
def make_title_frame(fi):
    buf = new_frame()
    sc  = 4
    line1 = 'HACK THE PLANET'
    line2 = '> URCUQUI'

    tw1 = str_w(line1, sc)
    tx1 = (W - tw1) // 2
    ty1 = H//2 - 7*sc - 14

    tw2 = str_w(line2, 2)
    tx2 = (W - tw2) // 2
    ty2 = ty1 + 7*sc + 22

    glitch = 4 <= fi <= 8 or fi == 11 or fi == 13

    if glitch:
        # Draw in red offset first (glitch shadow)
        off_x = random.choice([-3, 3, -6, 6])
        off_y = random.choice([-1, 1])
        draw_str(buf, line1, tx1+off_x, ty1+off_y, sc, RED)
        # Apply row-displacement glitch
        for gy in range(ty1-2, ty1+7*sc+sc+2):
            if 0 <= gy < H and random.random() < 0.28:
                row_off = random.choice([-8,-4,4,8,12,-12])
                rs  = gy*W*3
                re  = rs + W*3
                row = bytearray(buf[rs:re])
                ro  = abs(row_off)*3
                if row_off > 0:
                    new_row = row[-ro:] + row[:-ro]
                else:
                    new_row = row[ro:]  + row[:ro]
                buf[rs:re] = new_row

    # Main title
    draw_str(buf, line1, tx1, ty1, sc, BGREEN)
    # Subtitle
    draw_str(buf, line2, tx2, ty2, 2, GREEN)
    # Bottom tagline
    tag = '> HACK THE PLANET //'
    draw_str(buf, tag, (W - str_w(tag,1))//2, H-26, 1, MDGREEN)
    # Decorative horizontal lines
    fill_rect(buf, 40, ty1-10, W-80, 2, (0,60,15))
    fill_rect(buf, 40, ty1+7*sc+sc+8, W-80, 2, (0,60,15))

    return buf

# ══════════════════════════════════════════════════════════════════
# GENERATE ALL FRAMES
# ══════════════════════════════════════════════════════════════════
MATRIX_N  = 16
TERM_N    = 20
TITLE_N   = 18
TOTAL     = MATRIX_N + TERM_N + TITLE_N

frames    = []

print(f'Generating {TOTAL} frames into {TMPDIR}...')

for fi in range(MATRIX_N):
    buf  = make_matrix_frame()
    path = os.path.join(TMPDIR, f'f{len(frames):03d}.ppm')
    write_ppm(buf, path); frames.append(path)
    print(f'\r  {len(frames)}/{TOTAL}', end='', flush=True)

for fi in range(TERM_N):
    lines = int(fi / (TERM_N-1) * len(TERM_LINES))
    buf   = make_terminal_frame(lines, fi%2==0)
    path  = os.path.join(TMPDIR, f'f{len(frames):03d}.ppm')
    write_ppm(buf, path); frames.append(path)
    print(f'\r  {len(frames)}/{TOTAL}', end='', flush=True)

for fi in range(TITLE_N):
    buf  = make_title_frame(fi)
    path = os.path.join(TMPDIR, f'f{len(frames):03d}.ppm')
    write_ppm(buf, path); frames.append(path)
    print(f'\r  {len(frames)}/{TOTAL}', end='', flush=True)

print(f'\r  {TOTAL}/{TOTAL} frames generated')

# ── Combine into GIF via ImageMagick ──────────────────────────────
output = '/Users/curcuqui/Documents/GitHub/game AI/preview.gif'
print('Building GIF with ImageMagick...')

cmd = (
    ['magick']
    + ['-delay', '8']          # 80ms per frame ≈ 12.5fps
    + ['-loop',  '0']
    + frames
    + ['-dither',     'Riemersma']
    + ['-colors',     '48']
    + ['-layers',     'optimize']
    + [output]
)
r = subprocess.run(cmd, capture_output=True)
if r.returncode == 0:
    sz = os.path.getsize(output)
    print(f'✓ Created: {output}  ({sz//1024} KB)')
else:
    print('✗ Error:', r.stderr.decode())

shutil.rmtree(TMPDIR, ignore_errors=True)
print('Done.')
