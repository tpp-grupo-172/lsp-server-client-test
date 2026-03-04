

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_layout.svelte.js')).default;
export const universal = {
  "prerender": true,
  "ssr": false
};
export const universal_id = "src/routes/+layout.ts";
export const imports = ["_app/immutable/nodes/0._UaoN6kO.js","_app/immutable/chunks/DIKLngAn.js","_app/immutable/chunks/CpiJj12Q.js","_app/immutable/chunks/EdmQMHxY.js","_app/immutable/chunks/OCFuseie.js"];
export const stylesheets = [];
export const fonts = [];
