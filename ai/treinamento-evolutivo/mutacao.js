export function cloneAndMutate(networkJson, sigma = 0.05, random = Math.random) {
    const cloned = deepClone(networkJson)

    mutateMatrix(cloned.inputHiddenWeights, sigma, random)
    mutateMatrix(cloned.hiddenOutputWeights, sigma, random)
    mutateMatrix(cloned.inputHiddenBias, sigma, random)
    mutateMatrix(cloned.hiddenOutputBias, sigma, random)

    return cloned
}

export function cloneAndMutateAll(networksJsonMap, sigma = 0.05, random = Math.random) {
    const mutated = {}

    for (const name of Object.keys(networksJsonMap)) {
        mutated[name] = cloneAndMutate(networksJsonMap[name], sigma, random)
    }

    return mutated
}

export function deepClone(value) {
    return JSON.parse(JSON.stringify(value))
}

export function mutateMatrix(matrix, sigma, random) {
    if (!matrix || !Array.isArray(matrix.content)) {
        return matrix
    }

    matrix.content = matrix.content.map(row => {
        return row.map(value => value + sampleGaussian(random) * sigma)
    })

    return matrix
}

export function sampleGaussian(random = Math.random) {
    const u1 = Math.max(random(), 1e-9)
    const u2 = random()
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}
