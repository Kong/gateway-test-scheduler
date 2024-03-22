const fs = require('fs').promises
const path = require('path')

/* Creates symlinks recursively, sub-directories that already exist in
 * `sourceDir` are not overwritten, they are accessed and symlinks are created
 * inside them for the corresponding files in the `destDir` tree. This is to
 * avoid (as much as possible) to lose files from `sourceDir` by replacing
 * non-empty directories with symlinks.
 */
const createSymlinks = async (sourceDir, destDir) => {
  const filesCreated = []
  const destFiles = await fs.readdir(destDir)

  for (const destFile of destFiles) {
    const sourceFilePath = path.join(sourceDir, destFile)
    const destFilePath = path.join(destDir, destFile)

    try {
      const sourceStats = await fs.lstat(sourceFilePath)
      if (sourceStats.isDirectory()) {
        // if source file is a directory continue recursively
        filesCreated.push(
          ...(await createSymlinks(sourceFilePath, destFilePath)),
        )
        continue
      }
      // delete source file if it already exists (and is not a directory)
      await fs.unlink(sourceFilePath)
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(error)
      }
    }

    // Create the symlink
    await fs.symlink(destFilePath, sourceFilePath)
    filesCreated.push(sourceFilePath)
  }

  return filesCreated
}

const setup = async (buildRootPath, buildName, sourceDirPath) => {
  if (!buildRootPath || !buildName || !sourceDirPath) {
    console.error(
      'One or more required parameters are missing, skipping installation',
    )
    return
  }
  console.debug('Installation started')
  const buildPath = path.join(buildRootPath, buildName)
  const files = await createSymlinks(sourceDirPath, buildPath)
  console.debug('Installation completed')
  return files
}

const cleanup = async (files) => {
  if (!files) {
    console.log('No files to cleanup')
    return
  }

  console.debug('Cleanup started')
  for (const file of files) {
    try {
      await fs.unlink(file)
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(error)
      }
    }
  }
  console.debug('Cleanup completed')
}

module.exports = {
  setup,
  cleanup,
}
