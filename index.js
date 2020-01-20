var fs = require('fs')
var path = require('path')
var which = require('which')

function isJSFlags (flag) {
  return flag.indexOf('--js-flags=') === 0
}

function sanitizeJSFlags (flag) {
  var test = /--js-flags=(['"])/.exec(flag)
  if (!test) {
    return flag
  }
  var escapeChar = test[1]
  var endExp = new RegExp(escapeChar + '$')
  var startExp = new RegExp('--js-flags=' + escapeChar)
  return flag.replace(startExp, '--js-flags=').replace(endExp, '')
}

var EdgeBrowser = function (baseBrowserDecorator, args) {
  baseBrowserDecorator(this)

  var flags = args.flags || []
  var userDataDir = args.edgeDataDir || this._tempDir

  this._getOptions = function (url) {
    // Edge CLI options
    // http://peter.sh/experiments/chromium-command-line-switches/
    flags.forEach(function (flag, i) {
      if (isJSFlags(flag)) {
        flags[i] = sanitizeJSFlags(flag)
      }
    })

    return [
      '--user-data-dir=' + userDataDir,
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

// Return location of edge.exe file for a given Edge directory (available: "Edge", "Edge SxS").
function getEdgeExe (edgeDirName) {
  // Only run these checks on win32
  if (process.platform !== 'win32') {
    return null
  }
  var windowsEdgeDirectory, i, prefix
  var suffix = edgeDirName + '\\Application\\edge.exe'
  var prefixes = [process.env.LOCALAPPDATA, process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)']]

  for (i = 0; i < prefixes.length; i++) {
    prefix = prefixes[i]
    try {
      windowsEdgeDirectory = path.join(prefix, suffix)
      fs.accessSync(windowsEdgeDirectory)
      return windowsEdgeDirectory
    } catch (e) {}
  }

  return windowsEdgeDirectory
}

var ChromiumBrowser = function (baseBrowserDecorator, args) {
  baseBrowserDecorator(this)

  var flags = args.flags || []
  var userDataDir = args.edgeDataDir || this._tempDir

  this._getOptions = function (url) {
    // Chromium CLI options
    // http://peter.sh/experiments/chromium-command-line-switches/
    flags.forEach(function (flag, i) {
      if (isJSFlags(flag)) {
        flags[i] = sanitizeJSFlags(flag)
      }
    })

    return [
      '--user-data-dir=' + userDataDir,
      '--no-default-browser-check',
      '--no-first-run',
      '--disable-default-apps',
      '--disable-popup-blocking',
      '--disable-translate',
      '--disable-background-timer-throttling'
    ].concat(flags, [url])
  }
}

function getBin (commands) {
  // Don't run these checks on win32
  if (process.platform !== 'linux') {
    return null
  }
  var bin, i
  for (i = 0; i < commands.length; i++) {
    try {
      if (which.sync(commands[i])) {
        bin = commands[i]
        break
      }
    } catch (e) {}
  }
  return bin
}

function getEdgeDarwin (defaultPath) {
  if (process.platform !== 'darwin') {
    return null
  }

  try {
    var homePath = path.join(process.env.HOME, defaultPath)
    fs.accessSync(homePath)
    return homePath
  } catch (e) {
    return defaultPath
  }
}

EdgeBrowser.prototype = {
  name: 'Edge',

  DEFAULT_CMD: {
    linux: getBin(['edge', 'edge-stable']),
    darwin: getEdgeDarwin('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'),
    win32: getEdgeExe('Edge')
  },
  ENV_CMD: 'CHROME_BIN'
}

EdgeBrowser.$inject = ['baseBrowserDecorator', 'args']

function headlessGetOptions (url, args, parent) {
  var mergedArgs = parent.call(this, url, args).concat([
    '--headless',
    '--disable-gpu',
    '--disable-dev-shm-usage'
  ])

  var isRemoteDebuggingFlag = function (flag) {
    return flag.indexOf('--remote-debugging-port=') !== -1
  }

  return mergedArgs.some(isRemoteDebuggingFlag)
    ? mergedArgs
    : mergedArgs.concat(['--remote-debugging-port=9222'])
}

var EdgeHeadlessBrowser = function (baseBrowserDecorator, args) {
  EdgeBrowser.apply(this, arguments)

  var parentOptions = this._getOptions
  this._getOptions = function (url) {
    return headlessGetOptions.call(this, url, args, parentOptions)
  }
}

EdgeHeadlessBrowser.prototype = {
  name: 'EdgeHeadless',

  DEFAULT_CMD: {
    linux: getBin(['edge', 'edge-stable']),
    darwin: getEdgeDarwin('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'),
    win32: getEdgeExe('Edge')
  },
  ENV_CMD: 'EDGE_BIN'
}

EdgeHeadlessBrowser.$inject = ['baseBrowserDecorator', 'args']

function canaryGetOptions (url, args, parent) {
  // disable crankshaft optimizations, as it causes lot of memory leaks (as of Edge 23.0)
  var flags = args.flags || []
  var augmentedFlags
  var customFlags = '--nocrankshaft --noopt'

  flags.forEach(function (flag) {
    if (isJSFlags(flag)) {
      augmentedFlags = sanitizeJSFlags(flag) + ' ' + customFlags
    }
  })

  return parent.call(this, url).concat([augmentedFlags || '--js-flags=' + customFlags])
}

var EdgeCanaryBrowser = function (baseBrowserDecorator, args) {
  EdgeBrowser.apply(this, arguments)

  var parentOptions = this._getOptions
  this._getOptions = function (url) {
    return canaryGetOptions.call(this, url, args, parentOptions)
  }
}

EdgeCanaryBrowser.prototype = {
  name: 'EdgeCanary',

  DEFAULT_CMD: {
    linux: getBin(['edge-canary', 'edge-unstable']),
    darwin: getEdgeDarwin('/Applications/Microsoft Edge Canary.app/Contents/MacOS/Microsoft Edge Canary'),
    win32: getEdgeExe('Edge SxS')
  },
  ENV_CMD: 'CHROME_CANARY_BIN'
}

EdgeCanaryBrowser.$inject = ['baseBrowserDecorator', 'args']

var EdgeCanaryHeadlessBrowser = function (baseBrowserDecorator, args) {
  EdgeCanaryBrowser.apply(this, arguments)

  var parentOptions = this._getOptions
  this._getOptions = function (url) {
    return headlessGetOptions.call(this, url, args, parentOptions)
  }
}

EdgeCanaryHeadlessBrowser.prototype = {
  name: 'EdgeCanaryHeadless',

  DEFAULT_CMD: {
    linux: getBin(['edge-canary', 'edge-unstable']),
    darwin: getEdgeDarwin('/Applications/Microsoft Edge Canary.app/Contents/MacOS/Microsoft Edge Canary'),
    win32: getEdgeExe('Edge SxS')
  },
  ENV_CMD: 'CHROME_CANARY_BIN'
}

EdgeCanaryHeadlessBrowser.$inject = ['baseBrowserDecorator', 'args']

// PUBLISH DI MODULE
module.exports = {
  'launcher:Edge': ['type', EdgeBrowser],
  'launcher:EdgeHeadless': ['type', EdgeHeadlessBrowser],
  'launcher:EdgeCanary': ['type', EdgeCanaryBrowser],
  'launcher:EdgeCanaryHeadless': ['type', EdgeCanaryHeadlessBrowser],
  'launcher:Chromium': ['type', ChromiumBrowser]
}

module.exports.test = {
  isJSFlags: isJSFlags,
  sanitizeJSFlags: sanitizeJSFlags,
  headlessGetOptions: headlessGetOptions,
  canaryGetOptions: canaryGetOptions
}
