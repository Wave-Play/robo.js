import { Terminal } from '@xterm/xterm';

type appKinds = 'web' | 'app' | 'bot' | 'plugin' | null ;
type packageManagers = 'bun' | 'npm' | "pnpm" | "yarn" |  null ;
 

interface Skills {
    short: string,
    long: string,
    value: string,
    default: {
        "web": boolean,
        "app": boolean,
        "bot": boolean,
        'plugin': boolean,
    }
    required: {
        "web": boolean,
        "app": boolean,
        "bot": boolean,
        'plugin': boolean,
    }
    fits: Array<appKinds>;
}

const features: Array<Skills> = [{
    short: 'ts',
    value: 'ts',
    long: 'Typescript',
    default: {
        "web": true,
        "app": true,
        "bot": true,
        "plugin": true,
     },
    required: {
       "web": false,
        "app": false,
        "bot": false,
        "plugin": false,
    },
    fits: ['web', 'app', 'bot', 'plugin']
},
{
    value: 'react',
    short: 'react',
    long: 'React',
    default: {
        "web": true,
        "app": true,
        "bot": false,
        "plugin": false,
     },
    required: {
        "web": false,
         "app": false,
         "bot": false,
         "plugin": false,
     },
    fits: ['web', 'app']
},
{
    value: 'prettier',
    short: 'prettier',
    long: 'Prettier',
    default: {
        "web": true,
        "app": true,
        "bot": true,
        "plugin": true,
     },
    required: {
        "web": false,
         "app": false,
         "bot": false,
         "plugin": false
     },
    fits: ['web', 'app', 'bot', 'plugin']
},
{
    value: 'eslint',
    short: 'eslint',
    long: 'ESlint',
    default: {
        "web": true,
        "app": true,
        "bot": true,
        plugin: true,
     },
    required: {
        "web": false,
         "app": false,
         "bot": false,
         plugin: false,
     },
    fits: ['web', 'app', 'bot', 'plugin']
},
{
    value: 'extensionless',
    short: 'extensionless',
    long: 'Extensionless',
    default: {
        "web": true,
        "app": true,
        "bot": true,
        plugin: true,
     },
    required: {
        "web": false,
         "app": false,
         "bot": false,
         plugin: false,
     },
    fits: ['web', 'app', 'bot', 'plugin']
}];

const plugins: Array<Skills>  = [
    {
        short: 'server',
        value: 'server',
        long: 'Web server',
        default: {
            "web": true,
            "app": true,
            "bot": true,
            plugin: true,
         },
        required: {
            "web": false,
            "app": true,
            "bot": false,
            plugin: false,
         },
        fits: ['web', 'app', 'bot', 'plugin']
    },
    {
        value: 'patch',
        short: 'patch',
        long: 'Patch',
        default: {
            "web": false,
            "app": true,
            "bot": false,
            plugin: false,
         },
        required: {
            "web": false,
            "app": true,
            "bot": false,
            plugin: false,
         },
        fits: ['app']
    },
    {
        short: 'ai',
        value: 'ai',
        long: 'AI',
        default: {
            "web": false,
            "app": false,
            "bot": false,
            "plugin": false,
         },
        required: {
            "web": false,
            "app": false,
            "bot": false,
            plugin: false,
         },
        fits: ['web', 'bot', 'app', "plugin"]
    },
    {
        short: 'Analytics',
        long: 'Analytics',
        value: 'analytics',
        default: {
            "web": false,
            "app": false,
            "bot": false,
            plugin: false,
         },
        required: {
            "web": false,
            "app": false,
            "bot": false,
            plugin: false,
         },
        fits: ['web', 'bot', 'app', 'plugin']
    },
    {
        short: 'Moderation',
        value: 'modtools',
        long: 'Moderation',
        default: {
            "web": false,
            "app": false,
            "bot": false,
            plugin: false,
         },
        required: {
            "web": false,
            "app": false,
            "bot": false,
            plugin: false
         },
        fits: ['bot', 'app', 'plugin']
    },
];

