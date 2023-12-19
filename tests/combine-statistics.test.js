const fs = require('node:fs')
const path = require('node:path')

const tmp = require('tmp')

const { expect, it, describe } = require('@jest/globals')

const { combineStatistics } = require('../src/combine-statistics')
const { readJSONArray } = require('../src/schedule')

describe('combine-statistics', () => {
  it('reads legacy files', async () => {
    const combinedFile = tmp.fileSync({ postfix: '.json' }).name
    combineStatistics(path.resolve(__dirname, 'legacy-data'), combinedFile)
    const combinedData = readJSONArray(combinedFile)
    expect(combinedData).toHaveLength(37)
  })
  it('combines legacy and json files', async () => {
    const combinedFile = tmp.fileSync({ postfix: '.json' }).name
    combineStatistics(path.resolve(__dirname, 'mixed-data'), combinedFile)
    const combinedData = readJSONArray(combinedFile)
    expect(combinedData).toHaveLength(37)
  })
  it('reduces numeric precision of durations to two digits', async () => {
    const combinedFile = tmp.fileSync({ postfix: '.json' }).name
    combineStatistics(path.resolve(__dirname, 'legacy-data'), combinedFile)
    const combinedData = readJSONArray(combinedFile)
    for (const { expectedDuration } of combinedData) {
      expect(expectedDuration.toString()).toMatch(/^\d+(\.\d{1,2}|)$/)
    }
  })
})
