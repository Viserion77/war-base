## PRD — Tematica Medieval e Internacionalizacao (PT-BR/EN)

Status: rascunho para revisao · Autor: planejamento conduzido por Claude · Data: 2026-05-22

Este documento descreve a **mudanca de tematica do War Base** para uma ambientacao medieval e a introducao de **internacionalizacao** com dois idiomas na interface: portugues do Brasil (principal) e ingles (secundario). A mudanca afeta nomes de estruturas, unidades, recursos, paleta visual, sprites, sons e textos do HUD/lobby; o codigo do projeto passa a ser **todo em ingles** (chaves, identificadores, comentarios), enquanto a interface exibe textos por meio de um dicionario i18n.

A IA composta continua compativel em arquitetura: o **tamanho dos vetores de entrada nao muda** e os nomes internos das macro-acoes (`farm`, `attack`, `upgrade`, etc.) permanecem em ingles como ja sao. Apenas as **chaves de tipo** (`cover` -> `mine`, `taraque` -> `library`, etc.) mudam e o conjunto de pesos e regenerado.

---

### 1. Objetivos

1. Reposicionar o jogo numa tematica **medieval coerente**, com nomes, sprites, paleta e sons alinhados, sem alterar regras de gameplay.
2. Padronizar **todo o codigo em ingles** — chaves de estado, nomes de funcoes, comentarios, logs internos — eliminando a mistura atual de PT (`carvao`, `Capturador`) e nomes ficticios (`Taraque`, `Per`, `Hef`, `Tujai`, `Zunim`).
3. Adicionar **i18n** com dois idiomas: PT-BR (default) e EN (secundario), com seletor visivel no header e persistencia em `localStorage`.
4. Manter compatibilidade de **arquitetura da rede neural**: mesmo tamanho de entrada, mesma estrutura de macro-acoes. So o conteudo das chaves muda; os pesos sao regenerados via `npm run train:ai`.
5. Substituir assets visuais (sprite sheet, icones, logo) e sonoros para o tema, garantindo que o projeto tenha uma identidade visual unica e reconhecivel.

### 2. Nao-Objetivos

- **Nao** alterar regras de gameplay, custos, formulas de dano/barreira/regeneracao, gate de upgrade, limites de construcao, ou IA composta no nivel logico.
- **Nao** introduzir novos tipos de estrutura/unidade/recurso. A renomeacao e 1:1 com o que ja existe.
- **Nao** suportar mais de dois idiomas neste PRD. A infra de i18n permite adicao futura, mas o entregavel sao apenas `pt-BR` e `en`.
- **Nao** manter compatibilidade com chaves antigas (`cover`, `taraque`, etc.). Substituicao completa, sem alias ou shim.
- **Nao** manter compatibilidade dos modelos `.json` ja treinados em `ai/agente-composto/redes/`. Sao descartados e regenerados.

### 3. Decisoes Ja Alinhadas

| Decisao | Valor escolhido |
|---|---|
| Esquema de naming | **Tema medieval classico** — vide secao 4.1 |
| Estrategia i18n | **Dicionario i18n + seletor visivel** no header, persistencia em `localStorage('war-base:lang')` |
| Idioma default | `pt-BR` quando nao houver preferencia salva |
| Escopo de assets | Renomear/recolorir + nova paleta medieval + **novos sprites** + **novos sons** + **novo logo** para War Base |
| Impacto na IA | **Renomear** chaves e regenerar pesos. Tamanho de input inalterado, arquitetura inalterada |
| Compatibilidade | Substituicao completa. Sem flags, sem alias, sem dataset legado |
| Comentarios em codigo | Reescritos em ingles, alinhados com o restante do codigo |

---

### 4. Mapeamento De Naming

A mudanca de naming acontece em **tres camadas**:

- **Chaves de codigo** (`cover`, `coal`, etc.) — viram identificadores em ingles alinhados com o tema.
- **Labels PT-BR** — exibidos por padrao na UI.
- **Labels EN** — exibidos quando o idioma esta em `en`.

#### 4.1 Estruturas

