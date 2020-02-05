const fs = require('fs')
const path = require('path')
const which = require('which')

// #region Common
function isJSFlags (flag) {
  return flag.indexOf('--js-flags=') === 0
}

function sanitizeJSFlags (flag) {
  const test = /--js-flags=(['"])/.exec(flag)
  if (!test) {
    return flag
  }
  const escapeChar = test[1]
  const endExp = new RegExp(`${escapeChar}$`)
  const startExp = new RegExp(`--js-flags=${escapeChar}`)
  return flag.replace(startExp, '--js-flags=').replace(endExp, '')
}

// Return location of msedge.exe file for a given Edge directory.
// (available: "Edge", "Edge Beta", "Edge Dev", "Edge SxS")
function getEdgeExe (edgeDirName) {
  // Only run these checks on win32
  if (process.platform !== 'win32') {
    return null
  }
  let windowsEdgeDirectory
  let i
  let
    prefix
  const suffix = `Microsoft\\${edgeDirName}\\Application\\msedge.exe`
  const prefixes = [process.env.LOCALAPPDATA, process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)']]
  const errors = []

  for (i = 0; i < prefixes.length; i += 1) {
    prefix = prefixes[i]
    try {
      windowsEdgeDirectory = path.join(prefix, suffix)
      fs.accessSync(windowsEdgeDirectory)
      return windowsEdgeDirectory
    } catch (e) {
      errors.push(e)
    }
  }
  return windowsEdgeDirectory
}

function getBin (commands) {
  // Don't run these checks on win32
  if (process.platform !== 'linux') {
    return null
  }
  let bin
  let i
  const errors = []

  for (i = 0; i < commands.length; i += 1) {
    try {
      if (which.sync(commands[i])) {
        bin = commands[i]
        break
      }
    } catch (e) {
      errors.push(e)
    }
  }
  return bin
}

function getEdgeDarwin (defaultPath) {
  if (process.platform !== 'darwin') {
    return null
  }

  try {
    const homePath = path.join(process.env.HOME, defaultPath)
    fs.accessSync(homePath)
    return homePath
  } catch (e) {
    return defaultPath
  }
}

function getHeadlessOptions (url, args, parent) {
  const mergedArgs = parent.call(this, url, args).concat([
    '--headless',
    '--disable-gpu',
    '--disable-dev-shm-usage'
  ])

  const isRemoteDebuggingFlag = (flag) => (flag || '').indexOf('--remote-debugging-port=') !== -1

  return mergedArgs.some(isRemoteDebuggingFlag) ? mergedArgs : mergedArgs.concat(['--remote-debugging-port=9222'])
}

function getCanaryOptions (url, args, parent) {
  // disable crankshaft optimizations, as it causes lot of memory leaks (as of Edge 23.0)
  const flags = args.flags || []
  let augmentedFlags
  const customFlags = '--nocrankshaft --noopt'

  flags.forEach((flag) => {
    if (isJSFlags(flag)) {
      augmentedFlags = `${sanitizeJSFlags(flag)} ${customFlags}`
    }
  })

  return parent.call(this, url).concat([augmentedFlags || `--js-flags=${customFlags}`])
}
// #endregion

// #region Edge
const EdgeBrowser = function (baseBrowserDecorator, args) {
  baseBrowserDecorator(this)

  const flags = args.flags || []
  const userDataDir = args.edgeDataDir || this._tempDir

  this._getOptions = function (url) {
    // Edge CLI options
    // http://peter.sh/experiments/chromium-command-line-switches/
    flags.forEach((flag, i) => {
      if (isJSFlags(flag)) {
        flags[i] = sanitizeJSFlags(flag)
      }
    })

    return [
      `--user-data-dir=${userDataDir}`,
      // https://github.com/GoogleChrome/chrome-launcher/blob/master/docs/chrome-flags-for-tools.md#--enable-automation
      '--enable-automation',
      '--no-default-browser-check',
      '--no-first-run',
      '--disable-default-apps',
      '--disable-popup-blocking',
      '--disable-translate',
      '--disable-background-timer-throttling',
      // on macOS, disable-background-timer-throttling is not enough
      // and we need disable-renderer-backgrounding too
      // see https://github.com/karma-runner/karma-chrome-launcher/issues/123
      '--disable-renderer-backgrounding',
      '--disable-device-discovery-notifications'
    ].concat(flags, [url])
  }
}
EdgeBrowser.prototype = {
  name: 'Edge',

  DEFAULT_CMD: {
    darwin: getEdgeDarwin('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'),
    win32: getEdgeExe('Edge')
  },
  ENV_CMD: 'EDGE_BIN'
}
EdgeBrowser.$inject = ['baseBrowserDecorator', 'args']

const EdgeHeadlessBrowser = function (...args) {
  EdgeBrowser.apply(this, args)
  const parentOptions = this._getOptions
  this._getOptions = (url) => getHeadlessOptions.call(this, url, args[1], parentOptions)
}
EdgeHeadlessBrowser.prototype = {
  name: 'EdgeHeadless',

  DEFAULT_CMD: {
    darwin: getEdgeDarwin('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'),
    win32: getEdgeExe('Edge')
  },
  ENV_CMD: 'EDGE_BIN'
}
EdgeHeadlessBrowser.$inject = ['baseBrowserDecorator', 'args']
// #endregion

// #region Edge Canary (SxS)
const EdgeCanaryBrowser = function (...args) {
  EdgeBrowser.apply(this, args)
  const parentOptions = this._getOptions
  this._getOptions = (url) => getCanaryOptions.call(this, url, args[1], parentOptions)
}
EdgeCanaryBrowser.prototype = {
  name: 'EdgeCanary',

  DEFAULT_CMD: {
    darwin: getEdgeDarwin('/Applications/Microsoft Edge Canary.app/Contents/MacOS/Microsoft Edge Canary'),
    win32: getEdgeExe('Edge SxS')
  },
  ENV_CMD: 'EDGE_CANARY_BIN'
}
EdgeCanaryBrowser.$inject = ['baseBrowserDecorator', 'args']

const EdgeCanaryHeadlessBrowser = function (...args) {
  EdgeCanaryBrowser.apply(this, args)
  const parentOptions = this._getOptions
  this._getOptions = (url) => getHeadlessOptions.call(this, url, args[1], parentOptions)
}
EdgeCanaryHeadlessBrowser.prototype = {
  name: 'EdgeCanaryHeadless',

  DEFAULT_CMD: {
    darwin: getEdgeDarwin('/Applications/Microsoft Edge Canary.app/Contents/MacOS/Microsoft Edge Canary'),
    win32: getEdgeExe('Edge SxS')
  },
  ENV_CMD: 'EDGE_CANARY_BIN'
}
EdgeCanaryHeadlessBrowser.$inject = ['baseBrowserDecorator', 'args']
// #endregion

// PUBLISH DI MODULE
module.exports = {
  'launcher:Edge': ['type', EdgeBrowser],
  'launcher:EdgeHeadless': ['type', EdgeHeadlessBrowser],
  'launcher:EdgeCanary': ['type', EdgeCanaryBrowser],
  'launcher:EdgeCanaryHeadless': ['type', EdgeCanaryHeadlessBrowser]
}

module.exports.test = {
  isJSFlags,
  sanitizeJSFlags,
  headlessGetOptions: getHeadlessOptions,
  canaryGetOptions: getCanaryOptions
}
