async function getDependencyReleaseLine() {
	return "";
}

async function getReleaseLine(changeset, _type, options) {
	const [firstLine, ...futureLines] = changeset.summary
		.split("\n")
		.map((l) => l.trimRight());

	let returnVal = `- ${firstLine}`;

	if (futureLines.length > 0) {
		returnVal += `\n${futureLines.map((l) => `  ${l}`).join("\n")}`;
	}

	return returnVal;
}

module.exports = {
	getReleaseLine,
	getDependencyReleaseLine,
};
