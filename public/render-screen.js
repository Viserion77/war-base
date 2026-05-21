export function setupScreen(canvas, game) {
    const { screen: { width, height, pixelsPerFields } } = game.state
    canvas.width = width * pixelsPerFields
    canvas.height = height * pixelsPerFields

    if (canvas.style) {
        canvas.style.aspectRatio = width + ' / ' + height
    }

    if (canvas.setAttribute) {
        canvas.setAttribute('aria-label', 'Mapa da partida com ' + width + ' por ' + height + ' campos')
    }
}

export function getTileFromCanvasEvent(event, canvas, game) {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const x = Math.floor((event.clientX - rect.left) * scaleX / game.state.screen.pixelsPerFields)
    const y = Math.floor((event.clientY - rect.top) * scaleY / game.state.screen.pixelsPerFields)
    const { width, height } = game.state.screen

    return {
        x: clamp(x, 0, width - 1),
        y: clamp(y, 0, height - 1),
    }
}

export function getStructureAt(state, x, y) {
    const visibleStructure = Object.values(state.structures || {}).find(structure => structure.x === x && structure.y === y)

    if (visibleStructure) {
        return visibleStructure
    }

    const rememberedStructure = Object.values(state.memory?.structures || {})
        .find(structure => structure.x === x && structure.y === y)

    return rememberedStructure ? { ...rememberedStructure, remembered: true } : null
}

export default function renderScreen(screen, hud, game, requestAnimationFrame, currentPlayerId, uiState) {
    const context = screen.getContext('2d')
    const { screen: { width, height, pixelsPerFields } } = game.state

    context.clearRect(0, 0, width * pixelsPerFields, height * pixelsPerFields)
    drawTerrain(context, game)
    drawBuildRanges(context, game, uiState, currentPlayerId)
    drawSelection(context, game, uiState, currentPlayerId)
    drawRanges(context, game, uiState)
    drawRememberedStructures(context, game)
    drawStructures(context, game)
    drawUnits(context, game)
    drawPlayers(context, game, currentPlayerId)
    drawFogOverlay(context, game)
    updateHud(hud, game, currentPlayerId, uiState)

    requestAnimationFrame(() => {
        renderScreen(screen, hud, game, requestAnimationFrame, currentPlayerId, uiState)
    })
}

function drawTerrain(context, game) {
    const { screen: { width, height, pixelsPerFields } } = game.state
    const canvasWidth = width * pixelsPerFields
    const canvasHeight = height * pixelsPerFields

    context.fillStyle = '#f4efe4'
    context.fillRect(0, 0, canvasWidth, canvasHeight)

    context.fillStyle = '#e8dcc4'
    for (let y = 0; y < height; y += 2) {
        for (let x = (y % 4 === 0 ? 0 : 1); x < width; x += 4) {
            context.fillRect(x * pixelsPerFields, y * pixelsPerFields, pixelsPerFields, pixelsPerFields)
        }
    }

    context.strokeStyle = 'rgba(60, 52, 42, 0.12)'
    context.lineWidth = 1

    for (let x = 0; x <= width; x += 1) {
        context.beginPath()
        context.moveTo(x * pixelsPerFields + 0.5, 0)
        context.lineTo(x * pixelsPerFields + 0.5, canvasHeight)
        context.stroke()
    }

    for (let y = 0; y <= height; y += 1) {
        context.beginPath()
        context.moveTo(0, y * pixelsPerFields + 0.5)
        context.lineTo(canvasWidth, y * pixelsPerFields + 0.5)
        context.stroke()
    }
}

function drawBuildRanges(context, game, uiState, currentPlayerId) {
    if (!uiState.selectedTile || getSelectedStructure(game.state, uiState)) {
        return
    }

    const player = game.state.players[currentPlayerId]

    if (!player || !player.alive) {
        return
    }

    const anchors = Object.values(game.state.structures || {})
        .filter(structure => structure.ownerId === player.playerId && !structure.disabled)

    if (!anchors.length) {
        return
    }

    const { pixelsPerFields } = game.state.screen
    const range = game.state.config.buildRange * pixelsPerFields

    context.save()
    context.fillStyle = hexToRgba(player.color, 0.045)
    context.strokeStyle = hexToRgba(player.color, 0.22)
    context.lineWidth = 1.5
    context.setLineDash([4, 4])

    for (const structure of anchors) {
        context.beginPath()
        context.arc(
            (structure.x + 0.5) * pixelsPerFields,
            (structure.y + 0.5) * pixelsPerFields,
            range,
            0,
            Math.PI * 2,
        )
        context.fill()
        context.stroke()
    }

    context.restore()
}

function drawSelection(context, game, uiState, currentPlayerId) {
    if (!uiState.selectedTile) {
        return
    }

    const { pixelsPerFields } = game.state.screen
    const x = uiState.selectedTile.x * pixelsPerFields
    const y = uiState.selectedTile.y * pixelsPerFields
    const currentPlayer = game.state.players[currentPlayerId]
    const selectedStructure = getSelectedStructure(game.state, uiState)
    const placementStatus = selectedStructure
        ? null
        : getPlacementStatus(game.state, currentPlayer, uiState)
    const color = getSelectionColor(placementStatus)

    context.save()
    context.fillStyle = color.fill
    context.strokeStyle = color.stroke
    context.lineWidth = 2
    context.fillRect(x + 2, y + 2, pixelsPerFields - 4, pixelsPerFields - 4)
    context.strokeRect(x + 2, y + 2, pixelsPerFields - 4, pixelsPerFields - 4)
    context.restore()
}

