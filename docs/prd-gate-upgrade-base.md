# PRD — Gate Percentual de Upgrade da Base

Status: rascunho para revisão · Autor: planejamento conduzido por Claude · Data: 2026-05-21

Este documento descreve a adição de um **gate de progressão** sobre o upgrade da Base: a Base só sobe de nível se a **média de níveis das estruturas próprias ativas** alcançar uma cota proporcional ao nível atual da Base. A regra encaixa nas decisões já implementadas em [docs/prd-limites-construcao.md](docs/prd-limites-construcao.md): a Base continua sendo o eixo central da progressão, mas agora **destravá-la exige amadurecimento real do resto da economia**, não só carvão acumulado.

A IA composta passa a enxergar o gate no estado público e a decidir de forma coerente: investir em upgrades de estruturas não-base quando o gate está fechado, e priorizar `upgrade-base` quando estiver liberado.

---

## 1. Objetivos

1. Tornar o upgrade da Base **dependente do amadurecimento das outras estruturas**: a Base só sobe quando o jogador investe em evoluir o resto da economia/defesa.
2. Manter a regra **infinitamente escalável** por uma fórmula linear (`mediaNiveis >= baseLevel * 0.75`).
3. Expor a cota no `catalog.limits` do estado público para HUD e IA decidirem sobre a mesma fonte de verdade.
4. Atualizar a IA composta para que router e validadores respeitem o gate, **sem caminhos de compatibilidade** com o regime anterior.
5. Reaproveitar a macro-ação `wait` já existente como o caminho explícito de "não agir neste tick" — sem introduzir uma macro `idle` adicional.

## 2. Não-Objetivos

- Não rebalancear custos de upgrade nem mexer nas fórmulas de integridade/barreira/produção por nível.
- Não criar uma nova macro-ação `idle`. A `wait` já presente em `MACRO_ACTIONS` cumpre o papel.
- Não alterar as regras de limites de quantidade nem de cap de nível introduzidas em [docs/prd-limites-construcao.md](docs/prd-limites-construcao.md). Este PRD soma-se ao anterior.
- Não introduzir downgrade da Base se a média cair (a cota é uma porta de entrada, não uma porta de saída).

## 3. Decisões Já Alinhadas

| Decisão | Valor escolhido |
|---|---|
| Fórmula do gate | `mediaNiveis >= baseLevel * 0.75` (linear, infinitamente escalável) |
| Quem entra na média | **Estruturas próprias ativas** que não sejam a Base (média simples) |
| Estruturas desativadas próprias | **Não entram** na média (coerente com o limite de quantidade do PRD anterior) |
| Macro `idle` na IA | **Não criar**. Reaproveitar `wait` que já existe em `MACRO_ACTIONS` |
| Compatibilidade | **Substituição completa** — sem flags, sem dataset legado |

---

## 4. Regra Do Gate

### 4.1 Fórmula

Para subir a Base do nível `L` para `L+1`, o jogador precisa atender:

```
mediaNiveis(player) >= L * 0.75
```

Onde:

```
mediaNiveis(player) = somaNiveis(estruturasProprias) / contagem(estruturasProprias)
```

`estruturasProprias` aqui significa: `s.ownerId === player.playerId && s.type !== 'base' && s.disabled === false`.

A comparação é em ponto flutuante, sem arredondamento (`>=`). O gate é função apenas do nível **atual** da Base; o nível alvo (L+1) não entra na conta.

### 4.2 Tabela De Referência

| Base atual (L) | Cota de média | Como atingir (exemplos) |
|---|---|---|
| 1 | 0.75 | 1 cover lvl 1 → média 1.0 ✓ |
| 2 | 1.50 | 1 cover lvl 2 → 2.0 ✓; ou 3 cover lvl 1 + 2 cover lvl 2 = 1.4 ✗ |
| 3 | 2.25 | 1 estrutura lvl 3 + 1 lvl 2 = 2.5 ✓; ou 5 estruturas lvl 2 = 2.0 ✗ |
| 4 | 3.00 | 4 estruturas lvl 3 = 3.0 ✓ (limite do exemplo do usuário) |
| 10 | 7.50 | Estruturas precisam de média ≥ 7.5 |
| 100 | 75.00 | Estruturas precisam de média ≥ 75 (caso assintótico do usuário) |

