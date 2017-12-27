import Home from './Home/Home.js'
import Tree from './Tree/Tree.js'
import Settings from './Settings/Settings.js'
import About from './About/About.js'
import Chapter from './Chapter/Chapter.js'
import NotFound from './NotFound/NotFound.js'

import chapters from './chapters'

const pages = {
	HOME: {
		component: Home,
		title: 'Gaussian Process Regression',
		skipPrefix: true, // Do not use a prefix in the <title>.
	},
	TREE: {
		component: Tree,
		title: 'Content Tree',
	},
	SETTINGS: {
		component: Settings,
		title: 'Settings',
	},
	ABOUT: {
		component: About,
		title: 'About this tutorial',
	},
	CHAPTER: {
		component: Chapter,
		title: (payload) => `${(chapters[payload.chapter] || { title: 'Unknown chapter'}).title}, section ${payload.section}`,
	},
	NOTFOUND: {
		component: NotFound,
		title: 'Oops ...',
	},
}
for (let name in pages) {
	pages[name].name = name
}
export default pages

export function getTitle(page, payload) {
	if (typeof(page.title) === 'function')
		return page.title(payload)
	return page.title
}