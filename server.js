import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import http from 'http'
import { Server } from 'socket.io'
import createGame from './public/game.js'
import { createCompositeWarBaseAgent } from './ai/agente-composto/agente-composto.js'
import { createTrainingEngine } from './ai/treinamento-evolutivo/motor-treino.js'

export const DEFAULT_PORT = process.env.PORT || 4000

export function createWarBaseServer(options = {}) {
    const port = options.port ?? DEFAULT_PORT
    const logger = options.logger || console
    const exit = options.exit || process.exit
    const shutdownTimeoutMs = options.shutdownTimeoutMs || 5000
    const logsDirectory = options.logsDirectory || path.join(process.cwd(), 'logs', 'rooms')
    const game = options.game || createGame({
        aiAgent: options.aiAgent || createCompositeWarBaseAgent(options.aiOptions),
    })
    const trainingEngine = options.trainingEngine || createTrainingEngine({
        scheduleNext: callback => setImmediate(callback),
        ...(options.trainingDependencies || {}),
    })
    const createSockets = options.createSockets || (httpServer => new Server(httpServer))
    const app = express()
    const server = http.createServer(app)
    const sockets = createSockets(server)

    app.disable('x-powered-by')

    app.get('/health', (request, response) => {
        response.json({
            status: 'ok',
            activeRooms: typeof game.getRoomCount === 'function' ? game.getRoomCount() : null,
            uptimeSeconds: Math.floor(process.uptime()),
            timestamp: new Date().toISOString(),
        })
    })

    app.use(express.static('public'))
    fs.mkdirSync(logsDirectory, { recursive: true })
    game.start()

    const appendRoomLog = (hostKey, event, details = {}) => appendRoomLogEntry(logsDirectory, hostKey, event, details, logger)

    game.subscribe(command => emitGameCommand(command, sockets, appendRoomLog))
    game.subscribeDebug(entry => {
        appendRoomLog(entry.hostKey, 'game:' + entry.event, {
            tick: entry.tick,
            gameAt: entry.at,
            details: entry.details,
        })
    })

    const trainingSockets = createTrainingBroadcaster(sockets)

    sockets.on('connection', socket => registerSocketHandlers(socket, game, appendRoomLog, logger, {
        trainingEngine,
        trainingSockets,
    }))

    let shuttingDown = false

    function listen(callback) {
        return server.listen(port, () => {
            logger.log('> Server listening on port: ' + port)

            if (callback) {
                callback()
            }
        })
    }

    function shutdown(signal) {
        if (shuttingDown) {
            return
        }

        shuttingDown = true
        logger.log('> ' + signal + ' received. Closing server...')

        const forceExit = setTimeout(() => {
            logger.error('> Forced shutdown after timeout')
            exit(1)
        }, shutdownTimeoutMs)
        forceExit.unref()

        sockets.close(() => {
            clearTimeout(forceExit)
            closeHttpServer(() => {
                logger.log('> Server closed')
                exit(0)
            })
        })
    }

    function closeHttpServer(callback) {
        if (!server.listening) {
            callback()
            return
        }

        server.close(callback)
    }

    return {
        app,
        server,
        sockets,
        game,
        logsDirectory,
        port,
        listen,
        shutdown,
        appendRoomLog,
        trainingEngine,
        trainingSockets,
    }
}

export function createTrainingBroadcaster(sockets) {
    const subscribers = new Set()

    return {
        subscribe(socket) {
            subscribers.add(socket)
        },
        unsubscribe(socket) {
            subscribers.delete(socket)
        },
        broadcast(eventName, payload) {
            for (const socket of subscribers) {
                socket.emit(eventName, payload)
            }
        },
        size() {
            return subscribers.size
        },
        sockets,
    }
}

export function emitGameCommand(command, sockets, appendRoomLog) {
    if (command.playerId) {
        if (command.hostKey) {
            appendRoomLog(command.hostKey, 'socket:emit', {
                type: command.type,
                reason: command.reason,
                playerId: command.playerId,
            })
        }

        sockets.to(command.playerId).emit(command.type, command)
        return
    }

    if (command.hostKey) {
        appendRoomLog(command.hostKey, 'socket:emit', {
            type: command.type,
            reason: command.reason,
        })
        sockets.to(command.hostKey).emit(command.type, command)
    }
}

