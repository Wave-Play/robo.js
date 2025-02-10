import { getTSFiles, frontendDir, backendDir, compileBackFile, compileFrontFile } from './compilation-utils.mjs';

const frontendFiles = getTSFiles(frontendDir)
const backendFiles = getTSFiles(backendDir)

frontendFiles.forEach((file) => {
  compileFrontFile(file).catch(() => process.exit(1)); // Exit on error
})

backendFiles.forEach(file => {
  compileBackFile(file).catch(() => process.exit(1)); // Exit on error
});

