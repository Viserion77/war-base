const SCREEN = {
    width: 48,
    height: 30,
    pixelsPerFields: 18,
}

const CONFIG = {
    initialCoal: 750,
    captureDurationMs: 30000,
    captureRange: 2,
    buildRange: 6,
    tickRateMs: 1000,
    shieldRegenDelayMs: 3000,
    shieldRegenPerSecond: 8,
    maxPlayersPerRoom: 8,
    logLimit: 12,
}

const STRUCTURES = {
    base: {
        label: 'Base',
        cost: 500,
        integrity: 1000,
        barrier: 500,
        integrityPerLevel: 25,
        barrierPerLevel: 25,
        captureable: false,
        buildable: false,
    },
    cover: {
        label: 'Cover',
        cost: 540,
        integrity: 300,
        barrier: 100,
        coalRate: 20,
        coalRatePerLevel: 5,
        captureable: true,
        buildable: true,
    },
    taraque: {
        label: 'Taraque',
        cost: 320,
        integrity: 350,
        barrier: 150,
        knowledgeRate: 2,
        knowledgeRatePerLevel: 1,
        captureable: true,
        buildable: true,
        requiresBaseLevel: 2,
    },
    per: {
        label: 'Per',
        cost: 140,
        integrity: 500,
        barrier: 0,
        damage: 5,
        attackRange: 20,
        attackEveryMs: 1000,
        captureable: true,
        buildable: true,
        requiresResearch: 'per',
    },
    hef: {
        label: 'Hef',
        cost: 200,
        integrity: 200,
        barrier: 100,
        damage: 15,
        splashRadius: 2,
        attackRange: 10,
        attackEveryMs: 1000,
        captureable: true,
        buildable: true,
        requiresResearch: 'hef',
    },
    tujai: {
        label: 'Tujai',
        cost: 600,
        integrity: 200,
        barrier: 0,
        captureable: true,
        buildable: true,
        requiresResearch: 'tujai',
    },
}

const RESEARCH = {
    per: {
        label: 'Per',
        cost: 15,
        requiresTaraqueLevel: 1,
    },
    hef: {
        label: 'Hef',
        cost: 25,
        requiresTaraqueLevel: 1,
    },
    tujai: {
        label: 'Tujai',
        cost: 60,
        requiresTaraqueLevel: 2,
    },
}

const NPCS = {
    zunim: {
        label: 'Zunim',
        cost: 80,
        integrity: 150,
        barrier: 50,
        damage: 10,
        attackRange: 1,
        attackEveryMs: 1000,
        speed: 1,
        integrityPerTujaiLevel: 10,
        barrierPerTujaiLevel: 5,
        damagePerTujaiLevel: 2,
    },
}

const PLAYER_COLORS = [
    '#1b9aaa',
    '#ef476f',
    '#06d6a0',
    '#f77f00',
    '#8338ec',
    '#3a86ff',
    '#d62828',
    '#2d6a4f',
]

