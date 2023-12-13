const fs = require('fs')
const path = require('path')
const AdmZip = require('adm-zip')
const { encodeJSON } = require('./encode-json')

const parseTSV = (line) => {
  const [suite, filename, durationString] = line.split(/\s+/)
  const duration = parseFloat(durationString) || 0
  return { suite, filename, duration }
}

const parseJSON = (line) => {
  try {
    return JSON.parse(line)
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
    if (file.endsWith('.zip')) {
      const filePath = path.join(directoryPath, file)
      const zip = new AdmZip(filePath)
      const fileContent = zip.readAsText(zip.getEntries()[0])
      try {
        processTextFile(fileContent, durations)
      } catch (e) {
        console.error(`error processing file ${file}: ${e}`)
      }
    }
  }

  const result = Object.entries(durations).map(([key, value]) => {
    const expectedDuration = calculateMedian(durations[key])
    const [suite, filename] = key.split(':')
    return {
      suite,
      filename,
      expectedDuration,
    }
  })

  fs.writeFileSync(outputFilePath, encodeJSON(result))
}

module.exports = { combineStatistics }
