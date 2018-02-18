// GaussianProcess represents a Gaussian process and handles all the math related to it.

import math from 'mathjs'

import { applyFunctionToPairs } from './util.js'
import { logDet, multiplyMatrices, mergeMatrices, arrayAsColumn, arrayAsRow, scalarAsMatrix } from './math.js'
import GaussianDistribution from './gaussianDistribution.js';
// ToDo: implement getSample with math functions like getRand, cholesky and such.

export default class GaussianProcess {
	/*
	 * constructor creates a GP object. It needs various parameters.
	 * - covariance [function] is the covariance function. It should take two input parameters and return the corresponding covariance.
	 * - mean [optional function] is the mean function. It should take a single input parameter and return the corresponding mean. When not given, a zero mean is assumed.
	 * - outputNoise [positive value] is the assumed noise on the output, given as standard deviation.
	 */
	constructor(param) {
		// Check the input.
		if (!param)
			throw new Error('Missing GP parameters: could not initialize the GP object because no parameters object was given.')
		if (!param.covariance)
			throw new Error('Invalid GP parameters: no covariance function was passed along with the initial parameters.')
		if (typeof(param.covariance) !== "function")
			throw new Error('Invalid GP parameters: the covariance function given was not a function.')
		if (!(param.outputNoise > 0))
			throw new Error('Invalid GP parameters: no (positive) parameter outputNoise was given.')

		// Save the input.
		this.mean = param.mean || (() => 0) // If no mean function was given, use the zero function as default.
		this.covariance = param.covariance
		this.sy = param.outputNoise

		// Initialize various parameters.
		this.reset()
	}
	
	/*
	 * reset erases all measurements that have been added to the Gaussian process, returning it to the state it had just after being initialized.
	 */
	reset() {
		this.measurements = []
		this.Kmm = [] // The covariance matrix for the measurements.
		this.Kn = [] // The covariance matrix, including noise. This is the matrix that is going to be inverted.
		this.Kni = [] // The inverted covariance matrix including noise.
	}

	/* 
	 * getPrediction returns the predicted distribution of the GP for the given test points. Parameters include:
	 * - input [array] is the input-values for which we want to get the prior. (It can also be a number, in which case all the results are numbers too.)
	 * - joint [optional boolean; default false] sets whether we want the outcome to be a joint (multivariate) distribution of all output values, or simply separate individual distributions. The latter is default, as it saves space/time. The first may be used when we require samples from a distribution.
	 * The output is an object containing:
	 * - input [array] is the set of input-values that were given. Nothing is done with them.
	 * - mean [array] is the set of mean output values.
	 * - covariance [matrix] is the covariance matrix for the output values. It's only given when includeCovariance is set to true.
	 * - standardDeviation [array] is the standard deviations for the output values.
	 */
	getPrediction(param) {
		// Check input.
		if (!param)
			throw new Error('Missing parameters object: the getPrior function was called without a parameters object.')
		if (param.input === undefined)
			throw new Error('Missing parameter: no parameter "input" was passed to the getPrior function.')

		// Check if we actually have measurements.
		const n = this.measurements.length // Number of measurements.
		if (n === 0) 
			return this.getPrior(param)
		
		// If we do not want a joint distribution, we can simply deal with the points one by one.
		const joint = param.joint && Array.isArray(param.input)
		let input = param.input // Short notation for the test input points.
		if (!joint) {
			if (Array.isArray(input)) {
				// We separately predict each point.
				return input.map(input => this.getPrediction({
					...param,
					input,
				}))
			} else {
				input = [input] // The rest of the script expects the input to be an array.
			}
		}

		// Set up necessary matrices.
		const xm = this.getMeasurementInputs()
		const Kms = applyFunctionToPairs(this.covariance, xm, input)
		const Kss = applyFunctionToPairs(this.covariance, input)
		const Ksm = math.transpose(Kms)

		// Calculate inferences.
		const ym = this.getMeasurementOutputs()
		const beta = math.multiply(Ksm, this.Kni) // Ksm/(Kmm + Sn).
		const mean = math.multiply(beta, ym)
		const covariance = math.subtract(Kss, math.multiply(beta, Kms))

		// Set up final result.
		return {
			input: param.input,
			output: (joint ? 
				new GaussianDistribution(mean, covariance) :
				new GaussianDistribution(mean[0], covariance[0][0]) // We didn't want a joint distribution, and we also didn't get an array of input points. Just return a single distribution as output.
			),
		}
	}
	// TODO: IMPLEMENT ABOVE FUNCTION THROUGH A WORKER. IT RETURNS A PROMISE FOR THE RESULT.

