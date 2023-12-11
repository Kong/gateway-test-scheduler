const fs = require('fs').promises

const appendToFile = async (filePath, lineToAppend) => {
  const fileHandle = await fs.open(filePath, 'a')
  await fileHandle.write(`${lineToAppend}`)
  await fileHandle.close()
}

module.exports = appendToFile
