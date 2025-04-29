import * as vscode from 'vscode';
import { getRoboPlaySession, isRoboProject, IS_WINDOWS, getPackageExecutor, getRoboPlaySessionJSON, getRoboPackageJSON, getLocalRoboData } from './back-utils'
import { exaButton} from '../front-end/front-utils'
import { ChildProcessWithoutNullStreams, spawn, spawnSync } from 'child_process';
import path from 'path';
import createDashBoardView from '../front-end/views/dashboardView';
import createRoboWebView from '../front-end/views/createRoboView';
import terminalView from '../front-end/views/terminalView';
import deploymentView from '../front-end/views/deploymentView';
import { availableMemory } from 'node:process';
import { execSync } from 'node:child_process';
let terminalPanel: vscode.WebviewPanel | null = null
let dashboardPanel: vscode.WebviewPanel | null = null;
let terminalLogs = '';
let roboProcess: ChildProcessWithoutNullStreams | null;
let loginProcess: ChildProcessWithoutNullStreams | null;
const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();

export function activate(context: vscode.ExtensionContext) {
	const provider = new CustomWebviewViewProvider(context);

	  context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			'robojsCreationView',
			provider
		)
	);

}

export function deactivate() {
	if(roboProcess) {
		roboProcess.kill();
	}
} 

class CustomWebviewViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(private readonly context: vscode.ExtensionContext) {
	console.log('CustomWebviewViewProvider initialized');
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
  ): void {
		this._view = webviewView;
		console.log("🟢 resolveWebviewView called for robojsCreationView");
	
		webviewView.webview.options = { enableScripts: true };
		webviewView.webview.html = this.getHtmlContent();
	
		console.log("✅ Webview HTML assigned successfully");
		webviewView.webview.onDidReceiveMessage(async (message) => {
		switch (message.command) {
			case 'terminal': 
				terminalTab(this.context);
				
			     break;
			case 'openRoboTab':
				creationTab(this.context);
				break;
				
			case 'start': {
				spawnSync('npx', ['robo','cloud', 'start'], {
					cwd
			});
				break;
			}
			case 'stop': {
				spawnSync('npx', ['robo','cloud', 'stop'], {
					cwd
			});
				break;
			}

			case 'dashboard': {
					dashboardTab(this.context);
				break;
			};
				default: break;
			}

		});
  }

  private getHtmlContent(): string {

	const renderButtons = () => {

		let html = ``;

		html += exaButton('Create Robo', 200, 50, 20, 'createRoboTab', '#F0B90B', '')
		html += exaButton('dashboard', 200, 50, 20, 'dashboard', '#97E5DA', '#00BFA5');
		html += exaButton('Terminal', 200, 50, 20, 'terminal', '#F0B90B', '');

		if(getRoboPlaySession() && isRoboProject()) {
			html += exaButton('Start', 200, 50, 20, 'start', '#97E5DA', '#00BFA5')
			html += exaButton('dashboard', 200, 50, 20, 'dashboard', '#97E5DA', '#00BFA5')
			html += exaButton('Stop', 200, 50, 20, 'stop', '#FC8591', '#FA4154')
			html += exaButton('Deploy', 200, 50, 20, 'deploy', '#F0B90B', '')

			

		} else {
			html += isRoboProject() ? exaButton('Login to WavePlay', 200, 50, 20, 'login', '#F0B90B', '') : ''

		}
			
		return html;
	};

    return `
     <!DOCTYPE html>
	 <html lang="en">
		<head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>Custom Tab</title>

		<style>
			button {
				border: none;
				background-color: transparent;
				transition: all 250ms;
			}

			button:hover {
				scale: 1.1;
				border-color: green;
				cursor: pointer;
			}

			.svg_text {
					display: flex;
					position: relative;
					justify-content: center;
					align-items: center;
					color: white;
				}

				.svg_text  > svg {
					z-index: 1;
					position: absolute;
				}

				.svg_text > span {
					font-weight: 600;
					z-index: 2;
					position: relative;
					cursor: pointer;
				}

				.button_container { 
					display: flex;
					flex-direction: column;
					gap: 20px
				
				}
		</style>
		</head>
		<body>


		<div class="button_container">
			${renderButtons()}
		</div>
		<p id="response"></p>
		
		<script>
			const vscode = acquireVsCodeApi();


			window.addEventListener('DOMContentLoaded', () => {

				const login = document.getElementById('login');
				const createRoboTab = document.getElementById('createRoboTab');
				const dashboard = document.getElementById('dashboard');	
				const deploy = document.getElementById('deploy');	
				const stop = document.getElementById('stop');
				const terminal = document.getElementById('terminal');

				if(terminal) {
					terminal.addEventListener('click', () => {
						vscode.postMessage({ command: 'terminal', text: 'Opening up terminal...' });
					});
				}

				if(createRoboTab) {
					createRoboTab.addEventListener('click', () => {
						vscode.postMessage({ command: 'openRoboTab', text: 'Login to WavePlay...' });
					});
				}

				if(dashboard) {
					dashboard.addEventListener('click', () => {
						vscode.postMessage({ command: 'dashboard', text: 'Login to WavePlay...' });
					});
				}

				// Listen for messages from the extension
				window.addEventListener('message', (event) => {
				const message = event.data; // The message from the extension
				if (message.command === 'reply') {
					document.getElementById('response').textContent = message.text;
				}
				});
			})

			
		</script>
		</body>
	</html>
    `;
  }
}

