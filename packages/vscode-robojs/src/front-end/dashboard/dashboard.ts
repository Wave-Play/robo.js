
import { buttonComponent } from '../front-utils';

window.addEventListener('DOMContentLoaded', () => {
    
    let hostingDash = false;
    let isLoggedIn: boolean;
    const main: HTMLSpanElement | null = document.querySelector('main');

    const help_bubble: HTMLSpanElement | null = document.querySelector("#helpBubble");
    const switchHosting: HTMLSpanElement | null = document.querySelector("#switch");
    const status: HTMLSpanElement | null = document.querySelector('.status');
    const commandCount: HTMLSpanElement | null = document.querySelector('.commandCount');
    const middleDiv: HTMLSpanElement | null = document.querySelector('#middle');
    const iframes: HTMLIFrameElement | null = document.querySelector('#loginFrame');
    const memory: HTMLSpanElement | null = document.querySelector(".memoryValue")
    const cpu: HTMLSpanElement | null = document.querySelector(".cpuValue")
    const nameDiv = document.querySelector('#botName')

    vscode.postMessage({ command: 'isLoggedIn' })

    if(switchHosting){
        if(hostingDash){
            switchHosting.textContent = 'RoboPlay';
        } else {
            switchHosting.textContent = 'Local'
        }
    }

    window.addEventListener('message', (event: any) => {
        const message = event.data;


        // include pod type ? 

        if(message.command === 'hostingInfos'){
            if(status){
                const project = JSON.parse(message.data)[0];
                const name = project.robo.name;

                if(nameDiv){
                    nameDiv.innerHTML = name
                }
                if(project.status === 'Online'){
                    status.style.color = '#00BFA5';
                }else if(project.status === 'Offline'){
                    status.style.color = '#E33042';
                }
                status.textContent = project.status;

            }

            return;
        }

        if(message.command === 'localRes'){
            if(memory && cpu && !hostingDash){
                memory.textContent = message.data.memory;
                cpu.textContent = message.data.cpu;
            }

            return;
        }
        if(message.command === "loggedIn"){
            hostingDash = true;
            isLoggedIn = true;
            loadButtons()
            if(iframes !== null && main){
                slideContent(iframes, main, 'right')
                iframes.src = "";

            }
            return;
        }
        if(message.command === 'loginLink'){
            if(iframes !== null){
                iframes.src = message.text;

                if(main){
                    slideContent(main, iframes, 'left')
                }

            }
            
            return;
        }
        if(message.command === "isLoggedIn"){
            isLoggedIn = message.text;
            return;
        }
        
        if(message.command === "offline"){
            if(status){
                status.textContent = 'offline';
                status.style.color = '#E33042';
            }

            return;
        }

        if(message.command === "localRoboData"){
            vscode.postMessage({command: 'localRes'});

            if(commandCount && nameDiv && status){
                nameDiv.textContent = message.data.name;
                if(!message.data.commandCount){  
                    commandCount.textContent = '0';
                    commandCount.style.fontWeight = 'lighter';
                }
                commandCount.textContent = message.data.commandCount;
                commandCount.style.fontWeight = 'lighter';
                if(message.data.isRunning){
                    status.textContent = 'online';
                    status.style.color = '#00BFA5';
                } else {
                    status.textContent = 'offline';
                    status.style.color = '#E33042';
                }
                
            }
        }
    });

    function loadButtons(){
        if(middleDiv){
            if(hostingDash && isLoggedIn){
                middleDiv.innerHTML = `
                <div class="buttons" style="align-items: center;">
                    <div style="display: flex; gap: 10px;">
                        ${buttonComponent('start', 150, 43, 16, 'startButtonHosting', "#F0B90B", '')}
                        ${buttonComponent('stop', 150, 43, 16, 'stopButtonHosting', "#E33042", '')}\
                    </div>
                     ${buttonComponent('deploy', 150, 43, 16, 'deploy', "#F0B90B", '')}
                </div>
                `;

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
                middleDiv.innerHTML = ` <div class="buttons">
                    ${buttonComponent('start', 150, 43, 16, 'startButtonLocal', "#F0B90B", '')}
                    ${buttonComponent('stop', 150, 43, 16, 'stopButtonLocal', "#E33042", '')}</div>`;


                    document.querySelector("#startButtonLocal")?.addEventListener('click', () => {
                        vscode.postMessage({ command: 'startButtonLocal' });
                    });

                    document.querySelector("#stopButtonLocal")?.addEventListener('click', () => {
                        vscode.postMessage({ command: 'stopButtonLocal' });
                    });
            }
        }
    }

    loadButtons()
    if(switchHosting){
        switchHosting.onclick = () => {
            
            if(hostingDash){
                
                switchHosting.textContent = 'Local';
                hostingDash = false;

                vscode.postMessage({command: 'localRoboData'});

                if(memory && cpu){
                    vscode.postMessage({command: 'localRes'});
                    memory.textContent = 'Loading...'
                    cpu.textContent = 'Loading...'
                }
                loadButtons();
            } else {
                switchHosting.textContent = 'RoboPlay';
                hostingDash = true;
                
                if(isLoggedIn){
                    vscode.postMessage({command: 'hostingInfos'});

                    if(memory && cpu){
                        memory.textContent = 'Unavailable for the moment...'
                        cpu.textContent = 'Unavailable for the moment...'
                    }
                    loadButtons();
                    return;
                }

                if(middleDiv){
                    middleDiv.innerHTML = `<p>To be able to use the RoboPlay panel you need to be logged in</p>
                        ${buttonComponent('Login', 150, 43, 16, 'loginButton', "#F0B90B", '')}
                    `
                    const login: HTMLButtonElement | null = document.querySelector("#loginButton");

                    if(login){
                        login.onclick = () => {
                            middleDiv.innerHTML = 'Preparing view for login... please wait'
                            vscode.postMessage({command: 'login'})
                        }
                    }

                }
            }
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


    function slideContent(element1: HTMLElement, element2: HTMLElement, direction: string){
        if(direction === 'right'){
            element2.animate([
                {transform: "translateX(0)"}
            ],
            {
                fill: 'forwards',
                easing: 'ease-in',
                duration: 500,
            })
            element1.animate([
                {transform: "translateX(100vw)"}
            ],
            {
                fill: 'forwards',
                easing: 'ease-out',
                duration: 500,
            })
        } else {
            element1.animate([
                {transform: "translateX(-100vw)"}
            ],
            {
                fill: 'forwards',
                easing: 'ease-out',
    
                duration: 500,
            })
    
            element2.animate([
                {transform: "translateX(0)"}
            ],
            {
                fill: 'forwards',
                easing: 'ease-in',
                duration: 500,
            })
        }
        
    }

});
