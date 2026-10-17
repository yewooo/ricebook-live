const JasmineReporters = require('jasmine-reporters')

jasmine.getEnv().addReporter(
    new JasmineReporters.JUnitXmlReporter({
        savePath: '.',
        filePrefix: 'junit-report',
        consolidateAll: true
    })
)