let selectedFeatures: string[] = [];
let selectedPlugins: string[]  = [];


type steps = 'experience' | 'features' | 'plugins' | 'tokens' | 'creation' | 'done';
const appKindValue = ['bot', 'app', 'web', 'plugin'];
const pckManagerValue = ['npm', 'pnpm', 'yarn', 'bun'];
let step: steps = 'experience';
const appKind: appKinds = null;
let pckgManager: packageManagers = null;
let selectedFolder: boolean = false;
let projectName: string = '';

function applicationTypeComponent(next: HTMLButtonElement, appKind: appKinds){
    const contentDiv = document.querySelector('#content');

    updateSteps();
    if(contentDiv){
        const html = `
            <span class="appkinderror error"></span>
            <select name="projects" id="appkind_select" class="select application_select">
                <option value="none">Select an Experience</option>
                <option value="bot">Discord Bot</option>
                <option value="app">Discord Activity</option>
                <option value="web">Web Templates</option>
                <option value="plugin">Robo Plugin</option>
            </select>
            <span class="pckgerror error"></span>
            <select name="pckgManagers" id="pckgmanager_select" class="select application_select">
                <option value="none">Select a package manager</option>
                <option value="bun">Bun</option>
                <option value="npm">Npm</option>
                <option value="pnpm">Pnpm</option>
                <option value="yarn">Yarn</option>
            </select>

            <div class="helpBubble">
                <input type="text" id="projectName" class='select' placeholder='Project name, ex: Optimus Prime'></input>
                <span id="helpBubble">${informationComponent('?', 25, 25)}</span>
            </div>
            <span class="foldererror error"></span>
            <button id="folder" class="select">Choose a folder</button>
            `;
        contentDiv.innerHTML = html;

        const help: HTMLSpanElement | null = document.querySelector('#helpBubble');

        if(help){
            help.onmouseover = () => {
                help.style.scale = '1.1';
                help.setAttribute('data-after-content', 'If no name is given, the project will be created as is in the selected directory.');
            };
            help.onmouseleave = () => {
                help.style.scale = '1';
                help.setAttribute('data-after-content', '');
            };
        }

        const buttonFolder: HTMLButtonElement| null = document.querySelector('#folder');
        if(buttonFolder){

             window.addEventListener("message", (event: MessageEvent) => {
                const message = event.data;
                if(message.command === 'noFolder') {
                    selectedFolder = false;
                    return;
                };
                if(message.command === 'folderFolded'){
                    selectedFolder = true;
                    buttonFolder.style.borderColor = "rgb(0, 191, 165)";
                }
             });


            buttonFolder.onclick = () => {
                vscode.postMessage({ command: 'selectFolder' });  
            };
        }

        const selects: NodeListOf<HTMLSelectElement> = document.querySelectorAll('.application_select');
        const pckgManagerSelect: HTMLSelectElement | null = document.querySelector('#pckgmanager_select');
        const appkindSelect: HTMLSelectElement | null = document.querySelector('#appkind_select');
        const nameInput: HTMLSelectElement | null = document.querySelector('#projectName');

        if(selects){
            selects.forEach((select) => {
                select.onchange = () => {
                    if(select.value === 'none') {return;};
                    select.style.borderColor = '#00BFA5';
                };
            });
            
        }

        next.onclick = () => {
            
            if(pckgManagerSelect && appkindSelect && nameInput){
                if(!selectedFolder){
                    const error: HTMLSpanElement | null = document.querySelector('.foldererror');
                    if(error){
                        error.textContent = 'Please select a correct folder.';
                    }
                }

                if(!pckManagerValue.includes(pckgManagerSelect.value)){
                    const error: HTMLSpanElement | null = document.querySelector('.pckgerror');
                    if(error){
                        error.textContent = 'Please select a package manager.';
                    }
                }
                if(!appKindValue.includes(appkindSelect.value)){
                    const error: HTMLSpanElement | null = document.querySelector('.appkinderror');
                    if(error){
                        error.textContent = 'Please select a kind of application.';
                    }
                }

                if(!pckManagerValue.includes(pckgManagerSelect.value) || !appKindValue.includes(appkindSelect.value) || !selectedFolder) {return;};

                
                step = 'features';
                appKind = appkindSelect.value as appKinds;
                pckgManager = pckgManagerSelect.value as packageManagers;
                projectName = nameInput.value ;
                featureComponent(next, appKind);
            }
        };
    }
    
}

