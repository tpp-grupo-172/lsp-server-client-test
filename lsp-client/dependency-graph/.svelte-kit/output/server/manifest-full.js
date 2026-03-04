export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["robots.txt"]),
	mimeTypes: {".txt":"text/plain"},
	_: {
		client: {start:"_app/immutable/entry/start.BT_CJrgN.js",app:"_app/immutable/entry/app.CHgzub3a.js",imports:["_app/immutable/entry/start.BT_CJrgN.js","_app/immutable/chunks/ElP6LJ7P.js","_app/immutable/chunks/CpiJj12Q.js","_app/immutable/chunks/Cl6pOQSL.js","_app/immutable/entry/app.CHgzub3a.js","_app/immutable/chunks/CpiJj12Q.js","_app/immutable/chunks/BRb-T1Vb.js","_app/immutable/chunks/DIKLngAn.js","_app/immutable/chunks/Cl6pOQSL.js","_app/immutable/chunks/EdmQMHxY.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js')),
			__memo(() => import('./nodes/2.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
