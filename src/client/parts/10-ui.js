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
  return h(Fragment, null,
    apeStyle(),
    h('textarea', {
      ref: setRef,
      className: cx('ape-textarea', disabled && 'ape-is-disabled'),
      rows: rows,
      value: apeStr(p.value, ''),
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
    }));
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