function drawRanges(context, game, uiState) {
    const selectedStructure = getSelectedStructure(game.state, uiState)

    if (!selectedStructure) {
        return
    }

    const catalog = game.state.catalog.structures[selectedStructure.type]
    const range = catalog.attackRange || game.state.config.captureRange
    const { pixelsPerFields } = game.state.screen

    context.save()
    context.fillStyle = selectedStructure.ownerId ? 'rgba(27, 154, 170, 0.08)' : 'rgba(120, 120, 120, 0.10)'
    context.strokeStyle = selectedStructure.ownerId ? 'rgba(27, 154, 170, 0.26)' : 'rgba(120, 120, 120, 0.32)'
    context.beginPath()
    context.arc(
        (selectedStructure.x + 0.5) * pixelsPerFields,
        (selectedStructure.y + 0.5) * pixelsPerFields,
        range * pixelsPerFields,
        0,
        Math.PI * 2,
    )
    context.fill()
    context.stroke()
    context.restore()
}

function drawRememberedStructures(context, game) {
    const remembered = Object.values(game.state.memory?.structures || {})
        .filter(structure => !game.state.structures?.[structure.structureId])
        .filter(structure => !isTileVisible(game.state.fogMask, structure.x, structure.y))
        .sort((first, second) => getStructureWeight(first.type) - getStructureWeight(second.type))

    for (const structure of remembered) {
        drawStructure(context, game, { ...structure, remembered: true }, true)
    }
}

function drawStructures(context, game) {
    const structures = Object.values(game.state.structures || {})
        .sort((first, second) => getStructureWeight(first.type) - getStructureWeight(second.type))

    for (const structure of structures) {
        drawStructure(context, game, structure)
    }
}

function drawStructure(context, game, structure, remembered = false) {
    const { pixelsPerFields } = game.state.screen
    const x = structure.x * pixelsPerFields
    const y = structure.y * pixelsPerFields
    const owner = game.state.players[structure.ownerId]
    const color = remembered ? getRememberedStructureColor(owner?.color) : structure.disabled ? '#8c8c8c' : owner ? owner.color : '#9b8a70'
    const padding = Math.max(2, pixelsPerFields * 0.12)
    const size = pixelsPerFields - padding * 2

    context.save()
    context.globalAlpha = remembered ? 0.5 : structure.disabled ? 0.68 : 1
    context.lineWidth = 1.5
    context.strokeStyle = '#25221f'
    context.fillStyle = color

    if (structure.type === 'base') {
        drawBase(context, x + padding, y + padding, size, color)
    } else if (structure.type === 'cover') {
        drawCover(context, x + padding, y + padding, size, color)
    } else if (structure.type === 'taraque') {
        drawTaraque(context, x + padding, y + padding, size, color)
    } else if (structure.type === 'per') {
        drawPer(context, x + padding, y + padding, size, color)
    } else if (structure.type === 'hef') {
        drawHef(context, x + padding, y + padding, size, color)
    } else if (structure.type === 'tujai') {
        drawTujai(context, x + padding, y + padding, size, color)
    }

    if (!remembered && structure.disabled) {
        context.strokeStyle = '#2f2a25'
        context.beginPath()
        context.moveTo(x + 4, y + 4)
        context.lineTo(x + pixelsPerFields - 4, y + pixelsPerFields - 4)
        context.moveTo(x + pixelsPerFields - 4, y + 4)
        context.lineTo(x + 4, y + pixelsPerFields - 4)
        context.stroke()
    }

    if (!remembered) {
        drawBars(context, x, y, pixelsPerFields, structure)
        drawCaptureProgress(context, game, structure, x, y)
    }

    context.restore()
}

function drawBase(context, x, y, size, color) {
    context.fillStyle = color
    context.fillRect(x, y + size * 0.25, size, size * 0.75)
    context.fillRect(x + size * 0.12, y, size * 0.18, size * 0.32)
    context.fillRect(x + size * 0.41, y, size * 0.18, size * 0.32)
    context.fillRect(x + size * 0.70, y, size * 0.18, size * 0.32)
    context.strokeRect(x, y + size * 0.25, size, size * 0.75)
}

function drawCover(context, x, y, size, color) {
    context.fillStyle = color
    context.beginPath()
    context.moveTo(x + size * 0.5, y)
    context.lineTo(x + size, y + size * 0.5)
    context.lineTo(x + size * 0.5, y + size)
    context.lineTo(x, y + size * 0.5)
    context.closePath()
    context.fill()
    context.stroke()
    context.fillStyle = '#2f2a25'
    context.fillRect(x + size * 0.36, y + size * 0.36, size * 0.28, size * 0.28)
}

function drawTaraque(context, x, y, size, color) {
    context.fillStyle = color
    context.beginPath()
    context.moveTo(x + size * 0.2, y + size)
    context.lineTo(x + size * 0.38, y + size * 0.15)
    context.lineTo(x + size * 0.62, y + size * 0.15)
    context.lineTo(x + size * 0.8, y + size)
    context.closePath()
    context.fill()
    context.stroke()
    context.fillStyle = '#f6f0d8'
    context.fillRect(x + size * 0.34, y + size * 0.55, size * 0.32, size * 0.18)
}

function drawPer(context, x, y, size, color) {
    context.fillStyle = color
    context.fillRect(x + size * 0.2, y + size * 0.55, size * 0.6, size * 0.28)
    context.fillRect(x + size * 0.42, y + size * 0.2, size * 0.16, size * 0.45)
    context.strokeRect(x + size * 0.2, y + size * 0.55, size * 0.6, size * 0.28)
    context.strokeStyle = '#2f2a25'
    context.beginPath()
    context.moveTo(x + size * 0.5, y + size * 0.25)
    context.lineTo(x + size * 0.88, y + size * 0.12)
    context.stroke()
}

