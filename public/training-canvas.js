const MACRO_LABELS = ['farm', 'research', 'defend', 'attack', 'upgrade', 'upgrade-castle', 'wait']
const HIDDEN_GRID_COLS = 12
const HIDDEN_GRID_ROWS = 8
const HIDDEN_COUNT = HIDDEN_GRID_COLS * HIDDEN_GRID_ROWS
const TOP_CONNECTIONS = 50

export function createTrainingCanvas(canvas) {
    const context = canvas.getContext('2d')
    let lastSnapshot = null

    function render(snapshot) {
        lastSnapshot = snapshot
        draw()
    }

    function clear() {
        lastSnapshot = null
        context.clearRect(0, 0, canvas.width, canvas.height)
    }

    function draw() {
        const width = canvas.width
        const height = canvas.height
        context.clearRect(0, 0, width, height)
        drawBackground(context, width, height)

        if (!lastSnapshot) {
            drawPlaceholder(context, width, height)
            return
        }

        const inputArea = { x: 20, y: 20, width: width - 40, height: 140 }
        const hiddenArea = { x: 20, y: 200, width: width - 40, height: 220 }
        const outputArea = { x: 20, y: 450, width: width - 40, height: 130 }

        drawInputs(context, inputArea, lastSnapshot)
        drawHidden(context, hiddenArea, lastSnapshot)
        drawConnections(context, hiddenArea, outputArea, lastSnapshot)
        drawOutputs(context, outputArea, lastSnapshot)
    }

    return {
        render,
        clear,
        redraw: draw,
    }
}

export function drawBackground(context, width, height) {
    context.fillStyle = '#1a1612'
    context.fillRect(0, 0, width, height)

    context.strokeStyle = 'rgba(212, 175, 55, 0.15)'
    context.lineWidth = 1
    context.strokeRect(10, 10, width - 20, height - 20)
}

export function drawPlaceholder(context, width, height) {
    context.fillStyle = '#9b8b6a'
    context.font = '16px Cinzel, Georgia, serif'
    context.textAlign = 'center'
    context.fillText('Aguardando primeira decisao da IA campea...', width / 2, height / 2)
}

export function drawInputs(context, area, snapshot) {
    const labelHeight = 16
    const boardWidth = (area.width - 40) / 3
    const boardHeight = area.height - labelHeight - 6
    const summary = snapshot.boardSummary || []

    context.fillStyle = '#3aa6ff'
    context.font = '12px Cinzel, Georgia, serif'
    context.textAlign = 'left'
    context.fillText('Inputs: 3 frames x 30 x 48 + 32 escalares', area.x, area.y + 12)

    for (let frame = 0; frame < 3; frame += 1) {
        const x = area.x + 10 + frame * (boardWidth + 10)
        const y = area.y + labelHeight
        drawSpectralBoard(context, x, y, boardWidth, boardHeight, summary[frame] || null)
        context.fillStyle = '#cdb892'
        context.font = '10px Cinzel, Georgia, serif'
        context.textAlign = 'center'
        context.fillText('T' + (frame === 2 ? '0' : '-' + (2 - frame)), x + boardWidth / 2, y + boardHeight + 12)
    }
}

export function drawSpectralBoard(context, x, y, width, height, board) {
    context.fillStyle = '#22201c'
    context.fillRect(x, y, width, height)

    if (!board) {
        return
    }

    const cellHeight = height / board.length
    const cellWidth = board.length ? width / board[0].length : 0

    for (let row = 0; row < board.length; row += 1) {
        const cells = board[row]

        for (let col = 0; col < cells.length; col += 1) {
            const value = cells[col]
            context.fillStyle = spectralColor(value)
            context.fillRect(x + col * cellWidth, y + row * cellHeight, cellWidth + 0.5, cellHeight + 0.5)
        }
    }
}

export function spectralColor(value) {
    const clamped = Math.max(0, Math.min(1, Number(value) || 0))
    const hue = Math.floor((1 - clamped) * 220 + clamped * 0)
    const saturation = Math.max(20, Math.floor(clamped * 90))
    const lightness = 40 + clamped * 20
    return 'hsl(' + hue + ',' + saturation + '%,' + lightness + '%)'
}

export function drawHidden(context, area, snapshot) {
    const activations = snapshot.hiddenActivations || []
    const cellWidth = area.width / HIDDEN_GRID_COLS
    const cellHeight = area.height / HIDDEN_GRID_ROWS
    const radius = Math.min(cellWidth, cellHeight) / 2 - 4

    context.fillStyle = '#d4af37'
    context.font = '12px Cinzel, Georgia, serif'
    context.textAlign = 'left'
    context.fillText('Hidden: ' + HIDDEN_COUNT + ' neuronios', area.x, area.y - 6)

    for (let row = 0; row < HIDDEN_GRID_ROWS; row += 1) {
        for (let col = 0; col < HIDDEN_GRID_COLS; col += 1) {
            const index = row * HIDDEN_GRID_COLS + col
            const activation = activations[index] || 0
            const cx = area.x + col * cellWidth + cellWidth / 2
            const cy = area.y + row * cellHeight + cellHeight / 2

            context.beginPath()
            context.arc(cx, cy, Math.max(2, radius), 0, Math.PI * 2)
            context.fillStyle = 'rgba(40, 36, 30, 0.9)'
            context.fill()

            context.beginPath()
            context.arc(cx, cy, Math.max(1, radius * Math.max(0.1, activation)), 0, Math.PI * 2)
            context.fillStyle = hiddenColor(activation)
            context.fill()

            if (activation > 0.7) {
                context.lineWidth = 1.5
                context.strokeStyle = '#fff5b0'
                context.stroke()
            }
        }
    }
}

