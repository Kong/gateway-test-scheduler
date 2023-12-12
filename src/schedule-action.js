const core = require('@actions/core')
const { schedule } = require('./schedule')

const run = async () => {
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
}

run()
