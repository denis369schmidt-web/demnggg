// Pong Game Logic

// Constants
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const ballSpeed = 4;
const paddleSpeed = 5;

// Game Variables
let ball = { x: canvas.width / 2, y: canvas.height / 2, radius: 10, dx: ballSpeed, dy: ballSpeed };
let playerPaddle = { width: 10, height: 100, x: 0, y: canvas.height / 2 - 50 };
let aiPaddle = { width: 10, height: 100, x: canvas.width - 10, y: canvas.height / 2 - 50 };
let playerScore = 0;
let aiScore = 0;

// Functions
function drawBall() {
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#0095DD';
    ctx.fill();
    ctx.closePath();
}

function drawPaddle(paddle) {
    ctx.fillStyle = '#0095DD';
    ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);
}

function updateBall() {
    ball.x += ball.dx;
    ball.y += ball.dy;

    // Ball collision with top and bottom walls
    if (ball.y + ball.radius > canvas.height || ball.y - ball.radius < 0) {
        ball.dy = -ball.dy;
    }

    // Ball collision with paddles
    if ((ball.x - ball.radius < playerPaddle.x + playerPaddle.width && ball.y > playerPaddle.y && ball.y < playerPaddle.y + playerPaddle.height) || 
        (ball.x + ball.radius > aiPaddle.x && ball.y > aiPaddle.y && ball.y < aiPaddle.y + aiPaddle.height)) {
        ball.dx = -ball.dx;
    }

    // Scoring
    if (ball.x + ball.radius > canvas.width) {
        playerScore++;
        resetBall();
    } else if (ball.x - ball.radius < 0) {
        aiScore++;
        resetBall();
    }
}

function resetBall() {
    ball.x = canvas.width / 2;
    ball.y = canvas.height / 2;
    ball.dx = ballSpeed * (Math.random() > 0.5 ? 1 : -1);
    ball.dy = ballSpeed * (Math.random() > 0.5 ? 1 : -1);
}

function aiMovement() {
    if (aiPaddle.y + aiPaddle.height / 2 < ball.y) {
        aiPaddle.y += paddleSpeed;
    } else {
        aiPaddle.y -= paddleSpeed;
    }
    // Limit AI paddle movement
    if (aiPaddle.y < 0) aiPaddle.y = 0;
    if (aiPaddle.y + aiPaddle.height > canvas.height) aiPaddle.y = canvas.height - aiPaddle.height;
}

function drawScore() {
    ctx.font = '16px Arial';
    ctx.fillStyle = '#0095DD';
    ctx.fillText('Player: ' + playerScore, 8, 20);
    ctx.fillText('AI: ' + aiScore, canvas.width - 100, 20);
}

function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBall();
    drawPaddle(playerPaddle);
    drawPaddle(aiPaddle);
    updateBall();
    aiMovement();
    drawScore();
    requestAnimationFrame(gameLoop);
}

// Start the game
requestAnimationFrame(gameLoop);
