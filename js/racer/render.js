// Neon Grand Prix: pseudo-3D renderer (Canvas 2D). Road, roadside objects and
// cars are all projected from the same segment table in track.js, so a car at
// lateral position x is always drawn on the asphalt at x.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./track.js'), require('./physics.js'));
  else (root.HTPRacer = root.HTPRacer || {}).Render = factory(root.HTPRacer.Track, root.HTPRacer.Physics);
})(typeof self !== 'undefined' ? self : this, function (Track, Physics) {
  'use strict';

  const SEG = Track.SEGMENT_LENGTH;
  const FOV = 100;
  const CAMERA_HEIGHT = 1500;
  const CAMERA_DEPTH = 1 / Math.tan((FOV / 2) * Math.PI / 180);
  const PLAYER_Z = CAMERA_HEIGHT * CAMERA_DEPTH;   // camera sits this far behind the car
  const DRAW_DISTANCE = 220;
  const FOG_DENSITY = 3.2;

  // Few colours, each with one meaning. Asphalt stays neutral so cars and
  // markings read clearly; neon is kept for kerbs, signs and the sky.
  const PALETTES = {
    day: {
      sky: ['#5fc8f0', '#ffb7d0', '#ffe39a'], sun: '#fff4b8', water: '#2a9ec9', city: ['#e89ab4', '#7ccfd0', '#f2b48a'],
      grass: ['#3a9a63', '#348d5a'], road: ['#4a4d5a', '#464955'], kerb: ['#f4f4f4', '#e0245e'],
      line: '#f2f2f2', lane: '#f2f2f2', fog: '#ffd3e2',
    },
    dusk: {
      sky: ['#2b1a6b', '#e2508e', '#ffb35c'], sun: '#ffd26e', water: '#3b2a7a', city: ['#3a2260', '#5b2a74', '#7b3466'],
      grass: ['#2a5a48', '#26523f'], road: ['#3c3d4f', '#38394a'], kerb: ['#f4f4f4', '#ff3d8b'],
      line: '#f2f2f2', lane: '#e8e8e8', fog: '#c55a8c',
    },
    night: {
      sky: ['#070220', '#1d0f52', '#5c1f72'], sun: '#efe8ff', water: '#0a1838', city: ['#140a36', '#211048', '#2e1358'],
      grass: ['#11261d', '#0e2119'], road: ['#2a2b3c', '#262737'], kerb: ['#00e5ff', '#ff3d8b'],
      line: '#bff6ff', lane: '#9feeff', fog: '#1a0d3d',
    },
  };

  // Rear view of a car, `w` pixels wide with its tyres on y.
  function drawCarOn(ctx, x, y, w, color, trim, lights, braking, lean = 0) {
    const s = w / 100;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(0, -2, 54, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#121420';
    ctx.fillRect(-48, -18, 18, 18); ctx.fillRect(30, -18, 18, 18);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-50, -10); ctx.lineTo(-44, -34); ctx.lineTo(-28, -40); ctx.lineTo(28, -40);
    ctx.lineTo(44, -34); ctx.lineTo(50, -10); ctx.lineTo(44, -6); ctx.lineTo(-44, -6);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = trim;
    ctx.beginPath();
    ctx.moveTo(-26, -40); ctx.lineTo(-18, -56); ctx.lineTo(18, -56); ctx.lineTo(26, -40);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(10,12,30,0.75)';
    ctx.fillRect(-16, -53, 32, 10);
    ctx.fillStyle = '#1a1c2a';
    ctx.fillRect(-30, -22, 60, 9);
    ctx.fillStyle = braking ? '#ff3355' : (lights ? '#ff2a4a' : '#b8243c');
    ctx.fillRect(-44, -30, 16, 7); ctx.fillRect(28, -30, 16, 7);
    if (braking || lights) {
      ctx.globalAlpha = 0.35;
      ctx.fillRect(-48, -34, 24, 15); ctx.fillRect(24, -34, 24, 15);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function createRenderer(canvas) {
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0;
    let skyOffset = 0;
    const proj = Array.from({ length: DRAW_DISTANCE }, () => ({}));

    function resize(width, height, dpr) {
      W = width; H = height;
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function poly(x1, y1, x2, y2, x3, y3, x4, y4, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4);
      ctx.closePath();
      ctx.fill();
    }

    // Quad between two projected cross-sections at lateral offsets a..b (road half-widths).
    function strip(p, a, b, color) {
      poly(p.x1 + p.w1 * a, p.y1, p.x1 + p.w1 * b, p.y1, p.x2 + p.w2 * b, p.y2, p.x2 + p.w2 * a, p.y2, color);
    }

    function drawBackground(pal, view) {
      const horizon = H / 2;
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, pal.sky[0]); sky.addColorStop(0.6, pal.sky[1]); sky.addColorStop(1, pal.sky[2]);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, horizon + 2);

      // Synthwave sun with cut stripes, low on the horizon.
      const sunR = Math.min(W, H) * 0.13;
      const sunX = W * 0.5 - skyOffset * 0.15 % W;
      const sunY = horizon - sunR * 0.35;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, horizon);
      ctx.clip();
      ctx.fillStyle = pal.sun;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(((sunX % W) + W) % W, sunY, sunR, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = pal.sky[2];
      for (let i = 0; i < 5; i++) ctx.fillRect(0, sunY + sunR * (0.15 + i * 0.18), W, sunR * 0.05 * (i + 1));
      ctx.restore();

      // Skyline parallax: shifts with accumulated curvature, never with time.
      const base = horizon;
      for (let layer = 0; layer < 2; layer++) {
        const shift = skyOffset * (layer ? 0.5 : 0.25);
        const unit = layer ? 64 : 92;
        ctx.fillStyle = pal.city[layer];
        for (let i = -2; i < W / unit + 3; i++) {
          const k = Math.floor(i - shift / unit);
          const h = (layer ? 26 : 40) + ((k * 37 + layer * 11) % 7 + 7) % 7 * (layer ? 9 : 12);
          const x = i * unit + (((shift % unit) + unit) % unit) - unit;
          ctx.fillRect(x, base - h, unit * 0.82, h);
        }
      }
      ctx.fillStyle = pal.water;
      ctx.fillRect(0, base - 3, W, 6);
    }

    function drawSegment(p, pal, view) {
      const seg = p.seg;
      const band = Math.floor(seg.index / 3) % 2;
      ctx.fillStyle = pal.grass[band];
      ctx.fillRect(0, p.y2, W, p.y1 - p.y2 + 1);
      strip(p, -Track.KERB_EDGE, -Track.ROAD_EDGE, pal.kerb[band]);
      strip(p, Track.ROAD_EDGE, Track.KERB_EDGE, pal.kerb[band]);
      strip(p, -Track.ROAD_EDGE, Track.ROAD_EDGE, pal.road[band]);
      // Solid edge lines mark exactly where the asphalt ends.
      strip(p, -Track.ROAD_EDGE + 0.015, -Track.ROAD_EDGE + 0.045, pal.line);
      strip(p, Track.ROAD_EDGE - 0.045, Track.ROAD_EDGE - 0.015, pal.line);
      // Dashed lane dividers (3 lanes).
      if (band) {
        strip(p, -1 / 3 - 0.012, -1 / 3 + 0.012, pal.lane);
        strip(p, 1 / 3 - 0.012, 1 / 3 + 0.012, pal.lane);
      }
      // Start / finish: checkered band across the road.
      if (seg.index < 2) {
        for (let c = 0; c < 16; c++) {
          const a = -1 + c / 8, b = a + 1 / 8;
          strip(p, a, b, (c + seg.index) % 2 ? '#111' : '#f4f4f4');
        }
      }
      // Spoofed markings: a painted lane peeling off to the right, plus the
      // high-contrast patches that fool the camera model.
      if (view.spoofZone && seg.index >= view.spoofZone.from && seg.index < view.spoofZone.to) {
        const t = ((seg.index - view.spoofZone.from) % 60) / 60;
        const off = 1 / 3 + Math.min(1, t * 1.6) * 0.52;
        if (band) {
          strip(p, off - 0.016, off + 0.016, '#ffffff');
          strip(p, off - 0.4 - 0.016, off - 0.4 + 0.016, '#ffffff');
        }
        if (seg.index % 6 < 2) {
          strip(p, 0.5, 0.58, '#111111');
          strip(p, 0.58, 0.66, '#f4f4f4');
          strip(p, 0.66, 0.74, '#111111');
        }
      }
      if (view.racingLine && seg.index % 3 === 0) {
        const lx = Physics.racingLineAt(seg.index * SEG);
        strip(p, lx - 0.03, lx + 0.03, 'rgba(0,255,136,0.55)');
      }
      if (p.fog > 0.01) {
        ctx.globalAlpha = p.fog;
        ctx.fillStyle = pal.fog;
        ctx.fillRect(0, p.y2, W, p.y1 - p.y2 + 1);
        ctx.globalAlpha = 1;
      }
    }

    const drawCar = (...args) => drawCarOn(ctx, ...args);

    function drawSprite(sp, x, y, w, pal, view) {
      const night = view.mode !== 'day';
      if (sp.kind === 'palm') {
        const h = w * 0.95;
        ctx.strokeStyle = '#5b4220';
        ctx.lineWidth = Math.max(1.5, w * 0.035);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + w * 0.08, y - h * 0.5, x + w * 0.03, y - h); ctx.stroke();
        ctx.fillStyle = night ? '#1d5e44' : '#23874b';
        for (let i = 0; i < 6; i++) {
          const a = i * Math.PI / 3;
          ctx.beginPath();
          ctx.ellipse(x + w * 0.03 + Math.cos(a) * w * 0.16, y - h + Math.sin(a) * w * 0.05, w * 0.2, w * 0.05, a, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (sp.kind === 'building') {
        const bw = w * 1.2, bh = w * (1.1 + sp.variant * 0.3);
        ctx.fillStyle = pal.city[sp.variant % 3];
        ctx.fillRect(x - bw / 2, y - bh, bw, bh);
        ctx.fillStyle = night ? 'rgba(255,216,110,0.7)' : 'rgba(255,255,255,0.35)';
        const cell = Math.max(3, bw / 8);
        for (let r = 1; r < bh / cell - 1; r += 1.6) for (let c = 1; c < 7; c += 2) ctx.fillRect(x - bw / 2 + c * cell, y - bh + r * cell, cell * 0.6, cell * 0.5);
      } else if (sp.kind === 'chevron') {
        // Yellow/black arrow board pointing into the curve.
        const bw = w * 0.24, bh = w * 0.14;
        ctx.fillStyle = '#222';
        ctx.fillRect(x - w * 0.01, y - bh * 1.6, w * 0.02, bh * 1.6);
        ctx.fillStyle = '#ffd23f';
        ctx.fillRect(x - bw / 2, y - bh * 2.2, bw, bh);
        ctx.fillStyle = '#111';
        for (let i = -1; i <= 1; i++) {
          const cx = x + i * bw * 0.28, cy = y - bh * 1.7, d = sp.dir;
          ctx.beginPath();
          ctx.moveTo(cx - d * bw * 0.08, cy - bh * 0.38); ctx.lineTo(cx + d * bw * 0.08, cy);
          ctx.lineTo(cx - d * bw * 0.08, cy + bh * 0.38); ctx.lineTo(cx - d * bw * 0.0, cy);
          ctx.closePath(); ctx.fill();
        }
      } else if (sp.kind === 'distance') {
        const bw = w * 0.22;
        ctx.fillStyle = '#f4f4f4';
        ctx.fillRect(x - bw / 2, y - bw * 1.9, bw, bw);
        ctx.fillStyle = '#111';
        ctx.font = `bold ${Math.max(6, bw * 0.42)}px Courier New`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(sp.label, x, y - bw * 1.4);
      } else if (sp.kind === 'gantry') {
        const span = w * 1.25, top = y - w * 0.9;
        ctx.fillStyle = '#20223a';
        ctx.fillRect(x - span, top, w * 0.04, w * 0.9);
        ctx.fillRect(x + span - w * 0.04, top, w * 0.04, w * 0.9);
        ctx.fillRect(x - span, top, span * 2, w * 0.16);
        ctx.fillStyle = '#ff6eb4';
        ctx.font = `bold ${Math.max(7, w * 0.1)}px Courier New`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('START · FINISH', x, top + w * 0.08);
      } else if (sp.kind === 'billboard') {
        const bw = w * 2.0, bh = w * 0.62;
        const top = y - w * 1.25;
        ctx.fillStyle = '#20223a';
        ctx.fillRect(x - w * 0.02, top + bh, w * 0.04, y - top - bh);
        ctx.fillStyle = sp.quarantined ? '#1b1f2e' : '#08001c';
        ctx.fillRect(x - bw / 2, top, bw, bh);
        ctx.strokeStyle = sp.quarantined ? '#7d8597' : '#ff3d8b';
        ctx.lineWidth = Math.max(1, w * 0.012);
        ctx.strokeRect(x - bw / 2, top, bw, bh);
        ctx.fillStyle = sp.quarantined ? '#7d8597' : '#ffdd66';
        ctx.font = `bold ${Math.max(7, w * 0.085)}px Courier New`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const words = sp.text.split(' · ');
        words.forEach((line, i) => ctx.fillText(line, x, top + bh * (0.3 + i * 0.4)));
        if (sp.quarantined) {
          ctx.fillStyle = '#00ff88';
          ctx.fillText('QUARANTINED · DATA ONLY', x, top - w * 0.05);
        }
      }
    }

    function draw(view) {
      const { player, rivals, track = Track.TRACK } = view;
      const pal = PALETTES[view.mode] || PALETTES.day;
      const segments = track.segments, N = segments.length, L = track.length;
      const camS = player.s - PLAYER_Z;
      const position = Track.wrap(camS, L);
      const baseIdx = Track.segmentIndex(position, track);
      const basePercent = (position % SEG) / SEG;
      const camY = Track.elevationAt(player.s, track) + CAMERA_HEIGHT;
      const camX = player.x * Track.ROAD_WIDTH;
      const half = W / 2, hh = H / 2;

      skyOffset += (view.dtSim || 0) * Track.curveAt(player.s, track) * (player.speed / Physics.MAX_SPEED) * 60;
      drawBackground(pal, view);

      let x = 0, dx = -(segments[baseIdx].curve * basePercent);
      let maxy = H;
      for (let n = 0; n < DRAW_DISTANCE; n++) {
        const i = baseIdx + n;
        const seg = segments[i % N];
        const z1 = (i % N) * SEG + (i >= N ? L : 0) - position;
        const z2 = z1 + SEG;
        const p = proj[n];
        p.seg = seg; p.z1 = z1; p.clip = maxy; p.visible = false;
        if (z1 <= 0) { x += dx; dx += seg.curve; continue; }
        const s1 = CAMERA_DEPTH / z1, s2 = CAMERA_DEPTH / z2;
        p.s1 = s1; p.s2 = s2;
        p.x1 = half + s1 * (x - camX) * half;
        p.x2 = half + s2 * (x + dx - camX) * half;
        p.y1 = hh - s1 * (seg.y1 - camY) * hh;
        p.y2 = hh - s2 * (seg.y2 - camY) * hh;
        p.w1 = s1 * Track.ROAD_WIDTH * half;
        p.w2 = s2 * Track.ROAD_WIDTH * half;
        p.fog = 1 - Math.exp(-Math.pow(n / DRAW_DISTANCE, 2) * FOG_DENSITY);
        x += dx; dx += seg.curve;
        p.visible = true;
        if (z1 <= CAMERA_DEPTH || p.y2 >= p.y1 || p.y2 >= maxy) continue;
        drawSegment(p, pal, view);
        maxy = p.y2;
      }

      // Roadside objects and rivals, far to near, clipped behind hill crests.
      // Anything at race position s sits in slot n, fraction pct, of the projection table.
      const slot = s => {
        const f = (s - camS) / SEG + basePercent;
        const n = Math.floor(f);
        return n >= 1 && n < DRAW_DISTANCE ? { n, pct: f - n } : null;
      };
      const byIndex = new Map();
      for (const r of rivals) {
        const at = slot(r.s);
        if (!at) continue;
        if (!byIndex.has(at.n)) byIndex.set(at.n, []);
        byIndex.get(at.n).push({ r, pct: at.pct });
      }
      const board = view.billboard && slot(view.billboard.at);
      for (let n = DRAW_DISTANCE - 1; n >= 0; n--) {
        const p = proj[n];
        if (!p.visible) continue;
        const clipped = p.clip < H;
        if (clipped) { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, p.clip); ctx.clip(); }
        // Objects right beside the camera would fill the screen; tall ones drop out earlier.
        for (const sp of p.seg.sprites) {
          if (n < (sp.kind === 'building' ? 28 : sp.kind === 'gantry' ? 1 : 3)) continue;
          drawSprite(sp, p.x1 + p.w1 * sp.offset, p.y1, p.w1, pal, view);
        }
        if (board && board.n === n) {
          drawSprite(Object.assign({ kind: 'billboard' }, view.billboard), p.x1 + p.w1 * 2.6, p.y1, p.w1, pal, view);
        }
        const cars = byIndex.get(n);
        if (cars) {
          cars.sort((a, b) => b.r.s - a.r.s);
          for (const { r, pct } of cars) {
            const cx = p.x1 + (p.x2 - p.x1) * pct;
            const cy = p.y1 + (p.y2 - p.y1) * pct;
            const w = p.w1 + (p.w2 - p.w1) * pct;
            drawCar(cx + w * r.x, cy, w * Physics.CAR_WIDTH, r.color, r.trim, view.mode !== 'day', false);
          }
        }
        if (clipped) ctx.restore();
      }

      // The player's car: fixed at the bottom centre, the road moves under it.
      const pw = (CAMERA_DEPTH / PLAYER_Z) * Track.ROAD_WIDTH * half * Physics.CAR_WIDTH;
      const bounce = view.reducedMotion ? 0 : (player.speed > 0 ? Math.sin(view.time * (player.offroad ? 0.06 : 0.025)) * (player.offroad ? 3 : 1) : 0);
      drawCar(half, H - H * 0.035 + bounce, pw, view.carStyle.color, view.carStyle.trim, view.mode !== 'day', view.braking,
        view.reducedMotion ? 0 : player.steer * 0.035);
    }

    return { resize, draw, ctx };
  }

  return { createRenderer, drawCarOn, CAMERA_HEIGHT, CAMERA_DEPTH, PLAYER_Z, DRAW_DISTANCE, PALETTES };
});