function featureComponent(next: HTMLButtonElement, appKind: appKinds){
    const contentDiv = document.querySelector('#content');

    if(contentDiv){
        updateSteps(appKind);
        const html = `
                ${features.map((feature) => {
                    if(!feature.fits.includes(appKind)){
                        return;
                    }

                    if(!appKind) return;

                    return `
                        <div class='robo_upgrades'>
                            <input 
                                type="checkbox" 
                                class="feature_input"
                                id="${feature.value}" 
                                name="${feature.long}" 
                                ${feature.default[appKind] ? 'checked' : ''} 
                                ${feature.required[appKind] ? 'required' : ''}
                            >
                            <label for="${feature.long}">${feature.long}</label>
                        </div>`;
            }).join('')}`;


        contentDiv.innerHTML = html;
        const robo_upgrades: NodeListOf<HTMLInputElement> = document.querySelectorAll('.robo_upgrades');

        next.onclick = () => {
            step = 'plugins';
            pluginComponent(next, appKind);
        };



        if(robo_upgrades){
            const checkedElement = (upgrade: HTMLInputElement) => {
                const children = upgrade.firstElementChild as HTMLInputElement;
                if(children) {
                    if(children.required) {
                        children.style.backgroundColor = 'grey';
                        return;
                    }

                    if(children.checked){
                        selectedFeatures.push(children.id);
                        upgrade.style.borderColor = '#00BFA5';
                    } else {
                        selectedFeatures = selectedFeatures.filter((feature) => feature !== children.id);
                        upgrade.style.borderColor = '#424141';
                    }
                }
            };

            robo_upgrades.forEach((upgrade) => {

                checkedElement(upgrade);

                upgrade.onmouseover = () => {
                    upgrade.style.borderColor = '#F0B90B';   
                    upgrade.style.scale = '1.1';
                    upgrade.style.transition = 'all 500ms';
                };

                upgrade.onmouseleave = () => {
                    upgrade.style.scale = '1';
                    upgrade.style.borderColor = '#F0B90B';   
                    const children = upgrade.firstElementChild as HTMLInputElement;
                    if(children) {
                        if(children.checked){
                            upgrade.style.borderColor = '#00BFA5';
                        } else {
                            upgrade.style.borderColor = '#424141';
                        }
                    }
                };

                // if already checked and we click, uncheck.
                upgrade.onclick = () => {
                    const children = upgrade.firstElementChild as HTMLInputElement;
                    if(children){
                        if(children.required) {return;};

                        if(children.checked){
                            children.checked = false;
                        } else {
                            children.checked = true;
                        }
                    }
                    checkedElement(upgrade);
                };
            });
        }
    }
}

// TO DO: MAKE IT REGISTER THE PLUGINS / FEATURES SELECTED !
// TO DO: MAKE SURE THE REQUIRED ARE GREYED OUT.

