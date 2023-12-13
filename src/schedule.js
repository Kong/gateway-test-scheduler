const fs = require('node:fs')
const { globSync } = require('glob')
const path = require('node:path')

function distributeFiles(tasks, outputPrefix, numberOfWorkers) {
  // Parse and sort lines based on duration
  const sortedTasks = tasks
    .map(({ duration, ...task }) => {
      return { duration: parseFloat(duration), ...task }
    })
    .sort((a, b) => b.duration - a.duration)

  // Distribute files into output files
  const outputFiles = new Array(numberOfWorkers).fill(0).map((_, index) => ({
    fileName: `${outputPrefix}${index + 1}.txt`,
    tasks: [],
    currentDuration: 0,
  }))

  for (const task of sortedTasks) {
    const targetFile = outputFiles.sort(
      (a, b) => a.currentDuration - b.currentDuration,
    )[0]
    targetFile.tasks.push(task)
    targetFile.currentDuration += task.duration || 0.1
  }

  // Write files to output directory
  for (const file of outputFiles) {
    fs.writeFileSync(file.fileName, file.tasks.map(JSON.stringify).join('\n'))
  }

  console.log(
    `Files distributed and written to ${outputFiles
      .map(({ fileName }) => fileName)
      .sort()
      .join(', ')
      .replace(/, ([^,]+)$/, ' and $1')}`,
  )
}

const expandSpecs = (repoRoot, specs) =>
  specs.reduce((files, spec) => {
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
      files = files.concat(specFiles)
    } else {
      files.push(spec)
    }
    return files
  }, [])

const readTestSuites = (testSuitesFile, repoRoot) =>
  JSON.parse(fs.readFileSync(testSuitesFile, 'utf-8')).map((suite) => {
    return {
      ...suite,
      filenames: expandSpecs(repoRoot, suite.specs),
    }
  })

const readRuntimeInfoFile = (runtimeInfoFilename) =>
  fs
    .readFileSync(runtimeInfoFilename, 'utf-8')
    .split('\n')
    .reduce((result, line) => {
      const [suite, filename, duration] = line.split('\t')
      if (!result[suite]) {
        result[suite] = {}
      }
      result[suite][filename] = duration
      return result
    }, {})

const schedule = (
  testSuitesFile,
  runtimeInfoFile,
  repoRoot,
  outputPrefix,
  numberOfWorkers,
) => {
  console.log(`read runtime info from ${runtimeInfoFile}`)
  const runtimeInfo = readRuntimeInfoFile(runtimeInfoFile)
  console.log(
    `read test suites from ${testSuitesFile}, repoRoot is ${repoRoot}`,
  )
  const suites = readTestSuites(testSuitesFile, repoRoot)
  console.log('collecting durations')
  const newFiles = new Set()
  const findDuration = (suiteName, filename) => {
    const duration = runtimeInfo[suiteName] && runtimeInfo[suiteName][filename]
    if (duration === undefined && !newFiles.has(filename)) {
      newFiles.add(filename)
      return 0
    } else {
      return duration
    }
  }
  console.log('calculating expected durations')
  const tasks = suites.reduce(
    (result, { name, exclude_tags, environment, filenames }) =>
      result.concat(
        filenames.map((filename) => {
          return {
            suite: name,
            exclude_tags,
            environment,
            filename,
            duration: findDuration(name, filename),
          }
        }),
      ),
    [],
  )
  if (newFiles.size) {
    console.log(
      `${newFiles.size} new test files:\n\n\t${Array.from(newFiles)
        .sort()
        .join('\n\t')}\n\n`,
    )
  }
  console.log(`distribute ${tasks.length} tasks to ${numberOfWorkers} files`)
  distributeFiles(tasks, outputPrefix, numberOfWorkers)
}

module.exports = { schedule }
