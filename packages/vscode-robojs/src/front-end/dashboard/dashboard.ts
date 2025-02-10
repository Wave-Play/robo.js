
import  {Terminal }  from '@xterm/xterm';
import { buttonComponent } from '../front-utils';
import "./styles.css";

window.addEventListener('DOMContentLoaded', () => {
    let hostingDash = false;

    const help_bubble: HTMLSpanElement | null = document.querySelector("#helpBubble");
    const switchHosting: HTMLSpanElement | null = document.querySelector("#switch");

    function loadButtons(){
        const buttonDiv = document.querySelector('.buttons');
        if(buttonDiv){
            if(hostingDash){
                buttonDiv.innerHTML = `
                    ${buttonComponent('start', 150, 43, 16, 'startButtonHosting', "#F0B90B", '')}
                    ${buttonComponent('stop', 150, 43, 16, 'stopButtonHosting', "#E33042", '')}
                    ${buttonComponent('stop', 150, 43, 16, 'deploy', "#F0B90B", '')}`;

                    document.querySelector("#startButtonHosting")?.addEventListener('click', () => {
                        vscode.postMessage({ command: 'startHosting' });
                    });

                    document.querySelector("#stopButtonHosting")?.addEventListener('click', () => {
                        vscode.postMessage({ command: 'stopButtonHosting' });
                    });

                    document.querySelector("#deploy")?.addEventListener('click', () => {
                        vscode.postMessage({ command: 'deploy' });
                    });

            } else {
                buttonDiv.innerHTML = `
                    ${buttonComponent('start', 150, 43, 16, 'startButtonLocal', "#F0B90B", '')}
                    ${buttonComponent('stop', 150, 43, 16, 'stopButtonLocal', "#E33042", '')}`;


                    document.querySelector("#startButtonLocal")?.addEventListener('click', () => {

                        vscode.postMessage({ command: 'startButtonLocal' });
                    });

                    document.querySelector("#stopButtonLocal")?.addEventListener('click', () => {
                        vscode.postMessage({ command: 'stopButtonLocal' });
                    });
            }
        }
    }

    loadButtons();


    if(switchHosting){
        switchHosting.onclick = () => {
            if(hostingDash){
                switchHosting.textContent = 'Local';
                hostingDash = false;
            } else {
                 switchHosting.textContent = 'RoboPlay';
                hostingDash = true;
            }
            loadButtons();
        };
    }

    if(help_bubble){
        help_bubble.onmouseover = () => {
            help_bubble.setAttribute("data-after-content", `Local: Local development of your Robo\nRoboPlay: online hosting of your Robo`);
        };

        help_bubble.onmouseleave= () => {
            help_bubble.setAttribute("data-after-content", ``);
        };
    }


    const terminalDv: HTMLElement | null = document.querySelector("#terminal");

    if(terminalDv){
        const terminal = new Terminal({convertEol: true});
        terminal.open(terminalDv);

    window.addEventListener('message', (event: any) => {
        const message = event.data;
        if(message.command === "output"){
                terminal.write(message.text);
            }
        });
    }


});