export function registerSocketHandlers(socket, game, appendRoomLog, logger = console, training = null) {
    const playerId = socket.id
    logger.log(`> Player connected: ${playerId}`)

    if (training && training.trainingEngine && training.trainingSockets) {
        registerTrainingHandlers(socket, training.trainingEngine, training.trainingSockets, logger)
    }

    socket.on('create-match', (command = {}) => {
        const result = game.createMatch({
            playerId,
            gamerTag: command.gamerTag,
        })

        appendRoomLog(result.hostKey, 'socket:create-match', {
            playerId,
            command,
        })

        socket.join(result.hostKey)
        socket.emit('setup', result)
        logger.log(`> ${playerId} created room ${result.hostKey}`)
    })

    socket.on('join-match', (command = {}) => {
        const requestedHostKey = normalizeHostKey(command.hostKey)
        appendRoomLog(requestedHostKey, 'socket:join-match:request', {
            playerId,
            command,
        })

        const result = game.joinMatch({
            playerId,
            gamerTag: command.gamerTag,
            hostKey: command.hostKey,
        })

        if (result.error) {
            appendRoomLog(requestedHostKey, 'socket:join-match:error', {
                playerId,
                error: result.error,
            })
            socket.emit('join-error', result)
            return
        }

        appendRoomLog(result.hostKey, 'socket:join-match:success', {
            playerId,
            command,
        })

        socket.join(result.hostKey)
        socket.emit('setup', result)
        logger.log(`> ${playerId} joined room ${result.hostKey}`)
    })

    socket.on('move-player', (command = {}) => {
        const hostKey = game.getHostKeyForPlayer(playerId)
        appendRoomLog(hostKey, 'socket:move-player', {
            playerId,
            command,
        })

        game.movePlayer({
            playerId,
            hostKey,
            keyPressed: command.keyPressed,
        })
    })

    socket.on('game-action', (command = {}) => {
        const hostKey = game.getHostKeyForPlayer(playerId)
        appendRoomLog(hostKey, 'socket:game-action', {
            playerId,
            command,
        })

        game.executeAction({
            ...command,
            playerId,
            hostKey,
        })
    })

    socket.on('add-ai', (command = {}) => {
        const hostKey = normalizeHostKey(command.hostKey || game.getHostKeyForPlayer(playerId))
        appendRoomLog(hostKey, 'socket:add-ai', {
            playerId,
            command,
        })

        const result = game.addAiPlayer({
            hostKey,
            requestedBy: playerId,
            gamerTag: command.gamerTag,
        })

        if (result.error) {
            appendRoomLog(hostKey, 'socket:add-ai:error', {
                playerId,
                error: result.error,
            })
            socket.emit('add-ai-error', result)
            return
        }

        appendRoomLog(result.hostKey, 'socket:add-ai:success', {
            playerId,
            aiPlayerId: result.playerId,
        })
    })

    socket.on('disconnect', () => {
        const hostKey = game.getHostKeyForPlayer(playerId)
        appendRoomLog(hostKey, 'socket:disconnect', { playerId })
        game.disconnectPlayer({ playerId })

        if (training && training.trainingSockets) {
            training.trainingSockets.unsubscribe(socket)
        }

        logger.log(`> Player disconnected: ${playerId}`)
    })
}

export function registerTrainingHandlers(socket, trainingEngine, trainingSockets, logger = console) {
    const listeners = {
        onStart: payload => trainingSockets.broadcast('training:started', payload),
        onStop: payload => trainingSockets.broadcast('training:stopped', payload),
        onFinished: payload => trainingSockets.broadcast('training:finished', payload),
        onSave: payload => trainingSockets.broadcast('training:best-saved', payload),
        onGenerationStart: payload => trainingSockets.broadcast('training:generation-start', payload),
        onGenerationComplete: payload => trainingSockets.broadcast('training:generation-complete', payload),
        onSnapshot: payload => trainingSockets.broadcast('training:decision-snapshot', payload),
        onMatchEvent: payload => trainingSockets.broadcast('training:match-event', payload),
    }

    socket.on('training:subscribe', () => {
        trainingSockets.subscribe(socket)
        socket.emit('training:state', { running: trainingEngine.isRunning(), state: trainingEngine.getState() })
    })

    socket.on('training:unsubscribe', () => {
        trainingSockets.unsubscribe(socket)
    })

    socket.on('training:start', (command = {}) => {
        try {
            const result = trainingEngine.start(command, listeners)

            if (result.error) {
                socket.emit('training:error', result)
            }
        } catch (error) {
            logger.error('> training start failed', error)
            socket.emit('training:error', { message: error.message })
        }
    })

    socket.on('training:stop', () => {
        try {
            trainingEngine.stop(listeners)
        } catch (error) {
            logger.error('> training stop failed', error)
            socket.emit('training:error', { message: error.message })
        }
    })

    socket.on('training:save-best', () => {
        try {
            const result = trainingEngine.saveBest(listeners)

            if (result.error) {
                socket.emit('training:error', result)
            }
        } catch (error) {
            logger.error('> training save-best failed', error)
            socket.emit('training:error', { message: error.message })
        }
    })
}

export function appendRoomLogEntry(logsDirectory, hostKey, event, details = {}, logger = console) {
    const safeHostKey = normalizeHostKey(hostKey)

    if (!safeHostKey) {
        return
    }

    const logFile = path.join(logsDirectory, safeHostKey + '.log')
    const entry = {
        at: new Date().toISOString(),
        event,
        ...details,
    }

    try {
        fs.appendFileSync(logFile, JSON.stringify(entry) + '\n')
    } catch (error) {
        logger.error('> Failed to write room log', safeHostKey, error)
    }
}

export function normalizeHostKey(hostKey) {
    return String(hostKey || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, '')
}

function isMainModule() {
    return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
}

/* istanbul ignore next -- process entrypoint is exercised by running `npm start`; unit tests cover the server factory. */
if (isMainModule()) {
    const warBaseServer = createWarBaseServer()

    process.on('SIGINT', () => warBaseServer.shutdown('SIGINT'))
    process.on('SIGTERM', () => warBaseServer.shutdown('SIGTERM'))

    warBaseServer.listen()
}
