import * as vscode from 'vscode';

export default function createRoboWebView(scriptUri: vscode.Uri, cssPath: vscode.Uri, xtermPath: vscode.Uri){
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Webview Example</title>
      <link rel="stylesheet" href="${cssPath}" />
      <link rel="stylesheet" href="${xtermPath}" />
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
            <div class="action_buttons">
                <div class="button_svg"></div>
                <div class="button_svg"></div>
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