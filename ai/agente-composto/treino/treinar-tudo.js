/* istanbul ignore file -- entrypoint for npm run train:ai. */
import path from 'path'
import { fileURLToPath } from 'url'
import NeuralNetwork from '../../rede-neural/rede-neural.js'
import { NETWORK_SPECS } from '../constants.js'
import { datasetRouter } from './dataset-router.js'
import { datasetFarm } from './dataset-farm.js'
import { datasetCapture } from './dataset-capture.js'
import { datasetResearch } from './dataset-research.js'
import { datasetDefend } from './dataset-defend.js'
import { datasetAttack } from './dataset-attack.js'
import { datasetUpgrade } from './dataset-upgrade.js'
import { datasetScout } from './dataset-scout.js'
import { datasetPlacement } from './dataset-placement.js'
import { highestScoreIndex, saveNetwork, trainNetworkWithDataset } from './treinar-rede.js'

const OUTPUT_DIR = fileURLToPath(new URL('../redes/', import.meta.url))

export const TRAINING_PLAN = {
    router: datasetRouter,
    farm: datasetFarm,
    capture: datasetCapture,
    research: datasetResearch,
    defend: datasetDefend,
    attack: datasetAttack,
    upgrade: datasetUpgrade,
    scout: datasetScout,
    placement: datasetPlacement,
    'target-capture': datasetCapture,
    'target-defend-upgrade': datasetUpgrade,
    'target-upgrade': datasetUpgrade,
}

export function trainAll({ outputDir = OUTPUT_DIR, epochs } = {}) {
    const files = []

    for (const [name, dataset] of Object.entries(TRAINING_PLAN)) {
        const model = trainNetworkWithDataset({
            name,
            spec: NETWORK_SPECS[name],
            dataset,
            epochs,
        })
        smokeTest(name, model, dataset)
        files.push(saveNetwork({ name, model, outputDir }))
    }

    return files
}

export function smokeTest(name, model, dataset) {
    if (!dataset.length || model.network.outputNeurons > 256) {
        return true
    }

    const network = NeuralNetwork.fromJSON(model.network)
    const example = dataset[0]
    const expected = highestScoreIndex(example.outputs)
    const actual = highestScoreIndex(network.predict(example.inputs))

    if (actual !== expected) {
        throw new Error('Smoke test failed for ' + name + ': expected ' + expected + ', actual ' + actual)
    }

    return true
}

function isMainModule() {
    return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
}

if (isMainModule()) {
    const files = trainAll()
    console.log('Composite networks saved in:\n' + files.join('\n'))
}
