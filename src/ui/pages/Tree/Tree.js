import './Tree.css'

import React, { Component } from 'react'
import { connect } from 'react-redux'
import classnames from 'classnames'

import treeActions from '../../../redux/tree.js'
import { chapterArray, size, treeRect, getTreeLine } from '../chapters'
import { getWindowSize } from '../../../logic/util.js'

const minPadding = 12 // The minimum horizontal padding of the chapter titles.
const maxPadding = size.x / 4 // The maximum horizontal padding of the chapter titles.

class Tree extends Component {
	constructor() {
		super()

		// Bind this object to event handlers.
		this.startDragging = this.startDragging.bind(this)
		this.endDragging = this.endDragging.bind(this)
		this.checkSize = this.checkSize.bind(this)
		this.updateVisuals = this.updateVisuals.bind(this)
	}

	componentDidMount() {
		// Listen to user inputs.
		this.treeContainer.addEventListener('mousedown', this.startDragging)
		document.addEventListener('mouseup', this.endDragging)
		this.treeContainer.addEventListener('touchstart', this.props.startTouch)
		document.addEventListener('touchmove', this.props.updateTouch)
		document.addEventListener('touchend', this.props.endTouch)
		document.addEventListener('wheel', this.props.scroll)

		// Listen to screen resizes.
		this.checkSize()
		setTimeout(this.checkSize, 0) // We need to delay this checking of the size. The reason is that the page fades, and that if we call this right before the fade, we get wrong information. Suppose that we're fading from another page to this tree. When this is first called, the tree has entered the page, but the tree and the old page do not have their fade classes yet. So the old page is not hidden (well, positioned absolutely) yet. They're still contesting for the same page space. As a result, the tree will appear to be a bit smaller. If we check a bit later, after the fade classes have been added, things should be fine.
		window.addEventListener('resize', this.checkSize)

		// Start the update loop to get animations.
		this.updateVisuals()

		// Adjust the blocks to make them look pretty.
		this.setUpChapters()
	}

	componentWillUnmount() {
		// Remove event listeners.
		this.treeContainer.removeEventListener('mousedown', this.startDragging)
		document.removeEventListener('mouseup', this.endDragging)
		this.treeContainer.removeEventListener('touchstart', this.props.startTouch)
		document.removeEventListener('touchmove', this.props.updateTouch)
		document.removeEventListener('touchend', this.props.endTouch)
		document.removeEventListener('wheel', this.props.scroll)

		// Stop listening for screen resizes.
		window.removeEventListener('resize', this.checkSize)

		// Stop the updates of the visualization.
		window.cancelAnimationFrame(this.animationFrameRequest)
	}

	// updateVisuals is called at every animation frame, to update the state of the tree related to its visual display.
	updateVisuals() {
		this.props.updateVisuals()
		this.animationFrameRequest = window.requestAnimationFrame(this.updateVisuals)
	}

	startDragging(evt) {
		this.props.startDragging(evt)
		document.addEventListener('mousemove', this.props.updateDragging)
	}

	endDragging(evt) {
		this.props.endDragging(evt)
		document.removeEventListener('mousemove', this.props.updateDragging)
	}

	checkSize(evt) {
		this.props.updateTreeContainerRect(this.getTreeContainerRect())
		this.props.updateWindowSize(getWindowSize()) // Make sure to do this only after the tree rectangles are is set. They are needed for the function to properly work.
	}

	setUpChapters() {
		// Walk through the chapters, preparing each one individually.
		for (let name in this.chapterBlocks) {
			// Extract the objects for this chapter.
			const block = this.chapterBlocks[name]
			const title = block.firstChild
			const p = title.firstChild
			const description = block.lastChild

			// Increase the horizontal padding to the largest point before the height of the chapter title increases (because of an extra line). This makes the text more centered. Do this through an efficient binary search.
			let min = minPadding
			let max = maxPadding
			p.style.paddingLeft = p.style.paddingRight = min + 'px'
			const startingHeight = p.offsetHeight // Measure the initial height.
			while (max - min > 1) {
				// Try a certain padding and see if it adds another line.
				p.style.paddingLeft = p.style.paddingRight = ((max + min) / 2) + 'px'
				if (p.offsetHeight > startingHeight)
					max = (max + min) / 2 // The tried padding would add another line. Look at smaller paddings by reducing the max.
				else
					min = (max + min) / 2 // The tried padding does not add another line. Look at bigger paddings by increasing the min.
			}
			p.style.paddingLeft = p.style.paddingRight = min + 'px'

			// Add event listeners to check for clicks.
			title.addEventListener('mouseup', this.props.clickChapterTitle.bind(null, name))
			title.addEventListener('touchend', this.props.clickChapterTitle.bind(null, name))
			description.addEventListener('mouseup', this.props.clickChapterDescription.bind(null, name))
			description.addEventListener('touchend', this.props.clickChapterDescription.bind(null, name))

			// Check the height of the chapter description.
			block.descriptionHeight = description.offsetHeight
			block.style.height = (size.y) + 'px'
			description.style.top = (-block.descriptionHeight) + 'px'
		}

		// Gather the description block heights and send them to redux.
		const descriptionHeights = {}
		for (let name in this.chapterBlocks) {
			descriptionHeights[name] = this.chapterBlocks[name].descriptionHeight
		}
		this.props.updateTreeDescriptionHeights(descriptionHeights)
	}

