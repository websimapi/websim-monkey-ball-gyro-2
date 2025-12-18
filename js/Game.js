import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { LevelManager } from './LevelManager.js';
import { InputManager } from './InputManager.js';
import { AudioManager } from './AudioManager.js';

export class Game {
    constructor() {
        this.container = document.getElementById('game-container');
        this.levelDisplay = document.getElementById('level-display');
        this.timerDisplay = document.getElementById('timer');
        
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.world = null;
        
        this.ballBody = null;
        this.ballMesh = null;
        
        this.levelManager = null;
        this.inputManager = null;
        this.audioManager = null;
        
        this.isPlaying = false;
        this.level = 1;
        this.timeLeft = 60;
        this.clock = new THREE.Clock();
        
        this.cameraOffset = new THREE.Vector3(0, 12, 12);
        this.cameraLerpFactor = 0.12;

        // Dash / charge state
        this.dashState = {
            charging: false,
            startX: 0,
            startY: 0,
            currentX: 0,
            currentY: 0,
            startTime: 0,
            dirX: 0,
            dirZ: 0
        };

        // Reusable vectors for converting screen drags to world directions
        this._tmpForward = new THREE.Vector3();
        this._tmpRight = new THREE.Vector3();
        this._tmpDir = new THREE.Vector3();

        // Visual arrow for dash direction
        this.dashArrow = null;
    }

    init() {
        // Init Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);
        
        // Init Camera
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        
        // Init Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.container.appendChild(this.renderer.domElement);
        
        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        const dirLight = new THREE.DirectionalLight(0xffffff, 1);
        dirLight.position.set(10, 20, 10);
        dirLight.castShadow = true;
        dirLight.shadow.camera.top = 50;
        dirLight.shadow.camera.bottom = -50;
        dirLight.shadow.camera.left = -50;
        dirLight.shadow.camera.right = 50;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        this.scene.add(dirLight);

        // Init Physics
        this.world = new CANNON.World();
        this.world.gravity.set(0, -30, 0); // Strong gravity for snappy response
        this.world.broadphase = new CANNON.SAPBroadphase(this.world);
        this.world.solver.iterations = 20; // Increase solver iterations for stability
        this.world.defaultContactMaterial.friction = 0.1; 
        this.world.defaultContactMaterial.restitution = 0.2;
        
        // Managers
        this.levelManager = new LevelManager(this.scene, this.world);
        this.inputManager = new InputManager();
        this.audioManager = new AudioManager();
        
        // Create Ball (Player)
        this.createPlayer();
        this.initDashArrow();
        
        // Events
        window.addEventListener('resize', () => this.onResize());

        // Dash controls (touch)
        this.setupDashControls();
        
        // Initial render
        this.renderer.render(this.scene, this.camera);
    }

    calibrate() {
        if (this.inputManager) {
            this.inputManager.calibrate();
        }
    }

    createPlayer() {
        const radius = 0.5;
        
        // Mesh
        const geometry = new THREE.SphereGeometry(radius, 32, 32);
        const textureLoader = new THREE.TextureLoader();
        const texture = textureLoader.load('monkey_ball.png');
        const material = new THREE.MeshStandardMaterial({ 
            map: texture,
            roughness: 0.4,
            metalness: 0.1 
        });
        
        this.ballMesh = new THREE.Mesh(geometry, material);
        this.ballMesh.castShadow = true;
        this.scene.add(this.ballMesh);
        
        // Body
        const shape = new CANNON.Sphere(radius);
        this.ballBody = new CANNON.Body({
            mass: 1,
            shape: shape,
            linearDamping: 0.3, // Dampen rolling slightly
            angularDamping: 0.3,
            ccdSpeedThreshold: 1,
            ccdIterations: 10
        });
        this.world.addBody(this.ballBody);
    }