A regra é uniforme: sempre **75% do nível atual da Base** (`L · 0.75`).

### 4.3 Casos De Borda

| Cenário | Comportamento |
|---|---|
| Jogador não tem nenhuma estrutura própria ativa (Base lvl 1 recém-criada) | `mediaNiveis = 0`, gate fechado. Precisa construir pelo menos 1 cover lvl 1 para destravar. |
| Jogador tem só estruturas desativadas próprias | Mesma coisa: nada conta. Gate fechado. |
| Jogador captura uma estrutura inimiga de nível alto | Entra na média imediatamente e pode empurrar acima da cota; comportamento intencional — captura recompensa quem domina o mapa. |
| Jogador upa Base de 4 para 5 com média justo em 3.0 | Permitido (`>=`). |
| Logo após o upgrade da Base, a nova cota fica fora de alcance | Esperado: jogador agora precisa upar as estruturas até `(L+1) · 0.75` para subir de novo. Cap de nível por estrutura (PRD anterior) ainda vale: estruturas ≤ Base. |

### 4.4 Constante Configurável

A razão `0.75` é exposta como constante no catálogo, não hardcoded em múltiplos lugares:

```js
const CONFIG = {
    ...,
    baseUpgradeAverageRatio: 0.75,
}
```

Permite tuning rápido se o playtest mostrar que `0.75` é severo demais (ou frouxo demais) sem mexer em validadores, IA ou HUD.

---

## 5. Impacto Em `public/game.js`

### 5.1 `upgradeStructure` Para A Base

