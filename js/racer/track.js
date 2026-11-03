// Neon Grand Prix: the circuit. This is the single source of truth for road
// geometry — the renderer, the minimap, the physics, the rivals and the
// security events all read positions from here, so they cannot disagree.
//
// The road is a loop of fixed-length segments (classic pseudo-3D racer). Each
// segment has a curvature and an elevation. Position along the circuit is `s`
// (world units); lateral position is `x` in road half-widths: x = 0 is the
// centre line, |x| = ROAD_EDGE is the edge of the asphalt.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.HTPRacer = root.HTPRacer || {}).Track = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SEGMENT_LENGTH = 200;
  const ROAD_WIDTH = 2000;      // half-width of the asphalt in world units
  const LANES = 3;
  const ROAD_EDGE = 1;          // |x| where the asphalt ends (white edge line)
  const KERB_EDGE = 1.15;       // |x| where the kerb ends and the grass starts
  const BARRIER = 2.2;          // |x| limit: the run-off area ends here

  const LENGTH_SCALE = 1.5;     // stretches every section; ~30 s laps at race pace
  const CURVE = { EASY: 2, MEDIUM: 3, HARD: 5 };
  const HILL = { NONE: 0, LOW: 8, MEDIUM: 16, HIGH: 24 };   // in segment lengths

  // [name, enter, hold, leave (segments), curve (+ right / − left), height at end]
  // The last section returns to height 0, so elevation closes too.
  const LAYOUT = [
    ['START / FINISH STRAIGHT', 0, 60, 0, 0, HILL.NONE],
    ['OCEAN DRIVE SWEEPER', 25, 45, 25, CURVE.MEDIUM, HILL.LOW],
    ['COLLINS STRAIGHT', 0, 55, 0, 0, HILL.LOW],
    ['FLAMINGO ESSES', 15, 25, 15, -CURVE.EASY, HILL.NONE],
    ['FLAMINGO ESSES', 15, 25, 15, CURVE.EASY, HILL.NONE],
    ['BISCAYNE HAIRPIN', 20, 50, 20, CURVE.HARD, HILL.MEDIUM],
    ['CAUSEWAY', 0, 70, 0, 0, HILL.HIGH],
    ['CAUSEWAY BEND', 20, 35, 20, -CURVE.MEDIUM, HILL.MEDIUM],
    ['BAYFRONT RUN', 0, 50, 0, 0, HILL.LOW],
    ['SOUTH BEACH SWEEP', 25, 60, 25, CURVE.MEDIUM, HILL.NONE],
    ['NEON CHICANE', 10, 15, 10, -CURVE.HARD, HILL.NONE],
    ['NEON CHICANE', 10, 15, 10, CURVE.HARD, HILL.NONE],
    ['MARINA STRAIGHT', 0, 55, 0, 0, HILL.LOW],
    ['FINAL TURN', 20, 50, 20, CURVE.MEDIUM, HILL.NONE],
    ['START / FINISH STRAIGHT', 0, 30, 0, 0, HILL.NONE],
  ];

  const easeIn = (a, b, p) => a + (b - a) * Math.pow(p, 2);
  const easeInOut = (a, b, p) => a + (b - a) * ((-Math.cos(p * Math.PI) / 2) + 0.5);

  function build(layout = LAYOUT) {
    const segments = [];
    const sections = [];
    let lastY = 0;
    layout.forEach(([name, ...lengths], si) => {
    const [enter, hold, leave] = lengths.slice(0, 3).map(n => Math.round(n * LENGTH_SCALE));
    const [curve, height] = lengths.slice(3);
      const startY = lastY;
      const endY = height * SEGMENT_LENGTH;
      const total = enter + hold + leave;
      const first = segments.length;
      for (let n = 0; n < total; n++) {
        const curveValue = n < enter ? easeIn(0, curve, n / enter)
          : n < enter + hold ? curve
            : easeInOut(curve, 0, (n - enter - hold) / leave);
        const y1 = easeInOut(startY, endY, n / total);
        const y2 = easeInOut(startY, endY, (n + 1) / total);
        segments.push({ index: segments.length, curve: curveValue, y1, y2, section: si });
      }
      sections.push({ index: si, name, curve, first, last: segments.length - 1, length: total * SEGMENT_LENGTH });
      lastY = endY;
    });

    const length = segments.length * SEGMENT_LENGTH;
    const map = buildMap(segments);
    const straights = sections.filter(sec => sec.curve === 0 && sec.length >= 60 * SEGMENT_LENGTH);
    const track = { segments, sections, length, map, straights };
    addRoadside(track);
    return track;
  }

  // Top-down plan of the circuit for the minimap: heading turns with the same
  // curvature the player drives. Total turning is scaled to exactly one loop
  // (2π) and any small position gap is spread along the lap, so the map is a
  // closed loop that matches the road section by section.
  function buildMap(segments) {
    const totalCurve = segments.reduce((sum, seg) => sum + seg.curve, 0);
    const k = (Math.PI * 2) / totalCurve;
    const raw = [{ x: 0, y: 0 }];
    let heading = 0;
    for (const seg of segments) {
      heading += seg.curve * k;
      const last = raw[raw.length - 1];
      raw.push({ x: last.x + Math.sin(heading), y: last.y - Math.cos(heading) });
    }
    const n = segments.length;
    const gap = { x: raw[n].x - raw[0].x, y: raw[n].y - raw[0].y };
    const points = raw.slice(0, n).map((p, i) => ({ x: p.x - gap.x * i / n, y: p.y - gap.y * i / n }));
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const size = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY);
    return {
      // Normalised to a unit box, aspect ratio preserved.
      points: points.map(p => ({ x: (p.x - minX) / size, y: (p.y - minY) / size })),
      width: (Math.max(...xs) - minX) / size,
      height: (Math.max(...ys) - minY) / size,
      rawGap: Math.hypot(gap.x, gap.y) / n,   // closure error before correction, per segment
    };
  }

  // Deterministic roadside dressing (same every lap). Offsets are in road
  // half-widths; negative is left.
  function addRoadside(track) {
    const { segments, sections } = track;
    segments.forEach(seg => { seg.sprites = []; });
    const at = (i, kind, offset, extra) => segments[((i % segments.length) + segments.length) % segments.length]
      .sprites.push(Object.assign({ kind, offset }, extra));

    for (let i = 0; i < segments.length; i += 6) {
      if (segments[i].curve === 0 || Math.abs(segments[i].curve) < 1) {
        at(i, 'palm', i % 12 === 0 ? -1.55 : 1.55);
      }
      if (i % 48 === 0) at(i, 'building', i % 96 === 0 ? 3.6 : -3.6, { variant: (i / 48) % 4 });
    }
    // Chevron boards on the outside of every curve, starting before it.
    sections.filter(sec => sec.curve !== 0).forEach(sec => {
      const outside = sec.curve > 0 ? -1.45 : 1.45;
      const dir = sec.curve > 0 ? 1 : -1;
      for (let i = sec.first - 24; i <= sec.last - 10; i += 14) at(i, 'chevron', outside, { dir });
      if (Math.abs(sec.curve) >= CURVE.HARD) {
        [300, 200, 100].forEach((m, k) => at(sec.first - 30 + k * 10, 'distance', -outside, { label: String(m) }));
      }
    });
    at(0, 'gantry', 0);
  }

  const TRACK = build();

  function wrap(s, length = TRACK.length) {
    return ((s % length) + length) % length;
  }
  function segmentIndex(s, track = TRACK) {
    return Math.floor(wrap(s, track.length) / SEGMENT_LENGTH) % track.segments.length;
  }
  function segmentAt(s, track = TRACK) {
    return track.segments[segmentIndex(s, track)];
  }
  function curveAt(s, track = TRACK) {
    return segmentAt(s, track).curve;
  }
  function elevationAt(s, track = TRACK) {
    const seg = segmentAt(s, track);
    const p = (wrap(s, track.length) % SEGMENT_LENGTH) / SEGMENT_LENGTH;
    return seg.y1 + (seg.y2 - seg.y1) * p;
  }
  // 1-based lap for an absolute race position (grid slots before the line count as lap 1).
  function lapOf(s, track = TRACK) {
    return Math.max(1, Math.floor(s / track.length) + 1);
  }
  function lapProgress(s, track = TRACK) {
    return wrap(s, track.length) / track.length;
  }
  // Interpolated minimap position for any race position.
  function mapPoint(s, track = TRACK) {
    const pts = track.map.points;
    const f = wrap(s, track.length) / SEGMENT_LENGTH;
    const i = Math.floor(f) % pts.length;
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const p = f - Math.floor(f);
    return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
  }
  function sectionAt(s, track = TRACK) {
    return track.sections[segmentAt(s, track).section];
  }
  // The next curve within `lookahead` world units, for the HUD callout.
  function nextCurve(s, lookahead = 90 * SEGMENT_LENGTH, track = TRACK) {
    for (let d = 0; d <= lookahead; d += SEGMENT_LENGTH) {
      const seg = segmentAt(s + d, track);
      if (Math.abs(seg.curve) >= 1) {
        const sec = track.sections[seg.section];
        const c = Math.abs(sec.curve);
        return {
          dir: sec.curve > 0 ? 'RIGHT' : 'LEFT',
          severity: c >= CURVE.HARD ? 'SHARP' : c >= CURVE.MEDIUM ? 'MEDIUM' : 'EASY',
          distance: d,
          name: sec.name,
        };
      }
    }
    return { dir: 'STRAIGHT', severity: null, distance: lookahead, name: sectionAt(s, track).name };
  }

  return {
    SEGMENT_LENGTH, ROAD_WIDTH, LANES, ROAD_EDGE, KERB_EDGE, BARRIER, CURVE, LAYOUT,
    build, TRACK, wrap, segmentIndex, segmentAt, curveAt, elevationAt, lapOf, lapProgress,
    mapPoint, sectionAt, nextCurve,
  };
});
