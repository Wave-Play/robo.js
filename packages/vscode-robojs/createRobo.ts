type steps = 'experience' | 'features' | 'plugins' | 'tokens' | 'creation' | 'done';
type appKinds = 'web' | 'app' | 'bot' | 'plugin';
type packageManagers = 'bun' | 'npm' | "pnpm" | "yarn";

interface step {
    step: steps,
    f: (arg: RoboOjb, arg2: {next: HTMLButtonElement, prev: HTMLButtonElement}) => unknown;
    title: string,
}


interface RoboOjb {
    selectedFeatures: string[],
    selectedPlugins: string[],
    projectName: string
    appKind: appKinds
    packageManager: packageManagers
}

class createRobo {
    private stepCounter = 1;
    private _steps: step[];

    private robObject: RoboOjb = {
        selectedFeatures: [],
        selectedPlugins: [],
        projectName: '',
        appKind: '',
        packageManager: ''
    }
    private selectedFolder: boolean = false;


    // html elements
    private nextButton: HTMLButtonElement;
    private previousButton: HTMLButtonElement;;

    constructor(steps: step[]){
        this._steps = steps;

        const nextButton: HTMLButtonElement | null = document.querySelector('#nextButton')
        const previousButton: HTMLButtonElement | null = document.querySelector('#previousButton')

        if(!nextButton || !previousButton) throw new Error('next button not found');

        this.nextButton = nextButton
        this.previousButton = previousButton;
    }

    private next(){
        this.stepCounter++;
        this.step()
    }

    private prev(){
        this.stepCounter--;
        this.step()
    }

    private step(){
        if(this.stepCounter <= 0){
            const localStep =  this._steps[0];
            localStep.f(this.robObject, {next: this.nextButton, prev: this.previousButton});
            return this;
        }

        if(this.stepCounter >= this._steps.length){
            this.stepCounter = this._steps.length;
            const localStep =  this._steps[this.stepCounter];
            localStep.f(this.robObject, {next: this.nextButton, prev: this.previousButton});
            return this;
        }

        const localStep =  this._steps[this.stepCounter];
        localStep.f(this.robObject, {next: this.nextButton, prev: this.previousButton});

        return this;
    }

}

// make sure to be able to pass the variables to every step
// add field `title` to the step object.

new createRobo([
    {
        step: 'experience', 
        title: "Select your adventure !",
        f: (roboObj, buttons) => {
             const contentDiv = document.querySelector('#content');
             const pckManagerValue = ['npm', 'pnpm', 'yarn', 'bun'];
             const appKindValue = ['bot', 'app', 'web', 'plugin'];

             let selectedFolder: boolean = false;

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
            
                    buttons.next.onclick = () => {
                        
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

                            roboObj.appKind = appkindSelect.value as appKinds;
                            roboObj.packageManager = pckgManagerSelect.value as packageManagers;
                            roboObj.projectName = nameInput.value ;
                        }
                    };
                }
        }
    },
    {
        step: 'features', 
        title: "Select your features !",
        f: () => {}
    },
    {
        step: 'plugins', 
        title: "Select your plugins !",
        f: () => {}
    },
    {
        step: 'tokens', 
        title: "Enter your tokens !",
        f: () => {}
    },
    {
        step: 'creation', 
        title: "Creating your application !",
        f: () => {}
    },
    {
        step: 'done', 
        title: "Alrighty we are all done !",
        f: () => {}
    }]);