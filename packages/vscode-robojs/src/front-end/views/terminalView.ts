export default function terminalView(scriptPath: vscode.Uri, cssPath: vscode.Uri, xtermCSS: vscode.Uri){
	return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Robo Terminal</title>
	  <link rel="stylesheet" href="${xtermCSS}" />
	  <link rel="stylesheet" href="${cssPath}" />
    </head>
    <body>
		<div id="terminal"></div>
		<script>const vscode = acquireVsCodeApi();</script>
		<script src=${scriptPath} defer></script>
    </body>
    </html>`;
}