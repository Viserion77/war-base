import Matrix from './matriz.js'

function sigmoid(value) {
    return 1 / (1 + Math.exp(-value))
}

function sigmoidDerivative(value) {
    return value * (1 - value)
}

export default class NeuralNetwork {
    constructor(inputNeurons, hiddenNeurons, outputNeurons, options = {}) {
        this.inputNeurons = inputNeurons
        this.hiddenNeurons = hiddenNeurons
        this.outputNeurons = outputNeurons
        this.learningRate = options.learningRate ?? 0.1

        const random = options.random || Math.random

        this.inputHiddenBias = new Matrix(hiddenNeurons, 1).randomize(random)
        this.hiddenOutputBias = new Matrix(outputNeurons, 1).randomize(random)
        this.inputHiddenWeights = new Matrix(hiddenNeurons, inputNeurons).randomize(random)
        this.hiddenOutputWeights = new Matrix(outputNeurons, hiddenNeurons).randomize(random)
    }

    train(inputArray, targetArray) {
        const input = Matrix.fromArray(inputArray)
        const hidden = Matrix
            .add(Matrix.multiply(this.inputHiddenWeights, input), this.inputHiddenBias)
            .map(sigmoid)
        const output = Matrix
            .add(Matrix.multiply(this.hiddenOutputWeights, hidden), this.hiddenOutputBias)
            .map(sigmoid)

        const target = Matrix.fromArray(targetArray)
        const outputError = Matrix.subtract(target, output)
        const outputGradient = Matrix.scalarMultiply(
            Matrix.hadamard(Matrix.map(output, sigmoidDerivative), outputError),
            this.learningRate,
        )

        const hiddenOutputWeightDelta = Matrix.multiply(outputGradient, Matrix.transpose(hidden))
        const previousHiddenOutputWeights = this.hiddenOutputWeights

        this.hiddenOutputWeights = Matrix.add(this.hiddenOutputWeights, hiddenOutputWeightDelta)
        this.hiddenOutputBias = Matrix.add(this.hiddenOutputBias, outputGradient)

        const hiddenError = Matrix.multiply(Matrix.transpose(previousHiddenOutputWeights), outputError)
        const hiddenGradient = Matrix.scalarMultiply(
            Matrix.hadamard(Matrix.map(hidden, sigmoidDerivative), hiddenError),
            this.learningRate,
        )

        this.inputHiddenWeights = Matrix.add(
            this.inputHiddenWeights,
            Matrix.multiply(hiddenGradient, Matrix.transpose(input)),
        )
        this.inputHiddenBias = Matrix.add(this.inputHiddenBias, hiddenGradient)
    }

    predict(inputArray) {
        const input = Matrix.fromArray(inputArray)
        const hidden = Matrix
            .add(Matrix.multiply(this.inputHiddenWeights, input), this.inputHiddenBias)
            .map(sigmoid)
        const output = Matrix
            .add(Matrix.multiply(this.hiddenOutputWeights, hidden), this.hiddenOutputBias)
            .map(sigmoid)

        return Matrix.toArray(output)
    }

    toJSON() {
        return {
            type: 'war-base-neural-network',
            inputNeurons: this.inputNeurons,
            hiddenNeurons: this.hiddenNeurons,
            outputNeurons: this.outputNeurons,
            learningRate: this.learningRate,
            inputHiddenWeights: this.inputHiddenWeights.toJSON(),
            hiddenOutputWeights: this.hiddenOutputWeights.toJSON(),
            inputHiddenBias: this.inputHiddenBias.toJSON(),
            hiddenOutputBias: this.hiddenOutputBias.toJSON(),
        }
    }

    static fromJSON(json) {
        const network = new NeuralNetwork(json.inputNeurons, json.hiddenNeurons, json.outputNeurons, {
            learningRate: json.learningRate,
            random: () => 0,
        })

        network.inputHiddenWeights = Matrix.fromJSON(json.inputHiddenWeights)
        network.hiddenOutputWeights = Matrix.fromJSON(json.hiddenOutputWeights)
        network.inputHiddenBias = Matrix.fromJSON(json.inputHiddenBias)
        network.hiddenOutputBias = Matrix.fromJSON(json.hiddenOutputBias)

        return network
    }
}

export const activations = {
    sigmoid,
    sigmoidDerivative,
}
