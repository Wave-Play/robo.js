import { boxSvgBottom, boxSvgTop, informationComponent } from "../front-utils";

export default function createDashBoardView(scriptPath: vscode.Uri, cssPath: vscode.Uri){
    const boxWidth = 600;
    const slope = 10;

    return `<!DOCTYPE html>
        <html lang="en">
            <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Dashboard</title>
            <link rel="stylesheet" href="${cssPath}" />
            </head>
        <body>
        <iframe id="loginFrame" src=""></iframe>
       <main>
            <div class="bubble" style="width: ${boxWidth - (boxWidth / slope) * 2}px; margin: auto; align-items: center; padding-block: 5px;">	
                <span id="switch"></span>
                <span id="helpBubble">${informationComponent('?', 25, 25)}</span>
            </div>
            ${boxSvgTop(boxWidth, 100, slope)}
            <div id="content">
                <div id="middle">
                </div>
            </div>
            ${boxSvgBottom(600, 100, 10, 180)}
        </main>

        <script>const vscode = acquireVsCodeApi();</script>
        <script src=${scriptPath} defer></script>
        </body>
        </html>`;

}


/**
 * 
 * 
                    <div class="infos">
                    </div>
                        <div class="cpu_container">
                            <span>CPU usage:</span>
                            <span class="cpu"></span>
                        </div>
 */