export default function createGame() {
    const state = createPublicShell()
    const rooms = {}
    const playerRooms = {}
    const observers = []
    const debugObservers = []
    let ticker = null

    function start() {
        if (ticker) {
            return
        }

        ticker = setInterval(() => {
            const now = Date.now()

            for (const hostKey in rooms) {
                const room = rooms[hostKey]
                const changed = tickRoom(room, now)

                if (changed) {
                    notifyRoomState(room, 'tick')
                }
            }
        }, CONFIG.tickRateMs)
    }

    function subscribe(observerFunction) {
        observers.push(observerFunction)
    }

    function subscribeDebug(observerFunction) {
        debugObservers.push(observerFunction)
    }

    function notifyAll(command) {
        for (const observerFunction of observers) {
            observerFunction(command)
        }
    }

    function notifyRoomState(room, reason) {
        const publicState = getPublicState(room.hostKey)

        debugLog(room, 'state-update', {
            reason,
            summary: summarizeRoom(room),
        })

        notifyAll({
            type: 'state-update',
            hostKey: room.hostKey,
            reason,
            state: publicState,
        })
    }

    function debugLog(room, event, details = {}) {
        if (!room) {
            return
        }

        const entry = {
            hostKey: room.hostKey,
            event,
            tick: room.tick,
            at: new Date().toISOString(),
            details: clone(details),
        }

        for (const observerFunction of debugObservers) {
            observerFunction(entry)
        }
    }

    function setState(newState) {
        for (const key in state) {
            delete state[key]
        }

        Object.assign(state, newState)
    }

    function createMatch(command) {
        const hostKey = generateHostKey()
        const room = createRoom(hostKey)
        rooms[hostKey] = room

        addPlayerToRoom(room, command)
        addLog(room, `${getPlayerName(room, command.playerId)} criou a sala ${hostKey}.`)
        debugLog(room, 'match:create', {
            playerId: command.playerId,
            gamerTag: command.gamerTag,
            summary: summarizeRoom(room),
        })

        return {
            hostKey,
            state: getPublicState(hostKey),
        }
    }

    function joinMatch(command) {
        const hostKey = normalizeHostKey(command.hostKey)
        const room = rooms[hostKey]

        if (!room) {
            return { error: 'Sala nao encontrada.' }
        }

        debugLog(room, 'match:join-request', {
            playerId: command.playerId,
            gamerTag: command.gamerTag,
        })

        if (Object.keys(room.players).length >= CONFIG.maxPlayersPerRoom) {
            debugLog(room, 'match:join-denied', {
                playerId: command.playerId,
                reason: 'Sala cheia.',
                playerCount: Object.keys(room.players).length,
            })
            return { error: 'Sala cheia.' }
        }

        addPlayerToRoom(room, {
            ...command,
            hostKey,
        })

        room.hasHadCombatants = Object.keys(room.players).length >= 2
        addLog(room, `${getPlayerName(room, command.playerId)} entrou na partida.`)
        debugLog(room, 'match:join-success', {
            playerId: command.playerId,
            gamerTag: command.gamerTag,
            summary: summarizeRoom(room),
        })
        notifyRoomState(room, 'join-match')

        return {
            hostKey,
            state: getPublicState(hostKey),
        }
    }

    function disconnectPlayer(command) {
        const hostKey = command.hostKey || playerRooms[command.playerId]

        if (!hostKey || !rooms[hostKey]) {
            return
        }

        const room = rooms[hostKey]
        const player = room.players[command.playerId]

        if (!player) {
            return
        }

        player.connected = false
        player.disconnectedAt = Date.now()
        addLog(room, `${player.gamerTag} desconectou.`)
        debugLog(room, 'player:disconnect', {
            playerId: command.playerId,
            gamerTag: player.gamerTag,
            x: player.x,
            y: player.y,
        })

        delete playerRooms[command.playerId]
        notifyRoomState(room, 'disconnect')
    }

    function movePlayer(command) {
        const room = getRoomFromCommand(command)

        if (!room) {
            return
        }

        if (room.winnerId) {
            debugLog(room, 'move:blocked', {
                playerId: command.playerId,
                keyPressed: command.keyPressed,
                reason: 'partida encerrada',
            })
            return
        }

        const player = room.players[command.playerId]
        if (!player || !player.alive) {
            debugLog(room, 'move:blocked', {
                playerId: command.playerId,
                keyPressed: command.keyPressed,
                reason: player ? 'jogador fora da partida' : 'jogador nao encontrado',
            })
            return
        }

        const move = getMoveFromKey(command.keyPressed)

        if (!move) {
            debugLog(room, 'move:blocked', {
                playerId: command.playerId,
                keyPressed: command.keyPressed,
                reason: 'tecla invalida',
            })
            return
        }

        const nextX = player.x + move.x
        const nextY = player.y + move.y

        if (!isInsideMap(nextX, nextY)) {
            debugLog(room, 'move:blocked', {
                playerId: command.playerId,
                keyPressed: command.keyPressed,
                from: { x: player.x, y: player.y },
                to: { x: nextX, y: nextY },
                reason: 'fora do mapa',
            })
            return
        }

        const blockingStructure = getStructureAt(room, nextX, nextY)

        if (blockingStructure && !blockingStructure.disabled) {
            debugLog(room, 'move:blocked', {
                playerId: command.playerId,
                keyPressed: command.keyPressed,
                from: { x: player.x, y: player.y },
                to: { x: nextX, y: nextY },
                reason: 'estrutura ativa no caminho',
                structure: summarizeStructure(blockingStructure),
            })
            return
        }

        const blockingActor = getActorAt(room, nextX, nextY, player.playerId)

        if (blockingActor) {
            debugLog(room, 'move:blocked', {
                playerId: command.playerId,
                keyPressed: command.keyPressed,
                from: { x: player.x, y: player.y },
                to: { x: nextX, y: nextY },
                reason: 'ator no caminho',
                actor: summarizeActor(blockingActor),
            })
            return
        }

        const from = { x: player.x, y: player.y }
        player.x = nextX
        player.y = nextY
        player.lastMovedAt = Date.now()

        debugLog(room, 'move:success', {
            playerId: command.playerId,
            keyPressed: command.keyPressed,
            from,
            to: { x: player.x, y: player.y },
        })

        resetCapturesForPlayer(room, player.playerId)
        notifyRoomState(room, 'move-player')
    }

    function executeAction(command) {
        const room = getRoomFromCommand(command)

        if (!room) {
            return
        }

        debugLog(room, 'action:request', {
            command,
            player: room.players[command.playerId] ? summarizePlayer(room.players[command.playerId]) : null,
        })

        if (room.winnerId) {
            addLog(room, 'A partida ja terminou.')
            notifyRoomState(room, 'action-denied')
            return
        }

        const player = room.players[command.playerId]
        if (!player || !player.alive) {
            addLog(room, 'Jogador invalido ou fora da partida.')
            notifyRoomState(room, 'action-denied')
            return
        }

        let changed = false
        let handled = true

        if (command.action === 'build') {
            changed = buildStructure(room, player, command)
        } else if (command.action === 'upgrade') {
            changed = upgradeStructure(room, player, command)
        } else if (command.action === 'research') {
            changed = researchRecipe(room, player, command)
        } else if (command.action === 'spawn-npc') {
            changed = spawnNpc(room, player, command)
        } else {
            handled = false
            addLog(room, player.gamerTag + ': acao desconhecida: ' + (command.action || 'vazia') + '.')
        }

        debugLog(room, 'action:result', {
            action: command.action,
            handled,
            changed,
            player: summarizePlayer(player),
            summary: summarizeRoom(room),
        })

        const reason = changed ? command.action : (command.action || 'action') + ':failed'
        notifyRoomState(room, reason)
    }

    function getPublicState(hostKey) {
        const room = rooms[hostKey]

        if (!room) {
            return createPublicShell()
        }

        return {
            hostKey: room.hostKey,
            createdAt: room.createdAt,
            hasHadCombatants: room.hasHadCombatants,
            players: clone(room.players),
            structures: clone(room.structures),
            units: clone(room.units),
            screen: clone(SCREEN),
            config: clone(CONFIG),
            catalog: {
                structures: clone(STRUCTURES),
                research: clone(RESEARCH),
                npcs: clone(NPCS),
            },
            logs: room.logs.slice(),
            winnerId: room.winnerId,
            tick: room.tick,
        }
    }

    function getHostKeyForPlayer(playerId) {
        return playerRooms[playerId]
    }

    function getRoomFromCommand(command) {
        const hostKey = command.hostKey || playerRooms[command.playerId]
        return hostKey ? rooms[hostKey] : null
    }

    function addPlayerToRoom(room, command) {
        const now = Date.now()
        const playerIndex = Object.keys(room.players).length
        const spawn = getSpawnPoint(playerIndex)
        const playerId = command.playerId
        const gamerTag = sanitizeGamerTag(command.gamerTag, playerId)
        const color = PLAYER_COLORS[playerIndex % PLAYER_COLORS.length]

        playerRooms[playerId] = room.hostKey

        const base = createStructure(room, {
            ownerId: playerId,
            type: 'base',
            x: spawn.baseX,
            y: spawn.baseY,
        })

        room.players[playerId] = {
            playerId,
            gamerTag,
            color,
            x: spawn.playerX,
            y: spawn.playerY,
            coal: CONFIG.initialCoal,
            knowledge: 0,
            alive: true,
            connected: true,
            baseId: base.structureId,
            unlocked: {
                cover: true,
                taraque: false,
                per: false,
                hef: false,
                tujai: false,
            },
            lastMovedAt: now,
            joinedAt: now,
        }
    }

    function createRoom(hostKey) {
        const room = {
            hostKey,
            createdAt: Date.now(),
            players: {},
            structures: {},
            units: {},
            logs: [],
            winnerId: null,
            tick: 0,
            hasHadCombatants: false,
            nextStructureId: 1,
            nextUnitId: 1,
        }

        addNeutralFactories(room)

        return room
    }

    function addNeutralFactories(room) {
        const neutralFactories = [
            { type: 'cover', x: Math.floor(SCREEN.width / 2), y: Math.floor(SCREEN.height / 2) },
            { type: 'cover', x: Math.floor(SCREEN.width / 2) - 8, y: Math.floor(SCREEN.height / 2) },
            { type: 'cover', x: Math.floor(SCREEN.width / 2) + 8, y: Math.floor(SCREEN.height / 2) },
            { type: 'cover', x: Math.floor(SCREEN.width / 2), y: Math.floor(SCREEN.height / 2) - 7 },
            { type: 'cover', x: Math.floor(SCREEN.width / 2), y: Math.floor(SCREEN.height / 2) + 7 },
        ]

        for (const factory of neutralFactories) {
            const structure = createStructure(room, {
                ownerId: null,
                type: factory.type,
                x: factory.x,
                y: factory.y,
                disabled: true,
            })

            structure.integrity = 0
            structure.barrier = 0
        }
    }

    function createStructure(room, command) {
        const catalog = STRUCTURES[command.type]
        const structureId = command.structureId || `s-${room.nextStructureId++}`
        const maxIntegrity = getMaxIntegrity(command.type, 1)
        const maxBarrier = getMaxBarrier(command.type, 1)

        const structure = {
            structureId,
            ownerId: command.ownerId,
            type: command.type,
            x: command.x,
            y: command.y,
            level: 1,
            integrity: command.disabled ? 0 : maxIntegrity,
            maxIntegrity,
            barrier: command.disabled ? 0 : maxBarrier,
            maxBarrier,
            disabled: Boolean(command.disabled),
            capture: null,
            lastAttackAt: 0,
            lastDamagedAt: 0,
            createdAt: Date.now(),
            cost: catalog.cost,
        }

        room.structures[structureId] = structure

        return structure
    }

    function buildStructure(room, player, command) {
        const type = command.structureType
        const catalog = STRUCTURES[type]

        if (!catalog || !catalog.buildable) {
            addLog(room, `${player.gamerTag}: construcao invalida.`)
            return false
        }

        if (!canBuildStructure(room, player, type)) {
            addLog(room, `${player.gamerTag} ainda nao liberou ${catalog.label}.`)
            return false
        }

        if (!Number.isInteger(command.x) || !Number.isInteger(command.y) || !isInsideMap(command.x, command.y)) {
            addLog(room, `${player.gamerTag}: terreno invalido.`)
            return false
        }

        if (getStructureAt(room, command.x, command.y) || getActorAt(room, command.x, command.y)) {
            addLog(room, `${player.gamerTag}: terreno ocupado.`)
            return false
        }

        if (!isNearOwnedAnchor(room, player.playerId, command.x, command.y)) {
            addLog(room, `${player.gamerTag}: construa perto da sua base ou estruturas.`)
            return false
        }

        if (player.coal < catalog.cost) {
            addLog(room, `${player.gamerTag} precisa de ${catalog.cost} carvoes para ${catalog.label}.`)
            return false
        }

        player.coal -= catalog.cost
        createStructure(room, {
            ownerId: player.playerId,
            type,
            x: command.x,
            y: command.y,
        })

        addLog(room, `${player.gamerTag} construiu ${catalog.label}.`)
        return true
    }

    function upgradeStructure(room, player, command) {
        const structure = room.structures[command.structureId]

        if (!structure) {
            addLog(room, player.gamerTag + ': nenhuma construcao selecionada para upgrade.')
            debugLog(room, 'upgrade:denied', {
                player: summarizePlayer(player),
                structureId: command.structureId,
                reason: 'estrutura nao encontrada',
            })
            return false
        }

        if (structure.ownerId !== player.playerId) {
            addLog(room, player.gamerTag + ': selecione uma construcao sua para upgrade.')
            debugLog(room, 'upgrade:denied', {
                player: summarizePlayer(player),
                structure: summarizeStructure(structure),
                reason: 'estrutura de outro dono',
            })
            return false
        }

        if (structure.disabled) {
            addLog(room, player.gamerTag + ': esta construcao esta desativada.')
            debugLog(room, 'upgrade:denied', {
                player: summarizePlayer(player),
                structure: summarizeStructure(structure),
                reason: 'estrutura desativada',
            })
            return false
        }

        const cost = getUpgradeCost(structure)

        if (player.coal < cost) {
            addLog(room, player.gamerTag + ' precisa de ' + cost + ' carvoes para melhorar ' + STRUCTURES[structure.type].label + '; possui ' + Math.floor(player.coal) + '.')
            debugLog(room, 'upgrade:denied', {
                player: summarizePlayer(player),
                structure: summarizeStructure(structure),
                cost,
                coal: player.coal,
                reason: 'carvao insuficiente',
            })
            return false
        }

        debugLog(room, 'upgrade:accepted', {
            player: summarizePlayer(player),
            structureBefore: summarizeStructure(structure),
            cost,
        })

        player.coal -= cost
        structure.level += 1

        const oldMaxIntegrity = structure.maxIntegrity
        const oldMaxBarrier = structure.maxBarrier

        structure.maxIntegrity = getMaxIntegrity(structure.type, structure.level)
        structure.maxBarrier = getMaxBarrier(structure.type, structure.level)
        structure.integrity += structure.maxIntegrity - oldMaxIntegrity
        structure.barrier += structure.maxBarrier - oldMaxBarrier

        if (structure.type === 'base' && structure.level >= 2) {
            player.unlocked.taraque = true
        }

        addLog(room, player.gamerTag + ' melhorou ' + STRUCTURES[structure.type].label + ' para nivel ' + structure.level + '.')
        debugLog(room, 'upgrade:success', {
            player: summarizePlayer(player),
            structureAfter: summarizeStructure(structure),
        })
        return true
    }

    function researchRecipe(room, player, command) {
        const recipe = command.recipe
        const research = RESEARCH[recipe]

        if (!research) {
            return false
        }

        if (player.unlocked[recipe]) {
            addLog(room, `${player.gamerTag} ja liberou ${research.label}.`)
            return false
        }

        const taraqueLevel = getHighestStructureLevel(room, player.playerId, 'taraque')

        if (taraqueLevel < research.requiresTaraqueLevel) {
            addLog(room, `${player.gamerTag} precisa de Taraque nivel ${research.requiresTaraqueLevel}.`)
            return false
        }

        if (player.knowledge < research.cost) {
            addLog(room, `${player.gamerTag} precisa de ${research.cost} conhecimentos para ${research.label}.`)
            return false
        }

        player.knowledge -= research.cost
        player.unlocked[recipe] = true

        addLog(room, `${player.gamerTag} pesquisou ${research.label}.`)
        return true
    }

    function spawnNpc(room, player, command) {
        const npcType = command.npcType || 'zunim'
        const npc = NPCS[npcType]

        if (!npc || !player.unlocked.tujai) {
            addLog(room, `${player.gamerTag}: NPC indisponivel.`)
            return false
        }

        const tujai = getActiveStructures(room, player.playerId, 'tujai')[0]

        if (!tujai) {
            addLog(room, `${player.gamerTag} precisa de uma Tujai ativa.`)
            return false
        }

        if (player.coal < npc.cost) {
            addLog(room, `${player.gamerTag} precisa de ${npc.cost} carvoes para Zunim.`)
            return false
        }

        const spawnTile = getEmptyNeighbor(room, tujai.x, tujai.y)

        if (!spawnTile) {
            addLog(room, `${player.gamerTag}: sem espaco ao redor da Tujai.`)
            return false
        }

        const tujaiLevel = getHighestStructureLevel(room, player.playerId, 'tujai')
        const levelBonus = Math.max(0, tujaiLevel - 1)
        const maxIntegrity = npc.integrity + levelBonus * npc.integrityPerTujaiLevel
        const maxBarrier = npc.barrier + levelBonus * npc.barrierPerTujaiLevel
        const damage = npc.damage + levelBonus * npc.damagePerTujaiLevel
        const unitId = `u-${room.nextUnitId++}`

        player.coal -= npc.cost
        room.units[unitId] = {
            unitId,
            ownerId: player.playerId,
            type: npcType,
            x: spawnTile.x,
            y: spawnTile.y,
            integrity: maxIntegrity,
            maxIntegrity,
            barrier: maxBarrier,
            maxBarrier,
            damage,
            lastAttackAt: 0,
            lastDamagedAt: 0,
            createdAt: Date.now(),
        }

        addLog(room, `${player.gamerTag} enviou um Zunim.`)
        return true
    }

    function tickRoom(room, now) {
        let changed = false

        room.tick += 1
        room.hasHadCombatants = room.hasHadCombatants || Object.keys(room.players).length >= 2

        if (room.winnerId) {
            return false
        }

        changed = generateResources(room) || changed
        changed = regenerateBarriers(room, now) || changed
        changed = processCaptures(room) || changed
        changed = processTowerAttacks(room, now) || changed
        changed = processNpcActions(room, now) || changed
        changed = checkVictory(room) || changed

        return changed
    }

    function generateResources(room) {
        let changed = false

        for (const structureId in room.structures) {
            const structure = room.structures[structureId]
            const player = structure.ownerId ? room.players[structure.ownerId] : null

            if (!player || !player.alive || structure.disabled) {
                continue
            }

            if (structure.type === 'cover') {
                player.coal += getCoalRate(structure)
                changed = true
            }

            if (structure.type === 'taraque') {
                player.knowledge += getKnowledgeRate(structure)
                changed = true
            }
        }

        return changed
    }

    function regenerateBarriers(room, now) {
        let changed = false

        for (const structureId in room.structures) {
            const structure = room.structures[structureId]

            if (structure.disabled || structure.maxBarrier <= 0 || structure.barrier >= structure.maxBarrier) {
                continue
            }

            if (now - structure.lastDamagedAt >= CONFIG.shieldRegenDelayMs) {
                structure.barrier = Math.min(structure.maxBarrier, structure.barrier + CONFIG.shieldRegenPerSecond)
                changed = true
            }
        }

        for (const unitId in room.units) {
            const unit = room.units[unitId]

            if (unit.maxBarrier <= 0 || unit.barrier >= unit.maxBarrier) {
                continue
            }

            if (now - unit.lastDamagedAt >= CONFIG.shieldRegenDelayMs) {
                unit.barrier = Math.min(unit.maxBarrier, unit.barrier + CONFIG.shieldRegenPerSecond)
                changed = true
            }
        }

        return changed
    }

    function processCaptures(room) {
        let changed = false

        for (const structureId in room.structures) {
            const structure = room.structures[structureId]
            const catalog = STRUCTURES[structure.type]

            if (!structure.disabled || !catalog.captureable) {
                continue
            }

            const player = getCaptureCandidate(room, structure)

            if (!player) {
                if (structure.capture) {
                    structure.capture = null
                    changed = true
                }
                continue
            }

            const previousCapture = structure.capture
            const sameCapture = previousCapture
                && previousCapture.playerId === player.playerId
                && previousCapture.x === player.x
                && previousCapture.y === player.y

            if (!sameCapture) {
                structure.capture = {
                    playerId: player.playerId,
                    x: player.x,
                    y: player.y,
                    progressMs: 0,
                }
                changed = true
                continue
            }

            structure.capture.progressMs += CONFIG.tickRateMs
            changed = true

            if (structure.capture.progressMs >= CONFIG.captureDurationMs) {
                captureStructure(room, structure, player)
            }
        }

        return changed
    }

    function processTowerAttacks(room, now) {
        let changed = false

        for (const structureId in room.structures) {
            const structure = room.structures[structureId]
            const catalog = STRUCTURES[structure.type]

            if (!structure.ownerId || structure.disabled || !catalog.damage) {
                continue
            }

            if (now - structure.lastAttackAt < catalog.attackEveryMs) {
                continue
            }

            const target = findTowerTarget(room, structure)

            if (!target) {
                continue
            }

            structure.lastAttackAt = now
            if (structure.type === 'hef') {
                applySplashDamage(room, structure, target, catalog.damage, now)
            } else {
                applyDamage(room, target, catalog.damage, now, structure.ownerId)
            }

            changed = true
        }

        return changed
    }

    function processNpcActions(room, now) {
        let changed = false

        for (const unitId in room.units) {
            const unit = room.units[unitId]
            const owner = room.players[unit.ownerId]

            if (!owner || !owner.alive) {
                delete room.units[unitId]
                changed = true
                continue
            }

            const targetBase = getNearestEnemyBase(room, unit.ownerId, unit.x, unit.y)

            if (!targetBase) {
                continue
            }

            const npc = NPCS[unit.type]
            const distanceToTarget = distance(unit, targetBase)

            if (distanceToTarget <= npc.attackRange) {
                if (now - unit.lastAttackAt >= npc.attackEveryMs) {
                    unit.lastAttackAt = now
                    applyDamage(room, { kind: 'structure', value: targetBase }, unit.damage, now, unit.ownerId)
                    changed = true
                }

                continue
            }

            const nextTile = getStepToward(room, unit, targetBase)

            if (nextTile) {
                unit.x = nextTile.x
                unit.y = nextTile.y
                changed = true
            }
        }

        return changed
    }

    function checkVictory(room) {
        if (!room.hasHadCombatants || room.winnerId) {
            return false
        }

        const alivePlayers = Object.values(room.players).filter(player => player.alive)

        if (alivePlayers.length === 1) {
            room.winnerId = alivePlayers[0].playerId
            addLog(room, `${alivePlayers[0].gamerTag} venceu a partida.`)
            return true
        }

        return false
    }

    function captureStructure(room, structure, player) {
        structure.ownerId = player.playerId
        structure.disabled = false
        structure.capture = null
        structure.integrity = Math.ceil(structure.maxIntegrity * 0.5)
        structure.barrier = Math.ceil(structure.maxBarrier * 0.5)
        structure.lastDamagedAt = Date.now()
        addLog(room, `${player.gamerTag} capturou ${STRUCTURES[structure.type].label}.`)
    }

    function applySplashDamage(room, sourceStructure, target, damage, now) {
        const splashTargets = collectDamageableTargets(room)
            .filter(candidate => candidate.value.ownerId !== sourceStructure.ownerId)
            .filter(candidate => distance(candidate.value, target.value) <= STRUCTURES.hef.splashRadius)

        for (const splashTarget of splashTargets) {
            applyDamage(room, splashTarget, damage, now, sourceStructure.ownerId)
        }
    }

    function applyDamage(room, target, amount, now, attackerId) {
        if (target.kind === 'unit') {
            applyDamageToUnit(room, target.value, amount, now)
            return
        }

        applyDamageToStructure(room, target.value, amount, now, attackerId)
    }

    function applyDamageToUnit(room, unit, amount, now) {
        const barrierDamage = Math.min(unit.barrier, amount)
        unit.barrier -= barrierDamage
        unit.integrity -= amount - barrierDamage
        unit.lastDamagedAt = now

        if (unit.integrity <= 0) {
            delete room.units[unit.unitId]
        }
    }

    function applyDamageToStructure(room, structure, amount, now, attackerId) {
        if (structure.disabled) {
            return
        }

        const barrierDamage = Math.min(structure.barrier, amount)
        structure.barrier -= barrierDamage
        structure.integrity -= amount - barrierDamage
        structure.lastDamagedAt = now

        if (structure.integrity > 0) {
            return
        }

        if (structure.type === 'base') {
            eliminatePlayer(room, structure.ownerId, attackerId)
            return
        }

        structure.integrity = 0
        structure.barrier = 0
        structure.disabled = true
        structure.capture = null
        addLog(room, `${STRUCTURES[structure.type].label} de ${getPlayerName(room, structure.ownerId)} foi desativada.`)
    }

    function eliminatePlayer(room, playerId, attackerId) {
        const player = room.players[playerId]

        if (!player || !player.alive) {
            return
        }

        player.alive = false
        player.coal = 0
        player.knowledge = 0

        const base = room.structures[player.baseId]
        if (base) {
            base.integrity = 0
            base.barrier = 0
            base.disabled = true
        }

        for (const structureId in room.structures) {
            const structure = room.structures[structureId]

            if (structure.ownerId === playerId && structure.type !== 'base') {
                structure.disabled = true
                structure.integrity = 0
                structure.barrier = 0
                structure.capture = null
            }
        }

        for (const unitId in room.units) {
            if (room.units[unitId].ownerId === playerId) {
                delete room.units[unitId]
            }
        }

        const attackerName = attackerId ? getPlayerName(room, attackerId) : 'o combate'
        addLog(room, `${player.gamerTag} perdeu a base para ${attackerName}.`)
        checkVictory(room)
    }

    function findTowerTarget(room, structure) {
        const range = STRUCTURES[structure.type].attackRange
        const enemies = collectDamageableTargets(room)
            .filter(candidate => candidate.value.ownerId !== structure.ownerId)
            .filter(candidate => !candidate.value.disabled)
            .filter(candidate => distance(structure, candidate.value) <= range)

        enemies.sort((first, second) => {
            if (first.kind !== second.kind) {
                return first.kind === 'unit' ? -1 : 1
            }

            return distance(structure, first.value) - distance(structure, second.value)
        })

        return enemies[0] || null
    }

    function collectDamageableTargets(room) {
        const targets = []

        for (const unitId in room.units) {
            targets.push({ kind: 'unit', value: room.units[unitId] })
        }

        for (const structureId in room.structures) {
            const structure = room.structures[structureId]

            if (!structure.ownerId || structure.disabled) {
                continue
            }

            targets.push({ kind: 'structure', value: structure })
        }

        return targets
    }

    function getNearestEnemyBase(room, ownerId, x, y) {
        const bases = Object.values(room.structures)
            .filter(structure => structure.type === 'base')
            .filter(structure => structure.ownerId !== ownerId)
            .filter(structure => !structure.disabled)
            .filter(structure => room.players[structure.ownerId] && room.players[structure.ownerId].alive)

        bases.sort((first, second) => distance({ x, y }, first) - distance({ x, y }, second))

        return bases[0] || null
    }

    function getStepToward(room, unit, target) {
        const options = []
        const dx = Math.sign(target.x - unit.x)
        const dy = Math.sign(target.y - unit.y)

        if (Math.abs(target.x - unit.x) >= Math.abs(target.y - unit.y)) {
            options.push({ x: unit.x + dx, y: unit.y })
            options.push({ x: unit.x, y: unit.y + dy })
        } else {
            options.push({ x: unit.x, y: unit.y + dy })
            options.push({ x: unit.x + dx, y: unit.y })
        }

        for (const option of options) {
            if (!isInsideMap(option.x, option.y)) {
                continue
            }

            const structure = getStructureAt(room, option.x, option.y)

            if (structure && !structure.disabled && structure.structureId !== target.structureId) {
                continue
            }

            if (getActorAt(room, option.x, option.y)) {
                continue
            }

            return option
        }

        return null
    }

    function getCaptureCandidate(room, structure) {
        const candidates = Object.values(room.players)
            .filter(player => player.alive)
            .filter(player => player.playerId !== structure.ownerId)
            .filter(player => distance(player, structure) <= CONFIG.captureRange)

        candidates.sort((first, second) => distance(first, structure) - distance(second, structure))

        return candidates[0] || null
    }

    function resetCapturesForPlayer(room, playerId) {
        for (const structureId in room.structures) {
            const structure = room.structures[structureId]

            if (structure.capture && structure.capture.playerId === playerId) {
                structure.capture = null
            }
        }
    }

    function canBuildStructure(room, player, type) {
        if (type === 'cover') {
            return true
        }

        const catalog = STRUCTURES[type]

        if (catalog.requiresBaseLevel) {
            const base = room.structures[player.baseId]
            return base && base.level >= catalog.requiresBaseLevel
        }

        if (catalog.requiresResearch) {
            return Boolean(player.unlocked[catalog.requiresResearch])
        }

        return Boolean(player.unlocked[type])
    }

    function isNearOwnedAnchor(room, playerId, x, y) {
        return Object.values(room.structures)
            .filter(structure => structure.ownerId === playerId && !structure.disabled)
            .some(structure => distance(structure, { x, y }) <= CONFIG.buildRange)
    }

    function getActiveStructures(room, playerId, type) {
        return Object.values(room.structures)
            .filter(structure => structure.ownerId === playerId)
            .filter(structure => structure.type === type)
            .filter(structure => !structure.disabled)
    }

    function getHighestStructureLevel(room, playerId, type) {
        return getActiveStructures(room, playerId, type)
            .reduce((highestLevel, structure) => Math.max(highestLevel, structure.level), 0)
    }

    function getStructureAt(room, x, y) {
        return Object.values(room.structures).find(structure => structure.x === x && structure.y === y) || null
    }

    function getActorAt(room, x, y, ignoredPlayerId = null) {
        const player = Object.values(room.players)
            .find(candidate => candidate.alive
                && candidate.playerId !== ignoredPlayerId
                && candidate.x === x
                && candidate.y === y)

        if (player) {
            return player
        }

        return Object.values(room.units)
            .find(unit => unit.x === x && unit.y === y) || null
    }

    function getEmptyNeighbor(room, x, y) {
        const offsets = [
            { x: 1, y: 0 },
            { x: -1, y: 0 },
            { x: 0, y: 1 },
            { x: 0, y: -1 },
            { x: 1, y: 1 },
            { x: -1, y: -1 },
            { x: 1, y: -1 },
            { x: -1, y: 1 },
        ]

        for (const offset of offsets) {
            const next = { x: x + offset.x, y: y + offset.y }

            if (!isInsideMap(next.x, next.y)) {
                continue
            }

            if (getStructureAt(room, next.x, next.y) || getActorAt(room, next.x, next.y)) {
                continue
            }

            return next
        }

        return null
    }

    function getMoveFromKey(keyPressed) {
        const acceptedMoves = {
            ArrowUp: { x: 0, y: -1 },
            w: { x: 0, y: -1 },
            W: { x: 0, y: -1 },
            ArrowRight: { x: 1, y: 0 },
            d: { x: 1, y: 0 },
            D: { x: 1, y: 0 },
            ArrowDown: { x: 0, y: 1 },
            s: { x: 0, y: 1 },
            S: { x: 0, y: 1 },
            ArrowLeft: { x: -1, y: 0 },
            a: { x: -1, y: 0 },
            A: { x: -1, y: 0 },
        }

        return acceptedMoves[keyPressed]
    }

    function getSpawnPoint(index) {
        const spawns = [
            { baseX: 4, baseY: 4, playerX: 6, playerY: 4 },
            { baseX: SCREEN.width - 5, baseY: SCREEN.height - 5, playerX: SCREEN.width - 7, playerY: SCREEN.height - 5 },
            { baseX: SCREEN.width - 5, baseY: 4, playerX: SCREEN.width - 7, playerY: 4 },
            { baseX: 4, baseY: SCREEN.height - 5, playerX: 6, playerY: SCREEN.height - 5 },
            { baseX: Math.floor(SCREEN.width / 2), baseY: 4, playerX: Math.floor(SCREEN.width / 2), playerY: 6 },
            { baseX: Math.floor(SCREEN.width / 2), baseY: SCREEN.height - 5, playerX: Math.floor(SCREEN.width / 2), playerY: SCREEN.height - 7 },
            { baseX: 4, baseY: Math.floor(SCREEN.height / 2), playerX: 6, playerY: Math.floor(SCREEN.height / 2) },
            { baseX: SCREEN.width - 5, baseY: Math.floor(SCREEN.height / 2), playerX: SCREEN.width - 7, playerY: Math.floor(SCREEN.height / 2) },
        ]

        return spawns[index % spawns.length]
    }

    function getMaxIntegrity(type, level) {
        const catalog = STRUCTURES[type]
        const explicitBonus = catalog.integrityPerLevel || 0
        const genericBonus = type === 'base' ? 0 : Math.ceil(catalog.integrity * 0.1) * (level - 1)

        return catalog.integrity + explicitBonus * (level - 1) + genericBonus
    }

    function getMaxBarrier(type, level) {
        const catalog = STRUCTURES[type]
        const explicitBonus = catalog.barrierPerLevel || 0
        const genericBonus = type === 'base' ? 0 : Math.ceil(catalog.barrier * 0.1) * (level - 1)

        return catalog.barrier + explicitBonus * (level - 1) + genericBonus
    }

    function getUpgradeCost(structure) {
        return Math.round(STRUCTURES[structure.type].cost * (1.5 ** structure.level))
    }

    function getCoalRate(structure) {
        return STRUCTURES.cover.coalRate + (structure.level - 1) * STRUCTURES.cover.coalRatePerLevel
    }

    function getKnowledgeRate(structure) {
        return STRUCTURES.taraque.knowledgeRate + (structure.level - 1) * STRUCTURES.taraque.knowledgeRatePerLevel
    }

    function addLog(room, message) {
        const logEntry = {
            id: `${Date.now()}-${room.logs.length}`,
            message,
            at: Date.now(),
        }

        room.logs.unshift(logEntry)
        room.logs = room.logs.slice(0, CONFIG.logLimit)

        debugLog(room, 'game-log', logEntry)
    }

    function getPlayerName(room, playerId) {
        if (!playerId || !room.players[playerId]) {
            return 'Neutro'
        }

        return room.players[playerId].gamerTag
    }

    function generateHostKey() {
        let hostKey = ''

        do {
            hostKey = Math.random().toString(36).slice(2, 7).toUpperCase()
        } while (rooms[hostKey])

        return hostKey
    }

    return {
        state,
        setState,
        subscribe,
        subscribeDebug,
        start,
        createMatch,
        joinMatch,
        disconnectPlayer,
        movePlayer,
        executeAction,
        getPublicState,
        getHostKeyForPlayer,
    }
}

