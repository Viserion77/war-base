/* istanbul ignore file -- entrypoint for npm run train:ai. */
import path from 'path'
import { fileURLToPath } from 'url'
import RedeNeural from '../../rede-neural/rede-neural.js'
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
import { indiceMaiorScore, salvarRede, treinarRedeComDataset } from './treinar-rede.js'

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

export function treinarTudo({ outputDir = OUTPUT_DIR, epocas } = {}) {
    const arquivos = []

    for (const [nome, dataset] of Object.entries(TRAINING_PLAN)) {
        const modelo = treinarRedeComDataset({
            nome,
            spec: NETWORK_SPECS[nome],
            dataset,
            epocas,
        })
        smokeTest(nome, modelo, dataset)
        arquivos.push(salvarRede({ nome, modelo, outputDir }))
    }

    return arquivos
}

export function smokeTest(nome, modelo, dataset) {
    if (!dataset.length || modelo.rede.neuroniosSaida > 256) {
        return true
    }

    const rede = RedeNeural.fromJSON(modelo.rede)
    const exemplo = dataset[0]
    const esperado = indiceMaiorScore(exemplo.saidas)
    const obtido = indiceMaiorScore(rede.prever(exemplo.entradas))

    if (obtido !== esperado) {
        throw new Error('Smoke test falhou para ' + nome + ': esperado ' + esperado + ', obtido ' + obtido)
    }

    return true
}

function isMainModule() {
    return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
}

if (isMainModule()) {
    const arquivos = treinarTudo()
    console.log('Redes compostas salvas em:\n' + arquivos.join('\n'))
}
