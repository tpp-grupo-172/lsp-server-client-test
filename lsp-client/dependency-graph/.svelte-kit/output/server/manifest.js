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
		client: {start:"_app/immutable/entry/start.ScTaD3L-.js",app:"_app/immutable/entry/app.BCKRuAwa.js",imports:["_app/immutable/entry/start.ScTaD3L-.js","_app/immutable/chunks/CcVoVP4o.js","_app/immutable/chunks/Dix7VECd.js","_app/immutable/chunks/zcOa4JV2.js","_app/immutable/entry/app.BCKRuAwa.js","_app/immutable/chunks/Dix7VECd.js","_app/immutable/chunks/Q_77LBHA.js","_app/immutable/chunks/Bx95fMlW.js","_app/immutable/chunks/zcOa4JV2.js","_app/immutable/chunks/BcKy2TaP.js","_app/immutable/chunks/Ryg7Bc5S.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js'))
		],
		remotes: {
			
		},
		routes: [
			
		],
		prerendered_routes: new Set(["/"]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
