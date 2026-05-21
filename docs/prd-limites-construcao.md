# PRD — Limites de Construção Atrelados ao Nível da Base

Status: rascunho para revisão · Autor: planejamento conduzido por Claude · Data: 2026-05-21

Este documento descreve a introdução de **limites de construção escaláveis** no War Base. Cada tipo de estrutura passa a ter uma quantidade máxima por jogador, calculada a partir do nível da Base; e cada estrutura passa a ter um teto de nível também atrelado ao nível da Base. A regra é uniforme, infinitamente escalável e força o jogador a investir na Base como caminho central de progressão.

A IA composta atual é atualizada para respeitar a regra **sem nenhum caminho de compatibilidade com o comportamento antigo**: validadores, codificação de escalares, heurística de emergência e datasets são reescritos para já nascerem dentro do novo regime.

---

## 1. Objetivos

1. Tornar o nível da Base o **eixo central de progressão**: subir a Base destrava mais estruturas, slots de upgrade e teto de poder por estrutura.
2. Definir limites **escaláveis ao infinito** por uma fórmula linear, sem tabelas hardcoded e sem teto artificial.
3. Aplicar um cap de nível por estrutura igual ao nível da Base, com exceção apenas para a própria Base.
4. Atualizar a IA composta para que router, validadores, codificadores e datasets levem a regra em conta na decisão, sem manter código legado para o regime antigo.
5. Expor os limites no `catalog` do estado público, para que cliente e IA tomem decisão a partir da mesma fonte de verdade.

## 2. Não-Objetivos

- Não introduzir downgrade ou destruição manual de estruturas. Se um slot está ocupado por uma estrutura desativada que ainda lhe pertence, o jogador continua bloqueado até a captura ou recuperação ocorrer naturalmente (ver §4.5).
- Não rebalancear custos de construção/upgrade nem geração de recursos. Esta mudança altera só **quantos** e **até onde** o jogador pode construir.
- Não alterar regras de captura, fog of war, NPCs ou pesquisa fora do que for estritamente necessário para suportar o limite.
- Não introduzir limites diferenciados por tipo de torre (Per × Hef × Tujai) além da fórmula uniforme proposta. A fórmula é tunável depois, sem mudar a arquitetura.

## 3. Decisões Já Alinhadas

| Decisão | Valor escolhido |
|---|---|
| Escala dos limites por tipo | **Fórmula linear** `base + slope·(BaseLevel-1)` no catálogo |
| Cap de nível por estrutura | **Todas as estruturas** ≤ nível da Base (Base sem cap) |
| Estruturas capturadas | **Captura sem restrição** — pode estourar o limite, mas bloqueia novas construções do tipo até voltar abaixo |
| Compatibilidade da IA | **Substituição completa** — sem dual-mode, sem flags, sem dataset legado |

---

## 4. Sistema de Limites

### 4.1 Limite de Quantidade por Tipo

Cada estrutura **construível** ganha dois novos campos no catálogo em [public/game.js](public/game.js):

```js
cover:   { ...catalogAtual, buildLimitBase: 3, buildLimitSlope: 2 },
taraque: { ...catalogAtual, buildLimitBase: 1, buildLimitSlope: 1 },
per:     { ...catalogAtual, buildLimitBase: 1, buildLimitSlope: 1 },
hef:     { ...catalogAtual, buildLimitBase: 1, buildLimitSlope: 1 },
tujai:   { ...catalogAtual, buildLimitBase: 1, buildLimitSlope: 1 },
```

A função `getBuildLimit(type, baseLevel)` retorna:

```
limite(type, L) = catalog[type].buildLimitBase + catalog[type].buildLimitSlope · (L - 1)
```

Tabela de referência (apenas para entender o crescimento, não é hardcoded):

| Tipo    | F(L=1) | F(L=2) | F(L=3) | F(L=5) | F(L=10) | F(L=20) |
|---------|--------|--------|--------|--------|---------|---------|
| cover   | 3      | 5      | 7      | 11     | 21      | 41      |
| taraque | 1      | 2      | 3      | 5      | 10      | 20      |
| per     | 1      | 2      | 3      | 5      | 10      | 20      |
| hef     | 1      | 2      | 3      | 5      | 10      | 20      |
| tujai   | 1      | 2      | 3      | 5      | 10      | 20      |