| Chave antiga | Chave nova (codigo) | Label PT-BR | Label EN |
|---|---|---|---|
| `base` | `castle` | Castelo | Castle |
| `cover` | `mine` | Mina | Mine |
| `taraque` | `library` | Biblioteca | Library |
| `per` | `archer` | Torre de Arqueiros | Archer Tower |
| `hef` | `catapult` | Catapulta | Catapult |
| `tujai` | `barracks` | Quartel | Barracks |

#### 4.2 Unidades (NPCs)

| Chave antiga | Chave nova (codigo) | Label PT-BR | Label EN |
|---|---|---|---|
| `capturer` | `herald` | Arauto | Herald |
| `zunim` | `soldier` | Soldado | Soldier |

#### 4.3 Recursos

| Chave antiga | Chave nova (codigo) | Label PT-BR | Label EN |
|---|---|---|---|
| `coal` (PT: carvao) | `gold` | Ouro | Gold |
| `knowledge` (PT: conhecimento) | `wisdom` | Sabedoria | Wisdom |

#### 4.4 Pesquisas

Pesquisas hoje compartilham nome com a estrutura desbloqueada. Acompanham o naming das estruturas:

| Chave antiga | Chave nova (codigo) | Label PT-BR | Label EN |
|---|---|---|---|
| `per` | `archer` | Tiro de Arqueiro | Archery |
| `hef` | `catapult` | Engenharia de Cerco | Siege Engineering |
| `tujai` | `barracks` | Treinamento Militar | Military Training |

> Observacao: as chaves de pesquisa permanecem identicas as chaves de estrutura que liberam (`archer`, `catapult`, `barracks`), seguindo a convencao atual do projeto. Os labels EN/PT-BR de pesquisa carregam contexto adicional para deixar claro que se trata de uma tecnologia, nao da estrutura em si.

#### 4.5 Atalhos / Acoes

| Atalho | Acao antiga (PT misturado) | Acao nova (codigo EN) | Label PT-BR | Label EN |
|---|---|---|---|---|
| W | upgrade | `upgrade` | Evoluir | Upgrade |
| A | buildCover | `buildMine` | Construir Mina | Build Mine |
| S | spawnZunim | `spawnSoldier` | Enviar Soldado | Send Soldier |
| D | startCapture / focusOwnBase | `startCapture` / `focusOwnCastle` | Iniciar Captura / Focar Castelo | Start Capture / Focus Castle |
| Esc | clearSelection | `clearSelection` | Limpar Selecao | Clear Selection |

### 4.6 Termos De Lobby E Sala

`HostKey` e `GamerTag` ja sao termos em ingles e permanecem como chaves de identificacao. Os labels que apareciam soltos em PT (`sala`, `partida`, `Criar partida`) vao para o dicionario:

| Conceito | Chave i18n | Label PT-BR | Label EN |
|---|---|---|---|
| Sala / Partida | `lobby.room` | Sala | Room |
| Criar partida | `lobby.createMatch` | Criar Partida | Create Match |
| Entrar | `lobby.joinMatch` | Entrar | Join |
| Sem sala | `lobby.noRoom` | Sem Sala | No Room |
| Copiar HostKey | `lobby.copyHostKey` | Copiar HostKey | Copy HostKey |

---

### 5. Internacionalizacao

#### 5.1 Estrutura De Diretorios

Novo diretorio `public/i18n/` com um modulo por idioma e um helper de runtime:

```
public/
  i18n/
    index.js     # exporta t(key, vars?), getLang(), setLang(lang)
    pt-BR.js     # dicionario default
    en.js        # dicionario secundario
```

#### 5.2 Modulo `i18n/index.js`

```js
import ptBR from './pt-BR.js'
import en from './en.js'

const DICTS = { 'pt-BR': ptBR, en }
const STORAGE_KEY = 'war-base:lang'
const DEFAULT_LANG = 'pt-BR'

let currentLang = readSavedLang()
const listeners = new Set()

export function getLang() {
    return currentLang
}

export function setLang(lang) {
    if (!DICTS[lang]) return
    currentLang = lang
    localStorage.setItem(STORAGE_KEY, lang)
    listeners.forEach(fn => fn(lang))
}

export function onLangChange(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
}

export function t(key, vars) {
    const dict = DICTS[currentLang] || DICTS[DEFAULT_LANG]
    const template = dict[key] ?? DICTS[DEFAULT_LANG][key] ?? key
    return vars ? interpolate(template, vars) : template
}

function interpolate(template, vars) {
    return template.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? '')
}

function readSavedLang() {
    const saved = localStorage.getItem(STORAGE_KEY)
    return DICTS[saved] ? saved : DEFAULT_LANG
}
```

