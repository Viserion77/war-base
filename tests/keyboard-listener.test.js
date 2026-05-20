import { describe, expect, test } from '@jest/globals'
import createKeyboardListener from '../public/keyboard-listener.js'

function createDocument() {
    const listeners = {}

    return {
        addEventListener(type, listener) {
            listeners[type] = listener
        },
        dispatch(type, event) {
            listeners[type](event)
        },
    }
}

function createEvent(key) {
    return {
        key,
        prevented: false,
        preventDefault() {
            this.prevented = true
        },
    }
}

describe('createKeyboardListener', () => {
    test('notifies subscribers for accepted keys after player registration', () => {
        const document = createDocument()
        const keyboard = createKeyboardListener(document)
        const commands = []
        const event = createEvent('w')

        keyboard.subscribe(command => commands.push(command))
        keyboard.registerPlayerId('player-1')
        document.dispatch('keydown', event)

        expect(event.prevented).toBe(true)
        expect(commands).toEqual([
            {
                type: 'move-player',
                playerId: 'player-1',
                keyPressed: 'w',
            },
        ])
    })

    test('ignores keys while disabled and ignores unsupported keys', () => {
        const document = createDocument()
        const keyboard = createKeyboardListener(document)
        const commands = []
        const disabledEvent = createEvent('w')
        const unsupportedEvent = createEvent('x')

        keyboard.subscribe(command => commands.push(command))
        document.dispatch('keydown', disabledEvent)
        keyboard.registerPlayerId('player-1')
        document.dispatch('keydown', unsupportedEvent)

        expect(disabledEvent.prevented).toBe(false)
        expect(unsupportedEvent.prevented).toBe(false)
        expect(commands).toEqual([])
    })

    test('unsubscribeAll clears subscribers and disables movement', () => {
        const document = createDocument()
        const keyboard = createKeyboardListener(document)
        const commands = []
        const event = createEvent('ArrowUp')

        keyboard.subscribe(command => commands.push(command))
        keyboard.registerPlayerId('player-1')
        keyboard.unsubscribeAll()
        document.dispatch('keydown', event)

        expect(event.prevented).toBe(false)
        expect(commands).toEqual([])
    })
})