function drawHef(context, x, y, size, color) {
    context.fillStyle = color
    context.beginPath()
    context.arc(x + size * 0.5, y + size * 0.55, size * 0.32, 0, Math.PI * 2)
    context.fill()
    context.stroke()
    context.fillStyle = '#f6f0d8'
    context.beginPath()
    context.arc(x + size * 0.5, y + size * 0.55, size * 0.14, 0, Math.PI * 2)
    context.fill()
}

function drawTujai(context, x, y, size, color) {
    context.fillStyle = color
    context.fillRect(x + size * 0.12, y + size * 0.35, size * 0.76, size * 0.58)
    context.beginPath()
    context.moveTo(x + size * 0.08, y + size * 0.36)
    context.lineTo(x + size * 0.5, y + size * 0.08)
    context.lineTo(x + size * 0.92, y + size * 0.36)
    context.closePath()
    context.fill()
    context.stroke()
    context.fillStyle = '#2f2a25'
    context.fillRect(x + size * 0.38, y + size * 0.55, size * 0.24, size * 0.38)
}

function drawCaptureProgress(context, game, structure, x, y) {
    if (!structure.capture) {
        return
    }

    const progress = structure.capture.progressMs / game.state.config.captureDurationMs
    const { pixelsPerFields } = game.state.screen

    context.fillStyle = 'rgba(246, 189, 22, 0.28)'
    context.fillRect(x, y + pixelsPerFields - 4, pixelsPerFields * Math.min(1, progress), 4)
}

function drawBars(context, x, y, size, entity) {
    const health = Math.max(0, entity.integrity) / entity.maxIntegrity
    const shield = entity.maxBarrier > 0 ? Math.max(0, entity.barrier) / entity.maxBarrier : 0

    context.fillStyle = 'rgba(0, 0, 0, 0.35)'
    context.fillRect(x + 2, y - 5, size - 4, 3)
    context.fillStyle = '#d1495b'
    context.fillRect(x + 2, y - 5, (size - 4) * health, 3)

    if (entity.maxBarrier > 0) {
        context.fillStyle = 'rgba(0, 0, 0, 0.30)'
        context.fillRect(x + 2, y - 9, size - 4, 3)
        context.fillStyle = '#2a9d8f'
        context.fillRect(x + 2, y - 9, (size - 4) * shield, 3)
    }
}

function drawUnits(context, game) {
    const { pixelsPerFields } = game.state.screen

    for (const unitId in game.state.units) {
        const unit = game.state.units[unitId]
        const owner = game.state.players[unit.ownerId]
        const x = (unit.x + 0.5) * pixelsPerFields
        const y = (unit.y + 0.5) * pixelsPerFields
        const radius = pixelsPerFields * 0.32

        context.save()
        context.fillStyle = owner ? owner.color : '#2f2a25'
        context.strokeStyle = '#2f2a25'
        context.beginPath()
        context.arc(x, y, radius, 0, Math.PI * 2)
        context.fill()
        context.stroke()
        context.fillStyle = '#f6f0d8'

        if (unit.type === 'capturer') {
            context.beginPath()
            context.moveTo(x, y - radius * 0.62)
            context.lineTo(x + radius * 0.54, y + radius * 0.46)
            context.lineTo(x - radius * 0.54, y + radius * 0.46)
            context.closePath()
            context.fill()
        } else {
            context.fillRect(x - radius * 0.35, y - radius * 0.2, radius * 0.7, radius * 0.4)
        }

        drawBars(context, unit.x * pixelsPerFields, unit.y * pixelsPerFields, pixelsPerFields, unit)
        context.restore()
    }
}

function drawFogOverlay(context, game) {
    const fogMask = game.state.fogMask

    if (!Array.isArray(fogMask)) {
        return
    }

    const { screen: { width, height, pixelsPerFields } } = game.state

    context.save()

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            if (isTileVisible(fogMask, x, y)) {
                continue
            }

            context.fillStyle = hasRememberedStructureAt(game.state, x, y)
                ? 'rgba(47, 51, 55, 0.30)'
                : 'rgba(22, 25, 28, 0.55)'
            context.fillRect(x * pixelsPerFields, y * pixelsPerFields, pixelsPerFields, pixelsPerFields)
        }
    }

    context.restore()
}

function hasRememberedStructureAt(state, x, y) {
    return Object.values(state.memory?.structures || {})
        .some(structure => structure.x === x && structure.y === y && !state.structures?.[structure.structureId])
}

function isTileVisible(fogMask, x, y) {
    if (!Array.isArray(fogMask)) {
        return true
    }

    return Boolean(fogMask[y] && fogMask[y][x])
}

function getRememberedStructureColor(color) {
    if (!/^#[0-9a-f]{6}$/i.test(color || '')) {
        return '#77736a'
    }

    const red = parseInt(color.slice(1, 3), 16)
    const green = parseInt(color.slice(3, 5), 16)
    const blue = parseInt(color.slice(5, 7), 16)
    const gray = Math.round((red + green + blue) / 3)
    const mix = value => Math.round(gray * 0.55 + value * 0.45).toString(16).padStart(2, '0')

    return '#' + mix(red) + mix(green) + mix(blue)
}

