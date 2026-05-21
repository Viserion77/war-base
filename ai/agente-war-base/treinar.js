import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import RedeNeural from '../rede-neural/rede-neural.js'
import {
    WAR_BASE_AI_ACTIONS,
    WAR_BASE_AI_INPUTS,
} from './agente-neural.js'

export const MODEL_PATH = fileURLToPath(new URL('./rede-treinada.json', import.meta.url))

export function criarGeradorAleatorio(seedInicial) {
    let seed = seedInicial >>> 0

    return () => {
        seed = (seed * 1664525 + 1013904223) >>> 0
        return seed / 4294967296
    }
}

export function respostaParaAcao(acao) {
    return WAR_BASE_AI_ACTIONS.map(candidate => candidate === acao ? 1 : 0)
}

export function exemplo(entradas, acao) {
    return {
        entradas,
        saidas: respostaParaAcao(acao),
    }
}

const zero = {
    coal: 0,
    knowledge: 0,
    baseLevel: 0.25,
    baseHealth: 1,
    coverCount: 0,
    taraqueCount: 0,
    perCount: 0,
    hefCount: 0,
    tujaiCount: 0,
    zunimCount: 0,
    taraqueUnlocked: 0,
    perUnlocked: 0,
    hefUnlocked: 0,
    tujaiUnlocked: 0,
    capturableTargets: 0,
    enemyBaseProximity: 0.2,
    hasCaptureOrder: 0,
    aliveEnemyCount: 0.14,
}

export function vetor(parcial) {
    const entrada = {
        ...zero,
        ...parcial,
    }

    return WAR_BASE_AI_INPUTS.map(nome => entrada[nome])
}

export const dataset = [
    exemplo(vetor({ coal: 0.5, capturableTargets: 0.8, hasCaptureOrder: 0 }), 'capture'),
    exemplo(vetor({ coal: 0.5, capturableTargets: 0.8, hasCaptureOrder: 1 }), 'build-cover'),
    exemplo(vetor({ coal: 0.8, coverCount: 0, capturableTargets: 0, hasCaptureOrder: 1 }), 'build-cover'),
    exemplo(vetor({ coal: 0.4, coverCount: 0.18, capturableTargets: 0, hasCaptureOrder: 0 }), 'capture'),
    exemplo(vetor({ coal: 0.75, coverCount: 0.18, baseLevel: 0.25 }), 'upgrade-base'),
    exemplo(vetor({ coal: 0.25, coverCount: 0.35, baseLevel: 0.5, taraqueUnlocked: 1, taraqueCount: 0 }), 'build-taraque'),
    exemplo(vetor({ coal: 0.4, knowledge: 0.2, baseLevel: 0.5, taraqueUnlocked: 1, taraqueCount: 0.33, perUnlocked: 0 }), 'research-per'),
    exemplo(vetor({ coal: 0.4, knowledge: 0.28, baseLevel: 0.5, taraqueUnlocked: 1, taraqueCount: 0.33, perUnlocked: 1, hefUnlocked: 0 }), 'research-hef'),
    exemplo(vetor({ coal: 0.4, knowledge: 0.55, baseLevel: 0.5, taraqueUnlocked: 1, taraqueCount: 0.66, perUnlocked: 1, hefUnlocked: 1, tujaiUnlocked: 0 }), 'research-tujai'),
    exemplo(vetor({ coal: 0.3, knowledge: 0.15, baseLevel: 0.5, coverCount: 0.35, perUnlocked: 1, perCount: 0, enemyBaseProximity: 0.45 }), 'build-per'),
    exemplo(vetor({ coal: 0.36, knowledge: 0.25, baseLevel: 0.5, coverCount: 0.35, hefUnlocked: 1, perCount: 0.16, hefCount: 0, enemyBaseProximity: 0.45 }), 'build-hef'),
    exemplo(vetor({ coal: 0.5, knowledge: 0.55, baseLevel: 0.5, coverCount: 0.5, tujaiUnlocked: 1, tujaiCount: 0 }), 'build-tujai'),
    exemplo(vetor({ coal: 0.2, knowledge: 0.55, baseLevel: 0.5, coverCount: 0.5, tujaiUnlocked: 1, tujaiCount: 0.33, enemyBaseProximity: 0.55 }), 'spawn-zunim'),
    exemplo(vetor({ coal: 0.05, knowledge: 0.02, coverCount: 0.35, hasCaptureOrder: 1 }), 'wait'),
]

export function treinarRede(opcoes = {}) {
    const rede = new RedeNeural(WAR_BASE_AI_INPUTS.length, 14, WAR_BASE_AI_ACTIONS.length, {
        taxaAprendizado: opcoes.taxaAprendizado ?? 0.18,
        aleatorio: opcoes.aleatorio || criarGeradorAleatorio(opcoes.seed ?? 77311),
    })
    const exemplos = opcoes.dataset || dataset
    const epocas = opcoes.epocas ?? 4200

    for (let epoca = 0; epoca < epocas; epoca += 1) {
        for (const item of exemplos) {
            rede.treinar(item.entradas, item.saidas)
        }
    }

    return rede
}

export function criarModelo(opcoes = {}) {
    const rede = opcoes.rede || treinarRede(opcoes)
    const exemplos = opcoes.dataset || dataset

    return {
        name: 'war-base-neural-agent',
        trainedAt: opcoes.trainedAt || '2026-05-21T00:00:00.000Z',
        inputs: WAR_BASE_AI_INPUTS,
        actions: WAR_BASE_AI_ACTIONS,
        examples: exemplos.length,
        rede: rede.toJSON(),
    }
}

export function salvarModelo(opcoes = {}) {
    const caminhoModelo = opcoes.caminhoModelo || MODEL_PATH
    const modelo = opcoes.modelo || criarModelo(opcoes)

    fs.writeFileSync(caminhoModelo, JSON.stringify(modelo, null, 2) + '\n')
    return caminhoModelo
}

function isMainModule() {
    return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
}

/* istanbul ignore next -- entrypoint exercised by npm run train:ai; unit tests cover the training functions. */
if (isMainModule()) {
    const caminhoModelo = salvarModelo()
    console.log('Modelo salvo em ' + caminhoModelo)
}
