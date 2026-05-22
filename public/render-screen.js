import { getLang, t } from './i18n/index.js'

const STRUCTURE_SPRITE_SIZE = 64
const UNIT_SPRITE_SIZE = 64
const RECENT_DAMAGE_MS = 650
const RECENT_BUILD_MS = 1200
const RECENT_ATTACK_MS = 520
const STRUCTURE_SPRITE_FRAMES = {
    castle: 0,
    mine: 1,
    library: 2,
    archer: 3,
    catapult: 4,
    barracks: 5,
}
const UNIT_SPRITE_FRAMES = {
    herald: 0,
    soldier: 1,
}
const renderAssets = {
    terrainImage: createImageAsset('/img/terrain.png'),
    structureSpriteSheet: createImageAsset('/img/icons_game.png'),
    unitSpriteSheet: createImageAsset('/img/units_game.png'),
}

export function preloadRenderAssets() {
    return renderAssets
}

function createImageAsset(src) {
    if (typeof Image === 'undefined') {
        return null
    }

    const image = new Image()
    image.src = src
    return image
}

export function setupScreen(canvas, game) {
    const { screen: { width, height, pixelsPerFields } } = game.state
    canvas.width = width * pixelsPerFields
    canvas.height = height * pixelsPerFields

    if (canvas.style) {
        canvas.style.aspectRatio = width + ' / ' + height
    }

    if (canvas.setAttribute) {
        canvas.setAttribute('aria-label', t('canvas.mapLabel', { width, height }))
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
    drawUnitOrders(context, game, currentPlayerId)
    drawBuildRanges(context, game, uiState, currentPlayerId)
    drawSelection(context, game, uiState, currentPlayerId)
    drawRanges(context, game, uiState)
    drawRememberedStructures(context, game)
    drawStructures(context, game)
    drawUnits(context, game)
    drawPlayers(context, game, currentPlayerId)
    drawProjectiles(context, game)
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

    if (!drawTerrainImage(context, canvasWidth, canvasHeight)) {
        context.fillStyle = '#8da464'
        context.fillRect(0, 0, canvasWidth, canvasHeight)
    }

    const roadMap = buildRoadMap(game.state)
    drawTerrainTiles(context, game.state, roadMap)
    drawTerrainGrid(context, width, height, pixelsPerFields, canvasWidth, canvasHeight)
}

function drawTerrainImage(context, canvasWidth, canvasHeight) {
    const terrainImage = renderAssets.terrainImage

    if (!isImageReady(terrainImage) || typeof context.drawImage !== 'function') {
        return false
    }

    context.drawImage(terrainImage, 0, 0, canvasWidth, canvasHeight)
    return true
}

function drawTerrainTiles(context, state, roadMap) {
    const { width, height, pixelsPerFields } = state.screen

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            if (roadMap.has(tileKey(x, y))) {
                drawRoadTile(context, x, y, pixelsPerFields, getRoadMask(roadMap, x, y))
            } else {
                drawGrassTile(context, x, y, pixelsPerFields)
            }
        }
    }
}

function drawGrassTile(context, tileX, tileY, size) {
    const x = tileX * size
    const y = tileY * size
    const patches = tileHash(tileX, tileY, 3) > 0.58 ? 2 : 1

    context.save()
    context.fillStyle = 'rgba(77, 113, 54, 0.22)'
    for (let index = 0; index < patches; index += 1) {
        const px = x + size * (0.18 + tileHash(tileX, tileY, index + 7) * 0.64)
        const py = y + size * (0.18 + tileHash(tileX, tileY, index + 17) * 0.64)
        context.beginPath()
        context.moveTo(px, py)
        context.lineTo(px + size * 0.10, py - size * 0.08)
        context.lineTo(px + size * 0.18, py)
        context.strokeStyle = 'rgba(77, 113, 54, 0.24)'
        context.lineWidth = Math.max(1, size * 0.035)
        context.stroke()
    }
    context.restore()
}

function drawRoadTile(context, tileX, tileY, size, mask) {
    const x = tileX * size
    const y = tileY * size
    const roadWidth = size * 0.62
    const edge = (size - roadWidth) / 2
    const centerStart = edge
    const centerEnd = size - edge

    context.save()
    context.fillStyle = '#bd8650'

    if (mask === 0) {
        roundedFillRect(context, x + edge, y + edge, roadWidth, roadWidth, size * 0.16)
    } else {
        roundedFillRect(context, x + centerStart, y + centerStart, roadWidth, roadWidth, size * 0.12)
        if (mask & 1) context.fillRect(x + edge, y, roadWidth, centerEnd)
        if (mask & 2) context.fillRect(x + centerStart, y + edge, centerEnd, roadWidth)
        if (mask & 4) context.fillRect(x + edge, y + centerStart, roadWidth, centerEnd)
        if (mask & 8) context.fillRect(x, y + edge, centerEnd, roadWidth)
    }

    context.fillStyle = 'rgba(244, 220, 174, 0.34)'
    for (let index = 0; index < 4; index += 1) {
        const px = x + size * (0.12 + tileHash(tileX, tileY, index + 31) * 0.76)
        const py = y + size * (0.12 + tileHash(tileX, tileY, index + 41) * 0.76)
        context.beginPath()
        context.ellipse(px, py, size * 0.035, size * 0.022, tileHash(tileX, tileY, index + 51) * Math.PI, 0, Math.PI * 2)
        context.fill()
    }

    context.strokeStyle = 'rgba(96, 72, 42, 0.22)'
    context.lineWidth = Math.max(1, size * 0.04)
    context.strokeRect(x + edge * 0.45, y + edge * 0.45, size - edge * 0.9, size - edge * 0.9)
    context.restore()
}

function roundedFillRect(context, x, y, width, height, radius) {
    context.beginPath()
    context.moveTo(x + radius, y)
    context.lineTo(x + width - radius, y)
    context.quadraticCurveTo(x + width, y, x + width, y + radius)
    context.lineTo(x + width, y + height - radius)
    context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
    context.lineTo(x + radius, y + height)
    context.quadraticCurveTo(x, y + height, x, y + height - radius)
    context.lineTo(x, y + radius)
    context.quadraticCurveTo(x, y, x + radius, y)
    context.fill()
}