	getTreeContainerRect() {
		// We use getBoundingClientRect instead of offsetTop/offsetHeight to get the rect, because the latter is rather difficult with all the relatively positioned elements that we're having.
		const innerContainer = this.treeContainer.children[0]
		const { width, height, left, top, right, bottom } = innerContainer.getBoundingClientRect() // We only want certain parts of the rect. This is to prevent Firefox from doing funny stuff at times.
		return { width, height, left, top, right, bottom }
	}

	render() {
		const scale = this.props.zoom
		const shift = this.props.position
		if (!this.chapterBlocks)
			this.chapterBlocks = {}

		// Set up the tree container. We use different divs for the outer container (which will get classes added to it by the parent ReactCSSTransitionGroup), the inner container (which gets its classes added here) and the tree container (which will be transformed/scaled). These all need to be separate, to make things work properly.
		return (
			<div className="treeContainer" ref={obj => this.treeContainer = obj}>
				<div className={classnames(
					'treeInnerContainer',
					{ 'dragging': !!this.props.dragging },
					{ 'invalidClick': !this.props.validClick },
				)}>
					<div className="tree" id="tree" style={{
						transform: `matrix(${scale},0,0,${scale},${shift.x},${shift.y})`,
					}} ref={obj => this.tree = obj}>
						{chapterArray.map(chapter => {
							// Check if we already know the HTML block for this chapter, and if we know the height of the description. If so, apply the proper height.
							const active = chapter.name === this.props.activeChapter
							const previousActive = chapter.name === this.props.previousActiveChapter
							const block = this.chapterBlocks[chapter.name]
							if (block) {
								const description = block.lastChild
								block.style.height = ((active ? block.descriptionHeight : 0) + size.y) + 'px'
								description.style.top = (active ? 0 : -block.descriptionHeight) + 'px'
							}

							return (
								<div
									key={chapter.name}
									className={classnames(
										'chapter',
										{ 'active': active },
										{ 'previousActive': previousActive },
										{ 'unwritten': chapter.unwritten },
									)}
									ref={obj => this.chapterBlocks[chapter.name] = obj}
									style={{
										left: (chapter.position.x - size.x / 2) + 'px',
										top: chapter.position.y + 'px',
									}}
								>
									<div className="title">
										<p>{chapter.title}</p>
										<svg className="titleArrow" viewBox="0 0 20 20" preserveAspectRatio="none">
											<path d="M0 0 l10 20 l10 -20z" />
										</svg>
									</div>
									<div className="description">
										{chapter.description}
										<p className="study">Study this chapter</p>
										<svg className="descriptionArrow" viewBox="0 0 20 20" preserveAspectRatio="none">
											<path d="M0 0 l20 10 l-20 10z" />
										</svg>
									</div>
								</div>
							)
						})}
						<svg className="treeBackground" style={{
							height: treeRect.height + 'px',
							width: treeRect.width + 'px',
							left: treeRect.left + 'px',
							top: treeRect.top + 'px',
						}} viewBox={`${treeRect.left} ${treeRect.top} ${treeRect.width} ${treeRect.height}`}>
							<defs>
								<filter
									xmlns="http://www.w3.org/2000/svg"
									id="shadow"
									filterUnits="userSpaceOnUse"
									x={this.props.treeRect.left}
									y={this.props.treeRect.top}
									width={this.props.treeRect.width}
									height={this.props.treeRect.height}
								>
									<feGaussianBlur in="SourceAlpha" stdDeviation="4" />
									<feOffset dx="0" dy="2" result="offsetblur" />
									<feComponentTransfer>
										<feFuncA type="linear" slope="0.26" />
									</feComponentTransfer>
									<feMerge>
										<feMergeNode />
										<feMergeNode in="SourceGraphic" />
									</feMerge>
								</filter>
							</defs>
							{chapterArray.map(chapter => chapter.children.length === 0 ? '' : (
								<g key={chapter.name}>
									{chapter.children.map(child => getTreeLine(chapter, child))}
								</g>
							))}
						</svg>
					</div>
				</div>
			</div>
		)
	}
}

const stateMap = (state) => ({
	...state.tree.visuals
})
const actionMap = (dispatch) => ({
	startDragging: (evt) => dispatch(treeActions.startDragging(evt)),
	updateDragging: (evt) => dispatch(treeActions.updateDragging(evt)),
	endDragging: (evt) => dispatch(treeActions.endDragging(evt)),
	startTouch: (evt) => dispatch(treeActions.startTouch(evt)),
	updateTouch: (evt) => dispatch(treeActions.updateTouch(evt)),
	endTouch: (evt) => dispatch(treeActions.endTouch(evt)),
	scroll: (evt) => dispatch(treeActions.scroll(evt)),
	clickChapterTitle: (name, evt) => dispatch(treeActions.clickChapterTitle(name, evt)),
	clickChapterDescription: (name, evt) => dispatch(treeActions.clickChapterDescription(name, evt)),
	updateVisuals: (evt) => dispatch(treeActions.updateVisuals(evt)),
	updateWindowSize: (size) => dispatch(treeActions.updateWindowSize(size)),
	updateTreeDescriptionHeights: (rect) => dispatch(treeActions.updateDescriptionHeights(rect)),
	updateTreeContainerRect: (rect) => dispatch(treeActions.updateContainerRect(rect)),
})
export default connect(stateMap, actionMap)(Tree)