# PRD — Treinamento Evolutivo Por Geracoes Com Visualizacao Da Rede

Status: rascunho para revisao · Autor: planejamento conduzido por Claude · Data: 2026-05-22

Este documento descreve uma nova pagina de **treinamento evolutivo** para a IA composta do War Base. O jogador configura uma sala de batalha entre 2 e 8 IAs, o servidor simula essa partida em modo headless acelerado, a IA vencedora vira **pai da proxima geracao** e e clonada em variacoes ligeiramente mutadas. Em paralelo, a pagina exibe um canvas animado da rede `router` da IA campea, com nos sendo ativados em tempo real conforme ela decide. Um segundo modo de jogo, baseado em **pontuacao por eventos**, vira criterio alternativo de vitoria — quando ativo, a IA com mais pontos ao fim da partida e a vencedora.

---

## 1. Objetivos

1. Adicionar uma pagina dedicada ao treinamento evolutivo da IA composta, separada do fluxo normal de partida.
2. Permitir configurar uma sala FFA com 2 a 8 IAs (slider), cada uma com seu proprio conjunto de redes.
3. Rodar geracoes encadeadas: vencedor da rodada vira pai, e clones mutados disputam a proxima.
4. Persistir os pesos da IA campea em arquivos JSON commitaveis (`ai/treinamento-evolutivo/best/` e historico por geracao).
5. Visualizar a rede `router` em tempo real: nos ativados, magnitude das ativacoes, macro-acao escolhida e sub-rede acionada. A rede mostrada e sempre a do **pai da geracao atual** (vencedor da geracao anterior).
6. Implementar um modo de vitoria por pontuacao, contabilizando eventos de jogo (construcoes, upgrades, pesquisas, tropas, perdas) em um placar visivel.

## 2. Nao-Objetivos

- Nao implementar reinforcement learning, gradient descent durante a partida ou self-play coevolutivo entre populacoes paralelas. A evolucao aqui e por **mutacao gaussiana simples + selecao** (algoritmo genetico minimalista).
- Nao trocar a arquitetura da rede composta (descrita em [docs/prd-ia-composta.md](docs/prd-ia-composta.md)) — o treinamento evolutivo opera sobre as **mesmas 9 redes** ja existentes em `ai/agente-composto/redes/`.
- Nao renderizar a partida headless de treino tile a tile no cliente. A UI mostra placar, status de cada IA viva, e o canvas da rede; o motor do jogo roda no servidor sem visualizar o tabuleiro durante o treino.
- Nao remover o treino supervisionado existente (`npm run train:ai`). O evolutivo e um **segundo pipeline** complementar; o supervisionado continua disponivel para bootstrapping.
- Nao versionar checkpoints intermediarios automaticamente no git (so o `best/` deve ser commitavel; checkpoints por geracao ficam em diretorio gitignorado por padrao).

## 3. Decisoes Ja Alinhadas

| Decisao | Valor escolhido |
|---|---|
| Formato dos confrontos | **FFA com 2-8 IAs configuravel**, uma sala por geracao |
| Onde roda o treino | **Servidor Node.js, headless e acelerado**, sem renderizacao em tela |
| Papel do modo pontuacao | **Score determina o vencedor** quando o modo esta ativo (substitui sobrevivencia como criterio) |
| Visualizacao da rede neural | **Router NN focada** (com sub-rede acionada destacada como caixa abaixo) |
| Elitismo | **1 pai (sem mutacao) + N-1 clones mutados** por geracao |

---

## 4. Modelo De Evolucao

### 4.1 Ciclo Geracional

```
Geracao G:
  - Carrega ou inicializa um "pai" (conjunto de 9 redes).
  - Cria N-1 clones mutados (N = 2..8 IAs configurado).
  - Junta pai + clones em uma sala FFA headless.
  - Simula a partida ate vitoria ou timeout.
  - Determina vencedor (sobrevivencia OU score, conforme modo).
  - Salva o vencedor como novo "pai" da geracao G+1.
  - Persiste checkpoint em ai/treinamento-evolutivo/checkpoints/gen-<G>/.
  - Atualiza ai/treinamento-evolutivo/best/ se o vencedor superou o recorde.
  - Avanca para geracao G+1 ate o usuario clicar "Parar".
```

