import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { LevelManager } from './LevelManager.js';
import { InputManager } from './InputManager.js';
import { AudioManager } from './AudioManager.js';
import { SceneManager } from './SceneManager.js';
import { PlayerManager } from './PlayerManager.js';

export class Game {
    constructor() {
        this.container = document.getElementById('game-container');
        this.levelDisplay = document.getElementById('level-display');
        this.timerDisplay = document.getElementById('timer');
        
        this.world = null;
        
        this.sceneManager = null;
        this.levelManager = null;
        this.inputManager = null;
        this.audioManager = null;
        this.playerManager = null;
        
        this.isPlaying = false;
        this.level = 1;
        this.timeLeft = 60;
        this.clock = new THREE.Clock();
    }

    init() {
        // Init Scene & View
        this.sceneManager = new SceneManager(this.container);
        this.sceneManager.init();

        // Init Physics
        this.world = new CANNON.World();
        this.world.gravity.set(0, -30, 0);
        this.world.broadphase = new CANNON.SAPBroadphase(this.world);
        this.world.solver.iterations = 20;
        this.world.defaultContactMaterial.friction = 0.1; 
        this.world.defaultContactMaterial.restitution = 0.2;
        
        // Managers
        this.levelManager = new LevelManager(this.sceneManager.worldPivot, this.world);
        this.inputManager = new InputManager();
        this.audioManager = new AudioManager();
        
        this.playerManager = new PlayerManager(
            this.world, 
            this.sceneManager.camera, 
            this.sceneManager.renderer.domElement
        );
        this.playerManager.init(this.sceneManager.worldPivot);
        
        // Initial render
        this.sceneManager.render();
    }

    calibrate() {
        if (this.inputManager) {
            this.inputManager.calibrate();
        }
    }

    startLevel(levelNum) {
        this.level = levelNum;
        this.levelDisplay.innerText = this.level;
        
        // Audio
        this.audioManager.playMusic();
        
        // Reset Level
        this.levelManager.clear();
        const startPos = this.levelManager.loadLevel(levelNum);
        
        if (!startPos) {
            window.showOverlay("YOU WIN!", "PLAY AGAIN", () => this.startLevel(1));
            return;
        }
        
        // Reset Player
        this.playerManager.reset(startPos);
        
        // Reset State
        this.isPlaying = true;
        this.timeLeft = 180;
        this.clock.start();
    }

    update() {
        if (!this.isPlaying) return;
        
        const dt = this.clock.getDelta();
        
        // 1. Input & Physics Gravity
        const input = this.inputManager.getInput();
        const maxTilt = this.levelManager.currentMaxTilt;
        const tiltX = -input.y * maxTilt; 
        const tiltZ = -input.x * maxTilt;

        // Visual Tilt (World Pivot)
        const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), tiltX);
        const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), tiltZ);
        const qFinal = new THREE.Quaternion().multiplyQuaternions(qx, qz);

        this.sceneManager.worldPivot.quaternion.slerp(qFinal, 0.1);
        
        // Gravity Tilt (Physics)
        const gravity = new THREE.Vector3(0, -30, 0);
        gravity.applyQuaternion(this.sceneManager.worldPivot.quaternion.clone().invert());
        this.world.gravity.set(gravity.x, gravity.y, gravity.z);

        // 2. Step Physics
        this.world.step(1 / 60, dt, 10);
        
        // 3. Player Update (Mesh Sync, Dash)
        this.playerManager.update();
        
        // 4. Camera Follow
        this.sceneManager.updateCamera(this.playerManager.ballMesh);
        
        // 5. Game Logic
        this.timeLeft -= dt;
        this.timerDisplay.innerText = Math.max(0, this.timeLeft).toFixed(2);
        
        if (this.timeLeft <= 0) {
            this.gameOver("TIME UP!");
            return;
        }
        
        // Check Fall
        if (this.playerManager.ballBody.position.y < -50) {
            this.audioManager.playSound('fall');
            this.gameOver("FALL OUT!");
            return;
        }
        
        // Check Goal
        if (this.levelManager.checkGoal(this.playerManager.ballBody.position)) {
            this.audioManager.playSound('win');
            this.levelComplete();
            return;
        }
        
        this.sceneManager.render();
    }
    
    levelComplete() {
        this.isPlaying = false;
        window.showOverlay("LEVEL CLEAR!", "NEXT LEVEL", () => {
            this.startLevel(this.level + 1);
        });
    }
    
    gameOver(msg) {
        this.isPlaying = false;
        window.showOverlay(msg, "TRY AGAIN", () => {
            this.startLevel(this.level);
        });
    }
}

