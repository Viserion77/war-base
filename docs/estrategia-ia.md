# Estrategia De Inteligencia Artificial

Este documento descreve a estrategia de inteligencia artificial atual do War Base: um agente composto, treinavel de forma supervisionada, que joga com o mesmo estado filtrado por fog of war recebido por jogadores humanos.

## Visao Geral

A IA e um jogador interno adicionado pelo servidor. A cada ciclo de decisao, ela recebe o estado publico filtrado para o proprio `playerId`, codifica o mapa visivel e a memoria de ultima visao, e passa esse input para um conjunto hierarquico de redes neurais.

O fluxo principal e:

1. O servidor adiciona um jogador interno controlado por IA.
2. O agente composto monta o input com 3 frames do tabuleiro espectral e 30 escalares.
3. A rede `router` escolhe a macro-acao: `farm`, `capture`, `research`, `defend`, `attack`, `upgrade`, `upgrade-base`, `scout` ou `wait`.
4. A sub-rede da macro-acao decide o detalhe: alvo, tile de construcao, pesquisa ou spawn.
5. Os validadores deterministicos conferem recursos, requisitos, alcance e ocupacao do mapa.
6. A primeira decisao valida vira um comando do jogo.

Quando os arquivos treinados em `ai/agente-composto/redes/` ainda nao existem, o agente usa uma fallback heuristica simples para continuar funcional sem ressuscitar o agente antigo.

## Fog Of War

A IA nao enxerga o estado completo da sala. O motor calcula uma `fogMask` por jogador com base no `sightRange` de bases, estruturas e unidades. Estruturas inimigas ou neutras vistas antes ficam em `memory.structures` como ultimo avistamento, mas unidades e jogadores nao sao memorizados.

Isso faz a IA decidir com a mesma informacao espacial que um humano teria: alvos fora da visao so entram no plano se foram lembrados como estruturas.

## Codificacao Do Input

Cada decisao usa:

- 3 frames do tabuleiro 48x30, codificados como valores espectrais em um vetor achatado;
- 30 escalares de economia, tecnologia, composicao, alvos visiveis, memoria, inimigos vivos, fracao visivel do mapa, tick da partida e ocupacao dos slots de construcao.

O tamanho final do input padrao e `4350` floats. A rede compartilhada de placement recebe mais 6 valores one-hot para o tipo de estrutura, totalizando `4356` floats.

## Redes

Arquitetura principal:

- `router`: escolhe a macro-acao.
- `farm`: decide entre construir Cover, construir Taraque ou capturar Cover.
- `capture`: escolhe um alvo capturavel no mapa visivel/memorizado.
- `research`: escolhe Per, Hef ou Tujai.
- `defend`: decide torre defensiva ou upgrade defensivo.
- `attack`: decide Tujai, Zunim ou torre avancada.
- `upgrade`: escolhe estrutura propria nao-base para evoluir quando houver teto liberado.
- `upgrade-base`: prioriza a Base quando slots de construcao estao cheios.
- `scout`: escolhe tile para mover o Capturador.
- `placement`: heatmap compartilhado para tiles de construcao.
- `target-*`: heatmaps especializados para alvos.

Todas usam a infraestrutura feedforward em `ai/rede-neural/`.

## Validadores Deterministicos

A camada em `ai/agente-composto/validadores.js` continua essencial. Ela impede comandos ilegais e transforma scores em acoes concretas. Exemplos:

- construcoes precisam de carvao, requisitos liberados, tile livre, alcance de construcao e slot disponivel em `catalog.limits`;
- pesquisas precisam de conhecimento e nivel minimo de Taraque;
- upgrades so podem mirar estruturas proprias ativas com carvao suficiente; estruturas nao-base tambem precisam estar abaixo do nivel da Base;
- capturas so miram estruturas capturaveis visiveis ou lembradas;
- scout usa `move-capturer-to` para explorar tiles sob fog.

## Treinamento

O treinamento continua supervisionado, mas agora usa datasets independentes por rede em `ai/agente-composto/treino/dataset-*.js`.

Para treinar todas as redes:

```bash
npm run train:ai
```

O comando grava modelos JSON em `ai/agente-composto/redes/`. O numero de epocas pode ser reduzido ou aumentado com a variavel `WAR_BASE_AI_EPOCHS`.

## Limites Atuais

A IA composta ainda nao usa reinforcement learning, self-play ou CNNs. O tabuleiro e vetorizado, e os datasets iniciais sao pequenos. O desenho, porem, deixa a evolucao mais direta: cada rede pode ganhar exemplos novos sem reescrever o agente inteiro.

## Arquivos Relacionados

- `ai/rede-neural/matriz.js`: operacoes de matriz usadas pela rede.
- `ai/rede-neural/rede-neural.js`: implementacao feedforward com treinamento por backpropagation.
- `ai/agente-composto/agente-composto.js`: orquestrador hierarquico.
- `ai/agente-composto/validadores.js`: validacao e montagem de comandos.
- `ai/agente-composto/codificacao/`: tabuleiro espectral, escalares e historico.
- `ai/agente-composto/treino/`: datasets e scripts de treino.
- `public/game.js`: fog of war, memoria e integracao das decisoes ao jogo.
- `server.js`: integra o agente composto ao ciclo da sala e ao comando de adicionar IA.