### 4.2 Mutacao De Pesos

Cada clone recebe uma copia profunda dos JSONs do pai (incluindo as 4 matrizes da rede feedforward: `inputHiddenWeights`, `hiddenOutputWeights`, `inputHiddenBias`, `hiddenOutputBias`). Cada celula da matriz e perturbada por uma amostra gaussiana:

```
peso_novo = peso_antigo + N(0, sigma)
```

Onde `sigma` e configuravel no painel de treino (default `0.05`). O pai **nao** sofre mutacao — ele entra na partida exatamente como saiu da geracao anterior. Isso garante **elitismo**: o melhor agente nunca regride.

A mutacao aplica-se a **todas as 9 redes** do agente composto, em cada clone. Cada clone tem seu proprio `seed` de mutacao para que clones diferentes divirjam.

### 4.3 Inicializacao Da Geracao Zero

Tres caminhos possiveis, escolhidos no painel:

- **Continuar do `best/`**: carrega os pesos salvos em `ai/treinamento-evolutivo/best/*.json` como pai inicial.
- **Continuar do treino supervisionado**: carrega `ai/agente-composto/redes/*.json` como pai inicial. Util para bootstrapping com `npm run train:ai`.
- **Zerar (pesos aleatorios)**: instancia novas `NeuralNetwork(spec.inputs, spec.hidden, spec.outputs)` para cada rede, usando `Math.random` (mesmo `randomize` ja usado em [ai/rede-neural/rede-neural.js:20](ai/rede-neural/rede-neural.js#L20)).

### 4.4 Criterio De Vitoria

Configuravel via toggle no painel:

| Modo | Como define vencedor |
|---|---|
| **Sobrevivencia** (default) | Ultima IA com castelo ativo vence. Igual a regra atual do jogo. Se a partida atinge timeout (proposta: 3000 ticks), vence quem tem mais integridade total de castelo. |
| **Pontuacao** | Eventos pontuam ao longo da partida. Ao final (todos eliminados ou timeout), vence a IA com **maior score acumulado**, independente de estar viva. |

### 4.5 Tabela De Pontuacao (Modo Score)

| Evento | Pontos |
|---|---|
| Construcao propria perdida (estrutura destruida) | **-50** |
| Upgrade concluido em estrutura propria | **+20** |
| Construcao propria finalizada | **+30** |
| Pesquisa concluida | **+30** |
| Tropa inimiga abatida pelas proprias forcas | **+1** |
| Tropa propria criada (Arauto/Soldado) | **+1** |

Notas:

- "Construcao perdida" conta quando uma estrutura **propria** vai a zero de integridade. Captura de estrutura **propria** por inimigo nao conta como perda nesta tabela (pode ser revisado se o user quiser).
- "Tropa inimiga abatida" exige rastrear o atacante final. O `processCaptureUnitOrders` e a logica de torres ja sabem quem ataca — basta emitir um evento `unit:killed` com `{ killerOwnerId, victimOwnerId }`.
- "Tropa propria criada" inclui Arauto respawn e Soldados comprados no Quartel.

### 4.6 Tamanho Da Populacao

O slider varia de **2 a 8 IAs**. Para cada N escolhido:

- Geracao tem N agentes (1 pai + N-1 clones mutados).
- Quando N=2, o pai disputa contra 1 unico clone mutado. Cenario de "duelo binario" — selecao mais lenta mas com baixo custo de simulacao.
- Quando N=8, FFA cheio com 1 pai + 7 clones. Maior pressao seletiva por geracao, custo de tick maior.

---

## 5. Motor De Treino Headless

### 5.1 Sala Sem Sockets

Hoje [public/game.js:283](public/game.js#L283) (`setState`) e o tick interno do `createGame` rodam atraves de timers controlados pelo `start()`. Treino headless precisa contornar isso:

1. Nao usar `start()` do `createGame`. Em vez disso, instanciar uma `room` "crua" via funcao exportada nova `createTrainingRoom(catalog)` em `public/game.js`.
2. Em vez do `setInterval` da sala normal, o motor chama `tickRoom(room)` em loop sincrono (ou via `setImmediate` para nao bloquear o event loop por completo).
3. Sockets nao emitem nada durante a simulacao. So eventos agregados (`generation:progress`, `match:event`, `decision:snapshot`) viajam para o cliente.

### 5.2 Multiplos Agentes Na Mesma Sala

Hoje o `createCompositeWarBaseAgent` retorna **um unico agente compartilhado** entre todas as IAs da sala — eles compartilham as redes e o `frameBuffer` (que ja e indexado por `playerId`). Para o treino evolutivo, cada IA precisa de **suas proprias redes**.

Refatoracao minima necessaria:

- Adicionar parametro opcional `getAgentForPlayer(playerId)` em `createGame`. Se presente, sobrescreve o `aiAgent` global por jogador.
- Em tempo de treino, o motor passa um mapeamento `playerId -> agentInstance`, cada um com networks proprias.

### 5.3 Tick Acelerado

A partida real tem cooldown de 1000ms ([ai/agente-composto/agente-composto.js:37](ai/agente-composto/agente-composto.js#L37)) e ticks fisicos do servidor a cada poucos ms. No headless o "tempo" e abstrato:

- Cada chamada de `tickRoom(room)` avanca a logica em 1 unidade.
- Cooldown da IA passa a ser medido em **ticks** durante o treino, nao em ms reais. Proposta: `cooldownTicks = 1` (a IA decide a cada tick) para acelerar maximamente.
- A simulacao roda em laco apertado ate `room.winner` ser definido ou `room.tick >= MAX_TRAINING_TICKS` (proposta: 3000).

### 5.4 Coleta De Eventos Para Score

O `debugLog` ja existe ([public/game.js:257](public/game.js#L257)) e e usado para auditoria. O treino se subscreve nele:

```js
game.subscribeDebug(entry => {
  if (entry.event === 'structure:destroyed') incrementScore(entry.details.ownerId, -50)
  if (entry.event === 'upgrade:success')      incrementScore(entry.details.ownerId, +20)
  if (entry.event === 'build:success')        incrementScore(entry.details.ownerId, +30)
  if (entry.event === 'research:success')     incrementScore(entry.details.ownerId, +30)
  if (entry.event === 'unit:created')         incrementScore(entry.details.ownerId, +1)
  if (entry.event === 'unit:killed')          incrementScore(entry.details.killerOwnerId, +1)
})
```

Alguns desses eventos ja existem (`upgrade:success`); outros precisam ser **adicionados** ao `public/game.js` para serem capturados (ver §8). A escolha pelo `debugLog` mantem o motor de jogo desacoplado do treino — ele so emite eventos; o treino interpreta.

### 5.5 Snapshot De Decisao Da IA Campea

Para alimentar a visualizacao da rede em tempo real, o motor captura snapshots da rede `router` do **pai** (campeao atual) toda vez que ele decide:

```js
// Dentro de decideWithNetworks, quando o agente e marcado como "champion":
const macroScores = predictNetwork(networks.router, input)
const hiddenActivations = computeRouterHidden(networks.router, input) // helper novo
emit('decision:snapshot', {
  generation: G,
  inputSummary: summarizeInput(input),   // resumo agregado, nao 4344 floats brutos
  hiddenActivations,                     // 96 floats
  macroScores,                           // 7 floats
  chosenMacro,                           // string
  subnetworkActivated,                   // 'farm' | 'defend' | ... | null
})
```

Throttle: maximo **5 snapshots por segundo** enviados ao cliente, mesmo que a IA decida varias vezes por tick.

---

## 6. Visualizacao Da Rede Neural

### 6.1 Layout Geral Do Canvas

Canvas dedicado de ~900x600 px na pagina `training.html`. Tres camadas verticais:

```
┌────────────────────────────────────────────────────────────────────┐
│  INPUT (4344 floats — agrupado visualmente)                        │
│  ┌──────────────┬───────────────────────────────────┬───────────┐  │
│  │ Board T-2    │ Board T-1                         │ Board T0  │  │
│  │ 30x48 minimap│ (mesmo) com cores espectrais      │ (mesmo)   │  │
│  └──────────────┴───────────────────────────────────┴───────────┘  │
│  Escalares: 32 barras horizontais (gold, wisdom, castleLevel...)   │
└────────────────────────────────────────────────────────────────────┘
                              │ │ │ ... 
                              ▼ ▼ ▼
┌────────────────────────────────────────────────────────────────────┐
│  HIDDEN (96 neuronios — circulos numa grade 12x8)                  │
│  Brilho do circulo = magnitude da ativacao no momento.             │
│  Linhas para os outputs com alpha proporcional ao peso absoluto.   │
└────────────────────────────────────────────────────────────────────┘
                              │ │ │ ... 
                              ▼ ▼ ▼
┌────────────────────────────────────────────────────────────────────┐
│  OUTPUT (7 macro-acoes — barras horizontais)                       │
│  farm | research | defend | attack | upgrade | upgrade-castle | wait│
│  Barra mais brilhante = score mais alto. Vencedora com badge.      │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│  SUBREDE ACIONADA: [farm] → [placement]                            │
│  Caixas pequenas indicando o caminho final.                        │
└────────────────────────────────────────────────────────────────────┘
```

### 6.2 Agrupamento Visual Dos 4344 Inputs

Renderizar 4344 nos individuais e ilegivel. Agrupamento:

- **3 mini-tabuleiros 30x48**: T-2, T-1, T0. Cada tile colorido pelo seu valor espectral (mesma paleta de [docs/prd-ia-composta.md:107](docs/prd-ia-composta.md#L107)).
- **32 escalares**: 32 barras horizontais com label, cada uma um floatdimensionado em `[0,1]`. Brilho proporcional ao valor.

Visualmente claro, mesmo sem ver cada conexao individual. As "linhas para o hidden" sao representadas saindo do **centro** de cada grupo agregado, nao de cada neuronio.

### 6.3 Neuronios Hidden (96 Visiveis)

Grade 12x8 = 96 circulos. Cada um:

- Cor de fundo cinza claro.
- Preenchimento por opacidade proporcional a `activation` (sigmoid output do hidden layer, `[0,1]`).
- Borda colorida quando `activation > 0.7` (destaque para "muito ativado").

Calcular `hiddenActivations` exige um helper novo em `ai/rede-neural/rede-neural.js`: hoje o `predict()` so devolve a saida final ([ai/rede-neural/rede-neural.js:61](ai/rede-neural/rede-neural.js#L61)). Adicionar `predictWithHidden(inputArray)` que retorna `{ hidden, output }`.

### 6.4 Conexoes Hidden → Output

96 hidden × 7 outputs = 672 linhas. Para nao virar uma teia opaca:

- Renderizar so as 50 conexoes de **maior peso absoluto**.
- Largura da linha proporcional a `|peso|`.
- Cor: vermelho para peso negativo, verde para positivo.
- Alpha: 0.1 base, sobe para 0.6 quando `hidden_activation × peso > 0.3` (a conexao **esta** contribuindo agora).

### 6.5 Output E Sub-Rede

7 barras horizontais, cada uma rotulada com a macro-acao. A barra com `score = max(macroScores)` recebe um glow dourado.

Abaixo do output, uma caixa unica diz "Sub-rede acionada: **farm** → estrutura: **mine**" (ou o que for o caminho). Quando a sub-rede e um heatmap (upgrade/placement), a caixa mostra o tile alvo destacado no mini-mapa T0.

### 6.6 Animacao

Quando um novo `decision:snapshot` chega:

1. Transicao suave (200ms) das ativacoes hidden para os novos valores.
2. Linhas hidden→output reordenadas para destacar as novas top-50.
3. Barras de output animam sua largura para o novo score.
4. Caixa de sub-rede troca de label se mudou.

Entre snapshots, o canvas fica congelado no ultimo estado renderizado.

---

## 7. UI Da Pagina De Treino

### 7.1 Rota E Layout

Nova pagina `public/training.html` servida em `/training` (ou link no header de `index.html`). Layout em 3 colunas:

```
┌─────────────────┬─────────────────────────────────┬───────────────┐
│  CONFIGURACAO   │  CANVAS DA REDE NEURAL          │  PLACAR       │
│  ───────────    │  ─────────────────────────      │  ──────────   │
│  IAs: [---4---] │  (renderizacao §6)              │  Geracao: 47  │
│  Modo:          │                                 │  ┌─────────┐  │
│   ( ) Sobrev.   │                                 │  │ IA-1 234│  │
│   (•) Score     │                                 │  │ IA-2 187│  │
│  Sigma: [0.05]  │                                 │  │ IA-3 102│  │
│  Inicio:        │                                 │  │ IA-4  98│  │
│   ( ) Best      │                                 │  │ ...     │  │
│   (•) Supervisor│                                 │  └─────────┘  │
│   ( ) Zerar     │                                 │               │
│  [Iniciar]      │                                 │  HISTORICO    │
│  [Parar]        │                                 │  Gen 46 → IA3 │
│  [Salvar best]  │                                 │  Gen 45 → IA1 │
│                 │                                 │  ...          │
└─────────────────┴─────────────────────────────────┴───────────────┘
```

### 7.2 Painel De Configuracao

- **Slider de IAs (2-8)**: define o tamanho da populacao por geracao.
- **Toggle de modo**: Sobrevivencia / Score.
- **Input sigma (0.001-0.5)**: magnitude da mutacao. Default 0.05.
- **Origem do pai inicial**:
  - Continuar do `best/` (default se existir).
  - Continuar do supervisionado (`ai/agente-composto/redes/`).
  - Zerar (gerar aleatorio).
- **Max ticks por partida**: campo numerico (default 3000). Evita partidas que ficam empatadas em loop.
- **Botoes**: Iniciar / Parar / Salvar como best.

### 7.3 Placar Em Tempo Real

Lista ordenada de cima para baixo por score (ou por integridade do castelo, no modo sobrevivencia). Cada linha:

```
[IA-3]   2x mine  1x library  killed:4  built:3  score:+234
```

Atualiza via evento `match:event` agregado (resumo, nao todo evento bruto). Ao fim da partida, a IA vencedora pisca em verde por 2s antes da proxima geracao comecar.

### 7.4 Historico De Geracoes

Lista enxuta com as ultimas 50 geracoes:

```
Gen 47 — IA-3 venceu (score: 234)
Gen 46 — IA-1 venceu (sobreviveu)
Gen 45 — IA-7 venceu (score: 188)
```

Clicar numa entrada abre um modal com detalhes (config usada, sigma, criterio de vitoria, link pro checkpoint salvo).

### 7.5 Botao "Salvar Como Best"

Por padrao, cada geracao sobrescreve `best/` se o vencedor superou (score absoluto OU duracao da partida no modo sobrevivencia). O botao manual forca: copia os arquivos da geracao atual para `best/` e dispara um log. Util quando o usuario observa um campeao especificamente interessante.

---

## 8. Eventos Novos Em game.js

A maioria dos eventos do score ja existe em [public/game.js](public/game.js) atraves de `debugLog`. Os que faltam:

| Evento | Onde adicionar | Detalhes |
|---|---|---|
| `structure:destroyed` | Onde `addLog(...was destroyed)` ja roda ([public/game.js:2422](public/game.js#L2422)) | `{ ownerId, structureType, structureId, tick }` |
| `build:success` | Apos a logica em `executeBuild` (procurar onde cria a estrutura) | `{ ownerId, structureType, tile, tick }` |
| `research:success` | Apos completar uma pesquisa | `{ ownerId, researchType, tick }` |
| `unit:created` | Quando spawna Soldado, Arauto inicial, Arauto respawn | `{ ownerId, unitType, unitId, tick }` |
| `unit:killed` | No tick que zera integridade de unidade | `{ killerOwnerId, victimOwnerId, unitType, tick }` |

`upgrade:success` ja existe em [public/game.js:1268](public/game.js#L1268), basta consumir.

A emissao desses eventos **nao** afeta o gameplay normal — `debugLog` so notifica observers. No jogo normal, esses observers podem ser apenas o log de auditoria; no treino, sao agregados em score.

---

## 9. Estrutura De Arquivos

```
ai/
  treinamento-evolutivo/                     (novo)
    motor-treino.js                          (loop geracional + orquestracao)
    sala-treino.js                           (headless room factory)
    mutacao.js                               (cloneAndMutate(networks, sigma))
    pontuacao.js                             (scoreboard a partir de eventos)
    snapshot-decisao.js                      (extrai hidden+output do router)
    best/                                    (commitavel)
      router.json
      farm.json
      research.json
      defend.json
      attack.json
      upgrade.json
      placement.json
      target-defend-upgrade.json
      target-upgrade.json
      metadata.json                          (geracao, criterio, score, timestamp)
    checkpoints/                             (gitignorado)
      gen-0000/...
      gen-0001/...
      ...
public/
  training.html                              (nova pagina)
  training.js                                (UI logic: socket, config, placar)
  training-canvas.js                         (renderiza rede neural)
  training.css                               (estilos especificos)
server.js                                    (alteracoes — §10)
tests/
  treinamento-evolutivo.test.js              (motor, mutacao, pontuacao, snapshot)
  training-canvas.test.js                    (so smoke; canvas em jsdom)
```

`.gitignore` deve receber `ai/treinamento-evolutivo/checkpoints/` para nao versionar centenas de geracoes intermediarias.

---

## 10. Protocolo De Socket

Novos eventos socket entre cliente (`training.js`) e servidor (`server.js`):

| Direcao | Evento | Payload |
|---|---|---|
| C→S | `training:start` | `{ aiCount, mode, mutationSigma, initialSource, maxTicks }` |
| C→S | `training:stop` | `{}` |
| C→S | `training:save-best` | `{}` |
| S→C | `training:started` | `{ generation, parentSource }` |
| S→C | `training:generation-start` | `{ generation, aiIds }` |
| S→C | `training:match-event` | `{ generation, event, ownerId, scoreDelta, runningScores }` |
| S→C | `training:decision-snapshot` | `{ generation, championId, hiddenActivations, macroScores, chosenMacro, subnetworkActivated, boardSummary }` |
| S→C | `training:generation-complete` | `{ generation, winnerId, finalScores, duration, checkpointPath }` |
| S→C | `training:stopped` | `{ lastGeneration }` |
| S→C | `training:error` | `{ message }` |

O servidor segrega o trafego de treino em um **room socket dedicado** (`training:<playerId>`) para nao misturar com partidas normais.

---

## 11. Plano De Implementacao Por Fases

### Fase 1 — Eventos Novos Em game.js
Objetivo: eventos descritos em §8 sao emitidos no jogo normal sem alterar comportamento.

1. Adicionar `debugLog('structure:destroyed', ...)` em [public/game.js:2422](public/game.js#L2422).
2. Adicionar `debugLog('build:success', ...)` na funcao de construcao.
3. Adicionar `debugLog('research:success', ...)` na funcao de pesquisa.
4. Adicionar `debugLog('unit:created', ...)` em todos os pontos que criam unidade.
5. Adicionar `debugLog('unit:killed', ...)` onde unidade vai a zero de integridade.
6. Tests: cobrir cada evento em [tests/game.test.js](tests/game.test.js) com asserts via `subscribeDebug`.

### Fase 2 — Mutacao E Snapshot
Objetivo: helpers puros, testaveis sem rodar partidas.

1. `ai/treinamento-evolutivo/mutacao.js` exporta `cloneAndMutate(networksJson, sigma, random)`. Deep clone + perturbacao gaussiana de cada matriz.
2. `ai/rede-neural/rede-neural.js` ganha `predictWithHidden(inputArray)` retornando `{ hidden, output }`.
3. `ai/treinamento-evolutivo/snapshot-decisao.js` exporta `captureRouterSnapshot(network, input)`.
4. Tests: mutacao com `sigma=0` retorna copia identica; `predictWithHidden` retorna mesmo `output` que `predict`.

### Fase 3 — Motor De Treino Headless
Objetivo: rodar uma geracao isolada e retornar vencedor + score, sem socket.

1. `public/game.js` exporta `createTrainingRoom(catalog, options)` que cria room sem timers.
2. `public/game.js` aceita `getAgentForPlayer(playerId)` em `createGame`.
3. `ai/treinamento-evolutivo/sala-treino.js` instancia N agentes (1 pai + N-1 clones) e roda `tickRoom` em loop ate vitoria/timeout.
4. `ai/treinamento-evolutivo/pontuacao.js` consome eventos do `subscribeDebug` e acumula score por jogador.
5. `ai/treinamento-evolutivo/motor-treino.js` orquestra: criar sala, simular, determinar vencedor, salvar checkpoint.
6. Tests: simulacao de 50 ticks com 2 IAs random termina; score acumulado coerente com eventos emitidos.

### Fase 4 — Integracao Com Socket
Objetivo: cliente consegue iniciar/parar treino e recebe eventos agregados.

1. `server.js` registra handlers `training:start` / `training:stop` / `training:save-best`.
2. Loop geracional roda em `setImmediate` para nao bloquear o event loop completamente.
3. Throttle de `decision:snapshot` a 5/s.
4. Tests: simular cliente disparando start, verificar sequencia de eventos.

### Fase 5 — UI E Canvas
Objetivo: pagina `/training` funcional ponta a ponta.

1. `public/training.html` com layout §7.1.
2. `public/training.js` com handlers de socket e estado local.
3. `public/training-canvas.js` desenhando rede §6.
4. Tests: smoke test em jsdom verificando que ao receber `decision:snapshot`, o canvas chama os metodos de desenho corretos.

### Fase 6 — Persistencia E Best
Objetivo: checkpoints salvos em disco, `best/` atualizado conforme regra.

1. Cada `generation-complete` grava JSON em `ai/treinamento-evolutivo/checkpoints/gen-<N>/`.
2. Comparar vencedor com `best/metadata.json` e sobrescrever se superou.
3. Botao manual "Salvar como best" forca copia da geracao atual.
4. Adicionar `ai/treinamento-evolutivo/checkpoints/` ao `.gitignore`.
5. Tests: snapshot do filesystem antes/depois confirma escrita.

### Fase 7 — Polimento
1. Hot-reload do `best/` no servidor de partida normal (carregar novos pesos sem restart).
2. Tooltips no canvas explicando o que cada area mostra.
3. Atualizar [README.md:44](README.md#L44) e [docs/estrategia-ia.md](docs/estrategia-ia.md) com a opcao evolutiva.

---

## 12. Testes

Cobertura exigida: 100% statements/branches/functions/lines ([package.json:13](package.json#L13)).

Novos arquivos:

| Arquivo | Cobre |
|---|---|
| `tests/treinamento-evolutivo.test.js` | `cloneAndMutate`, `captureRouterSnapshot`, `pontuacao`, `motor-treino` (ciclo geracional simulado com redes stub) |
| `tests/training-canvas.test.js` | Smoke do canvas em jsdom: render inicial, atualizacao em snapshot, formato de labels |
| Extensao `tests/game.test.js` | Novos eventos (§8) emitidos com `ownerId` correto |
| Extensao `tests/server.test.js` | Handlers de `training:start` / `training:stop`, throttle de snapshot |
| Extensao `tests/ai.test.js` | `predictWithHidden` igual a `predict` em valor final; hidden tem tamanho certo |

Smoke test do motor evolutivo: rodar 2 geracoes com 2 IAs com `sigma=0` (sem mutacao) deve produzir score quase identico entre pai e clone (margem para timing nao-deterministico do jogo).

---

## 13. Riscos E Mitigacoes

| Risco | Mitigacao |
|---|---|
| Sigma alto demais destroi o pai bom rapidamente | Default conservador (0.05); usuario pode ajustar. Elitismo garante que o pai sempre joga sem mutacao. |
| Sigma baixo demais nao evolui | Tornar sigma adaptativo no futuro (aumenta se geracoes sequenciais empatam); por ora, ajuste manual. |
| Partidas FFA empatam ou ficam em loop infinito | `MAX_TRAINING_TICKS` (default 3000). Em sobrevivencia, no timeout decide quem tem mais integridade. Em score, quem tem mais pontos. |
| 8 redes × 8 IAs por partida = muita memoria | Cada rede e pequena (~50KB JSON). 8 IAs × 9 redes × 50KB = ~3.6MB por geracao. Negligenciavel em RAM. |
| Tick acelerado bloqueia event loop e impede sockets responsivos | Loop em `setImmediate` ou `setTimeout(..., 0)` a cada N ticks. Yield periodico ao event loop. |
| Vencedor por score "joga errado" (foca em construir e perder pra inflar +30) | Equilibrio dos pesos foi escolhido pelo usuario; ajuste fino fica como follow-up. Tabela §4.5 e configuravel via constants. |
| Visualizacao do canvas trava se snapshots chegam muito rapido | Throttle no servidor (5/s) e debounce no cliente (`requestAnimationFrame`). |
| Cliente abre `/training` e ja existe um treino em andamento de outro tab | Servidor mantem 1 sessao de treino por `playerId` (socket id); abrir um segundo tab herda o estado e os eventos. |
| Pai do treino divergir do supervisionado a ponto de a IA jogar pior em partidas reais | `best/` sobrescreve `agente-composto/redes/` so se o usuario clicar o botao explicito; o treino normal continua usando `agente-composto/redes/` ate decisao manual. |

---

## 14. Trabalhos Futuros (Nao Cobertos Aqui)

- Cruzamento (crossover) entre dois pais alem do pai unico clonado.
- Populacao com **multiplos pais** elites e torneio binario para selecao.
- Mutacao adaptativa (sigma cresce/diminui conforme convergencia).
- Visualizacao das sub-redes alem do router (placement heatmap sobre o mini-mapa).
- Treino distribuido entre varias maquinas (cada uma roda uma populacao paralela; trocam pais elites periodicamente).
- Co-evolucao: treino contra "agente espelho" da geracao N-K para evitar overfit ao proprio estilo.
- Replay: salvar a partida completa de uma geracao e permitir reproduzi-la em real-time no cliente.
- Metricas: ELO interno entre geracoes; grafico de score medio ao longo do tempo.

---

## 15. Resumo Executivo

- Nova pagina `/training` com painel de configuracao, canvas animado da rede `router` e placar em tempo real.
- Treino evolutivo por geracoes: **2 a 8 IAs FFA**, vencedor vira pai, clones com mutacao gaussiana (sigma configuravel) disputam a proxima geracao.
- Dois criterios de vitoria: **sobrevivencia** (default) ou **score por eventos** (tabela §4.5).
- Simulacao **headless no servidor** sem cooldown real, com snapshots throttled (5/s) alimentando o canvas.
- Pesos da IA campea persistidos em `ai/treinamento-evolutivo/best/` (commitavel) e checkpoints por geracao em `checkpoints/` (gitignorado).
- Pipeline supervisionado existente (`npm run train:ai`) **continua funcionando**, podendo servir de pai inicial pro evolutivo.
- Implementacao em **7 fases** com testes cobrindo cada uma e 100% de cobertura mantida.
