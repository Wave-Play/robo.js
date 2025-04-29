//vsce package -o my-extension.vsix
import { getFiles, frontendDir, backendDir, compileBackFile, compileFrontFile} from './compilation-utils.mjs';

const backendFiles = getFiles(backendDir)
    backendFiles.forEach(file => {
    compileBackFile(file).catch(() => {
        
    }); // Exit on error
});


const frontEndFiles = getFiles(frontendDir)
frontEndFiles.forEach(file => {
    compileFrontFile(file).catch(() => {
    
    }); // Exit on error
});