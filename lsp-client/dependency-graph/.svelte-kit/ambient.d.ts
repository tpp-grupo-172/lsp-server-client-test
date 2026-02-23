
// this file is generated — do not edit it


/// <reference types="@sveltejs/kit" />

/**
 * Environment variables [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env`. Like [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private), this module cannot be imported into client-side code. This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured).
 * 
 * _Unlike_ [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private), the values exported from this module are statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * ```ts
 * import { API_KEY } from '$env/static/private';
 * ```
 * 
 * Note that all environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * 
 * ```
 * MY_FEATURE_FLAG=""
 * ```
 * 
 * You can override `.env` values from the command line like so:
 * 
 * ```sh
 * MY_FEATURE_FLAG="enabled" npm run dev
 * ```
 */
declare module '$env/static/private' {
	export const GJS_DEBUG_TOPICS: string;
	export const PYTHON_BASIC_REPL: string;
	export const LANGUAGE: string;
	export const USER: string;
	export const npm_config_user_agent: string;
	export const XDG_SEAT: string;
	export const XDG_SESSION_TYPE: string;
	export const GIT_ASKPASS: string;
	export const npm_node_execpath: string;
	export const SHLVL: string;
	export const npm_config_noproxy: string;
	export const HOME: string;
	export const CHROME_DESKTOP: string;
	export const OLDPWD: string;
	export const LESS: string;
	export const DESKTOP_SESSION: string;
	export const NVM_BIN: string;
	export const TERM_PROGRAM_VERSION: string;
	export const npm_package_json: string;
	export const GIO_LAUNCHED_DESKTOP_FILE: string;
	export const ZSH: string;
	export const LSCOLORS: string;
	export const NVM_INC: string;
	export const GTK_MODULES: string;
	export const XDG_SEAT_PATH: string;
	export const PAGER: string;
	export const VSCODE_GIT_ASKPASS_MAIN: string;
	export const GK_GL_PATH: string;
	export const VSCODE_GIT_ASKPASS_NODE: string;
	export const npm_config_userconfig: string;
	export const npm_config_local_prefix: string;
	export const DBUS_SESSION_BUS_ADDRESS: string;
	export const CINNAMON_VERSION: string;
	export const PYDEVD_DISABLE_FILE_VALIDATION: string;
	export const BUNDLED_DEBUGPY_PATH: string;
	export const P9K_TTY: string;
	export const VSCODE_PYTHON_AUTOACTIVATE_GUARD: string;
	export const GIO_LAUNCHED_DESKTOP_FILE_PID: string;
	export const COLORTERM: string;
	export const COLOR: string;
	export const NVM_DIR: string;
	export const QT_QPA_PLATFORMTHEME: string;
	export const GTK_IM_MODULE: string;
	export const LOGNAME: string;
	export const _P9K_SSH_TTY: string;
	export const _: string;
	export const npm_config_prefix: string;
	export const npm_config_npm_version: string;
	export const XDG_SESSION_CLASS: string;
	export const USER_ZDOTDIR: string;
	export const XDG_SESSION_ID: string;
	export const TERM: string;
	export const npm_config_cache: string;
	export const GNOME_DESKTOP_SESSION_ID: string;
	export const FC_FONTATIONS: string;
	export const npm_config_node_gyp: string;
	export const PATH: string;
	export const GDM_LANG: string;
	export const GTK3_MODULES: string;
	export const SESSION_MANAGER: string;
	export const NODE: string;
	export const npm_package_name: string;
	export const XDG_SESSION_PATH: string;
	export const XDG_RUNTIME_DIR: string;
	export const GDK_BACKEND: string;
	export const DISPLAY: string;
	export const LANG: string;
	export const XDG_CURRENT_DESKTOP: string;
	export const VSCODE_DEBUGPY_ADAPTER_ENDPOINTS: string;
	export const PYTHONSTARTUP: string;
	export const VSCODE_INJECTION: string;
	export const XMODIFIERS: string;
	export const XDG_SESSION_DESKTOP: string;
	export const XAUTHORITY: string;
	export const LS_COLORS: string;
	export const TERM_PROGRAM: string;
	export const VSCODE_GIT_IPC_HANDLE: string;
	export const npm_lifecycle_script: string;
	export const XDG_GREETER_DATA_DIR: string;
	export const SSH_AUTH_SOCK: string;
	export const SHELL: string;
	export const npm_package_version: string;
	export const npm_lifecycle_event: string;
	export const QT_ACCESSIBILITY: string;
	export const GDMSESSION: string;
	export const GK_GL_ADDR: string;
	export const GPG_AGENT_INFO: string;
	export const GJS_DEBUG_OUTPUT: string;
	export const P9K_SSH: string;
	export const QT_IM_MODULE: string;
	export const XDG_VTNR: string;
	export const VSCODE_GIT_ASKPASS_EXTRA_ARGS: string;
	export const VSCODE_NONCE: string;
	export const npm_config_globalconfig: string;
	export const npm_config_init_module: string;
	export const PWD: string;
	export const npm_execpath: string;
	export const XDG_CONFIG_DIRS: string;
	export const CLUTTER_IM_MODULE: string;
	export const XDG_DATA_DIRS: string;
	export const NVM_CD_FLAGS: string;
	export const ZDOTDIR: string;
	export const _P9K_TTY: string;
	export const npm_config_global_prefix: string;
	export const npm_command: string;
	export const INIT_CWD: string;
	export const EDITOR: string;
}

