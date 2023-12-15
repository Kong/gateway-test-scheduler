const fs = require('fs')
const path = require('path')
const { Octokit } = require('@octokit/rest')
const { subDays, format } = require('date-fns')
const tmp = require('tmp')
const AdmZip = require('adm-zip')

const token = process.env.GITHUB_TOKEN

const octokit = new Octokit({
  auth: token,
})

const getWorkflowRuns = async (owner, repo, workflowName) => {
  const sevenDaysAgo = format(subDays(new Date(), 1), 'yyyy-MM-dd')

  const response = await octokit.actions.listWorkflowRuns({
    owner,
    repo,
    workflow_id: workflowName,
    per_page: 100,
  })

  return response.data.workflow_runs.filter(
    (run) => run.created_at >= sevenDaysAgo,
  )
}

const downloadArtifact = async (
  owner,
  repo,
  runId,
  artifact,
  dataDirectory,
) => {
  const response = await octokit.actions.downloadArtifact({
    owner,
    repo,
    artifact_id: artifact.id,
    archive_format: 'zip',
  })

  const tmpFile = tmp.fileSync({ suffix: '.zip' })
  fs.writeFileSync(tmpFile.name, Buffer.from(response.data))
  const zip = new AdmZip(tmpFile.name)
  const fileContent = zip.readAsText(zip.getEntries()[0])
  const filePath = path.join(dataDirectory, `${runId}_${artifact.name}.txt`)
  fs.writeFileSync(filePath, fileContent)
}

const downloadStatistics = async (
  repoSpec,
  workflowName,
  artifactNameRegexp,
  dataDirectory,
) => {
  const [owner, repo] = repoSpec.split('/')
  try {
    if (!fs.existsSync(dataDirectory)) {
      fs.mkdirSync(dataDirectory)
    }

    const workflowRuns = await getWorkflowRuns(owner, repo, workflowName)

    const matchArtifactName = new RegExp(artifactNameRegexp)
    const shouldDownloadArtifact = (artifact) =>
      artifact.name.match(matchArtifactName)

    const workflowRunCount = workflowRuns.length
    let artifactCount = 0
    for (const run of workflowRuns) {
      const artifacts = await octokit.actions.listWorkflowRunArtifacts({
        owner,
        repo,
        run_id: run.id,
      })

      for (const artifact of artifacts.data.artifacts) {
        if (shouldDownloadArtifact(artifact)) {
          artifactCount += 1
          await downloadArtifact(owner, repo, run.id, artifact, dataDirectory)
        }
      }
    }
    return { workflowRunCount, artifactCount, dataDirectory }
  } catch (error) {
    console.error('Error:', error.message)
  }
}

module.exports = { downloadStatistics }
