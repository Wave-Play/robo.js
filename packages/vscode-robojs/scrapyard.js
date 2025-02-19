const deployStr = ` Deployment Progress:
       - Preparing: ✔ Done        
       - Building: ✔ Done        
       - Deploying: ▘ In Progress        

       Track live status:
       https://roboplay.dev/app/deploy/cm79au0cj008wfmxitvju7bhb

       Press Enter to open status page.`;





function extractDeployLink(str){
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
    
console.log(extractDeployLink(deployStr).trimEnd().trimStart())

const data = {
    id: '23234',
    kind: 'app',
    name: '',
    pckgManager: 'npm',
    selectedFeatures: ['ts', 'react', 'prettier', 'eslint', 'extensionless'],
    selectedPlugins: ['server', 'patch'],
    token: '234324'
}

const isTypescript = data.selectedFeatures.includes('ts');
const plugins = data.selectedPlugins.join(' ');
const features = data.selectedFeatures.filter((feature) => feature !== 'ts').join(',');
console.log(features)
console.log(isTypescript)

const args = []


args.push('create-robo');
				args.push(data.name);
				args.push('-k');
				args.push(data.kind);
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
				if(['bot', 'app'].includes(data.kind)){
					args.push('--env');
					args.push(`"DISCORD_ID=${data.id},DISCORD_TOKEN=${data.token}"`);
				}
				args.push('-nc');
				

				console.log(args.join(' '))



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