`t(key, vars)` resolve no idioma atual e cai no default quando a chave nao existe no idioma alvo. Variaveis sao interpoladas com `{name}`.

#### 5.3 Convencao De Chaves

Chaves seguem `<dominio>.<elemento>` em ingles, lowerCamel:

```
lobby.createMatch
lobby.joinMatch
lobby.gamerTag
lobby.hostKey
lobby.errorMissingTag

hud.resource.gold
hud.resource.wisdom
hud.alive
hud.dead
hud.addAi

structure.castle.label
structure.mine.label
structure.library.label
structure.archer.label
structure.catapult.label
structure.barracks.label

unit.herald.label
unit.soldier.label

action.upgrade
action.build
action.research
action.startCapture
action.sendSoldier

shortcut.W
shortcut.A
shortcut.S
shortcut.D

log.captureStarted        # "{tag} iniciou captura de {target}"
log.upgradeBlockedByGate  # "{tag}: Castelo bloqueado — media {avg} < {req}"

error.notEnoughGold
error.researchUnavailable
error.roomFull
```

> Logs do servidor (em `addLog`) continuam em uma unica lingua para nao depender do idioma do receptor. Como o codigo padroniza ingles, os logs **passam a ser emitidos em ingles** independentemente do idioma da UI. O HUD exibe a string como recebida. Decisao deliberada: logs sao parte do "code surface" mais do que da "UI surface".

#### 5.4 Seletor De Idioma

