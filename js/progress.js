/*
 * HACK THE PLANET — shared campaign progression.
 *
 * Classic script (no ES modules) so the game keeps working when the HTML files
 * are opened directly from disk (file://). In the browser it exposes
 * window.HTPProgress; under Node it exports the same API for unit tests.
 *
 * Progress lives in localStorage and is a convenience only: anyone can edit it,
 * so nothing here is treated as a security boundary.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HTPProgress = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STORAGE_KEY = 'htp.progress';
  const SCHEMA_VERSION = 1;
  const HUB_URL = 'index.html';

  // Campaign order. Completion of level N unlocks level N + 1.
  const LEVELS = [
    { id: 1, url: 'level1.html', code: 'LEVEL 01', name: 'FSOCIETY ARENA' },
    { id: 2, url: 'level2.html', code: 'LEVEL 02', name: 'VULNERABILITY HUNTER' },
    { id: 3, url: 'level3.html', code: 'LEVEL 03', name: 'SOCIAL ENGINEER' },
    { id: 4, url: 'level4.html', code: 'LEVEL 04', name: 'NEON GRAND PRIX' },
  ];

  // Per-level "best" fields and whether a higher or lower value is better.
  const BEST_RULES = {
    2: { integrity: 'max' },
    4: { position: 'min', timeMs: 'min' },
  };

  function getLevel(id) {
    return LEVELS.find(l => l.id === id) || null;
  }

  function nextLevel(id) {
    return getLevel(id + 1);
  }

  function defaultState() {
    return { version: SCHEMA_VERSION, highestUnlocked: 1, levels: {} };
  }

  function isTimestamp(v) {
    return typeof v === 'string' && !Number.isNaN(Date.parse(v));
  }

  // Accepts anything (parsed JSON, garbage, null) and returns a valid state.
  function normalize(raw) {
    const state = defaultState();
    if (!raw || typeof raw !== 'object' || raw.version !== SCHEMA_VERSION) return state;

    const levels = raw.levels && typeof raw.levels === 'object' ? raw.levels : {};
    for (const level of LEVELS) {
      const entry = levels[level.id];
      if (!entry || typeof entry !== 'object' || entry.completed !== true) continue;
      const clean = { completed: true };
      if (isTimestamp(entry.firstCompletedAt)) clean.firstCompletedAt = entry.firstCompletedAt;
      if (isTimestamp(entry.lastCompletedAt)) clean.lastCompletedAt = entry.lastCompletedAt;
      const rules = BEST_RULES[level.id];
      if (rules && entry.best && typeof entry.best === 'object') {
        const best = {};
        for (const key of Object.keys(rules)) {
          if (Number.isFinite(entry.best[key])) best[key] = entry.best[key];
        }
        if (Object.keys(best).length) clean.best = best;
      }
      state.levels[level.id] = clean;
    }

    // Unlocks only come from completions, so a stored value is re-derived
    // rather than trusted (a hand-edited highestUnlocked: 99 is ignored).
    state.highestUnlocked = earnedUnlock(state);
    return state;
  }

  // Highest level reachable from completed levels alone.
  function earnedUnlock(state) {
    let highest = 1;
    for (const level of LEVELS) {
      if (state.levels[level.id] && state.levels[level.id].completed) {
        highest = Math.max(highest, Math.min(level.id + 1, LEVELS.length));
      }
    }
    return highest;
  }

  // Pure: returns a new state with the completion applied.
  function applyCompletion(state, levelId, result, now) {
    if (!getLevel(levelId)) throw new RangeError('Unknown level ' + levelId);
    const next = normalize(JSON.parse(JSON.stringify(state)));
    const stamp = (now || new Date()).toISOString();
    const prev = next.levels[levelId];
    const entry = {
      completed: true,
      firstCompletedAt: prev && prev.firstCompletedAt ? prev.firstCompletedAt : stamp,
      lastCompletedAt: stamp,
    };

    const rules = BEST_RULES[levelId];
    if (rules) {
      const best = Object.assign({}, prev && prev.best);
      for (const [key, dir] of Object.entries(rules)) {
        const value = result ? result[key] : undefined;
        if (!Number.isFinite(value)) continue;
        if (!Number.isFinite(best[key]) || (dir === 'max' ? value > best[key] : value < best[key])) {
          best[key] = value;
        }
      }
      if (Object.keys(best).length) entry.best = best;
    }

    next.levels[levelId] = entry;
    next.highestUnlocked = earnedUnlock(next);
    return next;
  }

  function statusOf(state, levelId) {
    if (state.levels[levelId] && state.levels[levelId].completed) return 'completed';
    return levelId <= state.highestUnlocked ? 'available' : 'locked';
  }

  function isCampaignComplete(state) {
    return LEVELS.every(l => statusOf(state, l.id) === 'completed');
  }

  // Storage wrapper. `storage` may be missing or throw on access (private
  // mode, blocked cookies, quota); every failure falls back to defaults.
  function createStore(storage) {
    function load() {
      try {
        const text = storage ? storage.getItem(STORAGE_KEY) : null;
        return normalize(text ? JSON.parse(text) : null);
      } catch (e) {
        return defaultState();
      }
    }
    function save(state) {
      try {
        if (!storage) return false;
        storage.setItem(STORAGE_KEY, JSON.stringify(state));
        return true;
      } catch (e) {
        return false;
      }
    }
    return {
      load,
      save,
      recordCompletion(levelId, result) {
        const next = applyCompletion(load(), levelId, result);
        return { state: next, saved: save(next) };
      },
      reset() {
        try {
          if (storage) storage.removeItem(STORAGE_KEY);
          return true;
        } catch (e) {
          return false;
        }
      },
      // True when progress will survive a reload.
      isPersistent() {
        try {
          if (!storage) return false;
          const probe = STORAGE_KEY + '.probe';
          storage.setItem(probe, '1');
          storage.removeItem(probe);
          return true;
        } catch (e) {
          return false;
        }
      },
    };
  }

  function browserStorage() {
    try {
      return typeof window !== 'undefined' ? window.localStorage : null;
    } catch (e) {
      return null; // Accessing localStorage itself can throw (e.g. blocked site data).
    }
  }

  const defaultStore = createStore(browserStorage());

  return {
    STORAGE_KEY,
    SCHEMA_VERSION,
    HUB_URL,
    LEVELS,
    getLevel,
    nextLevel,
    defaultState,
    normalize,
    applyCompletion,
    statusOf,
    isCampaignComplete,
    createStore,
    load: defaultStore.load,
    recordCompletion: defaultStore.recordCompletion,
    reset: defaultStore.reset,
    isPersistent: defaultStore.isPersistent,
  };
});
