import { describe, expect, jest, test } from '@jest/globals'
import {
    createTrainingCanvas,
    drawBackground,
    drawConnections,
    drawHidden,
    drawInputs,
    drawOutputs,
    drawPlaceholder,
    drawSpectralBoard,
    hiddenColor,
    pickTopConnections,
    spectralColor,
} from '../public/training-canvas.js'

function createContext() {
    const calls = []
    const context = new Proxy({}, {
        get(target, property) {
            if (!(property in target)) {
                target[property] = (...args) => calls.push([property, ...args])
            }

            return target[property]
        },
        set(target, property, value) {
            target[property] = value
            calls.push(['set:' + property, value])
            return true
        },
    })

    context.__calls = calls
    return context
}

function createCanvas(context, width = 900, height = 600) {
    return {
        width,
        height,
        getContext: jest.fn(() => context),
    }
}

describe('training-canvas', () => {
    test('spectralColor and hiddenColor return CSS strings for any activation', () => {
        expect(spectralColor(0)).toMatch(/^hsl\(/)
        expect(spectralColor(1.5)).toMatch(/^hsl\(/)
        expect(spectralColor(-1)).toMatch(/^hsl\(/)
        expect(spectralColor(undefined)).toMatch(/^hsl\(/)
        expect(hiddenColor(0)).toMatch(/^rgb\(/)
        expect(hiddenColor(1)).toMatch(/^rgb\(/)
    })

    test('pickTopConnections orders by combined activation*weight magnitude', () => {
        const connections = pickTopConnections(
            [0.9, 0.2, 0.5],
            [0.5, 0.5],
            [[0.5, 0.1, 0.9], [-0.4, 0.3, 0.2]],
        )

        expect(connections.length).toBeGreaterThan(0)
        expect(connections[0]).toHaveProperty('hiddenIndex')
        expect(connections[0]).toHaveProperty('outputIndex')
        expect(connections[0]).toHaveProperty('weight')
    })

    test('pickTopConnections handles missing weight matrices', () => {
        const connections = pickTopConnections([0.5, 0.5], [0.4, 0.4], [])
        expect(connections[0].weight).toBe(0)
    })

    test('drawBackground and drawPlaceholder write to the context', () => {
        const context = createContext()
        drawBackground(context, 800, 600)
        drawPlaceholder(context, 800, 600)
        expect(context.__calls.some(call => call[0] === 'fillRect')).toBe(true)
        expect(context.__calls.some(call => call[0] === 'fillText')).toBe(true)
    })

    test('drawSpectralBoard tolerates null board and renders cells when present', () => {
        const context = createContext()
        drawSpectralBoard(context, 0, 0, 100, 100, null)
        const before = context.__calls.length
        drawSpectralBoard(context, 0, 0, 100, 100, [[0.1, 0.4], [0.8, 0.2]])
        expect(context.__calls.length).toBeGreaterThan(before)
    })

    test('drawInputs renders three frames and labels them', () => {
        const context = createContext()
        drawInputs(context, { x: 0, y: 0, width: 600, height: 100 }, {
            boardSummary: [[[0.1]], [[0.2]], [[0.3]]],
        })
        expect(context.__calls.some(call => call[0] === 'fillText' && call[1].startsWith('T'))).toBe(true)
    })

    test('drawHidden draws all 96 neurons even when activations are short', () => {
        const context = createContext()
        drawHidden(context, { x: 0, y: 0, width: 480, height: 240 }, { hiddenActivations: [0.95, 0.1] })
        const arcs = context.__calls.filter(call => call[0] === 'arc')
        expect(arcs.length).toBe(192)
    })

    test('drawConnections handles snapshots without explicit weights array', () => {
        const context = createContext()
        drawConnections(
            context,
            { x: 0, y: 0, width: 480, height: 240 },
            { x: 0, y: 280, width: 480, height: 120 },
            { hiddenActivations: [0.4], macroScores: [0.1, 0.2] },
        )
        expect(context.__calls.some(call => call[0] === 'stroke')).toBe(true)
    })

    test('drawOutputs highlights the chosen macro and shows raw scores otherwise', () => {
        const context = createContext()
        drawOutputs(
            context,
            { x: 0, y: 0, width: 700, height: 120 },
            { macroScores: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7], chosenMacro: 'attack' },
        )
        const strokes = context.__calls.filter(call => call[0] === 'strokeRect')
        expect(strokes).toHaveLength(1)
    })

    test('createTrainingCanvas draws a placeholder before any snapshot arrives', () => {
        const context = createContext()
        const canvas = createCanvas(context)
        const renderer = createTrainingCanvas(canvas)

        renderer.redraw()
        expect(context.__calls.some(call => call[0] === 'fillText' && call[1].includes('Aguardando'))).toBe(true)

        renderer.render({
            hiddenActivations: [0.6, 0.2, 0.8],
            macroScores: [0.2, 0.5, 0.3, 0.6, 0.4, 0.1, 0.05],
            chosenMacro: 'attack',
            subnetworkActivated: 'attack',
            boardSummary: [[[0.1]], [[0.2]], [[0.3]]],
            outputWeights: [[0.5, 0.6, 0.1]],
        })

        const callCount = context.__calls.length
        renderer.redraw()
        expect(context.__calls.length).toBeGreaterThan(callCount)

        renderer.clear()
        const clearedCalls = context.__calls.length
        renderer.redraw()
        expect(context.__calls.length).toBeGreaterThan(clearedCalls)
    })
})
