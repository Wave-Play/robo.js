import  { Terminal }  from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

document.addEventListener('DOMContentLoaded', () => {
    const terminalDv: HTMLElement | null = document.querySelector("#terminal");
    
    if(terminalDv){
        const terminal = new Terminal({convertEol: true});
        const fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.open(terminalDv);
        fitAddon.fit();

        window.addEventListener('message', (event: any) => {
            const message = event.data;
            if(message.command === "output"){
                terminal.write(message.text);
            }
        });
    }
});