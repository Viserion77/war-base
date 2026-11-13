/* istanbul ignore file -- browser entry-point wires DOM and socket.io; renderer logic is tested in training-canvas. */
import { createTrainingCanvas } from './training-canvas.js'

const socket = window.io ? window.io() : null
const canvas = document.getElementById('network-canvas')
const renderer = createTrainingCanvas(canvas)
const statusPill = document.getElementById('status-pill')
const generationLabel = document.getElementById('generation-label')
const subnetLabel = document.getElementById('subnet-label')
const scoreboard = document.getElementById('scoreboard')
const history = document.getElementById('history')
const aiCountInput = document.getElementById('ai-count')
const aiCountLabel = document.getElementById('ai-count-label')
const sigmaInput = document.getElementById('mutation-sigma')
const ticksInput = document.getElementById('max-ticks')
const cooldownInput = document.getElementById('cooldown-ms')
const startButton = document.getElementById('btn-start')
const stopButton = document.getElementById('btn-stop')
const saveButton = document.getElementById('btn-save-best')

let liveScores = {}
let pendingSnapshot = null
let frameRequested = false

aiCountInput.addEventListener('input', () => {
    aiCountLabel.textContent = aiCountInput.value
})

startButton.addEventListener('click', () => {
    if (!socket) {
        return
    }

    const mode = document.querySelector('input[name="mode"]:checked')?.value || 'survival'
    const initialSource = document.querySelector('input[name="initial-source"]:checked')?.value || 'best'

    socket.emit('training:start', {
        aiCount: Number(aiCountInput.value),
        mode,
        mutationSigma: Number(sigmaInput.value),
        maxTicks: Number(ticksInput.value),
        cooldownMs: Number(cooldownInput.value),
        initialSource,
    })
})

stopButton.addEventListener('click', () => {
    if (socket) {
        socket.emit('training:stop')
    }
})

saveButton.addEventListener('click', () => {
    if (socket) {
        socket.emit('training:save-best')
    }
})

if (socket) {
    socket.on('connect', () => socket.emit('training:subscribe'))
    socket.on('training:started', payload => {
        setStatus('Treinando', true)
        liveScores = {}
        renderScoreboard()
        generationLabel.textContent = 'Geracao ' + (payload?.generation ?? 0)
    })
    socket.on('training:stopped', payload => {
        setStatus('Parando', false)
        if (payload && Number.isFinite(payload.lastGeneration)) {
            generationLabel.textContent = 'Geracao ' + payload.lastGeneration
        }
    })
    socket.on('training:finished', () => {
        setStatus('Inativo', false)
    })
    socket.on('training:best-saved', payload => {
        addHistoryEntry({
            label: 'Best salvo manualmente (gen ' + (payload?.generation ?? '?') + ')',
            sub: payload?.location || '',
        })
    })
    socket.on('training:generation-start', payload => {
        generationLabel.textContent = 'Geracao ' + payload.generation
        liveScores = {}
        renderScoreboard()
    })
    socket.on('training:generation-complete', payload => {
        const winner = payload?.winnerId || '?'
        const score = payload?.finalScores ? payload.finalScores[winner] : null
        addHistoryEntry({
            label: 'Gen ' + payload.generation + ' - vencedor ' + winner,
            sub: score != null ? 'score ' + score.toFixed(0) + ' | ticks ' + payload.durationTicks : 'ticks ' + payload.durationTicks,
        })
    })
    socket.on('training:match-event', payload => {
        if (payload && payload.runningScores) {
            liveScores = payload.runningScores
            renderScoreboard()
        }
    })
    socket.on('training:decision-snapshot', payload => {
        pendingSnapshot = payload
        if (!frameRequested) {
            frameRequested = true
            requestAnimationFrame(flushSnapshot)
        }
    })
    socket.on('training:error', payload => {
        addHistoryEntry({ label: 'Erro: ' + (payload?.message || 'desconhecido'), sub: '' })
    })
    socket.on('training:state', payload => {
        setStatus(payload?.running ? 'Treinando' : 'Inativo', Boolean(payload?.running))
    })
}

function flushSnapshot() {
    frameRequested = false
    if (pendingSnapshot) {
        renderer.render(pendingSnapshot)

        if (pendingSnapshot.subnetworkActivated) {
            subnetLabel.innerHTML = 'Sub-rede acionada: <strong>' + pendingSnapshot.subnetworkActivated + '</strong>'
        }

        if (pendingSnapshot.chosenMacro) {
            subnetLabel.innerHTML = 'Macro: <strong>' + pendingSnapshot.chosenMacro + '</strong> &middot; Sub-rede: <strong>'
                + (pendingSnapshot.subnetworkActivated || '--') + '</strong>'
        }
    }
}

function setStatus(label, running) {
    statusPill.textContent = label

    if (running) {
        statusPill.classList.add('running')
    } else {
        statusPill.classList.remove('running')
    }
}

function renderScoreboard() {
    const entries = Object.entries(liveScores).sort((a, b) => b[1] - a[1])
    scoreboard.innerHTML = ''

    for (const [playerId, score] of entries) {
        const li = document.createElement('li')
        li.innerHTML = '<span class="player">' + playerId + '</span><span class="score">' + Number(score).toFixed(0) + '</span>'
        scoreboard.appendChild(li)
    }
}

function addHistoryEntry({ label, sub }) {
    const li = document.createElement('li')
    const text = document.createElement('span')
    text.textContent = label
    li.appendChild(text)

    if (sub) {
        const small = document.createElement('small')
        small.textContent = sub
        li.appendChild(small)
    }

    history.prepend(li)

    while (history.children.length > 50) {
        history.removeChild(history.lastChild)
    }
}