function creationTab(context: vscode.ExtensionContext){
	const panel = vscode.window.createWebviewPanel(
		'creationRobo',
		'robo creation',
		vscode.ViewColumn.One, 
		{
		  localResourceRoots: [
			vscode.Uri.joinPath(context.extensionUri, "dist")], 
		  enableScripts: true, 
		}
	  );

	   const scriptPath = vscode.Uri.file(
	 	path.join(context.extensionPath, 'dist', 'front-end', 'createRobo', 'createRobo.js')
	   );

	   const cssPath = vscode.Uri.file(
		path.join(context.extensionPath, 'dist', 'front-end', 'createRobo', 'styles.css')
	  );

	  const xtermCSSPath = vscode.Uri.file(
		path.join(context.extensionPath, 'dist', 'front-end', 'xterm.css')
	  );


	  const scriptUri = panel.webview.asWebviewUri(scriptPath);
	  const cssUri = panel.webview.asWebviewUri(cssPath);
	  const xtermUri = panel.webview.asWebviewUri(xtermCSSPath);
	  panel.webview.html = createRoboWebView(scriptUri, cssUri, xtermUri);
  
	  let selectedFolder: string  = "";
	  panel.webview.onDidReceiveMessage( async (message) => {
		switch(message.command){
			case 'selectFolder': {
				const folder = await vscode.window.showOpenDialog({
					canSelectFolders: true,
					canSelectFiles: false, 
					openLabel: 'Select a Folder'
				});

				if(!folder){
					panel.webview.postMessage({ command: 'noFolder', data: 'Please select a folder'});
					return;
				}
				panel.webview.postMessage({ command: 'folderFolded', data: ''});
				selectedFolder = folder[0].path.toString();
				break;
			}

			case 'closeCreationTab': {
					panel.dispose();
				break;
			}

			case "createRoboApplication": {
				const data = message.data as { 
					name: string,
					appKind: string,
					pckgManager: string,
                    selectedPlugins: Array<string>,
                    selectedFeatures: Array<string>,
                    token?: string,
                    clientId?: string
				};

				const isTypescript = data.selectedFeatures.includes('ts');
				const plugins = data.selectedPlugins.join(' ');
				const features = data.selectedFeatures.filter((feature) => feature !== 'ts').join(',');

				/**
				 * TODO: VERIFY TOKEN INPUT
				 */

				const args: Array<string> = [];

				args.push('create-robo');
				args.push(data.name ?? '');
				args.push('-k');
				args.push(data.appKind);
				if(isTypescript){
					args.push('-ts')
				}
				if(plugins.length > 0) {
					args.push('-p');
					args.push(plugins);
				}else {
					args.push('-np');
				}
				if(features.length > 0){
					args.push('-f');
					args.push(features);
				} else {
					args.push('-nf');
				}
				args.push('-nu');
				if(['bot', 'app'].includes(data.appKind)){
					args.push('--env');
					args.push(`"DISCORD_ID=${data.clientId},DISCORD_TOKEN=${data.token}"`);
				}
				args.push('-nc');
				
				if(!selectedFolder){
					return;
				}

				const packageExe = getPackageExecutor(data.pckgManager);
				const childProcess = spawn(packageExe, args, {
					cwd: selectedFolder,
					shell: IS_WINDOWS ? true : false,
				});

				childProcess.stdout.on("data", (data) => {
					panel.webview.postMessage({ command: "output", text: data.toString() });
				});

				childProcess.stderr.on("data", (data) => {
					panel.webview.postMessage({ command: "output", text: data.toString() });
				});

				childProcess.on('exit', (code, signal) => {
					console.log(`Child process exited with code ${code} and signal ${signal}`);
				});
				
				// Detect when process is completely closed
				childProcess.on('close', () => {
					panel.webview.postMessage({ command: "end" });
				});

				break;
			}
		}
	  });
  
}

