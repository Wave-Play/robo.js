import path from 'path';
import fs from 'fs';
import esbuild from 'esbuild';

export function getTSFiles(dir) {
  const files = fs.readdirSync(dir);
  let tsFiles = [];

  files.forEach(file => {
    const filePath = path.resolve(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {

      tsFiles = tsFiles.concat(getTSFiles(filePath));
    } else if (file.endsWith('.ts')) {
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
    return esbuild.build({
      outdir: frontOutput,
      entryPoints: [file],      // Each TypeScript file is an entry point
      bundle: true,                  // Bundle the dependencies for each file
      minify: true,                  // Minify the output JavaScript
      sourcemap: true,
      tsconfig: './tsconfig.web.json',
      loader: {
        '.css': 'css', // Treat CSS files as text (so they can be injected into JavaScript)
      },
    })
}
  
export function compileBackFile(file){
    return esbuild.build({
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