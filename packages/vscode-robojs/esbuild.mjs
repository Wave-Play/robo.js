import {  frontendDir, backendDir, compileBackFile, compileFrontFile, getFiles, frontOutput, backOutput } from './compilation-utils.mjs';
import fs from 'fs';

const frontendFiles = getFiles(frontendDir)
const backendFiles = getFiles(backendDir)

if(fs.existsSync(frontOutput)){
  fs.rmSync(frontOutput, { recursive: true, force: true });
}

if(fs.existsSync(backOutput)){
  fs.rmSync(backOutput, { recursive: true, force: true });
}

frontendFiles.forEach((file) => {
  compileFrontFile(file).catch(() => process.exit(1)); // Exit on error
})

backendFiles.forEach(file => {
  compileBackFile(file).catch(() => process.exit(1)); // Exit on error
});

