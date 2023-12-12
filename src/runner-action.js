const core = require('@actions/core')
const { runner } = require('./runner')

const run = async () => {
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
}

run()