function pluginComponent(next: HTMLButtonElement, appKind: appKinds){
    const contentDiv = document.querySelector('#content');

    if(contentDiv){
        updateSteps(appKind);

        const html = `
                ${plugins.map((plugin) => {
                    if(!plugin.fits.includes(appKind)){
                        return;
                    }

                    if(!appKind) return;

                    return `
                        <div class='robo_upgrades'>
                            <input 
                                type="checkbox" 
                                class="plugin_input"
                                id="${plugin.value}" 
                                name="${plugin.long}" 
                                ${plugin.default[appKind] ? 'checked' : ''} 
                                ${plugin.required[appKind] ? 'required' : ''}
                            >
                            <label for="${plugin.long}">${plugin.long}${plugin.required[appKind] ? '(required)' : ''}</label>
                        </div>`;
            }).join('')}`;


            // finish the plugin transition 
        contentDiv.innerHTML = html;
        const robo_upgrades: NodeListOf<HTMLInputElement> = document.querySelectorAll('.robo_upgrades');

         next.onclick = () => {
            if(appKind === 'plugin' || appKind === 'web') {
                const app = {
                    name: projectName,
                    kind: appKind,
                    pckgManager,
                    selectedFeatures,
                    selectedPlugins,
                };
                    consoleComponent(next);
                    step = 'creation';
                    vscode.postMessage({ command: 'createRoboApplication', data: app });        
                return;
            }
            step = 'tokens';
            tokensComponent(next, appKind);
        };

        if(robo_upgrades){
            const checkedElement = (upgrade: HTMLInputElement) => {
                const children = upgrade.firstElementChild as HTMLInputElement;
                if(children) {

                    if(children.required) {
                        children.style.backgroundColor = 'grey';
                        return;
                    }
                    if(children.checked){
                        selectedPlugins.push(children.id);
                        upgrade.style.borderColor = '#00BFA5';
                    } else {
                        selectedPlugins = selectedPlugins.filter((plugin) => plugin !== children.id);
                        upgrade.style.borderColor = '#424141';
                    }
                }
            };

            robo_upgrades.forEach((upgrade) => {

                checkedElement(upgrade);

                upgrade.onmouseover = () => {

                    // console.log(sounds);
                    // sounds[0].play();
                    upgrade.style.borderColor = '#F0B90B';   
                    upgrade.style.scale = '1.1';
                    upgrade.style.transition = 'all 500ms';
                };

                upgrade.onmouseleave = () => {
                    upgrade.style.scale = '1';
                    upgrade.style.borderColor = '#F0B90B';   
                    const children = upgrade.firstElementChild as HTMLInputElement;
                    if(children) {
                        if(children.checked){
                            upgrade.style.borderColor = '#00BFA5';
                        } else {
                            upgrade.style.borderColor = '#424141';
                        }
                    }
                };

                // if already checked and we click, uncheck.
                upgrade.onclick = () => {
                    const children = upgrade.firstElementChild as HTMLInputElement;
                    if(children){
                        if(children.required) {return;};
                        if(children.checked){
                            children.checked = false;
                        } else {
                            children.checked = true;
                        }
                    }
                    checkedElement(upgrade);
                };
            });
        }
    }
}

function tokensComponent(next: HTMLButtonElement, appKind: appKinds){
    const contentDiv = document.querySelector('#content');

    if(contentDiv){
        updateSteps(appKind);
            const html = `<div class='text_input_container'>
                        <input 
                            type="text" 
                            class="text_input"
                            id="discord_token" 
                            name="discord_token"
                            placeholder="Discord Token"
                        >
                    </div>
                    <div class='text_input_container'>
                        <input 
                            type="text" 
                            class="text_input"
                            id="discord_id" 
                            name="discord_id"
                            placeholder="Discord ID"
                        >
                    </div>`;
        contentDiv.innerHTML = html;




        next.onclick = () => {
            const token: HTMLInputElement | null = document.querySelector('#discord_token');
            const id: HTMLInputElement | null    = document.querySelector('#discord_id');

            if(id && token && id.value && token.value){
                  
                consoleComponent(next);
                step = 'creation';
                const app = {
                    name: projectName,
                    kind: appKind,
                    pckgManager,
                    selectedPlugins,
                    selectedFeatures,
                    token: token.value,
                    id: id.value,
                };
                vscode.postMessage({ command: 'createRoboApplication', data: app });  
            }
                
        };
    }

    
}

