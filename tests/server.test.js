import fs from 'fs'
import os from 'os'
import path from 'path'
import http from 'http'
import { afterEach, describe, expect, jest, test } from '@jest/globals'
import {
    appendRoomLogEntry,
    createWarBaseServer,
    emitGameCommand,
    normalizeHostKey,
    registerSocketHandlers,
} from '../server.js'

function createFakeSockets() {
    const emitted = []
    const handlers = {}

    return {
        emitted,
        handlers,
        on: jest.fn((event, handler) => {
            handlers[event] = handler
        }),
        to: jest.fn(room => ({
            emit: jest.fn((type, command) => emitted.push({ room, type, command })),
        })),
        close: jest.fn(callback => callback()),
    }
}

function createFakeGame() {
    const game = {
        start: jest.fn(),
        subscribe: jest.fn(callback => {
            game.stateObserver = callback
        }),
        subscribeDebug: jest.fn(callback => {
            game.debugObserver = callback
        }),
        createMatch: jest.fn(() => ({ hostKey: 'ABCDE', state: { ok: true } })),
        joinMatch: jest.fn(command => (command.hostKey === 'missing'
            ? { error: 'Sala nao encontrada.' }
            : { hostKey: 'ABCDE', state: { ok: true } })),
        getHostKeyForPlayer: jest.fn(() => 'ABCDE'),
        movePlayer: jest.fn(),
        executeAction: jest.fn(),
        disconnectPlayer: jest.fn(),
    }

    return game
}

function createFakeSocket() {
    const handlers = {}

    return {
        id: 'socket-1',
        handlers,
        on: jest.fn((event, handler) => {
            handlers[event] = handler
        }),
        join: jest.fn(),
        emit: jest.fn(),
    }
}

function requestJson(server, pathName) {
    return new Promise((resolve, reject) => {
        const address = server.address()
        const request = http.get({ port: address.port, path: pathName }, response => {
            let body = ''
            response.on('data', chunk => {
                body += chunk
            })
            response.on('end', () => {
                resolve({ statusCode: response.statusCode, body: JSON.parse(body) })
            })
        })
        request.on('error', reject)
    })
}

