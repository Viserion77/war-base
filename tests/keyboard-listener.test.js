import { describe, expect, test } from '@jest/globals'
import createKeyboardListener from '../public/keyboard-listener.js'

function createDocument() {
    const listeners = {}

    return {
        addEventListener(type, listener) {
            listeners[type] = listener
        },
        removeEventListener(type, listener) {
            if (listeners[type] === listener) {
                delete listeners[type]
            }
        },
        dispatch(type, event) {
            if (listeners[type]) {
                listeners[type](event)
            }
        },
    }
}

function createEvent(key, target = null) {
    return {
        key,
        target,
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

    test('normalizes accepted keys and ignores disabled, unsupported, or editable targets', () => {
        const document = createDocument()
        const keyboard = createKeyboardListener(document)
        const commands = []
        const disabledEvent = createEvent('w')
        const unsupportedEvent = createEvent('x')
        const editableEvent = createEvent('w', {
            isContentEditable: false,
            matches: selector => selector.includes('input'),
        })
        const uppercaseEvent = createEvent('W')

        keyboard.subscribe(command => commands.push(command))
        document.dispatch('keydown', disabledEvent)
        keyboard.registerPlayerId('player-1')
        document.dispatch('keydown', unsupportedEvent)
        document.dispatch('keydown', editableEvent)
        document.dispatch('keydown', uppercaseEvent)

        expect(disabledEvent.prevented).toBe(false)
        expect(unsupportedEvent.prevented).toBe(false)
        expect(editableEvent.prevented).toBe(false)
        expect(uppercaseEvent.prevented).toBe(true)
        expect(commands).toEqual([{ type: 'move-player', playerId: 'player-1', keyPressed: 'w' }])
    })

    test('unsubscribe callbacks, unsubscribeAll, and destroy clear movement listeners', () => {
        const document = createDocument()
        const keyboard = createKeyboardListener(document)
        const commands = []
        const unsubscribedEvent = createEvent('ArrowUp')
        const disabledEvent = createEvent('ArrowUp')
        const afterDestroyEvent = createEvent('ArrowDown')

        const unsubscribe = keyboard.subscribe(command => commands.push(command))
        keyboard.registerPlayerId('player-1')
        unsubscribe()
        unsubscribe()
        document.dispatch('keydown', unsubscribedEvent)
        keyboard.subscribe(command => commands.push(command))
        keyboard.unsubscribeAll()
        document.dispatch('keydown', disabledEvent)
        keyboard.registerPlayerId('player-1')
        keyboard.destroy()
        document.dispatch('keydown', afterDestroyEvent)

        expect(unsubscribedEvent.prevented).toBe(true)
        expect(disabledEvent.prevented).toBe(false)
        expect(afterDestroyEvent.prevented).toBe(false)
        expect(commands).toEqual([])
    })
})
