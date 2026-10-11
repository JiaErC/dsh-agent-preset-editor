/**
 * dsh-agent-preset-editor — browser half.
 *
 * GENERATED FILE. Do not edit by hand: edit src/client/parts/*.js and run
 * `node scripts/build-client.mjs`.
 */
window.__ModuleLoader__.load({
  id: 'dsh-agent-preset-editor',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
/* ============================ 00-prelude.js ============================ */
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

/* ============================ 10-ui.js ============================ */
/* ------------------------------------------------------------------ *
 * UI 原语（契约 §5）。
 *
 * 这个文件是「裸语句片段」，会被按文件名升序拼进 client.js 的 factory 函数体：
 * 没有 import / export，没有 JSX，只能 h(...)。可用的绑定由 00-prelude.js 提供
 * （React / h / Fragment / useState / useEffect / useMemo / useRef / useCallback /
 * useSyncExternalStore / cx / clamp / shallowEqual …），不要重复声明。
 *
 * 上色只用主题 token（--dsw-alias-* / --dsw-radius-* / --dsw-shadow-* 等），
 * 因此浅色与深色主题都会自动跟随宿主。唯一允许的字面颜色思路是图标用
 * currentColor —— 本文件没有写死任何颜色值。
 *
 * 样式集中在这一个模块级常量里，由组件用 h('style', { key:'ape-styles' }, APE_CSS)
 * 渲染出来。React 只按同级 key 去重，跨组件树会重复插入同样的文本，这是刻意的：
 * 任何原语单独出现在页面里（例如侧边栏底部的按钮）都不会掉样式。不操作 document.head。
 * ------------------------------------------------------------------ */

/** 全部 CSS。class 统一 ape- 前缀，避免与宿主样式互相污染。 */
const APE_CSS = `
/* ---------- 基础排版工具 ---------- */
.ape-icon{display:block;flex:0 0 auto;color:inherit}
.ape-stack{display:flex;flex-direction:column;gap:8px;min-width:0}
.ape-row{display:flex;align-items:center;gap:8px;min-width:0}
.ape-spread{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
.ape-grow{flex:1 1 auto;min-width:0}
.ape-shrink{flex:0 0 auto}
.ape-muted{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.ape-dim{color:var(--dsw-alias-label-tertiary)}
.ape-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;line-height:16px}
.ape-hint{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}
.ape-scroll{overflow:auto;min-height:0}
.ape-truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* ---------- 按钮 ---------- */
.ape-btn{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 12px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:20px;white-space:nowrap;cursor:pointer;flex:0 0 auto;transition:background 120ms ease,color 120ms ease}
.ape-btn-sm{height:26px;padding:0 8px;font-size:12px;line-height:18px}
.ape-btn-block{width:100%}
.ape-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.ape-btn:active:not(:disabled){background:var(--dsw-alias-interactive-bg-active)}
.ape-btn:disabled{opacity:.4;cursor:not-allowed}
.ape-btn:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.ape-btn-primary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
.ape-btn-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}
.ape-btn-primary:active:not(:disabled){background:var(--dsw-alias-button-primary-hover)}
.ape-btn-danger{color:var(--dsw-alias-state-error-primary)}
.ape-btn-danger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)}
.ape-btn-icon{display:inline-flex;align-items:center;justify-content:center}
.ape-btn-label{display:inline-block;max-width:220px;overflow:hidden;text-overflow:ellipsis}

/* ---------- 输入类 ---------- */
.ape-input-wrap{box-sizing:border-box;display:flex;align-items:center;gap:6px;height:32px;width:100%;padding:0 8px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1)}
.ape-input-wrap:focus-within{border-color:var(--dsw-alias-state-business-primary)}
.ape-input-wrap.ape-is-disabled{opacity:.5}
.ape-input,.ape-textarea,.ape-select{font-family:inherit;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary)}
.ape-input{flex:1 1 auto;min-width:0;padding:0;border:0;outline:0;background:transparent}
.ape-input::placeholder,.ape-textarea::placeholder{color:var(--dsw-alias-label-dimmed)}
.ape-input[type=number]{appearance:textfield;-moz-appearance:textfield}
.ape-input-icon{display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary);flex:0 0 auto}
.ape-input-clear{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;border:0;border-radius:var(--dsw-radius-xs,4px);background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;flex:0 0 auto}
.ape-input-clear:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.ape-textarea{box-sizing:border-box;display:block;width:100%;min-height:64px;padding:6px 8px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);outline:0;resize:vertical}
.ape-textarea:focus{border-color:var(--dsw-alias-state-business-primary)}
.ape-textarea:disabled{opacity:.5;resize:none}
/* {{ $x }} 语法高亮：一块只画背景的高亮层铺在透明 textarea 底下。
   两层的盒模型、字体、行高、内边距、换行规则必须逐项一致，否则绿底会逐行错位；
   scrollbar-gutter:stable 让两者都为滚动条预留同样的宽度（textarea 有滚动条、
   高亮层没有的话，可用宽度不同，换行位置就会分岔）。 */
.ape-textarea-hl{position:relative;display:block;width:100%}
.ape-textarea-hl>.ape-textarea{position:relative;z-index:1;background:transparent;scrollbar-gutter:stable}
.ape-textarea-hl-layer{position:absolute;inset:0;z-index:0;box-sizing:border-box;overflow:hidden;pointer-events:none;padding:6px 8px;border:.5px solid transparent;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);font-family:inherit;font-size:13px;line-height:20px;white-space:pre-wrap;overflow-wrap:break-word;word-break:break-word;color:transparent;scrollbar-gutter:stable}
.ape-textarea-mark{background:var(--dsw-alias-state-success-tertiary);border-radius:3px}
.ape-readonly{background:var(--dsw-alias-bg-skeleton);color:var(--dsw-alias-label-secondary)}
.ape-select-wrap{box-sizing:border-box;position:relative;display:flex;align-items:center;height:32px;width:100%;padding:0 8px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1)}
.ape-select-wrap:focus-within{border-color:var(--dsw-alias-state-business-primary)}
.ape-select-wrap.ape-is-disabled{opacity:.5}
.ape-select{flex:1 1 auto;width:100%;min-width:0;padding:0 18px 0 0;border:0;outline:0;background:transparent;appearance:none;-webkit-appearance:none;cursor:pointer}
.ape-select:disabled{cursor:not-allowed}
.ape-select-multi-wrap{height:auto;padding:4px 6px;align-items:stretch}
.ape-select-multi{padding:0;min-height:76px;cursor:default}
.ape-select-caret{position:absolute;right:7px;top:50%;transform:translateY(-50%);display:inline-flex;color:var(--dsw-alias-label-tertiary);pointer-events:none}

/* ---------- 开关 ---------- *
 * flex:0 0 auto 是功能性的，不是装饰：作为 flex item 它原本是 flex:0 1 auto
 * 且带 min-width:0，于是一个长兄弟节点（多行描述）能把这个盒子压到 0 宽，
 * 而里面的开关仍是 flex:0 0 auto / width:36px —— 36px 的控件就溢出自己的盒子、
 * 画到文本上。开关是固定尺寸控件，永远不该是 flex-shrink 的候选。
 * 注意：APE_CSS 是模板字符串，本常量内不能出现反引号。 */
.ape-switch-field{display:inline-flex;align-items:center;gap:8px;flex:0 0 auto;min-width:0}
.ape-switch{box-sizing:border-box;position:relative;flex:0 0 auto;width:36px;height:20px;padding:2px;border:0;border-radius:999px;background:var(--dsw-alias-border-l3);cursor:pointer}
.ape-switch[aria-checked="true"]{background:var(--dsw-alias-brand-primary)}
.ape-switch:disabled{cursor:not-allowed;opacity:.5}
.ape-switch:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.ape-switch-thumb{display:block;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-switch-thumb);transition:transform 120ms ease}
.ape-switch[aria-checked="true"] .ape-switch-thumb{transform:translateX(16px)}
.ape-switch-label{font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);cursor:pointer}

/* ---------- 滑块 ---------- */
.ape-slider{display:flex;align-items:center;gap:10px;min-width:0;width:100%}
.ape-slider input[type=range]{flex:1 1 auto;min-width:0;height:20px;margin:0;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
.ape-slider input[type=range]:disabled{cursor:not-allowed;opacity:.5}
.ape-slider-value{flex:0 0 auto;min-width:34px;text-align:right;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}

/* ---------- 勾选 / 单选 ---------- */
.ape-opt-group{display:flex;flex-wrap:wrap;gap:2px 14px;min-width:0}
.ape-opt-group-vertical{flex-direction:column;gap:2px}
.ape-opt{display:inline-flex;align-items:center;gap:6px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);cursor:pointer;min-width:0}
.ape-opt input{flex:0 0 auto;width:14px;height:14px;margin:0;accent-color:var(--dsw-alias-brand-primary);cursor:inherit}
.ape-opt:has(input:disabled){opacity:.5;cursor:not-allowed}
.ape-opt-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* ---------- 徽标 ---------- */
.ape-badge{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 8px;border-radius:999px;flex:0 0 auto;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;white-space:nowrap}
.ape-badge-ok{background:var(--dsw-alias-state-success-tertiary);color:var(--dsw-alias-state-success-primary)}
.ape-badge-warn{background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-state-warn-label)}
.ape-badge-err{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary)}

/* ---------- 空态 / 加载 ---------- */
.ape-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:28px 16px;text-align:center;min-width:0}
.ape-empty-icon{color:var(--dsw-alias-label-dimmed);margin-bottom:2px}
.ape-empty-title{font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary)}
.ape-empty-hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);max-width:300px}
.ape-spinner{display:inline-block;box-sizing:border-box;width:16px;height:16px;border:2px solid var(--dsw-alias-border-l3);border-top-color:var(--dsw-alias-brand-primary);border-radius:50%;animation:ape-spin .8s linear infinite}
@keyframes ape-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.ape-spinner{animation-duration:2.4s}}

/* ---------- 弹层 ---------- */
.ape-modal-root{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:24px}
.ape-modal-mask{position:absolute;inset:0;background:var(--dsw-alias-bg-mask-1)}
.ape-modal-card{position:relative;z-index:1;display:flex;flex-direction:column;width:min(420px,100%);max-height:100%;border:0;border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-shadow-lv3);overflow:hidden;outline:0}
.ape-modal-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:14px 12px 10px 16px}
.ape-modal-title{margin:0;font-size:14px;line-height:22px;font-weight:500;color:var(--dsw-alias-label-primary);min-width:0;flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ape-modal-actions{display:flex;align-items:center;gap:8px;flex:0 0 auto}
.ape-modal-close{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;flex:0 0 auto}
.ape-modal-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.ape-modal-body{display:flex;flex-direction:column;gap:10px;padding:0 16px;overflow:auto;min-height:0}
.ape-modal-foot{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:14px 16px 16px}

/* ---------- 字段 / 区块 / 列表行 ---------- */
.ape-field{display:flex;flex-direction:column;gap:4px;min-width:0}
.ape-field-head{display:flex;align-items:center;gap:6px;min-width:0}
.ape-field-label{font-size:12px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-secondary);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ape-field-req{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}
.ape-field-actions{display:inline-flex;align-items:center;gap:6px;margin-left:auto;flex:0 0 auto}
.ape-field-body{min-width:0}
.ape-field-info{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}
.ape-field-error{font-size:11px;line-height:16px;color:var(--dsw-alias-state-error-primary)}
.ape-section{display:flex;flex-direction:column;gap:8px;min-width:0}
.ape-section-head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
.ape-section-title{font-size:12px;line-height:18px;font-weight:600;color:var(--dsw-alias-label-secondary);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ape-section-actions{display:inline-flex;align-items:center;gap:6px;flex:0 0 auto}
.ape-listrow{display:flex;align-items:center;gap:10px;padding:10px 12px;border:.5px solid transparent;border-radius:var(--dsw-radius-sm);min-width:0}
.ape-listrow-click{cursor:pointer}
.ape-listrow-click:hover{background:var(--dsw-alias-interactive-bg-hover)}
.ape-listrow-active{background:var(--dsw-alias-button-ghost-active-fill);border-color:var(--dsw-alias-button-ghost-active-border)}
.ape-listrow:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.ape-listrow-main{display:flex;flex-direction:column;gap:2px;flex:1 1 auto;min-width:0;word-break:break-word;overflow-wrap:anywhere}
.ape-listrow-right{display:inline-flex;align-items:center;gap:4px;flex:0 0 auto;flex-wrap:nowrap}

/* ---------- 提示条 ---------- */
.ape-toasts{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:1100;display:flex;flex-direction:column;align-items:center;gap:8px;max-width:min(560px,calc(100vw - 32px));pointer-events:none}
.ape-toast{display:flex;align-items:center;gap:8px;padding:9px 14px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-toast-bg);color:var(--dsw-alias-toast-label);font-size:13px;line-height:20px;box-shadow:var(--dsw-shadow-lv3);animation:ape-toast-in 140ms ease-out}
.ape-toast-icon{display:inline-flex;align-items:center;color:var(--dsw-alias-toast-label)}
.ape-toast-ok .ape-toast-icon{color:var(--dsw-alias-state-success-primary)}
.ape-toast-err .ape-toast-icon{color:var(--dsw-alias-state-error-secondary)}
.ape-toast-warn .ape-toast-icon{color:var(--dsw-alias-state-warn-secondary)}
.ape-toast-text{min-width:0}
@keyframes ape-toast-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}

/* ---------- 工具条 / 分段控件 ---------- */
.ape-toolbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
.ape-toolbar-right{margin-left:auto;display:inline-flex;align-items:center;gap:6px}
.ape-seg{display:inline-flex;align-items:center;gap:2px;padding:3px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-interactive-bg-hover);max-width:100%}
.ape-seg-item{display:inline-flex;align-items:center;justify-content:center;gap:5px;height:26px;padding:0 12px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:12px;line-height:18px;font-weight:500;white-space:nowrap;cursor:pointer;min-width:0;transition:background 120ms ease,color 120ms ease}
.ape-seg-item:hover:not(:disabled){color:var(--dsw-alias-label-primary)}
.ape-seg-item[aria-selected="true"]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-elevation-soft)}
.ape-seg-item:disabled{cursor:not-allowed;opacity:.4}
.ape-seg-item:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.ape-seg-icon{display:inline-flex;align-items:center}

/* ---------- 低代码表单（30-form.js 使用） ---------- */
.ape-form{display:flex;flex-direction:column;gap:12px;min-width:0}
.ape-form-grid{display:grid;grid-template-columns:repeat(24,minmax(0,1fr));gap:12px 10px;min-width:0;container-type:inline-size}
.ape-form-cell{min-width:0}
@container (max-width:430px){.ape-form-cell{grid-column:span 24 !important}}
.ape-form-title{font-size:12px;line-height:18px;font-weight:600;color:var(--dsw-alias-label-secondary);padding:2px 0}
.ape-form-divider{height:1px;background:var(--dsw-alias-border-l2);margin:4px 0}
.ape-form-preview{margin:0;padding:8px 10px;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:18px;white-space:pre-wrap;word-break:break-word;max-height:240px;overflow:auto}
.ape-form-unknown{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-state-warn-label);font-size:12px;line-height:18px}
.ape-form-note{padding:6px 8px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-skeleton);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.ape-form-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
`;

/**
 * 共享的样式节点。同一个 React 元素可以被渲染到多处（元素是不可变描述符），
 * 浏览器对重复的同样文本没有副作用。
 */
const APE_STYLE_NODE = h('style', { key: 'ape-styles', 'data-ape': 'styles' }, APE_CSS);

/** 渲染样式表；必须放进每个组件返回的树里（Fragment 内第一个孩子）。 */
function apeStyle() {
  return APE_STYLE_NODE;
}

/* ------------------------------------------------------------------ *
 * 小工具（全部 ape 前缀，避免与其它 part 的绑定撞名）
 * ------------------------------------------------------------------ */

/** 取数字，非法值一律退回 fallback（空串、布尔值不算数字）。 */
function apeNum(value, fallback) {
  if (value === '' || value === null || value === undefined || typeof value === 'boolean') return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** 取字符串，null/undefined 一律给空串或 fallback。 */
function apeStr(value, fallback) {
  if (value === null || value === undefined) return fallback === undefined ? '' : fallback;
  return String(value);
}

/** 取数组，非数组给空数组。 */
function apeArr(value) {
  return Array.isArray(value) ? value : [];
}

/** 图标尺寸：只接受数字或数字字符串，并夹到合理区间。 */
function apeIconSize(value, fallback) {
  const n = apeNum(typeof value === 'number' ? value : (typeof value === 'string' ? value.trim() : value), fallback);
  return clamp(n, 10, 64);
}

/** 归一化一个 option：字符串 / {label,value} 都吃。 */
function apeOption(input) {
  if (input === null || input === undefined) return { label: '', value: '' };
  const kind = typeof input;
  if (kind === 'string' || kind === 'number' || kind === 'boolean') {
    return { label: String(input), value: input };
  }
  if (kind === 'object') {
    const value = input.value !== undefined ? input.value : (input.label !== undefined ? input.label : '');
    return {
      label: input.label === null || input.label === undefined ? String(value) : String(input.label),
      value: value,
      icon: input.icon,
      title: typeof input.title === 'string' ? input.title : undefined,
      disabled: input.disabled === true,
    };
  }
  return { label: '', value: '' };
}

/** 归一化 option 数组。 */
function apeOptions(list) {
  const out = [];
  const input = apeArr(list);
  for (let i = 0; i < input.length; i += 1) out.push(apeOption(input[i]));
  return out;
}

/** 把任意标量安全地变成字符串（select 的 DOM value 只能是非对象）。 */
function apeScalar(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return '';
  return String(value);
}

/** 用 DOM 字符串值找回 option 里的原始值（保住 number 等类型）。 */
function apeMatchValue(options, domValue) {
  for (let i = 0; i < options.length; i += 1) {
    if (apeScalar(options[i].value) === domValue) return options[i].value;
  }
  return domValue;
}

/** icon 传字符串就当成图标名，传元素直接用；都不是则返回 null。 */
function apeIconNode(icon, size) {
  if (icon === null || icon === undefined || icon === false) return null;
  if (typeof icon === 'string') return h(Icon, { name: icon, size: size });
  if (typeof icon === 'object' && icon.$$typeof) return icon;
  return null;
}

/** 供 forwardRef 用：React 一定有 forwardRef；万一没有就退化成普通函数组件。 */
const apeForwardRef = typeof React.forwardRef === 'function' ? React.forwardRef : function (render) { return render; };

/** 合并两个 ref（内部 useRef + 外部传入）。 */
function apeMergeRefs(localRef, externalRef) {
  return function (node) {
    localRef.current = node;
    if (typeof externalRef === 'function') {
      externalRef(node);
    } else if (externalRef && typeof externalRef === 'object') {
      try { externalRef.current = node; } catch (error) { /* 只读 ref：忽略 */ }
    }
  };
}

/** Modal 的简易 Tab 焦点环。 */
function apeFocusables(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return [];
  const nodes = root.querySelectorAll('button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
  const out = [];
  for (let i = 0; i < nodes.length; i += 1) out.push(nodes[i]);
  return out;
}

/** 一个进程内唯一的后缀，用于 radio 的 name 分组。 */
let apeUidSeq = 0;
function apeUid(prefix) {
  apeUidSeq += 1;
  return prefix + '-' + apeUidSeq;
}

/* ------------------------------------------------------------------ *
 * Icon —— 契约 §5：{ name, size? }，未知名字渲染一个圆点，不抛错。
 * 图形一律 currentColor，颜色由外层 color 决定。
 * ------------------------------------------------------------------ */

const APE_ICONS = {
  preset: [
    ['rect', { x: 4, y: 4, width: 16, height: 16, rx: 2 }],
    ['rect', { x: 9, y: 9, width: 6, height: 6 }],
    ['line', { x1: 9, y1: 1, x2: 9, y2: 4 }],
    ['line', { x1: 15, y1: 1, x2: 15, y2: 4 }],
    ['line', { x1: 9, y1: 20, x2: 9, y2: 23 }],
    ['line', { x1: 15, y1: 20, x2: 15, y2: 23 }],
    ['line', { x1: 20, y1: 9, x2: 23, y2: 9 }],
    ['line', { x1: 20, y1: 14, x2: 23, y2: 14 }],
    ['line', { x1: 1, y1: 9, x2: 4, y2: 9 }],
    ['line', { x1: 1, y1: 14, x2: 4, y2: 14 }],
  ],
  mcp: [
    ['rect', { x: 2, y: 2, width: 20, height: 8, rx: 2 }],
    ['rect', { x: 2, y: 14, width: 20, height: 8, rx: 2 }],
    ['line', { x1: 6, y1: 6, x2: 6.01, y2: 6 }],
    ['line', { x1: 6, y1: 18, x2: 6.01, y2: 18 }],
  ],
  skill: [
    ['path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }],
    ['polyline', { points: '14 2 14 8 20 8' }],
    ['line', { x1: 16, y1: 13, x2: 8, y2: 13 }],
    ['line', { x1: 16, y1: 17, x2: 8, y2: 17 }],
  ],
  plus: [
    ['line', { x1: 12, y1: 5, x2: 12, y2: 19 }],
    ['line', { x1: 5, y1: 12, x2: 19, y2: 12 }],
  ],
  search: [
    ['circle', { cx: 11, cy: 11, r: 8 }],
    ['line', { x1: 21, y1: 21, x2: 16.65, y2: 16.65 }],
  ],
  play: [
    ['polygon', { points: '5 3 19 12 5 21 5 3' }],
  ],
  edit: [
    ['path', { d: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' }],
    ['path', { d: 'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' }],
  ],
  sliders: [
    ['line', { x1: 4, y1: 21, x2: 4, y2: 14 }],
    ['line', { x1: 4, y1: 10, x2: 4, y2: 3 }],
    ['line', { x1: 12, y1: 21, x2: 12, y2: 12 }],
    ['line', { x1: 12, y1: 8, x2: 12, y2: 3 }],
    ['line', { x1: 20, y1: 21, x2: 20, y2: 16 }],
    ['line', { x1: 20, y1: 12, x2: 20, y2: 3 }],
    ['line', { x1: 1, y1: 14, x2: 7, y2: 14 }],
    ['line', { x1: 9, y1: 8, x2: 15, y2: 8 }],
    ['line', { x1: 17, y1: 16, x2: 23, y2: 16 }],
  ],
  trash: [
    ['polyline', { points: '3 6 5 6 21 6' }],
    ['path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }],
    ['line', { x1: 10, y1: 11, x2: 10, y2: 17 }],
    ['line', { x1: 14, y1: 11, x2: 14, y2: 17 }],
  ],
  save: [
    ['path', { d: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z' }],
    ['polyline', { points: '17 21 17 13 7 13 7 21' }],
    ['polyline', { points: '7 3 7 8 15 8' }],
  ],
  back: [
    ['line', { x1: 19, y1: 12, x2: 5, y2: 12 }],
    ['polyline', { points: '12 19 5 12 12 5' }],
  ],
  refresh: [
    ['polyline', { points: '23 4 23 10 17 10' }],
    ['polyline', { points: '1 20 1 14 7 14' }],
    ['path', { d: 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15' }],
  ],
  check: [
    ['polyline', { points: '20 6 9 17 4 12' }],
  ],
  close: [
    ['line', { x1: 18, y1: 6, x2: 6, y2: 18 }],
    ['line', { x1: 6, y1: 6, x2: 18, y2: 18 }],
  ],
  alert: [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['line', { x1: 12, y1: 8, x2: 12, y2: 12 }],
    ['line', { x1: 12, y1: 16, x2: 12.01, y2: 16 }],
  ],
  info: [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['line', { x1: 12, y1: 16, x2: 12, y2: 12 }],
    ['line', { x1: 12, y1: 8, x2: 12.01, y2: 8 }],
  ],
  'chevron-right': [['polyline', { points: '9 18 15 12 9 6' }]],
  'chevron-down': [['polyline', { points: '6 9 12 15 18 9' }]],
  dot: [['circle', { cx: 12, cy: 12, r: 9 }]],
};

function Icon(props) {
  const p = props || {};
  const name = typeof p.name === 'string' ? p.name : 'dot';
  const size = apeIconSize(p.size, 16);
  const shapes = APE_ICONS[name] || APE_ICONS.dot;
  const kids = [];
  for (let i = 0; i < shapes.length; i += 1) {
    const shape = shapes[i];
    const attrs = { key: 'ape-i' + i };
    const bag = shape[1] || {};
    for (const key in bag) {
      if (Object.prototype.hasOwnProperty.call(bag, key)) attrs[key] = bag[key];
    }
    kids.push(h(shape[0], attrs));
  }
  return h('svg', {
    className: 'ape-icon',
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
    focusable: 'false',
    style: { width: size, height: size },
  }, kids);
}

/* ------------------------------------------------------------------ *
 * UiButton —— { children, onClick, variant?, size?, disabled?, title?, icon? }
 * ------------------------------------------------------------------ */
function UiButton(props) {
  const p = props || {};
  const variant = p.variant === 'primary' || p.variant === 'danger' ? p.variant : 'ghost';
  const small = p.size === 'sm';
  const iconNode = apeIconNode(p.icon, small ? 13 : 15);
  const kids = [];
  if (iconNode) kids.push(h('span', { key: 'ape-btn-icon', className: 'ape-btn-icon' }, iconNode));
  if (p.children !== null && p.children !== undefined && p.children !== false) {
    kids.push(h('span', { key: 'ape-btn-label', className: 'ape-btn-label' }, p.children));
  }
  const title = typeof p.title === 'string' ? p.title : undefined;
  return h(Fragment, null,
    apeStyle(),
    h('button', {
      type: 'button',
      className: cx('ape-btn', 'ape-btn-' + variant, small && 'ape-btn-sm', p.block === true && 'ape-btn-block'),
      disabled: p.disabled === true,
      title: title,
      'aria-label': kids.length === 0 && typeof p.title === 'string' ? p.title : undefined,
      onClick: typeof p.onClick === 'function' ? p.onClick : undefined,
    }, kids.length > 0 ? kids : null));
}

/* ------------------------------------------------------------------ *
 * UiInput —— { value, onChange(string), placeholder?, disabled?, type?, onKeyDown?, autoFocus? }
 * 额外（向后兼容的可选能力）：ref / inputRef 指向内部 <input>，便于把光标插到指定位置。
 * ------------------------------------------------------------------ */
const UiInput = apeForwardRef(function UiInput(props, ref) {
  const p = props || {};
  const localRef = useRef(null);
  const innerRef = p.inputRef && typeof p.inputRef === 'object' ? p.inputRef : localRef;
  const setRef = useMemo(function () { return apeMergeRefs(innerRef, ref); }, [innerRef, ref]);
  const disabled = p.disabled === true;
  const readOnly = p.readOnly === true;
  return h(Fragment, null,
    apeStyle(),
    h('div', {
      className: cx('ape-input-wrap', disabled && 'ape-is-disabled', readOnly && 'ape-readonly'),
    },
    h('input', {
      ref: setRef,
      className: 'ape-input',
      type: typeof p.type === 'string' && p.type !== '' ? p.type : 'text',
      value: apeStr(p.value, ''),
      placeholder: typeof p.placeholder === 'string' ? p.placeholder : undefined,
      disabled: disabled,
      readOnly: readOnly,
      min: p.min === undefined ? undefined : p.min,
      max: p.max === undefined ? undefined : p.max,
      step: p.step === undefined ? undefined : p.step,
      name: typeof p.name === 'string' ? p.name : undefined,
      autoFocus: p.autoFocus === true,
      spellCheck: p.spellCheck === undefined ? false : p.spellCheck === true,
      'aria-label': typeof p.ariaLabel === 'string' ? p.ariaLabel : undefined,
      onChange: function (event) {
        if (typeof p.onChange === 'function') p.onChange(apeStr(event && event.target ? event.target.value : '', ''));
      },
      onKeyDown: typeof p.onKeyDown === 'function' ? p.onKeyDown : undefined,
      onBlur: typeof p.onBlur === 'function' ? p.onBlur : undefined,
      onFocus: typeof p.onFocus === 'function' ? p.onFocus : undefined,
      onInput: typeof p.onInput === 'function' ? p.onInput : undefined,
    })));
});
UiInput.displayName = 'UiInput';

/* ------------------------------------------------------------------ *
 * UiTextarea —— { value, onChange(string), rows?, placeholder?, disabled? }
 * 额外：ref / inputRef 指向内部 <textarea>（编辑模式插入 {{ $ }} 占位要用）。
 * ------------------------------------------------------------------ */
const UiTextarea = apeForwardRef(function UiTextarea(props, ref) {
  const p = props || {};
  const localRef = useRef(null);
  const innerRef = p.inputRef && typeof p.inputRef === 'object' ? p.inputRef : localRef;
  const setRef = useMemo(function () { return apeMergeRefs(innerRef, ref); }, [innerRef, ref]);
  const disabled = p.disabled === true;
  const rows = clamp(apeNum(p.rows, 3), 1, 40);
  const value = apeStr(p.value, '');
  // 可选语法高亮：`highlight(text)` 返回一组只带背景的节点，铺在透明的 textarea 底下。
  // <textarea> 没有给局部文字上色的能力，所以匹配片段放在这一层里上色，文字本身仍由
  // textarea 绘制 —— 两层的字符必须逐一对齐，因此 highlighter 只许切分、不许增删字符。
  const highlight = typeof p.highlight === 'function' ? p.highlight : null;
  const layerRef = useRef(null);
  const onScroll = function (event) {
    const layer = layerRef.current;
    const target = event && event.target ? event.target : null;
    if (!layer || !target) return;
    layer.scrollTop = target.scrollTop;
    layer.scrollLeft = target.scrollLeft;
  };
  const field = h('textarea', {
    ref: setRef,
    className: cx('ape-textarea', disabled && 'ape-is-disabled'),
    rows: rows,
    value: value,
    placeholder: typeof p.placeholder === 'string' ? p.placeholder : undefined,
    disabled: disabled,
    readOnly: p.readOnly === true,
    autoFocus: p.autoFocus === true,
    spellCheck: p.spellCheck === undefined ? false : p.spellCheck === true,
    wrap: 'soft',
    'aria-label': typeof p.ariaLabel === 'string' ? p.ariaLabel : undefined,
    onChange: function (event) {
      if (typeof p.onChange === 'function') p.onChange(apeStr(event && event.target ? event.target.value : '', ''));
    },
    onKeyDown: typeof p.onKeyDown === 'function' ? p.onKeyDown : undefined,
    onBlur: typeof p.onBlur === 'function' ? p.onBlur : undefined,
    onSelect: typeof p.onSelect === 'function' ? p.onSelect : undefined,
    onScroll: highlight ? onScroll : undefined,
  });
  if (!highlight) return h(Fragment, null, apeStyle(), field);
  return h(Fragment, null,
    apeStyle(),
    h('div', { className: 'ape-textarea-hl' },
      h('div', {
        className: 'ape-textarea-hl-layer',
        'aria-hidden': 'true',
        ref: layerRef,
      }, highlight(value)),
      field));
});
UiTextarea.displayName = 'UiTextarea';

/* ------------------------------------------------------------------ *
 * UiSelect —— { value, onChange(string), options, disabled?, multiple? }
 * multiple=true 时 onChange 给的是选中的值数组（单选的签名严格是 string）。
 * ------------------------------------------------------------------ */
function UiSelect(props) {
  const p = props || {};
  const options = apeOptions(p.options);
  const multiple = p.multiple === true;
  const disabled = p.disabled === true;
  const value = multiple ? apeArr(p.value).map(apeScalar) : apeScalar(p.value);
  const optionNodes = [];
  if (options.length === 0 && !multiple) {
    optionNodes.push(h('option', { key: 'ape-empty-opt', value: '' }, '（无可选项）'));
  } else {
    for (let i = 0; i < options.length; i += 1) {
      optionNodes.push(h('option', {
        key: 'ape-opt-' + i,
        value: apeScalar(options[i].value),
        disabled: options[i].disabled === true,
      }, options[i].label));
    }
  }
  return h(Fragment, null,
    apeStyle(),
    h('div', {
      className: cx('ape-select-wrap', multiple && 'ape-select-multi-wrap', disabled && 'ape-is-disabled'),
    },
    h('select', {
      className: cx('ape-select', multiple && 'ape-select-multi'),
      value: value,
      disabled: disabled,
      multiple: multiple,
      size: multiple ? clamp(options.length > 0 ? options.length : 3, 2, 8) : undefined,
      'aria-label': typeof p.ariaLabel === 'string' ? p.ariaLabel : undefined,
      title: typeof p.title === 'string' ? p.title : undefined,
      style: multiple ? { minHeight: clamp((options.length > 0 ? options.length : 3) * 20 + 8, 60, 176) } : undefined,
      onChange: function (event) {
        if (typeof p.onChange !== 'function') return;
        const target = event && event.target ? event.target : null;
        if (!target) return;
        if (multiple) {
          const picked = [];
          const list = target.options ? target.options : [];
          for (let i = 0; i < list.length; i += 1) {
            if (list[i].selected) picked.push(apeMatchValue(options, apeStr(list[i].value, '')));
          }
          p.onChange(picked);
        } else {
          p.onChange(apeMatchValue(options, apeStr(target.value, '')));
        }
      },
    }, optionNodes),
    multiple ? null : h('span', { className: 'ape-select-caret' }, h(Icon, { name: 'chevron-down', size: 14 }))));
}

/* ------------------------------------------------------------------ *
 * UiSwitch —— { checked, onChange(bool), disabled?, label? }
 * ------------------------------------------------------------------ */
function UiSwitch(props) {
  const p = props || {};
  const checked = p.checked === true;
  const disabled = p.disabled === true;
  const label = typeof p.label === 'string' || typeof p.label === 'number' ? String(p.label) : '';
  const toggle = function () {
    if (disabled) return;
    if (typeof p.onChange === 'function') p.onChange(!checked);
  };
  return h(Fragment, null,
    apeStyle(),
    h('div', { className: 'ape-switch-field' },
      h('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': checked ? 'true' : 'false',
        'aria-label': label || (typeof p.title === 'string' ? p.title : undefined),
        className: 'ape-switch',
        disabled: disabled,
        title: typeof p.title === 'string' ? p.title : undefined,
        onClick: toggle,
      }, h('span', { className: 'ape-switch-thumb' })),
      label ? h('span', { className: 'ape-switch-label', onClick: toggle }, label) : null));
}

/* ------------------------------------------------------------------ *
 * UiSlider —— { value, onChange(number), min, max, step, disabled? }
 * ------------------------------------------------------------------ */
function UiSlider(props) {
  const p = props || {};
  const min = apeNum(p.min, 0);
  let max = apeNum(p.max, 100);
  if (!(max > min)) max = min + 1;
  let step = apeNum(p.step, 1);
  if (!(step > 0)) step = 1;
  const disabled = p.disabled === true;
  const value = clamp(apeNum(p.value, min), min, max);
  return h(Fragment, null,
    apeStyle(),
    h('div', { className: 'ape-slider' },
      h('input', {
        type: 'range',
        min: min,
        max: max,
        step: step,
        value: value,
        disabled: disabled,
        'aria-label': typeof p.ariaLabel === 'string' ? p.ariaLabel : undefined,
        onChange: function (event) {
          if (typeof p.onChange !== 'function') return;
          const next = clamp(apeNum(event && event.target ? event.target.value : min, min), min, max);
          p.onChange(next);
        },
      }),
      h('span', { className: 'ape-slider-value' }, String(Math.round(value * 1000) / 1000))));
}

/* ------------------------------------------------------------------ *
 * UiCheckGroup —— { value: any[], onChange(arr), options }
 * ------------------------------------------------------------------ */
function UiCheckGroup(props) {
  const p = props || {};
  const options = apeOptions(p.options);
  const selected = apeArr(p.value);
  const disabled = p.disabled === true;
  const items = [];
  for (let i = 0; i < options.length; i += 1) {
    const option = options[i];
    const checked = selected.indexOf(option.value) >= 0;
    const key = apeScalar(option.value) + '#' + i;
    items.push(h('label', {
      key: 'ape-check-' + key,
      className: 'ape-opt',
      title: option.title,
    },
    h('input', {
      type: 'checkbox',
      checked: checked,
      disabled: disabled || option.disabled === true,
      onChange: function () {
        if (typeof p.onChange !== 'function') return;
        const next = [];
        for (let j = 0; j < selected.length; j += 1) {
          if (selected[j] !== option.value) next.push(selected[j]);
        }
        if (!checked) next.push(option.value);
        p.onChange(next);
      },
    }),
    h('span', { className: 'ape-opt-text' }, option.label)));
  }
  return h(Fragment, null,
    apeStyle(),
    h('div', { className: cx('ape-opt-group', p.vertical === true && 'ape-opt-group-vertical') },
      items.length > 0 ? items : h('span', { className: 'ape-hint' }, '无可选项')));
}

/* ------------------------------------------------------------------ *
 * UiRadioGroup —— { value, onChange, options }
 * ------------------------------------------------------------------ */
function UiRadioGroup(props) {
  const p = props || {};
  const options = apeOptions(p.options);
  const disabled = p.disabled === true;
  const nameRef = useRef(null);
  if (nameRef.current === null) nameRef.current = apeUid('ape-radio');
  const current = apeScalar(p.value);
  const items = [];
  for (let i = 0; i < options.length; i += 1) {
    const option = options[i];
    const key = apeScalar(option.value) + '#' + i;
    items.push(h('label', {
      key: 'ape-radio-' + key,
      className: 'ape-opt',
      title: option.title,
    },
    h('input', {
      type: 'radio',
      name: typeof p.name === 'string' ? p.name : nameRef.current,
      checked: apeScalar(option.value) === current,
      disabled: disabled || option.disabled === true,
      onChange: function () {
        if (typeof p.onChange === 'function') p.onChange(option.value);
      },
    }),
    h('span', { className: 'ape-opt-text' }, option.label)));
  }
  return h(Fragment, null,
    apeStyle(),
    h('div', { className: cx('ape-opt-group', p.vertical === true && 'ape-opt-group-vertical'), role: 'radiogroup' },
      items.length > 0 ? items : h('span', { className: 'ape-hint' }, '无可选项')));
}

/* ------------------------------------------------------------------ *
 * UiSearch —— { value, onChange(string), placeholder? }
 * ------------------------------------------------------------------ */
function UiSearch(props) {
  const p = props || {};
  const value = apeStr(p.value, '');
  const disabled = p.disabled === true;
  return h(Fragment, null,
    apeStyle(),
    h('div', { className: cx('ape-input-wrap', disabled && 'ape-is-disabled') },
      h('span', { className: 'ape-input-icon' }, h(Icon, { name: 'search', size: 14 })),
      h('input', {
        className: 'ape-input',
        type: 'text',
        value: value,
        disabled: disabled,
        autoFocus: p.autoFocus === true,
        placeholder: typeof p.placeholder === 'string' ? p.placeholder : '搜索',
        'aria-label': typeof p.ariaLabel === 'string' ? p.ariaLabel : '搜索',
        onChange: function (event) {
          if (typeof p.onChange === 'function') p.onChange(apeStr(event && event.target ? event.target.value : '', ''));
        },
        onKeyDown: typeof p.onKeyDown === 'function' ? p.onKeyDown : undefined,
      }),
      value !== '' && !disabled
        ? h('button', {
          type: 'button',
          className: 'ape-input-clear',
          title: '清空',
          'aria-label': '清空',
          onClick: function () { if (typeof p.onChange === 'function') p.onChange(''); },
        }, h(Icon, { name: 'close', size: 12 }))
        : null));
}

/* ------------------------------------------------------------------ *
 * UiBadge —— { children, tone?: 'default'|'ok'|'warn'|'err' }
 * ------------------------------------------------------------------ */
function UiBadge(props) {
  const p = props || {};
  const tone = p.tone === 'ok' || p.tone === 'warn' || p.tone === 'err' ? p.tone : 'default';
  const iconNode = apeIconNode(p.icon, 11);
  return h(Fragment, null,
    apeStyle(),
    h('span', {
      className: cx('ape-badge', tone !== 'default' && 'ape-badge-' + tone),
      title: typeof p.title === 'string' ? p.title : undefined,
    },
    iconNode ? h('span', { className: 'ape-icon' }, iconNode) : null,
    p.children === null || p.children === undefined ? null : h('span', null, p.children)));
}

/* ------------------------------------------------------------------ *
 * UiEmpty —— { title, hint? }
 * ------------------------------------------------------------------ */
function UiEmpty(props) {
  const p = props || {};
  const title = p.title === null || p.title === undefined || p.title === '' ? '暂无内容' : p.title;
  return h(Fragment, null,
    apeStyle(),
    h('div', { className: 'ape-empty' },
      h('span', { className: 'ape-empty-icon' }, apeIconNode(p.icon !== undefined ? p.icon : 'preset', 20)),
      h('div', { className: 'ape-empty-title' }, title),
      p.hint === null || p.hint === undefined || p.hint === '' ? null : h('div', { className: 'ape-empty-hint' }, p.hint),
      p.children === null || p.children === undefined ? null : h('div', { className: 'ape-empty-hint' }, p.children)));
}

/* ------------------------------------------------------------------ *
 * UiSpinner —— {}
 * ------------------------------------------------------------------ */
function UiSpinner(props) {
  const p = props || {};
  const label = typeof p.label === 'string' ? p.label : '加载中';
  return h(Fragment, null,
    apeStyle(),
    h('span', { className: 'ape-row', role: 'status', 'aria-label': label },
      h('span', { className: 'ape-spinner' }),
      typeof p.label === 'string' ? h('span', { className: 'ape-hint' }, p.label) : null));
}

/* ------------------------------------------------------------------ *
 * UiModal —— { open, title, onClose, children, footer? }
 * Escape 关闭、遮罩点击关闭、打开时聚焦卡片、关闭后焦点回到原处、Tab 焦点环。
 * ------------------------------------------------------------------ */
function UiModal(props) {
  const p = props || {};
  const open = p.open === true;
  const cardRef = useRef(null);
  const lastActiveRef = useRef(null);
  const closeRef = useRef(p.onClose);
  closeRef.current = p.onClose;

  useEffect(function () {
    if (!open) return undefined;
    const doc = typeof document === 'undefined' ? null : document;
    if (doc && doc.activeElement) lastActiveRef.current = doc.activeElement;
    const onKey = function (event) {
      if (!event || event.key !== 'Escape') return;
      if (typeof closeRef.current !== 'function') return;
      event.stopPropagation();
      closeRef.current();
    };
    if (doc) doc.addEventListener('keydown', onKey, true);
    let timer = null;
    if (typeof window !== 'undefined' && window.setTimeout) {
      timer = window.setTimeout(function () {
        if (cardRef.current && typeof cardRef.current.focus === 'function') cardRef.current.focus();
      }, 0);
    }
    return function () {
      if (doc) doc.removeEventListener('keydown', onKey, true);
      if (timer !== null && typeof window !== 'undefined' && window.clearTimeout) window.clearTimeout(timer);
      const back = lastActiveRef.current;
      if (back && typeof back.focus === 'function') {
        try { back.focus(); } catch (error) { /* 元素已被卸载：忽略 */ }
      }
    };
  }, [open]);

  if (!open) return null;

  const title = typeof p.title === 'string' ? p.title : (p.title === null || p.title === undefined ? '' : String(p.title));

  const onCardKeyDown = function (event) {
    if (!event || event.key !== 'Tab') return;
    const root = cardRef.current;
    if (!root) return;
    const focusables = apeFocusables(root);
    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = typeof document === 'undefined' ? null : document.activeElement;
    if (event.shiftKey) {
      if (active === first || !root.contains(active)) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last || !root.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  };

  return h(Fragment, null,
    apeStyle(),
    h('div', { className: 'ape-modal-root' },
      h('div', {
        className: 'ape-modal-mask',
        'aria-hidden': 'true',
        onClick: function () { if (typeof closeRef.current === 'function') closeRef.current(); },
      }),
      h('div', {
        ref: cardRef,
        className: 'ape-modal-card',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': title || '对话框',
        tabIndex: -1,
        onKeyDown: onCardKeyDown,
      },
      h('div', { className: 'ape-modal-head' },
        h('h2', { className: 'ape-modal-title' }, title),
        // Right-aligned header slot, between the title and the close control.
        p.actions === null || p.actions === undefined
          ? null
          : h('div', { className: 'ape-modal-actions' }, p.actions),
        typeof p.onClose === 'function'
          ? h('button', {
            type: 'button',
            className: 'ape-modal-close',
            title: '关闭',
            'aria-label': '关闭',
            onClick: p.onClose,
          }, h(Icon, { name: 'close', size: 14 }))
          : null),
      h('div', { className: 'ape-modal-body' }, p.children),
      p.footer === null || p.footer === undefined ? null : h('div', { className: 'ape-modal-foot' }, p.footer))));
}

/* ------------------------------------------------------------------ *
 * UiField —— { label, info?, error?, children, required? }
 * 额外：actions（标签右侧的槽，30-form 用它显示控件类型/字段名）。
 * error 与 info 同时存在时只显示 error，避免两行说明。
 * ------------------------------------------------------------------ */
function UiField(props) {
  const p = props || {};
  const label = p.label === null || p.label === undefined ? '' : p.label;
  const required = p.required === true;
  const error = typeof p.error === 'string' && p.error !== '' ? p.error : '';
  const info = typeof p.info === 'string' ? p.info : '';
  const head = label !== '' || required || (p.actions !== null && p.actions !== undefined)
    ? h('div', { className: 'ape-field-head' },
      label !== '' ? h('span', { className: 'ape-field-label' }, label) : null,
      required ? h('span', { className: 'ape-field-req', title: '必填' }, '*') : null,
      p.actions === null || p.actions === undefined ? null : h('span', { className: 'ape-field-actions' }, p.actions))
    : null;
  return h(Fragment, null,
    apeStyle(),
    h('div', { className: 'ape-field' },
      head,
      h('div', { className: 'ape-field-body' }, p.children),
      error !== '' ? h('div', { className: 'ape-field-error' }, error) : null,
      error === '' && info !== '' ? h('div', { className: 'ape-field-info' }, info) : null));
}

/* ------------------------------------------------------------------ *
 * UiSection —— { title, actions?, children }
 * ------------------------------------------------------------------ */
function UiSection(props) {
  const p = props || {};
  const title = p.title === null || p.title === undefined ? '' : p.title;
  return h(Fragment, null,
    apeStyle(),
    h('div', { className: 'ape-section' },
      title !== '' || (p.actions !== null && p.actions !== undefined)
        ? h('div', { className: 'ape-section-head' },
          h('span', { className: 'ape-section-title' }, title),
          p.actions === null || p.actions === undefined ? null : h('span', { className: 'ape-section-actions' }, p.actions))
        : null,
      h('div', { className: 'ape-stack' }, p.children)));
}

/* ------------------------------------------------------------------ *
 * UiRow —— { children, onClick?, active?, right? }
 * 有 right 槽（也就是行里还有按钮）时不加 role="button"，避免嵌套交互元素。
 * ------------------------------------------------------------------ */
function UiRow(props) {
  const p = props || {};
  const clickable = typeof p.onClick === 'function';
  const hasRight = p.right !== null && p.right !== undefined;
  const interactive = clickable && !hasRight;
  const onKeyDown = clickable
    ? function (event) {
      if (!event) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      p.onClick(event);
    }
    : undefined;
  return h(Fragment, null,
    apeStyle(),
    h('div', {
      className: cx('ape-listrow', clickable && 'ape-listrow-click', p.active === true && 'ape-listrow-active'),
      onClick: clickable ? p.onClick : undefined,
      onKeyDown: onKeyDown,
      role: interactive ? 'button' : undefined,
      tabIndex: interactive ? 0 : undefined,
      'aria-pressed': interactive ? (p.active === true ? 'true' : 'false') : undefined,
      title: typeof p.title === 'string' ? p.title : undefined,
    },
    h('div', { className: 'ape-listrow-main' }, p.children),
    hasRight ? h('div', { className: 'ape-listrow-right' }, p.right) : null));
}

/* ------------------------------------------------------------------ *
 * useToast —— { show(msg, tone?), node }
 * node 必须由调用方渲染（通常是 70-shell.js 的根组件）。
 * ------------------------------------------------------------------ */
function useToast() {
  const [items, setItems] = useState([]);
  const seqRef = useRef(0);
  const timersRef = useRef([]);

  useEffect(function () {
    return function () {
      const timers = timersRef.current;
      for (let i = 0; i < timers.length; i += 1) {
        try {
          if (typeof window !== 'undefined' && window.clearTimeout) window.clearTimeout(timers[i]);
        } catch (error) { /* 忽略 */ }
      }
      timersRef.current = [];
    };
  }, []);

  const show = useCallback(function (message, tone) {
    const text = message === null || message === undefined ? '' : String(message);
    const kind = tone === 'ok' || tone === 'err' || tone === 'info' ? tone : 'info';
    seqRef.current += 1;
    const id = seqRef.current;
    setItems(function (prev) {
      const next = apeArr(prev).concat([{ id: id, text: text, tone: kind }]);
      return next.length > 3 ? next.slice(next.length - 3) : next;
    });
    if (typeof window !== 'undefined' && window.setTimeout) {
      const timer = window.setTimeout(function () {
        setItems(function (prev) {
          const out = [];
          const list = apeArr(prev);
          for (let i = 0; i < list.length; i += 1) {
            if (list[i].id !== id) out.push(list[i]);
          }
          return out;
        });
      }, kind === 'err' ? 5200 : 2600);
      timersRef.current.push(timer);
    }
  }, []);

  const list = apeArr(items);
  let node = null;
  if (list.length > 0) {
    const rows = [];
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i];
      const tone = item.tone === 'ok' || item.tone === 'err' ? item.tone : 'info';
      rows.push(h('div', { key: 'ape-toast-' + item.id, className: cx('ape-toast', 'ape-toast-' + tone) },
        h('span', { className: 'ape-toast-icon' }, h(Icon, { name: tone === 'ok' ? 'check' : tone === 'err' ? 'alert' : 'info', size: 14 })),
        h('span', { className: 'ape-toast-text' }, item.text)));
    }
    node = h(Fragment, null, apeStyle(), h('div', { className: 'ape-toasts', role: 'status', 'aria-live': 'polite' }, rows));
  }

  return { show: show, node: node };
}

/* ------------------------------------------------------------------ *
 * Toolbar —— { children }（额外支持 right 槽，推到最右）
 * ------------------------------------------------------------------ */
function Toolbar(props) {
  const p = props || {};
  return h(Fragment, null,
    apeStyle(),
    h('div', { className: 'ape-toolbar' },
      p.children,
      p.right === null || p.right === undefined ? null : h('span', { className: 'ape-toolbar-right' }, p.right)));
}

/* ------------------------------------------------------------------ *
 * Segmented —— { value, onChange, options: {label,value,icon?}[] }
 * ------------------------------------------------------------------ */
function Segmented(props) {
  const p = props || {};
  const options = apeOptions(p.options);
  const items = [];
  for (let i = 0; i < options.length; i += 1) {
    const option = options[i];
    const selected = option.value === p.value;
    const iconNode = apeIconNode(option.icon, 13);
    items.push(h('button', {
      key: 'ape-seg-' + i,
      type: 'button',
      role: 'tab',
      'aria-selected': selected ? 'true' : 'false',
      className: 'ape-seg-item',
      disabled: option.disabled === true,
      title: option.title,
      onClick: function () {
        if (typeof p.onChange === 'function') p.onChange(option.value);
      },
    },
    iconNode ? h('span', { className: 'ape-seg-icon' }, iconNode) : null,
    h('span', null, option.label)));
  }
  return h(Fragment, null,
    apeStyle(),
    h('div', { className: 'ape-seg', role: 'tablist' },
      items.length > 0 ? items : h('span', { className: 'ape-hint' }, '无可选项')));
}

/* ============================ 20-api.js ============================ */
/* ------------------------------------------------------------------ *
 * The host API client. Every write goes through index.js; the browser half
 * never touches the filesystem and never mints a preset declaration itself.
 * ------------------------------------------------------------------ */

/** One JSON round trip against the host half, with the envelope unwrapped. */
async function apiRequest(method, path, body) {
  var init = { method: method };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  var response;
  try {
    response = await fetch(API_BASE + path, init);
  } catch (cause) {
    var netError = new Error('无法连接插件后端：' + (cause && cause.message ? cause.message : String(cause)));
    netError.code = 'network';
    throw netError;
  }
  var payload = null;
  try {
    payload = await response.json();
  } catch (cause) {
    payload = null;
  }
  if (!response.ok || !payload || payload.ok !== true) {
    var info = payload && payload.error ? payload.error : {};
    var error = new Error(info.message || ('请求失败 (HTTP ' + response.status + ')'));
    error.code = info.code || ('http-' + response.status);
    throw error;
  }
  return payload.data;
}

/**
 * Build the state a view renders, merging the host's stored definition with
 * the live roster the browser alone can read. The host's `dsh` block is a
 * placeholder; everything authoritative about the running deployment is
 * filled in here.
 * @param {object} ctx - the browser Cordis context.
 * @param {string|undefined} sessionId - the session the tab belongs to.
 * @returns {Promise<object>} the merged editor state.
 */
async function loadEditorState(ctx, sessionId) {
  var state = await Api.state();
  var dsh = { roster: [], defaultId: null, sessionPreset: null, sessionPresetLocked: false };
  var remote = ctx && ctx.remote;
  if (remote && remote.agentPresets && typeof remote.agentPresets.list === 'function') {
    try {
      var roster = await remote.agentPresets.list();
      dsh.roster = (roster && roster.presets) || [];
    } catch (error) {
      console.error('[agent-preset-editor] agentPresets.list failed', error);
    }
    var fallback = null;
    for (var i = 0; i < dsh.roster.length; i += 1) {
      if (dsh.roster[i].isDefault) { fallback = dsh.roster[i].id; break; }
    }
    dsh.defaultId = fallback;
  }
  // `sessions` is a declared dependency (see 99-epilogue.js): the inject-free
  // `ctx.get` read does not reach a reflect.provide service.
  var sessions = ctx ? ctx.sessions : undefined;
  if (sessionId !== undefined && sessionId !== null && sessions && sessions.list) {
    try {
      var snapshot = sessions.list.getSnapshot();
      var entry = snapshot && snapshot.byId ? snapshot.byId[sessionId] : undefined;
      if (entry) {
        dsh.sessionPreset = entry.agentPreset === undefined ? null : entry.agentPreset;
        // The roster records a broken composition; a session that already ran
        // a turn keeps the revision it started with. Neither field answers
        // "has this task started" outright — `agentPresets.select` does, and
        // the shell defers to its `agent-preset/locked` error.
        dsh.sessionPresetLocked = entry.turnCount !== undefined ? entry.turnCount > 0 : false;
      }
    } catch (error) {
      console.error('[agent-preset-editor] session lookup failed', error);
    }
  }
  state.dsh = dsh;
  return state;
}

/** Every host call the UI may make. */
const Api = {
  base: API_BASE,
  request: apiRequest,

  /** @returns {Promise<object>} the stored definitions, catalogues and values. */
  state() { return apiRequest('GET', '/state'); },
  /** @param {object} definition - the preset to store. */
  savePreset(definition) { return apiRequest('POST', '/preset/save', definition); },
  /** @param {string} id - the preset to remove. */
  deletePreset(id) { return apiRequest('POST', '/preset/delete', { id: id }); },
  /** @param {string} id - preset id. @param {object} values - tuned parameter values. */
  saveValues(id, values) { return apiRequest('POST', '/preset/values', { id: id, values: values }); },
  /** @param {string} id - the preset to publish as a DSH declaration. */
  applyPreset(id) { return apiRequest('POST', '/preset/apply', { id: id }); },
  /** @param {object} entry - the MCP catalogue entry. */
  saveMcp(entry) { return apiRequest('POST', '/mcp/save', entry); },
  /** @param {string} id - the MCP entry to remove. */
  deleteMcp(id) { return apiRequest('POST', '/mcp/delete', { id: id }); },
  /** @param {object} entry - the Skill catalogue entry. */
  saveSkill(entry) { return apiRequest('POST', '/skill/save', entry); },
  /** @param {string} id - the Skill entry to remove. */
  deleteSkill(id) { return apiRequest('POST', '/skill/delete', { id: id }); },
  /** @param {string} id - preset id. @param {object} values - the values to render with. */
  previewPrompt(id, values) { return apiRequest('POST', '/prompt/preview', { id: id, values: values }); },
};

/* ============================ 30-form.js ============================ */
/* ------------------------------------------------------------------ *
 * 低代码表单引擎（契约 §4）。
 *
 * 同样是「裸语句片段」：没有 import / export，没有 JSX。依赖 00-prelude.js 的绑定，
 * 以及 10-ui.js 的 UI 原语（Icon / UiInput / UiField / …）和那里的 APE_CSS 样式表。
 *
 * 设计原则：
 *  - 全部是纯函数 + 一个受控组件，值不落地在本地 state（除校验结果），父组件说了算；
 *  - rule / value / params 任一为 null、字段缺失、类型不认识，都只是少渲染一点，绝不抛错。
 * ------------------------------------------------------------------ */

/* rule.type → ParamSpec.type（契约 §4.2 ↔ §2.4） */
const LC_PARAM_TYPE = {
  input: 'text',
  textarea: 'textarea',
  number: 'number',
  select: 'select',
  radio: 'radio',
  checkbox: 'checkbox',
  switch: 'switch',
  slider: 'slider',
};

/* ParamSpec.type → rule.type（反向） */
const LC_RULE_TYPE = {
  text: 'input',
  textarea: 'textarea',
  number: 'number',
  select: 'select',
  radio: 'radio',
  checkbox: 'checkbox',
  switch: 'switch',
  slider: 'slider',
};

/* 已知控件类型（契约 §4.2 全表；不在表内的按「未知」处理） */
const LC_TYPES = ['input', 'textarea', 'number', 'select', 'radio', 'checkbox', 'switch', 'slider', 'divider', 'title', 'prompt-preview'];

/* ParamSpec.name / {{ $name }} 的合法形状（契约 §2.4） */
const LC_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/* ------------------------------------------------------------------ *
 * rule / value 的归一化工具
 * ------------------------------------------------------------------ */

/** rule 归一化成数组（顺手兼容「只给一条 rule」的写法）。 */
function lcRules(rule) {
  if (Array.isArray(rule)) {
    const out = [];
    for (let i = 0; i < rule.length; i += 1) {
      if (rule[i] && typeof rule[i] === 'object') out.push(rule[i]);
    }
    return out;
  }
  if (rule && typeof rule === 'object') return [rule];
  return [];
}

/** rule 的透传 props（缺省给空对象，调用方不用再判空）。 */
function lcProps(rule) {
  return rule && rule.props && typeof rule.props === 'object' ? rule.props : {};
}

/** 从 rule.props 里取值，缺省用 fallback。 */
function lcProp(rule, name, fallback) {
  const bag = lcProps(rule);
  return bag[name] === undefined ? fallback : bag[name];
}

/** 栅格宽度（24 栅格制，缺省 24）。 */
function lcSpan(rule) {
  const col = rule && rule.col && typeof rule.col === 'object' ? rule.col : null;
  const span = col ? apeNum(col.span, 24) : 24;
  return clamp(Math.round(span), 1, 24);
}

/** rule.validate 归一化成数组。 */
function lcChecks(rule) {
  const raw = rule ? rule.validate : null;
  if (Array.isArray(raw)) {
    const out = [];
    for (let i = 0; i < raw.length; i += 1) {
      if (raw[i] && typeof raw[i] === 'object') out.push(raw[i]);
    }
    return out;
  }
  if (raw && typeof raw === 'object') return [raw];
  return [];
}

/** 是否声明为必填。 */
function lcRequired(rule) {
  const checks = lcChecks(rule);
  for (let i = 0; i < checks.length; i += 1) {
    if (checks[i].required === true) return true;
  }
  return false;
}

/** 「空」的定义：null / undefined / '' / []。注意 0 和 false 是有值的。 */
function lcEmpty(value) {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** 把「存下来的值」掰成控件期望的形状（checkbox → 数组，switch → 布尔，number → 数字）。 */
function lcCoerce(rule, value) {
  const type = rule && typeof rule.type === 'string' ? rule.type : 'input';
  if (type === 'checkbox') {
    if (Array.isArray(value)) return value.slice();
    if (value === null || value === undefined || value === '') return [];
    return [value];
  }
  if (type === 'switch') {
    if (typeof value === 'boolean') return value;
    if (value === null || value === undefined || value === '' || value === 0 || value === '0' || value === 'false') return false;
    if (value === 1 || value === '1' || value === 'true') return true;
    return value !== false;
  }
  if (type === 'number' || type === 'slider') {
    if (value === null || value === undefined || value === '') {
      return type === 'slider' ? apeNum(lcProp(rule, 'min', undefined), 0) : '';
    }
    const n = apeNum(value, NaN);
    return Number.isFinite(n) ? n : '';
  }
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return '';
  return value;
}

/** rule 的默认值（已经是控件期望的形状）。 */
function lcDefault(rule) {
  return lcCoerce(rule, rule ? rule.value : undefined);
}

/** 取某条 rule 在当前值集合里的当前值，缺失时落到 rule.value。 */
function lcValueOf(rule, values) {
  const field = rule && typeof rule.field === 'string' ? rule.field.trim() : '';
  if (field && values && typeof values === 'object' && values[field] !== undefined) {
    return lcCoerce(rule, values[field]);
  }
  return lcDefault(rule);
}

/** 把 options 洗成 ParamSpec 允许的 {label,value}[]。 */
function lcPlainOptions(list) {
  const options = apeOptions(list);
  const out = [];
  for (let i = 0; i < options.length; i += 1) {
    out.push({ label: options[i].label, value: options[i].value });
  }
  return out;
}

/** 校验错误文案。 */
function lcMessage(check, rule, field) {
  if (typeof check.message === 'string' && check.message !== '') return check.message;
  const label = rule && typeof rule.title === 'string' && rule.title !== '' ? rule.title : field;
  if (check.required === true) return label + ' 必填';
  if (check.pattern) return label + ' 格式不正确';
  if (check.min !== undefined || check.max !== undefined) return label + ' 超出取值范围';
  if (check.minLength !== undefined || check.maxLength !== undefined) return label + ' 长度不正确';
  return label + ' 不合法';
}

/* ------------------------------------------------------------------ *
 * 契约 §4.3：取值 / 设值 / 校验 / 互转
 * ------------------------------------------------------------------ */

/**
 * 由 rule 取一份值对象。
 * @param {Array|object} rule - Rule[]。
 * @returns {object} { field: value }，checkbox 是数组、switch 是布尔。
 */
function valuesFromRule(rule) {
  const out = {};
  const list = lcRules(rule);
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    const field = typeof item.field === 'string' ? item.field.trim() : '';
    if (!field) continue;
    out[field] = lcDefault(item);
  }
  return out;
}

/**
 * 校验：目前支持 required / pattern / min / max / minLength / maxLength / validator。
 * @param {Array|object} rule - Rule[]。
 * @param {object} value - 当前值。
 * @returns {{ok: boolean, errors: object}} errors 是 { field: 文案 }。
 */
function validateRule(rule, value) {
  const errors = {};
  const list = lcRules(rule);
  const values = value && typeof value === 'object' ? value : {};
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    const field = typeof item.field === 'string' ? item.field.trim() : '';
    if (!field) continue;
    const checks = lcChecks(item);
    if (checks.length === 0) continue;
    const current = values[field] !== undefined ? lcCoerce(item, values[field]) : lcDefault(item);
    const empty = lcEmpty(current);
    for (let j = 0; j < checks.length; j += 1) {
      const check = checks[j];
      if (!check || typeof check !== 'object') continue;
      if (check.required === true && empty) {
        errors[field] = lcMessage(check, item, field);
        break;
      }
      if (empty) continue;
      let failed = false;
      if (typeof check.pattern === 'string' && check.pattern !== '') {
        try {
          if (!new RegExp(check.pattern).test(String(current))) failed = true;
        } catch (error) { /* 正则写错不阻塞用户 */ }
      }
      if (!failed && typeof check.min === 'number' && Number(current) < check.min) failed = true;
      if (!failed && typeof check.max === 'number' && Number(current) > check.max) failed = true;
      if (!failed && typeof check.minLength === 'number' && String(current).length < check.minLength) failed = true;
      if (!failed && typeof check.maxLength === 'number' && String(current).length > check.maxLength) failed = true;
      if (!failed && typeof check.validator === 'function') {
        try {
          const result = check.validator(current, values);
          if (result === false) failed = true;
          else if (typeof result === 'string' && result !== '') {
            errors[field] = result;
            break;
          }
        } catch (error) { /* 自定义校验自己抛错不算表单错误 */ }
      }
      if (failed) {
        errors[field] = lcMessage(check, item, field);
        break;
      }
    }
  }
  return { ok: Object.keys(errors).length === 0, errors: errors };
}

/** ParamSpec.default → rule.value。 */
function lcSpecDefault(spec, type) {
  const raw = spec ? spec.default : undefined;
  if (type === 'checkbox') {
    if (Array.isArray(raw)) return raw.slice();
    if (raw === null || raw === undefined || raw === '') return [];
    return [raw];
  }
  if (type === 'switch') return raw === true || raw === 'true' || raw === 1 || raw === '1';
  if (type === 'number' || type === 'slider') {
    const n = apeNum(raw, NaN);
    if (Number.isFinite(n)) return n;
    return type === 'slider' ? apeNum(spec ? spec.min : undefined, 0) : '';
  }
  if (raw === null || raw === undefined || typeof raw === 'object') return '';
  return raw;
}

/**
 * 由 ParamSpec[] 生成默认 rule（编辑器与用户都用它兜底）。
 * @param {Array} params - ParamSpec[]。
 * @returns {Array} Rule[]。
 */
function ruleFromParams(params) {
  const list = Array.isArray(params) ? params : [];
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    const spec = list[i];
    if (!spec || typeof spec !== 'object') continue;
    const field = typeof spec.name === 'string' ? spec.name.trim() : '';
    if (!field) continue;
    const type = LC_RULE_TYPE[typeof spec.type === 'string' ? spec.type : ''] || 'input';
    const label = typeof spec.label === 'string' && spec.label !== '' ? spec.label : field;
    const rule = {
      type: type,
      field: field,
      title: label,
      value: lcSpecDefault(spec, type),
      info: typeof spec.description === 'string' ? spec.description : '',
      props: {},
      validate: spec.required === true ? [{ required: true, message: label + ' 必填' }] : [],
      col: { span: 24 },
    };
    const options = lcPlainOptions(spec.options);
    if (options.length > 0) rule.props.options = options;
    const min = apeNum(spec.min, NaN);
    const max = apeNum(spec.max, NaN);
    const step = apeNum(spec.step, NaN);
    if (type === 'number' || type === 'slider') {
      if (Number.isFinite(min)) rule.props.min = min;
      if (Number.isFinite(max)) rule.props.max = max;
      if (Number.isFinite(step)) rule.props.step = step;
    }
    if (type === 'textarea') {
      const rows = apeNum(spec.rows, NaN);
      if (Number.isFinite(rows)) rule.props.rows = clamp(Math.round(rows), 1, 40);
    }
    out.push(rule);
  }
  return out;
}

/**
 * 由 rule 反推 ParamSpec[]（保存预设时同步 params 字段）。
 * 无 field 的项（divider / title / prompt-preview）跳过；非法或重名的 field 跳过。
 * @param {Array|object} rule - Rule[]。
 * @returns {Array} ParamSpec[]。
 */
function paramsFromRule(rule) {
  const list = lcRules(rule);
  const out = [];
  const seen = {};
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    const field = typeof item.field === 'string' ? item.field.trim() : '';
    if (!field) continue;
    if (!LC_NAME_RE.test(field)) continue;
    if (seen[field] === true) continue;
    seen[field] = true;
    const type = LC_PARAM_TYPE[typeof item.type === 'string' ? item.type : ''] || 'text';
    const spec = {
      name: field,
      label: typeof item.title === 'string' && item.title !== '' ? item.title : field,
      type: type,
      default: lcDefault(item),
    };
    const options = lcPlainOptions(lcProp(item, 'options', null));
    if (options.length > 0) spec.options = options;
    if (type === 'number' || type === 'slider') {
      const min = apeNum(lcProp(item, 'min', undefined), NaN);
      const max = apeNum(lcProp(item, 'max', undefined), NaN);
      const step = apeNum(lcProp(item, 'step', undefined), NaN);
      if (Number.isFinite(min)) spec.min = min;
      if (Number.isFinite(max)) spec.max = max;
      if (Number.isFinite(step)) spec.step = step;
    }
    if (typeof item.info === 'string' && item.info !== '') spec.description = item.info;
    if (lcRequired(item)) spec.required = true;
    out.push(spec);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 渲染：rule → 控件
 * ------------------------------------------------------------------ */

/** 数字输入的中间态（'-'、'1e' 这种半成品原样保留，不强行变 NaN）。 */
function lcNumber(raw) {
  if (raw === null || raw === undefined || raw === '') return '';
  const n = apeNum(raw, NaN);
  return Number.isFinite(n) ? n : String(raw);
}

/** 按 rule.type 生成控件。未知类型给提示条，不抛错。 */
function lcControl(rule, type, current, setValue, disabled) {
  const bagDisabled = disabled === true || lcProp(rule, 'disabled', false) === true;
  const rawPlaceholder = lcProp(rule, 'placeholder', '');
  const placeholder = typeof rawPlaceholder === 'string' ? rawPlaceholder : '';
  switch (type) {
    case 'input':
      return h(UiInput, {
        value: apeStr(current, ''),
        onChange: setValue,
        placeholder: placeholder,
        disabled: bagDisabled,
        type: 'text',
      });
    case 'textarea':
      return h(UiTextarea, {
        value: apeStr(current, ''),
        onChange: setValue,
        placeholder: placeholder,
        disabled: bagDisabled,
        rows: apeNum(lcProp(rule, 'rows', undefined), 3),
      });
    case 'number':
      return h(UiInput, {
        value: current === '' || current === null || current === undefined ? '' : apeStr(current, ''),
        onChange: function (raw) { setValue(lcNumber(raw)); },
        placeholder: placeholder,
        disabled: bagDisabled,
        type: 'number',
        min: lcProp(rule, 'min', undefined),
        max: lcProp(rule, 'max', undefined),
        step: lcProp(rule, 'step', undefined),
      });
    case 'select':
      return h(UiSelect, {
        value: current,
        onChange: setValue,
        options: apeOptions(lcProp(rule, 'options', null)),
        disabled: bagDisabled,
        multiple: lcProp(rule, 'multiple', false) === true,
      });
    case 'radio':
      return h(UiRadioGroup, {
        value: current,
        onChange: setValue,
        options: apeOptions(lcProp(rule, 'options', null)),
        disabled: bagDisabled,
        vertical: lcProp(rule, 'vertical', false) === true,
      });
    case 'checkbox':
      return h(UiCheckGroup, {
        value: Array.isArray(current) ? current : [],
        onChange: setValue,
        options: apeOptions(lcProp(rule, 'options', null)),
        disabled: bagDisabled,
        vertical: lcProp(rule, 'vertical', false) === true,
      });
    case 'switch':
      return h(UiSwitch, {
        checked: current === true,
        onChange: setValue,
        disabled: bagDisabled,
      });
    case 'slider':
      return h(UiSlider, {
        value: current,
        onChange: setValue,
        min: lcProp(rule, 'min', undefined),
        max: lcProp(rule, 'max', undefined),
        step: lcProp(rule, 'step', undefined),
        disabled: bagDisabled,
      });
    default:
      return h('div', { className: 'ape-form-unknown' },
        h(Icon, { name: 'alert', size: 13 }),
        h('span', null, '未知控件类型「' + apeStr(type, '?') + '」，已按提示条渲染'));
  }
}

/**
 * prompt-preview 的文本来源：
 * 1) props.renderPrompt 回调。上层实际出现了两种写法，这里按「第一个非空字符串胜出」
 *    依次试探，谁都不会让另一种写法失效：
 *      a. renderPrompt()                 —— 50-params.js 的写法：不给参数就渲染当前预设的提示词；
 *      b. renderPrompt(props.prompt, 值)  —— 60-edit.js / shell 的写法：(prompt, values, params)；
 *      c. renderPrompt(rule, 值) 等常见变体；
 * 2) rule.props.prompt 字面量（没有回调或回调全都给不出内容时）。
 */
function lcPreviewText(renderPrompt, rule, values) {
  const own = lcProp(rule, 'prompt', '');
  const fallback = typeof own === 'string' ? own : '';
  if (typeof renderPrompt !== 'function') return fallback;
  const attempts = [
    function () { return renderPrompt(); },
    function () { return renderPrompt(fallback, values); },
    function () { return renderPrompt(rule, values); },
    function () { return renderPrompt(values, rule); },
    function () { return renderPrompt(rule); },
    function () { return renderPrompt(values); },
  ];
  for (let i = 0; i < attempts.length; i += 1) {
    try {
      const out = attempts[i]();
      if (typeof out === 'string' && out !== '') return out;
    } catch (error) { /* 签名不匹配，换下一个 */ }
  }
  return fallback;
}

/* ------------------------------------------------------------------ *
 * LcForm —— 契约 §4.3
 * props: { rule: Rule[], value: object, onChange(nextValue, field, val),
 *          ctx, mode: 'edit'|'fill', renderPrompt }
 * 额外（可选）：showErrors=false 关掉即时错误显示，disabled 整体禁用。
 * 栅格：24 栅格；窄容器（<430px，右栏常态）自动退化成单列。
 * ------------------------------------------------------------------ */
function LcForm(props) {
  const p = props || {};
  const ruleInput = p.rule;
  const list = useMemo(function () { return lcRules(ruleInput); }, [ruleInput]);
  const values = p.value && typeof p.value === 'object' ? p.value : {};
  const mode = p.mode === 'edit' ? 'edit' : 'fill';
  const showErrors = p.showErrors !== false;
  const disabled = p.disabled === true;
  const renderPrompt = p.renderPrompt;
  const errors = useMemo(function () { return validateRule(list, values).errors; }, [list, values]);

  const emit = function (field, next) {
    if (!field) return;
    if (typeof p.onChange !== 'function') return;
    const nextValue = {};
    for (const key in values) {
      if (Object.prototype.hasOwnProperty.call(values, key)) nextValue[key] = values[key];
    }
    nextValue[field] = next;
    p.onChange(nextValue, field, next);
  };

  if (list.length === 0) {
    return h(Fragment, null,
      apeStyle(),
      h('div', { className: cx('ape-form', p.className) },
        h(UiEmpty, {
          title: '这个界面还没有字段',
          hint: '在「编辑模式 → 低代码界面开发」里添加控件，或点「从参数生成界面」由参数一键生成。',
        })));
  }

  const cells = [];
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    const type = typeof item.type === 'string' && item.type !== '' ? item.type : 'input';
    const field = typeof item.field === 'string' ? item.field.trim() : '';
    const span = lcSpan(item);
    const key = 'lc-cell-' + i;

    if (type === 'divider') {
      cells.push(h('div', { key: key, className: 'ape-form-cell', style: { gridColumn: 'span 24' } },
        h('div', { className: 'ape-form-divider' })));
      continue;
    }

    if (type === 'title') {
      const text = typeof item.title === 'string' ? item.title : '';
      cells.push(h('div', { key: key, className: 'ape-form-cell', style: { gridColumn: 'span 24' } },
        h('div', { className: 'ape-form-title' }, text)));
      continue;
    }

    if (type === 'prompt-preview') {
      cells.push(h('div', { key: key, className: 'ape-form-cell', style: { gridColumn: 'span 24' } },
        h(UiField, {
          label: typeof item.title === 'string' && item.title !== '' ? item.title : '提示词预览',
          info: typeof item.info === 'string' ? item.info : '',
        }, h('pre', { className: 'ape-form-preview' }, lcPreviewText(renderPrompt, item, values)))));
      continue;
    }

    if (!field) {
      cells.push(h('div', { key: key, className: 'ape-form-cell', style: { gridColumn: 'span ' + span } },
        h(UiField, { label: typeof item.title === 'string' ? item.title : '' },
          h('div', { className: 'ape-form-unknown' },
            h(Icon, { name: 'alert', size: 13 }),
            h('span', null, '这条 rule（' + type + '）没有 field，已跳过')))));
      continue;
    }

    const current = lcValueOf(item, values);
    const control = lcControl(item, type, current, function (next) { emit(field, next); }, disabled);
    const actions = mode === 'edit'
      ? h(Fragment, null,
        h('span', { className: 'ape-mono ape-dim' }, field),
        h(UiBadge, { tone: LC_TYPES.indexOf(type) >= 0 ? 'default' : 'warn' }, type))
      : undefined;

    cells.push(h('div', { key: key, className: 'ape-form-cell', style: { gridColumn: 'span ' + span } },
      h(UiField, {
        label: typeof item.title === 'string' && item.title !== '' ? item.title : field,
        info: typeof item.info === 'string' ? item.info : '',
        error: showErrors && errors[field] ? errors[field] : undefined,
        required: lcRequired(item),
        actions: actions,
      }, control)));
  }

  return h(Fragment, null,
    apeStyle(),
    h('div', { className: cx('ape-form', p.className), 'data-lc-mode': mode },
      h('div', { className: 'ape-form-grid' }, cells)));
}

/* ============================ 40-list.js ============================ */
/* ==================================================================== *
 * 40-list.js —— 列表模式：Agent 预设 / MCP / Skills 三张表，
 *               以及三个模式共用的「启用预设」动作。
 *
 * 本文件是 part 片段（裸语句），被 scripts/build-client.mjs 按文件名升序
 * 拼进 client factory 的函数体：**不要** import / export，**不要**用 JSX。
 * 可用绑定：00-prelude.js（React、h、hooks、cx、toPresetId、nowIso、常量…）、
 *           10-ui.js（UI 原语）、20-api.js（Api、Api.state）、30-form.js（LcForm 等）。
 * 顶层名字统一加 `Lst` / `LST_` 前缀，避免与其它 part 撞名。
 * ==================================================================== */

/** 列表模式顶部三选一。 */
const LST_TAB_OPTIONS = [
  { label: 'Agent预设', value: LIST_PRESETS, icon: 'preset' },
  { label: 'MCP', value: LIST_MCP, icon: 'mcp' },
  { label: 'Skills', value: LIST_SKILLS, icon: 'skill' },
];

/** 预设 id 的形状（与 CONTRACT §2.1 一致）。 */
const LST_PRESET_ID_RE = /^[a-z0-9][a-z0-9-]*$/;
/** MCP / Skill 目录项 id 的形状：比预设 id 宽松，允许点与下划线。 */
const LST_CATALOG_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** 会话已开始任务时，启用按钮的 title 说明（按钮**不** disabled，见下方注释）。 */
const LST_LOCKED_HINT =
  '当前会话已经开始任务，DSH 不允许再切换预设。仍可点击尝试——失败时由 DSH 给出权威原因；要换预设请新建会话。';

/** 新建预设时的起步内容：一个 role 参数 + 引用它的提示词，建好即可看到参数效果。 */
const LST_STARTER_PARAMS = [
  {
    name: 'role',
    label: '角色',
    type: 'text',
    default: '专业助手',
    description: '这个 Agent 的角色定位，会被写进提示词',
  },
];
const LST_STARTER_PROMPT = '你是 {{ $role }}。\n\n请按用户的要求完成任务。\n';

/** 行内布局常量：只使用主题 token 上色（CONTRACT §1.2），字面颜色仅 Icon 内部使用。 */
const LST_STYLE = {
  rowMain: {
    display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '0', flex: '1 1 auto',
    cursor: 'pointer', wordBreak: 'break-word', overflowWrap: 'anywhere',
  },
  rowTitle: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', minWidth: '0' },
  rowName: { fontWeight: 600, color: 'var(--dsw-alias-label-primary)' },
  rowSub: {
    color: 'var(--dsw-alias-label-secondary)', fontSize: '12px', lineHeight: '1.5',
    wordBreak: 'break-word', overflowWrap: 'anywhere',
  },
  rowId: {
    color: 'var(--dsw-alias-label-secondary)',
    fontSize: '11px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    opacity: '0.75',
    // Identifier, not prose: there is no space to break at, so it must be
    // allowed to break mid-token or a long id pushes the row wider.
    wordBreak: 'break-all',
  },
  rowErr: { color: 'var(--dsw-alias-label-error)', fontSize: '12px' },
  rowHint: { color: 'var(--dsw-alias-label-secondary)', fontSize: '11px' },
  actions: { display: 'flex', alignItems: 'center', gap: '6px', flexShrink: '0', flex: '0 0 auto', flexWrap: 'nowrap' },
  toolbarRow: { display: 'flex', alignItems: 'center', gap: '8px', width: '100%', flexWrap: 'wrap' },
  grow: { flex: '1 1 auto', minWidth: '140px' },
  note: { color: 'var(--dsw-alias-label-secondary)', fontSize: '12px', lineHeight: '1.7', padding: '0 2px' },
  stack: { display: 'flex', flexDirection: 'column', gap: '10px' },
  rows: { display: 'flex', flexDirection: 'column', gap: '4px' },
  pre: {
    margin: '0',
    padding: '10px',
    borderRadius: '8px',
    background: 'var(--dsw-alias-bg-layer-2)',
    color: 'var(--dsw-alias-label-primary)',
    fontSize: '12px',
    lineHeight: '1.6',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    maxHeight: '340px',
    overflow: 'auto',
  },
};

/* -------------------------------------------------------------------- *
 * 小工具
 * -------------------------------------------------------------------- */

/** 安全取数组。 */
function LstArray(value) {
  return Array.isArray(value) ? value : [];
}

/** 浅拷贝并覆盖若干字段（比对象展开更明确，也便于阅读）。 */
function LstWith(source, extra) {
  var out = {};
  var key;
  var base = source && typeof source === 'object' ? source : {};
  for (key in base) {
    if (Object.prototype.hasOwnProperty.call(base, key)) out[key] = base[key];
  }
  var patch = extra && typeof extra === 'object' ? extra : {};
  for (key in patch) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) out[key] = patch[key];
  }
  return out;
}

/** 从任意错误对象里取一句可展示的文案。 */
function LstErrorText(error) {
  if (!error) return '未知错误';
  if (typeof error === 'string') return error;
  return error.message ? String(error.message) : String(error);
}

/** 失败提示：console.error + toast（CONTRACT §7）。 */
function LstFail(toast, action, error) {
  console.error('[agent-preset-editor] ' + action + '失败', error);
  if (toast && typeof toast.show === 'function') {
    toast.show(action + '失败：' + LstErrorText(error), 'err');
  }
}

/** 成功提示。 */
function LstOk(toast, message) {
  if (toast && typeof toast.show === 'function') toast.show(message, 'ok');
}

/** 信息提示。 */
function LstInfo(toast, message) {
  if (toast && typeof toast.show === 'function') toast.show(message, 'info');
}

/** 把事件处理器包一层，阻止冒泡到可点击的行容器上。 */
function LstStop(handler) {
  return function (event) {
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
    if (typeof handler === 'function') return handler(event);
    return undefined;
  };
}

/** 大小写不敏感的关键字匹配：任意一个字段命中即通过。 */
function LstMatches(query, fields) {
  var text = String(query === undefined || query === null ? '' : query).trim().toLowerCase();
  if (text === '') return true;
  for (var i = 0; i < fields.length; i += 1) {
    var field = fields[i];
    if (field !== undefined && field !== null && String(field).toLowerCase().indexOf(text) >= 0) return true;
  }
  return false;
}

/** 统一执行一个异步动作，带忙碌态 + 错误 toast。 */
function LstRun(setBusy, toast, action, work) {
  setBusy(true);
  return Promise.resolve()
    .then(work)
    .then(
      function (result) {
        setBusy(false);
        return result;
      },
      function (error) {
        setBusy(false);
        LstFail(toast, action, error);
        return undefined;
      }
    );
}

/* -------------------------------------------------------------------- *
 * 启用（切换会话预设）—— 列表模式与参数模式共用
 * -------------------------------------------------------------------- */

/**
 * 把当前会话切到某个预设。
 *
 * disabled 策略：`state.dsh.sessionPresetLocked` 只是**启发式前置提示**
 * （20-api.js 用 turnCount>0 推导），CONTRACT §1.5 明确「select 的错误才是最终
 * 裁决」。所以这里**不禁用**按钮，只把原因写进 title：禁用一个可能误判的按钮，
 * 会让用户永远拿不到权威错误，也没有任何补救路径。
 *
 * @param {object} options { ctx, sessionId, presetId, name, reload, toast }
 * @returns {Promise<boolean>} 是否成功。
 */
async function LstEnablePreset(options) {
  var ctx = options.ctx;
  var sessionId = options.sessionId;
  var presetId = options.presetId;
  var name = options.name || presetId;
  var toast = options.toast;
  var remote = ctx && ctx.remote ? ctx.remote : null;
  var agentPresets = remote && remote.agentPresets ? remote.agentPresets : null;

  if (agentPresets && typeof agentPresets.select === 'function' && sessionId) {
    try {
      await agentPresets.select(sessionId, presetId);
      LstOk(toast, '已切换到 ' + name);
      if (typeof options.reload === 'function') await options.reload();
      return true;
    } catch (error) {
      var code = error && error.code ? String(error.code) : '';
      var text = LstErrorText(error);
      if (code === 'agent-preset/locked' || /locked/i.test(text)) {
        if (toast && typeof toast.show === 'function') {
          toast.show('任务已开始，无法切换预设；请新建会话后再选「' + name + '」', 'err');
        }
      } else {
        LstFail(toast, '切换预设', error);
      }
      return false;
    }
  }

  // 没有会话，或宿主没暴露 select：退化为「把这个预设设为新会话的默认预设」。
  var settings = remote && remote.settings ? remote.settings : null;
  if (settings && typeof settings.update === 'function') {
    try {
      await settings.update(AGENT_PRESET_SETTINGS_NS, { selectedDefault: presetId });
      LstOk(toast, '已把「' + name + '」设为默认预设');
      if (typeof options.reload === 'function') await options.reload();
      return true;
    } catch (error) {
      LstFail(toast, '设置默认预设', error);
      return false;
    }
  }

  if (toast && typeof toast.show === 'function') toast.show('当前环境不支持切换预设', 'err');
  return false;
}

/** 「启用」按钮：自带忙碌态，锁定原因写进 title 但不禁用。 */
function LstEnableButton(props) {
  var busyPair = useState(false);
  var busy = busyPair[0];
  var setBusy = busyPair[1];
  var locked = props.locked === true;

  var onClick = function (event) {
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
    if (busy) return;
    LstRun(setBusy, props.toast, '切换预设', function () {
      return LstEnablePreset(props);
    });
  };

  return h(
    UiButton,
    {
      size: 'sm',
      variant: props.variant || 'primary',
      icon: 'play',
      disabled: busy,
      title: locked ? LST_LOCKED_HINT : '把当前会话切换到这个预设',
      onClick: onClick,
    },
    busy ? '切换中…' : props.label || '启用'
  );
}

/* -------------------------------------------------------------------- *
 * 列表骨架
 * -------------------------------------------------------------------- */

/** 顶部三选一（没有 setTab 时啥也不渲染，方便单表复用）。 */
function LstTabBar(props) {
  if (typeof props.setTab !== 'function') return null;
  return h(Segmented, {
    value: props.tab || LIST_PRESETS,
    onChange: props.setTab,
    options: LST_TAB_OPTIONS,
  });
}

/** 搜索框 + 添加按钮。 */
function LstListToolbar(props) {
  return h(
    Toolbar,
    null,
    h(
      'div',
      { style: LST_STYLE.toolbarRow },
      h('div', { style: LST_STYLE.grow }, h(UiSearch, {
        value: props.query,
        onChange: props.setQuery,
        placeholder: props.placeholder,
      })),
      h(
        UiButton,
        { variant: 'primary', size: 'sm', icon: 'plus', onClick: props.onAdd },
        props.addLabel || '添加'
      )
    )
  );
}

/** 说明段落。 */
function LstNote(props) {
  return h('div', { style: LST_STYLE.note }, props.children);
}

/** 二次确认弹窗：确认成功（resolve）后自动关闭，失败留在原地并 toast。 */
function LstConfirmModal(props) {
  var busyPair = useState(false);
  var busy = busyPair[0];
  var setBusy = busyPair[1];

  // 成功才关闭；失败留在这里，让用户能改条件后重试（错误走 toast）。
  var onConfirm = function () {
    if (busy) return;
    setBusy(true);
    Promise.resolve()
      .then(props.onConfirm)
      .then(
        function () {
          setBusy(false);
          if (typeof props.onClose === 'function') props.onClose();
        },
        function (error) {
          setBusy(false);
          LstFail(props.toast, props.failLabel || '操作', error);
        }
      );
  };

  return h(
    UiModal,
    {
      open: true,
      title: props.title || '确认操作',
      onClose: busy ? function () {} : props.onClose,
      footer: [
        h(UiButton, { key: 'cancel', variant: 'ghost', onClick: props.onClose, disabled: busy }, '取消'),
        h(
          UiButton,
          { key: 'ok', variant: props.variant || 'danger', icon: 'check', onClick: onConfirm, disabled: busy },
          busy ? '处理中…' : props.confirmLabel || '确认删除'
        ),
      ],
    },
    props.children || props.message
  );
}

/** 一个目录项（MCP / Skill）列表行的左半边。 */
function LstCatalogMain(props) {
  return h(
    'div',
    { style: LST_STYLE.rowMain, onClick: props.onOpen, title: '点击编辑' },
    h('div', { style: LST_STYLE.rowTitle }, h('span', { style: LST_STYLE.rowName }, props.title || props.id), props.badges),
    h('div', { style: LST_STYLE.rowSub }, props.subtitle || '（没有描述）'),
    h('div', { style: LST_STYLE.rowId }, props.id)
  );
}

/* -------------------------------------------------------------------- *
 * Agent 预设列表
 * -------------------------------------------------------------------- */

/**
 * 把 `state.presets`（用户预设）与 `state.dsh.roster`（DSH 实际可用的预设）
 * 合并成一行行数据。来源判定见 CONTRACT 与任务书：
 * 两边都有 → user 且标「覆盖内置」；只在 roster → system（只读）。
 */
function LstPresetRows(state) {
  var defs = LstArray(state && state.presets);
  var roster = LstArray(state && state.dsh && state.dsh.roster);
  var byId = {};
  var order = [];
  var i;

  for (i = 0; i < defs.length; i += 1) {
    var def = defs[i];
    if (!def || !def.id) continue;
    if (!byId[def.id]) {
      byId[def.id] = { id: def.id };
      order.push(def.id);
    }
    byId[def.id].def = def;
  }
  for (i = 0; i < roster.length; i += 1) {
    var entry = roster[i];
    if (!entry || !entry.id) continue;
    if (!byId[entry.id]) {
      byId[entry.id] = { id: entry.id };
      order.push(entry.id);
    }
    byId[entry.id].roster = entry;
  }

  var userRows = [];
  var systemRows = [];
  for (i = 0; i < order.length; i += 1) {
    var row = byId[order[i]];
    var userDef = row.def || null;
    var rosterEntry = row.roster || null;
    var numericOrder = userDef ? Number(userDef.order) : NaN;
    row.origin = userDef ? 'user' : 'system';
    row.overrides = !!(userDef && rosterEntry);
    row.name = (userDef && userDef.name) || (rosterEntry && rosterEntry.name) || row.id;
    row.description = (userDef && userDef.description) || (rosterEntry && rosterEntry.description) || '';
    row.broken = rosterEntry && rosterEntry.broken ? String(rosterEntry.broken) : '';
    row.isDefault = !!(rosterEntry && rosterEntry.isDefault);
    row.order = Number.isFinite(numericOrder) ? numericOrder : Number.MAX_SAFE_INTEGER;
    if (userDef) userRows.push(row);
    else systemRows.push(row);
  }

  userRows.sort(function (a, b) {
    if (a.order !== b.order) return a.order - b.order;
    return String(a.name).localeCompare(String(b.name));
  });
  return userRows.concat(systemRows);
}

/** 下一个可用的 order（用户预设最大 order + 10）。 */
function LstNextOrder(state) {
  var defs = LstArray(state && state.presets);
  var max = 0;
  for (var i = 0; i < defs.length; i += 1) {
    var value = defs[i] ? Number(defs[i].order) : NaN;
    if (Number.isFinite(value) && value > max) max = value;
  }
  return max + 10;
}

/** 单行预设。 */
function LstPresetRow(props) {
  var row = props.row;
  var dsh = (props.state && props.state.dsh) || {};
  var isUser = row.origin === 'user';
  var isCurrent = dsh.sessionPreset === row.id;
  var locked = dsh.sessionPresetLocked === true;

  var badges = [];
  badges.push(
    h(
      UiBadge,
      {
        key: 'origin',
        tone: isUser ? 'default' : 'warn',
        title: isUser ? 'origin: user —— 本插件管理的用户预设' : 'origin: system —— DSH 自带，本插件只读',
      },
      isUser ? '用户(user)' : '内置(system)'
    )
  );
  if (row.overrides) badges.push(h(UiBadge, { key: 'override', tone: 'warn', title: 'DSH 里也有同名预设，当前使用的是这个用户预设' }, '覆盖内置'));
  if (isCurrent) badges.push(h(UiBadge, { key: 'current', tone: 'ok' }, '当前'));
  if (row.isDefault) badges.push(h(UiBadge, { key: 'default', tone: 'default' }, '默认'));
  if (row.broken) badges.push(h(UiBadge, { key: 'broken', tone: 'err', title: row.broken }, '声明损坏'));

  var main = h(
    'div',
    { style: LST_STYLE.rowMain, onClick: function () { props.onOpen(row.id); }, title: '点击进入参数配置模式' },
    h('div', { style: LST_STYLE.rowTitle }, h('span', { style: LST_STYLE.rowName }, row.name), badges),
    h('div', { style: LST_STYLE.rowSub }, row.description || '（没有描述）'),
    h('div', { style: LST_STYLE.rowId }, row.id),
    row.broken ? h('div', { style: LST_STYLE.rowErr }, '声明错误：' + row.broken) : null,
    !isUser
      ? h('div', { style: LST_STYLE.rowHint }, '内置预设由 DSH 提供，本插件只读；点「查看配置」看它的声明内容。')
      : null
  );

  var actions = [
    h(LstEnableButton, {
      key: 'enable',
      ctx: props.ctx,
      sessionId: props.sessionId,
      presetId: row.id,
      name: row.name,
      reload: props.reload,
      toast: props.toast,
      locked: locked,
    }),
  ];
  if (isUser) {
    actions.push(
      h(
        UiButton,
        {
          key: 'edit',
          size: 'sm',
          variant: 'ghost',
          icon: 'edit',
          title: '在编辑模式修改这个预设',
          onClick: LstStop(function () { props.onEdit(row.id); }),
        },
        '编辑'
      )
    );
    actions.push(
      h(UiButton, {
        key: 'delete',
        size: 'sm',
        variant: 'danger',
        icon: 'trash',
        title: '删除这个用户预设',
        onClick: LstStop(function () { props.onDelete(row); }),
      })
    );
  } else {
    actions.push(
      h(
        UiButton,
        {
          key: 'view',
          size: 'sm',
          variant: 'ghost',
          icon: 'sliders',
          title: '只读查看这个内置预设的声明内容',
          onClick: LstStop(function () { props.onOpen(row.id); }),
        },
        '查看配置'
      )
    );
  }

  return h(
    UiRow,
    {
      active: isCurrent,
      right: h('div', { style: LST_STYLE.actions }, actions),
    },
    main
  );
}

/** 新建预设弹窗：收集 id / 展示名 / 描述，建好后直接进编辑模式。 */
function LstAddPresetModal(props) {
  var namePair = useState('');
  var name = namePair[0];
  var setName = namePair[1];
  var idPair = useState('');
  var id = idPair[0];
  var setId = idPair[1];
  var descPair = useState('');
  var desc = descPair[0];
  var setDesc = descPair[1];
  var busyPair = useState(false);
  var busy = busyPair[0];
  var setBusy = busyPair[1];
  var idTouched = useRef(false);

  var existing = LstArray(props.existingIds);
  var nextOrder = LstNextOrder(props.state);

  var onName = function (next) {
    setName(next);
    // id 与展示名联动，直到用户自己动过 id 输入框。
    if (!idTouched.current) setId(toPresetId(next));
  };

  var submit = function () {
    var finalName = String(name || '').trim();
    var finalId = String(id || '').trim();
    var finalDesc = String(desc || '').trim();
    if (finalName === '') {
      LstInfo(props.toast, '请先填写展示名');
      return;
    }
    if (!LST_PRESET_ID_RE.test(finalId)) {
      LstInfo(props.toast, '预设 id 只能用小写字母、数字和连字符，且以字母或数字开头');
      return;
    }
    if (existing.indexOf(finalId) >= 0) {
      LstInfo(props.toast, 'id 已被占用：' + finalId);
      return;
    }

    var params = LST_STARTER_PARAMS.map(function (item) { return LstWith(item, {}); });
    var rule = typeof ruleFromParams === 'function' ? ruleFromParams(params) : [];
    var definition = {
      id: finalId,
      name: finalName,
      description: finalDesc,
      order: nextOrder,
      prompt: LST_STARTER_PROMPT,
      params: params,
      form: { rule: LstArray(rule) },
      mcp: [],
      skills: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    LstRun(setBusy, props.toast, '创建预设', function () {
      return Api.savePreset(definition).then(function () {
        return Promise.resolve(props.reload()).then(function () {
          LstOk(props.toast, '已创建预设 ' + finalName);
          props.onCreated(finalId);
        });
      });
    });
  };

  return h(
    UiModal,
    {
      open: true,
      title: '添加 Agent 预设',
      actions: h(LstAskAi, {
        ctx: props.ctx,
        sessionId: props.sessionId,
        kind: 'preset',
        toast: props.toast,
        onClose: props.onClose,
      }),
      onClose: busy ? function () {} : props.onClose,
      footer: [
        h(UiButton, { key: 'cancel', variant: 'ghost', onClick: props.onClose, disabled: busy }, '取消'),
        h(UiButton, { key: 'create', variant: 'primary', icon: 'check', onClick: submit, disabled: busy }, busy ? '创建中…' : '创建并编辑'),
      ],
    },
    h(
      'div',
      { style: LST_STYLE.stack },
      h(UiField, { label: '展示名', required: true, info: '列表与侧边栏上显示的名字' },
        h(UiInput, { value: name, onChange: onName, placeholder: '例如：设计文档 Agent', autoFocus: true })),
      h(UiField, { label: '预设 id', required: true, info: '小写字母、数字与连字符；等于 DSH 的预设 id，保存后不建议再改' },
        h(UiInput, {
          value: id,
          onChange: function (next) { idTouched.current = true; setId(next); },
          placeholder: 'design-doc-writer',
        })),
      h(UiField, { label: '一句话描述' },
        h(UiInput, { value: desc, onChange: setDesc, placeholder: '把需求转化为设计文档' })),
      h(LstNote, null, '创建后会写入 ' + ((props.state && props.state.paths && props.state.paths.root) || '$DSH_HOME/agent-preset-editor') + '，并直接进入编辑模式。')
    )
  );
}

/** 预设列表主体（由 PresetListMode 在 tab==='presets' 时渲染）。 */
function LstPresetPane(props) {
  var state = props.state;
  var queryPair = useState('');
  var query = queryPair[0];
  var setQuery = queryPair[1];
  var addPair = useState(false);
  var addOpen = addPair[0];
  var setAddOpen = addPair[1];
  var deletePair = useState(null);
  var deleteTarget = deletePair[0];
  var setDeleteTarget = deletePair[1];

  var rows = useMemo(function () { return LstPresetRows(state); }, [state]);
  var visible = useMemo(function () {
    var out = [];
    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i];
      if (LstMatches(query, [row.id, row.name, row.description])) out.push(row);
    }
    return out;
  }, [rows, query]);

  var existingIds = useMemo(function () {
    var out = [];
    for (var i = 0; i < rows.length; i += 1) out.push(rows[i].id);
    return out;
  }, [rows]);

  var openParams = function (id) {
    if (typeof props.setMode === 'function') props.setMode(MODE_PARAMS, { presetId: id });
  };
  var openEdit = function (id) {
    if (typeof props.setMode === 'function') props.setMode(MODE_EDIT, { presetId: id });
  };

  var body;
  if (visible.length === 0) {
    body = h(UiEmpty, {
      title: rows.length === 0 ? '还没有任何预设' : '没有匹配的预设',
      hint: rows.length === 0 ? '点右上角「添加预设」创建一个。' : '换个关键字再试试。',
    });
  } else {
    body = h(
      'div',
      { style: LST_STYLE.rows },
      visible.map(function (row) {
        return h(LstPresetRow, {
          key: row.id,
          row: row,
          state: state,
          ctx: props.ctx,
          sessionId: props.sessionId,
          reload: props.reload,
          toast: props.toast,
          onOpen: openParams,
          onEdit: openEdit,
          onDelete: setDeleteTarget,
        });
      })
    );
  }

  return h(
    Fragment,
    null,
    h(LstListToolbar, {
      query: query,
      setQuery: setQuery,
      placeholder: '搜索预设（名称 / 描述 / id）',
      addLabel: '添加预设',
      onAdd: function () { setAddOpen(true); },
    }),
    h(LstNote, null,
      '共 ' + rows.length + ' 个预设（含 DSH 内置）。点任意一行进入「参数配置」；「启用」把当前会话切到该预设。'),
    body,
    addOpen
      ? h(LstAddPresetModal, {
          state: state,
          existingIds: existingIds,
          // Same plumbing as the MCP / Skill dialogs: the「让 AI 帮我写」
          // button inside needs the session to write into.
          ctx: props.ctx,
          sessionId: props.sessionId,
          toast: props.toast,
          reload: props.reload,
          onClose: function () { setAddOpen(false); },
          onCreated: function (id) {
            setAddOpen(false);
            openEdit(id);
          },
        })
      : null,
    deleteTarget
      ? h(LstConfirmModal, {
          title: '删除预设',
          message: '确定删除用户预设「' + deleteTarget.name + '」（' + deleteTarget.id + '）吗？'
            + '对应的 presets/' + deleteTarget.id + '.json 会被移除，且不可撤销。',
          confirmLabel: '删除预设',
          failLabel: '删除预设',
          toast: props.toast,
          onClose: function () { setDeleteTarget(null); },
          onConfirm: function () {
            var id = deleteTarget.id;
            return Api.deletePreset(id).then(function () {
              return Promise.resolve(props.reload()).then(function () {
                LstOk(props.toast, '已删除预设 ' + id);
                if (typeof props.setMode === 'function') props.setMode(MODE_LIST, {});
                return true;
              });
            });
          },
        })
      : null
  );
}

/** 列表模式入口：顶部三选一 + 对应的表。 */
function PresetListMode(props) {
  var tab = props.tab || LIST_PRESETS;
  if (tab === LIST_MCP) return h(McpListMode, props);
  if (tab === LIST_SKILLS) return h(SkillListMode, props);
  return h(
    Fragment,
    null,
    h(LstTabBar, { tab: tab, setTab: props.setTab }),
    h(LstPresetPane, props)
  );
}

/* -------------------------------------------------------------------- *
 * MCP 目录
 * -------------------------------------------------------------------- */

/** 引用了某个目录项的预设（返回预设对象数组，用于「被 N 个预设引用」）。 */
function LstReferrers(state, key, id) {
  var presets = LstArray(state && state.presets);
  var out = [];
  for (var i = 0; i < presets.length; i += 1) {
    var preset = presets[i];
    if (!preset) continue;
    if (LstArray(preset[key]).indexOf(id) >= 0) out.push(preset);
  }
  return out;
}

/** 引用徽标：被 N 个预设引用（title 里列出名字）。 */
function LstRefBadge(props) {
  var refs = LstArray(props.refs);
  if (refs.length === 0) {
    return h(UiBadge, { tone: 'warn', title: '还没有任何预设引用它，所以它现在不产生任何效果' }, '未被引用');
  }
  var names = refs.map(function (preset) { return preset.name || preset.id; }).join('、');
  return h(UiBadge, { tone: 'ok', title: '被这些预设引用：' + names }, '被 ' + refs.length + ' 个预设引用');
}

/** 一个新的 MCP 目录项（未保存）。 */
function LstNewMcpEntry() {
  return {
    id: '',
    name: '',
    description: '',
    enabled: true,
    server: {
      serverName: '',
      transport: 'stdio',
      command: '',
      args: [],
      cwd: '',
      env: {},
      url: '',
      toolCallTimeoutMs: 120000,
    },
    createdAt: '',
    updatedAt: '',
  };
}

/** McpEntry → 弹窗里用的扁平草稿（args 一行一个、超时用字符串）。 */
function LstMcpDraft(entry) {
  var base = entry && typeof entry === 'object' ? entry : LstNewMcpEntry();
  var server = base.server && typeof base.server === 'object' ? base.server : {};
  var timeout = server.toolCallTimeoutMs;
  return {
    id: String(base.id || ''),
    name: String(base.name || ''),
    description: String(base.description || ''),
    enabled: base.enabled !== false,
    serverName: String(server.serverName || ''),
    transport: server.transport || 'stdio',
    command: String(server.command || ''),
    argsText: LstArray(server.args).join('\n'),
    cwd: String(server.cwd || ''),
    url: String(server.url || ''),
    timeoutText: timeout === undefined || timeout === null ? '' : String(timeout),
  };
}

/** 草稿 → McpEntry（保留原条目里我们没有暴露的字段，如 env）。 */
function LstMcpEntryFromDraft(draft, original) {
  var base = original && typeof original === 'object' ? original : {};
  var server = LstWith(base.server, {});
  var args = [];
  String(draft.argsText || '').split('\n').forEach(function (line) {
    var text = line.trim();
    if (text !== '') args.push(text);
  });
  var timeout = Number(draft.timeoutText);
  if (!Number.isFinite(timeout) || timeout <= 0) timeout = 120000;
  var id = String(draft.id || '').trim();

  server.serverName = String(draft.serverName || '').trim() || id;
  server.transport = draft.transport || 'stdio';
  server.command = String(draft.command || '').trim();
  server.args = args;
  server.cwd = String(draft.cwd || '').trim();
  server.url = String(draft.url || '').trim();
  server.toolCallTimeoutMs = timeout;

  return {
    id: id,
    name: String(draft.name || '').trim() || id,
    description: String(draft.description || '').trim(),
    enabled: draft.enabled !== false,
    server: server,
    createdAt: base.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
}

/**
 * 弹窗头部右侧的「让 AI 帮我写」按钮。
 *
 * 这两个弹窗擅长「存」一个定义，不擅长「问出」一个定义：用户手上通常没有
 * serverName / transport / command 这些字段，但能用一句话描述这个东西。所以
 * 按钮把一句填好格式的请求塞进**当前会话**的输入框，关掉弹窗并把焦点交给输入
 * 框，剩下的由用户补完、由 AI 通过插件的 HTTP API 落库（见 AI-USAGE.md）。
 */
function LstAskAi(props) {
  var kind = props.kind === 'skill' ? 'skill' : (props.kind === 'preset' ? 'preset' : 'mcp');
  var what = kind === 'skill' ? 'Skill' : (kind === 'preset' ? 'Agent 预设' : 'MCP');
  return h(UiButton, {
    variant: 'ghost',
    size: 'sm',
    icon: 'edit',
    title: '把「给 Agent 预设插件添加以下 ' + what + '：」写进当前会话的输入框；你补完信息后由 AI 写入插件',
    onClick: function () {
      var result = composeAskAi(props.ctx, props.sessionId, kind);
      if (result.ok) {
        LstOk(props.toast, '已写入输入框：补完信息后发送，AI 会把它加进插件');
        props.onClose();
      } else {
        // 原因逐项具体化：一句笼统的「当前会话不可用」曾把排查带偏一整轮。
        LstInfo(props.toast, '没能写入输入框——' + result.message);
      }
    },
  }, '让 AI 帮我写');
}

/** MCP 新增 / 编辑弹窗。 */
function LstMcpEditModal(props) {
  var isNew = props.isNew === true;
  var draftPair = useState(function () { return LstMcpDraft(props.entry); });
  var draft = draftPair[0];
  var setDraft = draftPair[1];
  var busyPair = useState(false);
  var busy = busyPair[0];
  var setBusy = busyPair[1];

  var set = function (field, value) {
    setDraft(function (previous) {
      var next = LstWith(previous, {});
      next[field] = value;
      return next;
    });
  };
  var field = function (name) {
    return function (value) { set(name, value); };
  };

  var submit = function () {
    var id = String(draft.id || '').trim();
    if (!LST_CATALOG_ID_RE.test(id)) {
      LstInfo(props.toast, 'MCP id 只能由字母、数字、点、下划线、连字符组成，且以字母或数字开头');
      return;
    }
    if (isNew && LstArray(props.existingIds).indexOf(id) >= 0) {
      LstInfo(props.toast, 'MCP id 已存在：' + id);
      return;
    }
    if (draft.transport === 'stdio' && String(draft.command || '').trim() === '') {
      LstInfo(props.toast, 'transport=stdio 时必须填写 command');
      return;
    }
    if (draft.transport !== 'stdio' && String(draft.url || '').trim() === '') {
      LstInfo(props.toast, 'transport=' + draft.transport + ' 时必须填写 url');
      return;
    }

    var entry = LstMcpEntryFromDraft(draft, isNew ? null : props.entry);
    LstRun(setBusy, props.toast, '保存 MCP', function () {
      return Api.saveMcp(entry).then(function () {
        return Promise.resolve(props.reload()).then(function () {
          LstOk(props.toast, '已保存 MCP ' + entry.name);
          props.onClose();
        });
      });
    });
  };

  var stdio = draft.transport === 'stdio';

  return h(
    UiModal,
    {
      open: true,
      title: isNew ? '添加 MCP 服务器' : '编辑 MCP 服务器',
      actions: h(LstAskAi, {
        ctx: props.ctx,
        sessionId: props.sessionId,
        kind: 'mcp',
        toast: props.toast,
        onClose: props.onClose,
      }),
      onClose: busy ? function () {} : props.onClose,
      footer: [
        h(UiButton, { key: 'cancel', variant: 'ghost', onClick: props.onClose, disabled: busy }, '取消'),
        h(UiButton, { key: 'save', variant: 'primary', icon: 'save', onClick: submit, disabled: busy }, busy ? '保存中…' : '保存'),
      ],
    },
    h(
      'div',
      { style: LST_STYLE.stack },
      h(UiField, { label: 'id', required: true, info: '预设通过这个 id 引用本条目；已存在的条目不可改名' },
        h(UiInput, { value: draft.id, onChange: field('id'), disabled: !isNew, placeholder: 'docx' })),
      h(UiField, { label: '名称' }, h(UiInput, { value: draft.name, onChange: field('name'), placeholder: 'Word 文档处理' })),
      h(UiField, { label: '描述' }, h(UiInput, { value: draft.description, onChange: field('description'), placeholder: '42 个 Word 工具' })),
      h(UiSwitch, { checked: draft.enabled, onChange: field('enabled'), label: '在目录中启用（停用后即使被预设引用也不会挂载）' }),
      h(UiField, { label: 'server.serverName', info: '留空则与 id 相同' },
        h(UiInput, { value: draft.serverName, onChange: field('serverName'), placeholder: 'docx' })),
      h(UiField, { label: 'server.transport', required: true },
        h(UiSelect, {
          value: draft.transport,
          onChange: field('transport'),
          options: [
            { label: 'stdio（本地进程）', value: 'stdio' },
            { label: 'http', value: 'http' },
            { label: 'sse', value: 'sse' },
          ],
        })),
      h(UiField, { label: 'server.command', required: stdio, info: stdio ? '可执行文件路径' : 'transport 不是 stdio 时忽略' },
        h(UiInput, { value: draft.command, onChange: field('command'), disabled: !stdio, placeholder: 'D:/python/envs/mcp/python.exe' })),
      h(UiField, { label: 'server.args', info: '每行一个参数' },
        h(UiTextarea, { value: draft.argsText, onChange: field('argsText'), rows: 3, disabled: !stdio, placeholder: 'E:/AI_mcp_projects/Docx_MCP_cj/final_complete_server.py' })),
      h(UiField, { label: 'server.cwd', info: '工作目录' },
        h(UiInput, { value: draft.cwd, onChange: field('cwd'), disabled: !stdio, placeholder: 'E:/AI_mcp_projects/Docx_MCP_cj' })),
      h(UiField, { label: 'server.url', required: !stdio, info: stdio ? 'transport=stdio 时忽略' : 'http/sse 的服务地址' },
        h(UiInput, { value: draft.url, onChange: field('url'), disabled: stdio, placeholder: 'http://127.0.0.1:3000/mcp' })),
      h(UiField, { label: 'server.toolCallTimeoutMs', info: '工具调用超时（毫秒），默认 120000' },
        h(UiInput, { value: draft.timeoutText, onChange: field('timeoutText'), type: 'number', placeholder: '120000' })),
      h(LstNote, null, '保存只改这个目录项本身，不会影响任何预设；预设要在编辑模式里勾选它才会挂载。')
    )
  );
}

/** MCP 列表模式。 */
function McpListMode(props) {
  var state = props.state;
  var queryPair = useState('');
  var query = queryPair[0];
  var setQuery = queryPair[1];
  var editPair = useState(null);
  var editing = editPair[0];
  var setEditing = editPair[1];
  var deletePair = useState(null);
  var deleteTarget = deletePair[0];
  var setDeleteTarget = deletePair[1];

  var entries = useMemo(function () { return LstArray(state && state.mcp); }, [state]);
  var visible = useMemo(function () {
    var out = [];
    for (var i = 0; i < entries.length; i += 1) {
      var entry = entries[i];
      if (!entry) continue;
      var server = entry.server || {};
      if (LstMatches(query, [entry.id, entry.name, entry.description, server.serverName, server.command, server.url])) out.push(entry);
    }
    return out;
  }, [entries, query]);
  var existingIds = useMemo(function () {
    return entries.map(function (entry) { return entry && entry.id; });
  }, [entries]);

  var toggle = function (entry, next) {
    var updated = LstWith(entry, { enabled: next, updatedAt: nowIso() });
    Promise.resolve()
      .then(function () { return Api.saveMcp(updated); })
      .then(function () { return props.reload(); })
      .then(
        function () { LstOk(props.toast, (next ? '已启用 ' : '已停用 ') + (entry.name || entry.id)); },
        function (error) { LstFail(props.toast, '更新 MCP', error); }
      );
  };

  var rows = visible.map(function (entry) {
    var refs = LstReferrers(state, 'mcp', entry.id);
    var server = entry.server || {};
    var summary = server.transport === 'stdio'
      ? 'stdio · ' + (server.command || '（未配置 command）')
      : String(server.transport || '') + ' · ' + (server.url || '（未配置 url）');
    return h(
      UiRow,
      {
        key: entry.id,
        right: h(
          'div',
          { style: LST_STYLE.actions },
          h('div', { style: { flex: 'none', display: 'inline-flex' }, onClick: LstStop() }, h(UiSwitch, {
            checked: entry.enabled !== false,
            onChange: function (next) { toggle(entry, next); },
          })),
          h(UiButton, {
            size: 'sm',
            variant: 'ghost',
            icon: 'edit',
            title: '编辑这个 MCP 条目',
            onClick: LstStop(function () { setEditing({ entry: entry, isNew: false }); }),
          }),
          h(UiButton, {
            size: 'sm',
            variant: 'danger',
            icon: 'trash',
            title: '删除这个 MCP 条目',
            onClick: LstStop(function () { setDeleteTarget({ entry: entry, refs: refs }); }),
          })
        ),
      },
      h(LstCatalogMain, {
        id: entry.id,
        title: entry.name,
        subtitle: summary + (entry.description ? ' · ' + entry.description : ''),
        onOpen: function () { setEditing({ entry: entry, isNew: false }); },
        badges: [
          h('span', { key: 'ref', style: { display: 'inline-flex' } }, h(LstRefBadge, { refs: refs })),
          entry.enabled === false
            ? h(UiBadge, { key: 'off', tone: 'warn', title: '停用状态：不会被任何预设挂载' }, '已停用')
            : null,
        ],
      })
    );
  });

  return h(
    Fragment,
    null,
    h(LstTabBar, { tab: props.tab || LIST_MCP, setTab: props.setTab }),
    h(LstListToolbar, {
      query: query,
      setQuery: setQuery,
      placeholder: '搜索 MCP（id / 名称 / 描述 / 命令）',
      addLabel: '添加 MCP',
      onAdd: function () { setEditing({ entry: LstNewMcpEntry(), isNew: true }); },
    }),
    h(LstNote, null,
      'MCP 目录是全局共享的：这里新增、修改或停用一行，都不会影响任何预设本身；'
      + '只有某个预设勾选了它，这个 MCP 服务器才会随该预设一起挂载。反过来，删除一个仍被引用的条目会让对应预设失去它。'),
    rows.length === 0
      ? h(UiEmpty, {
          title: entries.length === 0 ? 'MCP 目录还是空的' : '没有匹配的 MCP',
          hint: entries.length === 0 ? '点右上角「添加 MCP」登记一个服务器。' : '换个关键字再试试。',
        })
      : h('div', { style: LST_STYLE.rows }, rows),
    editing
      ? h(LstMcpEditModal, {
          key: editing.isNew ? 'new' : editing.entry.id,
          entry: editing.entry,
          isNew: editing.isNew,
          existingIds: existingIds,
          // ctx + sessionId must ride along: the dialog's「让 AI 帮我写」
          // button writes into this session's composer. Dropping them here
          // made the button report「页面上下文缺失」.
          ctx: props.ctx,
          sessionId: props.sessionId,
          toast: props.toast,
          reload: props.reload,
          onClose: function () { setEditing(null); },
        })
      : null,
    deleteTarget
      ? h(LstConfirmModal, {
          title: '删除 MCP 条目',
          message: '确定删除 MCP「' + (deleteTarget.entry.name || deleteTarget.entry.id) + '」（' + deleteTarget.entry.id + '）吗？'
            + (deleteTarget.refs.length > 0
              ? '注意：它正被 ' + deleteTarget.refs.length + ' 个预设引用（'
                + deleteTarget.refs.map(function (preset) { return preset.name || preset.id; }).join('、')
                + '），删除后这些预设会失去这个 MCP。'
              : '它目前没有被任何预设引用。'),
          confirmLabel: '删除条目',
          failLabel: '删除 MCP',
          toast: props.toast,
          onClose: function () { setDeleteTarget(null); },
          onConfirm: function () {
            var id = deleteTarget.entry.id;
            return Api.deleteMcp(id).then(function () {
              return Promise.resolve(props.reload()).then(function () {
                LstOk(props.toast, '已删除 MCP ' + id);
                return true;
              });
            });
          },
        })
      : null
  );
}

/* -------------------------------------------------------------------- *
 * Skills 目录
 * -------------------------------------------------------------------- */

/** 一个新的 Skill 目录项（未保存）。 */
function LstNewSkillEntry() {
  return {
    id: '',
    name: '',
    description: '',
    enabled: true,
    source: 'inline',
    content: '',
    path: '',
    createdAt: '',
    updatedAt: '',
  };
}

/** Skill 新增 / 编辑弹窗。 */
function LstSkillEditModal(props) {
  var isNew = props.isNew === true;
  var draftPair = useState(function () {
    return LstWith(props.entry && typeof props.entry === 'object' ? props.entry : LstNewSkillEntry(), {});
  });
  var draft = draftPair[0];
  var setDraft = draftPair[1];
  var busyPair = useState(false);
  var busy = busyPair[0];
  var setBusy = busyPair[1];

  var set = function (field, value) {
    setDraft(function (previous) {
      var next = LstWith(previous, {});
      next[field] = value;
      return next;
    });
  };
  var field = function (name) {
    return function (value) { set(name, value); };
  };

  var submit = function () {
    var id = String(draft.id || '').trim();
    var source = draft.source === 'path' ? 'path' : 'inline';
    if (!LST_CATALOG_ID_RE.test(id)) {
      LstInfo(props.toast, 'Skill id 只能由字母、数字、点、下划线、连字符组成，且以字母或数字开头');
      return;
    }
    if (isNew && LstArray(props.existingIds).indexOf(id) >= 0) {
      LstInfo(props.toast, 'Skill id 已存在：' + id);
      return;
    }
    if (source === 'path' && String(draft.path || '').trim() === '') {
      LstInfo(props.toast, 'source=path 时必须填写 SKILL.md 所在目录');
      return;
    }
    if (source === 'inline' && String(draft.content || '').trim() === '') {
      LstInfo(props.toast, 'source=inline 时必须填写 SKILL.md 正文');
      return;
    }

    var entry = {
      id: id,
      name: String(draft.name || '').trim() || id,
      description: String(draft.description || '').trim(),
      enabled: draft.enabled !== false,
      source: source,
      content: source === 'inline' ? String(draft.content || '') : '',
      path: source === 'path' ? String(draft.path || '').trim() : '',
      createdAt: draft.createdAt || nowIso(),
      updatedAt: nowIso(),
    };

    LstRun(setBusy, props.toast, '保存 Skill', function () {
      return Api.saveSkill(entry).then(function () {
        return Promise.resolve(props.reload()).then(function () {
          LstOk(props.toast, '已保存 Skill ' + entry.name);
          props.onClose();
        });
      });
    });
  };

  var isInline = draft.source !== 'path';

  return h(
    UiModal,
    {
      open: true,
      title: isNew ? '添加 Skill' : '编辑 Skill',
      actions: h(LstAskAi, {
        ctx: props.ctx,
        sessionId: props.sessionId,
        kind: 'skill',
        toast: props.toast,
        onClose: props.onClose,
      }),
      onClose: busy ? function () {} : props.onClose,
      footer: [
        h(UiButton, { key: 'cancel', variant: 'ghost', onClick: props.onClose, disabled: busy }, '取消'),
        h(UiButton, { key: 'save', variant: 'primary', icon: 'save', onClick: submit, disabled: busy }, busy ? '保存中…' : '保存'),
      ],
    },
    h(
      'div',
      { style: LST_STYLE.stack },
      h(UiField, { label: 'id', required: true, info: '预设通过这个 id 引用本条目；已存在的条目不可改名' },
        h(UiInput, { value: draft.id, onChange: field('id'), disabled: !isNew, placeholder: 'design-doc-authoring' })),
      h(UiField, { label: '名称' }, h(UiInput, { value: draft.name, onChange: field('name'), placeholder: '设计文档写作' })),
      h(UiField, { label: '描述' }, h(UiInput, { value: draft.description, onChange: field('description'), placeholder: '把模糊需求转成可执行的设计文档' })),
      h(UiSwitch, { checked: draft.enabled !== false, onChange: field('enabled'), label: '在目录中启用（停用后即使被预设引用也不会挂载）' }),
      h(UiField, { label: 'source', required: true, info: 'inline = 正文写在下面；path = 指向磁盘上的 SKILL.md 目录' },
        h(UiSelect, {
          value: isInline ? 'inline' : 'path',
          onChange: field('source'),
          options: [
            { label: 'inline（正文内联）', value: 'inline' },
            { label: 'path（磁盘目录）', value: 'path' },
          ],
        })),
      isInline
        ? h(UiField, { label: 'content', required: true, info: 'SKILL.md 全文' },
            h(UiTextarea, { value: draft.content, onChange: field('content'), rows: 14, placeholder: '# 设计文档写作\n…' }))
        : h(UiField, { label: 'path', required: true, info: '包含 SKILL.md 的绝对目录' },
            h(UiInput, { value: draft.path, onChange: field('path'), placeholder: 'E:/skills/design-doc-authoring' })),
      h(LstNote, null, '保存只改这个目录项本身，不会影响任何预设；预设要在编辑模式里勾选它才会挂载。')
    )
  );
}

/** Skills 列表模式。 */
function SkillListMode(props) {
  var state = props.state;
  var queryPair = useState('');
  var query = queryPair[0];
  var setQuery = queryPair[1];
  var editPair = useState(null);
  var editing = editPair[0];
  var setEditing = editPair[1];
  var deletePair = useState(null);
  var deleteTarget = deletePair[0];
  var setDeleteTarget = deletePair[1];

  var entries = useMemo(function () { return LstArray(state && state.skills); }, [state]);
  var visible = useMemo(function () {
    var out = [];
    for (var i = 0; i < entries.length; i += 1) {
      var entry = entries[i];
      if (!entry) continue;
      if (LstMatches(query, [entry.id, entry.name, entry.description, entry.path])) out.push(entry);
    }
    return out;
  }, [entries, query]);
  var existingIds = useMemo(function () {
    return entries.map(function (entry) { return entry && entry.id; });
  }, [entries]);

  var toggle = function (entry, next) {
    var updated = LstWith(entry, { enabled: next, updatedAt: nowIso() });
    Promise.resolve()
      .then(function () { return Api.saveSkill(updated); })
      .then(function () { return props.reload(); })
      .then(
        function () { LstOk(props.toast, (next ? '已启用 ' : '已停用 ') + (entry.name || entry.id)); },
        function (error) { LstFail(props.toast, '更新 Skill', error); }
      );
  };

  var rows = visible.map(function (entry) {
    var refs = LstReferrers(state, 'skills', entry.id);
    var source = entry.source === 'path' ? 'path · ' + (entry.path || '（未配置路径）') : 'inline · ' + String(entry.content || '').length + ' 字符';
    return h(
      UiRow,
      {
        key: entry.id,
        right: h(
          'div',
          { style: LST_STYLE.actions },
          h('div', { style: { flex: 'none', display: 'inline-flex' }, onClick: LstStop() }, h(UiSwitch, {
            checked: entry.enabled !== false,
            onChange: function (next) { toggle(entry, next); },
          })),
          h(UiButton, {
            size: 'sm',
            variant: 'ghost',
            icon: 'edit',
            title: '编辑这个 Skill 条目',
            onClick: LstStop(function () { setEditing({ entry: entry, isNew: false }); }),
          }),
          h(UiButton, {
            size: 'sm',
            variant: 'danger',
            icon: 'trash',
            title: '删除这个 Skill 条目',
            onClick: LstStop(function () { setDeleteTarget({ entry: entry, refs: refs }); }),
          })
        ),
      },
      h(LstCatalogMain, {
        id: entry.id,
        title: entry.name,
        subtitle: source + (entry.description ? ' · ' + entry.description : ''),
        onOpen: function () { setEditing({ entry: entry, isNew: false }); },
        badges: [
          h('span', { key: 'ref', style: { display: 'inline-flex' } }, h(LstRefBadge, { refs: refs })),
          entry.enabled === false
            ? h(UiBadge, { key: 'off', tone: 'warn', title: '停用状态：不会被任何预设挂载' }, '已停用')
            : null,
        ],
      })
    );
  });

  return h(
    Fragment,
    null,
    h(LstTabBar, { tab: props.tab || LIST_SKILLS, setTab: props.setTab }),
    h(LstListToolbar, {
      query: query,
      setQuery: setQuery,
      placeholder: '搜索 Skill（id / 名称 / 描述）',
      addLabel: '添加 Skill',
      onAdd: function () { setEditing({ entry: LstNewSkillEntry(), isNew: true }); },
    }),
    h(LstNote, null,
      'Skills 目录同样是全局共享的：这里的条目本身不产生任何效果，只有被某个预设勾选后，'
      + '才会随该预设一起挂到 DSH 上；inline 的正文会由 host 写成 SKILL.md 再声明给 dsh-skill-filesystem。'),
    rows.length === 0
      ? h(UiEmpty, {
          title: entries.length === 0 ? 'Skills 目录还是空的' : '没有匹配的 Skill',
          hint: entries.length === 0 ? '点右上角「添加 Skill」登记一个技能。' : '换个关键字再试试。',
        })
      : h('div', { style: LST_STYLE.rows }, rows),
    editing
      ? h(LstSkillEditModal, {
          key: editing.isNew ? 'new' : editing.entry.id,
          entry: editing.entry,
          isNew: editing.isNew,
          existingIds: existingIds,
          // See LstMcpEditModal above: the button inside needs the session.
          ctx: props.ctx,
          sessionId: props.sessionId,
          toast: props.toast,
          reload: props.reload,
          onClose: function () { setEditing(null); },
        })
      : null,
    deleteTarget
      ? h(LstConfirmModal, {
          title: '删除 Skill 条目',
          message: '确定删除 Skill「' + (deleteTarget.entry.name || deleteTarget.entry.id) + '」（' + deleteTarget.entry.id + '）吗？'
            + (deleteTarget.refs.length > 0
              ? '注意：它正被 ' + deleteTarget.refs.length + ' 个预设引用（'
                + deleteTarget.refs.map(function (preset) { return preset.name || preset.id; }).join('、')
                + '），删除后这些预设会失去这个 Skill。'
              : '它目前没有被任何预设引用。'),
          confirmLabel: '删除条目',
          failLabel: '删除 Skill',
          toast: props.toast,
          onClose: function () { setDeleteTarget(null); },
          onConfirm: function () {
            var id = deleteTarget.entry.id;
            return Api.deleteSkill(id).then(function () {
              return Promise.resolve(props.reload()).then(function () {
                LstOk(props.toast, '已删除 Skill ' + id);
                return true;
              });
            });
          },
        })
      : null
  );
}

/* ============================ 50-params.js ============================ */
/* ==================================================================== *
 * 50-params.js —— 参数配置模式：用低代码表单按任务微调某个预设的参数，
 *                 实时预览渲染后的提示词；内置预设只读展示声明内容。
 *
 * 本文件是 part 片段（裸语句），被 scripts/build-client.mjs 按文件名升序
 * 拼进 client factory 的函数体：**不要** import / export，**不要**用 JSX。
 * 可用绑定：00-prelude.js、10-ui.js（UI 原语）、20-api.js（Api）、
 *           30-form.js（LcForm / ruleFromParams / valuesFromRule）、
 *           40-list.js（Lst* 工具与 LstEnableButton —— 拼接顺序保证它先加载）。
 * 顶层名字统一加 `Par` / `PAR_` 前缀。
 * ==================================================================== */

/** 参数占位：`{{ $name }}`，允许内部空格（CONTRACT §2.5）。 */
const PAR_PLACEHOLDER_RE = /\{\{\s*\$([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

/** 本文件的行内布局常量（只使用主题 token 上色）。 */
const PAR_STYLE = {
  pane: { display: 'flex', flexDirection: 'column', gap: '10px' },
  header: { display: 'flex', flexDirection: 'column', gap: '4px' },
  title: { fontWeight: 600, color: 'var(--dsw-alias-label-primary)', fontSize: '13px' },
  desc: { color: 'var(--dsw-alias-label-secondary)', fontSize: '12px', lineHeight: '1.6' },
  badges: { display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' },
  muted: { color: 'var(--dsw-alias-label-secondary)', fontSize: '12px' },
  form: { display: 'flex', flexDirection: 'column', gap: '10px' },
  // 「请重启」弹窗用：一段需要被读完的行动说明，不是一行灰字。
  stack: { display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', lineHeight: '1.7' },
  warn: {
    display: 'flex', flexDirection: 'column', gap: '6px',
    padding: '10px 12px', borderRadius: '8px',
    background: 'var(--dsw-alias-bg-layer-2)',
    color: 'var(--dsw-alias-label-primary)',
    fontSize: '12px', lineHeight: '1.7',
  },
};

/* -------------------------------------------------------------------- *
 * 取值与渲染
 * -------------------------------------------------------------------- */

/** 单个值的展示文本：数组用「、」连接，布尔「是/否」，空值空串。 */
function ParValueText(value) {
  if (Array.isArray(value)) {
    var parts = [];
    for (var i = 0; i < value.length; i += 1) parts.push(String(value[i]));
    return parts.join('、');
  }
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (value === undefined || value === null) return '';
  return String(value);
}

/**
 * 与 CONTRACT §2.5 一致的本地渲染实现：只在 shell 的 `renderPrompt` 与
 * props.renderPrompt 都不可用时兜底，保证预览永不空白。
 */
function ParRenderLocal(prompt, values, params) {
  var text = String(prompt === undefined || prompt === null ? '' : prompt);
  var bag = values && typeof values === 'object' ? values : {};
  var spec = {};
  LstArray(params).forEach(function (item) {
    if (item && item.name) spec[item.name] = item;
  });
  return text.replace(PAR_PLACEHOLDER_RE, function (match, name) {
    var out = ParValueText(bag[name]);
    if (out === '' && spec[name]) out = ParValueText(spec[name].default);
    return out;
  });
}

/**
 * 渲染提示词：优先 shell 提供的全局 `renderPrompt`（CONTRACT §2.5），
 * 其次 props.renderPrompt，最后用本地实现。
 * 用 try 包住 typeof 是因为 `renderPrompt` 若以 let/const 声明且尚未初始化，
 * 直接 typeof 会抛 TDZ 错误。
 */
function ParRenderText(prompt, values, params, fallback) {
  try {
    if (typeof renderPrompt === 'function') {
      var viaShell = renderPrompt(prompt, values, params);
      if (typeof viaShell === 'string') return viaShell;
    }
  } catch (error) {
    console.error('[agent-preset-editor] shell 的 renderPrompt 不可用，改用本地实现', error);
  }
  try {
    if (typeof fallback === 'function') {
      var viaProps = fallback(prompt, values, params);
      if (typeof viaProps === 'string') return viaProps;
    }
  } catch (error) {
    console.error('[agent-preset-editor] props.renderPrompt 调用失败，改用本地实现', error);
  }
  return ParRenderLocal(prompt, values, params);
}

/** rule → 默认值（优先用 30-form.js 的实现）。 */
function ParValuesFromRule(rule) {
  if (typeof valuesFromRule === 'function') {
    try {
      var viaEngine = valuesFromRule(rule);
      if (viaEngine && typeof viaEngine === 'object') return viaEngine;
    } catch (error) {
      console.error('[agent-preset-editor] valuesFromRule 调用失败，改用本地实现', error);
    }
  }
  var out = {};
  LstArray(rule).forEach(function (item) {
    if (!item || !item.field) return;
    out[item.field] = item.value;
  });
  return out;
}

/** 参数配置模式要渲染的 rule：优先 preset.form.rule，为空时由 params 生成。 */
function ParRuleOf(preset) {
  if (!preset) return [];
  var fromForm = preset.form && Array.isArray(preset.form.rule) ? preset.form.rule : [];
  if (fromForm.length > 0) return fromForm;
  if (LstArray(preset.params).length > 0 && typeof ruleFromParams === 'function') {
    try {
      return LstArray(ruleFromParams(preset.params));
    } catch (error) {
      console.error('[agent-preset-editor] ruleFromParams 调用失败，界面将以空表单呈现', error);
    }
  }
  return [];
}

/** 该预设引用的 MCP / Skills 徽标（目录里找不到的标红）。 */
function ParRefBadges(props) {
  var catalog = LstArray(props.state ? (props.kind === 'mcp' ? props.state.mcp : props.state.skills) : null);
  var index = {};
  catalog.forEach(function (entry) {
    if (entry && entry.id) index[entry.id] = entry;
  });
  var ids = LstArray(props.ids);
  if (ids.length === 0) return h('div', { style: PAR_STYLE.muted }, props.emptyText);
  return h(
    'div',
    { style: PAR_STYLE.badges },
    ids.map(function (id) {
      var entry = index[id];
      var title = entry
        ? (entry.description || id) + (entry.enabled === false ? '（已在目录中停用，不会挂载）' : '')
        : '目录里没有这个条目，引用已失效';
      return h(
        UiBadge,
        { key: id, tone: entry ? (entry.enabled === false ? 'warn' : 'ok') : 'err', title: title },
        (entry && entry.name) || id
      );
    })
  );
}

/* -------------------------------------------------------------------- *
 * 内置（只读）预设
 * -------------------------------------------------------------------- */

/**
 * presetId 在 `state.presets` 里找不到 → 说明这是 DSH 自带或由其它来源声明的
 * 预设，本插件只读。用 ctx.remote.agentPresets.read(id) 拉它的声明内容展示。
 */
function ParBuiltinView(props) {
  var id = props.presetId;
  var infoPair = useState({ loading: true, error: null, data: null, unsupported: false });
  var info = infoPair[0];
  var setInfo = infoPair[1];

  useEffect(function () {
    var alive = true;
    var remote = props.ctx && props.ctx.remote ? props.ctx.remote : null;
    var agentPresets = remote && remote.agentPresets ? remote.agentPresets : null;

    setInfo({ loading: true, error: null, data: null, unsupported: false });
    if (!id || !agentPresets || typeof agentPresets.read !== 'function') {
      setInfo({ loading: false, error: null, data: null, unsupported: true });
      return undefined;
    }
    Promise.resolve()
      .then(function () { return agentPresets.read(id); })
      .then(
        function (data) {
          if (alive) setInfo({ loading: false, error: null, data: data || null, unsupported: false });
        },
        function (error) {
          if (alive) setInfo({ loading: false, error: error, data: null, unsupported: false });
        }
      );
    return function () { alive = false; };
  }, [id]);

  var entry = props.rosterEntry || {};
  var name = entry.name || id;
  var badges = [
    h(UiBadge, { key: 'origin', tone: 'warn', title: 'origin: system —— DSH 自带，本插件只读' }, '内置(system)'),
  ];
  if (entry.broken) badges.push(h(UiBadge, { key: 'broken', tone: 'err', title: String(entry.broken) }, '声明损坏'));

  var content;
  if (info.loading) {
    content = h('div', { style: PAR_STYLE.muted }, h(UiSpinner, null));
  } else if (info.unsupported) {
    content = h(LstNote, null,
      '当前环境没有暴露 agentPresets.read，无法读取这个内置预设的声明内容；它的提示词与参数也不在本插件的管理范围内。');
  } else if (info.error) {
    content = h('div', { style: PAR_STYLE.muted }, '读取声明失败：' + LstErrorText(info.error));
  } else {
    var data = info.data || {};
    content = h(
      'div',
      { style: PAR_STYLE.pane },
      data.description ? h('div', { style: PAR_STYLE.desc }, data.description) : null,
      h('div', { style: PAR_STYLE.muted }, '声明内容（只读）：'),
      h('pre', { style: LST_STYLE.pre }, data.content || data.agentPreset || '（没有内容）')
    );
  }

  return h(
    'div',
    { style: PAR_STYLE.pane },
    h(
      Toolbar,
      null,
      h(
        'div',
        { style: LST_STYLE.toolbarRow },
        h(LstEnableButton, {
          key: 'enable',
          ctx: props.ctx,
          sessionId: props.sessionId,
          presetId: id,
          name: name,
          reload: props.reload,
          toast: props.toast,
          locked: !!(props.state && props.state.dsh && props.state.dsh.sessionPresetLocked),
        }),
        h(
          UiButton,
          {
            key: 'back',
            size: 'sm',
            variant: 'ghost',
            icon: 'back',
            onClick: function () { if (props.setMode) props.setMode(MODE_LIST, {}); },
          },
          '返回列表'
        )
      )
    ),
    h(
      UiSection,
      { title: name },
      h(
        'div',
        { style: PAR_STYLE.header },
        h('div', { style: PAR_STYLE.badges }, badges.concat([
          h('span', {
            key: 'id',
            style: { color: 'var(--dsw-alias-label-secondary)', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
          }, id),
        ])),
        h(LstNote, null,
          '这个预设不属于本插件（state.presets 里没有它），所以参数配置模式只能看、不能改。'
          + '要按你的需要定制它，请到「编辑」模式用相同的 id 新建一个用户预设——同名用户预设会覆盖内置定义，列表里会标出「覆盖内置」。'),
        content
      )
    )
  );
}

/* -------------------------------------------------------------------- *
 * 参数配置模式
 * -------------------------------------------------------------------- */

/**
 * 保存参数值之后的「请重启 dsh」弹窗。
 *
 * 为什么必须是弹窗而不是 toast：这不是「操作成功」的通知，而是一条**动作要求**。
 * 用户此刻以为已经完事，但新取值还没有被任何进程读到；toast 会自己消失，错过它的
 * 人只会带着「改了没用」的印象离开 —— 那正是上一轮反馈的来源。所以这里要求用户
 * 显式按一下「知道了」才算翻篇。
 *
 * 也没有做成「一键重启」按钮：重启是宿主进程的事，浏览器里点不到它。把话说清楚
 * 比摆一个按不动的按钮好。
 */
function ParRestartNotice(props) {
  var info = props.info || {};
  return h(UiModal, {
    open: true,
    title: '参数已保存 —— 请重启 dsh',
    onClose: props.onClose,
    footer: h(UiButton, { variant: 'primary', icon: 'check', onClick: props.onClose }, '知道了'),
  },
    h('div', { style: PAR_STYLE.stack },
      h('div', null, '「' + info.presetName + '」的取值已保存，并已写进 DSH 的预设声明。'),
      h('div', { style: PAR_STYLE.warn },
        h('div', null, 'DSH 只在启动时读取预设声明，所以这次改动要等重启之后才会被 AI 用上。'),
        h('div', null, '重启方式：停掉正在运行的 dsh 进程，再用你平时的方式启动（例如 dsh web）。'),
        h('div', null, '重启后请在新会话里验证 —— 已经开始的会话会保持它启动时的版本。')
      ),
      info.note ? h('div', { style: PAR_STYLE.muted }, info.note) : null
    )
  );
}

/** 参数配置模式：顶端动作条 + 低代码表单 + 实时提示词预览 + 引用徽标。 */
function ParamsMode(props) {
  var state = props.state;
  var presetId = props.presetId;

  var presets = LstArray(state && state.presets);
  var preset = null;
  var i;
  for (i = 0; i < presets.length; i += 1) {
    if (presets[i] && presets[i].id === presetId) {
      preset = presets[i];
      break;
    }
  }
  var roster = LstArray(state && state.dsh && state.dsh.roster);
  var rosterEntry = null;
  for (i = 0; i < roster.length; i += 1) {
    if (roster[i] && roster[i].id === presetId) {
      rosterEntry = roster[i];
      break;
    }
  }

  // —— 所有 hook 都无条件执行，分支只发生在 return 处 ——
  var rule = useMemo(function () { return ParRuleOf(preset); }, [preset]);
  var defaults = useMemo(function () { return ParValuesFromRule(rule); }, [rule]);
  var stored = state && state.values && presetId ? state.values[presetId] : null;
  var initial = useMemo(function () {
    var base = Object.assign({}, defaults);
    if (stored && typeof stored === 'object') {
      var key;
      for (key in stored) {
        if (Object.prototype.hasOwnProperty.call(stored, key)) base[key] = stored[key];
      }
    }
    return base;
  }, [defaults, stored]);
  var draftPair = useState(null);
  var draft = draftPair[0];
  var setDraft = draftPair[1];
  var savePair = useState(false);
  var saving = savePair[0];
  var setSaving = savePair[1];
  // 保存成功后要弹的「请重启 dsh」提示；null 表示不弹。
  var noticePair = useState(null);
  var restartNotice = noticePair[0];
  var setRestartNotice = noticePair[1];

  // 换了预设就把本地草稿丢掉，避免把上一个预设的取值带过来。
  useEffect(function () { setDraft(null); }, [presetId]);

  var values = draft === null ? initial : draft;
  var dirty = draft !== null && !shallowEqual(draft, initial);
  var preview = useMemo(function () {
    if (!preset) return '';
    return ParRenderText(preset.prompt, values, preset.params, props.renderPrompt);
  }, [preset, values, props.renderPrompt]);

  /**
   * 取值存进插件之后，若这个预设已经发布过，就顺手把新取值写进 DSH 声明。
   *
   * 为什么非做不可：DSH 的预设声明是**静态 YAML**，`persona.prefix` 在**发布那一刻**
   * 就被渲染成固定文本。只存 values 而不重新发布，AI 读到的仍是发布时的旧值 ——
   * 用户看到的就是「参数改了没反应」，这正是「参数改完不能保存」这个反馈的真实来源。
   *
   * 失败不抛：取值已经存好了，同步失败只该降级成一句提醒，不该让整次保存看起来失败。
   * @returns {Promise<{synced: boolean, reason?: string, error?: Error}>} 同步结果。
   */
  var syncDeclaration = function () {
    if (!rosterEntry) return Promise.resolve({ synced: false, reason: 'not-published' });
    return Api.applyPreset(preset.id).then(
      // 保留 apply 的返回：它带着 note 与 restartRequired，弹窗要如实转述。
      function (result) { return { synced: true, result: result }; },
      function (error) { return { synced: false, reason: 'failed', error: error }; }
    );
  };

  /** 保存后的统一收尾：重载状态、清掉草稿、按同步结果给不同的话。 */
  var finishSave = function (sync, okText) {
    return Promise.resolve(props.reload()).then(function () {
      setDraft(null);
      if (sync.synced) {
        LstOk(props.toast, okText);
        // 值已写进声明，但没有任何进程读过它 —— 这是一条动作要求，用弹窗而不是 toast。
        setRestartNotice({
          presetName: preset.name || preset.id,
          note: sync.result && typeof sync.result.note === 'string' ? sync.result.note : '',
        });
      } else if (sync.reason === 'not-published') {
        LstOk(props.toast, okText + '（这个预设还没发布到 DSH，AI 暂时看不到它）');
      } else {
        LstInfo(props.toast, okText + '，但同步到 DSH 声明失败：'
          + (sync.error && sync.error.message ? sync.error.message : '未知错误'));
      }
    });
  };

  var saveValues = function () {
    if (!preset || saving) return;
    var snapshot = LstWith(values, {});
    LstRun(setSaving, props.toast, '保存参数值', function () {
      return Api.saveValues(preset.id, snapshot)
        .then(syncDeclaration)
        .then(function (sync) { return finishSave(sync, '已保存为我的默认值'); });
    });
  };

  var resetValues = function () {
    if (!preset || saving) return;
    var fresh = ParValuesFromRule(rule);
    setDraft(fresh);
    LstRun(setSaving, props.toast, '恢复默认值', function () {
      return Api.saveValues(preset.id, fresh)
        .then(syncDeclaration)
        .then(function (sync) { return finishSave(sync, '已恢复为预设定义的默认值'); });
    });
  };

  if (!state) {
    return h(UiEmpty, { title: '正在读取预设配置…', hint: '如果一直没有变化，回到列表刷新一次。' });
  }
  if (!presetId) {
    return h(UiEmpty, { title: '没有指定预设', hint: '回到列表点一行，进入它的参数配置。' });
  }
  if (!preset) {
    return h(ParBuiltinView, {
      ctx: props.ctx,
      sessionId: props.sessionId,
      state: state,
      presetId: presetId,
      rosterEntry: rosterEntry,
      reload: props.reload,
      setMode: props.setMode,
      toast: props.toast,
    });
  }

  var locked = !!(state.dsh && state.dsh.sessionPresetLocked);
  var fromForm = !!(preset.form && Array.isArray(preset.form.rule) && preset.form.rule.length > 0);
  var userBadges = [
    h(UiBadge, { key: 'origin', tone: 'default', title: 'origin: user —— 本插件管理的用户预设' }, '用户(user)'),
  ];
  if (rosterEntry) userBadges.push(h(UiBadge, { key: 'override', tone: 'warn', title: 'DSH 里也有同名预设，当前生效的是这个用户预设' }, '覆盖内置'));
  if (state.dsh && state.dsh.sessionPreset === preset.id) userBadges.push(h(UiBadge, { key: 'current', tone: 'ok' }, '当前'));
  if (rosterEntry && rosterEntry.isDefault) userBadges.push(h(UiBadge, { key: 'default', tone: 'default' }, '默认'));
  if (dirty) userBadges.push(h(UiBadge, { key: 'dirty', tone: 'warn' }, '有未保存的修改'));

  var form;
  if (rule.length === 0) {
    form = h(UiEmpty, {
      title: '这个预设还没有参数',
      hint: '到「编辑」模式添加参数，或点「从参数生成界面」生成低代码表单。',
    });
  } else {
    form = h(LcForm, {
      rule: rule,
      value: values,
      ctx: props.ctx,
      mode: 'fill',
      renderPrompt: function (first, second) {
        // LcForm 的 prompt-preview 控件会按 (rule,values)/(values,rule)/(rule)/(values)
        // 四种签名轮流试探（见 30-form.js 的 lcPreviewText），所以这里不假定第一个参数
        // 是提示词文本：字符串就是文本；对象若是 rule 项且带 props.prompt 字面量
        // （CONTRACT §4.2）就用它；否则一律渲染本预设的 prompt。
        var item = null;
        if (first && typeof first === 'object' && !Array.isArray(first) && (first.type || first.field)) item = first;
        else if (second && typeof second === 'object' && !Array.isArray(second) && (second.type || second.field)) item = second;
        var literal = item && item.props && typeof item.props.prompt === 'string' && item.props.prompt !== ''
          ? item.props.prompt
          : null;
        var text = typeof first === 'string' ? first : (typeof second === 'string' ? second : (literal || preset.prompt));
        return ParRenderText(text, values, preset.params, props.renderPrompt);
      },
      onChange: function (next) {
        setDraft(next && typeof next === 'object' ? LstWith(next, {}) : LstWith(values, {}));
      },
    });
  }

  return h(
    'div',
    { style: PAR_STYLE.pane },
    h(
      Toolbar,
      null,
      h(
        'div',
        { style: LST_STYLE.toolbarRow },
        h(LstEnableButton, {
          key: 'enable',
          ctx: props.ctx,
          sessionId: props.sessionId,
          presetId: preset.id,
          name: preset.name || preset.id,
          reload: props.reload,
          toast: props.toast,
          locked: locked,
          label: '启用此预设',
        }),
        h(
          UiButton,
          {
            key: 'edit',
            size: 'sm',
            icon: 'edit',
            onClick: function () { if (props.setMode) props.setMode(MODE_EDIT, { presetId: preset.id }); },
          },
          '切换到编辑模式'
        ),
        h(
          UiButton,
          {
            key: 'back',
            size: 'sm',
            variant: 'ghost',
            icon: 'back',
            onClick: function () { if (props.setMode) props.setMode(MODE_LIST, {}); },
          },
          '返回列表'
        )
      )
    ),
    h(
      UiSection,
      { title: preset.name || preset.id },
      h(
        'div',
        { style: PAR_STYLE.header },
        h('div', { style: PAR_STYLE.badges }, userBadges),
        h('div', { style: PAR_STYLE.desc }, preset.description || '（没有描述）'),
        h('div', { style: LST_STYLE.rowId }, preset.id)
      )
    ),
    h(
      UiSection,
      {
        title: '参数（按本次任务微调）',
        actions: h(
          'div',
          { style: LST_STYLE.actions },
          h(
            UiButton,
            { size: 'sm', icon: 'save', disabled: saving || !dirty, onClick: saveValues, title: dirty ? '把当前取值存为该预设的默认值' : '没有改动' },
            saving ? '保存中…' : '保存为我的默认值'
          ),
          h(
            UiButton,
            { size: 'sm', variant: 'ghost', icon: 'refresh', disabled: saving, onClick: resetValues, title: '丢弃已保存的取值，回到预设定义的默认值' },
            '恢复默认值'
          )
        ),
      },
      h(
        'div',
        { style: PAR_STYLE.form },
        h(LstNote, null,
          '界面来源：' + (fromForm ? '预设自带的低代码 rule（form.rule）' : '由参数定义自动生成（params → rule）')
          + '。这里的取值只影响「' + (preset.name || preset.id) + '」这一个预设。'
          + 'AI 读到的提示词是「发布到 DSH」那一刻烘好的固定文本，所以「保存」会同时把新取值写进声明 ——'
          + '但仍需重启 profile、并在新会话里才会生效（已开始的会话保持它启动时的版本）。'),
        form
      )
    ),
    h(
      UiSection,
      { title: '引用（由编辑模式决定）' },
      h(
        'div',
        { style: PAR_STYLE.form },
        h('div', { style: PAR_STYLE.muted }, 'MCP'),
        h(ParRefBadges, { state: state, kind: 'mcp', ids: preset.mcp, emptyText: '没有引用任何 MCP。' }),
        h('div', { style: PAR_STYLE.muted }, 'Skills'),
        h(ParRefBadges, { state: state, kind: 'skills', ids: preset.skills, emptyText: '没有引用任何 Skill。' })
      )
    ),
    h(
      UiSection,
      { title: '渲染后的提示词（实时预览）' },
      h(
        'div',
        { style: PAR_STYLE.form },
        h(LstNote, null, '正文里的 ' + '{{ $参数名 }}' + ' 已按上面的取值替换；空值回落到参数默认值。'),
        h('pre', { style: LST_STYLE.pre }, preview === '' ? '（提示词为空）' : preview)
      )
    ),
    // 弹窗容器是 position:fixed，挂在面板这一层就能全屏居中。
    restartNotice
      ? h(ParRestartNotice, {
        info: restartNotice,
        onClose: function () { setRestartNotice(null); },
      })
      : null
  );
}

/* ============================ 60-edit.js ============================ */
/* ------------------------------------------------------------------ *
 * Edit mode — the authoring surface of the plugin.
 *
 * Five stacked sections, in the order a preset is actually authored:
 *   1. basics        id / name / description / order
 *   2. prompt        the persona text plus its `{{ $param }}` placeholders
 *   3. params        the ParamSpec table (name / label / type / default)
 *   4. form          the low-code rule that drives parameter mode
 *   5. mcp + skills  what this preset mounts on top of the base agent
 * A sticky action bar closes the view: save / save & publish / delete / back.
 *
 * The draft lives in component state; every write goes through `Api.*` and is
 * followed by `reload()`, so the host stays the single owner of the files.
 * ------------------------------------------------------------------ */

/** Param names a preset may declare (`ParamSpec.name` and `{{ $name }}`). */
const ED_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** Preset ids — same shape `toPresetId` mints and the host validates. */
const ED_ID_RE = /^[a-z0-9][a-z0-9-]*$/;
/** The `{{ $name }}` placeholder, source form so it can be re-instantiated. */
const ED_PLACEHOLDER_SOURCE = '\\{\\{\\s*\\$([A-Za-z_][A-Za-z0-9_]*)\\s*\\}\\}';

/** ParamSpec types the editor offers (contract §2.4). */
const ED_PARAM_TYPES = [
  { label: '文本', value: 'text' },
  { label: '多行文本', value: 'textarea' },
  { label: '数字', value: 'number' },
  { label: '下拉选择', value: 'select' },
  { label: '单选组', value: 'radio' },
  { label: '多选组', value: 'checkbox' },
  { label: '开关', value: 'switch' },
  { label: '滑块', value: 'slider' },
];
/** Types that carry an `options` list. */
const ED_OPTION_TYPES = { select: true, radio: true, checkbox: true };
/** Types that carry `min` / `max` / `step`. */
const ED_RANGE_TYPES = { number: true, slider: true };
/** Low-code rule type ← ParamSpec type, for the local fallbacks only. */
const ED_RULE_TYPE_OF = {
  text: 'input',
  textarea: 'textarea',
  number: 'number',
  select: 'select',
  radio: 'radio',
  checkbox: 'checkbox',
  switch: 'switch',
  slider: 'slider',
};

const ED_CARD_STYLE = {
  border: '1px solid var(--dsw-alias-border-l3, rgba(127,127,127,0.28))',
  borderRadius: 8,
  padding: 8,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};
const ED_GRID2_STYLE = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 };
const ED_MUTED_STYLE = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: 12,
  lineHeight: 1.5,
  // Multi-line prose must wrap inside its own column instead of running under
  // the controls beside it.
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
};
const ED_NOTICE_STYLE = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 8,
  borderRadius: 8,
  background: 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,0.08))',
};
const ED_PRE_STYLE = {
  margin: 0,
  padding: 8,
  borderRadius: 6,
  background: 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,0.08))',
  color: 'var(--dsw-alias-label-primary, inherit)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 12,
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: 240,
  overflow: 'auto',
};
const ED_CODE_STYLE = {
  fontSize: 11,
  color: 'var(--dsw-alias-label-secondary, inherit)',
  wordBreak: 'break-all',
};
const ED_STACK_STYLE = { display: 'flex', flexDirection: 'column', gap: 8 };
const ED_CHIPROW_STYLE = { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', minWidth: 0 };
const ED_ROW_STYLE = {
  display: 'flex',
  gap: 10,
  alignItems: 'flex-start',
  padding: '10px 8px',
  minWidth: 0,
  borderTop: '1px solid var(--dsw-alias-border-l3, rgba(127,127,127,0.18))',
};
const ED_TOP_STYLE = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  alignItems: 'center',
  paddingBottom: 8,
  borderBottom: '1px solid var(--dsw-alias-border-l3, rgba(127,127,127,0.28))',
};
const ED_ACTIONS_STYLE = {
  position: 'sticky',
  bottom: 0,
  zIndex: 1,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  alignItems: 'center',
  padding: '8px 0',
  background: 'var(--dsw-alias-bg-layer-1, transparent)',
  borderTop: '1px solid var(--dsw-alias-border-l3, rgba(127,127,127,0.28))',
};
const ED_SPACER_STYLE = { flex: '1 1 auto' };

/* ---------------------------- small helpers ---------------------------- */

/** Never-throwing string coercion (undefined/null → ''). */
function EdStr(value) {
  return value === undefined || value === null ? '' : String(value);
}

/** Coerce to an array; anything else becomes an empty one. */
function EdArr(value) {
  return Array.isArray(value) ? value : [];
}

/** Human/JSON text for an unknown value (used for read-only blob display). */
function EdText(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  return EdJson(value);
}

/** `JSON.stringify` that never throws. */
function EdJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return '';
  }
}

/** Deep copy of plain JSON data; falls back to the original on failure. */
function EdClone(value) {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return value;
  }
}

/** The message of an unknown error value. */
function EdMessage(error) {
  if (!error) return '未知错误';
  if (typeof error === 'string') return error;
  if (error.message) return String(error.message);
  return String(error);
}

/** A finite number or the fallback. */
function EdNumber(value, fallback) {
  var n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** The best default value for a ParamSpec type (contract §2.4). */
function EdDefaultForType(type) {
  if (type === 'switch') return false;
  if (type === 'checkbox') return [];
  if (type === 'number' || type === 'slider') return 0;
  return '';
}

/** `{ name: default }` for every parameter, used to preview the prompt. */
function EdDefaultValues(params) {
  var out = {};
  var list = EdArr(params);
  for (var i = 0; i < list.length; i += 1) {
    var param = list[i] || {};
    if (!param.name) continue;
    out[param.name] = param.default === undefined ? EdDefaultForType(param.type) : param.default;
  }
  return out;
}

/** A brand new ParamSpec, pre-filled the way its type wants to look. */
function EdNewParam(type) {
  var kind = type || 'text';
  var param = {
    name: '',
    label: '',
    type: kind,
    default: EdDefaultForType(kind),
    description: '',
    required: false,
  };
  if (ED_OPTION_TYPES[kind]) {
    param.options = [{ label: '选项一', value: 'option-1' }];
    if (kind !== 'checkbox') param.default = 'option-1';
  }
  if (ED_RANGE_TYPES[kind]) {
    param.min = 0;
    param.max = 100;
    param.step = 1;
    param.default = 0;
  }
  return param;
}

/** Re-type a ParamSpec, keeping what still makes sense and repairing the rest. */
function EdRetypeParam(param, type) {
  var current = param || {};
  var kind = type || 'text';
  var next = {
    name: EdStr(current.name),
    label: EdStr(current.label),
    type: kind,
    description: EdStr(current.description),
    required: current.required === true,
    default: EdDefaultForType(kind),
  };
  var options = EdArr(current.options);
  if (ED_OPTION_TYPES[kind]) {
    next.options = options.length ? EdClone(options) : [{ label: '选项一', value: 'option-1' }];
    if (kind === 'checkbox') {
      next.default = Array.isArray(current.default) ? current.default.slice() : [];
    } else {
      var kept = false;
      for (var i = 0; i < next.options.length; i += 1) {
        if (next.options[i] && next.options[i].value === current.default) kept = true;
      }
      next.default = kept ? current.default : next.options[0].value;
    }
    return next;
  }
  if (kind === 'switch') {
    next.default = typeof current.default === 'boolean' ? current.default : false;
    return next;
  }
  if (ED_RANGE_TYPES[kind]) {
    next.min = typeof current.min === 'number' ? current.min : 0;
    next.max = typeof current.max === 'number' ? current.max : 100;
    next.step = typeof current.step === 'number' ? current.step : 1;
    next.default = typeof current.default === 'number' ? current.default : next.min;
    return next;
  }
  next.default = typeof current.default === 'string' ? current.default : '';
  return next;
}

/** Normalise a ParamSpec down to the fields the contract defines. */
function EdCleanParam(param) {
  var source = param || {};
  var type = source.type || 'text';
  var out = {
    name: EdStr(source.name).trim(),
    label: EdStr(source.label),
    type: type,
    default: source.default === undefined ? EdDefaultForType(type) : source.default,
  };
  if (ED_OPTION_TYPES[type]) {
    out.options = EdArr(source.options).map(function (option) {
      return { label: EdStr(option && option.label), value: option && option.value };
    });
  }
  if (ED_RANGE_TYPES[type]) {
    out.min = EdNumber(source.min, 0);
    out.max = EdNumber(source.max, 100);
    out.step = EdNumber(source.step, 1);
  }
  if (source.description) out.description = EdStr(source.description);
  if (source.required === true) out.required = true;
  return out;
}

/** Every `{{ $name }}` in the text, de-duplicated, in order of appearance. */
function EdScanPlaceholders(text) {
  var source = EdStr(text);
  var re = new RegExp(ED_PLACEHOLDER_SOURCE, 'g');
  var found = [];
  var seen = {};
  var match = re.exec(source);
  while (match !== null) {
    if (!seen[match[1]]) {
      seen[match[1]] = true;
      found.push(match[1]);
    }
    match = re.exec(source);
  }
  return found;
}

/** Replace `[start, end)` of the text — the primitive behind cursor inserts. */
function EdReplaceRange(text, start, end, insert) {
  var source = EdStr(text);
  var from = clamp(EdNumber(start, source.length), 0, source.length);
  var to = clamp(EdNumber(end, from), from, source.length);
  return source.slice(0, from) + insert + source.slice(to);
}

/** `{ index, message }` for every parameter name that cannot be saved. */
function EdParamIssues(params) {
  var list = EdArr(params);
  var issues = [];
  var seen = {};
  for (var i = 0; i < list.length; i += 1) {
    var name = EdStr(list[i] && list[i].name).trim();
    if (!name) {
      issues.push({ index: i, message: '第 ' + (i + 1) + ' 个参数的参数名为空' });
    } else if (!ED_NAME_RE.test(name)) {
      issues.push({ index: i, message: '参数名「' + name + '」不合法：只能用字母、数字、下划线，且不能以数字开头' });
    } else if (seen[name]) {
      issues.push({ index: i, message: '参数名「' + name + '」重复' });
    } else {
      seen[name] = true;
    }
  }
  return issues;
}

/** Everything that blocks a save, as user-facing sentences (empty = ok). */
function EdValidateDraft(draft) {
  var source = draft || {};
  var issues = [];
  var id = EdStr(source.id).trim();
  if (!id) issues.push('预设 ID 不能为空');
  else if (!ED_ID_RE.test(id)) issues.push('预设 ID 只能用小写字母、数字和连字符，且以字母或数字开头');
  if (!EdStr(source.name).trim()) issues.push('预设名称不能为空');
  var paramIssues = EdParamIssues(EdArr(source.params));
  if (paramIssues.length) issues.push('参数定义有误：' + paramIssues[0].message);
  issues = issues.concat(EdPluginRowIssues(EdArr(source.plugins)));
  return issues;
}

/* ------------------------- Cordis 插件行（plugins） ------------------------- */

/* `id` 用 Loader 的 row id 规则；`name` 是包名或 cordis:group 之类的内置行。 */
const ED_PLUGIN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

/** 一行里允许出现的键；其余键一律丢弃（host 的 normalizePlugins 同样只认这些）。 */
const ED_PLUGIN_ROW_KEYS = ['id', 'name', 'config', 'disabled', 'inject', 'intercept', 'isolate', 'group'];

/**
 * 把任意输入洗成「一行」的形状。非对象、缺 id/name 的项一律丢弃，
 * 这样从 JSON 里读到脏数据也不会把声明文件写坏。
 * @returns {{ok: boolean, row: object|null, reason: string}}
 */
function EdCleanPluginRow(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, row: null, reason: '不是 JSON 对象' };
  }
  var id = EdStr(value.id).trim();
  var name = EdStr(value.name).trim();
  if (!id) return { ok: false, row: null, reason: '缺少 id' };
  if (!ED_PLUGIN_ID_RE.test(id)) return { ok: false, row: null, reason: 'id「' + id + '」含非法字符' };
  if (!name) return { ok: false, row: null, reason: '缺少 name' };
  var row = { id: id, name: name };
  for (var i = 0; i < ED_PLUGIN_ROW_KEYS.length; i += 1) {
    var key = ED_PLUGIN_ROW_KEYS[i];
    if (key === 'id' || key === 'name') continue;
    if (value[key] === undefined || value[key] === null) continue;
    row[key] = EdClone(value[key]);
  }
  return { ok: true, row: row, reason: '' };
}

/** 整份插件清单的校验：返回面向用户的句子数组（空数组 = 没问题）。 */
function EdPluginRowIssues(list) {
  var issues = [];
  var rows = EdArr(list);
  var seen = {};
  for (var i = 0; i < rows.length; i += 1) {
    var cleaned = EdCleanPluginRow(rows[i]);
    if (!cleaned.ok) {
      issues.push('插件清单第 ' + (i + 1) + ' 行有误：' + cleaned.reason);
      continue;
    }
    if (seen[cleaned.row.id] === true) {
      issues.push('插件清单里行 id「' + cleaned.row.id + '」重复；同一预设内的行 id 必须唯一，否则加载器会撞名');
      continue;
    }
    seen[cleaned.row.id] = true;
  }
  return issues;
}

/**
 * 清洗整份插件清单（用于「应用 JSON」）。
 * @returns {{ok: boolean, rows: Array, message: string}}
 */
function EdCleanPluginList(value) {
  if (!Array.isArray(value)) return { ok: false, rows: [], message: '插件清单必须是一个数组（Row[]）' };
  var rows = [];
  var seen = {};
  for (var i = 0; i < value.length; i += 1) {
    var cleaned = EdCleanPluginRow(value[i]);
    if (!cleaned.ok) return { ok: false, rows: [], message: '第 ' + (i + 1) + ' 行有误：' + cleaned.reason };
    if (seen[cleaned.row.id] === true) return { ok: false, rows: [], message: '行 id「' + cleaned.row.id + '」重复' };
    seen[cleaned.row.id] = true;
    rows.push(cleaned.row);
  }
  return { ok: true, rows: rows, message: '' };
}

/** The stored (user-owned) definition for an id, or null. */
function EdPresetSource(state, presetId) {
  if (!state || !presetId || !Array.isArray(state.presets)) return null;
  for (var i = 0; i < state.presets.length; i += 1) {
    var preset = state.presets[i];
    if (preset && preset.id === presetId) return preset;
  }
  return null;
}

/** The live DSH roster entry for an id, or null. */
function EdRosterEntry(state, presetId) {
  var roster = state && state.dsh && Array.isArray(state.dsh.roster) ? state.dsh.roster : [];
  if (!presetId) return null;
  for (var i = 0; i < roster.length; i += 1) {
    if (roster[i] && roster[i].id === presetId) return roster[i];
  }
  return null;
}

/** How many stored presets reference a catalogue entry. */
function EdReferenceCount(state, key, id) {
  var presets = state && Array.isArray(state.presets) ? state.presets : [];
  var count = 0;
  for (var i = 0; i < presets.length; i += 1) {
    if (presets[i] && EdArr(presets[i][key]).indexOf(id) !== -1) count += 1;
  }
  return count;
}

/* --------------------- form-engine calls (contract §4.3) --------------------- */

/** The rule that drives a preset's parameter form. */
function EdRuleFromPreset(preset) {
  if (preset && preset.form && Array.isArray(preset.form.rule)) return EdClone(preset.form.rule);
  return EdRuleFromParams(preset ? preset.params : []);
}

/** Rule[] for ParamSpec[] — prefers the shared engine, keeps a local fallback. */
function EdRuleFromParams(params) {
  if (typeof ruleFromParams === 'function') {
    try {
      return EdClone(EdArr(ruleFromParams(params)));
    } catch (error) {
      console.error('[agent-preset-editor] ruleFromParams failed', error);
    }
  }
  var list = EdArr(params);
  var rule = [];
  for (var i = 0; i < list.length; i += 1) {
    var param = list[i] || {};
    var type = param.type || 'text';
    var item = {
      type: ED_RULE_TYPE_OF[type] || 'input',
      field: EdStr(param.name),
      title: EdStr(param.label || param.name),
      value: param.default === undefined ? EdDefaultForType(type) : param.default,
    };
    if (param.description) item.info = EdStr(param.description);
    var props = {};
    if (ED_OPTION_TYPES[type]) props.options = EdClone(EdArr(param.options));
    if (ED_RANGE_TYPES[type]) {
      props.min = param.min;
      props.max = param.max;
      props.step = param.step;
    }
    if (Object.keys(props).length) item.props = props;
    if (param.required === true) item.validate = [{ required: true, message: '必填' }];
    if (item.field) rule.push(item);
  }
  return rule;
}

/** ParamSpec[] for Rule[] — prefers the shared engine, keeps a local fallback. */
function EdParamsFromRule(rule) {
  if (typeof paramsFromRule === 'function') {
    try {
      return EdClone(EdArr(paramsFromRule(rule)));
    } catch (error) {
      console.error('[agent-preset-editor] paramsFromRule failed', error);
    }
  }
  var list = EdArr(rule);
  var params = [];
  for (var i = 0; i < list.length; i += 1) {
    var item = list[i] || {};
    if (!item.field) continue;
    var props = item.props || {};
    var type = item.type === 'input' ? 'text' : item.type;
    var known = false;
    for (var t = 0; t < ED_PARAM_TYPES.length; t += 1) {
      if (ED_PARAM_TYPES[t].value === type) known = true;
    }
    if (!known) type = 'text';
    var spec = {
      name: EdStr(item.field),
      label: EdStr(item.title || item.field),
      type: type,
      default: item.value === undefined ? EdDefaultForType(type) : item.value,
    };
    if (ED_OPTION_TYPES[type]) spec.options = EdClone(EdArr(props.options));
    if (ED_RANGE_TYPES[type]) {
      spec.min = props.min;
      spec.max = props.max;
      spec.step = props.step;
    }
    var validate = EdArr(item.validate);
    if (validate.length && validate[0] && validate[0].required === true) spec.required = true;
    if (item.info) spec.description = EdStr(item.info);
    params.push(spec);
  }
  return params;
}

/** `{ field: value }` from the rule's own `value` fields. */
function EdValuesFromRule(rule) {
  if (typeof valuesFromRule === 'function') {
    try {
      return valuesFromRule(rule) || {};
    } catch (error) {
      console.error('[agent-preset-editor] valuesFromRule failed', error);
    }
  }
  var out = {};
  var list = EdArr(rule);
  for (var i = 0; i < list.length; i += 1) {
    var item = list[i] || {};
    if (item.field) out[item.field] = item.value;
  }
  return out;
}

/** Write one control's value back into the rule (the form designer's onChange). */
function EdRuleSetValue(rule, field, value) {
  return EdArr(rule).map(function (item) {
    if (item && item.field === field) return Object.assign({}, item, { value: value });
    return item;
  });
}

/* ------------------------------ prompt rendering ------------------------------ */

/** Contract §2.5 rendering, used only while the shell's renderPrompt is absent. */
function EdRenderPromptLocal(prompt, values, params) {
  var list = EdArr(params);
  var map = {};
  for (var i = 0; i < list.length; i += 1) {
    if (list[i] && list[i].name) map[list[i].name] = list[i];
  }
  var bag = values || {};
  return EdStr(prompt).replace(new RegExp(ED_PLACEHOLDER_SOURCE, 'g'), function (whole, name) {
    var spec = map[name];
    var value = Object.prototype.hasOwnProperty.call(bag, name) ? bag[name] : undefined;
    if (value === undefined || value === null || value === '') value = spec ? spec.default : undefined;
    if (value === undefined || value === null || value === '') return '';
    if (Array.isArray(value)) return value.join('、');
    if (typeof value === 'boolean') return value ? '是' : '否';
    return String(value);
  });
}

/** Render the prompt through the shell's renderer, falling back locally. */
function EdRenderPromptText(prompt, values, params) {
  if (typeof renderPrompt === 'function') {
    try {
      return EdStr(renderPrompt(prompt, values, params));
    } catch (error) {
      console.error('[agent-preset-editor] renderPrompt failed', error);
    }
  }
  return EdRenderPromptLocal(prompt, values, params);
}

/* ------------------------------- draft model ------------------------------- */

/** The editable draft for a preset id (a fresh one when the id is unknown). */
function EdDraftFrom(state, presetId) {
  var stored = EdPresetSource(state, presetId);
  var roster = EdRosterEntry(state, presetId);
  var source = stored || {};
  return {
    id: EdStr(stored ? stored.id : presetId),
    name: EdStr(source.name || (roster && roster.name) || ''),
    description: EdStr(source.description || (roster && roster.description) || ''),
    order: typeof source.order === 'number' ? source.order : 0,
    prompt: EdStr(source.prompt),
    params: EdClone(EdArr(source.params)) || [],
    rule: EdRuleFromPreset(stored),
    mcp: EdArr(source.mcp).slice(),
    skills: EdArr(source.skills).slice(),
    plugins: EdClone(EdArr(source.plugins)) || [],
  };
}

/** The PresetDefinition the host stores (timestamps belong to the host). */
function EdBuildDefinition(draft) {
  var source = draft || {};
  return {
    id: EdStr(source.id).trim(),
    name: EdStr(source.name).trim(),
    description: EdStr(source.description).trim(),
    order: EdNumber(source.order, 0),
    prompt: EdStr(source.prompt),
    params: EdArr(source.params).map(EdCleanParam),
    form: { rule: EdClone(EdArr(source.rule)) || [] },
    // 原始 Cordis 行必须显式带上：host 的 normalizePlugins 见到这个键才会替换，
    // 不带就等于「本次没提供插件清单」，store 会沿用上一次落盘的值。
    plugins: EdClone(EdArr(source.plugins)) || [],
    mcp: EdArr(source.mcp).slice(),
    skills: EdArr(source.skills).slice(),
  };
}

/* -------------------------------- section 1 -------------------------------- */
/* Top bar: jump to parameter mode, or make this preset the session's preset.  */

function EdTopBar(props) {
  var dsh = (props.state && props.state.dsh) || {};
  var draft = props.draft || {};
  var isCurrent = !!dsh.sessionPreset && dsh.sessionPreset === draft.id;
  return h('div', { style: ED_TOP_STYLE },
    h(UiButton, {
      size: 'sm',
      icon: 'sliders',
      disabled: !draft.id,
      title: '打开该预设的参数配置界面',
      onClick: props.onOpenParams,
    }, '参数配置'),
    h(UiButton, {
      size: 'sm',
      icon: 'play',
      variant: 'primary',
      disabled: props.busy || !draft.id,
      title: '把当前会话切换到该预设；已经开始任务的会话无法切换',
      onClick: props.onEnable,
    }, '启用此预设'),
    isCurrent ? h(UiBadge, { tone: 'ok' }, '当前会话') : null,
    dsh.sessionPresetLocked ? h(UiBadge, { tone: 'warn' }, '会话已锁定') : null
  );
}

/** The basics: id (locked once it exists), name, description, order. */
function EdBasicsSection(props) {
  var draft = props.draft || {};
  var idError = '';
  if (draft.id && !ED_ID_RE.test(EdStr(draft.id))) idError = '只能用小写字母、数字、连字符';
  return h(UiSection, { title: '基础信息' },
    h(UiField, {
      label: '预设 ID',
      required: true,
      error: idError,
      info: props.idLocked
        ? 'ID 与 DSH 预设 id 相同，保存后不可修改（换 ID 等于新建一个预设）'
        : '保存后不可修改；留空会在保存时报错',
    }, h(UiInput, {
      value: EdStr(draft.id),
      disabled: props.idLocked || props.busy,
      placeholder: 'design-doc-writer',
      onChange: props.onId,
    })),
    props.showIdHelper
      ? h(UiButton, {
        size: 'sm',
        variant: 'ghost',
        disabled: !EdStr(draft.name).trim(),
        onClick: props.onIdFromName,
      }, '由名称生成 ID')
      : null,
    h(UiField, { label: '名称' }, h(UiInput, {
      value: EdStr(draft.name),
      placeholder: '设计文档 Agent',
      onChange: props.onName,
    })),
    h(UiField, { label: '描述' }, h(UiInput, {
      value: EdStr(draft.description),
      placeholder: '把需求转化为设计文档',
      onChange: props.onDescription,
    })),
    h(UiField, {
      label: '排序',
      info: '数字越小越靠前（列表中）',
    }, h(UiInput, {
      type: 'number',
      value: EdStr(draft.order),
      onChange: props.onOrder,
    })),
    props.overrideNotice
      ? h('div', { style: ED_NOTICE_STYLE },
        h('div', null, '「' + EdStr(draft.id) + '」当前来自 DSH 内置声明。'),
        h('div', { style: ED_MUTED_STYLE }, '保存后会在插件里生成一个同名预设，覆盖内置声明的展示；内置声明的原始内容只能只读查看。'),
        h('div', { style: ED_CHIPROW_STYLE },
          h(UiButton, {
            size: 'sm',
            icon: 'refresh',
            disabled: props.sourceLoading,
            onClick: props.onReadBuiltin,
          }, '查看内置声明'),
          props.sourceError ? h(UiBadge, { tone: 'err' }, props.sourceError) : null
        ),
        props.sourceContent
          ? h('pre', { style: ED_PRE_STYLE }, props.sourceContent)
          : null
      )
      : null
  );
}

/* -------------------------------- section 2 -------------------------------- */
/* The prompt itself: textarea, placeholder scan and cursor-accurate inserts.  */

/**
 * 把提示词里的 `{{ $name }}` 包进只带背景的 span，交给 UiTextarea 的高亮层。
 *
 * 高亮层与 textarea 必须逐字符对齐，所以这里**只切分、不增删**：原文的每一段都原样
 * 进入节点树，唯一的例外是末尾那个零宽空格 —— 它不占宽度，只用来防止最后一行恰好是
 * 空行时高亮层比 textarea 少一行。
 * @param {string} text - 提示词原文。
 * @returns {Array} 可直接作为 children 的节点数组。
 */
function EdHighlightPrompt(text) {
  var source = EdStr(text);
  var nodes = [];
  var re = new RegExp(ED_PLACEHOLDER_SOURCE, 'g');
  var last = 0;
  var index = 0;
  var match = re.exec(source);
  while (match !== null) {
    if (match.index > last) nodes.push(source.slice(last, match.index));
    nodes.push(h('span', { key: 'ph' + index, className: 'ape-textarea-mark' }, match[0]));
    index += 1;
    last = match.index + match[0].length;
    // 零长匹配会让 exec 原地打转；正常语法不会走到这里，留着只是不给自己留死循环。
    if (match[0] === '') re.lastIndex += 1;
    match = re.exec(source);
  }
  if (last < source.length) nodes.push(source.slice(last));
  nodes.push('\u200b');
  return nodes;
}

/** One click-to-insert chip for a parameter placeholder. */
function EdPlaceholderChip(props) {
  return h(UiButton, {
    size: 'sm',
    variant: 'ghost',
    title: '在光标处插入 ' + props.text,
    onClick: props.onInsert,
  }, props.text);
}

function EdPromptSection(props) {
  var draft = props.draft || {};
  var params = EdArr(draft.params);
  var prompt = EdStr(draft.prompt);
  var wrapRef = useRef(null);
  var inputRef = useRef(null);
  var pendingCaret = useRef(null);

  /** The live <textarea>, via UiTextarea's inputRef (or a wrapper lookup). */
  function fieldNode() {
    var node = inputRef.current;
    if (node && typeof node.setSelectionRange === 'function') return node;
    var wrap = wrapRef.current;
    if (wrap && typeof wrap.querySelector === 'function') return wrap.querySelector('textarea');
    return null;
  }

  var detected = useMemo(function () { return EdScanPlaceholders(prompt); }, [prompt]);
  var defined = useMemo(function () {
    return EdArr(params).map(function (param) { return EdStr(param && param.name); }).filter(Boolean);
  }, [params]);
  var labelOf = useMemo(function () {
    var map = {};
    EdArr(params).forEach(function (param) {
      if (param && param.name) map[param.name] = EdStr(param.label || param.name);
    });
    return map;
  }, [params]);
  var missing = detected.filter(function (name) { return defined.indexOf(name) === -1; });
  var unused = defined.filter(function (name) { return detected.indexOf(name) === -1; });

  // Restore the caret after an insert re-rendered the textarea.
  useEffect(function () {
    if (pendingCaret.current === null) return;
    var caret = pendingCaret.current;
    pendingCaret.current = null;
    var node = fieldNode();
    if (!node) return;
    try {
      node.focus();
      var at = clamp(caret, 0, EdStr(node.value).length);
      node.setSelectionRange(at, at);
    } catch (error) {
      /* a textarea without selection support simply keeps focus */
    }
  });

  /** Insert `snippet` at the caret and park the caret `offset` chars later. */
  function insertSnippet(snippet, offset) {
    var node = fieldNode();
    var start = node ? node.selectionStart : prompt.length;
    var end = node ? node.selectionEnd : start;
    var next = EdReplaceRange(prompt, start, end, snippet);
    var caret = clamp(EdNumber(start, 0), 0, next.length) + EdNumber(offset, snippet.length);
    pendingCaret.current = clamp(caret, 0, next.length);
    props.onPrompt(next);
  }

  function addMissing() {
    var additions = missing.map(function (name) {
      var spec = EdNewParam('text');
      spec.name = name;
      spec.label = name;
      spec.default = '';
      return spec;
    });
    props.onParams(params.concat(additions));
    if (props.toast) props.toast.show('已为 ' + missing.length + ' 个未定义占位补上参数（请补默认值）', 'ok');
  }

  var preview = EdRenderPromptText(prompt, EdDefaultValues(params), params);

  return h(UiSection, {
    title: 'Agent 预设提示词',
    actions: h(EdPlaceholderChip, {
      text: '插入 {{ $ }}',
      onInsert: function () { insertSnippet('{{ $ }}', 4); },
    }),
  },
    h('div', { style: ED_MUTED_STYLE }, '这段文本会成为该预设的 persona 前缀。用 {{ $参数名 }} 把可变部分抽成参数，用户在「参数配置」模式里按任务微调。'),
    h('div', { ref: wrapRef }, h(UiTextarea, {
      value: prompt,
      rows: 10,
      inputRef: inputRef,
      // 正文里的 {{ $name }} 在此高亮成绿底，写作时一眼能看出参数落在哪。
      highlight: EdHighlightPrompt,
      placeholder: '你是 {{ $role }}。\n任务类型：{{ $taskType }}\n',
      onChange: props.onPrompt,
    })),
    defined.length
      ? h('div', { style: ED_CHIPROW_STYLE },
        h('span', { style: ED_MUTED_STYLE }, '点击插入已定义参数：'),
        defined.map(function (name) {
          var snippet = '{{ $' + name + ' }}';
          return h(EdPlaceholderChip, {
            key: name,
            text: labelOf[name] || name,
            onInsert: function () { insertSnippet(snippet, snippet.length); },
          });
        }))
      : null,
    h('div', { style: ED_NOTICE_STYLE },
      h('div', { style: ED_CHIPROW_STYLE },
        h('span', { style: ED_MUTED_STYLE }, '正文里识别到的参数：'),
        detected.length
          ? detected.map(function (name) {
            var known = defined.indexOf(name) !== -1;
            return h(UiBadge, { key: name, tone: known ? 'ok' : 'warn' },
              '{{ $' + name + ' }}' + (known ? '' : ' · 未定义'));
          })
          : h('span', { style: ED_MUTED_STYLE }, '（还没有占位）')
      ),
      missing.length
        ? h('div', { style: ED_CHIPROW_STYLE },
          h(UiBadge, { tone: 'warn' }, '正文中未定义参数 ' + missing.length + ' 个'),
          h(UiButton, { size: 'sm', icon: 'plus', onClick: addMissing }, '一键补全参数定义')
        )
        : null,
      unused.length
        ? h('div', { style: ED_MUTED_STYLE }, '已定义但正文未使用：' + unused.join('、'))
        : null
    ),
    h('div', null,
      h('div', { style: ED_MUTED_STYLE }, '按默认值实时预览：'),
      h('pre', { style: ED_PRE_STYLE }, preview || '（提示词为空）')
    )
  );
}

/* -------------------------------- section 3 -------------------------------- */
/* The ParamSpec table: name / label / type / default / description.          */

/** Editor for one entry of `options` (select / radio / checkbox only). */
function EdParamOptionsEditor(props) {
  var options = EdArr(props.options);
  function patchAt(index, field, value) {
    props.onChange(options.map(function (option, i) {
      if (i !== index) return option;
      var next = Object.assign({}, option || {});
      next[field] = value;
      return next;
    }));
  }
  return h('div', { style: ED_STACK_STYLE },
    h('div', { style: ED_MUTED_STYLE }, '选项（标签 = 用户看到的文字，值 = 传给提示词的值）'),
    options.map(function (option, index) {
      return h('div', {
        key: index,
        style: { display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, alignItems: 'center' },
      },
        h(UiInput, {
          value: EdStr(option && option.label),
          placeholder: '标签',
          onChange: function (value) { patchAt(index, 'label', value); },
        }),
        h(UiInput, {
          value: EdStr(option && option.value),
          placeholder: '值',
          onChange: function (value) { patchAt(index, 'value', value); },
        }),
        h(UiButton, {
          size: 'sm',
          variant: 'ghost',
          icon: 'trash',
          title: '删除该选项',
          onClick: function () {
            props.onChange(options.filter(function (_option, i) { return i !== index; }));
          },
        })
      );
    }),
    h(UiButton, {
      size: 'sm',
      icon: 'plus',
      onClick: function () {
        props.onChange(options.concat([{ label: '选项' + (options.length + 1), value: '' }]));
      },
    }, '添加选项')
  );
}

/** Default-value editor whose control follows the parameter's type. */
function EdParamDefaultEditor(props) {
  var param = props.param || {};
  var type = param.type || 'text';
  if (type === 'switch') {
    return h(UiSwitch, {
      checked: param.default === true,
      label: param.default === true ? '默认开启' : '默认关闭',
      onChange: props.onChange,
    });
  }
  if (ED_OPTION_TYPES[type]) {
    var options = EdArr(param.options).filter(function (option) { return option && option.value !== undefined; });
    if (!options.length) {
      return h(UiInput, {
        value: EdStr(param.default),
        placeholder: '默认值（先添加选项）',
        onChange: props.onChange,
      });
    }
    if (type === 'checkbox') {
      return h(UiCheckGroup, {
        value: EdArr(param.default),
        options: options,
        onChange: props.onChange,
      });
    }
    return h(UiSelect, {
      value: EdStr(param.default),
      options: options,
      onChange: props.onChange,
    });
  }
  if (ED_RANGE_TYPES[type]) {
    return h(UiInput, {
      type: 'number',
      value: EdStr(param.default),
      onChange: function (text) { props.onChange(text === '' ? '' : Number(text)); },
    });
  }
  return h(UiInput, {
    value: EdStr(param.default),
    placeholder: '默认值',
    onChange: props.onChange,
  });
}

/** One parameter definition, as a card (the sidebar is too narrow for a grid). */
function EdParamCard(props) {
  var param = props.param || {};
  var type = param.type || 'text';
  function patch(partial) {
    props.onChange(Object.assign({}, param, partial));
  }
  return h('div', { style: ED_CARD_STYLE },
    h('div', { style: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, alignItems: 'end' } },
      h(UiField, {
        label: '参数名',
        required: true,
        error: props.issue,
        info: '提示词里用 {{ $' + EdStr(param.name || 'name') + ' }} 引用',
      }, h(UiInput, {
        value: EdStr(param.name),
        placeholder: 'taskType',
        onChange: function (value) { patch({ name: value.trim() }); },
      })),
      h(UiButton, {
        size: 'sm',
        variant: 'ghost',
        icon: 'trash',
        title: '删除该参数',
        onClick: props.onRemove,
      })
    ),
    h('div', { style: ED_GRID2_STYLE },
      h(UiField, { label: '标签' }, h(UiInput, {
        value: EdStr(param.label),
        placeholder: '任务类型',
        onChange: function (value) { patch({ label: value }); },
      })),
      h(UiField, { label: '类型' }, h(UiSelect, {
        value: type,
        options: ED_PARAM_TYPES,
        onChange: props.onRetype,
      }))
    ),
    h(UiField, {
      label: '默认值',
      info: '默认值 = 该预设的最优值；用户可在参数配置模式里按任务微调',
    }, h(EdParamDefaultEditor, {
      param: param,
      onChange: function (value) { patch({ default: value }); },
    })),
    h(UiField, { label: '说明' }, h(UiInput, {
      value: EdStr(param.description),
      placeholder: '可选，显示在表单控件下方',
      onChange: function (value) { patch({ description: value }); },
    })),
    ED_OPTION_TYPES[type]
      ? h(EdParamOptionsEditor, {
        options: param.options,
        onChange: function (value) { patch({ options: value }); },
      })
      : null,
    h(UiSwitch, {
      checked: param.required === true,
      label: '必填',
      onChange: function (value) { patch({ required: value }); },
    })
  );
}

function EdParamsSection(props) {
  var params = EdArr(props.params);
  var issues = EdParamIssues(params);
  var issueOf = {};
  for (var i = 0; i < issues.length; i += 1) {
    if (issueOf[issues[i].index] === undefined) issueOf[issues[i].index] = issues[i].message;
  }
  return h(UiSection, {
    title: '参数定义（' + params.length + '）',
    actions: h(UiButton, {
      size: 'sm',
      icon: 'plus',
      onClick: function () { props.onChange(params.concat([EdNewParam('text')])); },
    }, '添加参数'),
  },
    h('div', { style: ED_MUTED_STYLE }, '每个参数都要给一个「最优默认值」——那是这个预设推荐的做法；用户在参数配置模式里只做按任务的微调，不动定义。'),
    params.length
      ? h('div', { style: ED_STACK_STYLE }, params.map(function (param, index) {
        return h(EdParamCard, {
          key: index,
          param: param,
          issue: issueOf[index] || '',
          onChange: function (next) {
            props.onChange(params.map(function (item, i) { return i === index ? next : item; }));
          },
          onRetype: function (type) {
            props.onChange(params.map(function (item, i) {
              return i === index ? EdRetypeParam(item, type) : item;
            }));
          },
          onRemove: function () {
            props.onChange(params.filter(function (_item, i) { return i !== index; }));
          },
        });
      }))
      : h(UiEmpty, { title: '还没有参数', hint: '参数让提示词可以在不改正文的前提下按任务变化。' }),
    issues.length
      ? h('div', { style: ED_CHIPROW_STYLE }, h(UiBadge, { tone: 'err' }, issues.length + ' 处参数名需要修正'))
      : null
  );
}

/* -------------------------------- section 4 -------------------------------- */
/* Low-code form design: the very rule the parameter mode renders.            */

function EdFormSection(props) {
  var draft = props.draft || {};
  var rule = EdArr(draft.rule);
  var ruleJson = useMemo(function () { return EdJson(rule); }, [rule]);
  var values = useMemo(function () { return EdValuesFromRule(rule); }, [rule]);
  var jsonState = useState(ruleJson);
  var jsonText = jsonState[0];
  var setJsonText = jsonState[1];
  var touchedState = useState(false);
  var jsonTouched = touchedState[0];
  var setJsonTouched = touchedState[1];

  // Follow the rule unless the user is mid-edit in the JSON box.
  useEffect(function () {
    if (!jsonTouched) setJsonText(ruleJson);
  }, [ruleJson, jsonTouched]);

  function onFormChange(nextValue, field, val) {
    var value = val === undefined ? (nextValue ? nextValue[field] : undefined) : val;
    props.onRule(EdRuleSetValue(rule, field, value));
  }

  function generateRule() {
    var next = EdRuleFromParams(EdArr(draft.params));
    props.onRule(next);
    if (props.toast) props.toast.show('已按 ' + EdArr(draft.params).length + ' 个参数生成界面（rule 共 ' + next.length + ' 项）', 'ok');
  }

  function backfillParams() {
    var next = EdParamsFromRule(rule);
    props.onParams(next);
    if (props.toast) props.toast.show('已用界面回填 ' + next.length + ' 个参数定义', 'ok');
  }

  function applyJson() {
    var parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (error) {
      if (props.toast) props.toast.show('rule JSON 解析失败：' + EdMessage(error), 'err');
      return;
    }
    if (!Array.isArray(parsed)) {
      if (props.toast) props.toast.show('rule 必须是一个数组（Rule[]），当前不是，已保留原内容', 'err');
      return;
    }
    setJsonTouched(false);
    props.onRule(parsed);
    if (props.toast) props.toast.show('已应用 rule JSON（' + parsed.length + ' 项）', 'ok');
  }

  var formNode = typeof LcForm === 'function'
    ? h(LcForm, {
      rule: rule,
      value: values,
      onChange: onFormChange,
      ctx: props.ctx,
      mode: 'edit',
      renderPrompt: EdRenderPromptText,
    })
    : h(UiEmpty, { title: '表单引擎未就绪', hint: '缺少 LcForm（src/client/parts/30-form.js）' });

  return h(UiSection, {
    title: '低代码界面开发',
    actions: h('div', { style: ED_CHIPROW_STYLE },
      h(UiButton, { size: 'sm', icon: 'refresh', onClick: generateRule }, '从参数生成界面'),
      h(UiButton, { size: 'sm', icon: 'check', onClick: backfillParams }, '从界面回填参数')
    ),
  },
    h('div', { style: ED_MUTED_STYLE },
      '下面这个表单就是用户在「参数配置」模式里看到的界面本身（rule）。改某个控件的取值，等于改它在该界面上的默认值；',
      '控件的类型、标题、字段名和列宽请在下面的 rule JSON 里改。',
      '「从参数生成界面」会用参数表重建它，「从界面回填参数」则把界面里的字段同步回参数表。'),
    formNode,
    h(UiField, {
      label: 'rule JSON',
      info: '直接编辑后点「应用 JSON」；解析失败或不是数组时不会覆盖现有界面',
    }, h(UiTextarea, {
      value: jsonText,
      rows: 8,
      placeholder: '[]',
      onChange: function (value) {
        setJsonTouched(true);
        setJsonText(value);
      },
    })),
    h('div', { style: ED_CHIPROW_STYLE },
      h(UiButton, { size: 'sm', variant: 'primary', icon: 'check', disabled: !jsonTouched, onClick: applyJson }, '应用 JSON'),
      h(UiButton, {
        size: 'sm',
        variant: 'ghost',
        disabled: !jsonTouched,
        onClick: function () { setJsonTouched(false); setJsonText(ruleJson); },
      }, '放弃 JSON 改动'),
      jsonTouched ? h(UiBadge, { tone: 'warn' }, 'JSON 有未应用的改动') : h(UiBadge, { tone: 'default' }, 'JSON 与界面一致')
    )
  );
}

/* ------------------------ section 4b: 原始 Cordis 插件行 ------------------------ */
/* Web profile 把整个 agent 平面交给预设自己挂载，所以这一节常常是「有没有工具」的分水岭。 */

function EdPluginsSection(props) {
  var draft = props.draft || {};
  var list = EdArr(draft.plugins);
  var listJson = useMemo(function () { return EdJson(list); }, [list]);
  var jsonState = useState(listJson);
  var jsonText = jsonState[0];
  var setJsonText = jsonState[1];
  var touchedState = useState(false);
  var jsonTouched = touchedState[0];
  var setJsonTouched = touchedState[1];

  // Follow the row list unless the user is mid-edit in the JSON box.
  useEffect(function () {
    if (!jsonTouched) setJsonText(listJson);
  }, [listJson, jsonTouched]);

  var issues = EdPluginRowIssues(list);
  var ids = [];
  for (var i = 0; i < list.length; i += 1) {
    var cleaned = EdCleanPluginRow(list[i]);
    if (cleaned.ok) ids.push(cleaned.row.id);
  }

  function applyJson() {
    var parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (error) {
      if (props.toast) props.toast.show('插件清单 JSON 解析失败：' + EdMessage(error), 'err');
      return;
    }
    var cleaned = EdCleanPluginList(parsed);
    if (!cleaned.ok) {
      if (props.toast) props.toast.show('插件清单不可用：' + cleaned.message + '（已保留原内容）', 'err');
      return;
    }
    setJsonTouched(false);
    props.onPlugins(cleaned.rows);
    if (props.toast) props.toast.show('已应用插件清单（' + cleaned.rows.length + ' 行）', 'ok');
  }

  return h(UiSection, {
    title: '挂载插件（原始 Cordis 行）',
    actions: h('span', { style: ED_CODE_STYLE },
      list.length + ' 行' + (ids.length ? '：' + ids.join(' / ') : '')),
  },
    h('div', { style: ED_MUTED_STYLE },
      '这一节写的是这个预设自己要挂载的 Cordis 行（Row）。Web 界面把 agent 平面交给了预设：',
      '不在这里挂 tool-fs / tool-pwsh / tool-web / skill-filesystem / tool-skill 等行，',
      '这个预设的 agent 就读不了文件、跑不了命令、上不了网。'),
    h('div', { style: ED_NOTICE_STYLE },
      '第 1 行固定是 persona（由提示词渲染，不用手写）；这里写的行会插在 persona 之后、MCP 与 Skills 行之前。',
      '行 id 在同一预设内必须唯一；config 里的 !!js 表达式在本编辑器里只能按字符串保存，',
      '需要求值的表达式请直接改 profile 的 cordis.patch.yml。'),
    issues.length
      ? h('div', { style: ED_NOTICE_STYLE }, '存在会被加载器拒绝的问题：', h('br', null), issues.join('；'))
      : null,
    h(UiField, {
      label: '插件行 JSON',
      info: '数组，每项至少 { id, name }，可带 config / disabled / inject / isolate / group。改完点「应用 JSON」才会写进草稿。',
    }, h(UiTextarea, {
      value: jsonText,
      rows: 12,
      placeholder: '[]',
      onChange: function (value) {
        setJsonTouched(true);
        setJsonText(value);
      },
    })),
    h('div', { style: ED_CHIPROW_STYLE },
      h(UiButton, { size: 'sm', variant: 'primary', icon: 'check', disabled: !jsonTouched, onClick: applyJson }, '应用 JSON'),
      h(UiButton, {
        size: 'sm',
        variant: 'ghost',
        disabled: !jsonTouched,
        onClick: function () { setJsonTouched(false); setJsonText(listJson); },
      }, '放弃 JSON 改动'),
      jsonTouched ? h(UiBadge, { tone: 'warn' }, 'JSON 有未应用的改动') : h(UiBadge, { tone: 'default' }, 'JSON 与草稿一致'),
      issues.length ? h(UiBadge, { tone: 'err' }, '有 ' + issues.length + ' 个问题') : null
    )
  );
}

/* ------------------------------ section 5 / 6 ------------------------------ */
/* Which catalogue entries this preset actually mounts.                       */

function EdCatalogPicker(props) {
  var entries = EdArr(props.entries);
  var selected = EdArr(props.selected);
  var searchState = useState('');
  var query = searchState[0];
  var setQuery = searchState[1];
  var needle = query.trim().toLowerCase();
  var visible = useMemo(function () {
    if (!needle) return entries;
    return entries.filter(function (entry) {
      var hay = (EdStr(entry && entry.id) + ' ' + EdStr(entry && entry.name) + ' ' + EdStr(entry && entry.description)).toLowerCase();
      return hay.indexOf(needle) !== -1;
    });
  }, [entries, needle]);
  var known = {};
  for (var i = 0; i < entries.length; i += 1) {
    if (entries[i] && entries[i].id) known[entries[i].id] = true;
  }
  var orphan = selected.filter(function (id) { return !known[id]; });

  return h(UiSection, {
    title: props.title + '（' + selected.length + '）',
    actions: h(UiButton, { size: 'sm', icon: 'plus', onClick: props.onOpenCatalog }, props.createLabel),
  },
    h('div', { style: ED_MUTED_STYLE }, props.note),
    entries.length > 3
      ? h(UiSearch, { value: query, onChange: setQuery, placeholder: '搜索' + props.title })
      : null,
    orphan.length
      ? h('div', { style: ED_CHIPROW_STYLE },
        h(UiBadge, { tone: 'warn' }, '引用了不存在的条目：' + orphan.join('、')),
        h('div', { style: ED_MUTED_STYLE }, '它仍会写进预设，但发布时会被 host 跳过或报错，建议改成现有条目。'))
      : null,
    visible.length
      ? h('div', null, visible.map(function (entry) {
        var id = EdStr(entry && entry.id);
        var checked = selected.indexOf(id) !== -1;
        var refs = EdReferenceCount(props.state, props.refKey, id);
        return h('div', { key: id, style: ED_ROW_STYLE },
          h(UiSwitch, {
            checked: checked,
            onChange: function (value) { props.onToggle(id, value); },
          }),
          h('div', { style: { flex: '1 1 auto', minWidth: 0, maxWidth: '100%', wordBreak: 'break-word', overflowWrap: 'anywhere' } },
            h('div', { style: ED_CHIPROW_STYLE },
              h('span', null, EdStr(entry.name || id)),
              h('code', { style: ED_CODE_STYLE }, id),
              entry && entry.enabled === false ? h(UiBadge, { tone: 'warn' }, '已停用') : null,
              checked && entry && entry.enabled === false ? h(UiBadge, { tone: 'err' }, '本预设仍会引用') : null
            ),
            entry && entry.description
              ? h('div', { style: ED_MUTED_STYLE }, EdStr(entry.description))
              : null,
            h('div', { style: ED_MUTED_STYLE }, '被 ' + refs + ' 个预设引用')
          )
        );
      }))
      : h(UiEmpty, {
        title: entries.length ? '没有匹配的条目' : '目录还是空的',
        hint: entries.length ? '换个关键词试试。' : '先在' + props.title + '页签里新建一个，再回来勾选。',
      })
  );
}

/* -------------------------------- action bar -------------------------------- */

function EdActionBar(props) {
  return h('div', { style: ED_ACTIONS_STYLE },
    h(UiButton, { size: 'sm', icon: 'back', onClick: props.onBack }, '返回列表'),
    props.dirty ? h(UiBadge, { tone: 'warn' }, '有未保存改动') : h(UiBadge, { tone: 'default' }, '已同步'),
    h('div', { style: ED_SPACER_STYLE }),
    props.canDelete
      ? h(UiButton, {
        size: 'sm',
        variant: 'danger',
        icon: 'trash',
        disabled: props.busy,
        onClick: props.onDelete,
      }, '删除')
      : null,
    h(UiButton, {
      size: 'sm',
      icon: 'save',
      disabled: props.busy || !props.dirty,
      onClick: props.onSave,
    }, '保存'),
    h(UiButton, {
      size: 'sm',
      variant: 'primary',
      icon: 'check',
      disabled: props.busy,
      onClick: props.onPublish,
    }, '保存并发布到 DSH')
  );
}

/* --------------------------------- the view --------------------------------- */

function EditMode(props) {
  var state = props.state;
  var toast = props.toast;
  var presetId = EdStr(props.presetId);
  var stored = EdPresetSource(state, presetId);
  var rosterEntry = EdRosterEntry(state, presetId);
  var canDelete = !!stored;

  var draftState = useState(null);
  var draft = draftState[0];
  var setDraft = draftState[1];
  var baselineState = useState('');
  var baseline = baselineState[0];
  var setBaseline = baselineState[1];
  var busyState = useState(false);
  var busy = busyState[0];
  var setBusy = busyState[1];
  var confirmState = useState(null);
  var confirm = confirmState[0];
  var setConfirm = confirmState[1];
  var sourceState = useState(null);
  var sourceView = sourceState[0];
  var setSourceView = sourceState[1];
  var adoptState = useState(false);
  var adopt = adoptState[0];
  var setAdopt = adoptState[1];

  // Re-seed the draft whenever another preset (or a fresh load) shows up.
  var seedKey = presetId + '|' + (stored ? EdStr(stored.updatedAt) : (rosterEntry ? 'roster' : 'new'));
  useEffect(function () {
    var next = EdDraftFrom(props.state, presetId);
    setDraft(next);
    setBaseline(EdJson(next));
    setSourceView(null);
  }, [seedKey]);

  if (!state) {
    return h(UiEmpty, { title: '暂无数据', hint: '正在连接插件后端；若持续如此，请检查 host 半是否加载。' });
  }
  if (!draft) {
    return h('div', { style: ED_STACK_STYLE }, h(UiSpinner, null));
  }
  // A preset id that is neither stored nor in the live roster: the tab is
  // stale (deleted elsewhere, or opened against another profile). Say so
  // instead of quietly turning into a "create a preset with this id" form.
  if (presetId && !stored && !rosterEntry && !adopt) {
    return h('div', { style: ED_STACK_STYLE },
      h(UiEmpty, {
        title: '找不到预设「' + presetId + '」',
        hint: '它可能已被删除，或这个标签页打开时的数据已经过期。',
      }),
      h('div', { style: ED_CHIPROW_STYLE },
        h(UiButton, {
          size: 'sm',
          icon: 'back',
          onClick: function () { props.setMode(MODE_LIST, {}); },
        }, '返回列表'),
        h(UiButton, {
          size: 'sm',
          variant: 'primary',
          icon: 'plus',
          onClick: function () { setAdopt(true); },
        }, '以此 ID 新建预设')
      )
    );
  }

  var dirty = EdJson(draft) !== baseline;

  function patchDraft(partial) {
    setDraft(function (current) { return (current ? Object.assign({}, current, partial) : current); });
  }

  function notify(message, tone) {
    if (toast) toast.show(message, tone);
  }

  function fail(prefix, error) {
    console.error('[agent-preset-editor] ' + prefix, error);
    notify(prefix + '：' + EdMessage(error), 'err');
  }

  function toggleSelection(key, id, checked) {
    var list = EdArr(draft[key]).slice();
    var index = list.indexOf(id);
    if (checked && index === -1) list.push(id);
    if (!checked && index !== -1) list.splice(index, 1);
    var partial = {};
    partial[key] = list;
    patchDraft(partial);
  }

  async function save(options) {
    if (busy) return false;
    var issues = EdValidateDraft(draft);
    if (issues.length) {
      notify(issues[0], 'err');
      return false;
    }
    setBusy(true);
    try {
      await Api.savePreset(EdBuildDefinition(draft));
      setBaseline(EdJson(draft));
      if (props.reload) await props.reload();
      // Publishing chains onto save(); it reports once, with the publish result.
      if (!options || options.silent !== true) {
        notify('已保存预设「' + (draft.name || draft.id) + '」', 'ok');
      }
      return true;
    } catch (error) {
      fail('保存失败', error);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    var id = EdStr(draft.id).trim();
    var ok = await save({ silent: true });
    if (!ok) return;
    setBusy(true);
    try {
      var result = await Api.applyPreset(id);
      var text = '已发布到 DSH';
      if (result && result.mode) text += '（' + result.mode + '）';
      if (result && result.restartRequired) text += '；需要重启 DSH 后生效';
      if (result && result.note) text += '；' + result.note;
      notify(text, 'ok');
    } catch (error) {
      fail('发布失败', error);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await Api.deletePreset(draft.id);
      notify('已删除预设「' + (draft.name || draft.id) + '」', 'ok');
      if (props.reload) await props.reload();
      if (props.setMode) props.setMode(MODE_LIST, {});
    } catch (error) {
      fail('删除失败', error);
    } finally {
      setBusy(false);
    }
  }

  async function enable() {
    var remote = props.ctx && props.ctx.remote;
    if (!remote || !remote.agentPresets || typeof remote.agentPresets.select !== 'function') {
      notify('当前环境不支持切换预设', 'err');
      return;
    }
    setBusy(true);
    try {
      await remote.agentPresets.select(props.sessionId, draft.id);
      notify('已切换到「' + (draft.name || draft.id) + '」', 'ok');
      if (props.reload) await props.reload();
    } catch (error) {
      var message = EdMessage(error);
      if ((error && error.code === 'agent-preset/locked') || /locked/i.test(message)) {
        notify('任务已开始，无法切换预设；请新建会话后再选「' + (draft.name || draft.id) + '」', 'err');
      } else {
        notify('切换失败：' + message, 'err');
      }
    } finally {
      setBusy(false);
    }
  }

  async function readBuiltin() {
    var remote = props.ctx && props.ctx.remote;
    if (!remote || !remote.agentPresets || typeof remote.agentPresets.read !== 'function') {
      notify('当前环境无法读取内置预设', 'err');
      return;
    }
    setSourceView({ loading: true, content: '', error: '' });
    try {
      var result = await remote.agentPresets.read(draft.id);
      setSourceView({
        loading: false,
        content: EdText(result && (result.content !== undefined ? result.content : result.agentPreset)).slice(0, 20000),
        error: '',
      });
    } catch (error) {
      console.error('[agent-preset-editor] read builtin preset failed', error);
      setSourceView({ loading: false, content: '', error: EdMessage(error) });
    }
  }

  function back() {
    if (dirty) {
      setConfirm({
        title: '放弃未保存的改动？',
        body: '「' + (draft.name || draft.id || '未命名预设') + '」还有未保存的改动，返回列表后这些改动会丢失。',
        confirmLabel: '放弃改动并返回',
        danger: true,
        onConfirm: function () { props.setMode(MODE_LIST, {}); },
      });
      return;
    }
    props.setMode(MODE_LIST, {});
  }

  function askDelete() {
    setConfirm({
      title: '删除预设？',
      body: '将删除插件里保存的「' + (draft.name || draft.id) + '」（id: ' + draft.id + '）。已发布到 DSH 的声明需要重新发布才会更新。',
      confirmLabel: '删除',
      danger: true,
      onConfirm: remove,
    });
  }

  var heading = stored
    ? '编辑预设'
    : (rosterEntry ? '编辑内置预设' : '新建预设');
  // The id may only be typed while it does not already mean something.
  var idLocked = !!stored || !!rosterEntry;
  var sourceLabel = stored
    ? h(UiBadge, { tone: 'ok' }, '用户预设')
    : (rosterEntry ? h(UiBadge, { tone: 'warn' }, '内置预设') : h(UiBadge, { tone: 'default' }, '未保存'));

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
    h('div', { style: ED_CHIPROW_STYLE },
      h('strong', null, heading),
      sourceLabel,
      dirty ? h(UiBadge, { tone: 'warn' }, '未保存') : null,
      busy ? h(UiSpinner, null) : null
    ),
    h(EdTopBar, {
      state: state,
      draft: draft,
      busy: busy,
      onOpenParams: function () { props.setMode(MODE_PARAMS, { presetId: draft.id }); },
      onEnable: enable,
    }),
    h(EdBasicsSection, {
      draft: draft,
      busy: busy,
      idLocked: idLocked,
      showIdHelper: !idLocked,
      overrideNotice: !stored && !!rosterEntry,
      sourceLoading: !!(sourceView && sourceView.loading),
      sourceContent: sourceView ? sourceView.content : '',
      sourceError: sourceView ? sourceView.error : '',
      onId: function (value) { patchDraft({ id: value.trim().toLowerCase() }); },
      onIdFromName: function () { patchDraft({ id: toPresetId(draft.name) }); },
      onName: function (value) { patchDraft({ name: value }); },
      onDescription: function (value) { patchDraft({ description: value }); },
      onOrder: function (value) { patchDraft({ order: value === '' ? 0 : Number(value) }); },
      onReadBuiltin: readBuiltin,
    }),
    h(EdPromptSection, {
      draft: draft,
      toast: toast,
      onPrompt: function (value) { patchDraft({ prompt: value }); },
      onParams: function (value) { patchDraft({ params: value }); },
    }),
    h(EdParamsSection, {
      params: draft.params,
      onChange: function (value) { patchDraft({ params: value }); },
    }),
    h(EdFormSection, {
      draft: draft,
      ctx: props.ctx,
      toast: toast,
      onRule: function (value) { patchDraft({ rule: value }); },
      onParams: function (value) { patchDraft({ params: value }); },
    }),
    h(EdPluginsSection, {
      draft: draft,
      toast: toast,
      onPlugins: function (value) { patchDraft({ plugins: value }); },
    }),
    h(EdCatalogPicker, {
      title: 'MCP 配置',
      note: '只有这里勾选的 MCP 才会挂到这个预设上（一个预设一份，互不影响）。目录本身是全局的，没被勾选就不会影响任何预设。',
      createLabel: '新建 MCP',
      entries: state.mcp,
      selected: draft.mcp,
      state: state,
      refKey: 'mcp',
      onToggle: function (id, checked) { toggleSelection('mcp', id, checked); },
      onOpenCatalog: function () { props.setMode(MODE_LIST, { tab: LIST_MCP }); },
    }),
    h(EdCatalogPicker, {
      title: 'Skills 配置',
      note: '只有勾选的 Skill 才会注入这个预设。Skill 正文可以在 Skills 页签里编辑，勾选顺序不影响加载。',
      createLabel: '新建 Skill',
      entries: state.skills,
      selected: draft.skills,
      state: state,
      refKey: 'skills',
      onToggle: function (id, checked) { toggleSelection('skills', id, checked); },
      onOpenCatalog: function () { props.setMode(MODE_LIST, { tab: LIST_SKILLS }); },
    }),
    h(EdActionBar, {
      dirty: dirty,
      busy: busy,
      canDelete: canDelete,
      onBack: back,
      onDelete: askDelete,
      onSave: save,
      onPublish: publish,
    }),
    h(UiModal, {
      open: !!confirm,
      title: confirm ? confirm.title : '',
      onClose: function () { setConfirm(null); },
      footer: confirm
        ? h('div', { style: { display: 'flex', gap: 6, justifyContent: 'flex-end' } },
          h(UiButton, { size: 'sm', onClick: function () { setConfirm(null); } }, '取消'),
          h(UiButton, {
            size: 'sm',
            variant: confirm.danger ? 'danger' : 'primary',
            onClick: function () {
              var action = confirm.onConfirm;
              setConfirm(null);
              if (action) action();
            },
          }, confirm.confirmLabel))
        : null,
    }, confirm ? h('div', { style: ED_MUTED_STYLE }, confirm.body) : null)
  );
}

/* ============================ 70-shell.js ============================ */
/* ------------------------------------------------------------------ *
 * The editor shell: the tab body that hosts the three modes, the sidebar
 * footer button that opens it, and the pieces the modes share — the prompt
 * renderer and the state loader.
 *
 * Mode transitions have one rule, taken from the user's own description
 * ("clicking a preset opens it in a NEW sidebar window, like a file row"):
 *
 *   - opening ANOTHER preset from a tab that has none (the list) mints a new
 *     tab, so every configured preset keeps its own window;
 *   - moving between the params and edit views of the SAME preset stays in
 *     the current tab, which is what the "switch to …" buttons mean.
 * ------------------------------------------------------------------ */

/** Booleans read as 是/否 in a prompt; nullish becomes an empty string. */
function formatParamValue(raw) {
  if (raw === undefined || raw === null) return '';
  if (Array.isArray(raw)) {
    var parts = [];
    for (var i = 0; i < raw.length; i += 1) {
      var piece = formatParamValue(raw[i]);
      if (piece !== '') parts.push(piece);
    }
    return parts.join('、');
  }
  if (typeof raw === 'boolean') return raw ? '是' : '否';
  return String(raw);
}

/**
 * Expand `{{ $name }}` placeholders against the tuned values, falling back to
 * each parameter's declared default. The regex is the contract's §2.5 grammar;
 * index.js implements the identical rule for `/prompt/preview`.
 * @param {string} prompt - the template.
 * @param {object} values - the values the user tuned for this task.
 * @param {Array} params - the preset's ParamSpec list (defaults live here).
 * @returns {string} the prompt the agent would receive.
 */
function renderPrompt(prompt, values, params) {
  var text = typeof prompt === 'string' ? prompt : '';
  var vals = values && typeof values === 'object' ? values : {};
  var specs = Array.isArray(params) ? params : [];
  var byName = {};
  for (var i = 0; i < specs.length; i += 1) {
    var spec = specs[i];
    if (spec && typeof spec.name === 'string') byName[spec.name] = spec;
  }
  return text.replace(/\{\{\s*\$([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, function (match, name) {
    var raw = vals[name];
    if (raw === undefined || raw === null || raw === '') {
      var spec = byName[name];
      raw = spec === undefined ? undefined : spec.default;
    }
    return formatParamValue(raw);
  });
}

/**
 * The fields of a preset the editor edits before it exists server-side.
 * @param {string} id - the preset identity.
 * @returns {object} a blank definition carrying that id.
 */
function blankPreset(id) {
  var stamp = nowIso();
  return {
    id: id,
    name: '',
    description: '',
    order: 100,
    prompt: '',
    params: [],
    form: { rule: [] },
    mcp: [],
    skills: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
}

/** Look a preset definition up in the loaded state. */
function findPreset(state, presetId) {
  if (!state || !Array.isArray(state.presets) || !presetId) return undefined;
  for (var i = 0; i < state.presets.length; i += 1) {
    if (state.presets[i] && state.presets[i].id === presetId) return state.presets[i];
  }
  return undefined;
}

/** Whether a preset id exists anywhere: our own storage or the live roster. */
function presetSourceOf(state, presetId) {
  if (findPreset(state, presetId)) return 'user';
  var roster = state && state.dsh && Array.isArray(state.dsh.roster) ? state.dsh.roster : [];
  for (var i = 0; i < roster.length; i += 1) {
    if (roster[i] && roster[i].id === presetId) return 'system';
  }
  return 'unknown';
}

/** The roster row for a preset id, when the live deployment declares it. */
function rosterRowOf(state, presetId) {
  var roster = state && state.dsh && Array.isArray(state.dsh.roster) ? state.dsh.roster : [];
  for (var i = 0; i < roster.length; i += 1) {
    if (roster[i] && roster[i].id === presetId) return roster[i];
  }
  return undefined;
}

/**
 * Load the editor state and keep a `reload` the views can await after a write.
 * @param {object} ctx - the browser Cordis context.
 * @param {string|undefined} sessionId - the session the tab belongs to.
 * @returns {{state: object|null, loading: boolean, error: string|null, errorCode: string|null, reload: Function}}
 */
function useEditorState(ctx, sessionId) {
  var pair = useState(null);
  var state = pair[0];
  var setState = pair[1];
  var loadPair = useState(true);
  var loading = loadPair[0];
  var setLoading = loadPair[1];
  var errPair = useState(null);
  var error = errPair[0];
  var setError = errPair[1];
  // The code travels with the message so the failure view can tell a dead
  // host route from an in-page bug without parsing prose.
  var codePair = useState(null);
  var errorCode = codePair[0];
  var setErrorCode = codePair[1];
  // A reload counter instead of a bare callback keeps `reload` identity stable
  // for the views while still re-running the effect.
  var bumpPair = useState(0);
  var bump = bumpPair[0];
  var setBump = bumpPair[1];
  var alive = useRef(true);

  useEffect(function () {
    alive.current = true;
    return function () { alive.current = false; };
  }, []);

  useEffect(function () {
    var cancelled = false;
    setLoading(true);
    loadEditorState(ctx, sessionId).then(function (next) {
      if (cancelled || !alive.current) return;
      setState(next);
      setError(null);
      setErrorCode(null);
      setLoading(false);
    }, function (cause) {
      if (cancelled || !alive.current) return;
      setError(cause && cause.message ? cause.message : String(cause));
      setErrorCode(cause && cause.code ? String(cause.code) : null);
      setLoading(false);
    });
    return function () { cancelled = true; };
  }, [ctx, sessionId, bump]);

  var reload = useCallback(function () {
    setBump(function (n) { return n + 1; });
  }, []);

  return { state: state, loading: loading, error: error, errorCode: errorCode, reload: reload };
}

/** Open (or mint) an editor tab in the right Sidebar. */
function openEditorTab(ctx, params) {
  // `sidebarRight` is not in the plugin's `inject` for the same reason the tab
  // registry is not: gating activation on it would disable the whole plugin
  // where the right column is absent. Read it unguarded instead, so a missing
  // service degrades to "nothing happens and the console says why".
  var sidebarRight = safeGet(ctx, 'sidebarRight');
  if (!sidebarRight || typeof sidebarRight.openTab !== 'function') {
    console.error('[agent-preset-editor] sidebarRight.openTab is unavailable');
    return;
  }
  try {
    sidebarRight.openTab(TAB_KIND, { params: params || {} });
  } catch (error) {
    console.error('[agent-preset-editor] openTab failed', error);
  }
}

/** Whether a `select` rejection means the session already started its task. */
function isPresetLockedError(error) {
  if (!error) return false;
  if (error.code === 'agent-preset/locked') return true;
  var text = String(error.message || '');
  return text.indexOf('agent-preset/locked') >= 0 || text.indexOf('locked') >= 0;
}

/**
 * Move the current selection to another preset for this session. The host is
 * the only authority on whether that is still allowed — a session that has
 * started a turn rejects the write with `agent-preset/locked`, which is why
 * the button stays live even when the cached state looks locked.
 * @returns {Promise<{ok: boolean, message: string}>} the outcome to surface.
 */
async function enablePreset(ctx, sessionId, presetId, name) {
  var label = name || presetId;
  if (!ctx || !ctx.remote || !ctx.remote.agentPresets) {
    return { ok: false, message: '宿主未提供 agentPresets 服务' };
  }
  if (!sessionId) {
    return { ok: false, message: '没有可用会话，无法切换预设' };
  }
  try {
    await ctx.remote.agentPresets.select(sessionId, presetId);
    return { ok: true, message: '已把当前会话切换到「' + label + '」' };
  } catch (error) {
    if (isPresetLockedError(error)) {
      return { ok: false, message: '任务已开始，无法切换预设；请新建会话后再选「' + label + '」' };
    }
    return { ok: false, message: '切换失败：' + (error && error.message ? error.message : String(error)) };
  }
}

/** The top strip: mode switch plus the current preset's name. */
function ShellHeader(props) {
  var mode = props.mode;
  var onMode = props.onMode;
  var presetName = props.presetName;
  var onBack = props.onBack;
  var right = props.right;
  return h('div', { className: 'ape-shell-head' },
    h('div', { className: 'ape-shell-headline' },
      props.mode !== MODE_LIST && onBack
        ? h(UiButton, { variant: 'ghost', size: 'sm', icon: 'back', onClick: onBack, title: '返回预设列表' }, '列表')
        : null,
      h('span', { className: 'ape-shell-title' }, presetName || 'Agent 预设'),
    ),
    h('div', { className: 'ape-shell-headright' },
      mode === MODE_LIST ? null : h(Segmented, {
        value: mode,
        onChange: onMode,
        options: [
          { label: '参数配置', value: MODE_PARAMS, icon: 'sliders' },
          { label: '编辑模式', value: MODE_EDIT, icon: 'edit' },
        ],
      }),
      right || null,
    ),
  );
}

/** The tab body the right Sidebar renders. */
function EditorTabBody(props) {
  var ctx = props.ctx;
  var sessionId = props.sessionId;
  var framework = props.useTabInfo;
  var info = typeof framework === 'function' ? framework() : null;
  var nav = info && info.tab && info.tab.navigation ? info.tab.navigation : null;
  var navParams = (nav && nav.params) || {};
  var navRevision = nav ? nav.revision : 0;

  var modePair = useState(navParams.mode || MODE_LIST);
  var mode = modePair[0];
  var setModeRaw = modePair[1];
  var presetPair = useState(navParams.presetId || null);
  var presetId = presetPair[0];
  var setPresetId = presetPair[1];
  var tabPair = useState(navParams.tab || LIST_PRESETS);
  var listTab = tabPair[0];
  var setListTab = tabPair[1];

  // A repeated navigation into the same tab (reveal, retarget) re-seeds the
  // selection; the revision is the only signal that navigation happened.
  var lastRev = useRef(navRevision);
  useEffect(function () {
    if (lastRev.current === navRevision) return;
    lastRev.current = navRevision;
    if (navParams.presetId) setPresetId(navParams.presetId);
    if (navParams.mode) setModeRaw(navParams.mode);
    if (navParams.tab) setListTab(navParams.tab);
  }, [navRevision, navParams.presetId, navParams.mode, navParams.tab]);

  var store = useEditorState(ctx, sessionId);
  var toast = useToast();
  var tip = useRef(null);
  tip.current = toast;

  /**
   * The one entry point the views use for navigation.
   *
   * A tab with no preset is the list: choosing a preset there mints a NEW
   * window, which is the interaction the user asked for. Inside a preset's own
   * window the two modes swap in place.
   */
  var setMode = useCallback(function (nextMode, opts) {
    var options = opts || {};
    var target = options.presetId === undefined ? presetId : options.presetId;
    if (options.tab !== undefined) setListTab(options.tab);
    if (target && target !== presetId) {
      openEditorTab(ctx, {
        presetId: target,
        mode: nextMode || MODE_PARAMS,
        tab: options.tab === undefined ? listTab : options.tab,
      });
      return;
    }
    if (!target && options.presetId && nextMode && nextMode !== MODE_LIST) {
      // The list asked to open a preset that does not exist yet: keep the view
      // in the current tab instead of minting one for an empty id.
      setPresetId(options.presetId);
    }
    setModeRaw(nextMode || MODE_LIST);
  }, [ctx, presetId, listTab]);

  var showToast = useCallback(function (message, tone) {
    if (tip.current && typeof tip.current.show === 'function') tip.current.show(message, tone || 'info');
  }, []);

  var enabledPreset = findPreset(store.state, presetId);
  var rosterRow = presetId ? rosterRowOf(store.state, presetId) : undefined;
  var presetName = enabledPreset && enabledPreset.name
    ? enabledPreset.name
    : (rosterRow && rosterRow.name ? rosterRow.name : presetId);

  var shared = {
    ctx: ctx,
    sessionId: sessionId,
    state: store.state,
    reload: store.reload,
    setMode: setMode,
    toast: { show: showToast },
    showToast: showToast,
    renderPrompt: renderPrompt,
    sourceOf: function (id) { return presetSourceOf(store.state, id); },
    rosterRowOf: function (id) { return rosterRowOf(store.state, id); },
    blankPreset: blankPreset,
    enable: function (id, name) { return enablePreset(ctx, sessionId, id, name); },
  };

  var body = null;
  if (store.loading && store.state === null) {
    body = h(UiSpinner, null);
  } else if (store.error && store.state === null) {
    // Only a transport-level failure implicates the host half. Pointing at the
    // host for an in-page error sends the reader down the wrong path (it did,
    // once: a client-side service read reported "host half not loaded"), so
    // the hint is chosen from the error's own code.
    var isTransport = store.errorCode === 'network'
      || store.errorCode === 'http-404'
      || store.errorCode === 'http-500'
      || store.errorCode === 'http-502'
      || store.errorCode === 'http-503';
    body = h(UiEmpty, {
      title: '无法读取插件数据',
      hint: store.error + (isTransport
        ? '（这是插件后端不可达：确认 dsh 宿主加载了 dsh-agent-preset-editor 的 host 半，且页面已刷新）'
        : '（这是页面内错误，请看浏览器控制台里 [agent-preset-editor] 开头的记录）'),
    });
  } else if (mode === MODE_EDIT) {
    body = h(EditMode, Object.assign({}, shared, { presetId: presetId, mode: mode }));
  } else if (mode === MODE_PARAMS && presetId) {
    body = h(ParamsMode, Object.assign({}, shared, { presetId: presetId, mode: mode }));
  } else if (mode === MODE_PARAMS && !presetId) {
    body = h(UiEmpty, { title: '还没有选中预设', hint: '回到列表点一个预设再进入参数配置' });
  } else if (listTab === LIST_MCP) {
    body = h(McpListMode, Object.assign({}, shared, { tab: listTab, setTab: setListTab }));
  } else if (listTab === LIST_SKILLS) {
    body = h(SkillListMode, Object.assign({}, shared, { tab: listTab, setTab: setListTab }));
  } else {
    body = h(PresetListMode, Object.assign({}, shared, { tab: listTab, setTab: setListTab }));
  }

  return h('div', { className: 'ape-shell', 'data-dsh-agent-preset-editor': '' },
    h(ShellHeader, {
      mode: mode,
      presetName: presetName,
      onMode: function (next) { setMode(next, { presetId: presetId }); },
      onBack: function () { setMode(MODE_LIST); },
      right: store.loading && store.state !== null ? h(UiSpinner, null) : null,
    }),
    h('div', { className: 'ape-shell-body' }, body),
    toast.node,
  );
}

/** The compact button the sidebar foot renders beside Settings. */
function SidebarFooterButton(props) {
  var ctx = props.ctx;
  var wide = props.wide !== false;
  var onClick = useCallback(function () { openEditorTab(ctx, {}); }, [ctx]);
  if (!wide) {
    return h('button', {
      type: 'button',
      className: 'ape-foot rail',
      title: 'Agent 预设',
      'aria-label': 'Agent 预设',
      onClick: onClick,
    }, h(Icon, { name: 'preset', size: 16 }));
  }
  return h('button', {
    type: 'button',
    className: 'ape-foot',
    title: 'Agent 预设',
    onClick: onClick,
  }, h(Icon, { name: 'preset', size: 16 }), h('span', null, 'Agent 预设'));
}

/** The tab chip: the preset's own name once a window is bound to one. */
function EditorTabTitle(props) {
  var framework = props.useTabInfo;
  var info = typeof framework === 'function' ? framework() : null;
  var nav = info && info.tab && info.tab.navigation ? info.tab.navigation : null;
  var navParams = (nav && nav.params) || {};
  var fallback = info && info.tab && info.tab.title ? info.tab.title : 'Agent 预设';
  return h('span', { className: 'ape-chip' }, navParams.presetId ? navParams.presetId : fallback);
}

/* ============================ 80-compose.js ============================ */
/* ------------------------------------------------------------------ *
 * "让 AI 帮我写" —— hand the job back to the running conversation.
 *
 * The MCP and Skill dialogs are good at STORING a definition, not at
 * eliciting one: the user rarely has serverName/transport/command at hand,
 * but they can describe the thing in a sentence. So the dialogs carry a
 * button that drops a filled-in request into the CURRENT session's composer
 * and closes, leaving the user to complete the description and send it. The
 * agent then does the work through the plugin's HTTP API (see AI-USAGE.md).
 *
 * Reaching the composer goes through the conversation service:
 *
 *   conversation.input.for(sessionScope).setDraft(text)
 *
 * Both services are optional, so both are read with `safeGet` — a Cordis
 * context THROWS on a service that is not in `inject`, and neither
 * `conversation` nor `sessions` belongs in this plugin's inject list (the
 * editor must still render in a composition that has no conversation, e.g.
 * a settings-only shell).
 *
 * The wording follows the interface language, read from `<html lang>` (the
 * locale service keeps it in sync — see dsh-client-locale) and falling back
 * to the browser's own preference.
 * ------------------------------------------------------------------ */

/** The language the request is written in. */
function composeLanguage() {
  var tag = '';
  try {
    if (typeof document !== 'undefined' && document.documentElement) {
      tag = String(document.documentElement.lang || '');
    }
  } catch (error) { /* 无 DOM：走下面的兜底 */ }
  if (tag === '') {
    try {
      if (typeof navigator !== 'undefined') {
        tag = String(navigator.language || (navigator.languages && navigator.languages[0]) || '');
      }
    } catch (error) { /* 无 navigator：走默认 */ }
  }
  if (tag === '') return 'zh';
  return /^zh\b/i.test(tag) ? 'zh' : 'en';
}

/**
 * The request text per language and per catalogue.
 *
 * Two constraints shaped the wording: it has to be unambiguous to an agent
 * that has never seen this plugin, and it has to tell the USER what to fill
 * in — the agent cannot invent a server path or a SKILL.md body. So the
 * sentence names the destination, names the plugin, and lists the fields the
 * agent will need.
 */
const COMPOSE_TEXT = {
  mcp: {
    zh: '给 Agent 预设插件添加以下 MCP：\n'
      + '<在这里补充它的信息：项目位置 / 启动命令与参数 / 传输方式（stdio、http 或 sse）/ 用途>',
    en: 'Add the following MCP to the Agent preset plugin:\n'
      + '<fill in the details here — where the project lives, the start command and its arguments, '
      + 'the transport (stdio, http or sse), and what it is for>',
  },
  skill: {
    zh: '给 Agent 预设插件添加以下 Skill：\n'
      + '<在这里补充它的信息：名称 / 用途 / SKILL.md 正文或所在目录>',
    en: 'Add the following Skill to the Agent preset plugin:\n'
      + '<fill in the details here — its name, what it is for, and the SKILL.md body or the directory it lives in>',
  },
  // The preset request needs one extra word of care: "Agent preset plugin" and
  // "Agent preset" sit next to each other in the sentence, so the plugin is
  // named with its own display title and set off by quotes. Everything after
  // the colon is the user's to fill in — the agent cannot invent a purpose.
  preset: {
    zh: '给「Agent 预设编辑器」新增一个 Agent 预设：\n'
      + '<说明它的用途：面向什么任务、AI 该扮演什么角色、需要哪些参数 / MCP / Skills>',
    en: 'Add a new Agent preset to the Agent Preset Editor:\n'
      + '<describe its purpose — the task it targets, the role the agent should play, '
      + 'and the parameters, MCP servers or Skills it needs>',
  },
};

/**
 * The request text for one catalogue in the current interface language.
 * @param {'mcp'|'skill'} kind - which catalogue the button belongs to.
 * @returns {string} the text to place in the composer.
 */
function composeRequestText(kind) {
  var entry = COMPOSE_TEXT[kind] || COMPOSE_TEXT.mcp;
  return entry[composeLanguage()] || entry.zh;
}

/* ---------------------------------------------------------------- *
 * Composer draft insertion.
 *
 * The conversation service exposes the draft as one string
 * (`getSnapshot().draft` + `setDraft`) and has no caret API, so the live
 * caret is read from the composer's own <textarea> and the text is spliced
 * there — matching how the text would land if the user typed it. An
 * unresolvable caret falls back to appending, which is the pre-existing
 * behaviour rather than a failure.
 * ---------------------------------------------------------------- */

/** Locate the composer textarea of the conversation column. */
function composeTextarea() {
  if (typeof document === 'undefined') return null;
  var column = document.querySelector('#root [data-slot="conversation"]');
  var find = function (scope) {
    return scope.querySelector('textarea[data-phase]') || scope.querySelector('textarea');
  };
  return column !== null && column !== undefined
    ? find(column)
    : document.querySelector('textarea[data-phase]');
}

/** The composer's live caret, or null when it cannot be trusted. */
function composeCaret(draft) {
  var el = composeTextarea();
  if (el === null || el === undefined) return null;
  if (el.disabled === true || el.readOnly === true) return null;
  // A caret is only meaningful against the draft it was measured on.
  if (el.value !== draft) return null;
  var start = el.selectionStart;
  var end = el.selectionEnd;
  if (typeof start !== 'number' || typeof end !== 'number') return null;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  start = Math.max(0, Math.min(start, draft.length));
  end = Math.max(start, Math.min(end, draft.length));
  return { start: start, end: end };
}

/**
 * Splice `text` into `draft` at `caret`, replacing any live selection, with
 * single-space joins that never double an existing whitespace.
 * @returns {{draft: string, caretAfter: number}} the new draft and the caret
 *   index that sits right after the inserted text.
 */
function composeSplice(draft, text, caret) {
  if (caret === null || draft === '') {
    var appended = draft.trim() === '' ? text : draft + ' ' + text;
    return { draft: appended, caretAfter: appended.length };
  }
  var prefix = draft.slice(0, caret.start);
  var suffix = draft.slice(caret.end);
  if (prefix === '' && suffix === '') return { draft: text, caretAfter: text.length };
  var left = prefix === '' || /\s$/.test(prefix) ? '' : ' ';
  var right = suffix === '' || /^\s/.test(suffix) ? '' : ' ';
  return {
    draft: prefix + left + text + right + suffix,
    caretAfter: prefix.length + left.length + text.length,
  };
}

/**
 * Put the caret right after the inserted text once the controlled textarea
 * has committed the new value — a programmatic draft change resets it.
 * Retried across a couple of frames and abandoned when the value moved on.
 */
function composePlaceCaret(expectedDraft, caretIndex) {
  var remaining = 2;
  var schedule = function (fn) {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fn);
    else if (typeof setTimeout === 'function') setTimeout(fn, 0);
  };
  var place = function () {
    if (remaining <= 0) return;
    remaining -= 1;
    var el = composeTextarea();
    if (el === null || el === undefined || el.disabled === true || el.readOnly === true) return;
    if (el.value !== expectedDraft) { schedule(place); return; }
    var at = Math.max(0, Math.min(caretIndex, el.value.length));
    try { el.setSelectionRange(at, at); } catch (error) { /* 某些宿主不支持：忽略 */ }
  };
  schedule(place);
}

/** Move keyboard focus to the composer once the dialog has finished closing. */
function composeFocusSoon() {
  var focus = function () {
    var el = composeTextarea();
    if (el === null || el === undefined) return;
    try { el.focus(); } catch (error) { /* 不可聚焦：忽略 */ }
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(function () { requestAnimationFrame(focus); });
  else if (typeof setTimeout === 'function') setTimeout(focus, 32);
}

/**
 * Insert `text` into a session's composer draft at the live caret.
 * @param {object} ctx - the browser Cordis context.
 * @param {string} sessionId - the session whose composer receives the text.
 * @param {string} text - the text to insert.
 * @returns {{ok: boolean, reason: string, detail?: string}} the outcome; the
 *   reason is what the user-facing message is built from.
 */
function composeInsert(ctx, sessionId, text) {
  if (!ctx) return { ok: false, reason: 'no-ctx' };
  // `sessions` is a declared dependency (see 99-epilogue.js): the inject-free
  // `ctx.get` read returned nothing for this service, and every 「让 AI 帮我写」
  // click failed with a message that blamed the wrong thing.
  var sessions = ctx.sessions;
  if (!sessions || typeof sessions.scope !== 'function') return { ok: false, reason: 'no-sessions-service' };
  if (!sessionId) return { ok: false, reason: 'no-session' };
  var scope;
  try {
    scope = sessions.scope(sessionId);
  } catch (error) {
    console.warn('[agent-preset-editor] sessions.scope 抛错', error);
    return { ok: false, reason: 'no-scope', detail: sessionId };
  }
  if (scope === undefined || scope === null) return { ok: false, reason: 'no-scope', detail: sessionId };
  // `conversation` stays an inject-free probe: that IS the documented way to
  // reach it, and a composition without a conversation must still render the
  // editor.
  var conversation = safeGet(ctx, 'conversation');
  if (!conversation || !conversation.input || typeof conversation.input.for !== 'function') {
    return { ok: false, reason: 'no-conversation' };
  }
  var input;
  try {
    input = conversation.input.for(scope);
  } catch (error) {
    console.warn('[agent-preset-editor] conversation.input.for 抛错', error);
    return { ok: false, reason: 'no-input' };
  }
  if (!input || !input.state || typeof input.setDraft !== 'function') return { ok: false, reason: 'no-input' };
  try {
    var draft = input.state.getSnapshot().draft;
    var spliced = composeSplice(draft, text, composeCaret(draft));
    input.setDraft(spliced.draft);
    composePlaceCaret(spliced.draft, spliced.caretAfter);
    return { ok: true, reason: 'ok' };
  } catch (error) {
    console.error('[agent-preset-editor] 草稿写入失败', error);
    return { ok: false, reason: 'write-failed', detail: error && error.message ? error.message : String(error) };
  }
}

/**
 * Failure reason → the sentence the user reads. Deliberately specific: one
 * generic "当前会话不可用" for six different causes cost a full round of
 * misdiagnosis, so each cause now names itself.
 */
const COMPOSE_REASON_TEXT = {
  'no-ctx': '页面上下文缺失',
  'no-session': '这个窗口没有绑定会话',
  'no-sessions-service': '宿主没有提供 sessions 服务',
  'no-scope': '这个会话的作用域还没就绪',
  'no-conversation': '宿主没有提供 conversation 服务（够不到输入机）',
  'no-input': '会话的输入机不可用',
  'write-failed': '写入输入框时出错',
};

/**
 * The dialogs' "让 AI 帮我写" action: put the request into the current
 * session's composer, hand focus to it, and report what happened so the
 * dialog can close and the user can be told.
 *
 * @param {object} ctx - the browser Cordis context.
 * @param {string} sessionId - the session whose composer receives the text.
 * @param {'mcp'|'skill'} kind - which catalogue the request is about.
 * @returns {{ok: boolean, reason: string, message: string, text: string}}
 */
function composeAskAi(ctx, sessionId, kind) {
  var text = composeRequestText(kind);
  var result = composeInsert(ctx, sessionId, text);
  if (result.ok) composeFocusSoon();
  var reason = result.reason || 'unknown';
  var message = COMPOSE_REASON_TEXT[reason] || ('未知原因：' + reason);
  if (reason === 'no-scope' && result.detail) message = message + '（' + result.detail + '）';
  if (reason === 'write-failed' && result.detail) message = message + '：' + result.detail;
  return { ok: result.ok, reason: reason, message: message, text: text };
}

/* ============================ 90-register.js ============================ */
/* ------------------------------------------------------------------ *
 * Registration: the right-Sidebar tab type and its body, the chip title,
 * the sidebar-footer button, and the shell's own stylesheet.
 *
 * Ordering matters and is not obvious. The seat that owns the right column
 * declares the `sidebar.right.pane.tab` slot BEFORE it provides the
 * `sidebarRightTabs` service, so reading the service from a
 * declaration-triggered callback sees `undefined` — and because a declaration
 * never collapses, that body would never run again. Injecting the service
 * (`ctx.inject([...])`) instead re-runs whenever it appears or reappears,
 * which is the lifecycle these registrations need.
 * ------------------------------------------------------------------ */

/** The shell's stylesheet. Host tokens only; no literal colors. */
const SHELL_CSS = [
  '.ape-shell{display:flex;flex-direction:column;height:100%;min-height:0;color:var(--dsw-alias-label-primary);font-size:13px}',
  '.ape-shell-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-bottom:0.5px solid var(--dsw-alias-border-l3);flex:none}',
  '.ape-shell-headline{display:flex;align-items:center;gap:8px;min-width:0}',
  '.ape-shell-title{font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.ape-shell-headright{display:flex;align-items:center;gap:8px;flex:none}',
  '.ape-shell-body{flex:1;min-height:0;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:12px}',
  '.ape-foot{display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;font-size:13px;text-align:left}',
  '.ape-foot:hover{background:var(--dsw-alias-bg-layer-2)}',
  '.ape-foot.rail{width:auto;justify-content:center;padding:6px}',
  '.ape-chip{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
].join('\n');

/**
 * Insert the shell stylesheet once, and take it back out on unload. A plugin
 * stylesheet is not a DOM mutation of the application: it is one owned
 * `<style>` element whose lifetime is the plugin's own.
 * @param {object} ctx - the browser Cordis context.
 * @returns {Function} the disposer.
 */
function installShellStyles(ctx) {
  return ctx.effect(function () {
    var el = document.createElement('style');
    el.setAttribute('data-dsh-agent-preset-editor-styles', '');
    el.textContent = SHELL_CSS;
    document.head.appendChild(el);
    return function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    };
  }, 'dsh-agent-preset-editor: shell styles');
}

/** The guide entry: this is the button the sidebar's guide page offers. */
function guideEntry() {
  return {
    id: PKG,
    order: 40,
    title: function () { return 'Agent预设'; },
    description: function () { return '配置与查看 Agent 预设、参数、MCP 与 Skills'; },
    icon: function (props) { return h(Icon, { name: 'preset', size: props && props.size ? props.size : 16 }); },
  };
}

/**
 * Register the tab type and its body against the right-Sidebar registry.
 * @param {object} ctx - the browser Cordis context.
 * @returns {Function} the disposer of the whole seat.
 */
function registerSidebarTab(ctx) {
  return ctx.inject(['sidebarRightTabs'], function (injected) {
    var tabs = injected.get('sidebarRightTabs');
    if (tabs === undefined || tabs === null || typeof tabs.register !== 'function') return;

    var disposers = [];
    var disposeType = tabs.register({
      id: TAB_TYPE_ID,
      kind: TAB_KIND,
      // One window per preset: `multiple` mints a fresh content address on
      // every open, so opening a second preset does not focus the first.
      multiple: true,
      title: function () { return 'Agent预设'; },
      guide: [guideEntry()],
    });
    disposers.push(disposeType);

    // The body. `inject` hands the component the browser context and the
    // session the tab belongs to; the framework adds `useTabInfo` itself.
    try {
      disposers.push(ctx.slots.inject('sidebar.right.pane.tab', function () {
        return ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: TAB_TYPE_ID,
          inject: function (sessionId) { return { ctx: ctx, sessionId: sessionId }; },
        }, EditorTabBody);
      }));
    } catch (error) {
      console.error('[agent-preset-editor] tab body registration failed', error);
    }

    // The chip title is optional: without it the chip keeps the type's title.
    try {
      disposers.push(ctx.slots.inject('sidebar.right.pane.tab.title', function () {
        return ctx.slots.register({
          name: 'sidebar.right.pane.tab.title',
          key: TAB_TYPE_ID,
        }, EditorTabTitle);
      }));
    } catch (error) {
      console.error('[agent-preset-editor] tab title registration failed', error);
    }

    return function () {
      for (var i = disposers.length - 1; i >= 0; i -= 1) {
        try {
          disposers[i]();
        } catch (error) {
          console.error('[agent-preset-editor] disposer failed', error);
        }
      }
    };
  });
}

/** Register the sidebar-footer button that opens the editor. */
function registerFooterButton(ctx) {
  try {
    return ctx.slots.inject('sidebar.footer.action', function () {
      return ctx.slots.register({
        name: 'sidebar.footer.action',
        id: FOOTER_ID,
        inject: function () { return { ctx: ctx }; },
      }, SidebarFooterButton);
    });
  } catch (error) {
    console.error('[agent-preset-editor] footer button registration failed', error);
    return function () {};
  }
}

/**
 * The client half's entry point.
 * @param {object} ctx - the browser Cordis context.
 */
function apply(ctx) {
  installShellStyles(ctx);
  registerSidebarTab(ctx);
  registerFooterButton(ctx);
}

/* ============================ 99-epilogue.js ============================ */
/* ------------------------------------------------------------------ *
 * Epilogue: the factory's return value.
 *
 * `inject` gates activation on the services the registrations need.
 *
 * Two services are deliberately NOT declared here, and the reason differs:
 *
 * - `sidebarRightTabs` is resolved through `ctx.inject` INSIDE apply, because
 *   the seat declares its slot before it provides the registry: injecting it
 *   eagerly would leave the plugin permanently inactive.
 * - `conversation` is probed with `ctx.get('conversation')` at click time —
 *   that is the documented way to reach it (see dsh-better-sidebar's
 *   context-types: "the composer draft face … lazy `ctx.get` probe").
 *
 * `sessions` IS declared, even though `ctx.get` would be the inject-free
 * read: it is a Context service published through `reflect.provide`, and the
 * app's own plugins declare it exactly this way (dsh-better-sidebar:
 * `inject = ['slots', 'sessions', 'locale', …]`). Reading it through `ctx.get`
 * returned nothing, which is what made「让 AI 帮我写」fail on a live session.
 * ------------------------------------------------------------------ */
return {
  name: PKG,
  inject: ['slots', 'sessions', 'remote', 'remote.agentPresets', 'remote.settings'],
  apply: apply,
};
  },
});
