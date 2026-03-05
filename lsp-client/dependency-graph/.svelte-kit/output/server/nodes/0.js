

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_layout.svelte.js')).default;
export const universal = {
  "prerender": true,
  "ssr": false
};
export const universal_id = "src/routes/+layout.ts";
export const imports = ["_app/immutable/nodes/0.CjKNjinI.js","_app/immutable/chunks/Bx95fMlW.js","_app/immutable/chunks/Dix7VECd.js","_app/immutable/chunks/Ryg7Bc5S.js"];
export const stylesheets = [];
export const fonts = [];
