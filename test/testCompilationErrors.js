const ts = require('typescript')
const chalk = require('chalk')
const fs = require('fs')

const expectedErrorCount = (
  fs
    .readFileSync('test/shouldNotCompile.ts', 'utf8')
    .match(/@shouldNotCompile/g) || []
).length

const tsOptions = {
  noImplicitAny: true,
  noEmit: true,
  strictNullChecks: true,
  lib: ['lib.es6.d.ts'] // Map support
}
const program = ts.createProgram(['test/shouldNotCompile'], tsOptions)
const diagnostics = ts.getPreEmitDiagnostics(program)

if (diagnostics.length === expectedErrorCount) {
  console.log(chalk.green('All the expected compilation errors were found'))
} else {
  const lines = errors(diagnostics)
    .map(d => d.line)
    .join(', ')

  console.log(
    chalk.red(
      `${expectedErrorCount} errors were expected but ${diagnostics.length} errors were found at these lines: ${lines}`
    )
  )
}

function errors(arr) {
  return arr.map(diag => ({
    line: diag.file?.getLineAndCharacterOfPosition(diag.start).line + 1
  }))
}
