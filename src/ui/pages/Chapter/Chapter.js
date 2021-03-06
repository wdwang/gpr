import './Chapter.css'

import React, { Component } from 'react'
import { connect } from 'react-redux'
import { redirect } from 'redux-first-router'
import Link from 'redux-first-router-link'
import ReactCSSTransitionGroup from 'react-addons-css-transition-group'
import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider'
import { Tabs, Tab } from 'material-ui/Tabs'
import SwipeableViews from 'react-swipeable-views'

import Spinner from '../../components/Spinner/Spinner.js'
import chapters from '../chapters'
import { deepClone, bound } from '../../../logic/util.js'

class Chapter extends Component {
	constructor() {
		super()
		this.state = {
			status: [], // An array with loading statuses for each section in the chapter. Elements can be 'loading', 'failed' or 'loaded'.
		}
		this.adjustSection = this.adjustSection.bind(this)
		this.handleScroll = this.handleScroll.bind(this)
	}
	componentDidMount() {
		this.checkForURLUpdate()
		this.loadSections()

		window.addEventListener('scroll', this.handleScroll)
	}
	componentWillUnmount() {
		window.removeEventListener('scroll', this.handleScroll)
	}
	componentDidUpdate(prevProps) {
		// If there is a section change in the URL, deal with it accordingly.
		this.checkForURLUpdate()
		if (prevProps.chapter !== this.props.chapter)
			this.loadSections()
		else if (prevProps.section !== this.props.section)
			this.adjustScrollToIndex(this.props.section - 1)

		// Make sure that the height of the container always stays up to date. If suddenly Figure Guides need to be shown, then the container height should also adjust. (To test: turn Figure Guides on, and refresh a page with a lot of Figure Guides. Check if the page still has the correct height.)
		if (prevProps.settings !== this.props.settings)
			setTimeout(() => this.swipeableActions.updateHeight(), 0) // Delay this, to ensure it takes place after the rendering of the new components has finished.
	}

	checkForURLUpdate() {
		// If the props say we should update the URL, then we do so. This is the case when the URL does not contain a section or the wrong section, and we want to put the currently active section in the URL.
		if (!this.props.updateURL)
			return
		this.props.adjustChapterURL({
			chapter: this.props.chapter,
			section: this.props.section,
		})
	}
	loadSections() {
		// Load the sections using dynamic imports. First, check if we have a valid chapter.
		const chapter = chapters[this.props.chapter]
		if (!chapter || !chapter.sections)
			return

		// Initialize relevant arrays and start the loading through the imports.
		this.sections = new Array(chapter.sections.length).fill(undefined)
		this.scrollAmount = new Array(this.sections.length).fill(0)
		this.setState({ status: new Array(chapter.sections.length).fill('loading') })
		this.sections.forEach((_, ind) => {
			const section = ind + 1
			import(`../chapters/${chapter.name}/${section}`)
				.then((module) => {
					// Verify if this is the current chapter. Ignore it if the chapter has already changed.
					if (this.props.chapter !== chapter.name)
						return

					// Store the section and note that it's loaded.
					this.sections[ind] = module.default
					const newStatus = deepClone(this.state.status)
					newStatus[ind] = 'loaded'
					this.setState({ status: newStatus })
				})
				.catch((err) => {
					// Verify if this is the current chapter. Ignore it if the chapter has already changed.
					if (this.props.chapter !== chapter.name)
						return

					// Log the error.
					console.error(`An error occurred while loading the page "${chapter.title}" (section ${section}). Please try refreshing the page. If that does not work, contact us.`)
					console.error(`Error details: ${err.message}`)

					// Note the failure in the Chapter state.
					const newStatus = deepClone(this.state.status)
					newStatus[ind] = 'failed'
					this.setState({ status: newStatus })
				})
		})
	}

	adjustSection(index) {
		// Go to the section corresponding to the given index. (Section numbers start counting at 1. The index starts counting at 0.)
		const section = index + 1
		if (section === this.props.section)
			return
		this.props.goToChapterSection({
			chapter: this.props.chapter,
			section,
		})
	}

	// handleScroll is called upon a page scroll and keeps track of where we are on the page. This is useful when transitioning between sections.
	handleScroll(event) {
		const doc = document.documentElement
		const scrollY = (window.pageYOffset || doc.scrollTop) - (doc.clientTop || 0) // This method is cross-browser compatible.
		if (scrollY !== this.ignoreScroll) // Only process the scroll if it's an input from the user, and not a result of our own call to scroll (which we registered in the ignoreScroll parameter).
			this.scrollAmount[this.props.section-1] = scrollY
	}

	// adjustScrollToIndex is called when going from one page (tab) to another. We want to go to the previous place which the reader was on that page, scroll-wise. So we linearly transition to it.
	adjustScrollToIndex(index) {
		const from = this.props.section - 1 // The index of the page we slide from.
		const to = Math.floor(index) === from ? Math.ceil(index) : Math.floor(index) // The index of the page we slide to.
		const diff = from === to ? 0 : Math.abs((index - from)/(to - from)) // The amount we've slid towards our target.
		const scrollY = Math.round(this.scrollAmount[from]*(1 - diff) + this.scrollAmount[to]*diff) // The desired scroll position in Y-direction.
		this.ignoreScroll = scrollY // We remember that we manually scroll to this amount, so we can ignore it in the event handler.
		const doc = document.documentElement
		const scrollX = (window.pageYOffset || doc.scrollTop) - (doc.clientTop || 0) // The current scroll position, in a cross-browser compatible way. We need this so as not to change the x-coordinate of the scrolling.
		window.scrollTo(scrollX, scrollY)
	}