**Justificativa do balanceamento inicial:**

- `cover` recebe `slope=2` porque é o único acessível na Base nível 1 e ancora toda a economia. Snowball econômico tem que ter espaço de crescer, mas o slope ainda é finito → cada novo nível da Base custa progressivamente mais (1.5^L), então o jogador paga para liberar slot.
- Demais tipos seguem `slope=1` para manter a fórmula simples, igualar pressão entre defesa (per/hef), ofensa (tujai) e tech (taraque), e deixar o tuning futuro acontecer trocando dois números no catálogo.
- A fórmula é linear de propósito: cresce indefinidamente, mas o **custo** de subir a Base é exponencial (`cost · 1.5^L`), o que freia a expansão sem precisar de cap rígido.

### 4.2 Contagem que Conta para o Limite

Conta para o limite de quantidade somente o que cumpre **todas** as condições:

- `ownerId === player.playerId`;
- `disabled === false`;
- existe em `room.structures` (não em `memory.structures`).

**Não conta:**

- estruturas próprias desativadas (`disabled: true`) — o slot fica livre para reconstruir;
- estruturas alheias mesmo que próximas;
- estruturas neutras desativadas no mapa inicial.

**Conta mas pode ultrapassar o cap (via captura):** quando o jogador captura uma estrutura inimiga ativa, ela entra na contagem normalmente; se isso ultrapassar o limite, o jogador fica em estado `over-cap` (ver §4.4).

### 4.3 Cap de Nível por Estrutura

Para qualquer estrutura `s` que **não seja Base**:

```
nivelMaximo(s) = baseLevel(owner)
```

A Base não tem teto (é o que destrava o teto das outras).

Regra do upgrade: se `s.level >= baseLevel` então o upgrade **falha** com log explicativo `"NomeEstrutura ja esta no nivel maximo permitido pela Base (lvl X). Suba a Base para liberar."`.

Quando a Base evolui, todas as estruturas continuam no nível atual; elas passam a poder ser upgradadas novamente até o novo teto. **Não há auto-upgrade** — o jogador paga o upgrade quando quiser.

### 4.4 Captura Como Exceção (Estado `over-cap`)

A captura **não verifica** o limite. Se um jogador captura uma estrutura cujo tipo já está no cap, a captura conclui normalmente e a posse muda. O resultado é um estado transitório:

- A contagem do tipo fica acima do limite (ex.: cover 4/3).
- O jogador **não pode construir** mais daquele tipo até a contagem cair de volta ao cap (estrutura destruída/capturada por inimigo) **ou** subir a Base.
- O cap de **nível** continua valendo: a estrutura capturada pode ter nível maior do que a Base do novo dono. Ela mantém o nível com que foi capturada, mas não pode receber upgrade enquanto `s.level >= novoDono.base.level`.

Não há penalidade extra além do bloqueio de novas builds do tipo. O log mostra `"cover 4/3 — sem novos slots ate cair abaixo do limite."` na primeira tentativa de build.

### 4.5 Slot Bloqueado Por Estrutura Desativada Própria

Cenário: jogador construiu Cover, ele caiu para integridade 0 e ficou `disabled: true` ainda com `ownerId` do jogador.

Conforme §4.2, estruturas **próprias desativadas não contam para o limite**, então o jogador pode reconstruir imediatamente. A husk continua no mapa e capturável por inimigos. Esse é o comportamento desejado: a perda em combate libera espaço logístico imediatamente.

### 4.6 Estado Público — Catalog Exposto

