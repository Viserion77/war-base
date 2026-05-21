export const BOARD_WIDTH = 48
export const BOARD_HEIGHT = 30
export const BOARD_SIZE = BOARD_WIDTH * BOARD_HEIGHT
export const BOARD_HISTORY_FRAMES = 3
export const SCALAR_INPUTS = [
    'coal',
    'knowledge',
    'baseLevel',
    'baseHealth',
    'coverCount',
    'taraqueCount',
    'perCount',
    'hefCount',
    'tujaiCount',
    'zunimCount',
    'capturerCount',
    'taraqueUnlocked',
    'perUnlocked',
    'hefUnlocked',
    'tujaiUnlocked',
    'visibleCapturableTargets',
    'visibleEnemyStructures',
    'visibleEnemyUnits',
    'rememberedEnemyStructures',
    'proximityToNearestKnownEnemyBase',
    'hasCaptureOrder',
    'aliveEnemyCount',
    'visibleTilesFraction',
    'tickFraction',
    'coverSlotRatio',
    'taraqueSlotRatio',
    'perSlotRatio',
    'hefSlotRatio',
    'tujaiSlotRatio',
    'cappedTypesFraction',
    'averageStructureLevelRatio',
    'baseUpgradeReady',
]
export const SCALAR_INPUT_SIZE = SCALAR_INPUTS.length
export const COMPOSITE_INPUT_SIZE = BOARD_HISTORY_FRAMES * BOARD_SIZE + SCALAR_INPUT_SIZE
export const PLACEMENT_STRUCTURE_TYPES = ['cover', 'taraque', 'per', 'hef', 'tujai', '_reservado']
export const PLACEMENT_INPUT_SIZE = COMPOSITE_INPUT_SIZE + PLACEMENT_STRUCTURE_TYPES.length
export const HEATMAP_OUTPUT_SIZE = BOARD_SIZE
export const ESTIMATED_GAME_LENGTH_TICKS = 3600

export const MACRO_ACTIONS = [
    'farm',
    'capture',
    'research',
    'defend',
    'attack',
    'upgrade',
    'upgrade-base',
    'scout',
    'wait',
]

export const FARM_ACTIONS = ['build-cover', 'build-taraque', 'capture-cover-target']
export const RESEARCH_ACTIONS = ['per', 'hef', 'tujai']
export const DEFEND_ACTIONS = ['build-per', 'build-hef', 'upgrade-defensive']
export const ATTACK_ACTIONS = ['build-tujai', 'spawn-zunim', 'build-forward-tower']

export const NETWORK_SPECS = {
    router: { inputs: COMPOSITE_INPUT_SIZE, hidden: 96, outputs: MACRO_ACTIONS.length },
    farm: { inputs: COMPOSITE_INPUT_SIZE, hidden: 48, outputs: FARM_ACTIONS.length },
    capture: { inputs: COMPOSITE_INPUT_SIZE, hidden: 96, outputs: HEATMAP_OUTPUT_SIZE },
    research: { inputs: COMPOSITE_INPUT_SIZE, hidden: 32, outputs: RESEARCH_ACTIONS.length },
    defend: { inputs: COMPOSITE_INPUT_SIZE, hidden: 48, outputs: DEFEND_ACTIONS.length },
    attack: { inputs: COMPOSITE_INPUT_SIZE, hidden: 48, outputs: ATTACK_ACTIONS.length },
    upgrade: { inputs: COMPOSITE_INPUT_SIZE, hidden: 64, outputs: HEATMAP_OUTPUT_SIZE },
    scout: { inputs: COMPOSITE_INPUT_SIZE, hidden: 64, outputs: HEATMAP_OUTPUT_SIZE },
    placement: { inputs: PLACEMENT_INPUT_SIZE, hidden: 128, outputs: HEATMAP_OUTPUT_SIZE },
    'target-capture': { inputs: COMPOSITE_INPUT_SIZE, hidden: 64, outputs: HEATMAP_OUTPUT_SIZE },
    'target-defend-upgrade': { inputs: COMPOSITE_INPUT_SIZE, hidden: 64, outputs: HEATMAP_OUTPUT_SIZE },
    'target-upgrade': { inputs: COMPOSITE_INPUT_SIZE, hidden: 64, outputs: HEATMAP_OUTPUT_SIZE },
}

export const NETWORK_NAMES = Object.keys(NETWORK_SPECS)