function dashboardTab(context: vscode.ExtensionContext){



	if(dashboardPanel){
		dashboardPanel.dispose()
	}
	dashboardPanel =  vscode.window.createWebviewPanel(
		'webview',
		'Dashboard',
		vscode.ViewColumn.One, 
		{
		  localResourceRoots: [
			vscode.Uri.joinPath(context.extensionUri, "dist")], 
		  enableScripts: true, 
		  retainContextWhenHidden: true,
		  
		}
	  );



	  if(loginProcess){
		loginProcess.kill()
	  }

		const session = getRoboPlaySession();

		const cssPath = dashboardPanel.webview.asWebviewUri(vscode.Uri.file(
			path.join(context.extensionPath, 'dist', 'front-end', 'dashboard', 'styles.css')
		));
		  
		const scriptPath = dashboardPanel.webview.asWebviewUri(vscode.Uri.file(
			path.join(context.extensionPath, 'dist', 'front-end', 'dashboard', 'dashboard.js')
		));

		dashboardPanel.webview.html = createDashBoardView(scriptPath, cssPath);
		const localRoboData = getLocalRoboData(cwd, roboProcess)
		dashboardPanel?.webview.postMessage({command: 'localRoboData', data: localRoboData});

		dashboardPanel.webview.onDidReceiveMessage( async (message) => {
			
/**
 * 
 * Maybe refactor the code so localRoboData contains even the ressources used. ex: Ram, CPU and what not.
 */

			switch(message.command){

				case 'localRoboData': {
					const localRoboData = getLocalRoboData(cwd, roboProcess)
					dashboardPanel?.webview.postMessage({command: 'localRoboData', data: localRoboData});
					break;
				}

				case 'localRes': {
					let id: NodeJS.Timeout | null= null;

					if(roboProcess){
						id = setInterval(() => {
							if(!roboProcess && id){
								clearInterval(id)
							}
							const computerData = {
								cpu: roboProcess ? getCpuUsage() : 'Bot is offline',
								memory: roboProcess ? `${getMemoryUsage().toFixed(2)} Mb / ${(availableMemory() / 1024 / 1024 / 1024 * 100).toFixed(2)} Gb` : 'Bot is offline'
							}
	
							dashboardPanel?.webview.postMessage({command: 'localRes', data: computerData })
	
						}, 1500)
					} else {
						const computerData = {
							cpu: 'Bot is offline',
							memory: 'Bot is offline'
						}

						dashboardPanel?.webview.postMessage({command: 'localRes', data: computerData })
					}

					break;

				}

				case 'hostingInfos': {
					const json = getRoboPlaySessionJSON();

					if(json){
						
						console.log(json)
						const podId = json["linkedProjects"]["/Users/alexanderrobelin/Documents/GitHub/robos"].podId;
						console.log(podId)
						const podData = json.pods.filter((pod) => pod.id === podId)
						console.log(podData)

						dashboardPanel?.webview.postMessage({command: 'hostingInfos', data: JSON.stringify(podData)})
					}
					break;
				}

				case 'startButtonHosting': {
					spawnSync('npx', ['robo','cloud', 'start'], {
						cwd
				   });
					break;
				}
	
				case 'stopButtonHosting': {
					spawnSync('npx', ['robo','cloud', 'stop'], {
						cwd
				   });
					break;
				}
	
				case 'deploy': {
				const childProcess =  spawn('npx', ['robo','deploy'], {
					cwd,
					shell: IS_WINDOWS ? true : false
				});

				let s = false;

				childProcess.stdout.on("data", (data) => {
					const idx = data.toString().indexOf('https');
					
					// if(idx !== -1){
					// 	console.log(data.toString())
					// console.log(idx)
					// 	if(s === false){
					// 		const link =  extractDeployLink(data.toString());
					// 		deploymentTab(context, link);
					// 		s = true;
					// 	}
					// }

					childProcess.stdin.write('\r')
				});

				childProcess.stderr.on("data", (data) => {
					console.log(data.toString());
				});
				

				childProcess.on('exit', (code, signal) => {
					console.log(`Child process exited with code ${code} and signal ${signal}`);
				});
				
				// Detect when process is completely closed
				childProcess.on('close', () => {
					
				});
					break;
				}
	
				case 'startButtonLocal': {
					roboProcess = spawn('npm', ['run','dev'], {
						cwd
				   });

				   terminalTab(context)

				   roboProcess.on('error', (err) => {
						terminalLogs += err.toString();
						terminalPanel.webview.postMessage({ command: "output", text: err });
						console.error('Failed to start subprocess.', err);
				  });
				   
				   roboProcess.stdout.on("data", (data) => {
						terminalLogs += data.toString();


						if(data.toString().includes('standby')){
							const localRoboData = getLocalRoboData(cwd, roboProcess)
							dashboardPanel?.webview.postMessage({command: 'localRoboData', data: localRoboData});
						}
						

					    terminalPanel.webview.postMessage({ command: "output", text: data.toString() });
				  });

				  roboProcess.stderr.on("data", (data) => {
						terminalLogs += data.toString();
						terminalPanel.webview.postMessage({ command: "output", text: data.toString() });
			  	   });

					roboProcess.on('exit', (code, signal) => {
						terminalLogs += `Child process exited with code ${code} and signal ${signal}`
						terminalPanel.webview.postMessage({ command: "output", text: `Child process exited with code ${code} and signal ${signal}` });
					});
					
					// Detect when process is completely closed
					roboProcess.on('close', () => {
						dashboardPanel?.webview.postMessage({command: 'offline'});
						console.log('lmao process closed ?')
						terminalPanel?.dispose();
						terminalLogs = '';

					});
					break;
				}
	
				case 'stopButtonLocal': {
					if(roboProcess) {
						roboProcess.kill();
						roboProcess = null;
					}
					break;
				}

				case 'isLoggedIn': {
					dashboardPanel?.webview.postMessage({command: 'isLoggedIn', text: session})
					break;
				}


				case 'login': {
					let s = false;

					loginProcess =  spawn('npx', ['robo','login'], {
						cwd,
						shell: IS_WINDOWS ? true : false
					});
			
					loginProcess.stdout.on("data", (data) => {
						const beginning = 'https';
						const end = '=robo';

						if(data.indexOf(beginning) !== -1 && data.indexOf(end) !== -1){
							const sliced = data.slice(data.indexOf(beginning), data.indexOf(end) + end.length);
							if(!s){
								s = true;
								if(dashboardPanel){
									dashboardPanel.webview.postMessage({command: 'loginLink', text: sliced.toString()})
								}
							}
						}
					});
			
					loginProcess.stderr.on("data", (data) => {
						console.log(data.toString());
					});
					
			
					loginProcess.on('exit', (code, signal) => {
						console.log(`Child process exited with code ${code} and signal ${signal}`);
					});
					
					// Detect when process is completely closed
					loginProcess.on('close', () => {
						dashboardPanel.webview.postMessage({command: 'loggedIn'})
						console.log('lmao process closed ?')
					});
					break;
				}
	
				default: break;
			}
		});

		return;

}