function buildRoadMap(state) {
    const roads = new Set()
    const ownedStructures = Object.values(state.structures || {})
        .filter(structure => structure.ownerId)
        .sort((first, second) => getStructureWeight(first.type) - getStructureWeight(second.type)
            || first.y - second.y
            || first.x - second.x)
    const byOwner = new Map()

    for (const structure of ownedStructures) {
        if (!byOwner.has(structure.ownerId)) {
            byOwner.set(structure.ownerId, [])
        }
        byOwner.get(structure.ownerId).push(structure)
    }

    for (const structures of byOwner.values()) {
        const castle = structures.find(structure => structure.type === 'castle')
        if (!castle) {
            continue
        }

        const connected = [castle]
        roads.add(tileKey(castle.x, castle.y))

        const targets = structures
            .filter(structure => structure.structureId !== castle.structureId)
            .sort((first, second) => distance(castle, first) - distance(castle, second))

        for (const target of targets) {
            const anchor = getNearestRoadAnchor(connected, target)
            addRoadPath(roads, anchor, target)
            connected.push(target)
        }
    }

    return roads
}

function getNearestRoadAnchor(anchors, target) {
    return anchors.reduce((nearest, candidate) => {
        return distance(candidate, target) < distance(nearest, target) ? candidate : nearest
    }, anchors[0])
}

function addRoadPath(roads, from, to) {
    let x = from.x
    let y = from.y
    const horizontalFirst = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y)

    roads.add(tileKey(x, y))

    if (horizontalFirst) {
        x = addRoadAxis(roads, x, y, to.x, 'x')
        y = addRoadAxis(roads, x, y, to.y, 'y')
    } else {
        y = addRoadAxis(roads, x, y, to.y, 'y')
        x = addRoadAxis(roads, x, y, to.x, 'x')
    }
}

function addRoadAxis(roads, x, y, target, axis) {
    const current = axis === 'x' ? x : y
    const step = Math.sign(target - current)

    if (step === 0) {
        return current
    }

    let value = current
    while (value !== target) {
        value += step
        const nextX = axis === 'x' ? value : x
        const nextY = axis === 'y' ? value : y
        roads.add(tileKey(nextX, nextY))
    }

    return value
}

function getRoadMask(roads, x, y) {
    let mask = 0
    if (roads.has(tileKey(x, y - 1))) mask |= 1
    if (roads.has(tileKey(x + 1, y))) mask |= 2
    if (roads.has(tileKey(x, y + 1))) mask |= 4
    if (roads.has(tileKey(x - 1, y))) mask |= 8
    return mask
}

function tileKey(x, y) {
    return x + ',' + y
}

function tileHash(x, y, salt = 0) {
    let value = ((x + 101) * 374761393 + (y + 97) * 668265263 + salt * 1442695041) >>> 0
    value = ((value ^ (value >>> 13)) * 1274126177) >>> 0
    return (value >>> 0) / 4294967295
}

