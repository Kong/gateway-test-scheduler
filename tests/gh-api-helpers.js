const { Octokit } = require('octokit')
const axios = require('axios')
const AdmZip = require('adm-zip')

const ref = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF
const repo = process.env.GITHUB_REPOSITORY.split('/')[1]
const owner = process.env.GITHUB_REPOSITORY_OWNER
const workflow_id = 'integration.yml'

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
})
const apiRequest = octokit.request.defaults({
  ref,
  repo,
  owner,
  workflow_id,
  headers: {
    'X-GitHub-Api-Version': '2022-11-28',
  },
})

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const helpers = {
  scheduleAndRun: async (scheduler_res_path, runName) =>
    apiRequest(
      'POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches',
      {
        inputs: {
          scheduler_res_path,
          run_name: runName,
        },
      },
    ),
  rerunFailed: async (runId) =>
    apiRequest(
      'POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun-failed-jobs',
      { run_id: runId },
    ),
  getWorkflowRun: async (runName) => {
    const pastFiveMinutes = new Date(Date.now() - 5 * 60 * 1000)
      .toISOString()
      .slice(0, 19)
    const retryTimeout = 30000
    const retryInterval = 1000

    for (let retry = 0; retry < retryTimeout / retryInterval; retry++) {
      await sleep(retryInterval)

      const workflows = await apiRequest(
        'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs{?created}',
        { created: `>=${pastFiveMinutes}` },
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
    const jobsRes = await apiRequest(
      'GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs',
      { run_id: runId },
    )

    return jobsRes.data.jobs
  },
  // this is ugly, should we consider using webhooks instead?
  waitForRunCompletion: async (runId) => {
    console.log(`Waiting for workflow run ${runId} to complete...`)
    const pollingTimeout = 300000
    const pollingInterval = 5000

    for (
      let pollingCounter = 0;
      pollingCounter < pollingTimeout / pollingInterval;
      pollingCounter++
    ) {
      await sleep(pollingInterval)

      const workflow = await apiRequest(
        'GET /repos/{owner}/{repo}/actions/runs/{run_id}',
        { run_id: runId },
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
    const artifactsRes = await apiRequest(
      'GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts',
      { run_id: runId },
    )

    const artifacts = artifactsRes.data.artifacts
    const artifactContents = {}

    for (const artifact of artifacts) {
      const downloadRes = await apiRequest(
        'GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/{archive_format}',
        {
          artifact_id: artifact.id,
          archive_format: 'zip',
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
