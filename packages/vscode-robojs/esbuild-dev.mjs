import fs from 'fs';
import { getFiles, frontendDir, backendDir, compileBackFile, compileFrontFile, frontOutput, backOutput} from './compilation-utils.mjs';



const watchDirectory = (dir) => {
  fs.watch(dir, { recursive: true }, (eventType, filename) => {
    if (dir.includes("front-end")) {
      console.log('Recompiling Front-end...')




      if(fs.existsSync(frontOutput)){
        console.log('deleting directory..', frontOutput)
        fs.rmSync(frontOutput, { recursive: true, force: true });
      }

      const frontendFiles = getFiles(frontendDir)
      frontendFiles.forEach((file) => {
        compileFrontFile(file).catch(() => {
          
        });
      })
      console.log('Front-end compiled')
    } else if(dir.includes('back-end')){
      console.log('Recompiling Back-end')


      if(fs.existsSync(backOutput)){
        console.log('deleting directory..', backOutput)
        fs.rmSync(backOutput, { recursive: true, force: true });
      }

      const backendFiles = getFiles(backendDir)
      backendFiles.forEach(file => {
        compileBackFile(file).catch(() => {
          
        }); // Exit on error
      });
      console.log('Back-end recompiled', filename)
    }
  });
};
// Start watching

console.log('Starting development to watch for file changes...');
watchDirectory(frontendDir);
watchDirectory(backendDir);