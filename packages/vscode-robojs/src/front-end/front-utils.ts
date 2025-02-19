export function buttonComponent(text: string, width: number = 219, height: number = 43, slope: number = 16, id: string, fill: string, stroke: string) {
    return `

	 <button class="svg_text" id=${id} style="height: ${height}px; width: ${width}px; border: none;">
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
		  fill="${fill}"   
        />


      </svg
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
		  stroke="${stroke}"
          stroke-width="1"
        />


      </svg>
      <span>${text}</span>
	 </button>
      `
    ;
}

export function informationComponent(text: string, width: number, height: number) {
    return `
        <div class="svg_text" style="height: ${height}px;">
            <svg
            width="${width}"
            height="${height}"
            viewBox="0 0 ${width} ${height}"
            fill="none"
        >
        
        <path
            d="
            M 0 ${height / 2} 
            L ${width / 2 } ${0}"
            
            M ${width} ${height / 2} 
            L ${width / 2} ${0}"
            
            stroke="#F0B90B"
            stroke-width="2"
            fill="#F0B90B"
            />
            
            <path
            d="
            M ${width} ${height / 2} 
            L ${width / 2} ${0}"
            
            stroke="#F0B90B"
            stroke-width="2"
            fill="#F0B90B"
            />
            
            
        <path d="
                M 0 ${height / 2} 
                L ${width / 2} ${height}"
            stroke="#F0B90B"
            stroke-width="2"
            fill="#F0B90B"
            />
            
            <path d="
                M ${width} ${height / 2} 
                L ${width / 2} ${height}"
            stroke="#F0B90B"
            stroke-width="2"
            fill="#F0B90B"
            />
        
        <span>${text}</span>
        </svg>
      </div>`
    ;
}

export const boxSvgTop = (width: number, height: number, slope: number, degree: number = 0) => {
    return `

    <div class="svg_container" style="width: ${width}px; height: ${height}px">
            <svg

                width="${width}"
                height="${height}"
                viewBox="0 0 ${width} ${height}"
                style="height: ${height}px; width: ${width}px; position: absolute;"
                fill="none"
            >
                <path
                    d="
                    M 0 ${height}
                    L ${width / slope} 0
                    
                    h ${width - width / slope * 2} 0
                    
                    L ${width} ${height}
                    L ${width - width / slope} 0
                    "
                stroke="#00BFA5"
                stroke-width="4"
                transform="rotate(${degree}, ${width / 2}, ${height / 2})"
                />
            </svg>
            <section id="top" style="padding: 10px; width: calc(${width}px - ${(width / slope) * 2}px); margin: auto;">
                <span class="prefix">Command Count: <span class="commandCount">loading..</span></span>
                <span class="prefix">Status: <span class="status">loading..</span></span>
            </section>
        </div>
    `;

};

export const boxSvgBottom = (width: number, height: number, slope: number, degree: number = 0) => {
return `

<div class="svg_container" style="width: ${width}px; height: ${height}px; display: flex; justify-content: end;">
        <svg

            width="${width}"
            height="${height}"
            viewBox="0 0 ${width} ${height}"
            style="height: ${height}px; width: ${width}px; position: absolute;"
            fill="none"
        >
            <path
                d="
                M 0 ${height}
                L ${width / slope} 0
                
                h ${width - width / slope * 2} 0
                
                L ${width} ${height}
                L ${width - width / slope} 0
                "
            stroke="#00BFA5"
            stroke-width="4"
            transform="rotate(${degree}, ${width / 2}, ${height / 2})"
            />
        </svg>
        <section id="top" style="padding: 10px; width: calc(${width}px - ${(width / slope) * 2}px); margin: auto; margin-bottom: 0;">
        </section>
    </div>
`;

};

export function exaButton(text: string, width: number, height: number, slope: number, id: string, stroke: string, fill: string){
	
    return `
    <button class="svg_text" id=${id} style="height: ${height}px; width: ${width}px;">
        <svg
                    width="${width}"
                    height="${height}"
                    viewBox="0 0 ${width} ${height}"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                >


            <path
                    d="
                        M 0 ${height / 4} 
                        L ${width / slope} ${0}
                        h ${width} 0
                        
                        L ${width} 0 
                        L ${width} ${height - height / 4}
                        
                        L ${width} ${height - height / 4}
                        L ${width - width / slope} ${height}
                        
                        L 0 ${height}
                        H ${width - width / slope} ${height}
                        
                        L 0 ${height}
                        L 0 ${height / 4}
                    "
                    
                    fill="${fill}"
                    />

                    <path
                    d="
                        M 0 ${height / 4} 
                        L ${width / slope} ${0}
                        h ${width} 0
                        
                        L ${width} 0 
                        L ${width} ${height - height / 4}
                        
                        L ${width} ${height - height / 4}
                        L ${width - width / slope} ${height}
                        
                        L 0 ${height}
                        H ${width - width / slope} ${height}
                        
                        L 0 ${height}
                        L 0 ${height / 4}
                    "

                    stroke="${stroke}"
                    stroke-width="4"
                    />


            </svg>
            <span>${text}</span>
            </button>
        `;
}