export function hiddenColor(activation) {
    const value = Math.max(0, Math.min(1, activation))
    const red = Math.floor(212 * value + 60 * (1 - value))
    const green = Math.floor(175 * value + 40 * (1 - value))
    const blue = Math.floor(55 * value + 30 * (1 - value))
    return 'rgb(' + red + ',' + green + ',' + blue + ')'
}

export function drawConnections(context, hiddenArea, outputArea, snapshot) {
    const hiddenActivations = snapshot.hiddenActivations || []
    const macroScores = snapshot.macroScores || []
    const weights = snapshot.outputWeights || []
    const connections = pickTopConnections(hiddenActivations, macroScores, weights)
    const cellWidth = hiddenArea.width / HIDDEN_GRID_COLS
    const cellHeight = hiddenArea.height / HIDDEN_GRID_ROWS
    const outputCellWidth = outputArea.width / MACRO_LABELS.length

    for (const connection of connections) {
        const hiddenRow = Math.floor(connection.hiddenIndex / HIDDEN_GRID_COLS)
        const hiddenCol = connection.hiddenIndex % HIDDEN_GRID_COLS
        const startX = hiddenArea.x + hiddenCol * cellWidth + cellWidth / 2
        const startY = hiddenArea.y + hiddenRow * cellHeight + cellHeight / 2
        const endX = outputArea.x + connection.outputIndex * outputCellWidth + outputCellWidth / 2
        const endY = outputArea.y + 14

        context.beginPath()
        context.moveTo(startX, startY)
        context.lineTo(endX, endY)
        context.lineWidth = Math.max(0.6, Math.abs(connection.weight) * 1.4)
        context.strokeStyle = connection.weight >= 0
            ? 'rgba(79, 143, 91, ' + connection.alpha + ')'
            : 'rgba(168, 50, 50, ' + connection.alpha + ')'
        context.stroke()
    }
}

export function pickTopConnections(hiddenActivations, macroScores, outputWeights) {
    const candidates = []
    const hiddenCount = Math.min(hiddenActivations.length, HIDDEN_COUNT)

    for (let hiddenIndex = 0; hiddenIndex < hiddenCount; hiddenIndex += 1) {
        for (let outputIndex = 0; outputIndex < macroScores.length; outputIndex += 1) {
            const weight = (outputWeights[outputIndex] && outputWeights[outputIndex][hiddenIndex]) || 0
            const activation = hiddenActivations[hiddenIndex] || 0
            const score = Math.abs(weight) * Math.max(0.1, activation)
            candidates.push({ hiddenIndex, outputIndex, weight, activation, score })
        }
    }

    candidates.sort((a, b) => b.score - a.score)

    return candidates.slice(0, TOP_CONNECTIONS).map(candidate => ({
        ...candidate,
        alpha: Math.min(0.7, 0.1 + candidate.score),
    }))
}

export function drawOutputs(context, area, snapshot) {
    const scores = snapshot.macroScores || []
    const chosen = snapshot.chosenMacro
    const cellWidth = area.width / MACRO_LABELS.length

    context.fillStyle = '#4f8f5b'
    context.font = '12px Cinzel, Georgia, serif'
    context.textAlign = 'left'
    context.fillText('Macro-acoes', area.x, area.y - 6)

    for (let index = 0; index < MACRO_LABELS.length; index += 1) {
        const x = area.x + index * cellWidth
        const score = scores[index] || 0
        const barHeight = Math.max(4, score * (area.height - 30))
        const isChosen = MACRO_LABELS[index] === chosen

        context.fillStyle = isChosen ? '#d4af37' : 'rgba(79, 143, 91, 0.7)'
        context.fillRect(x + 6, area.y + (area.height - 22 - barHeight), cellWidth - 12, barHeight)

        context.fillStyle = '#ece2c4'
        context.font = '11px Cinzel, Georgia, serif'
        context.textAlign = 'center'
        context.fillText(MACRO_LABELS[index], x + cellWidth / 2, area.y + area.height - 6)
        context.fillText(score.toFixed(2), x + cellWidth / 2, area.y + (area.height - 24 - barHeight) - 2)

        if (isChosen) {
            context.strokeStyle = '#fff5b0'
            context.lineWidth = 2
            context.strokeRect(x + 4, area.y + 6, cellWidth - 8, area.height - 16)
        }
    }
}