function drawTerrainGrid(context, width, height, pixelsPerFields, canvasWidth, canvasHeight) {
    context.strokeStyle = 'rgba(60, 52, 42, 0.16)'
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

function drawUnitOrders(context, game, currentPlayerId) {
    const player = game.state.players[currentPlayerId]

    if (!player) {
        return
    }

    const { pixelsPerFields } = game.state.screen

    for (const unit of Object.values(game.state.units || {})) {
        if (unit.ownerId !== currentPlayerId || !unit.order) {
            continue
        }

        const target = getOrderTarget(game.state, unit.order)

        if (!target) {
            continue
        }

        drawOrderPath(context, unit, target, pixelsPerFields, player.color)
    }
}

function getOrderTarget(state, order) {
    if (!order) {
        return null
    }

    if (order.type === 'move' && Number.isFinite(order.x) && Number.isFinite(order.y)) {
        return { x: order.x, y: order.y, kind: 'move' }
    }

    if (order.type === 'capture') {
        const structure = state.structures?.[order.structureId] || state.memory?.structures?.[order.structureId]
        return structure ? { ...structure, kind: 'capture' } : null
    }

    return null
}

function drawOrderPath(context, unit, target, size, color) {
    const startX = (unit.x + 0.5) * size
    const startY = (unit.y + 0.5) * size
    const targetX = (target.x + 0.5) * size
    const targetY = (target.y + 0.5) * size

    context.save()
    context.strokeStyle = hexToRgba(color, 0.48)
    context.lineWidth = Math.max(1, size * 0.055)
    if (typeof context.setLineDash === 'function') {
        context.setLineDash([Math.max(2, size * 0.18), Math.max(2, size * 0.14)])
    }
    context.beginPath()
    context.moveTo(startX, startY)
    context.lineTo(targetX, targetY)
    context.stroke()
    if (typeof context.setLineDash === 'function') {
        context.setLineDash([])
    }
    drawOrderMarker(context, targetX, targetY, size, color, target.kind)
    context.restore()
}

function drawOrderMarker(context, centerX, centerY, size, color, kind) {
    const radius = size * 0.28

    context.fillStyle = hexToRgba(color, kind === 'capture' ? 0.20 : 0.16)
    context.strokeStyle = hexToRgba(color, 0.86)
    context.lineWidth = Math.max(1, size * 0.055)

    if (kind === 'capture') {
        context.beginPath()
        context.moveTo(centerX, centerY - radius)
        context.lineTo(centerX + radius, centerY)
        context.lineTo(centerX, centerY + radius)
        context.lineTo(centerX - radius, centerY)
        context.closePath()
        context.fill()
        context.stroke()
        context.beginPath()
        context.arc(centerX, centerY, radius * 0.34, 0, Math.PI * 2)
        context.stroke()
        return
    }

    context.beginPath()
    context.arc(centerX, centerY, radius, 0, Math.PI * 2)
    context.fill()
    context.stroke()
    context.beginPath()
    context.moveTo(centerX, centerY - radius * 0.85)
    context.lineTo(centerX, centerY + radius * 0.85)
    context.lineTo(centerX + radius * 0.58, centerY + radius * 0.38)
    context.stroke()
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
    const selectedActor = getActorAt(game.state, uiState.selectedTile.x, uiState.selectedTile.y)
    const placementStatus = selectedStructure
        ? null
        : getPlacementStatus(game.state, currentPlayer, uiState)
    const color = getSelectionColor(placementStatus)

    drawSelectionMarker(context, x, y, pixelsPerFields, color)

    if (selectedActor) {
        drawSelectionRing(context, x + pixelsPerFields * 0.5, y + pixelsPerFields * 0.64, pixelsPerFields, color.stroke)
    } else if (selectedStructure) {
        drawSelectionRing(context, x + pixelsPerFields * 0.5, y + pixelsPerFields * 0.72, pixelsPerFields, color.stroke)
    }
}

function drawSelectionMarker(context, x, y, size, color) {
    const inset = Math.max(2, size * 0.08)
    const corner = Math.max(4, size * 0.26)

    context.save()
    context.fillStyle = color.fill
    context.strokeStyle = color.stroke
    context.lineWidth = Math.max(1.5, size * 0.045)
    context.fillRect(x + inset, y + inset, size - inset * 2, size - inset * 2)

    context.beginPath()
    context.moveTo(x + inset, y + inset + corner)
    context.lineTo(x + inset, y + inset)
    context.lineTo(x + inset + corner, y + inset)
    context.moveTo(x + size - inset - corner, y + inset)
    context.lineTo(x + size - inset, y + inset)
    context.lineTo(x + size - inset, y + inset + corner)
    context.moveTo(x + size - inset, y + size - inset - corner)
    context.lineTo(x + size - inset, y + size - inset)
    context.lineTo(x + size - inset - corner, y + size - inset)
    context.moveTo(x + inset + corner, y + size - inset)
    context.lineTo(x + inset, y + size - inset)
    context.lineTo(x + inset, y + size - inset - corner)
    context.stroke()
    context.restore()
}

function drawSelectionRing(context, centerX, centerY, size, color) {
    context.save()
    context.strokeStyle = color
    context.fillStyle = hexToRgba(color, 0.12)
    context.lineWidth = Math.max(1.5, size * 0.055)
    context.beginPath()
    context.ellipse(centerX, centerY, size * 0.36, size * 0.16, 0, 0, Math.PI * 2)
    context.fill()
    context.stroke()
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

    if (!drawStructureSprite(context, structure.type, x + padding, y + padding, size, color)) {
        if (structure.type === 'castle') {
            drawCastle(context, x + padding, y + padding, size, color)
        } else if (structure.type === 'mine') {
            drawMine(context, x + padding, y + padding, size, color)
        } else if (structure.type === 'library') {
            drawLibrary(context, x + padding, y + padding, size, color)
        } else if (structure.type === 'archer') {
            drawArcher(context, x + padding, y + padding, size, color)
        } else if (structure.type === 'catapult') {
            drawCatapult(context, x + padding, y + padding, size, color)
        } else if (structure.type === 'barracks') {
            drawBarracks(context, x + padding, y + padding, size, color)
        }
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
        drawStructureStateEffects(context, structure, x, y, pixelsPerFields, color)
        drawBars(context, x, y, pixelsPerFields, structure)
        drawCaptureProgress(context, game, structure, x, y)
    }

    context.restore()
}

function drawStructureSprite(context, type, x, y, size, color) {
    const frame = STRUCTURE_SPRITE_FRAMES[type]
    const spriteSheet = renderAssets.structureSpriteSheet

    if (frame === undefined || !isImageReady(spriteSheet) || typeof context.drawImage !== 'function') {
        return false
    }

    context.save()
    context.fillStyle = color
    context.fillRect(x, y, size, size)
    context.drawImage(
        spriteSheet,
        frame * STRUCTURE_SPRITE_SIZE,
        0,
        STRUCTURE_SPRITE_SIZE,
        STRUCTURE_SPRITE_SIZE,
        x,
        y,
        size,
        size,
    )
    context.restore()
    return true
}

function isImageReady(image) {
    return Boolean(image && image.complete && image.naturalWidth !== 0)
}

function setRenderAssetsForTests(assets = {}) {
    renderAssets.terrainImage = assets.terrainImage || null
    renderAssets.structureSpriteSheet = assets.structureSpriteSheet || null
    renderAssets.unitSpriteSheet = assets.unitSpriteSheet || null
}

function drawCastle(context, x, y, size, color) {
    context.fillStyle = color
    context.fillRect(x, y + size * 0.25, size, size * 0.75)
    context.fillRect(x + size * 0.12, y, size * 0.18, size * 0.32)
    context.fillRect(x + size * 0.41, y, size * 0.18, size * 0.32)
    context.fillRect(x + size * 0.70, y, size * 0.18, size * 0.32)
    context.strokeRect(x, y + size * 0.25, size, size * 0.75)
}

function drawMine(context, x, y, size, color) {
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

function drawLibrary(context, x, y, size, color) {
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

function drawArcher(context, x, y, size, color) {
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

function drawCatapult(context, x, y, size, color) {
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

function drawBarracks(context, x, y, size, color) {
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

function drawStructureStateEffects(context, structure, x, y, size, color) {
    drawStructureLevelPips(context, x, y, size, structure.level, color)
    drawRecentBuildDust(context, x, y, size, structure.createdAt, Date.now(), structure.disabled)
    drawDamageFlash(context, x, y, size, structure.lastDamagedAt, Date.now())
}

function drawStructureLevelPips(context, x, y, size, level, color) {
    const count = clamp(Math.floor(Number(level) || 1), 1, 5)
    const pipSize = Math.max(2, size * 0.105)
    const gap = Math.max(1, size * 0.045)
    const totalWidth = count * pipSize + (count - 1) * gap
    const startX = x + size - totalWidth - Math.max(2, size * 0.10)
    const startY = y + size - pipSize - Math.max(2, size * 0.11)

    context.save()
    context.fillStyle = hexToRgba(color, 0.88)
    context.strokeStyle = 'rgba(37, 34, 31, 0.55)'
    context.lineWidth = 1
    for (let index = 0; index < count; index += 1) {
        const pipX = startX + index * (pipSize + gap)
        context.fillRect(pipX, startY, pipSize, pipSize)
        context.strokeRect(pipX, startY, pipSize, pipSize)
    }
    context.restore()
}

function drawRecentBuildDust(context, x, y, size, createdAt, now, disabled) {
    if (disabled) {
        return
    }

    const progress = getRecentEventProgress(createdAt, now, RECENT_BUILD_MS)

    if (progress <= 0) {
        return
    }

    context.save()
    context.fillStyle = 'rgba(226, 196, 139, ' + (0.36 * progress).toFixed(3) + ')'
    context.strokeStyle = 'rgba(96, 72, 42, ' + (0.32 * progress).toFixed(3) + ')'
    context.lineWidth = Math.max(1, size * 0.035)

    for (let index = 0; index < 6; index += 1) {
        const hashX = tileHash(Math.floor(x / size), Math.floor(y / size), index + 71)
        const hashY = tileHash(Math.floor(x / size), Math.floor(y / size), index + 83)
        const dustSize = Math.max(2, size * (0.06 + hashX * 0.05))
        const dustX = x + size * (0.08 + hashX * 0.84)
        const dustY = y + size * (0.10 + hashY * 0.80)
        context.fillRect(dustX, dustY, dustSize, dustSize)
    }

    context.beginPath()
    context.moveTo(x + size * 0.16, y + size * 0.82)
    context.lineTo(x + size * 0.84, y + size * 0.18)
    context.moveTo(x + size * 0.16, y + size * 0.18)
    context.lineTo(x + size * 0.84, y + size * 0.82)
    context.stroke()
    context.restore()
}

function drawDamageFlash(context, x, y, size, damagedAt, now) {
    const progress = getRecentEventProgress(damagedAt, now, RECENT_DAMAGE_MS)

    if (progress <= 0) {
        return false
    }

    context.save()
    context.fillStyle = 'rgba(255, 245, 220, ' + (0.24 * progress).toFixed(3) + ')'
    context.fillRect(x, y, size, size)
    context.strokeStyle = 'rgba(209, 73, 91, ' + (0.72 * progress).toFixed(3) + ')'
    context.lineWidth = Math.max(1.5, size * 0.065)
    context.strokeRect(x + 2, y + 2, size - 4, size - 4)
    context.restore()
    return true
}

function getRecentEventProgress(timestamp, now, duration) {
    const eventAt = Number(timestamp)
    const current = Number(now)

    if (!Number.isFinite(eventAt) || !Number.isFinite(current) || eventAt <= 0 || duration <= 0) {
        return 0
    }

    const age = current - eventAt

    if (age < 0 || age > duration) {
        return 0
    }

    return 1 - age / duration
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
        const x = unit.x * pixelsPerFields
        const y = unit.y * pixelsPerFields

        context.save()
        if (!drawUnitSprite(context, unit.type, x, y, pixelsPerFields, owner?.color || '#2f2a25')) {
            drawFallbackUnit(context, unit, owner, pixelsPerFields)
        }

        drawDamageFlash(context, x, y, pixelsPerFields, unit.lastDamagedAt, Date.now())
        drawBars(context, x, y, pixelsPerFields, unit)
        context.restore()
    }
}

function drawUnitSprite(context, type, x, y, size, ownerColor) {
    const frame = UNIT_SPRITE_FRAMES[type]
    const spriteSheet = renderAssets.unitSpriteSheet

    if (frame === undefined || !isImageReady(spriteSheet) || typeof context.drawImage !== 'function') {
        return false
    }

    context.save()
    context.fillStyle = hexToRgba(ownerColor, 0.32)
    context.beginPath()
    context.ellipse(x + size * 0.5, y + size * 0.82, size * 0.32, size * 0.12, 0, 0, Math.PI * 2)
    context.fill()
    context.drawImage(
        spriteSheet,
        frame * UNIT_SPRITE_SIZE,
        0,
        UNIT_SPRITE_SIZE,
        UNIT_SPRITE_SIZE,
        x,
        y,
        size,
        size,
    )
    context.restore()
    return true
}

function drawFallbackUnit(context, unit, owner, pixelsPerFields) {
    const x = (unit.x + 0.5) * pixelsPerFields
    const y = (unit.y + 0.5) * pixelsPerFields
    const radius = pixelsPerFields * 0.32

    context.fillStyle = owner ? owner.color : '#2f2a25'
    context.strokeStyle = '#2f2a25'
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)
    context.fill()
    context.stroke()
    context.fillStyle = '#f6f0d8'

    if (unit.type === 'herald') {
        context.beginPath()
        context.moveTo(x, y - radius * 0.62)
        context.lineTo(x + radius * 0.54, y + radius * 0.46)
        context.lineTo(x - radius * 0.54, y + radius * 0.46)
        context.closePath()
        context.fill()
    } else {
        context.fillRect(x - radius * 0.35, y - radius * 0.2, radius * 0.7, radius * 0.4)
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
        drawDamageFlash(context, player.x * pixelsPerFields, player.y * pixelsPerFields, pixelsPerFields, player.lastDamagedAt, Date.now())
        drawBars(context, player.x * pixelsPerFields, player.y * pixelsPerFields, pixelsPerFields, player)
        context.restore()
    }
}

function drawProjectiles(context, game) {
    const now = Date.now()
    const sources = [
        ...Object.values(game.state.structures || {}),
        ...Object.values(game.state.units || {}),
    ]

    for (const source of sources) {
        if (!source.lastAttackTarget) {
            continue
        }

        const progress = getRecentEventProgress(source.lastAttackAt, now, RECENT_ATTACK_MS)

        if (progress <= 0) {
            continue
        }

        drawProjectile(context, source, source.lastAttackTarget, game.state.screen.pixelsPerFields, progress, getAttackSourceOwnerColor(game.state, source))
    }
}

function drawProjectile(context, source, target, size, progress, color) {
    if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) {
        return false
    }

    const startX = (source.x + 0.5) * size
    const startY = (source.y + 0.5) * size
    const targetX = (target.x + 0.5) * size
    const targetY = (target.y + 0.5) * size
    const phase = clamp(1 - progress, 0, 1)

    if (source.type === 'soldier' || source.type === 'herald') {
        drawMeleeStrike(context, targetX, targetY, size, phase, color)
        return true
    }

    if (source.type === 'catapult') {
        drawStoneProjectile(context, startX, startY, targetX, targetY, size, phase)
    } else {
        drawArrowProjectile(context, startX, startY, targetX, targetY, size, phase, color)
    }

    if (phase > 0.58) {
        drawImpactPulse(context, targetX, targetY, size, (phase - 0.58) / 0.42, color)
    }

    return true
}

function drawArrowProjectile(context, startX, startY, targetX, targetY, size, phase, color) {
    const x = startX + (targetX - startX) * phase
    const y = startY + (targetY - startY) * phase
    const angle = Math.atan2(targetY - startY, targetX - startX)

    context.save()
    context.translate(x, y)
    context.rotate(angle)
    context.strokeStyle = hexToRgba(color, 0.86)
    context.fillStyle = '#f6f0d8'
    context.lineWidth = Math.max(1.5, size * 0.05)
    context.beginPath()
    context.moveTo(-size * 0.24, 0)
    context.lineTo(size * 0.18, 0)
    context.stroke()
    context.beginPath()
    context.moveTo(size * 0.22, 0)
    context.lineTo(size * 0.04, -size * 0.08)
    context.lineTo(size * 0.04, size * 0.08)
    context.closePath()
    context.fill()
    context.restore()
}

function drawStoneProjectile(context, startX, startY, targetX, targetY, size, phase) {
    const arcHeight = Math.sin(phase * Math.PI) * size * 0.72
    const x = startX + (targetX - startX) * phase
    const y = startY + (targetY - startY) * phase - arcHeight

    context.save()
    context.fillStyle = '#5e5951'
    context.strokeStyle = 'rgba(37, 34, 31, 0.72)'
    context.lineWidth = Math.max(1, size * 0.035)
    context.beginPath()
    context.arc(x, y, Math.max(2, size * 0.11), 0, Math.PI * 2)
    context.fill()
    context.stroke()
    context.restore()
}

function drawMeleeStrike(context, targetX, targetY, size, phase, color) {
    const alpha = Math.sin(phase * Math.PI)

    context.save()
    context.strokeStyle = hexToRgba(color, 0.74 * alpha)
    context.lineWidth = Math.max(2, size * 0.075)
    context.beginPath()
    context.arc(targetX, targetY, size * 0.30, -0.8 + phase * 0.7, 0.95 + phase * 0.7)
    context.stroke()
    drawImpactPulse(context, targetX, targetY, size, alpha, color)
    context.restore()
}

function drawImpactPulse(context, targetX, targetY, size, intensity, color) {
    const alpha = clamp(intensity, 0, 1)

    if (alpha <= 0) {
        return
    }

    context.save()
    context.strokeStyle = hexToRgba(color, 0.42 * (1 - alpha * 0.35))
    context.fillStyle = 'rgba(255, 245, 220, ' + (0.14 * alpha).toFixed(3) + ')'
    context.lineWidth = Math.max(1, size * 0.045)
    context.beginPath()
    context.ellipse(targetX, targetY, size * (0.16 + alpha * 0.16), size * (0.10 + alpha * 0.10), 0, 0, Math.PI * 2)
    context.fill()
    context.stroke()
    context.restore()
}

function getAttackSourceOwnerColor(state, source) {
    return state.players?.[source.ownerId]?.color || '#d4af37'
}
function structureLabel(type) {
    return translatedLabel('structure.' + type + '.label', type)
}

function researchLabel(type) {
    return translatedLabel('research.' + type + '.label', type)
}

function unitLabel(type) {
    return translatedLabel('unit.' + type + '.label', type)
}

function translatedLabel(key, fallback) {
    const value = t(key)
    return value === key ? formatFallbackLabel(fallback) : value
}

function formatFallbackLabel(value) {
    const text = String(value || '')
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : text
}

function currentLocale() {
    return getLang() === 'en' ? 'en-US' : 'pt-BR'
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
            <div class="panel-title">${t('lobby.room')} ${escapeHtml(game.state.hostKey)}</div>
            ${winner ? `<div class="winner">${t('hud.winner', { name: escapeHtml(winner.gamerTag) })}</div>` : ''}
            <div class="resource-grid">
                <span><b>${formatNumber(currentPlayer.gold)}</b><small>${t('hud.resource.gold')}</small></span>
                <span><b>${formatNumber(currentPlayer.wisdom)}</b><small>${t('hud.resource.wisdom')}</small></span>
                <span><b>${currentPlayer.alive ? t('hud.alive') : t('hud.dead')}</b><small>${t('hud.castle')}</small></span>
                <span><b>${playerStatusLabel(currentPlayer)}</b><small>${t('hud.unit')}</small></span>
                <span><b>${formatNumber(getPlayerStructureCount(game.state, currentPlayerId))}</b><small>${t('hud.structures')}</small></span>
                <span><b>${formatNumber(getPlayerUnitCount(game.state, currentPlayerId))}</b><small>${t('hud.units')}</small></span>
            </div>
            ${captureStatusPanel(captureStatus)}
            ${castleUpgradeGatePanel(game, currentPlayerId)}
        </section>
        <section class="panel">
            <div class="panel-title">${t('hud.build')}</div>
            <div class="button-grid">
                ${buildButton(game, currentPlayer, uiState, 'mine')}
                ${buildButton(game, currentPlayer, uiState, 'library')}
                ${buildButton(game, currentPlayer, uiState, 'archer')}
                ${buildButton(game, currentPlayer, uiState, 'catapult')}
                ${buildButton(game, currentPlayer, uiState, 'barracks')}
            </div>
        </section>
        <section class="panel">
            <div class="panel-title">${t('hud.research')}</div>
            <div class="button-grid">
                ${researchButton(game, currentPlayer, 'archer')}
                ${researchButton(game, currentPlayer, 'catapult')}
                ${researchButton(game, currentPlayer, 'barracks')}
            </div>
        </section>
        <section class="panel">
            <div class="panel-title">${t('hud.actions')}</div>
            ${autoplayButton(game, currentPlayer)}
            ${selectedPanel(game, currentPlayer, selectedStructure, uiState)}
            ${npcButton(game, currentPlayer, 'soldier')}
        </section>
        <section class="panel">
            <div class="panel-title">${t('hud.players')}</div>
            <div class="players-list">${playersList(game, currentPlayerId)}</div>
            ${addAiButton(game)}
        </section>
        <section class="panel log-panel">
            <div class="panel-title">${t('hud.events')}</div>
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
                <span>${t('hud.capturing', { name: escapeHtml(captureStatus.label) })}</span>
                <strong>${captureStatus.percent}%</strong>
            </div>
            <div class="capture-meter" aria-hidden="true">
                <span style="width: ${captureStatus.percent}%"></span>
            </div>
            <small>${t('hud.captureOrderActiveUntilDone', { elapsed: captureStatus.elapsedSeconds, total: captureStatus.totalSeconds })}</small>
        </div>
    `
}

function castleUpgradeGatePanel(game, playerId) {
    const gate = game.state.catalog.limits?.castleUpgrade

    if (!gate) {
        return ''
    }

    const player = game.state.players[playerId]
    const castle = player ? game.state.structures[player.castleId] : null

    if (!castle) {
        return ''
    }

    const percent = Math.max(0, Math.min(100, Math.round((gate.averageLevel / Math.max(gate.required, 0.0001)) * 100)))
    const stateClass = gate.ready ? 'castle-gate-ready' : 'castle-gate-closed'
    const label = gate.ready
        ? t('hud.castleReady', { level: castle.level })
        : t('hud.castleGate', {
            level: castle.level,
            avg: gate.averageLevel.toFixed(2),
            required: gate.required.toFixed(2),
            ratio: Math.round(gate.ratio * 100),
        })

    return `
        <div class="castle-gate ${stateClass}">
            <div class="castle-gate-header">
                <span>${label}</span>
                <strong>${percent}%</strong>
            </div>
            <div class="castle-gate-meter" aria-hidden="true">
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
    const totalMs = Math.max(1, game.state.config.captureDurationMs || 1)
    const progressMs = Math.min(totalMs, structure.capture.progressMs)
    const percent = Math.min(100, Math.round((progressMs / totalMs) * 100))

    return {
        label: structureLabel(structure.type),
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
    const label = structureLabel(type)

    return `<button class="${className}" type="button" data-action="build" data-structure="${type}" aria-label="${escapeHtml(t('action.buildAria', { name: label, cost: catalog.cost }))}"${title} ${enabled ? '' : 'disabled'}><span>${t('action.build', { name: label, cost: catalog.cost })}</span>${limitLabel}</button>`
}

function researchButton(game, player, recipe) {
    const research = game.state.catalog.research[recipe]
    const disabledReason = getResearchDisabledReason(game, player, recipe)
    const enabled = !disabledReason
    const title = disabledReason ? ` title="${escapeHtml(disabledReason)}"` : ''
    const label = researchLabel(recipe)
    const cost = research ? research.cost : ''
    const ariaLabel = research ? t('action.researchAria', { name: label, cost }) : label
    const buttonLabel = research ? t('action.research', { name: label, cost }) : label

    return `<button class="action-button" type="button" data-action="research" data-recipe="${recipe}" aria-label="${escapeHtml(ariaLabel)}"${title} ${enabled ? '' : 'disabled'}>${escapeHtml(buttonLabel)}</button>`
}

function getResearchDisabledReason(game, player, recipe) {
    const research = game.state.catalog.research[recipe]
    const label = researchLabel(recipe)

    if (!research) {
        return t('error.researchUnavailable')
    }

    if (!player || !player.alive) {
        return t('error.playerOut')
    }

    if (player.autoplay) {
        return t('error.autoplayOn')
    }

    if (player.unlocked[recipe]) {
        return t('error.researchDone', { name: label })
    }

    const libraryLevel = highestStructureLevel(game.state, player.playerId, 'library')

    if (libraryLevel < research.requiresLibraryLevel) {
        return t('error.researchRequiresLibrary', { name: label, level: research.requiresLibraryLevel })
    }

    if (player.wisdom < research.cost) {
        return t('error.notEnoughWisdom', { cost: research.cost })
    }

    return ''
}

function npcButton(game, player, npcType) {
    const npc = game.state.catalog.npcs[npcType]
    const disabledReason = getSpawnNpcDisabledReason(game, player, npcType)
    const enabled = !disabledReason
    const title = disabledReason ? ` title="${escapeHtml(disabledReason)}"` : ''
    const label = unitLabel(npcType)
    const cost = npc ? npc.cost : ''
    const ariaLabel = npc ? t('action.sendUnitAria', { name: label, cost }) : label
    const buttonLabel = npc ? t('action.sendUnit', { name: label, cost }) : label

    return `<button class="action-button" type="button" data-action="spawn-npc" data-npc="${npcType}" aria-label="${escapeHtml(ariaLabel)}"${title} ${enabled ? '' : 'disabled'}>${escapeHtml(buttonLabel)}</button>`
}

function autoplayButton(game, player) {
    const disabledReason = getAutoplayDisabledReason(game, player)
    const enabled = !disabledReason
    const nextEnabled = !(player && player.autoplay)
    const label = nextEnabled ? t('action.autoplayOn') : t('action.autoplayOff')
    const title = disabledReason || (nextEnabled ? t('action.autoplayOnTitle') : t('action.autoplayOffTitle'))
    const activeClass = nextEnabled ? '' : ' active'

    return '<button class="action-button autoplay-button' + activeClass + '" type="button" data-action="toggle-autoplay" data-enabled="' + String(nextEnabled) + '" title="' + escapeHtml(title) + '" aria-label="' + escapeHtml(label) + '" ' + (enabled ? '' : 'disabled') + '>' + escapeHtml(label) + '</button>'
}

function getAutoplayDisabledReason(game, player) {
    if (!game.state.hostKey) {
        return t('error.notInRoom')
    }

    if (game.state.winnerId) {
        return t('error.matchEnded')
    }

    if (!player || !player.alive) {
        return t('error.playerOut')
    }

    if (player.isAi) {
        return t('error.aiControlsPlayer')
    }

    return ''
}

function addAiButton(game) {
    const disabledReason = getAddAiDisabledReason(game)
    const enabled = !disabledReason
    const title = disabledReason || t('action.addAiTitle')

    return '<button class="action-button add-ai-button" type="button" data-action="add-ai" title="' + escapeHtml(title) + '" aria-label="' + escapeHtml(t('action.addAiTitle')) + '" ' + (enabled ? '' : 'disabled') + '>' + escapeHtml(t('action.addAi')) + '</button>'
}

function getAddAiDisabledReason(game) {
    if (!game.state.hostKey) {
        return t('error.notInRoom')
    }

    if (game.state.winnerId) {
        return t('error.matchEnded')
    }

    if (Object.keys(game.state.players || {}).length >= game.state.config.maxPlayersPerRoom) {
        return t('error.roomFull')
    }

    return ''
}

function getSpawnNpcDisabledReason(game, player, npcType) {
    const npc = game.state.catalog.npcs[npcType]

    if (!npc) {
        return t('error.npcUnavailable')
    }

    if (!player || !player.alive) {
        return t('error.playerOut')
    }

    if (player.autoplay) {
        return t('error.autoplayOn')
    }

    if (!player.unlocked.barracks) {
        return t('error.requiresBarracksResearch')
    }

    if (highestStructureLevel(game.state, player.playerId, 'barracks') <= 0) {
        return t('error.requiresActiveBarracks')
    }

    if (player.gold < npc.cost) {
        return t('error.notEnoughGold', { cost: npc.cost })
    }

    return ''
}

function selectedPanel(game, player, selectedStructure, uiState) {
    if (!uiState.selectedTile) {
        return '<div class="selected-empty">' + escapeHtml(t('hud.noneSelected')) + '</div>'
    }

    if (!selectedStructure) {
        const placementStatus = getPlacementStatus(game.state, player, uiState)

        return `
            <div class="selected-empty">
                <span>${escapeHtml(t('hud.tile', { x: uiState.selectedTile.x, y: uiState.selectedTile.y }))}</span>
                <span class="tile-status tile-status-${placementStatus.status}">${escapeHtml(placementStatus.message)}</span>
            </div>
        `
    }

    const catalog = game.state.catalog.structures[selectedStructure.type] || { cost: 0 }
    const label = structureLabel(selectedStructure.type)
    const owner = selectedStructure.ownerId ? game.state.players[selectedStructure.ownerId] : null
    const ownerName = owner ? owner.gamerTag : t('hud.neutral')
    const upgradeCost = Math.round(catalog.cost * (1.5 ** selectedStructure.level))
    const castle = player ? game.state.structures[player.castleId] : null
    const castleUpgradeGate = game.state.catalog.limits?.castleUpgrade || null
    const upgradeDisabledReason = getUpgradeDisabledReason(player, selectedStructure, upgradeCost, castle ? castle.level : 0, castleUpgradeGate)
    const canUpgrade = !upgradeDisabledReason
    const title = upgradeDisabledReason ? ` title="${escapeHtml(upgradeDisabledReason)}"` : ''
    const orderStatus = player.order && player.order.type === 'capture' && player.order.structureId === selectedStructure.structureId
        ? '<span class="tile-status tile-status-available">' + escapeHtml(t('hud.captureOrderActive')) + '</span>'
        : ''

    if (selectedStructure.remembered) {
        return `
            <div class="selected-card remembered-card">
                <strong>${escapeHtml(label)} N${selectedStructure.level}</strong>
                <span>${escapeHtml(ownerName)}</span>
                <span class="tile-status tile-status-blocked">${escapeHtml(t('hud.lastSeen'))}</span>
                ${orderStatus}
            </div>
        `
    }

    return `
        <div class="selected-card">
            <strong>${escapeHtml(label)} N${selectedStructure.level}</strong>
            <span>${escapeHtml(ownerName)}</span>
            <span>${formatNumber(Math.max(0, Math.ceil(selectedStructure.integrity)))}/${formatNumber(selectedStructure.maxIntegrity)} ${t('hud.hp')}</span>
            <span>${formatNumber(Math.max(0, Math.ceil(selectedStructure.barrier)))}/${formatNumber(selectedStructure.maxBarrier)} ${t('hud.barrier')}</span>
            ${orderStatus}
            <button class="action-button" type="button" data-action="upgrade" data-structure-id="${selectedStructure.structureId}" aria-label="${escapeHtml(t('action.upgradeAria', { name: label, cost: upgradeCost }))}"${title} ${canUpgrade ? '' : 'disabled'}>${escapeHtml(t('action.upgrade'))} ${upgradeCost}</button>
        </div>
    `
}

function getUpgradeDisabledReason(player, structure, cost, castleLevel = 0, castleUpgradeGate = null) {
    if (structure.ownerId !== player.playerId) {
        return t('error.selectOwnedStructure')
    }

    if (player.autoplay) {
        return t('error.autoplayOn')
    }

    if (structure.disabled) {
        return t('error.structureDisabled')
    }

    if (structure.type !== 'castle' && structure.level >= castleLevel) {
        return t('error.structureLevelCastleCap')
    }

    if (structure.type === 'castle' && castleUpgradeGate && !castleUpgradeGate.ready) {
        return t('error.castleUpgradeBlocked', {
            avg: castleUpgradeGate.averageLevel.toFixed(2),
            required: castleUpgradeGate.required.toFixed(2),
            ratio: Math.round(castleUpgradeGate.ratio * 100),
        })
    }

    if (player.gold < cost) {
        return t('error.notEnoughGold', { cost })
    }

    return ''
}

function playersList(game, currentPlayerId) {
    return Object.values(game.state.players)
        .sort((first, second) => Number(second.playerId === currentPlayerId) - Number(first.playerId === currentPlayerId)
            || (first.joinedAt || 0) - (second.joinedAt || 0)
            || first.gamerTag.localeCompare(second.gamerTag))
        .map(player => {
            const status = player.isAi ? t('hud.ai') : player.autoplay ? t('hud.autoplay') : player.connected === false ? t('hud.offline') : playerStatusLabel(player)

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
        return '<div class="log-line muted">' + escapeHtml(t('hud.noEvents')) + '</div>'
    }

    return game.state.logs
        .map(log => `<div class="log-line"><time>${formatLogTime(log.at)}</time><span>${escapeHtml(log.message)}</span></div>`)
        .join('')
}

function getBuildDisabledReason(game, player, uiState, type) {
    const catalog = game.state.catalog.structures[type]

    if (!catalog) {
        return t('error.structureUnavailable')
    }

    if (!uiState.selectedTile) {
        return t('error.selectTile')
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

    if (player.gold < catalog.cost) {
        return t('error.notEnoughGold', { cost: catalog.cost })
    }

    return ''
}

function getBuildRequirementMessage(game, player, type) {
    const limitReason = getBuildLimitDisabledReason(game, type)

    if (limitReason) {
        return limitReason
    }

    const catalog = game.state.catalog.structures[type]
    const label = structureLabel(type)

    if (catalog.requiresCastleLevel) {
        return t('error.requiresCastleLevel', { level: catalog.requiresCastleLevel })
    }

    if (catalog.requiresResearch) {
        return t('error.researchFirst', { name: researchLabel(catalog.requiresResearch) })
    }

    if (!player.unlocked[type]) {
        return t('error.notUnlocked', { name: label })
    }

    return t('error.genericUnavailable', { name: label })
}

function getPlacementStatus(state, player, uiState) {
    if (!uiState.selectedTile) {
        return {
            status: 'blocked',
            message: t('error.selectTile'),
        }
    }

    const tile = uiState.selectedTile

    if (!player || !player.alive) {
        return {
            status: 'blocked',
            message: t('error.playerOut'),
        }
    }

    if (player.autoplay) {
        return {
            status: 'blocked',
            message: t('error.autoplayOn'),
        }
    }

    if (!isInsideMap(state, tile.x, tile.y)) {
        return {
            status: 'blocked',
            message: t('error.invalidTile'),
        }
    }

    if (getStructureAt(state, tile.x, tile.y) || getActorAt(state, tile.x, tile.y)) {
        return {
            status: 'blocked',
            message: t('error.tileOccupied'),
        }
    }

    if (!isNearOwnedAnchor(state, player.playerId, tile.x, tile.y)) {
        return {
            status: 'blocked',
            message: t('error.outOfBuildRange'),
        }
    }

    return {
        status: 'available',
        message: t('status.tileAvailable'),
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

    if (type === 'mine') {
        return true
    }

    if (catalog.requiresCastleLevel) {
        const castle = game.state.structures[player.castleId]
        return castle && castle.level >= catalog.requiresCastleLevel
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
        return t('error.limitOver', { current: limit.current, max: limit.max })
    }

    return t('error.limitFull', { current: limit.current, max: limit.max })
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
        return t('hud.out')
    }

    if (player.respawnAt) {
        return t('hud.respawn', { seconds: getRespawnRemainingSeconds(player) })
    }

    if (!player.activeCaptureUnitId && player.avatarDeployed === false) {
        return t('hud.ready')
    }

    if (typeof player.integrity === 'number' && typeof player.maxIntegrity === 'number') {
        return Math.max(0, Math.ceil(player.integrity)) + '/' + player.maxIntegrity + ' ' + t('hud.hp')
    }

    return t('hud.active')
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
        castle: 1,
        mine: 2,
        library: 3,
        barracks: 4,
        archer: 5,
        catapult: 6,
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

    return date.toLocaleTimeString(currentLocale(), {
        hour: '2-digit',
        minute: '2-digit',
    })
}

function formatNumber(value) {
    const number = Number(value)

    if (!Number.isFinite(number)) {
        return '0'
    }

    return Math.floor(number).toLocaleString(currentLocale())
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
    castleUpgradeGatePanel,
    getCaptureStatus,
    drawFogOverlay,
    drawTerrainImage,
    drawTerrainGrid,
    drawUnitOrders,
    getOrderTarget,
    drawOrderPath,
    drawOrderMarker,
    drawSelectionMarker,
    drawSelectionRing,
    drawTerrainTiles,
    drawGrassTile,
    drawRoadTile,
    buildRoadMap,
    getRoadMask,
    tileKey,
    drawStructureSprite,
    drawUnitSprite,
    drawStructureStateEffects,
    drawStructureLevelPips,
    drawRecentBuildDust,
    drawDamageFlash,
    getRecentEventProgress,
    drawProjectiles,
    drawProjectile,
    drawArrowProjectile,
    drawStoneProjectile,
    drawMeleeStrike,
    drawImpactPulse,
    getAttackSourceOwnerColor,
    isImageReady,
    setRenderAssetsForTests,
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
