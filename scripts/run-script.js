var testUtils = require('elastic-apm-js-core/dev-utils/test')
var saucelabs = require('elastic-apm-js-core/dev-utils/saucelabs')
var path = require('path')
var projectDirectory = path.join(__dirname, './../')

function runUnitTests(launchSauceConnect) {
  var testConfig = testUtils.getTestEnvironmentVariables()
  testConfig.karmaConfigFile = __dirname + './../karma.conf.js'
  if (launchSauceConnect != 'false') {
    return testUtils.runUnitTests(testConfig)
  } else {
    testUtils.runKarma(testConfig.karmaConfigFile)
  }
}

var runIntegrationTest = require('../test/e2e/integration-test').runIntegrationTest
function serveE2e(servingPath, port) {
  const express = require('express')
  const serveIndex = require('serve-index')

  const app = express()
  var staticPath = path.join(__dirname, '../', servingPath)

  app.get('/healthcheck', function (req, res) {
    res.send("OK");
  });

  app.get('/run_integration_test', async function (req, res) {
    var echo = req.query.echo
    var result = await runIntegrationTest('http://localhost:8000/test/e2e/general-usecase/')
    if (echo) {
      res.send(echo)
    } else {
      res.send(result);
    }
  });

  app.get('/test-config.js', async function (req, res) {
    var config = require('../test.config')
    var result = `
      window.globalConfigs = ${JSON.stringify(config)}
    `
    res.setHeader('Content-Type', 'text/javascript')
    res.setHeader('Content-Length', Buffer.byteLength(result))
    res.send(result);
  });

  app.use(express.static(staticPath), serveIndex(staticPath, { 'icons': false }))
  var server = app.listen(port)

  console.log('serving on: ', staticPath, port)
  return server
}

function runJasmine(cb) {
  var JasmineRunner = require('jasmine')
  var jrunner = new JasmineRunner()

  var specFiles = ['test/node/*.node-spec.js']

  jrunner.configureDefaultReporter({ showColors: true })

  jrunner.onComplete(function (passed) {
    if (!passed) {
      var err = new Error('Jasmine node tests failed.')
      // The stack is not useful in this context.
      err.showStack = false
      cb(err)
    } else {
      cb()
    }
  })
  jrunner.print = function (value) {
    process.stdout.write(value)
  }
  jrunner.addReporter(new JasmineRunner.ConsoleReporter(jrunner))
  jrunner.projectBaseDir = projectDirectory
  jrunner.specDir = ''
  jrunner.addSpecFiles(specFiles)
  jrunner.execute()
}

var scripts = {
  runUnitTests: runUnitTests,
  startSelenium: testUtils.startSelenium,
  runE2eTests: function (runSelenium, serve) {
    if (serve != 'false') {
      serveE2e('./', 8000)
    }
    testUtils.runE2eTests(path.join(__dirname, './../wdio.conf.js'), runSelenium != 'false')
  },
  runNodeTests: function () {
    var server = serveE2e('./', 8000)
    runJasmine(function (err) {
      server.close()
      if (err) {
        console.log('Node tests failed:', err)
        var exitCode = 2
        process.exit(exitCode)
      }
    })
  },
  buildE2eBundles: function (basePath) {
    basePath = basePath || './test/e2e'
    function callback(err) {
      if (err) {
        var exitCode = 2
        process.exit(exitCode)
      }
    }

    testUtils.buildE2eBundles(path.join(projectDirectory, basePath), callback)
  },
  serveE2e: serveE2e,
  launchSauceConnect: function launchSauceConnect() {
    var testConfig = require('../test.config')
    saucelabs.launchSauceConnect(testConfig.env.sauceLabs, function () {
      console.log('Launched SauceConnect!')
    })
  }
}

module.exports = scripts

function runScript() {
  var scriptName = process.argv[2]
  if (scriptName) {
    var scriptArgs = [].concat(process.argv)
    scriptArgs.splice(0, 3)
    var message = `Running: ${scriptName}(${scriptArgs.map(a => '\'' + a + '\'').join(', ')}) \n`
    console.log(message)
    if (typeof scripts[scriptName] === 'function') {
      return scripts[scriptName].apply(this, scriptArgs)
    } else {
      throw new Error('No script with name ' + scriptName)
    }
  }
}

runScript()
