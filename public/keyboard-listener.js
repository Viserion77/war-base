export default function createKeyboardListener(document) {
    const state = {
        observers: [],
        playerId: null,
        enabled: false,
    }

    const acceptedKeys = new Set([
        'ArrowUp',
        'ArrowRight',
        'ArrowDown',
        'ArrowLeft',
        'w',
        'a',
        's',
        'd',
        'W',
        'A',
        'S',
        'D',
    ])

    function registerPlayerId(playerId) {
        state.playerId = playerId
        state.enabled = true
    }

    function subscribe(observerFunction) {
        state.observers.push(observerFunction)
    }

    function unsubscribeAll() {
        state.observers = []
        state.enabled = false
    }

    function notifyAll(command) {
        for (const observerFunction of state.observers) {
            observerFunction(command)
        }
    }

    document.addEventListener('keydown', handleKeydown)

    function handleKeydown(event) {
        const keyPressed = event.key

        if (!state.enabled || !acceptedKeys.has(keyPressed)) {
            return
        }

        event.preventDefault()

        notifyAll({
            type: 'move-player',
            playerId: state.playerId,
            keyPressed,
        })
    }

    return {
        subscribe,
        unsubscribeAll,
        registerPlayerId,
    }
}
