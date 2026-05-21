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
    ])

    function registerPlayerId(playerId) {
        state.playerId = playerId
        state.enabled = true
    }

    function subscribe(observerFunction) {
        state.observers.push(observerFunction)

        return () => unsubscribe(observerFunction)
    }

    function unsubscribe(observerFunction) {
        const index = state.observers.indexOf(observerFunction)

        if (index >= 0) {
            state.observers.splice(index, 1)
        }
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
        const keyPressed = normalizeKey(event.key)

        if (!state.enabled || isEditableTarget(event.target) || !acceptedKeys.has(keyPressed)) {
            return
        }

        event.preventDefault()

        notifyAll({
            type: 'move-player',
            playerId: state.playerId,
            keyPressed,
        })
    }

    function destroy() {
        unsubscribeAll()
        document.removeEventListener('keydown', handleKeydown)
    }

    return {
        subscribe,
        unsubscribeAll,
        registerPlayerId,
        destroy,
    }
}

function normalizeKey(key) {
    return key.length === 1 ? key.toLowerCase() : key
}

function isEditableTarget(target) {
    return Boolean(target && (target.isContentEditable || target.matches('input, textarea, select')))
}