Adicionar no `topbar` (vide [public/index.html](public/index.html#L652)) um seletor minimal a direita do `connection-status`:

```html
<select id="lang-switch" aria-label="Idioma / Language">
    <option value="pt-BR">PT-BR</option>
    <option value="en">EN</option>
</select>
```

Handler:

```js
import { getLang, setLang, onLangChange } from './i18n/index.js'

const langSwitch = document.getElementById('lang-switch')
langSwitch.value = getLang()
langSwitch.addEventListener('change', e => setLang(e.target.value))
onLangChange(() => renderAll())
```

`renderAll()` re-executa o render do HUD/lobby. O `canvas` em si nao precisa redesenhar — labels exibidas dentro do canvas (nomes de estruturas) sao reescritas a cada tick de render que ja existe.

#### 5.5 Fallback E Pluralizacao

- **Fallback**: se a chave nao existir no idioma atual, usa PT-BR. Se nao existir em PT-BR, exibe a propria chave (sinaliza ausencia em desenvolvimento).
- **Pluralizacao**: nao ha caso real no escopo atual. Casos como `"X carvoes"` viram `"{amount} {resource}"` resolvendo `resource = t('hud.resource.gold')`. Sem regra de plural propria.

---

### 6. Impacto Em `public/game.js`

Mudanca extensa: rename completo de chaves, recursos e nomes de funcoes. **Tudo em ingles.**

#### 6.1 Constantes

`STRUCTURES`, `NPCS`, `RESEARCH` viram:

```js
const STRUCTURES = {
    castle:   { /* base ex-`base` */ },
    mine:     { /* ex-`cover` */ },
    library:  { /* ex-`taraque` */ },
    archer:   { /* ex-`per` */ },
    catapult: { /* ex-`hef` */ },
    barracks: { /* ex-`tujai` */ },
}

const NPCS = {
    herald:  { /* ex-`capturer` */ },
    soldier: { /* ex-`zunim` */ },
}

const RESEARCH = {
    archer:   { requiresLibraryLevel: 1, cost: 15 },
    catapult: { requiresLibraryLevel: 1, cost: 25 },
    barracks: { requiresLibraryLevel: 2, cost: 60 },
}
```

`label` de cada entrada **e removido**. Labels viram chaves i18n: `structure.castle.label`, etc. O renderer resolve via `t()`.

#### 6.2 Recursos No Estado Do Jogador

```js
player.gold      // ex-coal
player.wisdom    // ex-knowledge
```

Campos derivados como `coalRate`, `coalRatePerLevel`, `knowledgeRate`, `knowledgeRatePerLevel` passam a:

```js
goldRate
goldRatePerLevel
wisdomRate
wisdomRatePerLevel
```

#### 6.3 Funcoes Renomeadas

| Antigo | Novo |
|---|---|
| `buildCoverOnSelectedTile` | `buildMineOnSelectedTile` |
| `spawnZunim` | `spawnSoldier` |
| `captureSelectedStructureOrFocusBase` | `captureSelectedStructureOrFocusCastle` |
| `focusOwnBase` | `focusOwnCastle` |
| `computeAverageStructureLevel` | mantido |
| `getBuildLimit` | mantido |

#### 6.4 Constantes De Configuracao

```js
const CONFIG = {
    initialGold: 750,           // ex-initialCoal
    captureDurationMs: 30000,
    captureRange: 2,
    buildRange: 6,
    respawnDelayMs: 30000,
    playerMaxIntegrity: 160,    // semantica neutra, mantido
    playerMaxBarrier: 40,
    playerDamage: 20,
    playerAttackRange: 1.5,
    playerAttackEveryMs: 1000,
    tickRateMs: 1000,
    shieldRegenDelayMs: 3000,
    shieldRegenPerSecond: 8,
    maxPlayersPerRoom: 8,
    logLimit: 12,
    castleUpgradeAverageRatio: 0.75,  // ex-baseUpgradeAverageRatio
}
```

`catalog.limits.baseUpgrade` (introduzido em [docs/prd-gate-upgrade-base.md](prd-gate-upgrade-base.md)) passa a `catalog.limits.castleUpgrade`.

#### 6.5 Logs

Logs internos do servidor (`addLog`) ja sao parcialmente em PT. Padronizam-se em ingles:

| Antes | Depois |
|---|---|
| `"<tag>: Base bloqueada — media de estruturas X.XX < Y.YY (75% do nivel atual)."` | `"<tag>: castle upgrade blocked — average X.XX < Y.YY (75% of current level)."` |
| `"<tag> iniciou captura de Cover"` | `"<tag> started capture of Mine"` |
| `"<tag> destruiu a Base de <alvo>"` | `"<tag> destroyed castle of <target>"` |

> A UI **traduz** logs no HUD via `t('log.<id>', vars)` quando viaveis. Logs ad-hoc continuam em ingles plano.

---

### 7. Impacto Em `public/render-screen.js`

Todas as strings literais que aparecem no HUD passam por `t()`. Exemplos:

```js
import { t } from './i18n/index.js'

// antes
return `<span>${formatNumber(currentPlayer.knowledge)}<small>Conhecimento</small></span>`
// depois
return `<span>${formatNumber(currentPlayer.wisdom)}<small>${t('hud.resource.wisdom')}</small></span>`

// antes
return 'Entre em uma sala primeiro.'
// depois
return t('error.notInRoom')

// antes
aria-label="Construir ${catalog.label} por ${catalog.cost} carvoes"
// depois
aria-label="${t('action.build', { name: t('structure.' + type + '.label'), cost: catalog.cost })}"
```

Labels de catalogo (`catalog.label`) deixam de vir do servidor. O renderer monta o label via `t('structure.<type>.label')`. Reduz acoplamento e remove duplicacao.

#### 7.1 Paleta Tematica

Constantes de cor adicionadas no topo do modulo:

```js
const THEME = {
    castle:    { fill: '#7d6f5b', stroke: '#3b2f22', flag: '#c0392b' },
    mine:      { fill: '#6e5638', stroke: '#3a2a18' },
    library:   { fill: '#5b4636', stroke: '#2c1e14', accent: '#d4af37' },
    archer:    { fill: '#704a2a', stroke: '#2a1a0c' },
    catapult:  { fill: '#5a4733', stroke: '#2a1f15', metal: '#9a9a9a' },
    barracks:  { fill: '#8b3a3a', stroke: '#3a1212', tent: '#c45050' },
    herald:    { fill: '#d9c27a', stroke: '#3a2f10' },
    soldier:   { fill: '#7a3a3a', stroke: '#2a0e0e' },
    terrain:   { grass: '#4a6b3a', dirt: '#6b5232', stone: '#7a7a7a' },
    selected:  '#f1c40f',
    enemy:     '#a83232',
    neutral:   '#7d7d7d',
}
```

O esquema de desenho atual (formas no canvas) e mantido; apenas o `fillStyle`/`strokeStyle` muda. Sprites do `public/img/icons_game.png` sao substituidos por nova sprite sheet medieval — vide secao 9.

---

### 8. Impacto Em `public/index.html`

- Header: `War Base` permanece (e o nome do produto). Adicionar `<select id="lang-switch">`.
- Painel `Como jogar`: textos vao para `i18n/*.js` sob chaves `help.*`.
- Lobby: `GamerTag`, `HostKey`, `Criar partida`, `Entrar`, mensagens de erro — todas via `t()`.
- Estilos: paleta CSS atualizada para tons medievais (pedra, madeira, ouro). Variaveis CSS centralizadas em `:root`:

```css
:root {
    --bg-stone: #2d2620;
    --bg-stone-light: #3d342c;
    --accent-gold: #d4af37;
    --accent-iron: #6b6b6b;
    --text-parchment: #ece2c4;
    --danger-blood: #a83232;
}
```

- Fonte: trocar para uma fonte com pegada medieval suave (ex: `Cinzel`, `IM Fell English`, ou similar via Google Fonts). Manter fallback de `serif` para nao quebrar offline.

---

### 9. Assets

#### 9.1 Sprite Sheet

- Substituir [public/img/icons_game.png](../public/img/icons_game.png) por nova sprite sheet medieval.
- Lista de sprites esperados (placeholder ate arte final):
  - `castle` (3 niveis visuais: torre simples, torre com bandeira, fortaleza)
  - `mine` (entrada de pedra com carrinho)
  - `library` (cabana com livros/pergaminhos)
  - `archer` (torre de madeira com arqueiro no topo)
  - `catapult` (estrutura de cerco com brasa)
  - `barracks` (tenda vermelha com lancas)
  - `herald` (figura com pergaminho)
  - `soldier` (figura com espada e escudo)
- Sprite sheet em PNG, transparente, 64x64 por celula, dimensoes multiplas de 8 para zoom inteiro.

#### 9.2 Logo

- Novo logo do War Base com tematica medieval (espadas cruzadas, escudo, ou bandeira de castelo).
- Substituir [public/favicon.ico](../public/favicon.ico) e adicionar `public/img/logo.png` para uso no `topbar`.
- Tagline opcional no logo: "Fortify. Conquer. Endure." (EN) / "Fortifique. Conquiste. Resista." (PT).

#### 9.3 Sons

Substituir/renomear arquivos em [public/sounds/](../public/sounds/):

| Som atual | Novo nome | Uso |
|---|---|---|
| `bubble_hit.mp3` | `arrow_hit.mp3` | Acerto de torre/arqueiro |
| `death_sound_in_minecraft.mp3` | `unit_death.mp3` | Morte de unidade |
| `fruit_drop.mp3` | `gold_drop.mp3` | Captura/ganho de recurso |
| `get_crystal.mp3` | `research_done.mp3` | Pesquisa concluida |
| `human_swallowing_loud.mp3` | `castle_falls.mp3` | Castelo destruido (fim de jogo) |
| `wall_energy_shock.mp3` | `shield_clang.mp3` | Barreira recebendo dano |

Novos arquivos com timbre medieval (madeira, metal, voz). Mantem o mesmo loader em `public/index.html`.

---

### 10. Impacto Na IA Composta

**Arquitetura inalterada.** Tamanho de input inalterado. Apenas os **identificadores** mudam.

#### 10.1 Constantes

[ai/agente-composto/constants.js](../ai/agente-composto/constants.js) renomeia listas que enumeram tipos:

```js
export const STRUCTURE_TYPES = ['castle', 'mine', 'library', 'archer', 'catapult', 'barracks']
export const NPC_TYPES = ['herald', 'soldier']
export const RESOURCE_TYPES = ['gold', 'wisdom']
export const RESEARCH_TYPES = ['archer', 'catapult', 'barracks']
```

Como o **tamanho dos vetores nao muda** (mesmo numero de tipos), `SCALAR_INPUT_SIZE`, `COMPOSITE_INPUT_SIZE` e `PLACEMENT_INPUT_SIZE` permanecem iguais.

#### 10.2 Codificacao Espacial

[ai/agente-composto/codificacao/espacial.js](../ai/agente-composto/codificacao/espacial.js) e [ai/agente-composto/codificacao/escalares.js](../ai/agente-composto/codificacao/escalares.js): trocar todas as referencias a `'cover'`, `'taraque'`, `'per'`, `'hef'`, `'tujai'`, `'capturer'`, `'zunim'`, `'coal'`, `'knowledge'` pelas novas chaves.

Escalar `baseUpgradeReady` (introduzido em [docs/prd-gate-upgrade-base.md](prd-gate-upgrade-base.md)) passa a `castleUpgradeReady`. Escalar `averageStructureLevelRatio` permanece com o mesmo nome — agnostico ao tema.

#### 10.3 Validadores

[ai/agente-composto/validadores.js](../ai/agente-composto/validadores.js): `criarComandoUpgrade(state, playerId, heatmap, ['base'])` vira `createUpgradeCommand(state, playerId, heatmap, ['castle'])`. Macro-acao `upgrade-base` vira `upgrade-castle`.

Lista de macro-acoes atualizada (mantem o tamanho):

```js
export const MACRO_ACTIONS = [
    'farm', 'capture', 'research', 'defend',
    'attack', 'upgrade', 'upgrade-castle', 'scout', 'wait',
]
```

Tambem renomear funcoes que ainda estao em portunhol (`criarComandoParaAcao` -> `createCommandForAction`, `criarComandoUpgrade` -> `createUpgradeCommand`, etc.).

#### 10.4 Datasets E Pesos

Datasets em [ai/agente-composto/treino/](../ai/agente-composto/treino/) sao reescritos para usar as novas chaves. Como o tamanho de entrada nao muda, `npm run train:ai` regenera os arquivos `.json` em [ai/agente-composto/redes/](../ai/agente-composto/redes/) sob a mesma arquitetura. **Sem fallback** — pesos antigos ficam invalidos.

#### 10.5 Logs Da IA

Logs de execucao da IA passam a ser em ingles, consistentes com o resto do codigo.

---

### 11. HUD / Cliente

- Painel do `Castelo` (ex-Base) mostra:
  - Recursos: `Ouro` / `Sabedoria` (ou `Gold` / `Wisdom`).
  - Status do gate: ja descrito em [docs/prd-gate-upgrade-base.md](prd-gate-upgrade-base.md), agora com label `Castelo lvl 4 — pronto para evoluir` / `Castle lvl 4 — ready to upgrade`.
- Botoes de construcao usam labels traduzidos: `Construir Mina (540)` / `Build Mine (540)`.
- Botoes de pesquisa: `Engenharia de Cerco (25 Sabedoria)` / `Siege Engineering (25 Wisdom)`.
- Lista de jogadores e logs aparecem na lingua escolhida quando a chave i18n existe; caso seja log ad-hoc, exibe o texto recebido do servidor (ingles).
- Seletor `[PT-BR ▾]` no topbar permite trocar em tempo real sem reload.

---

### 12. Migracao

Salas sao efemeras — nenhuma migracao de save. Salas existentes no momento do deploy ficam invalidas e precisam ser recriadas (a forma de campo de `player` muda: `coal` -> `gold`, etc.). O servidor reinicia limpo.

Modelos `.json` antigos sao **incompativeis pelo conteudo** (chaves diferentes em `STRUCTURE_TYPES`). `npm run train:ai` regenera todos os pesos sob a mesma arquitetura.

`localStorage` do navegador tem duas chaves novas:
- `war-base:lang` — idioma escolhido (`pt-BR` | `en`).
- A chave existente `war-base:gamer-tag` permanece.

Nao ha conflito com chaves antigas; a app simplesmente nao le mais campos que sumiram.

---

### 13. Plano De Testes

Cobertura precisa manter 100% (regra em [package.json](../package.json)).

**Testes de game** ([tests/game.test.js](../tests/game.test.js)):

- Estado publico expoe `gold` e `wisdom` (nao mais `coal`/`knowledge`).
- `STRUCTURES.castle`, `STRUCTURES.mine`, etc. existem e mantem os mesmos valores numericos dos predecessores.
- Pesquisar `archer` desbloqueia construcao de `archer` (mesmo comportamento que `per` antes).
- `castleUpgradeAverageRatio` se comporta identico ao anterior.

**Testes de IA** ([tests/ai.test.js](../tests/ai.test.js)):

- `STRUCTURE_TYPES`, `NPC_TYPES`, `RESOURCE_TYPES`, `RESEARCH_TYPES` contem as chaves novas.
- `SCALAR_INPUT_SIZE` mantem o mesmo valor numerico de antes do PRD.
- Macro-acao `upgrade-castle` substitui `upgrade-base` na lista de validadores.
- Heuristica de emergencia respeita o gate via `castleUpgradeReady`.

**Testes de render** ([tests/render-screen.test.js](../tests/render-screen.test.js)):

- HUD com `lang = pt-BR` exibe `Ouro` e `Sabedoria`.
- HUD com `lang = en` exibe `Gold` e `Wisdom`.
- Trocar `lang` via `setLang('en')` re-renderiza o HUD sem reload.
- Chave i18n inexistente cai em PT-BR e, em ultimo caso, exibe a chave bruta.

**Testes de i18n** ([tests/i18n.test.js](../tests/i18n.test.js)) — arquivo novo:

- `t('lobby.createMatch')` retorna `'Criar Partida'` por default e `'Create Match'` apos `setLang('en')`.
- `t('hud.resource.gold', {})` interpola corretamente.
- `setLang` persiste em `localStorage` e dispara listeners.
- `getLang` le de `localStorage` no boot.

---

### 14. Roadmap De Implementacao

1. **Infra i18n**: criar `public/i18n/{index,pt-BR,en}.js` com dicionarios iniciais e helper `t()`. Testes de i18n.
2. **Renomear constantes em `public/game.js`**: `STRUCTURES`, `NPCS`, `RESEARCH`, `CONFIG`. Campos de recurso (`coal` -> `gold`, `knowledge` -> `wisdom`). Funcoes auxiliares.
3. **Renomear `catalog.limits.baseUpgrade` -> `castleUpgradeReady`** em todos os pontos.
4. **Atualizar `public/render-screen.js`** para resolver labels via `t()` e aplicar nova paleta. Sem `catalog.label` direto.
5. **Atualizar `public/index.html`**: seletor de idioma no topbar, variaveis CSS medievais, strings via `t()`. Atualizar `<title>` e meta para War Base medieval.
6. **Substituir assets**: novo sprite sheet, logo, favicon e sons (placeholders se arte final ainda nao estiver pronta).
7. **Renomear constantes da IA** em `ai/agente-composto/constants.js` e refletir em codificacao, validadores, agente composto.
8. **Renomear funcoes em portunhol** da IA para ingles. Atualizar testes existentes para os novos nomes.
9. **Reescrever datasets de treino** com as novas chaves.
10. **`npm run train:ai`** regenera pesos.
11. **Atualizar [README.md](../README.md)**: renomear todas as estruturas/unidades/recursos, atualizar exemplos e atalhos, mencionar i18n e seletor de idioma.
12. **Atualizar [docs/estrategia-ia.md](estrategia-ia.md)** com os novos nomes.
13. **Atualizar [docs/prd-gate-upgrade-base.md](prd-gate-upgrade-base.md) e [docs/prd-limites-construcao.md](prd-limites-construcao.md)** se ainda usarem termos antigos (notas de retrocompatibilidade na propria doc).
14. **Smoke test manual**: criar sala, construir 1 Mina, pesquisar 1 tecnologia, evoluir Castelo, enviar Soldado, validar IA neural em ambos os idiomas.

---

### 15. Arquivos Tocados

**Codigo:**
- [public/game.js](../public/game.js) — renomeacao completa de constantes, funcoes, campos de estado.
- [public/render-screen.js](../public/render-screen.js) — `t()`, paleta, labels.
- [public/index.html](../public/index.html) — seletor de idioma, variaveis CSS, fonte, todas as strings via `t()`.
- [public/keyboard-listener.js](../public/keyboard-listener.js) — atualizar referencias a nomes de acoes se houver.
- [public/i18n/index.js](../public/i18n/index.js) — **novo**.
- [public/i18n/pt-BR.js](../public/i18n/pt-BR.js) — **novo**.
- [public/i18n/en.js](../public/i18n/en.js) — **novo**.
- [server.js](../server.js) — verificar se ha strings em PT (logs, mensagens de socket) e padronizar em ingles.

**IA:**
- [ai/agente-composto/constants.js](../ai/agente-composto/constants.js).
- [ai/agente-composto/agente-composto.js](../ai/agente-composto/agente-composto.js).
- [ai/agente-composto/validadores.js](../ai/agente-composto/validadores.js).
- [ai/agente-composto/codificacao/escalares.js](../ai/agente-composto/codificacao/escalares.js).
- [ai/agente-composto/codificacao/espacial.js](../ai/agente-composto/codificacao/espacial.js).
- [ai/agente-composto/treino/](../ai/agente-composto/treino/) — todos os datasets.
- [ai/agente-composto/redes/](../ai/agente-composto/redes/) — regenerados.
- [ai/rede-neural/](../ai/rede-neural/) — verificar se ha referencias a nomes antigos.

**Assets:**
- [public/img/icons_game.png](../public/img/icons_game.png) — substituido.
- [public/img/logo.png](../public/img/logo.png) — **novo**.
- [public/favicon.ico](../public/favicon.ico) — substituido.
- [public/sounds/](../public/sounds/) — todos renomeados/substituidos.

**Docs:**
- [README.md](../README.md).
- [docs/estrategia-ia.md](estrategia-ia.md).
- [docs/prd-gate-upgrade-base.md](prd-gate-upgrade-base.md) — nota de renomeacao para `castle`.
- [docs/prd-limites-construcao.md](prd-limites-construcao.md) — nota de renomeacao para novas chaves.

**Testes:**
- [tests/game.test.js](../tests/game.test.js).
- [tests/ai.test.js](../tests/ai.test.js).
- [tests/render-screen.test.js](../tests/render-screen.test.js).
- [tests/i18n.test.js](../tests/i18n.test.js) — **novo**.

---

### 16. Riscos & Mitigacoes

| Risco | Mitigacao |
|---|---|
| Renomeacao em massa quebra testes existentes e cobertura cai abaixo de 100%. | PR organizada por camadas (game -> render -> ai -> docs), com testes verdes a cada etapa. Manter o roadmap em ordem. |
| Strings esquecidas em PT-BR aparecem misturadas com EN. | Lint manual via grep para `[ãáéíóúçÃÁÉÍÓÚÇ]` no codigo apos a migracao. Se ficou na UI, falta `t()`. Se ficou no codigo, e bug. |
| Modelos de IA regenerados ficam piores que os atuais. | Manter o mesmo `train:ai` pipeline; arquitetura nao muda. Comparar IA em jogo manual antes/depois para detectar regressao. Se cair, ajustar datasets — nao reverter o tema. |
| Sprites/sons novos atrasam o release porque dependem de arte externa. | PRD permite **placeholders** (assets atuais re-coloridos via CSS/canvas e os mp3 atuais renomeados) ate arte final chegar. O nome e a estrutura ficam corretos desde o dia 1. |
| Quem joga em PT estranha o novo nome do "Base" para "Castelo". | Mudanca alinhada com o tema; mensagem de release/changelog explica. Sem flag de retrocompatibilidade, alinhado com o estilo do projeto. |
| Internacionalizacao adiciona overhead em cada render. | `t()` e um lookup em um objeto + interpolacao regex — custo desprezivel. Sem reactividade complexa; troca de idioma chama `renderAll()` uma vez. |
| Logs em ingles vindos do servidor confundem jogador PT-BR. | Logs comuns sao mapeados via `log.*` no dicionario. Logs ad-hoc residuais sao raros e em ingles plano; aceitos como debug surface. |
| Documentos PRD existentes mencionam `base`, `coal`, `knowledge` etc. | Atualizar com nota no topo: "Pre-PRD-Medieval; ler junto com [docs/prd-tematica-medieval.md](prd-tematica-medieval.md) para naming atual". |
