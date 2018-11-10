const { createLambda } = require('@now/build-utils/lambda.js')
const download = require('@now/build-utils/fs/download.js')
const FileBlob = require('@now/build-utils/file-blob.js')
const FileFsRef = require('@now/build-utils/file-fs-ref.js')
const fs = require('fs')
const glob = require('@now/build-utils/fs/glob.js')
const path = require('path')
const { promisify } = require('util')
const { runNpmInstall, runPackageJsonScript } = require('@now/build-utils/fs/run-user-scripts.js')
const readFile = promisify(fs.readFile)

exports.build = async ({ files, entrypoint, workPath }) => {
  // Download files
  console.log('downloading user files...')
  const userPath = path.join(workPath, 'user')
  const downloadedFiles = await download(files, userPath)

  // Add user prefix to all sources
  const filesOnDisk = {}
  for (const [fPath, contents] of Object.entries(downloadedFiles)) filesOnDisk[`user/${fPath}`] = contents

  // Install NPM
  console.log('Installing dependencies ...')
  const npmRoot = path.join(userPath, path.dirname(entrypoint))
  await runNpmInstall(npmRoot)
  const dependencies = await glob('**', npmRoot)

  // Create the launcher
  const launcherData = (await readFile(path.join(__dirname, 'launcher.js'), 'utf8')).replace(
    '{{ENTRYPOINT}}',
    entrypoint.replace(/\.js$/, '')
  )

  const launcherFiles = {
    'launcher.js': new FileBlob({ data: launcherData }),
    'bridge.js': new FileFsRef({ fsPath: require('@now/node-bridge') })
  }

  // Create the Lambda
  console.log(Object.keys(dependencies))
  const lambda = await createLambda({
    files: { ...filesOnDisk, ...launcherFiles },
    handler: 'launcher.launcher',
    runtime: 'nodejs8.10'
  })

  return { [entrypoint]: lambda }
}

exports.prepareCache = async ({ files, entrypoint, cachePath }) => {
  return {
    ...(await glob('user/node_modules/**', cachePath)),
    ...(await glob('user/package-lock.json', cachePath)),
    ...(await glob('user/yarn.lock', cachePath))
  }
}
