const fs = require('node:fs')
const path = require('node:path')

const tmp = require('tmp')

const { expect } = require('@jest/globals')

const { combineStatistics } = require('../src/combine-statistics')

describe('combine-statistics', () => {
  it('reads legacy files', async () => {
    const combinedFile = tmp.fileSync({ postfix: '.json' }).name
    await combineStatistics(
      path.resolve(__dirname, 'legacy-data'),
      combinedFile,
    )
    const combinedData = JSON.parse(
      fs.readFileSync(combinedFile, { encoding: 'utf-8' }),
    )
    expect(combinedData).toHaveLength(37)
  })
  it('combines legacy and json files', async () => {
    const combinedFile = tmp.fileSync({ postfix: '.json' }).name
    await combineStatistics(path.resolve(__dirname, 'mixed-data'), combinedFile)
    const combinedData = JSON.parse(
      fs.readFileSync(combinedFile, { encoding: 'utf-8' }),
    )
    expect(combinedData).toHaveLength(37)
  })
  it('reduces numeric precision of durations to two digits', async () => {
    const combinedFile = tmp.fileSync({ postfix: '.json' }).name
    await combineStatistics(
      path.resolve(__dirname, 'legacy-data'),
      combinedFile,
    )
    const combinedData = JSON.parse(
      fs.readFileSync(combinedFile, { encoding: 'utf-8' }),
    )
    for (const { expectedDuration } of combinedData) {
      expect(expectedDuration.toString()).toMatch(/^\d+(\.\d{1,2}|)$/)
    }
  })
})
