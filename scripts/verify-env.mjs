const SENSITIVE_ENV = /(?:API[_-]?KEY|AUTH|CREDENTIAL|TOKEN|SECRET|PASSWORD|COOKIE|PROXY|OPENAI|ANTHROPIC|GEMINI|GOOGLE_APPLICATION|AWS_|AZURE_|SSH_|GNUPG|GIT_CONFIG|CLAUDE_CONFIG|NPM_CONFIG_(?:USERCONFIG|GLOBALCONFIG|CACHE|PREFIX))/i;
const HOST_ENV = new Set(['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'PWD', 'OLDPWD', 'INIT_CWD', 'PI_CODING_AGENT_DIR']);
const INJECTION_ENV = new Set(['NODE_OPTIONS', 'NODE_PATH']);

export function verificationEnvironment(env = process.env, { home, temp } = {}) {
  const forced = {
    PI_RUN_LIVE_SUBAGENT_TESTS: '0',
    PI_E2E_LIVE: '0',
    PI_TASKS: 'off',
    PI_RUN_BROWSER_TESTS: '0',
    PI_OFFLINE: '1',
    // pi-ollama discovers models during loading even with PI_OFFLINE; fetch blocks port 1.
    OLLAMA_HOST: 'http://127.0.0.1:1',
    PI_SKIP_VERSION_CHECK: '1',
    PI_TELEMETRY: '0',
    npm_config_offline: 'true',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    npm_config_update_notifier: 'false',
  };
  const reserved = new Set(Object.keys(forced).map(key => key.toUpperCase()));
  const filtered = {};
  for (const [key, value] of Object.entries(env)) {
    const normalized = key.toUpperCase();
    if (!normalized.startsWith('PI_SUBAGENT_') && normalized !== 'PI_SUBAGENTS_CONFIG' && !normalized.startsWith('PI_BROWSER_')
        && !normalized.startsWith('OLLAMA_')
        && !/^(?:PI_)?MCP_/.test(normalized) && !reserved.has(normalized)
        && !SENSITIVE_ENV.test(key) && !INJECTION_ENV.has(normalized)
        && !(home && HOST_ENV.has(normalized))) filtered[key] = value;
  }
  return {
    ...filtered,
    ...(home ? {
      HOME: home,
      USERPROFILE: home,
      APPDATA: `${home}/AppData/Roaming`,
      LOCALAPPDATA: `${home}/AppData/Local`,
      XDG_CONFIG_HOME: `${home}/.config`,
      XDG_CACHE_HOME: `${home}/.cache`,
      PI_CODING_AGENT_DIR: `${home}/.pi/agent`,
      npm_config_cache: `${home}/.npm-cache`,
    } : {}),
    ...(temp ? { TMPDIR: temp, TEMP: temp, TMP: temp } : {}),
    ...forced,
  };
}
