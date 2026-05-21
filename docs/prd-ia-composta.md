# PRD — IA Composta com Visão Espectral e Fog of War

Status: rascunho para revisão · Autor: planejamento conduzido por Claude · Data: 2026-05-21

Este documento descreve o redesenho completo da inteligência artificial do War Base. O agente neural atual (uma única rede feedforward que ordena ações) será substituído por um sistema **hierárquico de redes neurais especializadas**: uma rede "estrategista" decide *o que* fazer e sub-redes por ação decidem *como* fazer. Em paralelo, o jogo passa a ter **fog of war** baseada em raio de visão das próprias unidades e construções, valendo tanto para humanos quanto para IAs.

---

## 1. Objetivos

1. Substituir o agente neural único por um sistema composto de redes neurais especializadas, organizadas em hierarquia.
2. Fornecer à IA uma visão espacial do tabuleiro (com 3 frames de histórico) codificada como espectro numérico.
3. Implementar fog of war para todos os jogadores: cada um só vê o que está no raio das próprias entidades.
4. Manter o pipeline de treino supervisionado, mas dividido por rede, com datasets independentes.
5. Refatorar a integração no `server.js` / `game.js` sem manter o agente antigo (substituição completa).

## 2. Não-Objetivos

- Não implementar reinforcement learning, self-play ou simulação massiva nesta fase. Fica como evolução futura.
- Não trocar a infraestrutura de matrizes (`ai/rede-neural/`) por uma biblioteca externa. A rede feedforward atual continua sendo a unidade de cálculo.
- Não implementar CNNs ou camadas convolucionais. O tabuleiro entra como vetor achatado.
- Não introduzir multiplayer cooperativo nem fog parcial por time (o jogo é FFA).

## 3. Decisões Já Alinhadas

| Decisão | Valor escolhido |
|---|---|
| Escopo da fog of war | **Todos os jogadores** (humanos + IAs) |
| Origem do raio de visão | **Reaproveitar `attackRange`** quando existir; adicionar `sightRange` no catálogo para entidades sem ataque |
| Estratégia de treino | **Supervisionado hierárquico** — um dataset por rede |
| Transição da IA antiga | **Substituição completa** — remove `agente-neural.js`, `treinar.js` e `rede-treinada.json` atuais |

---

## 4. Fog Of War — Mudança de Mecânica

