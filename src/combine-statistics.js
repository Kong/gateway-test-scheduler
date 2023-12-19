const fs = require('fs')
const path = require('path')
const { encodeJSON } = require('./encode-json')

const parseTSV = (line) => {
  const [suite, filename, durationString] = line.split(/\s+/)
  const duration = parseFloat(durationString) || 0
  return { suite, filename, duration }
}

const parseJSON = (line) => {
  try {
    const entry = JSON.parse(line)
    const { duration } = entry
    if (typeof duration === 'string') {
      entry.duration = parseFloat(duration)
    }
    return entry
  } catch (e) {
    console.error(`error parsing line ${line} as JSON:`, e)
    throw e
  }
}

const processTextFile = (fileContent, durations) => {
  const isJSON = fileContent[0] === '{'
  const parsed = fileContent
    .split(/\n/)
    .filter((line) => line.length > 0)
    .map((line) => (isJSON ? parseJSON(line) : parseTSV(line)))
  for (const { suite, filename, duration } of parsed) {
    if (duration > 0) {
      const key = `${suite}:${filename}`
      durations[key] = [...(durations[key] || []), duration]
    }
  }
}

const calculateMedian = (arr) => {
  const sortedArr = arr.sort((a, b) => a - b)
  const middle = Math.floor(sortedArr.length / 2)

  return sortedArr.length % 2 === 0
    ? (sortedArr[middle - 1] + sortedArr[middle]) / 2
    : sortedArr[middle]
}

const combineStatistics = (directoryPath, outputFilePath) => {
  const durations = {}

  const files = fs.readdirSync(directoryPath)
  for (const file of files) {
    const fileContent = fs.readFileSync(path.resolve(directoryPath, file), {
      encoding: 'utf-8',
    })
    try {
      processTextFile(fileContent, durations)
    } catch (e) {
      console.error(`error processing file ${file}: ${e}`)
    }
  }

  const result = Object.entries(durations).map(([key, value]) => {
    const expectedDuration = calculateMedian(durations[key])
    const [suite, filename] = key.split(':')
    if (typeof expectedDuration !== 'number' || isNaN(expectedDuration)) {
      throw new Error(
        `unexpected duration ${typeof expectedDuration}:${expectedDuration} value calculated for suite ${suite} file ${filename}`,
      )
    }
    return {
      suite,
      filename,
      expectedDuration,
    }
  })

  fs.writeFileSync(
    outputFilePath,
    result.map((entry) => encodeJSON(entry)).join('\n'),
  )
  return { outputFilePath }
}

module.exports = { combineStatistics }
