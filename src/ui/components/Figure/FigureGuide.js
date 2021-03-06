import './FigureGuide.css'

import React from 'react'
import { connect } from 'react-redux'

const FigureGuide = (props) => {
	if (!props.display)
		return null
	return (
		<div className="figureGuide">
			{props.children}
		</div>
	)
}

const stateMap = (state) => ({
	display: state.settings.showFigureGuides,
})
export default connect(stateMap)(FigureGuide)