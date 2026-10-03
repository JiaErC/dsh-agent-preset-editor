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
