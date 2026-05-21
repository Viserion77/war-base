export default class Matriz {
    constructor(linhas, colunas, conteudo = null) {
        this.linhas = linhas
        this.colunas = colunas
        this.conteudo = conteudo || Array.from({ length: linhas }, () => Array(colunas).fill(0))
    }

    static arrayParaMatriz(array) {
        const matriz = new Matriz(array.length, 1)

        return matriz.mapear((valor, linha) => array[linha])
    }

    static matrizParaArray(matriz) {
        const array = []

        matriz.mapear(valor => {
            array.push(valor)
            return valor
        })

        return array
    }

    static mapear(matriz, funcao) {
        return new Matriz(matriz.linhas, matriz.colunas).mapear((valor, linha, coluna) => {
            return funcao(matriz.conteudo[linha][coluna], linha, coluna)
        })
    }

    mapear(funcao) {
        this.conteudo = this.conteudo.map((linhaValores, linha) => {
            return linhaValores.map((valor, coluna) => funcao(valor, linha, coluna))
        })

        return this
    }

    static adicionar(matrizA, matrizB) {
        return Matriz.mapear(matrizA, (valor, linha, coluna) => valor + matrizB.conteudo[linha][coluna])
    }

    static subtrair(matrizA, matrizB) {
        return Matriz.mapear(matrizA, (valor, linha, coluna) => valor - matrizB.conteudo[linha][coluna])
    }

    static hadamard(matrizA, matrizB) {
        return Matriz.mapear(matrizA, (valor, linha, coluna) => valor * matrizB.conteudo[linha][coluna])
    }

    static escalarMultiplicar(matriz, escalar) {
        return Matriz.mapear(matriz, valor => valor * escalar)
    }

    static transpor(matriz) {
        return new Matriz(matriz.colunas, matriz.linhas).mapear((valor, linha, coluna) => {
            return matriz.conteudo[coluna][linha]
        })
    }

    static multiplicar(matrizA, matrizB) {
        return new Matriz(matrizA.linhas, matrizB.colunas).mapear((valor, linha, coluna) => {
            let soma = 0

            for (let indice = 0; indice < matrizA.colunas; indice += 1) {
                soma += matrizA.conteudo[linha][indice] * matrizB.conteudo[indice][coluna]
            }

            return soma
        })
    }

    aleatorizar(geradorAleatorio = Math.random) {
        return this.mapear(() => geradorAleatorio() * 2 - 1)
    }

    toJSON() {
        return {
            linhas: this.linhas,
            colunas: this.colunas,
            conteudo: this.conteudo,
        }
    }

    static fromJSON(json) {
        return new Matriz(json.linhas, json.colunas, json.conteudo)
    }
}
