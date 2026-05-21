/* istanbul ignore file -- model orchestration is smoke-tested; generated policy coverage is not line-gated. */
import fs from 'fs'
import { fileURLToPath } from 'url'
import RedeNeural from '../rede-neural/rede-neural.js'
import { encodeBoard } from './codificacao/board.js'
import { encodeScalars } from './codificacao/escalares.js'
import { createFrameBuffer, flattenFrames } from './codificacao/historico.js'
import {
    ATTACK_ACTIONS,
    COMPOSITE_INPUT_SIZE,
    DEFEND_ACTIONS,
    FARM_ACTIONS,
    MACRO_ACTIONS,
    NETWORK_NAMES,
    NETWORK_SPECS,
    PLACEMENT_STRUCTURE_TYPES,
    RESEARCH_ACTIONS,
} from './constants.js'
import {
    countCappedTypes,
    criarComandoCaptura,
    criarComandoConstrucao,
    criarComandoParaAcao,
    criarComandoPesquisa,
    criarComandoScout,
    criarComandoUpgrade,
    criarComandoZunim,
    rankByScores,
} from './validadores.js'

export const DEFAULT_NETWORKS_DIR = fileURLToPath(new URL('./redes/', import.meta.url))

export function createCompositeWarBaseAgent(opcoes = {}) {
    const redes = opcoes.redes || opcoes.networks || carregarRedesCompostas(opcoes.networksDir || DEFAULT_NETWORKS_DIR)
    const frameBuffer = opcoes.frameBuffer || createFrameBuffer()
    const heuristicFallback = opcoes.heuristicFallback ?? true

    return {
        cooldownMs: opcoes.cooldownMs ?? 1000,
        redes,
        frameBuffer,
        decidir(contexto) {
            return decidirComRedes(redes, contexto.state, contexto.playerId, {
                frameBuffer,
                heuristicFallback,
            })
        },
        decide(contexto) {
            return decidirComRedes(redes, contexto.state, contexto.playerId, {
                frameBuffer,
                heuristicFallback,
            })
        },
    }
}

export function carregarRedesCompostas(networksDir = DEFAULT_NETWORKS_DIR) {
    const redes = {}

    for (const name of NETWORK_NAMES) {
        redes[name] = carregarRedeComposta(name, networksDir)
    }

    return redes
}

export function carregarRedeComposta(name, networksDir = DEFAULT_NETWORKS_DIR) {
    const spec = NETWORK_SPECS[name]
    const path = networksDir.endsWith('/') ? networksDir + name + '.json' : networksDir + '/' + name + '.json'

    if (!spec || !fs.existsSync(path)) {
        return createZeroNetwork(spec?.outputs || 0)
    }

    const model = JSON.parse(fs.readFileSync(path, 'utf8'))
    const serialized = model.rede || model

    if (serialized.neuroniosEntrada !== spec.inputs
        || serialized.neuroniosOcultos !== spec.hidden
        || serialized.neuroniosSaida !== spec.outputs) {
        return createZeroNetwork(spec.outputs)
    }

    return RedeNeural.fromJSON(serialized)
}

export function createZeroNetwork(outputs) {
    return {
        prever() {
            return new Array(outputs).fill(0)
        },
    }
}

export function decidirComRedes(redes, state, playerId, opcoes = {}) {
    const frameBuffer = opcoes.frameBuffer || createFrameBuffer()
    const input = criarEntradaComposta(state, playerId, frameBuffer)
    const macroScores = preverRede(redes.router, input)
    const bestMacroScore = Math.max(...macroScores, 0)

    if (bestMacroScore <= 0) {
        return opcoes.heuristicFallback ? decidirHeuristicamente(state, playerId) : null
    }

    for (const escolha of rankByScores(MACRO_ACTIONS, macroScores)) {
        if (escolha.label === 'wait') {
            continue
        }

        const comando = montarComandoDaMacro(escolha.label, redes, input, state, playerId)

        if (comando) {
            return {
                ...comando,
                aiDecision: {
                    policy: escolha.label,
                    score: Number(escolha.score.toFixed(6)),
                },
            }
        }
    }

    return null
}

export function criarEntradaComposta(state, playerId, frameBuffer = createFrameBuffer()) {
    const board = encodeBoard(state, playerId)
    const frames = frameBuffer.push(playerId, board)
    const scalars = encodeScalars(state, playerId)
    const input = [...flattenFrames(frames), ...scalars]

    if (input.length !== COMPOSITE_INPUT_SIZE) {
        return input.slice(0, COMPOSITE_INPUT_SIZE).concat(new Array(Math.max(0, COMPOSITE_INPUT_SIZE - input.length)).fill(0))
    }

    return input
}