function updateSteps(appKind?: appKinds){
    const stepSpan: HTMLSpanElement | null = document.querySelector('#steps_no');
    const stepTitle: HTMLSpanElement | null = document.querySelector('#steps_title');
    const stepsContainer:  HTMLDivElement | null = document.querySelector(".steps");
    const button: HTMLDivElement | null = document.querySelector('#button_svg');
    if(stepSpan && stepTitle && stepsContainer && button){

        if(step === 'experience'){
            stepSpan.textContent = '';
            stepTitle.textContent = 'Select your Adventure Kind!';
            stepTitle.style.fontSize = "2em";
            stepTitle.style.fontWeight = "bold";
            stepsContainer.style.textAlign = 'center';
            button.innerHTML = buttonComponent('Next');
            return;
        }

        stepSpan.style.alignSelf = "end";
        stepSpan.style.fontWeight = "semi-bold";

        stepTitle.style.fontSize = "2em";
        stepTitle.style.fontWeight = "bold";
        stepsContainer.style.display = 'flex';
        stepsContainer.style.justifyContent = 'space-between';
        stepsContainer.style.textAlign = 'center';

        stepTitle.textContent = step;
        if(appKind){
            if(appKind === 'web'){
                if(step === 'features'){
                    stepSpan.textContent = '1 / 3';
                    button.innerHTML = buttonComponent('Next');
                }
                if(step === 'plugins'){
                    stepSpan.textContent = '2 / 3';
                    button.innerHTML = buttonComponent('Create Web App');
                }
                if(step === 'creation'){
                    stepSpan.textContent = '3 / 3';
                    button.innerHTML = '';
                }

                if(step === 'done'){
                    stepTitle.textContent = "Alrighty we're all done !";
                    stepSpan.textContent = '';
                    button.innerHTML = buttonComponent('Done');
                }
                return;
            }

            if(appKind === 'plugin'){
                if(step === 'features'){
                    stepSpan.textContent = '1 / 23';
                    button.innerHTML = buttonComponent('Next');
                }
                if(step === 'plugins'){
                    stepSpan.textContent = '2 / 3';
                    button.innerHTML = buttonComponent('Create Plugin');
                }
                if(step === 'creation'){
                    stepSpan.textContent = '3 / 3';
                    button.innerHTML = '';
                }
                
                if(step === 'done'){
                    stepTitle.textContent = "Alrighty we're all done !";
                    stepSpan.textContent = '';
                    button.innerHTML = buttonComponent('Done');
                }
                return;
            }
        }

        if(step === 'features'){
            stepSpan.textContent = '1 / 4';
            button.innerHTML = buttonComponent('Next');
        }
        if(step === 'plugins'){
            stepSpan.textContent = '2 / 4';
            button.innerHTML = buttonComponent('Next');
        }

        if(step === 'tokens'){
            stepSpan.textContent = '3 / 4';
            button.innerHTML = buttonComponent('Create Robo');
        }

        if(step === 'creation'){
            stepSpan.textContent = '4 / 4';
            stepTitle.textContent = 'Your project is being created !';
            button.innerHTML = '';
            return;
        }
    }
}

