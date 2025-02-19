export default function deploymentView(embed: string){
	return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>WavePlay Login</title>

	  <style>

	  html, body {
		width: 100%;
		height: 100%;
		margin: 0;
		padding: 0;
	  }

	  iframe {

		width: 100%;
		height: 100%;
		border: none;
	  }
	  </style>
    </head>
    <body>
	<iframe src="${embed}"></iframe>
    </body>
    </html>`;
}