	/* 
	 * getPrior returns the prior distribution of the GP for the given test points. So that's the distribution when no measurements at all have been added. The set-up is identical as that of getPrediction.
	 */
	getPrior(param) {
		// Check input.
		if (!param)
			throw new Error('Missing parameters object: the getPrior function was called without a parameters object.')
		if (param.input === undefined)
			throw new Error('Missing parameter: no parameter "input" was passed to the getPrior function.')
		
		// If we do not want a joint distribution, we can simply deal with the points one by one.
		const joint = param.joint && Array.isArray(param.input)
		let input = param.input // Short notation for the test input points.
		if (!joint) {
			if (Array.isArray(input)) {
				// We separately predict each point.
				return input.map(input => this.getPrior({
					...param,
					input,
				}))
			} else {
				input = [input] // The rest of the script expects the input to be an array.
			}
		}
		
		// Find the prior mean and covariance matrix.
		const mean = input.map(x => this.mean(x))
		const covariance = applyFunctionToPairs(this.covariance, input)

		// Set up final result.
		return {
			input: param.input,
			output: (joint ? 
				new GaussianDistribution(mean, covariance) :
				new GaussianDistribution(mean[0], covariance[0][0]) // We didn't want a joint distribution, and we also didn't get an array of input points. Just return a single distribution as output.
			),
		}
	}
	// TODO: IMPLEMENT ABOVE FUNCTION THROUGH A WORKER. IT RETURNS A PROMISE FOR THE RESULT.

	/*
	 * Returns the log-likelihood of the measurements. A base-e logarithm is used.
	 */
	getLogLikelihood() {
		// If there are no measurements, we have a likelihood of 1 (100%).
		const n = this.measurements.length
		if (n === 0)
			return 1
		
		// Calculate the log-likelihood.
		const ym = this.getMeasurementOutputs()
		const Sn = math.multiply(math.eye(n), this.sy ** 2)
		const Kn = math.add(this.Kmm, Sn)
		return -0.5*n*Math.log(2*Math.PI) - 0.5*logDet(Kn._data) - 0.5*math.multiply(math.divide(ym,Kn),ym)
	}

	/*
	 * addMeasurement will add a single measurement (when given a measurement object) or multiple measurements (when given an array of objects). A measurement must be an object having an input and an output parameter. The input parameter can be anything, but must be acceptible to the mean/covariance function. The output parameter must be a number. It returns the index of the measurement that was returned, or if an array of measurements is given, an array of the corresponding indices.
	 */
	addMeasurement(measurement) {
		// If we are given an array of measurements, process them one by one. 
		if (Array.isArray(measurement))
			return measurement.map(m => this.addMeasurement(m))

		// Add a column to matrices Kmm and the matrix-to-invert Kn.
		const newColumn = arrayAsColumn(this.measurements.map(oldMeasurement => this.covariance(oldMeasurement.input, measurement.input)))
		const newRow = arrayAsRow(this.measurements.map(oldMeasurement => this.covariance(oldMeasurement.input, measurement.input)))
		const selfVariance = this.covariance(measurement.input, measurement.input)
		
		// Update Kmm.
		this.Kmm = mergeMatrices([
			[
				this.Kmm,
				newColumn,
			], [
				newRow,
				scalarAsMatrix(selfVariance),
			],
		])

		// Update Kn.
		this.Kn = mergeMatrices([
			[
				this.Kn,
				newColumn,
			], [
				newRow,
				scalarAsMatrix(selfVariance + this.sy),
			],
		])

		// Update the inverse of Kn.
		if (this.measurements.length === 0) {
			this.Kni = scalarAsMatrix(1/(selfVariance + this.sy))
		} else {
			const Delta = 1 / ((selfVariance + this.sy) - multiplyMatrices(newRow, this.Kni, newColumn))
			const rowResult = math.multiply(newRow, this.Kni)
			const columnResult = math.multiply(this.Kni, newColumn)
			this.Kni = mergeMatrices([
				[
					math.add(this.Kni, multiplyMatrices(columnResult, Delta, rowResult)),
					math.multiply(columnResult, -Delta),
				], [
					math.multiply(-Delta, rowResult),
					scalarAsMatrix(Delta),
				],
			])
		}
		
		// Store the measurement.
		return this.measurements.push(measurement) - 1
	}