function buttonComponent(text: string, width: number = 219, height: number = 43, slope: number = 16) {
    return `
        <svg
        width="${width}"
        height="${height}"
        viewBox="0 0 ${width} ${height}"
        fill="none"
      >
      <path
          d="
          M 0 ${height / 2}
          L ${width / slope} 0
          h ${width - (width / slope) * 2}
          L ${width - (width / slope) * 2 + width / (slope / 2)} ${height / 2}

          M 0 ${height / 2}
          L ${width / slope} ${height}
          h ${width - (width / slope) * 2}
          L ${width - (width / slope) * 2 + width / (slope / 2)} ${height / 2}
          "
          fill="#F0B90B"
        />


      </sv
      <path
          d="
          M 0 ${height / 2}
          L ${width / slope} 0
          h ${width - (width / slope) * 2}
          L ${width - (width / slope) * 2 + width / (slope / 2)} ${height / 2}

          M 0 ${height / 2}
          L ${width / slope} ${height}
          h ${width - (width / slope) * 2}
          L ${width - (width / slope) * 2 + width / (slope / 2)} ${height / 2}
          "
          stroke="#F0B90B"
          stroke-width="1"
        />


      </svg>
      <span>${text}</span>
      `
    ;
}

function consoleComponent(next: HTMLButtonElement){
    const contentDiv: HTMLDListElement | null = document.querySelector('#content');
    const button: HTMLDivElement | null = document.querySelector('#button_svg');

    step = 'creation';
    updateSteps();
    if(contentDiv){
        contentDiv.innerHTML = '';
        contentDiv.style.backgroundColor = "#1B1E29";
        contentDiv.style.alignSelf =  "center";

        contentDiv.style.overflow = "scroll";


        const term =  new Terminal({
            convertEol: true,
            rightClickSelectsWord: true,
            fontFamily: 'monospace'
        });

        term.open(contentDiv);


        const handleExtensionMessages = (event: MessageEvent) => {
            const message = event.data;

            if(button) {
                button.innerHTML = '';
            }

            if(message.command === 'end'){
                step = 'done';
                contentDiv.innerHTML = `
                    Thanks for using Robo.js ! we hope you enjoy the experience.
                `;
                updateSteps();
                
                next.onclick = () => {
                    vscode.postMessage('closeCreationTab');
                };

                return;
            }

            if(message.command === 'output'){
                term.write(message.text);
            }
        };

        window.addEventListener("message", handleExtensionMessages);
    }
}

const stars: { x: number; y: number; speed: number; sizeX: number; sizeY: number; }[] = [];
let meteoriteCount = 0;

document.addEventListener('DOMContentLoaded', () => {

    const next: HTMLButtonElement | null = document.querySelector('#button_svg');
    
    // start of our application
    if(next){
        applicationTypeComponent(next, appKind);
    }

    // Get the full height and width of the content (body and html)
        // Resize the popup window to match the content size

    setTimeout(() => {
        const canvas: HTMLCanvasElement | null = document.querySelector('#stars');
        const wrapper: HTMLBodyElement | null = document.querySelector('body');

        if(!canvas) {return;};
        const ctx = canvas.getContext('2d');
        if(!ctx) {return;};
        const pixelRatio = window.devicePixelRatio || 1;

        if(!wrapper) {return;};
        const width = wrapper.clientWidth;
        const height = wrapper.clientHeight;

        canvas.width = width * pixelRatio;
        canvas.height = height * pixelRatio;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        ctx.scale(pixelRatio, pixelRatio);
        // draw rect
        for (let i = 0; i < 50; ++i) {
            const y = Math.floor(Math.random() * height) + 1;
            const x = Math.floor(Math.random() * width) + 1;
            const speed = Math.floor(Math.random() * 2) + 1;
            const sizeX = 2;
            const sizeY = 2;
            stars.push({
            x,
            y,
            speed,
            sizeX,
            sizeY,
            });
        }

        animate_stars();

        function star_shape(x: number, y: number, sizeX: number, sizeY: number, idx: number) {
            if(!ctx) {return;};
            ctx.fillStyle = 'white';
            const r = Math.floor(Math.random() * 50);

            if (sizeX >= 10) {
            draw_line(x, y);
            }

            if (r === 7 && meteoriteCount <= 3) {
            meteoriteCount++;
            ctx.fillRect(x, y, sizeX, sizeY);
            ctx.fillRect(x, y, sizeX, sizeY);
            stars[idx].sizeX = 10;
            stars[idx].sizeY = 10;
            } else {
            ctx.fillRect(x, y, sizeX, sizeY);
            }

            if(!canvas) {return;}

            if (x < canvas.width) {stars[idx].x += stars[idx].speed;}
            if (y < canvas.height) {stars[idx].y += stars[idx].speed;}

            if (x >= canvas.width || y >= canvas.height) {
            const y = Math.floor(Math.random() * height) + 1;
            const x = Math.floor(Math.random() * width) + 1;
            if (stars[idx].sizeX >= 10) {
                meteoriteCount--;
            }
            stars[idx].sizeX = 2;
            stars[idx].sizeY = 2;
            stars[idx].x = x;
            stars[idx].y = y;
            }
        }

        function draw_line(x1: number, x2: number) {
            if(!ctx) {return;};
            ctx.beginPath();

            // Move to the starting point of the line (x1, y1)
            ctx.moveTo(x1, x2);

            // Draw a line to the end point (x2, y2)
            ctx.lineTo(x1 - 10, x2 - 10);

            // Set the stroke color (optional)
            ctx.strokeStyle = 'white';

            // Set the line width (optional)
            ctx.lineWidth = 2;

            // Render the line
            ctx.stroke();
        }

        function animate_stars() {
            if(!ctx || !canvas) {return;}
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            stars.forEach((star, idx) => {
            star_shape(star.x, star.y, star.sizeX, star.sizeY, idx);
            });
            window.requestAnimationFrame(animate_stars);
        }
    }, 100);
});

