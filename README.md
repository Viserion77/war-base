# war-base

O projeto é um jogo multiplayer **FFA (free-for-all)** de bases, onde 3 ou mais jogadores constroem, capturam fábricas, atacam uns aos outros e tentam ser o último com a base de pé.

![Fluxograma do jogo](fluxograma.png)

Visão geral
===============================
Cada jogador controla uma **Base** com construções ao redor. Você coleta **carvão** (recurso bruto) com fábricas Cover, gera **conhecimento** na Taraque para destravar construções de ataque, e usa Per/Hef/Tujai para defender ou pressionar inimigos. Quem ficar com a vida da base zerada está fora. O último jogador com base ativa vence.

Como entrar em uma partida
-------------------------------
- **Criar partida**: o jogador informa um *GamerTag* e o servidor gera uma **hostKey** (código de sala privada). A base é criada com **750 carvões** iniciais.
- **Entrar em partida**: o jogador informa *GamerTag* + uma **hostKey** existente. Sem a hostKey correta não é possível entrar — partidas são privadas.

Loop de jogo
-------------------------------
A cada ação do jogador, o servidor avalia (em ordem):
1. **Subiu uma estrutura de nível?** → atualiza status da estrutura e desbloqueia recursos/construções dependentes.
2. **Entrou no range de captura de uma fábrica neutra/desativada?** → contabiliza o tempo até **100% (30 segundos parado no range)** e captura a fábrica.
3. **Adicionou nova construção?** → coloca no terreno e atualiza status.
4. **Entrou no range de ataque de um inimigo?** → a torre inimiga usa seu status de arma para remover vida do jogador.
5. **Comprou ataque (torre) ou NPC?** → dropa a construção/unidade no mapa.
6. **Ataque ou NPC zerou a vida de uma construção?** → a construção é desativada e fica disponível para captura.
7. **Comprou upgrade em uma construção?** → aplica o upgrade (paga custo do próximo nível).
8. **Ataque ou NPC zerou a vida de uma base?** → o dono daquela base é declarado **perdedor** e sai da partida.

Quando sobrar **apenas um jogador com base ativa**, ele é o vencedor.

Mecânicas
===============================
Recursos
-------------------------------
- **Carvão**: recurso principal. Usado para construir, comprar NPCs e fazer upgrades. Gerado pela Cover.
- **Conhecimento**: recurso de tecnologia. Gerado pela Taraque. Usado para destravar receitas de construção de ataque (Per, Hef, Tujai) na própria Taraque.

Combate
-------------------------------
- **Barreira** absorve o dano até zerar; depois, o dano vai para a **integridade**.
- **Barreira regenera lentamente** quando a unidade/estrutura **não está sob ataque**. A regeneração é pausada enquanto está recebendo dano.
- Quando a integridade chega a 0, a estrutura é destruída (ou, no caso da base, o jogador perde).
- **Torres atiram a cada 1 segundo** enquanto há alvo no range. O valor declarado de "dano" é o dano por tiro.

Upgrades
-------------------------------
- Subir uma construção de nível custa **1.5× o custo do nível atual** (arredondando para inteiro).
  - Ex.: Cover nível 1 = 540 → nível 2 = 810 → nível 3 = 1215 → ...
- Cada nível adiciona os bônus listados em cada construção (ver abaixo).

Captura de fábricas
-------------------------------
- Quando uma construção tem a integridade zerada, ela **fica desativada e capturável**.
- Qualquer jogador que permanecer **30 segundos parado dentro do range da fábrica** se torna o novo dono e a reativa.

Construções
===============================
Base
-------------------------------
- 1000 pontos de integridade iniciais
- 500 pontos de barreira iniciais
- +25 de integridade e +25 de barreira por nível
- Subir a Base de nível desbloqueia construções (ex.: Taraque exige Base nível 2)

Fábricas e Pesquisas
-------------------------------
**Cover** (geração de carvão)
- Custa **540**, nível 1
- Coleta carvão automaticamente
- Começa em **+20 carvões por segundo**
- **+5 carvões/segundo por nível**

**Taraque** (loja de conhecimento)
- Desbloqueada com **Base nível 2**
- Gera e armazena conhecimento, e funciona como loja para pagar pelas receitas de construção:
  - **Nível 1**: Per, Hef
  - **Nível 2**: Tujai

Ataque e defesa
-------------------------------
**Per** — torre de "pistola" (dano singular)
- Custa **140**, nível 1
- 500 de integridade
- 0 de barreira
- 5 de dano singular (por tiro, 1 tiro/segundo)
- 20 de alcance

**Hef** — torre de "bombinhas" (dano em área)
- Custa **200**, nível 1
- 200 de integridade
- 100 de barreira
- 15 de dano múltiplo (por tiro, 1 tiro/segundo)
- 10 de alcance

**Tujai** — fábrica de NPCs
- Custa **600**, nível 1
- 200 de integridade
- 0 de barreira
- Permite a compra de NPCs ofensivos

NPCs
===============================
NPCs são **unidades ofensivas autônomas**, compradas na Tujai. Após o spawn, andam sozinhos até a **base inimiga mais próxima** e atacam até morrer (ou até destruir a base).

**Zunim** — unidade básica de assalto
- Custa **80**, nível 1
- 150 de integridade
- 50 de barreira
- 10 de dano singular (por ataque, 1 ataque/segundo)
- 1 de alcance (corpo a corpo)
- Velocidade: 1 campo por segundo
- +10 de integridade, +5 de barreira e +2 de dano por nível da Tujai