export function montarComandoDaMacro(macro, redes, input, state, playerId) {
    if (macro === 'farm') {
        return montarComandoFarm(redes, input, state, playerId)
    }

    if (macro === 'capture') {
        return criarComandoCaptura(state, playerId, preverRede(redes.capture, input))
    }

    if (macro === 'research') {
        return montarComandoResearch(redes, input, state, playerId)
    }

    if (macro === 'defend') {
        return montarComandoDefend(redes, input, state, playerId)
    }

    if (macro === 'attack') {
        return montarComandoAttack(redes, input, state, playerId)
    }

    if (macro === 'upgrade') {
        return criarComandoUpgrade(state, playerId, preverRede(redes.upgrade, input))
    }

    if (macro === 'upgrade-base') {
        return criarComandoUpgrade(state, playerId, preverRede(redes['target-upgrade'], input), ['base'])
    }

    if (macro === 'scout') {
        return criarComandoScout(state, playerId, preverRede(redes.scout, input))
    }

    return null
}

export function montarComandoFarm(redes, input, state, playerId) {
    const scores = preverRede(redes.farm, input)

    for (const escolha of rankByScores(FARM_ACTIONS, scores)) {
        if (escolha.label === 'build-cover') {
            const comando = criarComandoConstrucao(state, playerId, 'cover', preverPlacement(redes, input, 'cover'))
            if (comando) return comando
        }

        if (escolha.label === 'build-taraque') {
            const comando = criarComandoConstrucao(state, playerId, 'taraque', preverPlacement(redes, input, 'taraque'))
            if (comando) return comando
        }

        if (escolha.label === 'capture-cover-target') {
            const comando = criarComandoCaptura(state, playerId, preverRede(redes['target-capture'], input), { type: 'cover' })
            if (comando) return comando
        }
    }

    return null
}

export function montarComandoResearch(redes, input, state, playerId) {
    const scores = preverRede(redes.research, input)

    for (const escolha of rankByScores(RESEARCH_ACTIONS, scores)) {
        const comando = criarComandoPesquisa(state, playerId, escolha.label)
        if (comando) return comando
    }

    return null
}

export function montarComandoDefend(redes, input, state, playerId) {
    const scores = preverRede(redes.defend, input)

    for (const escolha of rankByScores(DEFEND_ACTIONS, scores)) {
        if (escolha.label === 'build-per') {
            const comando = criarComandoConstrucao(state, playerId, 'per', preverPlacement(redes, input, 'per'))
            if (comando) return comando
        }

        if (escolha.label === 'build-hef') {
            const comando = criarComandoConstrucao(state, playerId, 'hef', preverPlacement(redes, input, 'hef'))
            if (comando) return comando
        }

        if (escolha.label === 'upgrade-defensive') {
            const comando = criarComandoUpgrade(state, playerId, preverRede(redes['target-defend-upgrade'], input), ['per', 'hef'])
            if (comando) return comando
        }
    }

    return null
}

export function montarComandoAttack(redes, input, state, playerId) {
    const scores = preverRede(redes.attack, input)

    for (const escolha of rankByScores(ATTACK_ACTIONS, scores)) {
        if (escolha.label === 'build-tujai') {
            const comando = criarComandoConstrucao(state, playerId, 'tujai', preverPlacement(redes, input, 'tujai'))
            if (comando) return comando
        }

        if (escolha.label === 'spawn-zunim') {
            const comando = criarComandoZunim(state, playerId)
            if (comando) return comando
        }

        if (escolha.label === 'build-forward-tower') {
            const per = criarComandoConstrucao(state, playerId, 'per', preverPlacement(redes, input, 'per'))
            if (per) return per

            const hef = criarComandoConstrucao(state, playerId, 'hef', preverPlacement(redes, input, 'hef'))
            if (hef) return hef
        }
    }

    return null
}

export function preverPlacement(redes, input, structureType) {
    return preverRede(redes.placement, input.concat(oneHotStructureType(structureType)))
}

export function oneHotStructureType(structureType) {
    return PLACEMENT_STRUCTURE_TYPES.map(type => type === structureType ? 1 : 0)
}

export function preverRede(rede, input) {
    if (!rede || typeof rede.prever !== 'function') {
        return []
    }

    return rede.prever(input)
}

export function decidirHeuristicamente(state, playerId) {
    const standardActions = [
        'capture',
        'build-cover',
        'upgrade-base',
        'build-taraque',
        'research-per',
        'research-hef',
        'research-tujai',
        'build-per',
        'build-hef',
        'build-tujai',
        'spawn-zunim',
        'scout',
    ]
    const gate = state.catalog?.limits?.baseUpgrade
    const gateClosed = gate ? !gate.ready : false
    const capsCheios = countCappedTypes(state) >= 2

    let actions = standardActions

    if (gateClosed) {
        actions = ['upgrade', ...standardActions.filter(action => action !== 'upgrade-base')]
    } else if (capsCheios) {
        actions = ['upgrade-base', ...standardActions.filter(action => action !== 'upgrade-base')]
    }

    for (const action of actions) {
        const comando = criarComandoParaAcao(action, state, playerId)

        if (comando) {
            return {
                ...comando,
                aiDecision: {
                    policy: 'heuristic:' + action,
                    score: 0,
                },
            }
        }
    }

    return null
}