function terminalTab(context: vscode.ExtensionContext){

	terminalPanel =  vscode.window.createWebviewPanel(
		'webview',
		'Robo Terminal',
		vscode.ViewColumn.One, 
		{
		  localResourceRoots: [
			vscode.Uri.joinPath(context.extensionUri, "dist")], 
			  enableScripts: true,
			  retainContextWhenHidden: true
			
		},
	  );

	   const scriptPath = vscode.Uri.file(
	 	path.join(context.extensionPath, 'dist', 'front-end', 'terminal', 'terminal.js')
	   );

	   const cssPath = vscode.Uri.file(
		path.join(context.extensionPath, 'dist', 'front-end', 'terminal', 'styles.css')
	  );

	  const xtermCSS = terminalPanel.webview.asWebviewUri(vscode.Uri.file(
		path.join(context.extensionPath, 'dist', 'front-end', 'xterm.css')
	  ));


	  const scriptUri = terminalPanel.webview.asWebviewUri(scriptPath);
	  const cssUri = terminalPanel.webview.asWebviewUri(cssPath);
  
	  terminalPanel.webview.html = terminalView(scriptUri, cssUri, xtermCSS);
  
	  terminalPanel.webview.onDidReceiveMessage( async (message) => {
		switch(message.command){
			case 'terminalLoaded': {
				terminalPanel.webview.postMessage({command: 'output', text: terminalLogs})
			break;
			}
			case 'output': {
				terminalPanel.webview.postMessage({command: 'output', text: message.text})
				break;
			}
		 default: 
			break;
		}
 	});
  
}


