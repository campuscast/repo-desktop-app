function readPackage(pkg) {
  // Prevent lightningcss from being installed — it has native bindings
  // that break electron-vite v5's SSR build mode for the renderer.
  if (pkg.optionalDependencies && pkg.optionalDependencies.lightningcss) {
    delete pkg.optionalDependencies.lightningcss
  }
  return pkg
}

module.exports = { hooks: { readPackage } }
