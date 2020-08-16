export function setupScreen(canvas, game) {
    const { screen: { width, height, pixelsPerFields } } = game.state
    canvas.width = width * pixelsPerFields
    canvas.height = height * pixelsPerFields
}

export default function renderScreen(screen, scoreTable, game, requestAnimationFrame, currentPlayerId, icons_gameImg) {
    const context = screen.getContext('2d')
    context.fillStyle = 'white'
    const { screen: { width, height, pixelsPerFields } } = game.state
    context.clearRect(0, 0, width * pixelsPerFields, height * pixelsPerFields)

    for (const playerId in game.state.players) {
        const player = game.state.players[playerId]
        drawPlayer(context, player, game)
    }

    for (const crystalId in game.state.crystals) {
        const crystal = game.state.crystals[crystalId]
        drawPot(context, crystal, game, icons_gameImg)
    }

    const currentPlayer = game.state.players[currentPlayerId]
    if (currentPlayer) {
        const isCurrentPlayer = true
        drawPlayer(context, currentPlayer, game, isCurrentPlayer)
    }

    updateScoreTable(scoreTable, game, currentPlayerId)

    requestAnimationFrame(() => {
        renderScreen(screen, scoreTable, game, requestAnimationFrame, currentPlayerId, icons_gameImg)
    })
}


function drawPot(context, crystal, game, icons_gameImg) {
    const { screen: { pixelsPerFields }, config: { showPotsValue } } = game.state
    let { x, y, quantity } = crystal
    x *= pixelsPerFields
    y *= pixelsPerFields

    //our pot size on img
    const pictSize = 16
    let column = Math.floor((quantity - 1) % 10)
    let line = Math.floor((quantity - 1) / 10)

    if (line > 0 && column <9)
        line--

    line = Math.min(line, 9)
    column = Math.min(column, 9)

    const spriteX = line * pictSize
    const spriteY = column * pictSize
    context.drawImage(icons_gameImg, spriteY, spriteX, 16, 16, x, y, pixelsPerFields, pixelsPerFields);

    if (showPotsValue) {
        //show texts
        context.fillStyle = 'black'
        context.font = "10px Arial";
        context.fillText(quantity.toString(), x, y - 3);
    }
}

//all skin is based on 5 pixels?, this function convert for responsive values
function responsiveMeasure(initialValue, pixelsPerFields) {
    return initialValue * (pixelsPerFields / 5)
}

function drawPlayer(screenContext, player, game, isCurrentPlayer = false) {
    const { screen: { pixelsPerFields } } = game.state

    let eyeAndMouthColors = 'black'
    let faceColor = getColorFromScore(player.score)
    if (isCurrentPlayer) {
        eyeAndMouthColors = 'white'
    }

    let { x, y } = player
    x *= pixelsPerFields
    y *= pixelsPerFields

    // Draw face
    screenContext.fillStyle = faceColor
    screenContext.fillRect(x, y, pixelsPerFields, pixelsPerFields)

    // Draw eyes and mouth
    screenContext.fillStyle = eyeAndMouthColors
    screenContext.fillRect(x + responsiveMeasure(1, pixelsPerFields), y + responsiveMeasure(1, pixelsPerFields), responsiveMeasure(1, pixelsPerFields), responsiveMeasure(1, pixelsPerFields))
    screenContext.fillRect(x + responsiveMeasure(3, pixelsPerFields), y + responsiveMeasure(1, pixelsPerFields), responsiveMeasure(1, pixelsPerFields), responsiveMeasure(1, pixelsPerFields))
    screenContext.fillRect(x + responsiveMeasure(1, pixelsPerFields), y + responsiveMeasure(3, pixelsPerFields), responsiveMeasure(3, pixelsPerFields), responsiveMeasure(1, pixelsPerFields))
    screenContext.fillStyle = 'black'
    screenContext.font = "10px Arial";
    screenContext.fillText(player.score.toString(), x, y - 3);
}

function getColorFromScore(score) {
    score *= 10
    const red = score > 240 ? 240 : score
    const green = score > 219 ? 219 : score
    const blue = score > 79 ? 79 : score
    return `rgb(${red},${green},${blue})`
}

function updateScoreTable(scoreTable, game, currentPlayerId) {
    const maxResults = 10

    let scoreTableInnerHTML = `
        <tr class="header">
            <td>Top 10 Jogadores</td>
            <td>Pontos</td>
        </tr>
    `

    const playersArray = []

    for (let socketId in game.state.players) {
        const player = game.state.players[socketId]
        playersArray.push({
            playerId: socketId,
            x: player.x,
            y: player.y,
            score: player.score,
        })
    }

    const playersSortedByScore = playersArray.sort((first, second) => {
        if (first.score < second.score) {
            return 1
        }

        if (first.score > second.score) {
            return -1
        }

        return 0
    })

    const topScorePlayers = playersSortedByScore.slice(0, maxResults)

    scoreTableInnerHTML = topScorePlayers.reduce((stringFormed, player) => {
        return stringFormed + `
            <tr class="${player.playerId === currentPlayerId ? 'current-player' : ''}">
                <td>${player.playerId}</td>
                <td>${player.score}</td>
            </tr>
        `
    }, scoreTableInnerHTML)

    let playerInTop10 = false
    for (const player of topScorePlayers) {
        if (player.playerId === currentPlayerId) {
            playerInTop10 = true
            break
        }
    }

    if (!playerInTop10) {
        const currentPlayerFromTopScore = game.state.players[currentPlayerId]

        if (!currentPlayerFromTopScore) {
            return
        }

        scoreTableInnerHTML += `
            <tr class="current-player">
                <td>${currentPlayerId}</td>
                <td>${currentPlayerFromTopScore.score}</td>
            </tr>
        `
    }

    scoreTable.innerHTML = scoreTableInnerHTML
}