/**
 * 
 * 
 * 
 * // if(createBot){
    //     createBot.onclick = () => {
    //         vscode.postMessage({ command: 'createRobo', data: [] });
    //     };
    // }
 */



// function ansi_to_html(output: string) {
//     let state = null;

//     const processedAnsi: {text: string, styles: string[]} = {
//         text: "",
//         styles: []
//     };
    
//     let idx = 0;


//     while (idx < output.length) {
//         if (state === "ansi") {
//             let loc = idx + 1;
//             let buf = "";
//             while (output[loc]) {
//                 if (output[loc] === "m") {
//                     if (output[loc + 1] === "\x1b") {
//                         processedAnsi.styles.push(buf);
//                         buf = "";
//                         loc += 3;
//                         continue;
//                     }

//                 processedAnsi.styles.push(buf);
//                 state = null;
//                 idx = loc + 1;
//                 buf = "";
//                 break;
//             }

//                 if (output[loc] === ";") {
//                     processedAnsi.styles.push(buf);
//                     continue;
//                 }

//                 buf += output[loc];
//                 loc++;
//             }
//         }

//         if(output[idx] !== "\x1b" && output.slice(idx, idx + 2) !== "\x1b["){
//             processedAnsi.text += output[idx];
//         }
        
//         if (
//         output[idx] === "\x1b" &&
//         output.slice(idx, idx + 2) === "\x1b[" || output[idx + 1] === undefined
//         ) {
//             state = "ansi";
//             createSpan(processedAnsi);
//             processedAnsi.text = "";
//             processedAnsi.styles = [];
//         }
//         idx++;
//     }
// }

// function createSpan(processedAnsi: {text: string, styles: string[]}) {
//     const contentDiv: HTMLDListElement | null = document.querySelector('#content');

//     const span: HTMLSpanElement | null = document.createElement("span");
//     if(span && contentDiv){


//         span.textContent = processedAnsi.text;
//         span.style.width = 'fit-content';
//         processedAnsi.styles.forEach((val) => {
//             switch (parseInt(val, 10)) {
//             case 22:
//                 span.style.fontWeight = "normal"; // Reset bold
//                 span.style.opacity = "1"; // Reset dim
//                 break;
//             case 30:
//                 span.style.color = "#000000"; // Black
//                 break;
//             case 31:
//                 span.style.color = "#cc0000"; // Red
//                 break;
//             case 32:
//                 span.style.color = "#4e9a06"; // Green
//                 break;
//             case 33:
//                 span.style.color = "#c4a000"; // Yellow
//                 break;
//             case 34:
//                 span.style.color = "#3465a4"; // Blue
//                 break;
//             case 35:
//                 span.style.color = "#75507b"; // Magenta
//                 break;
//             case 36:
//                 span.style.color = "#06989a"; // Cyan
//                 break;
//             case 37:
//                 span.style.color = "#d3d7cf"; // White
//                 break;
    
