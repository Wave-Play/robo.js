import * as vscode from 'vscode';
import { getRoboPlaySession, isRoboProject, IS_WINDOWS } from './back-utils'
import { boxSvgBottom, exaButton, boxSvgTop, informationComponent } from '../front-end/front-utils'
import { ChildProcessWithoutNullStreams, spawn, spawnSync } from 'child_process';
import path from 'path';

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
	console.log('Extension deactivated');
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
		// const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
		const cwd = '/Users/sushi/Documents/dev/robos/bots/w3sbot';
			switch (message.command) {
			case 'login': {
				const childProcess =  spawn('npx', ['robo','login'], {
					cwd
				});


				childProcess.stdout.on("data", (data) => {
					const beginning = 'https';
					const end = '=robo';
					const sliced = data.slice(data.indexOf(beginning), data.indexOf(end) + end.length);

					if(sliced){
						//loginTab(this.context, sliced.toString());
		
					}
				});

				childProcess.stderr.on("data", (data) => {
					console.log(data.toString());
				});
				

				childProcess.on('exit', (code, signal) => {
					console.log(`Child process exited with code ${code} and signal ${signal}`);
				});
				
				// Detect when process is completely closed
				childProcess.on('close', () => {
					//creationTab(this.context);
				});

				break;
			}
			case 'openRoboTab':
				//creationTab(this.context);
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

			case 'deploy':{
				const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
				const childProcess =  spawn('npx', ['robo','deploy'], {
					cwd,
					shell: IS_WINDOWS ? true : false
				});

				childProcess.stdout.on("data", (data) => {
					const beginning = 'https';
					const end = '=robo';
					const sliced = data.slice(data.indexOf(beginning), data.indexOf(end) + end.length);
					if(sliced){
						deployTab(this.context, sliced.toString());
					}
				});

				childProcess.stderr.on("data", (data) => {
					console.log(data.toString());
				});
				

				childProcess.on('exit', (code, signal) => {
					console.log(`Child process exited with code ${code} and signal ${signal}`);
				});
				
				// Detect when process is completely closed
				childProcess.on('close', () => {
					creationTab(this.context);
				});
				break;
				}
				default: break;
			}

		});
  }

  private getHtmlContent(): string {

	const renderButtons = () => {

		let html = ``;

		html += exaButton('Create Robo', 200, 50, 20, 'createRoboTab', '#F0B90B', '')
		html += exaButton('dashboard', 200, 50, 20, 'dashboard', '#97E5DA', '#00BFA5');


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

				if(login) {
					login.addEventListener('click', () => {
						vscode.postMessage({ command: 'login', text: 'Login to WavePlay...' });
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

				if(deploy) {
					deploy.addEventListener('click', () => {
						vscode.postMessage({ command: 'deploy', text: 'Login to WavePlay...' });
					});
				}
					
				if(stop) {
					stop.addEventListener('click', () => {
						vscode.postMessage({ command: 'stop', text: 'Login to WavePlay...' });
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
			vscode.Uri.joinPath(context.extensionUri, "sounds"),
			vscode.Uri.joinPath(context.extensionUri, "dist")], 
		  enableScripts: true, 
		}
	  );

	   const scriptPath = vscode.Uri.file(
	 	path.join(context.extensionPath, 'dist', 'renders.js')
	   );

	  const scriptUri = panel.webview.asWebviewUri(scriptPath);

  
	  panel.webview.html = createRoboWebView(scriptUri);
  
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
					kind: string,
					pckgManager: string,
                    selectedPlugins: Array<string>,
                    selectedFeatures: Array<string>,
                    token?: string,
                    id?: string
				};

				const plugins = data.selectedPlugins.join(' ');
				const features = data.selectedFeatures.join(',');

				/**
				 * TODO: VERIFY TOKEN INPUT
				 */

				const args: Array<string> = [];

				args.push('create-robo');
				args.push(data.name);
				args.push('-k');
				args.push(data.kind);
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
				if(['bot', 'app'].includes(data.kind)){
					args.push('--env');
					args.push(`"DISCORD_ID=${data.id},DISCORD_TOKEN=${data.token}"`);
				}
				args.push('-nc');
				
				if(!selectedFolder){
					return;
				}

				const packageExe = 'npx' // getPackageExecutor(data.pckgManager);
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

// function loginTab(context: vscode.ExtensionContext, embed: string){
// 	const panel = vscode.window.createWebviewPanel(
// 		'creationRobo', // ID for the panel
// 		'login', // Title of the panel (shown as the tab name)
// 		vscode.ViewColumn.One, // Where to display the Webview (in this case, in the first column)
// 		{
// 		  enableScripts: true, // Allows JavaScript execution in the Webview
// 		}
// 	  );
// 	 // panel.webview.html = createLoginWebView(embed);


// }

function deployTab(context: vscode.ExtensionContext, embed: string){
	const panel = vscode.window.createWebviewPanel(
		'creationRobo', // ID for the panel
		'deploy', // Title of the panel (shown as the tab name)
		vscode.ViewColumn.One, // Where to display the Webview (in this case, in the first column)
		{
		  enableScripts: true, // Allows JavaScript execution in the Webview
		}
	  );


	  panel.webview.html = createDeployView(embed);

}

function dashboardTab(context: vscode.ExtensionContext){
	const panel = vscode.window.createWebviewPanel(
		'creationRobo', 
		'deploy',
		vscode.ViewColumn.One,
		{
		localResourceRoots: [
			vscode.Uri.joinPath(context.extensionUri, "dist", 'front-end')],
		enableScripts: true, 
		}
	);

	const cssPath = panel.webview.asWebviewUri(vscode.Uri.file(
		path.join(context.extensionPath, 'dist', 'front-end', 'dashboard.css')
	));
	  
	const scriptPath = panel.webview.asWebviewUri(vscode.Uri.file(
		path.join(context.extensionPath, 'dist', 'front-end', 'dashboard.js')
	));

	  panel.webview.html = createDashBoardView(scriptPath, cssPath);

	  panel.webview.onDidReceiveMessage( async (message) => {
		const cwd = '/Users/sushi/Documents/dev/robos/bots/w3sbot';
		let localRoboProcess: ChildProcessWithoutNullStreams | undefined = undefined;
		switch(message.command){

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
				spawnSync('npx', ['robo','deploy'], {
					cwd
			   });
				break;
			}

			case 'startButtonLocal': {
				localRoboProcess = spawn('npm ', ['run','dev'], {
					cwd
			   });

			   localRoboProcess.stdout.on("data", (data) => {
				panel.webview.postMessage({ command: "output", text: data.toString() });
			  });



				break;
			}

			case 'stopButtonLocal': {
				if(localRoboProcess) {
					//process.kill(localRoboProcess.pid);
				}
				break;
			}

			default: break;
		}
	});
}

function createDeployView(embed: string){
	return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>WavePlay Login</title>

	  <style>

	  html, body {
		width: 100%;
		height: 100%;
		margin: 0;
		padding: 0;
	  }

	  iframe {

		width: 100%;
		height: 100%;
		border: none;
	  }
	  </style>
    </head>
    <body>

	<iframe src="${embed}"></iframe>
    </body>
    </html>`;
}

function createRoboWebView(scriptUri: vscode.Uri){
	return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Webview Example</title>

	  <style>

	  	*,
		*::before,
		*::after {
			box-sizing: border-box;
		}

		html, body {
			height: 100%;
			width: 100%;
		}

		body {
			margin: 0;
			background-color: #0D1126;
			display: grid;
			place-items: center;
			position: relative;
		}

		canvas {
    		position: absolute;
			z-index: 0;
		}

		.text_input_container {
    		border: 2px solid #424141;
		}

		.text_input {
		    width: 100%;
			height: 100%;
			border: none;
			background: none;
			color: white;
			font-size: 1.2em;
			padding: 1em;
		}

		.container {
			display: flex;
			flex-direction: column;
			justify-content: center;
			gap: 25px;
			width: 30%;
			position: relative;
			z-index: 3;
		}

		.section-title {
			font-size: 2rem;
			font-weight: bold;
			color: #FFFFFF;
		}

		select {
			background-color: transparent;
			border: none;
			padding: 0 1em 0 0;
			margin: 0;
			width: 100%;
			font-family: inherit;
			font-size: inherit;
			cursor: inherit;
			line-height: inherit;
		}

		#helpBubble::after {
			content: attr(data-after-content);
			width: 200px;
			display: flex;
			background-color: #3d3a3a85;
			position: absolute;
    		left: -100px;
		}

		select::-ms-expand {
			display: none;
		}	

		.select {
			padding: 1em;
			border: 2px solid #424141;
			color: #FFFFFF;
			font-weight: bold;
			text-align: center;
			cursor: pointer;
			line-height: 1.1;
			font-size: 1rem;
		}

		#createBot{
			width: fit-content;
			padding: 1rem;
			border: none;
			background-color: #F0B90B;
			color: #000000;
			font-weight: 600;
    		align-self: center;
			cursor: pointer;
		}

		#projectName {
			width: 100%;
			background: transparent;
		}

		#content {
			display: flex;
			flex-direction: column;
			gap: 25px;
		}

		.error {
			color: #FA4154;
			font-weight: bold;
		}


		.robo_upgrades {
			font-weight: bold;
			font-size: 1em;s
			width: 90%;
			padding: 1rem;
			border: 2px solid #424141;
			cursor: pointer;
		}

		input[type="checkbox"]  {
			display: none;
		}

		input[type=file]{
		 	display: none;
		}

		    button { background-color: transparent };

		#robo_location_data{
		 display: flex;
		 flex-direction: column;
		 gap: 10px;
		}

		#robo_location_data > #top-row, #bottom-row {
			display: flex;
    		justify-content: space-between;
			width: 90%;
		}

		.location_input {
			display: flex;
			flex-direction: column;
   			width: fit-content;
		}

		#bottom-row > .location_input > input {
    		width: 90%;
		}

		#helpBubble {
		
			transition: all 500ms
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

		.helpBubble {
			display: flex;
			align-items: center;
			gap: 20px;
		}

		#button_svg {
			display: flex;
			position: relative;
			justify-content: center;
			align-items: center;
			transition: all 500ms;
			color: black;
		}

		#button_svg > svg {
			z-index: 1;
			position: absolute;
		}

		#button_svg > span {
			font-weight: 600;
			z-index: 2;
			position: relative;
			cursor: pointer;
		}

		#button_svg:hover {
			transform: scale(1.1)
		}
	  </style>
    </head>
    <body>
		<canvas id="stars"></canvas>
	  	<div class="container">
		    <div class='steps'>
				<span id="steps_no"></span>
				<span id="steps_title"><span> 
			</div>
			<span class="section-title"></span>
			<div id='content'>
			</div>
			<div id="button_svg">
			</div>
		</div>
		<script>
            const vscode = acquireVsCodeApi();
        </script>
	<script src="${scriptUri}"></script>
    </body>
    </html>
  `;
}


function terminalView(){

	return ``;
}

function createDashBoardView(scriptPath: vscode.Uri, cssPath: vscode.Uri){

	return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>WavePlay Login</title>
	  <link rel="stylesheet" href="${cssPath}" />
    </head>
    <body>
 
	
	<main>
	<div class="bubble">
		<span id="switch">RoboPlay</span>
		<span id="helpBubble">${informationComponent('?', 25, 25)}</span>
	</div>
		${boxSvgTop(600, 100, 10)}
 		 <div id="content">
			<div id="middle">
				<div class="infos">
					<div class="cpu_container">
						<span>CPU usage:</span>
						<span class="cpu"></span>
					</div>
					<div class="memory_container">
						<span class="ram">Ramusage:</span>
						<span class="memory"></span>
					</div>
				</div>
				<div class="buttons"></div>
			</div>
		 </div>

		 ${boxSvgBottom(600, 100, 10, 180)}
	</main>

	<script>const vscode = acquireVsCodeApi();</script>
	<script src=${scriptPath}></script>
    </body>
    </html>`;

}