function drawPlayers(context, game, currentPlayerId) {
    const { pixelsPerFields } = game.state.screen

    for (const playerId in game.state.players) {
        const player = game.state.players[playerId]

        if (!isAvatarAvailable(player)) {
            continue
        }

        const centerX = (player.x + 0.5) * pixelsPerFields
        const centerY = (player.y + 0.5) * pixelsPerFields
        const radius = pixelsPerFields * 0.42

        context.save()
        context.fillStyle = player.color
        context.strokeStyle = playerId === currentPlayerId ? '#ffffff' : '#2f2a25'
        context.lineWidth = playerId === currentPlayerId ? 3 : 1.5
        context.beginPath()
        context.moveTo(centerX, centerY - radius)
        context.lineTo(centerX + radius, centerY + radius * 0.72)
        context.lineTo(centerX - radius, centerY + radius * 0.72)
        context.closePath()
        context.fill()
        context.stroke()
        drawBars(context, player.x * pixelsPerFields, player.y * pixelsPerFields, pixelsPerFields, player)
        context.restore()
    }
}

function updateHud(hud, game, currentPlayerId, uiState) {
    if (!hud) {
        return
    }

    const currentPlayer = game.state.players[currentPlayerId]

    if (!game.state.hostKey || !currentPlayer) {
        if (hud.__lastHtml !== '') {
            hud.innerHTML = ''
            hud.__lastHtml = ''
        }
        return
    }

    const selectedStructure = getSelectedStructure(game.state, uiState)
    const winner = game.state.winnerId ? game.state.players[game.state.winnerId] : null
    const captureStatus = getCaptureStatus(game, currentPlayerId)

    const hudHtml = `
        <section class="panel room-panel">
            <div class="panel-title">Sala ${escapeHtml(game.state.hostKey)}</div>
            ${winner ? `<div class="winner">Vencedor: ${escapeHtml(winner.gamerTag)}</div>` : ''}
            <div class="resource-grid">
                <span><b>${formatNumber(currentPlayer.coal)}</b><small>Carvao</small></span>
                <span><b>${formatNumber(currentPlayer.knowledge)}</b><small>Conhecimento</small></span>
                <span><b>${currentPlayer.alive ? 'Ativa' : 'Fora'}</b><small>Base</small></span>
                <span><b>${playerStatusLabel(currentPlayer)}</b><small>Unidade</small></span>
                <span><b>${formatNumber(getPlayerStructureCount(game.state, currentPlayerId))}</b><small>Estruturas</small></span>
                <span><b>${formatNumber(getPlayerUnitCount(game.state, currentPlayerId))}</b><small>Unidades</small></span>
            </div>
            ${captureStatusPanel(captureStatus)}
            ${baseUpgradeGatePanel(game, currentPlayerId)}
        </section>
        <section class="panel">
            <div class="panel-title">Construcoes</div>
            <div class="button-grid">
                ${buildButton(game, currentPlayer, uiState, 'cover')}
                ${buildButton(game, currentPlayer, uiState, 'taraque')}
                ${buildButton(game, currentPlayer, uiState, 'per')}
                ${buildButton(game, currentPlayer, uiState, 'hef')}
                ${buildButton(game, currentPlayer, uiState, 'tujai')}
            </div>
        </section>
        <section class="panel">
            <div class="panel-title">Pesquisa</div>
            <div class="button-grid">
                ${researchButton(game, currentPlayer, 'per')}
                ${researchButton(game, currentPlayer, 'hef')}
                ${researchButton(game, currentPlayer, 'tujai')}
            </div>
        </section>
        <section class="panel">
            <div class="panel-title">Acoes</div>
            ${autoplayButton(game, currentPlayer)}
            ${selectedPanel(game, currentPlayer, selectedStructure, uiState)}
            ${npcButton(game, currentPlayer, 'zunim')}
        </section>
        <section class="panel">
            <div class="panel-title">Jogadores</div>
            <div class="players-list">${playersList(game, currentPlayerId)}</div>
            ${addAiButton(game)}
        </section>
        <section class="panel log-panel">
            <div class="panel-title">Eventos</div>
            <div class="log-list">${logsList(game)}</div>
        </section>
    `

    if (hud.__lastHtml !== hudHtml) {
        hud.innerHTML = hudHtml
        hud.__lastHtml = hudHtml
    }
}

function captureStatusPanel(captureStatus) {
    if (!captureStatus) {
        return ''
    }

    return `
        <div class="capture-status">
            <div class="capture-status-header">
                <span>Capturando ${escapeHtml(captureStatus.label)}</span>
                <strong>${captureStatus.percent}%</strong>
            </div>
            <div class="capture-meter" aria-hidden="true">
                <span style="width: ${captureStatus.percent}%"></span>
            </div>
            <small>${captureStatus.elapsedSeconds}/${captureStatus.totalSeconds}s - ordem ativa ate concluir.</small>
        </div>
    `
}

function baseUpgradeGatePanel(game, playerId) {
    const gate = game.state.catalog.limits?.baseUpgrade

    if (!gate) {
        return ''
    }

    const player = game.state.players[playerId]
    const base = player ? game.state.structures[player.baseId] : null

    if (!base) {
        return ''
    }

    const percent = Math.max(0, Math.min(100, Math.round((gate.averageLevel / Math.max(gate.required, 0.0001)) * 100)))
    const stateClass = gate.ready ? 'base-gate-ready' : 'base-gate-closed'
    const label = gate.ready
        ? `Base lvl ${base.level} - pronto para upar`
        : `Base lvl ${base.level} - media ${gate.averageLevel.toFixed(2)} / ${gate.required.toFixed(2)} (${Math.round(gate.ratio * 100)}%)`

    return `
        <div class="base-gate ${stateClass}">
            <div class="base-gate-header">
                <span>${label}</span>
                <strong>${percent}%</strong>
            </div>
            <div class="base-gate-meter" aria-hidden="true">
                <span style="width: ${gate.ready ? 100 : percent}%"></span>
            </div>
        </div>
    `
}

