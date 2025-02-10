import fs from 'fs';
import path from 'path';

import { frontendDir, backendDir, compileBackFile, compileFrontFile } from './compilation-utils.mjs';

const watchDirectory = (dir) => {
  fs.watch(dir, { recursive: true }, (eventType, filename) => {
    if (dir.includes("front-end")) {
      console.log('Compiling Front end File ->', filename)
      compileFrontFile(path.join(dir, filename));
      console.log('Compiled Front end File ->', filename)
    } else if(dir.includes('back-end')){
      console.log('Compiling Back end File ->', filename)
      compileBackFile(path.join(dir, filename))
      console.log('Compiled Back end File ->', filename)
    }
  });
};
// Start watching

console.log('Starting development to watch for file changes...');
watchDirectory(frontendDir);
watchDirectory(backendDir);