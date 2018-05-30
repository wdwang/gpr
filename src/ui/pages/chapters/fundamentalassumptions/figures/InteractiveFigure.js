import React from 'react'

import { connectToData } from '../../../../../redux/dataStore.js'
import GaussianDistribution from '../../../../../logic/gaussianDistribution.js'

import Figure from '../../../../components/Figure/Figure.js'
import GPPlot from '../../../../components/Figure/GPPlot.js'

const id = 'testPlot'
const gpData = {
	covarianceData: {
		type: 'SquaredExponential',
		Vx: 2 ** 2,
		Vy: 2 ** 2,
	},
}

class InteractiveFigure extends Figure {
	constructor() {
		super()
		this.numCounters = 3
	}
	renderSubFigures() {
		return <InteractivePlot />
	}
	onReset() {
		this.props.data.gp.removeAllMeasurements()
	}
	setCounter(newValue, counterIndex) {
		this.props.data.set({ [`counter${counterIndex}`]: Math.max(0, newValue) })
	}
	getCounter(counterIndex) {
		return this.props.data[`counter${counterIndex}`] || 0
	}
}
export default connectToData(InteractiveFigure, id, { gp: true })

class InteractivePlot extends GPPlot {
	// TODO:
	// V Set up a button to increase/decrease the number of samples.
	// - Generate samples and plot them. The plan for generating samples is this.
	//   x Check the test points for which we want a sample. If they are fifteen or less, find the posterior covariance, generate the Cholesky, and come up with a sample.
	//   x If they are more than fifteen points (say, n points) then generating a Cholesky might be tricky. So then:
	//     x generate a range from 0 to n-1 with fifteen numbers in it. Round these numbers. They are the indices of the test points that we will generate a sample for.
	//     x Find the posterior covariance matrix for said test points, generate the Cholesky and come up with a sample.
	//     x Clone the GP. Then add the samples as infinitely precise measurements (or near-infinite anyway).
	//     x For the cloned GP, calculate the mean for the full set of test points. This counts as a sample.
	// - Animate the samples too, so that when you add a data point, the samples move too. This means samples should be passed through transitioners. At the same time, we should also remember the random vectors used to generate said samples.

	// TODO:
	// - Set up a function in the GP class to recalculate all matrices.
	// - Add actions to the reduxGP file (and to the GP):
	//   x setMeanFunction
	//   x setCovarianceFunction
	//   x setDefaultOutputNoise
	//   For all these actions, add the option to recalculate all matrices afterwards, or to simply continue with the previous matrix that existed.

	constructor() {
		super()

		// Define important settings.
		this.id = id
		// this.className.noNumbers = true
		this.className.pointer = true

		// Set up the plot range.
		this.range = {
			input: {
				min: -4,
				max: 5,
			},
			output: {
				min: -3,
				max: 3,
			},
		}

		// Set up the GP. This data will be installed as soon as the GP Plot is set up. [ToDo: rename outputNoise to defaultOutputNoise]
		this.gpData = gpData
	}
	handleClick(pos, evt) {
		this.props.data.gp.addMeasurement({
			input: this.scale.input.invert(pos.x),
			output: new GaussianDistribution(this.scale.output.invert(pos.y), Math.random()),
		})
	}
	handleMouseMove(pos, evt) {
		const point = {
			input: this.scale.input.invert(pos.x),
			output: this.scale.output.invert(pos.y),
		}
		this.extraPoint = this.isWithinRange(point) ? point : null
	}
	handleMouseLeave(pos, evt) {
		delete this.extraPoint
	}
}
InteractivePlot = connectToData(InteractivePlot, id, { gp: true })