function deploymentTab(context: vscode.ExtensionContext, embed: string){

	const deployPanel =  vscode.window.createWebviewPanel(
		'webview',
		'RoboPlay Deploy',
		vscode.ViewColumn.One, 
		{
		  localResourceRoots: [
			vscode.Uri.joinPath(context.extensionUri, "dist")], 
			  enableScripts: true,
			  retainContextWhenHidden: true
			
		},
	  );

  
	  deployPanel.webview.html = deploymentView(embed);
  
}


function extractDeployLink(str: string){
    let httpsIndex = str.indexOf('https');
    let buffer = '';

    
    while(httpsIndex < str.length){
        const char = str[httpsIndex];
        if(char === '\n' || char === '\r' || char === " " || char === '\r\n'){
            break;
        }

        buffer += char;
        httpsIndex++;
    }

     return buffer;
}


function getCpuUsage() {

	if(roboProcess){
		if(process.platform === 'darwin'){
			const cmd = `ps up "${roboProcess.pid}" | tail -n1 | tr -s ' ' | cut -f3 -d' '`;
			const val = execSync(cmd);
			return `${val}%`;
		} else if (process.platform === 'win32'){
			return;
		}

	}
}


function getMemoryUsage() {
	const memoryUsage = process.memoryUsage();
	const rss = memoryUsage.rss / (1024 * 1024);  // Resident Set Size (in MB)
	// const heapTotal = memoryUsage.heapTotal / (1024 * 1024);  // Total heap size (in MB)
	// const heapUsed = memoryUsage.heapUsed / (1024 * 1024);  // Used heap size (in MB)
	// const external = memoryUsage.external / (1024 * 1024);  // External memory (in MB)

	return rss;
}