function getCaptureStatus(game, playerId) {
    const captures = Object.values(game.state.structures || {})
        .filter(structure => structure.capture && structure.capture.playerId === playerId)
        .sort((first, second) => second.capture.progressMs - first.capture.progressMs)

    if (!captures.length) {
        return null
    }

    const structure = captures[0]
    const catalog = game.state.catalog.structures[structure.type]
    const totalMs = Math.max(1, game.state.config.captureDurationMs || 1)
    const progressMs = Math.min(totalMs, structure.capture.progressMs)
    const percent = Math.min(100, Math.round((progressMs / totalMs) * 100))

    return {
        label: catalog ? catalog.label : structure.type,
        percent,
        elapsedSeconds: Math.ceil(progressMs / 1000),
        totalSeconds: Math.ceil(totalMs / 1000),
    }
}

function buildButton(game, player, uiState, type) {
    const catalog = game.state.catalog.structures[type]
    const limit = getBuildLimit(game, type)
    const disabledReason = getBuildDisabledReason(game, player, uiState, type)
    const enabled = !disabledReason
    const title = disabledReason ? ` title="${escapeHtml(disabledReason)}"` : ''
    const limitClass = getBuildLimitClass(limit)
    const className = 'action-button build-button' + (limitClass ? ' ' + limitClass : '')
    const limitLabel = limit ? `<small class="build-limit">${limit.current}/${limit.max}</small>` : ''

    return `<button class="${className}" type="button" data-action="build" data-structure="${type}" aria-label="Construir ${escapeHtml(catalog.label)} por ${catalog.cost} carvoes"${title} ${enabled ? '' : 'disabled'}><span>${catalog.label} ${catalog.cost}</span>${limitLabel}</button>`
}

function researchButton(game, player, recipe) {
    const research = game.state.catalog.research[recipe]
    const disabledReason = getResearchDisabledReason(game, player, recipe)
    const enabled = !disabledReason
    const title = disabledReason ? ` title="${escapeHtml(disabledReason)}"` : ''
    const label = research ? research.label : recipe
    const cost = research ? ` ${research.cost}` : ''

    return `<button class="action-button" type="button" data-action="research" data-recipe="${recipe}" aria-label="Pesquisar ${escapeHtml(label)}${cost ? ' por' + cost + ' conhecimentos' : ''}"${title} ${enabled ? '' : 'disabled'}>${label}${cost}</button>`
}

function getResearchDisabledReason(game, player, recipe) {
    const research = game.state.catalog.research[recipe]

    if (!research) {
        return 'Pesquisa indisponivel.'
    }

    if (!player || !player.alive) {
        return 'Jogador fora da partida.'
    }

    if (player.autoplay) {
        return 'Autoplay ligado.'
    }

    if (player.unlocked[recipe]) {
        return `${research.label} ja pesquisada.`
    }

    const taraqueLevel = highestStructureLevel(game.state, player.playerId, 'taraque')

    if (taraqueLevel < research.requiresTaraqueLevel) {
        return `${research.label} requer Taraque nivel ${research.requiresTaraqueLevel}.`
    }

    if (player.knowledge < research.cost) {
        return `Conhecimento insuficiente: precisa de ${research.cost}.`
    }

    return ''
}

function npcButton(game, player, npcType) {
    const npc = game.state.catalog.npcs[npcType]
    const disabledReason = getSpawnNpcDisabledReason(game, player, npcType)
    const enabled = !disabledReason
    const title = disabledReason ? ` title="${escapeHtml(disabledReason)}"` : ''
    const label = npc ? npc.label : npcType
    const cost = npc ? ` ${npc.cost}` : ''

    return `<button class="action-button" type="button" data-action="spawn-npc" data-npc="${npcType}" aria-label="Enviar ${escapeHtml(label)}${cost ? ' por' + cost + ' carvoes' : ''}"${title} ${enabled ? '' : 'disabled'}>${label}${cost}</button>`
}

function autoplayButton(game, player) {
    const disabledReason = getAutoplayDisabledReason(game, player)
    const enabled = !disabledReason
    const nextEnabled = !(player && player.autoplay)
    const label = nextEnabled ? 'Ligar autoplay' : 'Desligar autoplay'
    const title = disabledReason || (nextEnabled ? 'IA assume seus comandos.' : 'Voltar ao controle manual.')
    const activeClass = nextEnabled ? '' : ' active'

    return '<button class="action-button autoplay-button' + activeClass + '" type="button" data-action="toggle-autoplay" data-enabled="' + String(nextEnabled) + '" title="' + escapeHtml(title) + '" aria-label="' + escapeHtml(label) + '" ' + (enabled ? '' : 'disabled') + '>' + escapeHtml(label) + '</button>'
}

function getAutoplayDisabledReason(game, player) {
    if (!game.state.hostKey) {
        return 'Entre em uma sala primeiro.'
    }

    if (game.state.winnerId) {
        return 'Partida encerrada.'
    }

    if (!player || !player.alive) {
        return 'Jogador fora da partida.'
    }

    if (player.isAi) {
        return 'IA ja controla este jogador.'
    }

    return ''
}

function addAiButton(game) {
    const disabledReason = getAddAiDisabledReason(game)
    const enabled = !disabledReason
    const title = disabledReason || 'Adicionar uma IA neural a esta sala.'

    return '<button class="action-button add-ai-button" type="button" data-action="add-ai" title="' + escapeHtml(title) + '" aria-label="Adicionar uma IA neural" ' + (enabled ? '' : 'disabled') + '>Adicionar IA</button>'
}

function getAddAiDisabledReason(game) {
    if (!game.state.hostKey) {
        return 'Entre em uma sala primeiro.'
    }

    if (game.state.winnerId) {
        return 'Partida encerrada.'
    }

    if (Object.keys(game.state.players || {}).length >= game.state.config.maxPlayersPerRoom) {
        return 'Sala cheia.'
    }

    return ''
}

