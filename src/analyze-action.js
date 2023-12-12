const core = require('@actions/core')
const fs = require('node:fs/promises')
const simpleGit = require('simple-git')
const path = require('node:path')
const os = require('node:os')

const { downloadStatistics } = require('./download-statistics')
const { combineStatistics } = require('./combine-statistics')

const run = async () => {
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/')
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'analyze-runtimes-'))
  await downloadStatistics(
    owner,
    repo,
    core.getInput('build_and_test.yml'),
    core.getInput('artifact-name-regexp'),
    tmpDir,
  )
  const testFileRuntimeFile = core.getInput('test-file-runtime-file')
  await combineStatistics(tmpDir, testFileRuntimeFile)
  await simpleGit
    .add(testFileRuntimeFile)
    .commit('updated test file runtime file')
}

run()
