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
      core.getInput('workflow-name', { required: true }),
      core.getInput('artifact-name-regexp', { required: true }),
      tmpDir,
    )
    const testFileRuntimeFile = core.getInput('test-file-runtime-file', { required: true })
    await combineStatistics(tmpDir, testFileRuntimeFile)
    await simpleGit()
      .add(testFileRuntimeFile)
      .commit('chore(ci): updated test file runtime file', {
        '--author': '"Test Scheduler <team-gateway@konghq.com>"',
      })
  },

  schedule: async () => {
    try {
      await schedule(
        core.getInput('test-suites-file', { required: true }),
        core.getInput('runtime-info-repo', { required: true }),
        core.getInput('repo-root', { required: true }),
        core.getInput('output-prefix', { required: true }),
        parseInt(core.getInput('runner-count', { required: true }), 10),
      )
    } catch (e) {
      core.setFailed(e.message)
    }
  },

  runner: async () => {
    try {
      await runner(
        core.getInput('tests-to-run-file', { required: true }),
        core.getInput('failed-test-files-file', { required: true }),
        core.getInput('test-file-runtime-file', { required: true }),
        core.getInput('setup-venv', { required: true }),
      )
    } catch (e) {
      core.setFailed(e.message)
    }
  },
}
