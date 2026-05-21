import Matriz from './matriz.js'

function sigmoid(valor) {
    return 1 / (1 + Math.exp(-valor))
}

function sigmoidDerivada(valor) {
    return valor * (1 - valor)
}

export default class RedeNeural {
    constructor(neuroniosEntrada, neuroniosOcultos, neuroniosSaida, opcoes = {}) {
        this.neuroniosEntrada = neuroniosEntrada
        this.neuroniosOcultos = neuroniosOcultos
        this.neuroniosSaida = neuroniosSaida
        this.taxaAprendizado = opcoes.taxaAprendizado ?? 0.1

        const aleatorio = opcoes.aleatorio || Math.random

        this.biasEntradaOculta = new Matriz(neuroniosOcultos, 1).aleatorizar(aleatorio)
        this.biasOcultaSaida = new Matriz(neuroniosSaida, 1).aleatorizar(aleatorio)
        this.pesosEntradaOculta = new Matriz(neuroniosOcultos, neuroniosEntrada).aleatorizar(aleatorio)
        this.pesosOcultaSaida = new Matriz(neuroniosSaida, neuroniosOcultos).aleatorizar(aleatorio)
    }

    treinar(arrayEntrada, arrayResposta) {
        const entrada = Matriz.arrayParaMatriz(arrayEntrada)
        const oculta = Matriz
            .adicionar(Matriz.multiplicar(this.pesosEntradaOculta, entrada), this.biasEntradaOculta)
            .mapear(sigmoid)
        const saida = Matriz
            .adicionar(Matriz.multiplicar(this.pesosOcultaSaida, oculta), this.biasOcultaSaida)
            .mapear(sigmoid)

        const resposta = Matriz.arrayParaMatriz(arrayResposta)
        const erroSaida = Matriz.subtrair(resposta, saida)
        const gradienteSaida = Matriz.escalarMultiplicar(
            Matriz.hadamard(Matriz.mapear(saida, sigmoidDerivada), erroSaida),
            this.taxaAprendizado,
        )

        const deltaPesosOcultaSaida = Matriz.multiplicar(gradienteSaida, Matriz.transpor(oculta))
        const pesosOcultaSaidaAntes = this.pesosOcultaSaida

        this.pesosOcultaSaida = Matriz.adicionar(this.pesosOcultaSaida, deltaPesosOcultaSaida)
        this.biasOcultaSaida = Matriz.adicionar(this.biasOcultaSaida, gradienteSaida)

        const erroOculta = Matriz.multiplicar(Matriz.transpor(pesosOcultaSaidaAntes), erroSaida)
        const gradienteOculta = Matriz.escalarMultiplicar(
            Matriz.hadamard(Matriz.mapear(oculta, sigmoidDerivada), erroOculta),
            this.taxaAprendizado,
        )

        this.pesosEntradaOculta = Matriz.adicionar(
            this.pesosEntradaOculta,
            Matriz.multiplicar(gradienteOculta, Matriz.transpor(entrada)),
        )
        this.biasEntradaOculta = Matriz.adicionar(this.biasEntradaOculta, gradienteOculta)
    }

    prever(arrayEntrada) {
        const entrada = Matriz.arrayParaMatriz(arrayEntrada)
        const oculta = Matriz
            .adicionar(Matriz.multiplicar(this.pesosEntradaOculta, entrada), this.biasEntradaOculta)
            .mapear(sigmoid)
        const saida = Matriz
            .adicionar(Matriz.multiplicar(this.pesosOcultaSaida, oculta), this.biasOcultaSaida)
            .mapear(sigmoid)

        return Matriz.matrizParaArray(saida)
    }

    toJSON() {
        return {
            tipo: 'war-base-rede-neural',
            neuroniosEntrada: this.neuroniosEntrada,
            neuroniosOcultos: this.neuroniosOcultos,
            neuroniosSaida: this.neuroniosSaida,
            taxaAprendizado: this.taxaAprendizado,
            pesosEntradaOculta: this.pesosEntradaOculta.toJSON(),
            pesosOcultaSaida: this.pesosOcultaSaida.toJSON(),
            biasEntradaOculta: this.biasEntradaOculta.toJSON(),
            biasOcultaSaida: this.biasOcultaSaida.toJSON(),
        }
    }

    static fromJSON(json) {
        const rede = new RedeNeural(json.neuroniosEntrada, json.neuroniosOcultos, json.neuroniosSaida, {
            taxaAprendizado: json.taxaAprendizado,
            aleatorio: () => 0,
        })

        rede.pesosEntradaOculta = Matriz.fromJSON(json.pesosEntradaOculta)
        rede.pesosOcultaSaida = Matriz.fromJSON(json.pesosOcultaSaida)
        rede.biasEntradaOculta = Matriz.fromJSON(json.biasEntradaOculta)
        rede.biasOcultaSaida = Matriz.fromJSON(json.biasOcultaSaida)

        return rede
    }
}

export const ativacoes = {
    sigmoid,
    sigmoidDerivada,
}