//                 // Bright Colors
//             case 90:
//                 span.style.color = "#555753"; // Bright Black
//                 break;
//             case 91:
//                 span.style.color = "#ef2929"; // Bright Red
//                 break;
//             case 92:
//                 span.style.color = "#8ae234"; // Bright Green
//                 break;
//             case 93:
//                 span.style.color = "#fce94f"; // Bright Yellow
//                 break;
//             case 94:
//                 span.style.color = "#729fcf"; // Bright Blue
//                 break;
//             case 95:
//                 span.style.color = "#ad7fa8"; // Bright Magenta
//                 break;
//             case 96:
//                 span.style.color = "#34e2e2"; // Bright Cyan
//                 break;
//             case 97:
//                 span.style.color = "#eeeeec"; // Bright White
//                 break;
    
//                 // Background Colors
//             case 40:
//                 span.style.backgroundColor = "#000000"; // Black
//                 break;
//             case 41:
//                 span.style.backgroundColor = "#cc0000"; // Red
//                 break;
//             case 42:
//                 span.style.backgroundColor = "#4e9a06"; // Green
//                 break;
//             case 43:
//                 span.style.backgroundColor = "#c4a000"; // Yellow
//                 break;
//             case 44:
//                 span.style.backgroundColor = "#3465a4"; // Blue
//                 break;
//             case 45:
//                 span.style.backgroundColor = "#75507b"; // Magenta
//                 break;
//             case 46:
//                 span.style.backgroundColor = "#06989a"; // Cyan
//                 break;
//             case 47:
//                 span.style.backgroundColor = "#d3d7cf"; // White
//                 break;
    
//             case 100:
//                 span.style.backgroundColor = "#555753"; // Bright Black
//                 break;
//             case 101:
//                 span.style.backgroundColor = "#ef2929"; // Bright Red
//                 break;
//             case 102:
//                 span.style.backgroundColor = "#8ae234"; // Bright Green
//                 break;
//             case 103:
//                 span.style.backgroundColor = "#fce94f"; // Bright Yellow
//                 break;
//             case 104:
//                 span.style.backgroundColor = "#729fcf"; // Bright Blue
//                 break;
//             case 105:
//                 span.style.backgroundColor = "#ad7fa8"; // Bright Magenta
//                 break;
//             case 106:
//                 span.style.backgroundColor = "#34e2e2"; // Bright Cyan
//                 break;
//             case 107:
//                 span.style.backgroundColor = "#eeeeec"; // Bright White
//                 break;
    
//                 // Styles
//             case 0:
//                 span.style.all = "unset"; // Reset all styles
//                 break;
//             case 1:
//                 span.style.fontWeight = "bold"; // Bold
//                 break;
//             case 2:
//                 span.style.opacity = "0.7"; // Dim
//                 break;
//             case 3:
//                 span.style.fontStyle = "italic"; // Italic
//                 break;
//             case 4:
//                 span.style.textDecoration = "underline"; // Underline
//                 break;
//             case 5:
//                 span.style.textDecoration = "blink"; // Blink (not widely supported)
//                 break;
//             case 7:
//                 span.style.filter = "invert(100%)"; // Inverse
//                 break;
//             case 9:
//                 span.style.textDecoration = "line-through"; // Strikethrough
//                 break;
    
//             default:
//                 break;
//             }
//         });

//         contentDiv.appendChild(span);
//     }

//     return span;
// }

