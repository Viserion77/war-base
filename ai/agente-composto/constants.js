export const BOARD_WIDTH = 48
export const BOARD_HEIGHT = 30
export const BOARD_SIZE = BOARD_WIDTH * BOARD_HEIGHT
export const BOARD_HISTORY_FRAMES = 3
export const SCALAR_INPUTS = [
    'gold',
    'wisdom',
    'castleLevel',
    'castleHealth',
    'mineCount',
    'libraryCount',
    'archerCount',
    'catapultCount',
    'barracksCount',
    'soldierCount',
    'heraldCount',
    'libraryUnlocked',
    'archerUnlocked',
    'catapultUnlocked',
    'barracksUnlocked',
    'visibleCapturableTargets',
    'visibleEnemyStructures',
    'visibleEnemyUnits',
    'rememberedEnemyStructures',
    'proximityToNearestKnownEnemyCastle',
    'hasCaptureOrder',
    'aliveEnemyCount',
    'visibleTilesFraction',
    'tickFraction',
    'mineSlotRatio',
    'librarySlotRatio',
    'archerSlotRatio',
    'catapultSlotRatio',
    'barracksSlotRatio',
    'cappedTypesFraction',
    'averageStructureLevelRatio',
    'castleUpgradeReady',
]
export const SCALAR_INPUT_SIZE = SCALAR_INPUTS.length
export const COMPOSITE_INPUT_SIZE = BOARD_HISTORY_FRAMES * BOARD_SIZE + SCALAR_INPUT_SIZE
export const STRUCTURE_TYPES = ['castle', 'mine', 'library', 'archer', 'catapult', 'barracks']
export const NPC_TYPES = ['herald', 'soldier']
export const RESOURCE_TYPES = ['gold', 'wisdom']
export const RESEARCH_TYPES = ['archer', 'catapult', 'barracks']
export const PLACEMENT_STRUCTURE_TYPES = ['mine', 'library', 'archer', 'catapult', 'barracks', '_reserved']
export const PLACEMENT_INPUT_SIZE = COMPOSITE_INPUT_SIZE + PLACEMENT_STRUCTURE_TYPES.length
export const HEATMAP_OUTPUT_SIZE = BOARD_SIZE
export const ESTIMATED_GAME_LENGTH_TICKS = 3600

export const MACRO_ACTIONS = [
    'farm',
    'research',
    'defend',
    'attack',
    'upgrade',
    'upgrade-castle',
    'wait',
]

export const FARM_ACTIONS = ['build-mine', 'build-library']
export const RESEARCH_ACTIONS = RESEARCH_TYPES
export const DEFEND_ACTIONS = ['build-archer', 'build-catapult', 'upgrade-defensive']
export const ATTACK_ACTIONS = ['build-barracks', 'spawn-soldier', 'build-forward-tower']

export const NETWORK_SPECS = {
    router: { inputs: COMPOSITE_INPUT_SIZE, hidden: 96, outputs: MACRO_ACTIONS.length },
    farm: { inputs: COMPOSITE_INPUT_SIZE, hidden: 48, outputs: FARM_ACTIONS.length },
    research: { inputs: COMPOSITE_INPUT_SIZE, hidden: 32, outputs: RESEARCH_ACTIONS.length },
    defend: { inputs: COMPOSITE_INPUT_SIZE, hidden: 48, outputs: DEFEND_ACTIONS.length },
    attack: { inputs: COMPOSITE_INPUT_SIZE, hidden: 48, outputs: ATTACK_ACTIONS.length },
    upgrade: { inputs: COMPOSITE_INPUT_SIZE, hidden: 64, outputs: HEATMAP_OUTPUT_SIZE },
    placement: { inputs: PLACEMENT_INPUT_SIZE, hidden: 128, outputs: HEATMAP_OUTPUT_SIZE },
    'target-defend-upgrade': { inputs: COMPOSITE_INPUT_SIZE, hidden: 64, outputs: HEATMAP_OUTPUT_SIZE },
    'target-upgrade': { inputs: COMPOSITE_INPUT_SIZE, hidden: 64, outputs: HEATMAP_OUTPUT_SIZE },
}

export const NETWORK_NAMES = Object.keys(NETWORK_SPECS)