describe('server infrastructure', () => {
    const openServers = []

    afterEach(async () => {
        await Promise.all(openServers.splice(0).map(server => new Promise(resolve => server.close(resolve))))
    })

    test('normalizes host keys for log and room usage', () => {
        expect(normalizeHostKey(' ab-c_12!! ')).toBe('AB-C_12')
        expect(normalizeHostKey(null)).toBe('')
    })

    test('writes room logs and ignores empty host keys', () => {
        const logsDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'war-base-logs-'))

        appendRoomLogEntry(logsDirectory, ' abc!! ', 'event:name', { value: 1 })
        appendRoomLogEntry(logsDirectory, '', 'ignored')

        const log = fs.readFileSync(path.join(logsDirectory, 'ABC.log'), 'utf8').trim()
        expect(JSON.parse(log)).toMatchObject({ event: 'event:name', value: 1 })
        expect(fs.readdirSync(logsDirectory)).toEqual(['ABC.log'])
    })

    test('logs write failures without throwing', () => {
        const logger = { error: jest.fn() }
        const fileAsDirectory = path.join(os.tmpdir(), 'war-base-log-file')
        fs.writeFileSync(fileAsDirectory, 'not a directory')

        appendRoomLogEntry(fileAsDirectory, 'ABCDE', 'event:name', {}, logger)

        expect(logger.error).toHaveBeenCalledTimes(1)
        expect(logger.error.mock.calls[0][0]).toContain('Failed')
        expect(logger.error.mock.calls[0][1]).toBe('ABCDE')
        fs.unlinkSync(fileAsDirectory)
    })

    test('emits game commands to rooms and players', () => {
        const sockets = createFakeSockets()
        const appendRoomLog = jest.fn()
        const roomCommand = { type: 'state-update', hostKey: 'ABCDE', reason: 'tick' }
        const playerCommand = { type: 'setup', playerId: 'socket-1' }

        emitGameCommand(roomCommand, sockets, appendRoomLog)
        emitGameCommand(playerCommand, sockets, appendRoomLog)
        emitGameCommand({ type: 'noop' }, sockets, appendRoomLog)

        expect(appendRoomLog).toHaveBeenCalledWith('ABCDE', 'socket:emit', { type: 'state-update', reason: 'tick' })
        expect(sockets.emitted).toEqual([
            { room: 'ABCDE', type: 'state-update', command: roomCommand },
            { room: 'socket-1', type: 'setup', command: playerCommand },
        ])
    })

    test('creates health route, subscriptions, sockets and graceful shutdown', async () => {
        jest.useFakeTimers()
        try {
            const sockets = createFakeSockets()
            const game = createFakeGame()
            const logger = { log: jest.fn(), error: jest.fn() }
            const exit = jest.fn()
            const logsDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'war-base-server-'))
            const warBaseServer = createWarBaseServer({
                port: 0,
                game,
                logger,
                exit,
                logsDirectory,
                shutdownTimeoutMs: 10,
                createSockets: () => sockets,
            })

            openServers.push(warBaseServer.server)
            await new Promise(resolve => warBaseServer.listen(resolve))
            await expect(requestJson(warBaseServer.server, '/health')).resolves.toEqual({
                statusCode: 200,
                body: { status: 'ok' },
            })

            game.stateObserver({ type: 'state-update', hostKey: 'ABCDE', reason: 'join' })
            game.debugObserver({ hostKey: 'ABCDE', event: 'tick', tick: 1, at: 'now', details: { changed: true } })
            expect(fs.readFileSync(path.join(logsDirectory, 'ABCDE.log'), 'utf8')).toContain('game:tick')
            expect(sockets.on).toHaveBeenCalledWith('connection', expect.any(Function))
            sockets.handlers.connection(createFakeSocket())

            warBaseServer.shutdown('SIGTERM')
            warBaseServer.shutdown('SIGTERM')
            expect(sockets.close).toHaveBeenCalledTimes(1)
            expect(exit).toHaveBeenCalledWith(0)
        } finally {
            jest.useRealTimers()
        }
    })

    test('registers socket handlers for create, join, move, actions and disconnect', () => {
        const game = createFakeGame()
        const socket = createFakeSocket()
        const appendRoomLog = jest.fn()
        const logger = { log: jest.fn() }

        registerSocketHandlers(socket, game, appendRoomLog, logger)
        socket.handlers['create-match']({ gamerTag: 'Alice' })
        socket.handlers['join-match']({ gamerTag: 'Bob', hostKey: 'abcde' })
        socket.handlers['join-match']({ gamerTag: 'Bob', hostKey: 'missing' })
        socket.handlers['move-player']({ keyPressed: 'w' })
        socket.handlers['game-action']({ action: 'build' })
        socket.handlers.disconnect()

        expect(game.createMatch).toHaveBeenCalledWith({ playerId: 'socket-1', gamerTag: 'Alice' })
        expect(game.joinMatch).toHaveBeenCalledWith({ playerId: 'socket-1', gamerTag: 'Bob', hostKey: 'abcde' })
        expect(socket.join).toHaveBeenCalledWith('ABCDE')
        expect(socket.emit).toHaveBeenCalledWith('setup', { hostKey: 'ABCDE', state: { ok: true } })
        expect(socket.emit).toHaveBeenCalledWith('join-error', { error: 'Sala nao encontrada.' })
        expect(game.movePlayer).toHaveBeenCalledWith({ playerId: 'socket-1', hostKey: 'ABCDE', keyPressed: 'w' })
        expect(game.executeAction).toHaveBeenCalledWith({ action: 'build', playerId: 'socket-1', hostKey: 'ABCDE' })
        expect(game.disconnectPlayer).toHaveBeenCalledWith({ playerId: 'socket-1' })
        expect(appendRoomLog).toHaveBeenCalledWith('MISSING', 'socket:join-match:error', {
            playerId: 'socket-1',
            error: 'Sala nao encontrada.',
        })
    })

    test('forces shutdown when sockets do not close in time', () => {
        jest.useFakeTimers()
        try {
            const sockets = createFakeSockets()
            sockets.close = jest.fn()
            const logger = { log: jest.fn(), error: jest.fn() }
            const exit = jest.fn()
            const warBaseServer = createWarBaseServer({
                port: 0,
                game: createFakeGame(),
                logger,
                exit,
                logsDirectory: fs.mkdtempSync(path.join(os.tmpdir(), 'war-base-server-')),
                shutdownTimeoutMs: 10,
                createSockets: () => sockets,
            })

            warBaseServer.shutdown('SIGINT')
            jest.advanceTimersByTime(10)

            expect(logger.error).toHaveBeenCalledWith('> Forced shutdown after timeout')
            expect(exit).toHaveBeenCalledWith(1)
        } finally {
            jest.useRealTimers()
        }
    })

    test('covers default server options and socket connection callback', () => {
        jest.useFakeTimers()
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

        try {
            const warBaseServer = createWarBaseServer()

            warBaseServer.appendRoomLog('DEFAULT', 'event:without-details')
            warBaseServer.sockets.close()
            jest.clearAllTimers()

            expect(warBaseServer.port).toBe(4000)
            expect(logSpy).not.toHaveBeenCalled()
            expect(errorSpy).not.toHaveBeenCalled()
        } finally {
            logSpy.mockRestore()
            errorSpy.mockRestore()
            jest.useRealTimers()
        }
    })

    test('listens without a callback and accepts port zero for ephemeral test servers', async () => {
        const sockets = createFakeSockets()
        const warBaseServer = createWarBaseServer({
            port: 0,
            game: createFakeGame(),
            logsDirectory: fs.mkdtempSync(path.join(os.tmpdir(), 'war-base-server-')),
            createSockets: () => sockets,
        })

        openServers.push(warBaseServer.server)
        const listeningServer = warBaseServer.listen()
        await new Promise(resolve => listeningServer.once('listening', resolve))

        expect(warBaseServer.port).toBe(0)
        expect(warBaseServer.server.address().port).toBeGreaterThan(0)
    })

    test('uses default socket event payloads and logger', () => {
        const game = createFakeGame()
        const socket = createFakeSocket()
        const appendRoomLog = jest.fn()
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

        try {
            registerSocketHandlers(socket, game, appendRoomLog)
            socket.handlers['create-match']()
            socket.handlers['join-match']()
            socket.handlers['move-player']()
            socket.handlers['game-action']()

            expect(game.createMatch).toHaveBeenCalledWith({ playerId: 'socket-1', gamerTag: undefined })
            expect(game.joinMatch).toHaveBeenCalledWith({ playerId: 'socket-1', gamerTag: undefined, hostKey: undefined })
            expect(game.movePlayer).toHaveBeenCalledWith({ playerId: 'socket-1', hostKey: 'ABCDE', keyPressed: undefined })
            expect(game.executeAction).toHaveBeenCalledWith({ playerId: 'socket-1', hostKey: 'ABCDE' })
        } finally {
            logSpy.mockRestore()
        }
    })


})
