import fs from 'fs'
import path from 'path'
import express from 'express'
import http from 'http'
import { Server } from 'socket.io'
import createGame from './public/game.js'

const PORT = 4000
const app = express()
const server = http.createServer(app)
const sockets = new Server(server)

app.use(express.static('public'))

const logsDirectory = path.join(process.cwd(), 'logs', 'rooms')
fs.mkdirSync(logsDirectory, { recursive: true })

const game = createGame()
game.start()

game.subscribe((command) => {
    if (command.hostKey) {
        appendRoomLog(command.hostKey, 'socket:emit', {
            type: command.type,
            reason: command.reason,
        })
        sockets.to(command.hostKey).emit(command.type, command)
        return
    }

    if (command.playerId) {
        sockets.to(command.playerId).emit(command.type, command)
    }
})

game.subscribeDebug((entry) => {
    appendRoomLog(entry.hostKey, 'game:' + entry.event, {
        tick: entry.tick,
        gameAt: entry.at,
        details: entry.details,
    })
})

sockets.on('connection', (socket) => {
    const playerId = socket.id
    console.log(`> Player connected: ${playerId}`)

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
        console.log(`> ${playerId} created room ${result.hostKey}`)
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
        console.log(`> ${playerId} joined room ${result.hostKey}`)
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

    socket.on('disconnect', () => {
        const hostKey = game.getHostKeyForPlayer(playerId)
        appendRoomLog(hostKey, 'socket:disconnect', { playerId })
        game.disconnectPlayer({ playerId })
        console.log(`> Player disconnected: ${playerId}`)
    })
})

server.listen(PORT, () => {
    console.log('> Server listening on port: ' + PORT)
})

function appendRoomLog(hostKey, event, details = {}) {
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
        console.error('> Failed to write room log', safeHostKey, error)
    }
}

function normalizeHostKey(hostKey) {
    return String(hostKey || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, '')
}