/**
 * Similar to [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private), except that it only includes environment variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`), and can therefore safely be exposed to client-side code.
 * 
 * Values are replaced statically at build time.
 * 
 * ```ts
 * import { PUBLIC_BASE_URL } from '$env/static/public';
 * ```
 */
declare module '$env/static/public' {
	
}

/**
 * This module provides access to runtime environment variables, as defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`. This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured).
 * 
 * This module cannot be imported into client-side code.
 * 
 * ```ts
 * import { env } from '$env/dynamic/private';
 * console.log(env.DEPLOYMENT_SPECIFIC_VARIABLE);
 * ```
 * 
 * > [!NOTE] In `dev`, `$env/dynamic` always includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 */
declare module '$env/dynamic/private' {
	export const env: {
		GJS_DEBUG_TOPICS: string;
		PYTHON_BASIC_REPL: string;
		LANGUAGE: string;
		USER: string;
		npm_config_user_agent: string;
		XDG_SEAT: string;
		XDG_SESSION_TYPE: string;
		GIT_ASKPASS: string;
		npm_node_execpath: string;
		SHLVL: string;
		npm_config_noproxy: string;
		HOME: string;
		CHROME_DESKTOP: string;
		OLDPWD: string;
		LESS: string;
		DESKTOP_SESSION: string;
		NVM_BIN: string;
		TERM_PROGRAM_VERSION: string;
		npm_package_json: string;
		GIO_LAUNCHED_DESKTOP_FILE: string;
		ZSH: string;
		LSCOLORS: string;
		NVM_INC: string;
		GTK_MODULES: string;
		XDG_SEAT_PATH: string;
		PAGER: string;
		VSCODE_GIT_ASKPASS_MAIN: string;
		GK_GL_PATH: string;
		VSCODE_GIT_ASKPASS_NODE: string;
		npm_config_userconfig: string;
		npm_config_local_prefix: string;
		DBUS_SESSION_BUS_ADDRESS: string;
		CINNAMON_VERSION: string;
		PYDEVD_DISABLE_FILE_VALIDATION: string;
		BUNDLED_DEBUGPY_PATH: string;
		P9K_TTY: string;
		VSCODE_PYTHON_AUTOACTIVATE_GUARD: string;
		GIO_LAUNCHED_DESKTOP_FILE_PID: string;
		COLORTERM: string;
		COLOR: string;
		NVM_DIR: string;
		QT_QPA_PLATFORMTHEME: string;
		GTK_IM_MODULE: string;
		LOGNAME: string;
		_P9K_SSH_TTY: string;
		_: string;
		npm_config_prefix: string;
		npm_config_npm_version: string;
		XDG_SESSION_CLASS: string;
		USER_ZDOTDIR: string;
		XDG_SESSION_ID: string;
		TERM: string;
		npm_config_cache: string;
		GNOME_DESKTOP_SESSION_ID: string;
		FC_FONTATIONS: string;
		npm_config_node_gyp: string;
		PATH: string;
		GDM_LANG: string;
		GTK3_MODULES: string;
		SESSION_MANAGER: string;
		NODE: string;
		npm_package_name: string;
		XDG_SESSION_PATH: string;
		XDG_RUNTIME_DIR: string;
		GDK_BACKEND: string;
		DISPLAY: string;
		LANG: string;
		XDG_CURRENT_DESKTOP: string;
		VSCODE_DEBUGPY_ADAPTER_ENDPOINTS: string;
		PYTHONSTARTUP: string;
		VSCODE_INJECTION: string;
		XMODIFIERS: string;
		XDG_SESSION_DESKTOP: string;
		XAUTHORITY: string;
		LS_COLORS: string;
		TERM_PROGRAM: string;
		VSCODE_GIT_IPC_HANDLE: string;
		npm_lifecycle_script: string;
		XDG_GREETER_DATA_DIR: string;
		SSH_AUTH_SOCK: string;
		SHELL: string;
		npm_package_version: string;
		npm_lifecycle_event: string;
		QT_ACCESSIBILITY: string;
		GDMSESSION: string;
		GK_GL_ADDR: string;
		GPG_AGENT_INFO: string;
		GJS_DEBUG_OUTPUT: string;
		P9K_SSH: string;
		QT_IM_MODULE: string;
		XDG_VTNR: string;
		VSCODE_GIT_ASKPASS_EXTRA_ARGS: string;
		VSCODE_NONCE: string;
		npm_config_globalconfig: string;
		npm_config_init_module: string;
		PWD: string;
		npm_execpath: string;
		XDG_CONFIG_DIRS: string;
		CLUTTER_IM_MODULE: string;
		XDG_DATA_DIRS: string;
		NVM_CD_FLAGS: string;
		ZDOTDIR: string;
		_P9K_TTY: string;
		npm_config_global_prefix: string;
		npm_command: string;
		INIT_CWD: string;
		EDITOR: string;
		[key: `PUBLIC_${string}`]: undefined;
		[key: `${string}`]: string | undefined;
	}
}

/**
 * Similar to [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private), but only includes variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`), and can therefore safely be exposed to client-side code.
 * 
 * Note that public dynamic environment variables must all be sent from the server to the client, causing larger network requests — when possible, use `$env/static/public` instead.
 * 
 * ```ts
 * import { env } from '$env/dynamic/public';
 * console.log(env.PUBLIC_DEPLOYMENT_SPECIFIC_VARIABLE);
 * ```
 */
declare module '$env/dynamic/public' {
	export const env: {
		[key: `PUBLIC_${string}`]: string | undefined;
	}
}