[public/game.js:1122](public/game.js#L1122) recebe checagem nova **antes** do desconto de carvão e logo após a checagem genérica de upgrade:

```js
if (structure.type === 'base') {
    const average = computeAverageStructureLevel(room, player.playerId)
    const required = structure.level * CONFIG.baseUpgradeAverageRatio
    if (average < required) {
        addLog(room, `${player.gamerTag}: Base bloqueada — media de estruturas ${average.toFixed(2)} < ${required.toFixed(2)} (75% do nivel atual).`)
        return false
    }
}
```

Cap de nível por estrutura (regra do PRD anterior) continua isolado para o caso `s.type !== 'base'`. A Base não tem cap de nível, mas agora tem cota de gate.

### 5.2 `computeAverageStructureLevel`

Função utilitária nova, ao lado de `getBuildLimit` / `countActiveOwnedStructures`:

```js
function computeAverageStructureLevel(room, playerId) {
    const owned = Object.values(room.structures)
        .filter(s => s.ownerId === playerId && s.type !== 'base' && !s.disabled)

    if (owned.length === 0) return 0

    const sum = owned.reduce((total, s) => total + s.level, 0)
    return sum / owned.length
}
```

### 5.3 `catalog.limits` Ganha `baseUpgrade`

No estado público filtrado ([public/game.js:665](public/game.js#L665)), `catalog.limits` ganha um campo dedicado:

```js
catalog.limits.baseUpgrade = {
    averageLevel: 2.71,
    required: 3.00,
    ratio: 0.75,
    ready: false,
}
```

`ready` é `averageLevel >= required`. HUD e IA usam direto.

### 5.4 Logs

- Falha por gate: `"<gamerTag>: Base bloqueada — media de estruturas X.XX < Y.YY (75% do nivel atual)."`
- Sucesso de upgrade da Base mantém o log atual.

---

## 6. Impacto Na IA — Sem Compatibilidade

### 6.1 Validador `criarComandoParaAcao('upgrade-base', …)`

[ai/agente-composto/validadores.js:27](ai/agente-composto/validadores.js#L27) hoje delega para `criarComandoUpgrade(state, playerId, heatmap, ['base'])`. Após este PRD, a função precisa rejeitar quando o gate está fechado, lendo direto de `state.catalog.limits.baseUpgrade.ready`:

```js
export function criarComandoUpgrade(state, playerId, heatmap = null, allowedTypes = null) {
    const player = state.players?.[playerId]
    if (!player) return null

    if (allowedTypes?.includes('base') && allowedTypes.length === 1) {
        const gate = state.catalog?.limits?.baseUpgrade
        if (!gate?.ready) return null
    }

    // ... resto do fluxo atual (já inclui filtro de level cap do PRD anterior) ...
}
```

Quando `upgrade-base` retorna `null`, o agente passa para a próxima macro do ranking (`farm`, `attack`, `upgrade`, etc.), o que é o comportamento desejado: se a IA não pode upar a Base, ela tenta investir em outra coisa.

### 6.2 Codificação De Escalares

Adicionar **2 escalares** novos em [ai/agente-composto/codificacao/escalares.js:34](ai/agente-composto/codificacao/escalares.js#L34) (somando-se aos 6 do PRD anterior):

| Novo escalar | Definição |
|---|---|
| `averageStructureLevelRatio` | `min(1, gate.averageLevel / max(1, gate.required))` — quão perto a média está do necessário |
| `baseUpgradeReady` | `gate.ready ? 1 : 0` — flag dura, para o router aprender o gate como sinal categórico |

Os escalares passam de 30 para 32. Reflexo automático em [ai/agente-composto/constants.js](ai/agente-composto/constants.js):

```js
export const SCALAR_INPUTS = [
    // ... 30 atuais (PRD anterior) ...
    'averageStructureLevelRatio',
    'baseUpgradeReady',
]
```

`SCALAR_INPUT_SIZE`, `COMPOSITE_INPUT_SIZE` e `PLACEMENT_INPUT_SIZE` recalculam. Como o tamanho de entrada das redes muda, **todas as redes em `ai/agente-composto/redes/` são descartadas e regeneradas** via `npm run train:ai`. Sem fallback de compatibilidade.

### 6.3 Política Do Router

`MACRO_ACTIONS` **não muda** em relação ao PRD anterior:

```js
export const MACRO_ACTIONS = [
    'farm', 'capture', 'research', 'defend',
    'attack', 'upgrade', 'upgrade-base', 'scout', 'wait',
]
```

`wait` continua sendo o caminho de "não agir" — a IA escolhe `wait` quando nenhuma outra macro produz comando válido **e** está estrategicamente esperando recursos/oportunidade.

> Observação: o handler atual de `wait` em [ai/agente-composto/agente-composto.js:106](ai/agente-composto/agente-composto.js#L106) usa `continue` para pular `wait` no ranking. Isso significa que mesmo quando `wait` é o top score, o agente tenta a próxima. Esse comportamento **não muda** neste PRD; pode ser revisitado depois se o playtest mostrar a IA sendo hiperativa. Decisão alinhada com o usuário: manter `wait` como está.

### 6.4 Heurística De Prioridade Em `upgrade` (Não-Base)

Quando o gate da Base está fechado, faz sentido a IA priorizar **estruturas de menor nível** para subir a média rapidamente. Ajuste em `getUpgradePriority`:

```js
export function getUpgradePriority(structure, context = {}) {
    if (structure.type === 'base' && context.cappedTypes > 0) return -1
    if (context.gateClosed && structure.level < context.averageLevel) return -2
    return basePriority(structure)
}
```

`context.gateClosed = !state.catalog.limits.baseUpgrade.ready` e `context.averageLevel = state.catalog.limits.baseUpgrade.averageLevel`. A função `criarComandoUpgrade` injeta esse contexto.

### 6.5 Datasets

Revisão de datasets em [ai/agente-composto/treino/](ai/agente-composto/treino/), **sem merge com a versão atual**:

- **`dataset-router.js`**: novos exemplos
  - Caps em folga + gate fechado → macro `upgrade` (não-base) para empurrar média.
  - Caps cheios + gate aberto → macro `upgrade-base`.
  - Caps cheios + gate fechado + sem upgrades possíveis (todas no cap de nível) → `wait`.
- **`dataset-upgrade.js`**: priorizar estruturas com `level < averageStructureLevel` quando `baseUpgradeReady=0`.
- **`dataset-farm.js`** / **`dataset-defend.js`** / **`dataset-attack.js`**: nenhuma mudança específica, mas reciclados com os novos escalares no input.
- **`dataset-placement.js`**: sem impacto (não depende do gate).

### 6.6 Heurística De Emergência

A heurística usada quando os modelos `.json` ainda não foram treinados (em [ai/agente-composto/agente-composto.js](ai/agente-composto/agente-composto.js)) é reescrita para refletir o gate:

- **Não emitir `upgrade-base`** se `state.catalog.limits.baseUpgrade.ready === false`.
- Quando gate fechado, preferir `upgrade` de estrutura não-base de menor nível antes de novas builds.
- Quando gate aberto **e** caps cheios, emitir `upgrade-base`.
- Quando nada funciona, retornar `null` (equivalente a `wait`).

Substituição direta. Sem `if (gate)` para o regime antigo.

---

## 7. HUD / Cliente

- Painel da Base mostra o estado do gate:
  - `"Base lvl 4 — media 2.71 / necessario 3.00 (75%)"` em cinza quando fechado.
  - `"Base lvl 4 — pronto para upar"` em verde quando aberto.
- Botão **W** sobre a Base fica desabilitado quando `catalog.limits.baseUpgrade.ready === false`, com tooltip explicando a cota.
- Em [public/render-screen.js](public/render-screen.js), barra de progresso da média (`averageLevel / required`) ao lado do nível da Base.

---

## 8. Migração

Mesmo cenário do PRD anterior: nenhuma migração de save (salas são efêmeras). Salas existentes no momento do deploy adotam a regra no próximo tick:

- Jogador com Base lvl 4 e média 1.5 perde a possibilidade de upar até a média subir para 3.0.
- Como `catalog.limits.baseUpgrade` é parte garantida do estado pós-mudança, o cliente e a IA não precisam de checagem defensiva.

Modelos `.json` antigos são incompatíveis (tamanho de entrada mudou). `npm run train:ai` regenera tudo.

---

## 9. Plano De Testes

Cobertura precisa manter 100% (regra em [package.json](package.json)).

**Testes de game** ([tests/game.test.js](tests/game.test.js)):

- `upgradeStructure` rejeita upgrade da Base quando média < `L * 0.75`.
- `upgradeStructure` aceita upgrade da Base quando média == `L * 0.75` (borda do `>=`).
- `upgradeStructure` aceita Base mesmo com média muito acima da cota (sem teto).
- `computeAverageStructureLevel` ignora Base, ignora desativadas próprias, ignora estruturas alheias.
- `computeAverageStructureLevel` retorna 0 quando jogador não tem estrutura própria não-base ativa.
- `getPublicState` filtrado expõe `catalog.limits.baseUpgrade` com `averageLevel`, `required`, `ratio`, `ready` corretos.
- `CONFIG.baseUpgradeAverageRatio` muda a cota sem mexer no código.

**Testes de IA** ([tests/ai.test.js](tests/ai.test.js)):

- `criarComandoParaAcao('upgrade-base', state, playerId)` retorna `null` quando `baseUpgrade.ready === false`.
- `criarComandoParaAcao('upgrade-base', state, playerId)` retorna comando válido quando `baseUpgrade.ready === true`.
- `encodeScalars` produz vetor de tamanho 32 com `averageStructureLevelRatio` e `baseUpgradeReady` corretos.
- `getUpgradePriority` prioriza estruturas com nível abaixo da média quando `gateClosed=true`.
- Heurística de emergência respeita o gate.

**Testes de render** ([tests/render-screen.test.js](tests/render-screen.test.js)):

- HUD desenha barra de progresso da média com cor cinza quando fechado, verde quando aberto.
- Tooltip de W na Base contém a mensagem do gate quando fechado.

---

## 10. Roadmap De Implementação

1. **`CONFIG.baseUpgradeAverageRatio` + `computeAverageStructureLevel`** em `public/game.js`. Testes da função pura.
2. **`upgradeStructure` para Base com gate**. Testes de aceitação/rejeição na borda.
3. **`catalog.limits.baseUpgrade`** em `createFilteredPublicState`. Testes do estado público.
4. **HUD**: barra de progresso da média na Base, tooltip do botão W.
5. **`validadores.js`**: `criarComandoUpgrade` com checagem `baseUpgrade.ready` quando `allowedTypes === ['base']`.
6. **Novos escalares** em `escalares.js` / `constants.js`. Recompute de tamanhos.
7. **Heurística de prioridade** em `getUpgradePriority` para empurrar média quando gate fechado.
8. **Heurística de emergência** atualizada em `agente-composto.js`.
9. **Datasets** revisados em `treino/dataset-*.js`.
10. **Retreinar**: `npm run train:ai` regenera `ai/agente-composto/redes/*.json`.
11. **Documentação**: atualizar [docs/estrategia-ia.md](docs/estrategia-ia.md) (lista de escalares passa para 32; menção ao gate na seção de validadores) e [README.md](README.md) (seção da Base e seção de Construções).

---

## 11. Arquivos Tocados

- [public/game.js](public/game.js) — `CONFIG.baseUpgradeAverageRatio`, `computeAverageStructureLevel`, `upgradeStructure`, `getPublicState`.
- [public/render-screen.js](public/render-screen.js) — barra de progresso da média.
- [public/index.html](public/index.html) — estilo do gate aberto/fechado, tooltip do W.
- [ai/agente-composto/validadores.js](ai/agente-composto/validadores.js) — `criarComandoUpgrade`, `getUpgradePriority`.
- [ai/agente-composto/codificacao/escalares.js](ai/agente-composto/codificacao/escalares.js) — 2 novos escalares.
- [ai/agente-composto/constants.js](ai/agente-composto/constants.js) — `SCALAR_INPUTS` ganha 2 entradas.
- [ai/agente-composto/agente-composto.js](ai/agente-composto/agente-composto.js) — heurística de emergência atualizada.
- [ai/agente-composto/treino/](ai/agente-composto/treino/) — datasets revisados.
- [ai/agente-composto/redes/](ai/agente-composto/redes/) — regenerado por `npm run train:ai`.
- [docs/estrategia-ia.md](docs/estrategia-ia.md) — sincronizar contagem de escalares e validadores.
- [README.md](README.md) — descrição do gate na seção da Base.
- [tests/game.test.js](tests/game.test.js), [tests/ai.test.js](tests/ai.test.js) — novos cenários.

---

## 12. Riscos & Mitigações

| Risco | Mitigação |
|---|---|
| Cota de 75% trava o ritmo da partida e cria stalemate quando todos batem no cap | `CONFIG.baseUpgradeAverageRatio` é um número; baixar para `0.50` ou `0.60` é trivial sem refactor. |
| IA fica presa entre upgrades de cover de baixo nível tentando atingir a média | Prioridade `gateClosed` puxa para estruturas de menor nível, fazendo a média subir rápido. Datasets reforçam isso. |
| Jogador captura várias estruturas alheias de alto nível e "burla" a cota | Comportamento intencional: captura recompensa quem domina o mapa. Cap de nível do PRD anterior continua valendo na hora de upar a captura. |
| Jogador na Base lvl 1 fica preso sem conseguir construir cover (sem carvão) e nem upar | Improvável: começa com 750 carvões e cover custa 540. Ainda assim, gate só fecha se a média for `< 0.75`, e 1 cover lvl 1 já libera. |
| `wait` continua sendo pulado no ranking → IA pode parecer "compulsivamente ativa" | Fora do escopo deste PRD. Decisão consciente com o usuário. Pode virar PRD próprio se virar problema. |