function getSpawnNpcDisabledReason(game, player, npcType) {
    const npc = game.state.catalog.npcs[npcType]

    if (!npc) {
        return 'NPC indisponivel.'
    }

    if (!player || !player.alive) {
        return 'Jogador fora da partida.'
    }

    if (player.autoplay) {
        return 'Autoplay ligado.'
    }

    if (!player.unlocked.tujai) {
        return 'Pesquise Tujai primeiro.'
    }

    if (highestStructureLevel(game.state, player.playerId, 'tujai') <= 0) {
        return 'Construa uma Tujai ativa primeiro.'
    }

    if (player.coal < npc.cost) {
        return `Carvao insuficiente: precisa de ${npc.cost}.`
    }

    return ''
}

function selectedPanel(game, player, selectedStructure, uiState) {
    if (!uiState.selectedTile) {
        return '<div class="selected-empty">Nenhum terreno</div>'
    }

    if (!selectedStructure) {
        const placementStatus = getPlacementStatus(game.state, player, uiState)

        return `
            <div class="selected-empty">
                <span>Terreno ${uiState.selectedTile.x}, ${uiState.selectedTile.y}</span>
                <span class="tile-status tile-status-${placementStatus.status}">${escapeHtml(placementStatus.message)}</span>
            </div>
        `
    }

    const catalog = game.state.catalog.structures[selectedStructure.type]
    const owner = selectedStructure.ownerId ? game.state.players[selectedStructure.ownerId] : null
    const ownerName = owner ? owner.gamerTag : 'Neutro'
    const upgradeCost = Math.round(catalog.cost * (1.5 ** selectedStructure.level))
    const base = player ? game.state.structures[player.baseId] : null
    const baseUpgradeGate = game.state.catalog.limits?.baseUpgrade || null
    const upgradeDisabledReason = getUpgradeDisabledReason(player, selectedStructure, upgradeCost, base ? base.level : 0, baseUpgradeGate)
    const canUpgrade = !upgradeDisabledReason
    const title = upgradeDisabledReason ? ` title="${escapeHtml(upgradeDisabledReason)}"` : ''
    const captureDisabledReason = getCaptureDisabledReason(game, player, selectedStructure)
    const captureTitle = captureDisabledReason ? ' title="' + escapeHtml(captureDisabledReason) + '"' : ''
    const canCapture = !captureDisabledReason
    const captureButton = catalog.captureable
        ? '<button class="action-button" type="button" data-action="capture" data-structure-id="' + selectedStructure.structureId + '" aria-label="Iniciar captura de ' + escapeHtml(catalog.label) + '"' + captureTitle + ' ' + (canCapture ? '' : 'disabled') + '>Iniciar captura</button>'
        : ''
    const orderStatus = player.order && player.order.type === 'capture' && player.order.structureId === selectedStructure.structureId
        ? '<span class="tile-status tile-status-available">Ordem de captura ativa</span>'
        : ''

    if (selectedStructure.remembered) {
        return `
            <div class="selected-card remembered-card">
                <strong>${catalog.label} N${selectedStructure.level}</strong>
                <span>${escapeHtml(ownerName)}</span>
                <span class="tile-status tile-status-blocked">Ultimo avistamento</span>
                ${orderStatus}
                ${captureButton}
            </div>
        `
    }

    return `
        <div class="selected-card">
            <strong>${catalog.label} N${selectedStructure.level}</strong>
            <span>${escapeHtml(ownerName)}</span>
            <span>${formatNumber(Math.max(0, Math.ceil(selectedStructure.integrity)))}/${formatNumber(selectedStructure.maxIntegrity)} HP</span>
            <span>${formatNumber(Math.max(0, Math.ceil(selectedStructure.barrier)))}/${formatNumber(selectedStructure.maxBarrier)} barreira</span>
            ${orderStatus}
            <button class="action-button" type="button" data-action="upgrade" data-structure-id="${selectedStructure.structureId}" aria-label="Melhorar ${escapeHtml(catalog.label)} por ${upgradeCost} carvoes"${title} ${canUpgrade ? '' : 'disabled'}>Upgrade ${upgradeCost}</button>
            ${captureButton}
        </div>
    `
}

function getUpgradeDisabledReason(player, structure, cost, baseLevel = 0, baseUpgradeGate = null) {
    if (structure.ownerId !== player.playerId) {
        return 'Selecione uma construcao sua para upgrade.'
    }

    if (player.autoplay) {
        return 'Autoplay ligado.'
    }

    if (structure.disabled) {
        return 'Esta construcao esta desativada.'
    }

    if (structure.type !== 'base' && structure.level >= baseLevel) {
        return 'Bloqueado: nivel da estrutura ja igual ao nivel da Base.'
    }

    if (structure.type === 'base' && baseUpgradeGate && !baseUpgradeGate.ready) {
        return `Base bloqueada: media ${baseUpgradeGate.averageLevel.toFixed(2)} < ${baseUpgradeGate.required.toFixed(2)} (${Math.round(baseUpgradeGate.ratio * 100)}% do nivel atual).`
    }

    if (player.coal < cost) {
        return `Carvao insuficiente: precisa de ${cost}.`
    }

    return ''
}

