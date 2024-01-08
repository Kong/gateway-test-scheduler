const { expect, it, describe } = require('@jest/globals')

const axios = require('axios');

const branch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF.split('/').pop();

console.log('using branch: ', branch);

async function triggerWorkflow() {
  const githubToken = process.env.GITHUB_TOKEN;
  try {
    const response = await axios.post(
      `https://api.github.com/repos/Kong/gateway-test-scheduler/actions/workflows/integration.yml/dispatches`,
      {
        ref: branch,
      },
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    console.log('Workflow dispatch triggered successfully, status: ', response.status);
    return response.status;
  } catch (error) {
    console.error('Error triggering workflow dispatch:', error.response || error.message || error);
  }
}


describe('integration tests', () => {
  it('trigger workflow run', async () => {
    res = await triggerWorkflow();
    
    expect(res).toBe(204);
  })
})
