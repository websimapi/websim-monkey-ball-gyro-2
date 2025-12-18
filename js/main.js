import { Game } from './Game.js';

const menus = {
    start: document.getElementById('menu-start'),
    calibrate: document.getElementById('menu-calibrate'),
    result: document.getElementById('menu-result')
};

const buttons = {
    start: document.getElementById('btn-start'),
    calibrate: document.getElementById('btn-calibrate'),
    next: document.getElementById('btn-next')
};

const resultText = {
    title: document.getElementById('result-title'),
    msg: document.getElementById('result-msg')
};

let game = null;
let currentLevel = 1;

async function init() {
    game = new Game();
    game.init();
    
    // Initial Render loop
    function animate() {
        requestAnimationFrame(animate);
        if (game) game.update();
    }
    animate();
}

function showMenu(name) {
    Object.values(menus).forEach(m => m.classList.add('hidden'));
    if (menus[name]) menus[name].classList.remove('hidden');
}

// 1. Start Button Logic
buttons.start.addEventListener('click', async () => {
    // Request Permission
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const response = await DeviceOrientationEvent.requestPermission();
            if (response === 'granted') {
                toCalibration();
            } else {
                alert('Gyro permission is needed to play!');
            }
        } catch (e) {
            console.error(e);
            toCalibration(); // Try anyway, might be non-iOS error
        }
    } else {
        toCalibration();
    }
});

function toCalibration() {
    showMenu('calibrate');
}

// 2. Calibration Logic
buttons.calibrate.addEventListener('click', () => {
    game.calibrate();
    startGame(1);
});

// 3. Game Flow
function startGame(level) {
    currentLevel = level;
    showMenu(null); // Hide all
    game.startLevel(level);
}

// 4. Result Menu Handlers
window.showOverlay = (title, btnText, callback) => {
    resultText.title.innerText = title;
    resultText.msg.innerText = title.includes("WIN") || title.includes("CLEAR") ? "Good rolling!" : "Keep trying!";
    buttons.next.innerText = btnText;
    
    // Recreate button to clear listeners
    const newBtn = buttons.next.cloneNode(true);
    buttons.next.parentNode.replaceChild(newBtn, buttons.next);
    buttons.next = newBtn;
    
    buttons.next.addEventListener('click', () => {
        showMenu(null);
        if (callback) callback();
    });
    
    showMenu('result');
};

init();