function getCaptureDisabledReason(game, player, structure) {
    const catalog = game.state.catalog.structures[structure.type]

    if (!catalog || !catalog.captureable) {
        return 'Esta construcao nao pode ser capturada.'
    }

    if (!player || !player.alive) {
        return 'Jogador fora da partida.'
    }

    if (player.autoplay) {
        return 'Autoplay ligado.'
    }

    if (player.respawnAt) {
        return 'Avatar reaparece em ' + getRespawnRemainingSeconds(player) + 's.'
    }

    if (structure.ownerId === player.playerId && !structure.disabled) {
        return 'Esta construcao ja e sua.'
    }

    if (structure.ownerId === player.playerId && structure.disabled) {
        return 'Construcao sua desativada.'
    }

    if (player.order && player.order.type === 'capture' && player.order.structureId === structure.structureId) {
        return 'Ordem de captura ja ativa.'
    }

    return ''
}

function playersList(game, currentPlayerId) {
    return Object.values(game.state.players)
        .sort((first, second) => Number(second.playerId === currentPlayerId) - Number(first.playerId === currentPlayerId)
            || (first.joinedAt || 0) - (second.joinedAt || 0)
            || first.gamerTag.localeCompare(second.gamerTag))
        .map(player => {
            const status = player.isAi ? 'IA' : player.autoplay ? 'Autoplay' : player.connected === false ? 'offline' : playerStatusLabel(player)

            return `
                <div class="player-row ${player.playerId === currentPlayerId ? 'current' : ''} ${player.connected === false ? 'offline' : ''}">
                    <span class="player-dot" style="background:${player.color}"></span>
                    <span>${escapeHtml(player.gamerTag)}</span>
                    <small>${escapeHtml(status)}</small>
                </div>
            `
        })
        .join('')
}

function logsList(game) {
    if (!game.state.logs.length) {
        return '<div class="log-line muted">Sem eventos</div>'
    }

    return game.state.logs
        .map(log => `<div class="log-line"><time>${formatLogTime(log.at)}</time><span>${escapeHtml(log.message)}</span></div>`)
        .join('')
}

function getBuildDisabledReason(game, player, uiState, type) {
    const catalog = game.state.catalog.structures[type]

    if (!catalog) {
        return 'Construcao indisponivel.'
    }

    if (!uiState.selectedTile) {
        return 'Selecione um terreno.'
    }

    const placementStatus = getPlacementStatus(game.state, player, uiState)

    if (placementStatus.status !== 'available') {
        return placementStatus.message
    }

    const limitReason = getBuildLimitDisabledReason(game, type)

    if (limitReason) {
        return limitReason
    }

    if (!canBuild(game, player, type)) {
        return getBuildRequirementMessage(game, player, type)
    }

    if (player.coal < catalog.cost) {
        return `Carvao insuficiente: precisa de ${catalog.cost}.`
    }

    return ''
}

function getBuildRequirementMessage(game, player, type) {
    const limitReason = getBuildLimitDisabledReason(game, type)

    if (limitReason) {
        return limitReason
    }

    const catalog = game.state.catalog.structures[type]

    if (catalog.requiresBaseLevel) {
        return `Base nivel ${catalog.requiresBaseLevel} necessaria.`
    }

    if (catalog.requiresResearch) {
        const research = game.state.catalog.research[catalog.requiresResearch]
        const label = research ? research.label : catalog.requiresResearch

        return `Pesquise ${label} primeiro.`
    }

    if (!player.unlocked[type]) {
        return `${catalog.label} ainda nao liberada.`
    }

    return `${catalog.label} indisponivel.`
}

function getPlacementStatus(state, player, uiState) {
    if (!uiState.selectedTile) {
        return {
            status: 'blocked',
            message: 'Selecione um terreno.',
        }
    }

    const tile = uiState.selectedTile

    if (!player || !player.alive) {
        return {
            status: 'blocked',
            message: 'Jogador fora da partida.',
        }
    }

    if (player.autoplay) {
        return {
            status: 'blocked',
            message: 'Autoplay ligado.',
        }
    }

    if (!isInsideMap(state, tile.x, tile.y)) {
        return {
            status: 'blocked',
            message: 'Terreno invalido.',
        }
    }

    if (getStructureAt(state, tile.x, tile.y) || getActorAt(state, tile.x, tile.y)) {
        return {
            status: 'blocked',
            message: 'Terreno ocupado.',
        }
    }

    if (!isNearOwnedAnchor(state, player.playerId, tile.x, tile.y)) {
        return {
            status: 'blocked',
            message: 'Fora do alcance de construcao.',
        }
    }

    return {
        status: 'available',
        message: 'Terreno livre para construir.',
    }
}

function getSelectionColor(placementStatus) {
    if (!placementStatus) {
        return {
            fill: 'rgba(246, 189, 22, 0.18)',
            stroke: '#f6bd16',
        }
    }

    if (placementStatus.status === 'available') {
        return {
            fill: 'rgba(42, 157, 143, 0.18)',
            stroke: '#2a9d8f',
        }
    }

    return {
        fill: 'rgba(209, 73, 91, 0.18)',
        stroke: '#d1495b',
    }
}

function canBuild(game, player, type) {
    const catalog = game.state.catalog.structures[type]

    if (!catalog || !player) {
        return false
    }

    if (getBuildLimitDisabledReason(game, type)) {
        return false
    }

    if (type === 'cover') {
        return true
    }

    if (catalog.requiresBaseLevel) {
        const base = game.state.structures[player.baseId]
        return base && base.level >= catalog.requiresBaseLevel
    }

    if (catalog.requiresResearch) {
        return Boolean(player.unlocked[catalog.requiresResearch])
    }

    return Boolean(player.unlocked[type])
}

function getBuildLimit(game, type) {
    return game.state.catalog.limits?.[type] || null
}

function getBuildLimitClass(limit) {
    if (!limit) {
        return ''
    }

    if (limit.current > limit.max) {
        return 'limit-over'
    }

    if (limit.current === limit.max) {
        return 'limit-full'
    }

    return 'limit-open'
}

