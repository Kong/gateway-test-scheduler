const core = require('@actions/core')
const fs = require('node:fs/promises')
const simpleGit = require('simple-git')
const path = require('node:path')
const os = require('node:os')

const { downloadStatistics } = require('./download-statistics')
const { combineStatistics } = require('./combine-statistics')
const { schedule } = require('./schedule')
const { runner } = require('./runner')

module.exports = {
  analyze: async () => {
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
  },

  schedule: async () => {
    try {
      await schedule(
        core.getInput('test-suites-file'),
        core.getInput('runtime-info-repo'),
        core.getInput('repo-root'),
        core.getInput('output-prefix'),
        parseInt(core.getInput('runner-count'), 10),
      )
    } catch (e) {
      core.setFailed(e.message)
    }
  },

  runner: async () => {
    try {
      await runner(
        core.getInput('tests-to-run-file'),
        core.getInput('failed-test-files-file'),
        core.getInput('test-file-runtime-file'),
        core.getInput('setup-venv'),
      )
    } catch (e) {
      core.setFailed(e.message)
    }
  },
}
