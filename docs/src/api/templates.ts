const cheerio = require('cheerio')

module.exports = async () => {
	const res = await fetch('https://robojs.dev/templates/overview')

	if (res.ok) {
		const templates = []
		const templatesIds = [
			'discord-activities',
			'starters',
			'miscellaneous',
			'multiplayer',
			'community-templates',
			'discord-apps',
			'web-apps'
		]
		const text = await res.text()
		const $ = cheerio.load(text)
		let templateIndex = 0
		templatesIds.forEach((template) => {
			const element = $('#' + template)
			const categoryTitle = element.text()
			const obj = {
				categoryTitle,
				subCategory: []
			}
			let subCat = {
				name: '',
				templates: []
			}
			let anchor = element.next()

			while (anchor) {
				if (anchor.is('h2') || anchor.is('br')) {
					obj.subCategory.push(subCat)
					break
				}
				if (anchor.hasClass('cardContainer')) {
					anchor.children().each((i, card) => {
						const title = card.firstChild.firstChild.children[0].data
						const desc = card.firstChild.lastChild.children[0].data
						const link = card.attribs.href.slice(19)
						subCat.templates.push({
							title,
							desc,
							link,
							idx: templateIndex++
						})
					})
				}
				if (anchor.is('h3')) {
					if (subCat.name !== '') {
						obj.subCategory.push(subCat)
					}
					subCat = {
						name: anchor.text(),
						templates: []
					}
				}
				anchor = anchor.next()
			}

			templates.push(obj)
		})

		return templates
	}
}
