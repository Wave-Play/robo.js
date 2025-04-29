import { closeSync, existsSync, openSync, readFileSync } from "node:fs";
import * as path from "node:path";
import * as os from 'node:os';
import * as vscode from 'vscode';
import * as fs from 'node:fs';

export const IS_WINDOWS = /^win/.test(process.platform)

export function getFiles(dir): false | string[] {
	const dirExist = fs.existsSync(dir);
	let tsFiles: string[] = [];
	if(!dirExist){
		return false
	}
	if(dirExist){
		const files = fs.readdirSync(dir);
	
		files.forEach(file => {
		const filePath = path.resolve(dir, file);
		const stat = fs.statSync(filePath);
	
		if (stat.isDirectory()) {
			tsFiles = tsFiles.concat(getFiles(filePath) as string[]);
		} else {
			tsFiles.push(filePath);
		}
	});
}
	return tsFiles;
  }

export function getLocalRoboData(cwd, roboProcess){
	const cmdCount = getFiles(path.join(cwd, 'src', 'commands'));
	const pckJSON  = getRoboPackageJSON(path.join(cwd, 'package.json'));
	const localRoboData = {
		commandCount: cmdCount ? cmdCount.length : false,
		name: pckJSON ? pckJSON.name : 'Unknown',
		isRunning: roboProcess
	}

	return localRoboData
}

export function getRoboPackageJSON(cwd: string){
	const session = getRoboPlaySession();
	if(session){
		const file = fs.readFileSync(path.join(cwd), 'utf8');
		const parsedJSON = JSON.parse(file)
		return parsedJSON;
	} else {
		return false;
	}
}

export function getRoboPlaySessionJSON(){
	const session = getRoboPlaySession();
	if(session){
		const file = fs.readFileSync(path.join(os.homedir(), '.robo', 'roboplay', 'session.json'), 'utf8');
		const parsedJSON = JSON.parse(file)
		return parsedJSON;
	} else {
		return false;
	}
}

export function getRoboPlaySession() {
	return existsSync(path.join(os.homedir(), '.robo', 'roboplay', 'session.json'));
}

export function isRoboProject(){
	const cwd = path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd());
	const robo_path = path.join(cwd, 'config', 'robo.mjs');
	const is_robo = existsSync(robo_path);

	if(is_robo){
		const fd = openSync(robo_path, 'r');
		const file_string = readFileSync(fd, 'utf8');
		const rgx = file_string.match(/type:\s*['"]([^'"]+)['"]/);
		const project_kind = rgx ? rgx[1] : null;

		if(project_kind && project_kind === 'robo'){

			closeSync(fd);
			return true;
		} else {

			closeSync(fd);
			return false;
		}
	}

	return false;
}

export function getPackageExecutor(packageManager: string, external = true) {
	if (packageManager === "yarn") {
	  return external ? "yarn dlx" : "yarn";
	} else if (packageManager === "pnpm") {
	  return external ? "pnpx" : "pnpm";
	} else if (packageManager === "bun") {
	  return "bunx";
	} else {
	  return "npx";
	}
  }