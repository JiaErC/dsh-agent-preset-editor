/* ------------------------------------------------------------------ *
 * Epilogue: the factory's return value.
 *
 * `inject` gates activation on the services the registrations need. The
 * right-Sidebar registry is resolved through `ctx.inject` INSIDE apply
 * instead of here, because the seat declares its slot before it provides
 * `sidebarRightTabs`: injecting it eagerly would leave the plugin
 * permanently inactive.
 * ------------------------------------------------------------------ */
return {
  name: PKG,
  inject: ['slots', 'remote', 'remote.agentPresets', 'remote.settings'],
  apply: apply,
};
