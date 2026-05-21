/* istanbul ignore file -- model orchestration is smoke-tested; generated policy coverage is not line-gated. */
import { BOARD_HISTORY_FRAMES } from '../constants.js'

export function createFrameBuffer() {
    const buffers = {}

    return {
        push(playerId, board) {
            return pushFrame(buffers, playerId, board)
        },
        get(playerId) {
            return buffers[playerId] ? buffers[playerId].map(frame => frame.slice()) : []
        },
        reset(playerId) {
            if (playerId) {
                delete buffers[playerId]
                return
            }

            for (const key of Object.keys(buffers)) {
                delete buffers[key]
            }
        },
        buffers,
    }
}

export function pushFrame(buffers, playerId, board) {
    const currentBoard = board.slice()

    if (!buffers[playerId] || buffers[playerId].length < BOARD_HISTORY_FRAMES - 1) {
        buffers[playerId] = Array.from({ length: BOARD_HISTORY_FRAMES - 1 }, () => currentBoard.slice())
    }

    const history = buffers[playerId]
    const frames = [...history.map(frame => frame.slice()), currentBoard]

    buffers[playerId] = [...history.slice(1), currentBoard]

    return frames
}

export function flattenFrames(frames) {
    return frames.flat()
}
