import { closeSync, existsSync, openSync, readFileSync } from "node:fs";
import * as path from "node:path";
import * as os from 'node:os';
import * as vscode from 'vscode';

export const IS_WINDOWS = /^win/.test(process.platform)

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