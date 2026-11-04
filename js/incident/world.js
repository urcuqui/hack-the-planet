// Vulnerability Hunter — AI Incident Lab: the PandeCorp lab map. Three rooms
// (zones) above a corridor, every prop is a solid tile, and spawns are
// validated (walkable, clear of props, reachable from the start). Plain data
// and functions — no canvas here, so it runs in Node tests.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.HTPIncident = root.HTPIncident || {}).World = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const COLS = 25, ROWS = 17, TILE = 32;
  // Tile kinds. Everything but FLOOR is solid.
  const T = { FLOOR: 0, WALL: 1, PLANTER: 2, TERMINAL: 3, SERVER: 4, CONTAINER: 5, GATEWAY: 6, PANEL: 7, SHELF: 8 };
  const TILE_NAMES = ['floor', 'wall', 'planter', 'input terminal', 'ingestion server', 'data container', 'API gateway', 'metrics panel', 'document shelf'];

  // Legend: # wall · . floor · p planter · t terminal · s server · c data container
  //         g API gateway · m metrics/test panel · d document shelf
  const LAYOUT = [
    '#########################',
    '#tt...s.#m...g...m#t...t#',
    '#.......#....g....#.....#',
    '#.....s.#.........#.....#',
    '#.......#.........#....d#',
    '#........................',
    '#.......#.........#....d#',
    '#.......#.........#.....#',
    '#cc...c.#.t.....t.#.mm..#',
    '#.......#.........#.....#',
    '#.......#.........#.....#',
    '###..######...######..###',
    '#.......................#',
    '#.......................#',
    '#.....p...........p.....#',
    '#.......................#',
    '#########################',
  ];
  const CHARS = { '#': T.WALL, '.': T.FLOOR, p: T.PLANTER, t: T.TERMINAL, s: T.SERVER, c: T.CONTAINER, g: T.GATEWAY, m: T.PANEL, d: T.SHELF };
  const MAP = LAYOUT.map(row => row.padEnd(COLS, '#').slice(0, COLS).split('').map(ch => CHARS[ch]));
  MAP[5][24] = T.WALL;   // the east edge stays closed

  const ZONES = [
    { id: 'A', name: 'INPUT & DATA', cols: [1, 7], rows: [1, 10] },
    { id: 'B', name: 'MODEL SECURITY', cols: [9, 17], rows: [1, 10] },
    { id: 'C', name: 'TRUST & RELIABILITY', cols: [18, 23], rows: [1, 10] },
    { id: 'L', name: 'LAB CORRIDOR', cols: [1, 23], rows: [12, 15] },
  ];
  // Rooms connect to each other through doorways on row 5 and to the corridor on row 11.
  const PLAYER_START = { col: 12, row: 13 };
  const SPAWNS = {
    'INJECTOR-9': { col: 3, row: 4, zone: 'A' },
    'POISONER-X': { col: 4, row: 9, zone: 'A' },
    'INVERTOR-Z': { col: 11, row: 5, zone: 'B' },
    'ADVERSAR-1': { col: 15, row: 9, zone: 'B' },
    'BIASBOT-7': { col: 21, row: 3, zone: 'C' },
    'HALLUCIN-8': { col: 21, row: 9, zone: 'C' },
  };

  const center = cell => ({ x: cell.col * TILE + TILE / 2, y: cell.row * TILE + TILE / 2 });
  const cellOf = p => ({ col: Math.floor(p.x / TILE), row: Math.floor(p.y / TILE) });

  function tileAt(wx, wy) {
    const col = Math.floor(wx / TILE), row = Math.floor(wy / TILE);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return T.WALL;
    return MAP[row][col];
  }
  const solidAt = (wx, wy) => tileAt(wx, wy) !== T.FLOOR;
  const walkable = (col, row) => MAP[row] != null && MAP[row][col] === T.FLOOR;

  // Axis-separated movement against solid tiles (radius in pixels).
  function moveWithCollision(obj, dx, dy, r) {
    const nx = obj.x + dx, ny = obj.y + dy;
    const canX = [-r, 0, r].every(oy => !solidAt(nx - r, obj.y + oy) && !solidAt(nx + r, obj.y + oy));
    if (canX) obj.x = nx;
    const canY = [-r, 0, r].every(ox => !solidAt(obj.x + ox, ny - r) && !solidAt(obj.x + ox, ny + r));
    if (canY) obj.y = ny;
  }

  // A body of radius r fits at p (nothing solid under it).
  const fits = (p, r) => [[-r, -r], [r, -r], [-r, r], [r, r], [0, 0]].every(([ox, oy]) => !solidAt(p.x + ox, p.y + oy));

  function zoneOf(p) {
    const { col, row } = cellOf(p);
    const z = ZONES.find(zn => col >= zn.cols[0] && col <= zn.cols[1] && row >= zn.rows[0] && row <= zn.rows[1]);
    return z || null;
  }

  // Breadth-first path between cells (4-connected); null when unreachable.
  function path(from, to) {
    const key = c => c.col + ',' + c.row;
    const prev = new Map([[key(from), null]]);
    const queue = [from];
    while (queue.length) {
      const c = queue.shift();
      if (c.col === to.col && c.row === to.row) {
        const out = [];
        for (let k = key(c); k; k = prev.get(k)) out.unshift(k.split(',').map(Number));
        return out.map(([col, row]) => ({ col, row }));
      }
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = { col: c.col + dc, row: c.row + dr };
        if (walkable(n.col, n.row) && !prev.has(key(n))) { prev.set(key(n), key(c)); queue.push(n); }
      }
    }
    return null;
  }

  // Spawn validation: on floor, clear of props for a robot's radius, and
  // reachable from the player's start. Returns a list of problems.
  function validateSpawns(radius = 10) {
    const problems = [];
    for (const [name, s] of Object.entries(SPAWNS)) {
      if (!walkable(s.col, s.row)) problems.push(name + ' spawns on a solid tile');
      else if (!fits(center(s), radius)) problems.push(name + ' overlaps a prop');
      else if (!path(PLAYER_START, s)) problems.push(name + ' is unreachable');
      const z = zoneOf(center(s));
      if (!z || z.id !== s.zone) problems.push(name + ' is outside zone ' + s.zone);
    }
    return problems;
  }

  // Which way to go for the nearest target (for the "lost?" compass).
  function direction(from, to) {
    const p = path(cellOf(from), cellOf(to));
    if (!p || p.length < 2) return null;
    const step = p[Math.min(3, p.length - 1)];
    return { dx: center(step).x - from.x, dy: center(step).y - from.y, steps: p.length - 1 };
  }

  return {
    COLS, ROWS, TILE, T, TILE_NAMES, MAP, ZONES, SPAWNS, PLAYER_START,
    center, cellOf, tileAt, solidAt, walkable, moveWithCollision, fits, zoneOf, path, validateSpawns, direction,
  };
});
