const fs = require('fs')
const ms = require('ms')
const { AsciiTable3, AlignmentEnum } = require('ascii-table3')
const process = require('node:process')

const { executeCommand } = require('./execute-command')
const appendToFile = require('./append-to-file')
const bustedEventListener = require('./busted-event-listener')
const { encodeJSON } = require('./encode-json')

const readTestsToRun = (testsToRunFile, failedTestFilesFile) => {
  let file = testsToRunFile
  if (fs.existsSync(failedTestFilesFile)) {
    console.log(`### Rerunning failed tests from ${failedTestFilesFile}`)
    file = failedTestFilesFile
  } else {
    console.log(`### Running tests from ${testsToRunFile}`)
  }

  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(JSON.parse)
}

const runner = async (
  testsToRunFile,
  failedTestFilesFile,
  testFileRuntimeFile,
  xmlOutputFolder,
  buildRootPath,
  workingDirectory,
) => {
  const testsToRun = readTestsToRun(testsToRunFile, failedTestFilesFile)
  console.log(`### Running ${testsToRun.length} tests`)

  const saveTestResult = async (test, exitStatus, output) => {
    // if (pullRequest) {
    // Implement saving test result for pull request
    // You can use relevant Node.js GitHub API libraries for this
    // Example: octokit.issues.createComment({...});
    // }
  }

  const bustedEventPath = `/tmp/busted-runner-${process.pid}`

  const runtimes = []

  const runTest = async (test) => {
    const { suite, exclude_tags, venv_script, environment, filename } = test
    let failed = false
    const listener = await bustedEventListener(
      bustedEventPath,
      ({ event, args }) => {
        switch (event) {
          case 'failure':
          case 'failure:it':
          case 'error':
          case 'error:it':
            failed = true
            break

          case 'file:end': {
            const { duration } = args[0]
            appendToFile(
              testFileRuntimeFile,
              `${encodeJSON({ suite, filename, duration })}\n`,
            )
            runtimes.push({
              suite,
              filename,
              estimated: test.duration * 1000,
              elapsed: duration * 1000,
            })
          }
        }
      },
    )

    try {
      const setupVenv =
        buildRootPath && venv_script
          ? `. ${buildRootPath}/${venv_script} ;`
          : ''
      const excludeTagsOption = exclude_tags
        ? `--exclude-tags="${exclude_tags}"`
        : ''
      const command = `${setupVenv} bin/busted --helper=spec/busted-ci-helper.lua -o hjtest --Xoutput "${xmlOutputFolder}/${Date.now()}.xml" ${excludeTagsOption} "${filename}"`
      console.log(`### running ${command}`)
      const { exitStatus, output } = await executeCommand(
        command,
        {
          ...process.env,
          ...environment,
          BUSTED_EVENT_PATH: bustedEventPath,
        },
        workingDirectory,
      )
      // fixme do we want to wait until the suite:end event?  It seems to me that as the busted process has exited when
      // we reach this point, there should be no buffered data left.

      await saveTestResult(test, exitStatus, output)

      if (exitStatus !== 0 || failed) {
        console.error(`\nTest failed with exit status: ${exitStatus} ($output)`)
        return false
      }

      return true
    } catch (error) {
      console.error(error.message)
      return false
    } finally {
      listener.close()
    }
  }

  const failedTests = []
  for (let i = 0; i < testsToRun.length; i++) {
    console.log(`\n### Running file #${i + 1} of ${testsToRun.length}\n`)
    if (!(await runTest(testsToRun[i]))) {
      failedTests.push(testsToRun[i])
    }
  }

  const total = runtimes.reduce(
    (result, test) => {
      const { suite, filename, estimated, elapsed } = test
      result.estimated += estimated
      result.elapsed += elapsed
      if (Math.abs(estimated - elapsed) > 10000) {
        result.deviations.push(test)
      }
      return result
    },
    { estimated: 0, elapsed: 0, deviations: [] },
  )
  console.log(`
### Runtime analysis

Estimated total runtime: ${ms(Math.floor(total.estimated))}
Actual total runtime...: ${ms(Math.floor(total.elapsed))}
Total deviation........: ${ms(Math.floor(total.elapsed - total.estimated))}\n`)

  if (total.deviations.length) {
    console.log(
      new AsciiTable3('Deviating test files')
        .setHeading('Suite', 'File', 'Estimated', 'Actual', 'Deviation')
        .setAligns([
          AlignmentEnum.LEFT,
          AlignmentEnum.LEFT,
          AlignmentEnum.RIGHT,
          AlignmentEnum.RIGHT,
          AlignmentEnum.RIGHT,
        ])
        .addRowMatrix(
          total.deviations.map(({ suite, filename, estimated, elapsed }) => [
            suite,
            filename,
            ms(Math.floor(estimated)),
            ms(Math.floor(elapsed)),
            ms(Math.floor(elapsed - estimated)),
          ]),
        )
        .toString(),
    )
  }

  if (failedTests.length > 0) {
    console.log(`\n${failedTests.length} test files failed:\n`)
    console.log(
      failedTests
        .map(({ suite, filename }) => `\t${suite}\t${filename}`)
        .join('\n'),
    )
    console.log('')
    fs.writeFileSync(
      failedTestFilesFile,
      failedTests.map(JSON.stringify).join('\n'),
    )
    process.exit(1)
  }

  process.exit(0)
}

module.exports = { runner }
