const { Octokit } = require('octokit')
const axios = require('axios')
const AdmZip = require('adm-zip')

const ref = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF
const owner = process.env.GITHUB_REPOSITORY_OWNER
const repo = process.env.GITHUB_REPOSITORY.split('/')[1]
const workflow_id = 'integration.yml'

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
})

const helpers = {
  scheduleAndRun: async (scheduler_res_path, runName) => {
    return await octokit.request(
      'POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches',
      {
        owner,
        repo,
        workflow_id,
        ref,
        inputs: {
          scheduler_res_path,
          run_name: runName,
        },
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    )
  },
  rerunFailed: async (runId) => {
    return await octokit.request(
      'POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun-failed-jobs',
      {
        owner,
        repo,
        run_id: runId,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    )
  },
  getWorkflowRun: async (runName) => {
    const pastFiveMinutes = new Date(Date.now() - 5 * 60 * 1000)
      .toISOString()
      .slice(0, 19)
    const retryTimeout = 30000
    const retryInterval = 1000

    for (let retry = 0; retry < retryTimeout / retryInterval; retry++) {
      await new Promise((resolve) => setTimeout(resolve, retryInterval))
      const workflows = await octokit.request(
        'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs{?created}',
        {
          owner,
          repo,
          workflow_id,
          created: `>=${pastFiveMinutes}`,
          headers: {
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      )

      const workflow_runs = workflows.data.workflow_runs
      if (workflow_runs.length === 0) {
        continue
      }

      // Using this hack because `dispatches` does not return the run id
      const workflow = workflow_runs.find((run) => run.name === runName)
      if (workflow) {
        return workflow
      }
    }
  },
  getJobs: async (runId) => {
    const jobsRes = await octokit.request(
      'GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs',
      {
        owner,
        repo,
        run_id: runId,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    )

    return jobsRes.data.jobs
  },
  // this is ugly, should we consider using webhooks instead?
  waitForRunCompletion: async (runId) => {
    console.log(`Waiting for workflow run ${runId} to complete...`)
    const pollingTimeout = 300000
    const retryInterval = 5000

    for (
      let pollingCounter = 0;
      pollingCounter < pollingTimeout / retryInterval;
      pollingCounter++
    ) {
      await new Promise((resolve) => setTimeout(resolve, retryInterval))

      const workflow = await octokit.request(
        'GET /repos/{owner}/{repo}/actions/runs/{run_id}',
        {
          owner,
          repo,
          run_id: runId,
          headers: {
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      )

      const status = workflow.data && workflow.data.status

      if (
        !status ||
        status === 'cancelled' ||
        status === 'timed_out' ||
        status === 'failure' ||
        status === 'action_required' ||
        status === 'stale'
      ) {
        return false
      }

      if (status === 'completed') {
        return true
      }
    }
    return false
  },
  getWorkflowRunArtifacts: async (runId) => {
    const artifactsRes = await octokit.request(
      'GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts',
      {
        owner,
        repo,
        run_id: runId,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    )

    const artifacts = artifactsRes.data.artifacts
    const artifactContents = {}

    for (const artifact of artifacts) {
      const downloadRes = await octokit.request(
        'GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/{archive_format}',
        {
          owner,
          repo,
          artifact_id: artifact.id,
          archive_format: 'zip',
          headers: {
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      )
      const tmpUrl = downloadRes.url
      const artifactDownloadRes = await axios({
        url: tmpUrl,
        method: 'GET',
        responseType: 'arraybuffer',
      })

      const zip = new AdmZip(artifactDownloadRes.data)
      const zipEntries = zip.getEntries()

      artifactContents[artifact.name] = []

      for (const zipEntry of zipEntries) {
        const fileContent = zipEntry.getData().toString('utf8')
        artifactContents[artifact.name].push({
          [zipEntry.entryName]: fileContent,
        })
      }
    }
    return artifactContents
  },
}

module.exports = helpers