function summarizeRoom(room) {
    return {
        players: Object.keys(room.players).length,
        alivePlayers: Object.values(room.players).filter(player => player.alive).length,
        structures: Object.keys(room.structures).length,
        units: Object.keys(room.units).length,
        winnerId: room.winnerId,
        hasHadCombatants: room.hasHadCombatants,
    }
}

function summarizePlayer(player) {
    return {
        playerId: player.playerId,
        gamerTag: player.gamerTag,
        x: player.x,
        y: player.y,
        coal: player.coal,
        knowledge: player.knowledge,
        alive: player.alive,
        connected: player.connected,
        baseId: player.baseId,
        unlocked: player.unlocked,
    }
}

function summarizeStructure(structure) {
    return {
        structureId: structure.structureId,
        ownerId: structure.ownerId,
        type: structure.type,
        x: structure.x,
        y: structure.y,
        level: structure.level,
        integrity: structure.integrity,
        maxIntegrity: structure.maxIntegrity,
        barrier: structure.barrier,
        maxBarrier: structure.maxBarrier,
        disabled: structure.disabled,
    }
}

function summarizeActor(actor) {
    if (actor.playerId) {
        return summarizePlayer(actor)
    }

    return {
        unitId: actor.unitId,
        ownerId: actor.ownerId,
        type: actor.type,
        x: actor.x,
        y: actor.y,
        integrity: actor.integrity,
        barrier: actor.barrier,
    }
}

function createPublicShell() {
    return {
        hostKey: null,
        players: {},
        structures: {},
        units: {},
        screen: clone(SCREEN),
        config: clone(CONFIG),
        catalog: {
            structures: clone(STRUCTURES),
            research: clone(RESEARCH),
            npcs: clone(NPCS),
        },
        logs: [],
        winnerId: null,
        tick: 0,
    }
}

function isInsideMap(x, y) {
    return x >= 0 && x < SCREEN.width && y >= 0 && y < SCREEN.height
}

function distance(first, second) {
    const dx = first.x - second.x
    const dy = first.y - second.y

    return Math.sqrt(dx * dx + dy * dy)
}

function normalizeHostKey(hostKey) {
    return String(hostKey || '').trim().toUpperCase()
}

function sanitizeGamerTag(gamerTag, fallback) {
    const sanitized = String(gamerTag || '').trim().slice(0, 18)

    if (sanitized) {
        return sanitized
    }

    return `Player ${String(fallback).slice(0, 4)}`
}

function clone(value) {
    return JSON.parse(JSON.stringify(value))
}
