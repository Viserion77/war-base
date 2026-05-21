/* istanbul ignore file -- command-line training helper; core network behavior is covered in tests. */
import fs from 'fs'
import path from 'path'
import RedeNeural from '../../rede-neural/rede-neural.js'

export function criarGeradorAleatorio(seedInicial) {
    let seed = seedInicial >>> 0

    return () => {
        seed = (seed * 1664525 + 1013904223) >>> 0
        return seed / 4294967296
    }
}

export function treinarRedeComDataset({ nome, spec, dataset, epocas = Number(process.env.WAR_BASE_AI_EPOCHS || 300), taxaAprendizado = 0.15, seed = 77311 }) {
    const rede = new RedeNeural(spec.inputs, spec.hidden, spec.outputs, {
        taxaAprendizado,
        aleatorio: criarGeradorAleatorio(seed),
    })

    for (let epoca = 0; epoca < epocas; epoca += 1) {
        for (const item of dataset) {
            rede.treinar(item.entradas, item.saidas)
        }
    }

    return {
        name: 'war-base-composite-' + nome,
        trainedAt: new Date().toISOString(),
        examples: dataset.length,
        epocas,
        rede: rede.toJSON(),
    }
}

export function salvarRede({ nome, modelo, outputDir }) {
    fs.mkdirSync(outputDir, { recursive: true })
    const filePath = path.join(outputDir, nome + '.json')
    fs.writeFileSync(filePath, JSON.stringify(modelo, null, 2) + '\n')
    return filePath
}

export function indiceMaiorScore(saidas) {
    return saidas.reduce((best, score, index) => score > saidas[best] ? index : best, 0)
}
