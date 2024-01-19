const commander = require('commander')
const path = require('node:path')
const { schedule } = require('./schedule')
const { downloadStatistics } = require('./download-statistics')
const { combineStatistics } = require('./combine-statistics')
const { runner } = require('./runner')

const parseIntegerArgument = (value) => {
  // parseInt takes a string and a radix
  const parsedValue = parseInt(value, 10)
  if (isNaN(parsedValue)) {
    throw new commander.InvalidArgumentError('Not a number.')
  }
  return parsedValue
}

const cli = () => {
  commander.program
    .command('schedule')
    .description(
      'create test task files based on a test suite definition and historic runtime data',
    )
    .argument('<suite-definitions>', 'JSON file with suite definitions')
    .argument('<runtime-data>', 'text file with historic runtime data')
    .argument('<repo-root>', 'gateway repository root to locate test files')
    .argument('<output-prefix>', 'filename prefix for generated task files')
    .argument(
      '<worker-count>',
      'number of test worker processes to schedule for',
      parseIntegerArgument,
    )
    .action(
      (
        suiteDefinitionFile,
        runtimeDataFile,
        repoRoot,
        outputPrefix,
        workerCount,
      ) => {
        schedule(
          suiteDefinitionFile,
          runtimeDataFile,
          repoRoot,
          outputPrefix,
          workerCount,
        )
      },
    )

  commander.program
    .command('download-statistics')
    .argument('<repo>', 'repository name (<owner>/<repo>)')
    .argument('<workflow-name>', 'workflow (file) name')
    .argument(
      '<artifact-name-regexp>',
      'regular expression to match artifact names of runtime logs',
    )
    .argument('<directory>', 'local directory to download the files to')
    .action(async (...args) => {
      const { workflowRunCount, artifactCount, dataDirectory } =
        await downloadStatistics(...args)
      console.log(
        `looked at ${workflowRunCount} workflow runs, ${artifactCount} files downloaded to ${dataDirectory}`,
      )
    })

  commander.program
    .command('combine-statistics')
    .argument(
      '<directory>',
      'local directory containing the downloaded statistics',
    )
    .argument(
      '<output-filename>',
      'name of the combined statistics file to write',
    )
    .action(async (...args) => {
      const { outputFilePath } = await combineStatistics(...args)
      console.log(`wrote runtime prediction file ${outputFilePath}`)
    })

  commander.program
    .command('runner')
    .argument('<testsToRunFile>', 'Tests to run file')
    .argument('<failedTestFilesFile>', 'Failed test files file')
    .argument('<testFileRuntimeFile>', 'File to write runtime statistics to')
    .argument('<kongDirectory>', 'Path to local Kong repository')
    .argument('<xmlOutputFile>', 'XML output file')
    .argument('<setupVenv>', 'Command to initialize the Kong environment')
    .action(runner)

  commander.program
    .command('help')
    .description('Display help')
    .action(() => {
      commander.program.outputHelp()
    })

  commander.program.parse(process.argv)

  // Display help if no sub-command is provided
  if (process.argv.length < 3) {
    commander.program.outputHelp()
  }
}

cli()