    initDashArrow() {
        // Simple arrow: thin cylinder + cone tip, pointing along +Z in local space
        const group = new THREE.Group();

        const shaftGeom = new THREE.CylinderGeometry(0.05, 0.05, 1, 8);
        const tipGeom = new THREE.ConeGeometry(0.12, 0.35, 12);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff4444 });

        const shaft = new THREE.Mesh(shaftGeom, mat);
        const tip = new THREE.Mesh(tipGeom, mat);

        // Position so that base of shaft is at origin and tip extends along +Z
        shaft.rotation.x = Math.PI / 2;
        tip.rotation.x = Math.PI / 2;

        shaft.position.z = 0.5;
        tip.position.z = 1.0;

        group.add(shaft);
        group.add(tip);

        group.visible = false;
        this.scene.add(group);
        this.dashArrow = group;
    }

    setDashArrowVisible(visible) {
        if (!this.dashArrow) return;
        this.dashArrow.visible = visible;
    }

    updateDashArrow() {
        if (!this.dashArrow || !this.ballMesh || !this.dashState.charging) return;

        const dirX = this.dashState.dirX;
        const dirZ = this.dashState.dirZ;
        const len = Math.hypot(dirX, dirZ);
        if (len < 0.01) {
            this.setDashArrowVisible(false);
            return;
        }

        // Charge amount affects arrow length
        const now = performance.now();
        const holdMs = now - this.dashState.startTime;
        const maxChargeMs = 1200;
        const charge = Math.min(holdMs / maxChargeMs, 1);

        const baseLen = 0.8;
        const extraLen = 1.5;
        const arrowLen = baseLen + extraLen * charge;

        // Position arrow slightly above the ball
        this.dashArrow.position.copy(this.ballMesh.position);
        this.dashArrow.position.y += 0.8;

        // Point arrow along direction on XZ plane
        const dir = new THREE.Vector3(dirX, 0, dirZ).normalize();
        const target = new THREE.Vector3().copy(this.dashArrow.position).add(dir);

        this.dashArrow.lookAt(target);

        // Scale to desired length along its local Z (it's modeled about 1.35 units total)
        const modelLen = 1.35;
        const scale = arrowLen / modelLen;
        this.dashArrow.scale.set(scale, scale, scale);

        this.setDashArrowVisible(true);
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
            // No more levels
            window.showOverlay("YOU WIN!", "PLAY AGAIN", () => this.startLevel(1));
            return;
        }
        
        // Reset Player
        this.ballBody.position.set(startPos.x, startPos.y, startPos.z);
        this.ballBody.velocity.set(0, 0, 0);
        this.ballBody.angularVelocity.set(0, 0, 0);
        
        // Reset State
        this.isPlaying = true;
        this.timeLeft = 60;
        this.clock.start();
    }

    update() {
        if (!this.isPlaying) return;
        
        const dt = this.clock.getDelta();
        
        // 1. Input & Physics Gravity
        const input = this.inputManager.getInput();
        
        // Terrain Tilt
        // Input Y is -1 (Forward) or Beta (Forward Tilt)
        // With 'tiltX = input.y * maxTilt':
        //   Forward (y < 0 or beta mapped) -> Negative X Rotation -> Far side DOWN -> Roll Forward
        const maxTilt = 0.5; // Radians (~28 degrees)
        const tiltX = input.y * maxTilt;
        const tiltZ = -input.x * maxTilt;

        this.levelManager.updateTilt(tiltX, tiltZ);
        
        // Keep gravity constant down
        this.world.gravity.set(0, -30, 0);
        


        // 2. Step Physics
        this.world.step(1 / 60, dt, 10);
        
        // 3. Sync Mesh
        this.ballMesh.position.copy(this.ballBody.position);
        this.ballMesh.quaternion.copy(this.ballBody.quaternion);

        // 3b. Update dash arrow if charging
        if (this.dashState.charging) {
            this.updateDashArrow();
        } else {
            this.setDashArrowVisible(false);
        }
        
        // 4. Camera Follow
        const targetPos = this.ballMesh.position.clone();
        const desiredPos = targetPos.clone().add(this.cameraOffset);
        
        // Smooth follow behind and above the ball
        this.camera.position.lerp(desiredPos, this.cameraLerpFactor);
        this.camera.lookAt(targetPos);
        
        // 5. Game Logic
        this.timeLeft -= dt;
        this.timerDisplay.innerText = Math.max(0, this.timeLeft).toFixed(2);
        
        if (this.timeLeft <= 0) {
            this.gameOver("TIME UP!");
            return;
        }
        
        // Check Fall
        if (this.ballBody.position.y < -50) {
            this.audioManager.playSound('fall');
            this.gameOver("FALL OUT!");
            return;
        }
        
        // Check Goal
        if (this.levelManager.checkGoal(this.ballBody.position)) {
            this.audioManager.playSound('win');
            this.levelComplete();
            return;
        }
        
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Convert a 2D screen drag (dx, dy in pixels) into a world-space direction (x,z)
     * aligned with the camera, so dragging matches what you see on screen.
     */
    screenDragToWorldDir(dx, dy) {
        // If drag is too small, treat as no direction
        const len2 = dx * dx + dy * dy;
        if (len2 < 1) {
            return { x: 0, z: 0, length: 0 };
        }

        // Camera forward (where it is looking)
        this.camera.getWorldDirection(this._tmpForward);
        this._tmpForward.y = 0;
        if (this._tmpForward.lengthSq() < 1e-4) {
            this._tmpForward.set(0, 0, -1);
        }
        this._tmpForward.normalize();

        // Camera right (perpendicular on XZ plane)
        this._tmpRight.crossVectors(this._tmpForward, new THREE.Vector3(0, 1, 0));
        if (this._tmpRight.lengthSq() < 1e-4) {
            this._tmpRight.set(1, 0, 0);
        }
        this._tmpRight.normalize();

        // Map drag to world: right for +dx, forward for upward drag (-dy)
        this._tmpDir.set(0, 0, 0);
        this._tmpDir.addScaledVector(this._tmpRight, dx);
        this._tmpDir.addScaledVector(this._tmpForward, -dy);
        this._tmpDir.y = 0;

        const length = this._tmpDir.length();
        if (length < 1e-3) {
            return { x: 0, z: 0, length: 0 };
        }
        this._tmpDir.multiplyScalar(1 / length);

        return { x: this._tmpDir.x, z: this._tmpDir.z, length };
    }

    setupDashControls() {
        const target = this.renderer.domElement;

        // Helper to ignore touches when UI menus are on top
        const isInMenu = (event) => {
            const elem = document.elementFromPoint(
                event.touches && event.touches[0] ? event.touches[0].clientX : event.clientX,
                event.touches && event.touches[0] ? event.touches[0].clientY : event.clientY
            );
            return elem && elem.closest('.menu-overlay') && !elem.closest('.hidden');
        };

        target.addEventListener('touchstart', (e) => {
            if (!this.isPlaying) return;
            if (isInMenu(e)) return;
            if (e.touches.length > 1) return; // single touch only

            const t = e.touches[0];
            this.dashState.charging = true;
            this.dashState.startX = this.dashState.currentX = t.clientX;
            this.dashState.startY = this.dashState.currentY = t.clientY;
            this.dashState.startTime = performance.now();
            this.dashState.dirX = 0;
            this.dashState.dirZ = 0;

            this.setDashArrowVisible(false);

            e.preventDefault();
        }, { passive: false });

        target.addEventListener('touchmove', (e) => {
            if (!this.isPlaying) return;
            if (!this.dashState.charging) return;

            const t = e.touches[0];
            this.dashState.currentX = t.clientX;
            this.dashState.currentY = t.clientY;

            const dx = this.dashState.currentX - this.dashState.startX;
            const dy = this.dashState.currentY - this.dashState.startY;

            const dir = this.screenDragToWorldDir(dx, dy);

            if (dir.length > 10) {
                this.dashState.dirX = dir.x;
                this.dashState.dirZ = dir.z;
                this.updateDashArrow();
            } else if (dir.length > 0) {
                this.dashState.dirX = dir.x;
                this.dashState.dirZ = dir.z;
                this.updateDashArrow();
            } else {
                this.dashState.dirX = 0;
                this.dashState.dirZ = 0;
                this.setDashArrowVisible(false);
            }

            e.preventDefault();
        }, { passive: false });

        const endCharge = (clientX, clientY) => {
            if (!this.isPlaying) return;
            if (!this.dashState.charging) return;

            this.dashState.charging = false;
            this.setDashArrowVisible(false);

            const dx = clientX - this.dashState.startX;
            const dy = clientY - this.dashState.startY;

            const dir = this.screenDragToWorldDir(dx, dy);
            if (!this.ballBody || dir.length < 10) {
                // Too small / unclear swipe, ignore
                return;
            }

            // Charge time determines strength
            const now = performance.now();
            const holdMs = now - this.dashState.startTime;
            const maxChargeMs = 1200; // cap charge at ~1.2s
            const charge = Math.min(holdMs / maxChargeMs, 1);

            const baseStrength = 8;
            const extraStrength = 16;
            const strength = baseStrength + extraStrength * charge;

            const impulse = new CANNON.Vec3(
                dir.x * strength,
                strength * 0.5, // slight upward jump
                dir.z * strength
            );

            this.ballBody.applyImpulse(impulse, this.ballBody.position);
        };

        target.addEventListener('touchend', (e) => {
            if (!this.dashState.charging) return;

            // Use last known finger position
            const x = this.dashState.currentX;
            const y = this.dashState.currentY;
            endCharge(x, y);

            e.preventDefault();
        }, { passive: false });

        target.addEventListener('touchcancel', () => {
            this.dashState.charging = false;
            this.setDashArrowVisible(false);
        });
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

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

