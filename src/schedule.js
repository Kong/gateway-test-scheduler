const fs = require('node:fs')
const path = require('node:path')

const { globSync } = require('glob')
const { AsciiTable3, AlignmentEnum } = require('ascii-table3')

const { encodeJSON } = require('./encode-json')

const buildTestFileKey = (suite, filename) => `${suite}:${filename}`

const writeReport = (outputFiles) => {
  const columnWidths = outputFiles
    .flatMap(({ tasks }) => tasks)
    .reduce(
      (widths, { suite, filename }) => [
        Math.max(widths[0], suite.length + 2),
        Math.max(widths[1], filename.length + 2),
        11,
      ],
      [0, 0, 0],
    )
  for (const outputFile of outputFiles) {
    console.log(
      new AsciiTable3(
        `Filename: ${
          outputFile.fileName
        } Expected total duration: ${outputFile.expectedDuration.toFixed(
          2,
        )} seconds`,
      )
        .setHeading('Suite', 'File', 'Estimated')
        .setAligns([
          AlignmentEnum.LEFT,
          AlignmentEnum.LEFT,
          AlignmentEnum.RIGHT,
        ])
        .addRowMatrix(
          outputFile.tasks.map(({ suite, filename, duration }) => [
            suite,
            filename,
            (duration || 0.1).toFixed(2),
          ]),
        )
        .setWidths(columnWidths)
        .toString(),
    )
  }
}

const distributeFiles = (tasks, outputPrefix, numberOfWorkers) => {
  // Sort lines based on duration, tests with a zero duration
  // are considered new and run first
  const zeroFirst = (a, b) =>
    (b.duration || Number.MAX_VALUE) - (a.duration || Number.MAX_VALUE)
  tasks.sort(zeroFirst)

  // Distribute test files into output files
  const outputFiles = new Array(numberOfWorkers).fill(0).map((_, index) => ({
    fileName: `${outputPrefix}${index + 1}.json`,
    tasks: [],
    expectedDuration: 0,
  }))

  for (const task of tasks) {
    const targetFile = outputFiles.sort(
      (a, b) => a.expectedDuration - b.expectedDuration,
    )[0]
    targetFile.tasks.push(task)
    targetFile.expectedDuration += task.duration || 0.1
  }
  // re-sort files to lexical order again
  outputFiles.sort((a, b) => a.fileName.localeCompare(b.fileName))

  // Write files to output directory
  for (const file of outputFiles) {
    fs.writeFileSync(file.fileName, file.tasks.map(encodeJSON).join('\n'))
  }

  // Write report
  writeReport(outputFiles)
}

const expandSpecs = (repoRoot, specs) =>
  specs
    .map((spec) => {
      const p = path.join(repoRoot, spec)
      if (fs.lstatSync(p).isDirectory()) {
        const specFiles = globSync(`${p}/**/*_spec.lua`).map((p1) =>
          path.relative(repoRoot, p1),
        )
        if (!specFiles.length) {
          console.warn(
            'test spec',
            spec,
            'did not expand to any files, incorrect suite definition?',
          )
        }
        return specFiles
      } else {
        return spec
      }
    })
    .flat()

const readTestSuites = (testSuitesFile, repoRoot) =>
  JSON.parse(fs.readFileSync(testSuitesFile, { encoding: 'utf-8' })).map(
    (suite) => {
      return {
        ...suite,
        filenames: expandSpecs(repoRoot, suite.specs),
      }
    },
  )

const readJSONArray = (filename) => {
  // We must be prepared for legacy format (one JSON document containing an array) and
  // for the current one-object-per-line format.
  const contents = fs.readFileSync(filename, { encoding: 'utf-8' })
  return contents[0] === '['
    ? JSON.parse(contents)
    : contents.split('\n').map((line) => JSON.parse(line))
}

const readRuntimeInfoFile = (runtimeInfoFilename) =>
  readJSONArray(runtimeInfoFilename).reduce(
    (result, { suite, filename, expectedDuration }) => {
      if (!result[suite]) {
        result[suite] = {}
      }
      const testFileKey = buildTestFileKey(suite, filename)
      result[suite][testFileKey] = expectedDuration
      return result
    },
    {},
  )

const schedule = (
  testSuitesFile,
  runtimeInfoFile,
  repoRoot,
  outputPrefix,
  numberOfWorkers,
  staticMode,
) => {
  if (staticMode) {
    console.warn(
      'The scheduler is running in static mode! No runtime information will be used.',
    )
  }

  const runtimeInfo = !staticMode
    ? readRuntimeInfoFile(runtimeInfoFile)
    : undefined
  const suites = readTestSuites(testSuitesFile, repoRoot)
  const newTests = new Set()
  const findDuration = (suiteName, filename) => {
    const testFileKey = buildTestFileKey(suiteName, filename)
    const duration =
      runtimeInfo &&
      runtimeInfo[suiteName] &&
      runtimeInfo[suiteName][testFileKey]
    if (duration === undefined && !newTests.has(testFileKey)) {
      newTests.add(testFileKey)
      return 0
    } else {
      return duration
    }
  }
  const tasks = suites
    .map(({ name, exclude_tags, venv_script, environment, filenames }) =>
      filenames.map((filename) => {
        return {
          suite: name,
          exclude_tags,
          venv_script,
          environment,
          filename,
          duration: findDuration(name, filename),
        }
      }),
    )
    .flat()

  if (newTests.size) {
    console.log(
      `${newTests.size} new test files:\n\n\t${Array.from(newTests)
        .sort()
        .join('\n\t')}\n\n`,
    )
  }
  distributeFiles(tasks, outputPrefix, numberOfWorkers)
}

module.exports = { schedule, readJSONArray }