[public/game.js:652](public/game.js#L652) e [public/game.js:678](public/game.js#L678) já clonam `STRUCTURES` no `catalog.structures`. Os novos campos `buildLimitBase` e `buildLimitSlope` viajam junto automaticamente.

Adicionar derivados pré-calculados no estado público para HUD e IA não precisarem refazer a conta:

```js
catalog.limits = {
    cover:   { current: <int>, max: <int> },
    taraque: { current: <int>, max: <int> },
    per:     { current: <int>, max: <int> },
    hef:     { current: <int>, max: <int> },
    tujai:   { current: <int>, max: <int> },
}
```

Calculado por jogador em `createFilteredPublicState` ([public/game.js:665](public/game.js#L665)). No estado *unfiltered* (sem `playerId`), `catalog.limits` é omitido.

---

## 5. Impacto Em `public/game.js`

### 5.1 Catálogo

Adicionar `buildLimitBase` e `buildLimitSlope` aos 5 tipos buildáveis em [public/game.js:25](public/game.js#L25). A Base não recebe esses campos (não é buildável).

### 5.2 `canBuildStructure`

[public/game.js:2331](public/game.js#L2331) hoje só checa `requiresBaseLevel` / `requiresResearch`. Adicionar checagem de quantidade:

```js
function canBuildStructure(room, player, type) {
    // ... checagens atuais ...

    const base = room.structures[player.baseId]
    if (!base) return false
    const limit = getBuildLimit(type, base.level)
    const current = countActiveOwnedStructures(room, player.playerId, type)
    if (current >= limit) return false

    return true
}

function getBuildLimit(type, baseLevel) {
    const catalog = STRUCTURES[type]
    if (!catalog || !catalog.buildable) return 0
    return catalog.buildLimitBase + catalog.buildLimitSlope * (baseLevel - 1)
}

function countActiveOwnedStructures(room, playerId, type) {
    return Object.values(room.structures)
        .filter(s => s.ownerId === playerId && s.type === type && !s.disabled)
        .length
}
```

`buildStructure` em [public/game.js:1076](public/game.js#L1076) já chama `canBuildStructure`, então o bloqueio acontece automaticamente. Adicionar log dedicado quando a falha for por limite:

```js
addLog(room, `${player.gamerTag}: ${catalog.label} ${current}/${limit} — suba a Base para liberar.`)
```

### 5.3 `upgradeStructure`

[public/game.js:1122](public/game.js#L1122) precisa do cap de nível antes do desconto de carvão:

```js
if (structure.type !== 'base') {
    const base = room.structures[player.baseId]
    if (!base || structure.level >= base.level) {
        addLog(room, `${player.gamerTag}: ${STRUCTURES[structure.type].label} ja esta no nivel maximo permitido pela Base (lvl ${base ? base.level : 0}).`)
        return false
    }
}
```

A Base segue sem cap. Nada além disso muda no fluxo de upgrade.

### 5.4 Captura

[public/game.js](public/game.js) (fluxo de captura) **não** ganha novas restrições. Mas a função que confere se o jogador pode pedir captura segue inalterada. O over-cap é absorvido naturalmente pelos checks de `canBuildStructure`.

### 5.5 `getPublicState`

Adicionar `computePlayerLimits(room, playerId)` que devolve o mapa `{ type: { current, max } }` e injetar em `catalog.limits` apenas na versão filtrada ([public/game.js:678](public/game.js#L678)).

### 5.6 HUD / Render

Em [public/render-screen.js](public/render-screen.js) (HUD de estruturas), exibir `X/Y` ao lado do contador por tipo. Quando `current >= max`, destacar em cor de alerta. Quando `current > max` (estado over-cap por captura), usar cor de erro.

---

## 6. Impacto Na IA Composta — Sem Compatibilidade

Princípio: o agente passa a operar **dentro do regime de limites como única realidade**. Não há flag, modo legacy, fallback dataset, nem código condicional `if oldLimit`. Os artefatos antigos em `ai/agente-composto/redes/*.json` serão **regenerados do zero** depois das mudanças.

### 6.1 Validadores ([ai/agente-composto/validadores.js](ai/agente-composto/validadores.js))

**`canBuild`** ([ai/agente-composto/validadores.js:280](ai/agente-composto/validadores.js#L280)): adicionar checagem usando `state.catalog.limits[type]`:

```js
export function canBuild(state, player, type) {
    const catalog = state.catalog?.structures?.[type]
    if (!catalog) return false

    const limit = state.catalog?.limits?.[type]
    if (limit && limit.current >= limit.max) return false

    if (type === 'cover') return true
    // ... resto do fluxo atual ...
}
```

**`getUpgradeableTargets`** ([ai/agente-composto/validadores.js:303](ai/agente-composto/validadores.js#L303)): filtrar estruturas que já bateram o teto de nível:

```js
export function getUpgradeableTargets(state, playerId) {
    const base = getOwnBase(state, playerId)
    const baseLevel = base ? base.level : 0
    return Object.values(state.structures || {})
        .filter(s => s.ownerId === playerId && !s.disabled)
        .filter(s => s.type === 'base' || s.level < baseLevel)
}
```

**Não há fallback de compatibilidade**: a função antiga é substituída, não aumentada.

**`criarComandoUpgrade`** já consome `getUpgradeableTargets`, então herda a restrição.

**Prioridade de upgrade ([ai/agente-composto/validadores.js:308](ai/agente-composto/validadores.js#L308)):** Base passa de `priority 0` para um cálculo dinâmico que sobe quando há tipos travados no cap. Implementação:

```js
export function getUpgradePriority(structure, context = {}) {
    if (structure.type === 'base' && context.cappedTypes > 0) return -1
    // ... lógica atual ...
}
```

`context.cappedTypes` vem do agente, contando quantos tipos têm `current >= max` no `catalog.limits`.

### 6.2 Codificação De Escalares ([ai/agente-composto/codificacao/escalares.js](ai/agente-composto/codificacao/escalares.js))

A rede `router` precisa de **sinais novos** para aprender que subir a Base é a saída quando os caps travam. Adicionar 6 escalares em [ai/agente-composto/codificacao/escalares.js:34](ai/agente-composto/codificacao/escalares.js#L34):

| Novo escalar | Definição |
|---|---|
| `coverSlotRatio` | `cover.current / max(1, cover.max)` |
| `taraqueSlotRatio` | `taraque.current / max(1, taraque.max)` |
| `perSlotRatio` | `per.current / max(1, per.max)` |
| `hefSlotRatio` | `hef.current / max(1, hef.max)` |
| `tujaiSlotRatio` | `tujai.current / max(1, tujai.max)` |
| `cappedTypesFraction` | `(# tipos com current >= max) / 5` |

Vetor de escalares cresce de 24 para 30. Refletir em [ai/agente-composto/constants.js](ai/agente-composto/constants.js):

```js
export const SCALAR_INPUTS = [
    // ... 24 atuais ...
    'coverSlotRatio',
    'taraqueSlotRatio',
    'perSlotRatio',
    'hefSlotRatio',
    'tujaiSlotRatio',
    'cappedTypesFraction',
]
```

Isso muda `SCALAR_INPUT_SIZE`, `COMPOSITE_INPUT_SIZE` e `PLACEMENT_INPUT_SIZE` automaticamente. Todas as redes em `NETWORK_SPECS` recalculam tamanho de entrada — **as redes existentes ficam incompatíveis e devem ser retreinadas**. É a substituição completa: nenhuma das `*.json` salvas em `ai/agente-composto/redes/` é reaproveitada.

### 6.3 Política Do Router

`MACRO_ACTIONS` ganha (ou enfatiza) `upgrade-base` como saída distinta. Hoje há `upgrade` genérica; com os limites, a Base vira o caminho mais frequente, então faz sentido separar:

```js
export const MACRO_ACTIONS = [
    'farm',
    'capture',
    'research',
    'defend',
    'attack',
    'upgrade',        // upgrade de qualquer estrutura não-base
    'upgrade-base',   // novo
    'scout',
    'wait',
]
```

`MACRO_ACTIONS.length` passa de 8 para 9 → tamanho de saída da rede `router` muda → também precisa retreinar.

Em `agente-composto.js`, adicionar handler para `upgrade-base`:

```js
if (macro === 'upgrade-base') {
    return criarComandoParaAcao('upgrade-base', state, playerId, { heatmap })
}
```

E em `validadores.js`:

```js
if (acao === 'upgrade-base') {
    return criarComandoUpgrade(state, playerId, opcoes.heatmap, ['base'])
}
```

(o `criarComandoUpgrade(..., ['base'])` já existe; é o caso `upgrade-base` da linha [ai/agente-composto/validadores.js:27](ai/agente-composto/validadores.js#L27)).

### 6.4 Datasets

Todos os datasets em [ai/agente-composto/treino/](ai/agente-composto/treino/) precisam revisão:

- **`dataset-router.js`**: novos exemplos para `upgrade-base` cobrindo "caps travados, carvão suficiente, suba a Base"; e exemplos negativos onde caps não estão travados → a saída não deve ser `upgrade-base`.
- **`dataset-farm.js`**: estados com `coverSlotRatio = 1.0` devem produzir `wait` ou cair para outra macro — o farm bot não tem mais como mandar `build-cover` num estado capado.
- **`dataset-defend.js`** / **`dataset-attack.js`**: idem para per/hef/tujai.
- **`dataset-upgrade.js`**: filtrar exemplos onde alvo está no cap de nível (`s.level >= baseLevel`).
- **`dataset-placement.js`**: nenhum exemplo de tile válido para tipo capado.

Não há merge com o dataset antigo. Substituição completa.

### 6.5 Heurística De Emergência

A heurística de fallback no agente composto (acionada quando as redes ainda não foram treinadas) **não é compatibilidade** com o agente antigo — é um modo de operação simples para o agente atual quando os modelos `.json` não existem. Ela precisa ser reescrita para também respeitar os limites:

- nunca emitir `build-X` se `state.catalog.limits[X].current >= state.catalog.limits[X].max`;
- nunca emitir `upgrade` para estrutura não-base com `s.level >= base.level`;
- priorizar `upgrade-base` quando ≥ 2 tipos estão capados.

Substituição direta da lógica heurística; sem `if (limitsExist)` — `state.catalog.limits` é parte garantida do contrato pós-mudança.

### 6.6 Documentação `docs/estrategia-ia.md`

Atualizar [docs/estrategia-ia.md](docs/estrategia-ia.md):

- Seção "Codificacao Do Input" passa de 24 para 30 escalares e novo total (`COMPOSITE_INPUT_SIZE` recalculado).
- Seção "Redes" lista `upgrade-base` em `MACRO_ACTIONS`.
- Adicionar parágrafo sobre limites em "Validadores Deterministicos".

---

## 7. HUD / Cliente

- HUD lista cada tipo com `current/max`. Indicação visual em três estados:
  - normal (current < max)
  - cheio (current === max) → cor de alerta
  - estourado (current > max, só via captura) → cor de erro com tooltip explicativo.
- Tooltip do botão **W** (upgrade) mostra `"Bloqueado: nivel da estrutura ja igual ao nivel da Base"` quando aplicável.
- Tooltip do botão **A** (Cover) mostra `"3/3 — suba a Base"` quando o slot estiver cheio.

---

## 8. Migração / Impacto em Partidas Existentes

Como o servidor é single-process e cada `room` é efêmera, não há migração de save. O efeito sobre partidas já abertas no momento do deploy:

- Salas existentes herdam o novo catálogo no próximo `getPublicState`, então o HUD começa a mostrar `current/max` no tick seguinte.
- Estruturas que já existem acima do novo cap de nível (ex.: torre Per nível 3 com Base 1, possível no regime antigo): ficam intocadas mas perdem a capacidade de upgrade até a Base subir. Não há *downgrade*.
- Estruturas que já existem em quantidade acima do novo limite: ficam intocadas (estado over-cap inicial); jogador só não pode construir mais até cair abaixo.

Como as IAs com modelos antigos têm input size incompatível, o servidor recusa carregar `.json` legados após a mudança (a checagem de dimensões já existe na rede neural). O comando `npm run train:ai` regenera o conjunto inteiro.

## 9. Plano de Testes

Cobertura precisa manter 100% (regra em [package.json](package.json)).

**Testes de game** ([tests/game.test.js](tests/game.test.js)):

- `buildStructure` rejeita Cover quando contagem ativa já é igual ao limite.
- `buildStructure` aceita Cover de volta após uma cover própria virar `disabled` (slot reabre).
- `upgradeStructure` rejeita upgrade de Cover lvl 2 quando Base é lvl 2; aceita após Base subir para lvl 3.
- `upgradeStructure` aceita upgrade da Base sem checagem de cap.
- Captura conclui mesmo com cap cheio; tentar `build` em seguida é bloqueado.
- `getPublicState` filtrado expõe `catalog.limits` com os valores corretos por jogador.
- Fórmula linear: `getBuildLimit('cover', 1) === 3`, `(.., 2) === 5`, `(.., 20) === 41`.

**Testes de IA** ([tests/ai.test.js](tests/ai.test.js), [tests/ai/](tests/ai/)):

- `canBuild` retorna `false` quando `catalog.limits[type].current >= max`.
- `getUpgradeableTargets` exclui estruturas com `level >= baseLevel` (não-base).
- `criarComandoUpgrade` com `allowedTypes=['base']` ainda funciona como `upgrade-base`.
- `encodeScalars` produz vetor de tamanho 30 com `coverSlotRatio` correto.
- `decidirComRedes` propaga `upgrade-base` quando o router escolhe essa macro.
- Heurística de emergência respeita ambos os limites (quantidade e nível).

**Testes de render** ([tests/render-screen.test.js](tests/render-screen.test.js)):

- HUD desenha `3/3` quando `catalog.limits.cover` está cheio.
- HUD aplica classe de over-cap quando `current > max`.

## 10. Roadmap de Implementação

Ordem sugerida (PRs separados ou commits coerentes):

1. **Catálogo + `getBuildLimit`** em `public/game.js`. Adicionar `catalog.limits` no estado filtrado.
2. **`canBuildStructure` com limite de quantidade**. Logs e testes.
3. **`upgradeStructure` com cap de nível**. Logs e testes.
4. **HUD**: contadores `current/max` e estados visuais; teste de render.
5. **`validadores.js`**: `canBuild` + `getUpgradeableTargets`. Sem fallback.
6. **`constants.js` + `escalares.js`**: novos 6 escalares, novo `MACRO_ACTIONS`. Recalcular tamanhos.
7. **Datasets**: revisar/reescrever todos em `treino/dataset-*.js`.
8. **Heurística de emergência** em `agente-composto.js` (caminho sem modelos `.json`).
9. **Documentação**: atualizar [docs/estrategia-ia.md](docs/estrategia-ia.md) e [README.md](README.md).
10. **Retreinar**: `npm run train:ai` para regenerar `ai/agente-composto/redes/*.json`.

Cada passo mantém o jogo jogável e testes passando, exceto entre 6 e 10 onde a IA fica sem modelos válidos — heurística de emergência segura essa janela.

## 11. Arquivos Tocados

- [public/game.js](public/game.js) — catálogo, `canBuildStructure`, `upgradeStructure`, `getPublicState`.
- [public/render-screen.js](public/render-screen.js) — HUD contadores.
- [public/index.html](public/index.html) — estilos dos estados normal/cheio/estourado, tooltips dos botões W e A.
- [ai/agente-composto/validadores.js](ai/agente-composto/validadores.js) — `canBuild`, `getUpgradeableTargets`, prioridades.
- [ai/agente-composto/codificacao/escalares.js](ai/agente-composto/codificacao/escalares.js) — 6 novos escalares.
- [ai/agente-composto/constants.js](ai/agente-composto/constants.js) — `SCALAR_INPUTS`, `MACRO_ACTIONS`, recompute de tamanhos.
- [ai/agente-composto/agente-composto.js](ai/agente-composto/agente-composto.js) — handler de `upgrade-base`, heurística de emergência atualizada.
- [ai/agente-composto/treino/](ai/agente-composto/treino/) — todos os datasets revisados.
- [ai/agente-composto/redes/](ai/agente-composto/redes/) — regenerado por `npm run train:ai`.
- [docs/estrategia-ia.md](docs/estrategia-ia.md) — sincronizar texto com nova entrada/saída.
- [README.md](README.md) — descrição do sistema de limites na seção de construções.
- [tests/game.test.js](tests/game.test.js) e [tests/ai.test.js](tests/ai.test.js) — novos cenários.

## 12. Riscos & Mitigações

| Risco | Mitigação |
|---|---|
| Slope `2` no cover criar snowball desbalanceado em partidas longas | Slope é um número no catálogo; é trivial baixar para `1` ou tornar a base= 2 sem mudar arquitetura. |
| IA aprender a sempre escolher `upgrade-base` ignorando outras macros | Dataset de router precisa exemplos negativos com caps em folga; testes de regressão em `tests/ai.test.js` checam decisão em estados não-capados. |
| Captura over-cap virar exploit (encher de torres acima do cap antes de subir Base) | Mitigação é o próprio custo de upgrade do dono original já ter sido pago. O cap de nível continua valendo: a torre capturada só upgradeia quando a Base do novo dono alcança o nível dela. |
| Jogadores reclamarem do bloqueio "lvl da estrutura igual à Base" | HUD e logs explicam a regra. Decisão consciente de design para centralizar progressão na Base. |
