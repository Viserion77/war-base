export const DEFAULT_SCORE_RULES = Object.freeze({
    'structure:destroyed': -50,
    'upgrade:success': 20,
    'build:success': 30,
    'research:success': 30,
    'unit:created': 1,
    'unit:killed': 1,
})

export function createScoreboard(playerIds, rules = DEFAULT_SCORE_RULES) {
    const scores = {}
    const breakdown = {}

    for (const playerId of playerIds) {
        scores[playerId] = 0
        breakdown[playerId] = createEventBreakdown(rules)
    }

    function applyEvent(entry) {
        const delta = computeDelta(entry, rules)

        if (!delta) {
            return null
        }

        if (!Object.prototype.hasOwnProperty.call(scores, delta.ownerId)) {
            scores[delta.ownerId] = 0
            breakdown[delta.ownerId] = createEventBreakdown(rules)
        }

        scores[delta.ownerId] += delta.points
        breakdown[delta.ownerId][delta.event] = (breakdown[delta.ownerId][delta.event] || 0) + 1

        return {
            ownerId: delta.ownerId,
            event: delta.event,
            points: delta.points,
            total: scores[delta.ownerId],
        }
    }

    function getScores() {
        return { ...scores }
    }

    function getBreakdown() {
        const copy = {}

        for (const playerId of Object.keys(breakdown)) {
            copy[playerId] = { ...breakdown[playerId] }
        }

        return copy
    }

    function getLeader() {
        const entries = Object.entries(scores)

        if (!entries.length) {
            return null
        }

        return entries.reduce((best, current) => current[1] > best[1] ? current : best)[0]
    }

    return {
        applyEvent,
        getScores,
        getBreakdown,
        getLeader,
    }
}

export function computeDelta(entry, rules = DEFAULT_SCORE_RULES) {
    if (!entry || !rules[entry.event]) {
        return null
    }

    const ownerId = resolveOwnerId(entry)

    if (!ownerId) {
        return null
    }

    return {
        ownerId,
        event: entry.event,
        points: rules[entry.event],
    }
}

function resolveOwnerId(entry) {
    if (entry.event === 'unit:killed') {
        return (entry.details && entry.details.killerOwnerId) || null
    }

    return (entry.details && entry.details.ownerId) || null
}

function createEventBreakdown(rules) {
    const counts = {}

    for (const event of Object.keys(rules)) {
        counts[event] = 0
    }

    return counts
}
