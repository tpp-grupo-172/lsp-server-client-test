import { h as head, e as escape_html } from "../../chunks/index.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let mounted = false;
    head("1uha8ag", $$renderer2, ($$renderer3) => {
      $$renderer3.push(`<base href="/"/>`);
    });
    $$renderer2.push(`<div style="color: white; font-size: 32px; padding: 20px;">mounted: ${escape_html(mounted)}</div> <div style="display: flex; justify-content: center; align-items: center; height: 100vh; color: var(--vscode-editor-foreground);"><div>Loading dependency graph 2...</div></div>`);
  });
}
export {
  _page as default
};