	render() {
		// Sets up the page and wraps it in a transition group that provides transition animations when switching between different chapters (for instance through direct links).
		return (
			<MuiThemeProvider>
				<ReactCSSTransitionGroup
					component="div"
					className="chapterFader"
					transitionName="chapterFade"
					transitionAppear={true}
					transitionAppearTimeout={200}
					transitionEnterTimeout={200}
					transitionLeaveTimeout={200}
				>
					<div key={this.props.chapter} className="chapterContainer">
						{this.getPage()}
					</div>
				</ReactCSSTransitionGroup>
			</MuiThemeProvider>
		)
	}
	getPage() {
		// Extract and verify the chapter.
		const chapter = chapters[this.props.chapter]
		if (!chapter)
			return this.renderUnknownChapter()
		if (!chapter.sections)
			return this.renderChapterStub()

		// Render the tabs, with each respective section.
		const tabs = (
			<Tabs key="tabs" className="tabs" value={this.props.section - 1} onChange={this.adjustSection}>
				{chapter.sections.map((sectionTitle, ind) => {
					const titleWithEnters = sectionTitle.split('\n').map((item, key) => <span key={key}>{item}<br /></span>)
					const label = (
						<div>
							<span className="title">{titleWithEnters}</span>
							<span className="sectioning">Section {ind + 1}</span>
							<span className="number">{ind + 1}</span>
						</div>
					)
					return <Tab className="tab" key={ind} label={label} value={ind} />
				})}
			</Tabs>
		)

		// Render the sections, each depending on whether it's been loaded already or not.
		const sections = (
			<div key="sections" className="sections">
				<SwipeableViews
					className="swiper"
					index={this.props.section - 1}
					onChangeIndex={this.adjustSection}
					onSwitching={this.adjustScrollToIndex.bind(this)}
					animateHeight={true} // Make sure that different sections have different lengths. If set to false, a short section will have a huge empty space if it's in the same chapter as a long section.
					action={actions => { this.swipeableActions = actions }} // Get a handle to the swipeable actions.
				>
					{chapter.sections.map((_, ind) => {
						const status = this.state.status[ind]
						switch (status) {
							case 'loading':
								return this.renderLoadingSection(ind)
							case 'failed':
								return this.renderFailedSection(ind)
							case 'loaded':
								return this.renderLoadedSection(ind)
							default:
								return this.renderLoadingSection(ind) // When the status array has not been updated yet.
						}
					})}
				</SwipeableViews>
			</div>
		)

		return [tabs, sections]
	}
	renderUnknownChapter() {
		return (
			<div className="chapterStub">
				<p>Oops ... the URL you gave does not point to a valid chapter. Try the <Link to={{ type: 'TREE' }}>Contents Tree</Link> to find what you're looking for.</p>
			</div>
		)
	}
	renderChapterStub() {
		const chapter = chapters[this.props.chapter]
		return (
			<div className="chapterStub">
				<p>The chapter <strong>{chapter.title}</strong> is still being written. Check back later for further updates. Until then, head back to the <Link to={{ type: 'TREE' }}>Contents Tree</Link>.</p>
			</div>
		)
	}
	renderLoadingSection(ind) {
		return (
			<div key={ind} className="loading">
				<Spinner />
			</div>
		)
	}
	renderFailedSection(ind) {
		return (
			<div className="chapterStub" key={ind}>
				<p>Oops ... I could not load the relevant section for you. Maybe there's a problem with your internet connection? If not, the problem could also be on my side. Check back later, or drop me a note if the problem persists.</p>
			</div>
		)
	}
	renderLoadedSection(ind) {
		const Section = this.sections[ind]
		return (
			<div key={ind} className="section">
				<Section index={ind} />
				{this.renderNextSectionLink(ind)}
			</div>
		)
	}
	renderNextSectionLink(ind) {
		const chapter = chapters[this.props.chapter]
		const section = ind + 1
		let message
		if (section === chapter.sections.length) {
			message = <p>Congrats! You made it through the full chapter. Head back to the <Link to={{ type: 'TREE' }}>Contents Tree</Link>.</p>
		} else {
			const newSection = section + 1
			message = <p>Continue reading the next section, <Link to={{ type: 'CHAPTER', payload: { chapter: this.props.chapter, section: newSection } }}>{chapter.sections[newSection - 1]}</Link></p>
		}

		return (
			<footer>
				<hr />
				{message}
			</footer>
		)
	}
}

const stateMap = (state) => {
	// Determine which payload contains chapter information. When fading out the page, we can use the previous payload.
	let payload = {}
	if (state.location.payload.chapter)
		payload = state.location.payload
	else if (state.location.prev.payload && state.location.prev.payload.chapter)
		payload = state.location.prev.payload

	// TODO IN FUTURE: Use local storage to keep track of what the last section was that the user visited. Apply that here.
	const chapter = chapters[payload.chapter]
	let section
	if (chapter && chapter.sections)
		section = bound(payload.section || 1, 1, chapter.sections.length)
	return {
		chapter: payload.chapter,
		section: section, // Assume default section 1 if no section is given.
		updateURL: chapter && payload.section !== section, // Should the section be updated?
		settings: state.settings, // We want the settings as well. If the settings change, we may need to update the height of the swipeable containers.
	}
}
const actionMap = (dispatch) => ({
	goToChapterSection: (payload) => dispatch({
		type: 'CHAPTER',
		payload,
	}),
	adjustChapterURL: (payload) => dispatch(redirect({
		type: 'CHAPTER',
		payload,
	})),
})
export default connect(stateMap, actionMap)(Chapter)