function getBuildLimitDisabledReason(game, type) {
    const limit = getBuildLimit(game, type)

    if (!limit || limit.current < limit.max) {
        return ''
    }

    if (limit.current > limit.max) {
        return `${limit.current}/${limit.max} - sem novos slots ate cair abaixo do limite.`
    }

    return `${limit.current}/${limit.max} - suba a Base.`
}

function highestStructureLevel(state, playerId, type) {
    return Object.values(state.structures || {})
        .filter(structure => structure.ownerId === playerId)
        .filter(structure => structure.type === type)
        .filter(structure => !structure.disabled)
        .reduce((highest, structure) => Math.max(highest, structure.level), 0)
}

function getSelectedStructure(state, uiState) {
    if (uiState.selectedStructureId && state.structures[uiState.selectedStructureId]) {
        return state.structures[uiState.selectedStructureId]
    }

    if (uiState.selectedStructureId && state.memory?.structures?.[uiState.selectedStructureId]) {
        return { ...state.memory.structures[uiState.selectedStructureId], remembered: true }
    }

    if (!uiState.selectedTile) {
        return null
    }

    return getStructureAt(state, uiState.selectedTile.x, uiState.selectedTile.y)
}

function getActorAt(state, x, y) {
    const player = Object.values(state.players || {})
        .find(candidate => isAvatarAvailable(candidate)
            && candidate.x === x
            && candidate.y === y)

    if (player) {
        return player
    }

    return Object.values(state.units || {})
        .find(unit => unit.x === x && unit.y === y) || null
}

function playerStatusLabel(player) {
    if (!player || !player.alive) {
        return 'fora'
    }

    if (player.respawnAt) {
        return 'respawn ' + getRespawnRemainingSeconds(player) + 's'
    }

    if (!player.activeCaptureUnitId && player.avatarDeployed === false) {
        return 'pronta'
    }

    if (typeof player.integrity === 'number' && typeof player.maxIntegrity === 'number') {
        return Math.max(0, Math.ceil(player.integrity)) + '/' + player.maxIntegrity + ' HP'
    }

    return 'ativa'
}

function getRespawnRemainingSeconds(player) {
    if (!player || !player.respawnAt) {
        return 0
    }

    return Math.max(0, Math.ceil((player.respawnAt - Date.now()) / 1000))
}

function isAvatarAvailable(player) {
    return Boolean(player && player.alive && player.avatarDeployed !== false && !player.respawnAt && player.integrity > 0)
}

function isNearOwnedAnchor(state, playerId, x, y) {
    return Object.values(state.structures || {})
        .filter(structure => structure.ownerId === playerId && !structure.disabled)
        .some(structure => distance(structure, { x, y }) <= state.config.buildRange)
}

function isInsideMap(state, x, y) {
    return x >= 0
        && x < state.screen.width
        && y >= 0
        && y < state.screen.height
}

function distance(first, second) {
    const dx = first.x - second.x
    const dy = first.y - second.y

    return Math.sqrt(dx * dx + dy * dy)
}

function getStructureWeight(type) {
    const weights = {
        base: 1,
        cover: 2,
        taraque: 3,
        tujai: 4,
        per: 5,
        hef: 6,
    }

    return weights[type] || 10
}

function getPlayerStructureCount(state, playerId) {
    return Object.values(state.structures || {})
        .filter(structure => structure.ownerId === playerId && !structure.disabled)
        .length
}

function getPlayerUnitCount(state, playerId) {
    return Object.values(state.units || {})
        .filter(unit => unit.ownerId === playerId)
        .length
}

function formatLogTime(timestamp) {
    if (!timestamp) {
        return ''
    }

    const date = new Date(timestamp)

    if (Number.isNaN(date.getTime())) {
        return ''
    }

    return date.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
    })
}

function formatNumber(value) {
    const number = Number(value)

    if (!Number.isFinite(number)) {
        return '0'
    }

    return Math.floor(number).toLocaleString('pt-BR')
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value))
}

function hexToRgba(color, alpha) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) {
        return "rgba(27, 154, 170, " + alpha + ")"
    }

    const red = parseInt(color.slice(1, 3), 16)
    const green = parseInt(color.slice(3, 5), 16)
    const blue = parseInt(color.slice(5, 7), 16)

    return "rgba(" + red + ", " + green + ", " + blue + ", " + alpha + ")"
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;')
}


export const __renderTestables = {
    captureStatusPanel,
    baseUpgradeGatePanel,
    getCaptureStatus,
    drawFogOverlay,
    hasRememberedStructureAt,
    isTileVisible,
    getRememberedStructureColor,
    buildButton,
    researchButton,
    getResearchDisabledReason,
    npcButton,
    autoplayButton,
    getAutoplayDisabledReason,
    addAiButton,
    getAddAiDisabledReason,
    getSpawnNpcDisabledReason,
    selectedPanel,
    getUpgradeDisabledReason,
    getCaptureDisabledReason,
    playersList,
    logsList,
    getBuildDisabledReason,
    getBuildRequirementMessage,
    getPlacementStatus,
    getSelectionColor,
    canBuild,
    getBuildLimit,
    getBuildLimitClass,
    getBuildLimitDisabledReason,
    highestStructureLevel,
    getSelectedStructure,
    getActorAt,
    playerStatusLabel,
    getRespawnRemainingSeconds,
    isAvatarAvailable,
    isNearOwnedAnchor,
    isInsideMap,
    distance,
    getStructureWeight,
    getPlayerStructureCount,
    getPlayerUnitCount,
    formatLogTime,
    formatNumber,
    clamp,
    hexToRgba,
    escapeHtml,
}
