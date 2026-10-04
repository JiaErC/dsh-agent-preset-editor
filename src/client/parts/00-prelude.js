/* ------------------------------------------------------------------ *
 * Prelude: the only place the platform module table is read.
 *
 * Everything below this file in the factory body may use these bindings.
 * `require` only answers for the frozen platform seed table (React, Cordis
 * and a few static UI libraries); importing any DSH Client package here
 * would blank the slot entry, so the plugin writes its own controls.
 * ------------------------------------------------------------------ */
const React = require('react');
const h = React.createElement;
const Fragment = React.Fragment;
const useState = React.useState;
const useEffect = React.useEffect;
const useMemo = React.useMemo;
const useRef = React.useRef;
const useCallback = React.useCallback;
const useSyncExternalStore = React.useSyncExternalStore;

/** Package identity — must equal `dsh.client` in package.json and the bundle id. */
const PKG = 'dsh-agent-preset-editor';
/** The right-Sidebar tab kind this plugin owns. */
const TAB_KIND = 'agent-preset-editor';
/** The registry-wide unique implementation id of the tab type. */
const TAB_TYPE_ID = PKG + ':presets';
/** The implementation id used by the sidebar footer button. */
const FOOTER_ID = PKG + ':footer';
/** Host routes registered by index.js. */
const API_BASE = '/agent-preset-editor/api';
/** Settings namespace `dsh-client-ui-agent-preset` writes the default into. */
const AGENT_PRESET_SETTINGS_NS = 'agent-preset-registry';

/** The three modes the editor tab can show. */
const MODE_LIST = 'list';
const MODE_PARAMS = 'params';
const MODE_EDIT = 'edit';
/** The three lists the list mode can show at its top. */
const LIST_PRESETS = 'presets';
const LIST_MCP = 'mcp';
const LIST_SKILLS = 'skills';

/** Join class names, dropping falsy entries. */
function cx() {
  var out = [];
  for (var i = 0; i < arguments.length; i += 1) {
    var value = arguments[i];
    if (value) out.push(value);
  }
  return out.join(' ');
}

/** Clamp a number into [min, max]. */
function clamp(value, min, max) {
  var n = Number(value);
  if (!Number.isFinite(n)) n = min;
  return n < min ? min : n > max ? max : n;
}

/** Shallow-compare two plain objects by key/value. */
function shallowEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  var ka = Object.keys(a);
  var kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (var i = 0; i < ka.length; i += 1) {
    if (a[ka[i]] !== b[ka[i]]) return false;
  }
  return true;
}

/**
 * An id shaped like the host's preset ids: lowercase letters, digits and
 * hyphens. Derives one from arbitrary text (used to seed a new preset's id
 * from its display name).
 * @param {string} text - the raw text.
 * @returns {string} a valid id, or 'preset' when nothing survives.
 */
function toPresetId(text) {
  var slug = String(text == null ? '' : text)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'preset' : slug;
}

/** `Date.now()` as an ISO string, for the record timestamps. */
function nowIso() {
  return new Date().toISOString();
}

/**
 * Read an OPTIONAL service without tripping Cordis's injection guard.
 *
 * A Cordis `Context` is a Proxy: reading a service the plugin did not declare
 * in `inject` throws `cannot get property "x" without inject` — it does not
 * return undefined. Declaring it in `inject` instead would gate the whole
 * plugin on a service that may be absent in some compositions, which is a
 * worse trade for something merely nice to have. `ctx.get(name)` is the
 * supported unguarded read.
 *
 * @param {object} ctx - the browser Cordis context.
 * @param {string} name - the service name.
 * @returns {*} the service, or undefined when it is absent or unreadable.
 */
function safeGet(ctx, name) {
  if (!ctx || typeof ctx.get !== 'function') return undefined;
  try {
    return ctx.get(name);
  } catch (error) {
    console.error('[agent-preset-editor] ctx.get("' + name + '") failed', error);
    return undefined;
  }
}