Hoje [public/game.js:547](public/game.js#L547) (`getPublicState`) devolve o estado completo do `room` para todos os assinantes. Isso muda.

### 4.1 Novo Campo `sightRange`

Adicionar `sightRange` ao catálogo de estruturas e NPCs em [public/game.js](public/game.js). Para entidades com `attackRange`, o `sightRange` herda o mesmo valor por padrão, mas pode ser ajustado caso a caso.

Valores propostos (sujeitos a validação em jogo):

| Entidade   | attackRange | sightRange |
|------------|-------------|------------|
| base       | —           | 8          |
| cover      | —           | 4          |
| taraque    | —           | 4          |
| per        | 20          | 20         |
| hef        | 10          | 10         |
| tujai      | —           | 4          |
| capturer   | 1.5         | 4          |
| zunim      | 1           | 3          |

Critério: torres enxergam tão longe quanto atiram; bases têm visão moderada para fortificar a área de origem; coletores (cover/taraque/tujai) têm visão curta; capturador ganha visão maior do que seu alcance de combate para poder explorar enquanto se desloca.

### 4.2 Cálculo de Visibilidade por Jogador

Nova função `computeVisibilityMask(room, playerId)` que retorna uma matriz booleana `[height][width]` (30×48) marcada como `true` para todo tile dentro do `sightRange` de qualquer entidade própria **viva e ativa** do jogador.

- Distância usada: euclidiana, igual à `distance()` existente em [public/game.js:2177](public/game.js#L2177).
- A base sempre marca o próprio tile como visível mesmo se estiver `disabled` (mantém o jogador orientado depois de cair).
- Estruturas `disabled` (mas ainda existentes) **não** contribuem com visão.
- Capturador morto (em respawn) **não** contribui com visão.

### 4.3 Estado Público Filtrado

`getPublicState(hostKey, playerId)` passa a aceitar `playerId` e retorna:

- **`fogMask`**: a matriz `[height][width]` de visibilidade do jogador (para o renderer desenhar a névoa).
- **`structures`**: estruturas próprias sempre, e estruturas alheias **apenas se o tile está visível**.
- **`units`**: unidades próprias sempre, unidades alheias apenas se visíveis.
- **`players`**: dados próprios sempre; dados de outros jogadores em duas camadas:
  - *Sempre visível*: `playerId`, `gamerTag`, `color`, `alive`, `connected` (necessário para HUD).
  - *Visível só sob fog*: `x`, `y`, `coal`, `knowledge`, `integrity`, `barrier`, `order`. Quando o jogador alvo não tem nenhuma entidade visível, esses campos são omitidos / zerados.
- **`logs`**: igual ao atual. Logs são metainformação textual; não vazam posição com precisão.
- **`memory`** (novo): dicionário `{ structureId: lastSeenSnapshot }` com a última vez que o jogador viu cada estrutura inimiga/neutra. Permite "lembrar" de uma Tujai inimiga descoberta antes mesmo que ela suma do raio de visão. Veja §4.4.

### 4.4 Memória de Última Visão

Cada jogador mantém em `room.players[playerId].memory.structures` um cache `{ structureId, type, x, y, ownerId, level, disabled, seenAt }` para cada estrutura já avistada. O cache é atualizado a cada tick para tiles visíveis e mantido (com `seenAt` antigo) para tiles que voltaram a ficar sob fog. Estruturas destruídas são removidas do cache na próxima vez que o tile correspondente for visível e estiver vazio.

O cache **não** rastreia unidades nem jogadores, porque essas entidades se movem e a posição "lembrada" rapidamente fica enganosa.

### 4.5 Renderização da Névoa

[public/render-screen.js](public/render-screen.js) recebe `fogMask` no estado e desenha em duas camadas:

- **Tile invisível**: overlay cinza-escuro sobre o canvas (alpha ~0.55), pintado sobre a grade.
- **Tile lembrado mas atualmente sob fog**: overlay cinza-médio (alpha ~0.30), com estruturas do `memory` desenhadas em tom dessaturado (~50% saturação).

O HUD deve indicar visualmente que dados de inimigos são "do último avistamento". Detalhes finais ficam para implementação.

### 4.6 Impacto na IA Antiga (que será removida)

A função `extrairEntradasWarBase` em [ai/agente-war-base/agente-neural.js:90](ai/agente-war-base/agente-neural.js#L90) lê `state.structures` e `state.players` sem filtrar por visibilidade. Com fog ativada para todos os jogadores, a IA antiga continuaria funcional só com o estado filtrado, mas ela já está marcada para remoção.

---

## 5. Codificação Espacial do Tabuleiro

### 5.1 Espectro Por Tile

Cada tile vira um único valor float em `[0, 1]`. A interpretação semântica do valor é convencionada (e treinada). Como um valor 0.10 e 0.15 não são "próximos" semanticamente, a rede precisa aprender essa quebra de continuidade — é o trade-off aceito pelo design.

Tabela de valores:

| Valor | Significado |
|-------|-------------|
| 0.00  | Tile vazio visível |
| 0.05  | Tile sob fog (desconhecido) |
| 0.10  | Estrutura própria — Base |
| 0.15  | Estrutura própria — Cover |
| 0.20  | Estrutura própria — Taraque |
| 0.25  | Estrutura própria — Per |
| 0.30  | Estrutura própria — Hef |
| 0.35  | Estrutura própria — Tujai |
| 0.40  | Unidade própria — Capturer |
| 0.45  | Unidade própria — Zunim |
| 0.50  | Estrutura neutra/desativada (capturável) |
| 0.55  | Estrutura inimiga — Base |
| 0.60  | Estrutura inimiga — Cover |
| 0.65  | Estrutura inimiga — Taraque |
| 0.70  | Estrutura inimiga — Per |
| 0.75  | Estrutura inimiga — Hef |
| 0.80  | Estrutura inimiga — Tujai |
| 0.85  | Unidade inimiga — Capturer |
| 0.90  | Unidade inimiga — Zunim |
| 0.95  | Estrutura lembrada (memory, atualmente sob fog) |

Tile com múltiplas entidades (raro, mas possível com unidade sobre cover desativada) usa prioridade: estrutura ativa > estrutura desativada > unidade.

### 5.2 Histórico de 3 Frames

Cada decisão recebe três tabuleiros: `T0` (atual), `T-1` (tick anterior) e `T-2` (dois ticks atrás).

O `aiAgent` (objeto retornado por `createNeuralWarBaseAgent`) passa a manter um buffer `frameBuffer` por `playerId`:

```text
frameBuffer[playerId] = [boardTMinus2, boardTMinus1]
```

A cada `decide()`, calcula `boardT0`, monta `[boardTMinus2, boardTMinus1, boardT0]` e empilha (descarta o mais antigo).

Quando a IA acabou de entrar (sem histórico), os frames anteriores são preenchidos com cópias do `boardT0` para não inserir zeros artificiais que a rede leria como "tudo fog".

### 5.3 Features Escalares Complementares

Tabuleiro espectral é ótimo para topologia, mas péssimo para magnitudes (carvão, vida da base etc.). Mantemos um vetor de escalares ao lado, semelhante ao atual.

Vetor `escalares` (24 floats em `[0, 1]`):

```text
[
  ratio(coal, 1500),
  ratio(knowledge, 120),
  ratio(baseLevel, 4),
  ratio(baseHealth, baseMaxHealth),
  ratio(coverCount, 6),
  ratio(taraqueCount, 3),
  ratio(perCount, 6),
  ratio(hefCount, 4),
  ratio(tujaiCount, 3),
  ratio(zunimCount, 10),
  ratio(capturerCount, 1),
  taraqueUnlocked,
  perUnlocked,
  hefUnlocked,
  tujaiUnlocked,
  ratio(visibleCapturableTargets, 6),
  ratio(visibleEnemyStructures, 8),
  ratio(visibleEnemyUnits, 8),
  ratio(rememberedEnemyStructures, 8),
  proximityToNearestKnownEnemyBase,
  hasCaptureOrder,
  ratio(aliveEnemyCount, 7),
  ratio(visibleTilesFraction, 1),
  ratio(tickFraction, ESTIMATED_GAME_LENGTH_TICKS)
]
```

Onde `visibleTilesFraction = visibleTiles / (width*height)` ajuda a rede a saber "estou cego" vs "domino o mapa".

### 5.4 Tamanho Final Do Input

- Tabuleiros: `3 frames × 30 × 48 = 4320 floats`
- Escalares: `24 floats`
- **Total: 4344 floats**

Cada rede do sistema composto consome esse mesmo input. Hidden size é dimensionado por rede (§6).

---

## 6. Arquitetura De Redes Compostas

### 6.1 Visão Geral

```
                ┌──────────────────────────────┐
                │ INPUT (4344 floats)          │
                │   board T0/T-1/T-2 + escalares│
                └──────────────┬───────────────┘
                               │
                ┌──────────────▼───────────────┐
                │ ROUTER (estrategista)        │
                │   8 saídas (macro-ação)      │
                └──────────────┬───────────────┘
                               │ pick best macro
        ┌──────────┬───────────┼──────────┬──────────┬──────────┐
        ▼          ▼           ▼          ▼          ▼          ▼
     FARM       CAPTURE    RESEARCH    DEFEND     ATTACK     UPGRADE
   (sub-rede) (sub-rede) (sub-rede)  (sub-rede) (sub-rede) (sub-rede)
        │          │           │          │          │          │
        ▼          ▼           ▼          ▼          ▼          ▼
   PLACEMENT   TARGET     (direto)    PLACEMENT  PLACEMENT/   TARGET
  (cover/tar.) (estrutura            (per/hef)  spawn         (estrutura
                capturável)                                     própria)
```

Sub-redes adicionais: **SCOUT** (decide tile alvo para enviar o capturer reconhecer território) e **WAIT** (sem rede; é só "não emitir comando").

### 6.2 Router NN ("Estrategista")

- **Entrada**: 4344 floats.
- **Saída**: 8 floats, uma para cada macro-ação.
- **Macro-ações**: `farm`, `capture`, `research`, `defend`, `attack`, `upgrade`, `scout`, `wait`.
- **Hidden size sugerido**: 96 neurônios (uma camada oculta).
- **Critério de escolha**: maior score cuja sub-rede consiga produzir comando válido. Se nenhuma produz, cai para `wait`.

### 6.3 Sub-Redes Por Macro-Ação

Todas compartilham o mesmo formato de entrada (4344 floats).

#### FARM
- Saída: 3 floats — `{build-cover, build-taraque, capture-cover-target}`.
- Fluxo:
  - `build-cover` → chama **PlacementNet** com `structureType=cover` para escolher tile.
  - `build-taraque` → chama PlacementNet com `taraque`.
  - `capture-cover-target` → chama **TargetNet** filtrando por estruturas tipo `cover` capturáveis.

#### CAPTURE
- Saída: heatmap 30×48 (1440 floats) sobre o mapa.
- Comando: dentre as estruturas capturáveis **visíveis ou lembradas**, escolhe a de maior score no tile correspondente. Equivale a uma TargetNet com formato espacial.

#### RESEARCH
- Saída: 3 floats — `{per, hef, tujai}`.
- Comando: pesquisa de maior score que ainda esteja bloqueada e cujos pré-requisitos estejam satisfeitos.

#### DEFEND
- Saída: 3 floats — `{build-per, build-hef, upgrade-defensive}`.
- `build-per`/`build-hef` → PlacementNet.
- `upgrade-defensive` → TargetNet sobre estruturas próprias defensivas (per/hef).

#### ATTACK
- Saída: 3 floats — `{build-tujai, spawn-zunim, build-forward-tower}`.
- `build-tujai` → PlacementNet.
- `spawn-zunim` → comando direto, sem sub-rede.
- `build-forward-tower` → PlacementNet com viés ofensivo (vide §6.4).

#### UPGRADE
- Saída: heatmap 30×48.
- Comando: estrutura própria de maior score que possa receber upgrade.

#### SCOUT
- Saída: heatmap 30×48.
- Comando: envia o capturer para o tile alvo. Implementado como uma `capture` falsa cujo destino é o tile (pode exigir mecânica nova: "ordem de movimento" do capturer — ver §10).

### 6.4 PlacementNet (Compartilhada)

Uma única rede para todas as colocações de estrutura, com a entrada estendida por um vetor de identificação de tipo (one-hot de 6 posições: `[cover, taraque, per, hef, tujai, _reservado]`).

- **Entrada**: 4344 + 6 = 4350 floats.
- **Saída**: heatmap 30×48 (1440 floats).
- **Hidden size sugerido**: 128 neurônios.
- **Decisão**: maior score entre tiles válidos (dentro do `buildRange` de alguma estrutura própria ativa, não ocupado, dentro do mapa).

Compartilhar uma única rede para placement reduz custo de dataset e captura padrões espaciais transferíveis (perto da base, próximo a inimigo etc.).

### 6.5 TargetNet (Compartilhada)

Reaproveita o formato heatmap. Sub-redes que precisam de TargetNet (CAPTURE, FARM[capture-cover], DEFEND[upgrade], UPGRADE) usam a mesma instância filtrando saída por tipo de alvo permitido. Para começar, manter **uma TargetNet por sub-rede** simplifica o treino (menos sinais conflitantes); consolidação fica como otimização futura.

### 6.6 Fluxo De Decisão Completo

```python
# pseudocódigo do agente composto
def decidir(state, playerId, frameBuffer):
    boardT0 = encodeBoard(state, playerId)
    boards = frameBuffer.empilharE(boardT0)  # [T-2, T-1, T0]
    scalars = encodeScalars(state, playerId)
    input = flatten(boards) + scalars  # 4344 floats

    macroScores = router.predict(input)  # 8 floats
    for macro in ordenadosDescDe(macroScores):
        if macro == 'wait':
            continue
        comando = montarComando(macro, input, state, playerId)
        if comando:
            return comando
    return None
```

Onde `montarComando` mapeia o macro para a sub-rede correspondente e ela emite o comando final, passando ainda por **validadores deterministas** equivalentes aos atuais (`canBuild`, `findBuildTile` etc., agora promovidos a módulo compartilhado).

### 6.7 Camada Determinística

A camada de validação (`canBuild`, recursos suficientes, alvo válido, raio de construção, base nível mínimo) **não desaparece**. Ela é movida de [ai/agente-war-base/agente-neural.js](ai/agente-war-base/agente-neural.js) para `ai/agente-composto/validadores.js` e fica plugável: cada sub-rede ordena suas saídas e pede ao validador "esse comando passa?". Se não, tenta a próxima.

Sem essa camada a rede produziria comandos ilegais constantemente, especialmente cedo no treino.

---

## 7. Treinamento Hierárquico

### 7.1 Estrutura De Dataset Por Rede

Cada rede tem seu próprio dataset em `ai/agente-composto/treino/dataset-<nome>.js`. Estrutura genérica:

```js
exemplo(input, saidaEsperada)
// input = {boards: [...3], scalars: [...24]}
// saidaEsperada = vetor com 1 na posição correta, 0 nas demais
```

- **dataset-router**: 30–60 cenários cobrindo: "tenho recursos e alvos para farm", "inimigo perto, defender", "Tujai pronta, atacar", "não tenho Taraque ainda, research bloqueada", "mapa coberto de fog, scout" etc.
- **dataset-farm**: 15–25 cenários alternando entre "construir cover quando carvão folgado e poucos covers" vs "capturar cover quando há alvo capturável".
- **dataset-capture**: 20–40 cenários com mapas em que um tile específico contém o alvo prioritário.
- **dataset-research**: 8–15 cenários ditando a ordem per → hef → tujai conforme `knowledge` e `taraqueLevel`.
- **dataset-defend**: 15–25 cenários priorizando per quando inimigo distante, hef quando inimigo próximo, upgrade quando per/hef já existem.
- **dataset-attack**: 15–25 cenários cobrindo "spawn-zunim quando há infra" vs "construir torre avançada".
- **dataset-upgrade**: 15 cenários ranqueando upgrade da base vs upgrade de torre vs upgrade de cover.
- **dataset-scout**: 10–20 cenários com fog dominando o mapa e alvo de scout marcado.
- **dataset-placement**: 30–50 cenários, com cada exemplo casando `(estado + tipo de estrutura) → tile alvo`.

### 7.2 Pipeline De Treino

Script único `ai/agente-composto/treino/treinar-tudo.js`:

1. Carrega cada dataset.
2. Para cada rede, instancia `new RedeNeural(inputs, hidden, outputs, opts)`.
3. Treina N épocas (proposta inicial: 3000 épocas, `taxaAprendizado: 0.15`).
4. Serializa em `ai/agente-composto/redes/<nome>.json`.

Comando: `npm run train:ai` aponta para o novo script. O comando antigo deixa de existir.

### 7.3 Verificação Pós-Treino

Após cada treino, rodar um conjunto de "smoke tests" (rede recebe um input fixo do dataset e deve devolver score máximo na ação esperada). Isso já é feito hoje em [tests/ai.test.js](tests/ai.test.js); replicar para cada rede.

---

## 8. Estrutura De Arquivos

Nova organização (substitui `ai/agente-war-base/` por completo):

```
ai/
  rede-neural/                         (mantido)
    matriz.js
    rede-neural.js
  agente-composto/                     (novo)
    agente-composto.js                 (orquestrador: monta input, chama router, executa sub-rede)
    validadores.js                     (canBuild, findBuildTile, getCapturableTargets — promovidos)
    codificacao/
      board.js                         (encodeBoard com fog + espectro)
      escalares.js                     (encodeScalars)
      historico.js                     (FrameBuffer por playerId)
    redes/
      router.json
      farm.json
      capture.json
      research.json
      defend.json
      attack.json
      upgrade.json
      scout.json
      placement.json
      target-capture.json
      target-defend-upgrade.json
      target-upgrade.json
    treino/
      treinar-tudo.js                  (entrypoint do npm run train:ai)
      treinar-rede.js                  (helper genérico)
      dataset-router.js
      dataset-farm.js
      dataset-capture.js
      dataset-research.js
      dataset-defend.js
      dataset-attack.js
      dataset-upgrade.js
      dataset-scout.js
      dataset-placement.js
```

Arquivos a remover (substituição completa):

- [ai/agente-war-base/agente-neural.js](ai/agente-war-base/agente-neural.js)
- [ai/agente-war-base/treinar.js](ai/agente-war-base/treinar.js)
- [ai/agente-war-base/rede-treinada.json](ai/agente-war-base/rede-treinada.json)
- O diretório `ai/agente-war-base/` inteiro.

`server.js` muda o import:

```diff
- import { createNeuralWarBaseAgent } from './ai/agente-war-base/agente-neural.js'
+ import { createCompositeWarBaseAgent } from './ai/agente-composto/agente-composto.js'
```

[server.js:8](server.js#L8) e [server.js:19](server.js#L19) precisam atualizar a referência.

---

## 9. Plano De Implementação Por Fases

### Fase 1 — Fog Of War No Jogo
Objetivo: o jogo passa a ter visibilidade limitada; humanos veem névoa; testes verdes.

1. Adicionar `sightRange` a `STRUCTURES` e `NPCS` em [public/game.js:25](public/game.js#L25).
2. Implementar `computeVisibilityMask(room, playerId)` em `public/game.js`.
3. Refatorar `getPublicState(hostKey, playerId)` para receber `playerId` e filtrar entidades + adicionar `fogMask`.
4. Atualizar `notifyRoomState` para emitir um estado **por jogador** (precisa iterar `room.players` e usar `sockets.to(playerId).emit(...)` em vez de `sockets.to(hostKey).emit(...)`). Esse é o ponto mais delicado da fase — afeta diretamente [server.js:111](server.js#L111).
5. Implementar cache `room.players[playerId].memory.structures` atualizado no `tickRoom`.
6. Atualizar [public/render-screen.js](public/render-screen.js) para desenhar overlay de fog usando `fogMask`.
7. Atualizar/criar testes em [tests/game.test.js](tests/game.test.js) cobrindo: visibilidade calculada certo, fog filtra estruturas, fog mantém estrutura lembrada, cobertura 100%.

**Risco**: a virada de "estado por sala" para "estado por jogador" muda o contrato de sockets. Precisa cuidado para não regredir features atuais (HUD, lista de jogadores etc.).

### Fase 2 — Codificação Espacial E Frame Buffer
Objetivo: já existe um codificador `encodeBoard` + `encodeScalars` + `FrameBuffer` testados, mesmo sem nova IA conectada.

1. Criar `ai/agente-composto/codificacao/board.js` com `encodeBoard(state, playerId)` (usando o `fogMask` da Fase 1).
2. Criar `ai/agente-composto/codificacao/escalares.js`.
3. Criar `ai/agente-composto/codificacao/historico.js` com `createFrameBuffer()` por `playerId`.
4. Testes unitários para cada codificador.

### Fase 3 — Esqueleto Do Agente Composto
Objetivo: agente novo plugado no servidor, ainda com redes "burras" (random/stub).

1. Criar `ai/agente-composto/agente-composto.js` com a função `createCompositeWarBaseAgent(opcoes)` retornando o mesmo contrato `{ cooldownMs, decidir, decide }` que o agente atual.
2. Implementar o pipeline §6.6 com sub-redes **stub** (devolvem zeros — agente cai sempre em `wait`).
3. Trocar imports em [server.js:8](server.js#L8) e [server.js:19](server.js#L19) e remover arquivos antigos da Fase 1 do legado.
4. Garantir que [tests/server.test.js](tests/server.test.js) e [tests/ai.test.js](tests/ai.test.js) reescrevem suas asserções.

### Fase 4 — Sub-Redes Reais E Treino Hierárquico
Objetivo: redes treinadas, agente joga decentemente.

1. Escrever cada dataset em `ai/agente-composto/treino/dataset-*.js`.
2. Escrever `treinar-rede.js` (helper) e `treinar-tudo.js` (entrypoint).
3. Apontar `package.json` `train:ai` para o novo script.
4. Rodar `npm run train:ai`, commitar `redes/*.json`.
5. Testes: smoke tests por rede + teste de integração rodando o agente completo num estado sintético e validando comando emitido.

### Fase 5 — Mecânica De Scout (Opcional, Mas Recomendada)
Objetivo: comando "mover capturer para tile X" implementado no jogo, habilita a sub-rede SCOUT.

1. Adicionar ação `move-capturer-to` em [public/game.js:518](public/game.js#L518) (`executeAction`).
2. Refatorar `processCaptureUnitOrders` para aceitar ordens `move` além de `capture`.
3. Atualizar dataset do scout com exemplos.

Sem essa fase, o macro `scout` cai sempre em `wait` (o que é aceitável como MVP).

### Fase 6 — Balanceamento E Polimento
Objetivo: jogabilidade interessante contra a IA composta.

1. Ajustar `sightRange` por entidade após observar 3–5 partidas.
2. Ajustar `hidden` sizes por rede se alguma estiver underfit.
3. Aumentar dataset onde a rede confundir cenários.
4. Documentar quirks observados em [docs/estrategia-ia.md](docs/estrategia-ia.md) (atualizar o doc atual para refletir o novo desenho — ele fica como overview, o PRD fica como histórico de design).

---

## 10. Testes

Cobertura exigida pelo projeto: 100% statements/branches/functions/lines ([package.json:13](package.json#L13)).

Novos testes obrigatórios:

| Arquivo | Cobre |
|---|---|
| `tests/game.test.js` | `computeVisibilityMask`, fog filtrando structures/units/players, memory cache, `sightRange` herdando de `attackRange` |
| `tests/render-screen.test.js` | desenho do overlay de fog, dessaturação de estruturas lembradas |
| `tests/ai.test.js` | reescrita: cada rede composta + agente composto + frame buffer + codificadores |
| `tests/server.test.js` | emit por jogador em vez de por sala (mudança da Fase 1) |

Smoke tests do treino devem ficar como `describe('treinamento composto', ...)` em `tests/ai.test.js`, validando que dado um exemplo do dataset, a rede correspondente devolve a ação esperada como score máximo.

---

## 11. Riscos E Mitigações

| Risco | Mitigação |
|---|---|
| Fog de todos quebra o HUD de humanos | Fase 1 isolada e revisada antes da Fase 2. Renderer recebe `fogMask` mas mantém fallback para mostrar tudo se `fogMask` não vier. |
| Espectro confunde a rede (descontinuidade semântica) | Datasets cobrem variações da mesma situação com tipos diferentes para forçar a rede a aprender as "ilhas" do espectro. Alternativa: trocar para multi-canal numa versão futura. |
| Treino supervisionado supercoincide com o dataset | Manter datasets pequenos mas diversos; smoke tests detectam overfit; futuro: self-play. |
| Sub-rede emite comando inválido após validador | Validador faz fallback para próxima ação ranqueada; se nenhuma macro produz comando, agente `wait`. Mesmo comportamento atual. |
| Performance: 4344 floats × várias redes a cada tick | Inputs são compartilhados entre redes — calculados uma vez por decisão; redes operam em paralelo lógico (mas serial no JS). Cooldown mantido em 1000ms por agente. Avaliar se mais de 4 IAs na sala criam lag. |
| Visão muito restrita = IA paralisada cedo no jogo | Capturer com `sightRange=4` (vs `attackRange=1.5`) é o "scout natural"; base com 8 cobre boa parte da zona inicial. Ajustar valores na Fase 6 se preciso. |

---

## 12. Trabalhos Futuros (Não Cobertos Aqui)

- Reinforcement learning / self-play.
- Substituir `RedeNeural` por uma implementação com camadas convolucionais para o tabuleiro.
- Multi-canal (cada tipo de entidade vira um canal binário) em vez de espectro.
- Perfis de IA (agressiva, defensiva, econômica) treinados com datasets diferentes.
- Compartilhar embeddings entre sub-redes (representação espacial comum).
- Métricas de comparação entre versões do modelo (ELO interno entre versões de IA).

---

## 13. Resumo Executivo

- Refatoração completa da IA: de **1 rede de 12 saídas** para **~10 redes especializadas** orquestradas hierarquicamente.
- Tabuleiro entra como input espectral 30×48 com 3 frames de histórico, complementado por 24 escalares.
- Fog of war passa a valer para **todos os jogadores**, usando `attackRange` quando existe e um novo `sightRange` quando não.
- Treino continua supervisionado, mas com **um dataset por rede**.
- O agente neural atual é **removido por completo**; arquivos correspondentes em `ai/agente-war-base/` são deletados.
- Implementação fatiada em **6 fases**, com testes acompanhando cada fase e cobertura 100% mantida.