	/*
	 *	getMeasurementInputs returns an array of the input values of all the given measurements.
	 */
	getMeasurementInputs() {
		return this.measurements.map(measurement => measurement.input)
	}

	/*
	 *	getMeasurementOutputs returns an array of the output values of all the given measurements.
	 */
	getMeasurementOutputs() {
		return this.measurements.map(measurement => measurement.output)
	}

	// TODO: SORT OUT THE FUNCTIONS BELOW.
/*
	predictFromPreviousPrediction(xs, prediction) {
		// Set up shorter notation.
		const xu = prediction.x
		const muu = prediction.mu
		const Suu = prediction.Sigma
		const lx = this.lx
		const ly = this.ly

		// Set up basic matrices.
		const Kuu = covariance(xu, xu, lx, ly)
		const Kus = covariance(xu, xs, lx, ly)
		const Kss = covariance(xs, xs, lx, ly)
		const Ksu = math.transpose(Kus)

		// Do the inference thing.
		const beta = math.divide(Ksu,Kuu)
		const mus = math.multiply(beta, muu)
		const Sigma = math.subtract(Kss, math.multiply(math.multiply(beta,math.subtract(Kuu,Suu)), math.transpose(beta)))
		const std = math.diag(Sigma).map(std => Math.sqrt(std))

		return {
			x: xs,
			mu: mus,
			Sigma,
			std,
		}
	}

	getSample(x, canvas) {
		// Okay, we kind of cheat. Because the math is complex (Cholesky decompositions and such) and only work for a small number of points (up to roughly 21, depending on the circumstances) we only take a sample of a small number of points for our first sample. Then we take this sample, construct a new GP out of it, and find its mean, which is to be considered the actual sample. It's not fully legit, but it comes as close as we can get, and at least it gives a smooth line.

		// So, first take a small sample.
		const nSample = 21
		const sampleX = getRange(x[0], x[x.length - 1], nSample)
		const samplePrediction = this.predict(sampleX)
		const sampleY = math.add(samplePrediction.mu, math.multiply(chol(samplePrediction.Sigma), getRand(nSample)))

		// Then make a new GP with this sample as "measurements" with very little measurement noise.
		const sampleGP = new GP({
			lx: this.lx,
			ly: this.ly,
			sy: this.ly / 100,
			xm: sampleX,
			ym: sampleY,
		})
		const prediction = sampleGP.predict(x)
		return {
			x,
			y: prediction.mu
		}
	}

	plotSample(sample, canvas, color = '#11dd55') {
		// We draw the given sample line.
		const ctx = canvas.getContext('2d')
		ctx.beginPath()
		sample.x.forEach((v, i) => (i === 0 ?
			ctx.moveTo(sample.x[i], canvas.height / 2 - sample.y[i]) :
			ctx.lineTo(sample.x[i], canvas.height / 2 - sample.y[i])
		))
		ctx.strokeStyle = color
		ctx.lineWidth = 3
		ctx.stroke()
	}*/
}

// Here are a couple of covariance functions.

/*
 * getSquaredExponentialCovarianceFunction returns a squared exponential covariance function. As input, it should have parameters:
 * - Vx [scalar (for scalar inputs) or matrix (for vector inputs)] is the variance for the input. So it's the square of the input length scale.
 * - Vy [scalar] is the prior variance for the output. So it's the square of the output length scale.
 */
export function getSquaredExponentialCovarianceFunction(param) {
	// Check input.
	if (param.Vx === undefined)
		throw new Error('Invalid input parameters: received no Vx parameter.')
	if (param.Vy === undefined)
		throw new Error('Invalid input parameters: received no Vy parameter.')
	if (!(param.Vy > 0))
		throw new Error('Invalid input parameters: the parameter Vy must be positive.')
		
	// Check if we received Vx as a number (and hence have scalar inputs) or as a matrix (and hence have vector inputs).
	if (Array.isArray(param.Vx)) {
		const Vxi = math.inv(param.Vx) // The inverse of the Vx matrix.
		return (x1, x2) => {
			const dx = math.subtract(x1, x2)
			return param.Vy * Math.exp(-0.5*multiplyMatrices(dx,Vxi,dx))
		} 
	} else {
		return (x1, x2) => param.Vy * Math.exp(-((x1 - x2) ** 2) / (2 * param.Vx))
	}
}

// TODO: ADD MORE COVARIANCE FUNCTIONS.