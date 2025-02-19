import path from 'path';
import fs from 'fs';
import esbuild from 'esbuild';

export function getFiles(dir) {
  const files = fs.readdirSync(dir);
  let tsFiles = [];

  files.forEach(file => {
    const filePath = path.resolve(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      tsFiles = tsFiles.concat(getFiles(filePath));
    } else {
      tsFiles.push(filePath);
    }
  });

  return tsFiles;
}

export const backendDir = path.join(process.cwd(), 'src', 'back-end');
export const backOutput = path.join(process.cwd(), 'dist', 'back-end');

export const frontendDir = path.join(process.cwd(), 'src', 'front-end');
export const frontOutput = path.join(process.cwd(), 'dist', 'front-end');

export function compileFrontFile(file){

   const splitPath = file.split(path.sep);
   const fidx = splitPath.indexOf('front-end');

    let outdir = path.join(frontOutput, ...splitPath.slice(fidx + 1, splitPath.length - 1));
    if(!fs.existsSync(outdir)){
      fs.mkdirSync(outdir, { recursive: true });
    }

    // if(fs.existsSync(file)){
    //   fs.rmSync(file)
    // }

    return esbuild.build({
      outdir,
      allowOverwrite: true,
      entryPoints: [file],      // Each TypeScript file is an entry point
      bundle: true,                  // Bundle the dependencies for each file
      minify: true,                  // Minify the output JavaScript
      sourcemap: true,
      tsconfig: './tsconfig.web.json',
      
    })
}
  
export function compileBackFile(file){

  const splitPath = file.split(path.sep);
   const fidx = splitPath.indexOf('back-end');

    let outdir = path.join(frontOutput, ...splitPath.slice(fidx + 1, splitPath.length - 1));
    if(!fs.existsSync(outdir)){
      fs.mkdirSync(outdir, { recursive: true});
    }


    // if(fs.existsSync(file)){
    //   fs.rmSync(file)
    // }

    return esbuild.build({
      allowOverwrite: true,
      outdir: backOutput,
      entryPoints: [file],      // Each TypeScript file is an entry point
      bundle: true,                  // Bundle the dependencies for each file
      minify: true,                  // Minify the output JavaScript
      sourcemap: true,               // Optional: create a source map for debugging
      tsconfig: './tsconfig.node.json' ,
      platform: 'node',           // ES Module format
      external: ['vscode']
    });
}