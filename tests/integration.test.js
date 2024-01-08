const { Octokit, App } = require('octokit')

const { expect, it, describe } = require('@jest/globals')

const branch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF

console.log('using branch: ', branch)

async function triggerWorkflow(scheduler_res_path) {
  const octokit = new Octokit({
    auth: `${process.env.GITHUB_TOKEN}`,
  })

  try {
    return await octokit.request(
      'POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches',
      {
        owner: 'Kong',
        repo: 'gateway-test-scheduler',
        workflow_id: 'integration.yml',
        ref: branch,
        inputs: {
          scheduler_res_path,
        },
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    )
  } catch (error) {
    console.error(
      'Error triggering workflow dispatch:',
      error.response || error.message || error,
    )
  }
}

describe('integration tests', () => {
  it('trigger workflow run', async () => {
    const res = await triggerWorkflow()

    expect(res).toBe(204)
  })
})
