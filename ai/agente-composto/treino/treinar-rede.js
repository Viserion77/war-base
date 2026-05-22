/* istanbul ignore file -- command-line training helper; core network behavior is covered in tests. */
import fs from 'fs'
import path from 'path'
import NeuralNetwork from '../../rede-neural/rede-neural.js'

export function createSeededRandom(initialSeed) {
    let seed = initialSeed >>> 0

    return () => {
        seed = (seed * 1664525 + 1013904223) >>> 0
        return seed / 4294967296
    }
}

export function trainNetworkWithDataset({ name, spec, dataset, epochs = Number(process.env.WAR_BASE_AI_EPOCHS || 300), learningRate = 0.15, seed = 77311 }) {
    const network = new NeuralNetwork(spec.inputs, spec.hidden, spec.outputs, {
        learningRate,
        random: createSeededRandom(seed),
    })

    for (let epoch = 0; epoch < epochs; epoch += 1) {
        for (const item of dataset) {
            network.train(item.inputs, item.outputs)
        }
    }

    return {
        name: 'war-base-composite-' + name,
        trainedAt: new Date().toISOString(),
        examples: dataset.length,
        epochs,
        network: network.toJSON(),
    }
}

export function saveNetwork({ name, model, outputDir }) {
    fs.mkdirSync(outputDir, { recursive: true })
    const filePath = path.join(outputDir, name + '.json')
    fs.writeFileSync(filePath, JSON.stringify(model, null, 2) + '\n')
    return filePath
}

export function highestScoreIndex(outputs) {
    return outputs.reduce((best, score, index) => score > outputs[best] ? index : best, 0)
}
