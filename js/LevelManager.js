import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class LevelManager {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.meshes = [];
        this.bodies = [];
        this.currentLevelIndex = 0;
        this.goalPos = null;
        this.goalMesh = null;
        
        this.initialStates = [];
        this.initialGoalPos = null;

        // Visual container for the level (so we can tilt it visually)
        this.levelGroup = new THREE.Group();
        this.scene.add(this.levelGroup);
        
        // Textures
        const loader = new THREE.TextureLoader();
        this.floorMat = new THREE.MeshStandardMaterial({ map: loader.load('checkered_floor.png') });
        this.wallMat = new THREE.MeshStandardMaterial({ map: loader.load('wood_texture.png') });
        this.goalMat = new THREE.MeshBasicMaterial({ map: loader.load('goal_texture.png'), transparent: true });
    }

    clear() {
        // Remove physics bodies
        for (const body of this.bodies) {
            this.world.removeBody(body);
        }
        this.bodies = [];
        
        // Remove meshes
        this.levelGroup.clear(); // Clears all children
        this.goalPos = null;
        this.goalMesh = null;
        this.initialStates = [];
        this.initialGoalPos = null;
        this.levelGroup.quaternion.identity();
    }
    
    updateTilt(tiltX, tiltZ) {
        if (this.initialStates.length === 0) return;

        const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), tiltX);
        const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), tiltZ);
        const qFinal = new THREE.Quaternion().multiplyQuaternions(qx, qz);

        // Visuals
        this.levelGroup.quaternion.copy(qFinal);
        
        // Physics
        for (const state of this.initialStates) {
            const v = state.initialPos.clone().applyQuaternion(qFinal);
            state.body.position.set(v.x, v.y, v.z);
            
            const q = state.initialQuat.clone().premultiply(qFinal);
            state.body.quaternion.set(q.x, q.y, q.z, q.w);
        }
        
        // Goal Logic
        if (this.initialGoalPos) {
            const p = this.initialGoalPos.clone().applyQuaternion(qFinal);
            this.goalPos.copy(p);
        }
    }

    loadLevel(levelNum) {
        this.currentLevelIndex = levelNum;
        const levels = [
            // Level 1: Grass Plains
            // Large square platform, no walls.
            {
                map: [
                    "................",
                    "................",
                    ".......G........",
                    "................",
                    "................",
                    "................",
                    "................",
                    "................",
                    "................",
                    ".......S........",
                    "................",
                    "................"
                ],
                scale: 4
            },
            // Level 2: Aqua Hairpin
            // A long straight into a wide U-turn.
            {
                map: [
                    "WWWWWWWWWWWWWWWWWWWW",
                    "W.S................W",
                    "W..................W",
                    "WWWWWWWWWWWWWW.....W",
                    "             W.....W",
                    "             W.....W",
                    "             W.....W",
                    "             W.....W",
                    "WWWWWWWWWWWWWW.....W",
                    "W..................W",
                    "W...O..O..O..O.....W",
                    "W..................W",
                    "W.....WWWWWWWWWWWWWW",
                    "W.....W             ",
                    "W.....WWWWWWWWWWWWWW",
                    "W..................W",
                    "W..................W",
                    "WWWWWWWWWWWW....G..W",
                    "           WWWWWWWWW"
                ],
                scale: 2
            },
            // Level 3: Golden Zig-Zag
            // Sharp 90 degree turns, still walled.
            {
                map: [
                    "      WWWWWWWW      ",
                    "      W......W      ",
                    "      W..S...W      ",
                    "      W......W      ",
                    "      W...WWWW      ",
                    "      W...W         ",
                    "WWWWWWW...WWWWWWWW  ",
                    "W................W  ",
                    "W................W  ",
                    "WWWWWWWWWWWW.....W  ",
                    "           W.....W  ",
                    "           W.....W  ",
                    "  WWWWWWWWWW.....W  ",
                    "  W..............W  ",
                    "  W..............W  ",
                    "  W.....WWWWWWWWWW  ",
                    "  W.....W           ",
                    "  W.....W           ",
                    "  W..G..W           ",
                    "  WWWWWWW           "
                ],
                scale: 2
            },
            // Level 4: Sky Plains (No walls)
            // Wide open track, easy mode racing.
            {
                map: [
                    "....................",
                    "...S................",
                    "....................",
                    "....................",
                    "..............      ",
                    "..............      ",
                    "..............      ",
                    "    ..........      ",
                    "    ..........      ",
                    "    ..........      ",
                    "    ..........      ",
                    "    ..........      ",
                    "    ..........      ",
                    "              ......",
                    "              ......",
                    "              ......",
                    "              ......",
                    "              ...G..",
                    "              ......"
                ],
                scale: 2
            },
            // Level 5: Dual Lane Highway
            // Open, with obstacles/holes in middle
            {
                map: [
                    "....................",
                    ".......S............",
                    "....................",
                    ".....O.......O......",
                    "....................",
                    "....................",
                    ".....O.......O......",
                    "....................",
                    "....................",
                    ".......O...O........",
                    "....................",
                    "....................",
                    "....................",
                    ".....O.......O......",
                    "....................",
                    ".......G............",
                    "...................."
                ],
                scale: 2
            }
        ];

        const idx = levelNum - 1;
        if (idx >= levels.length) return null;

        const data = levels[idx];
        this.applyTheme(levelNum);
        const startPos = this.buildFromMap(data.map, data.scale);
        
        this.captureInitialStates();
        return startPos;
    }

    applyTheme(levelNum) {
        // Tints for the checkered floor (Green base)
        const floorColors = [
            0xffffff, // L1: Natural Green
            0x00ffff, // L2: Aqua/Teal (Green*Cyan)
            0xffff00, // L3: Lime/Gold (Green*Yellow)
            0xffddff, // L4: Light Purple tint
            0xdddddd  // L5: Standard
        ];
        
        const wallColors = [
            0xff8c00, // L1: Dark Orange walls
            0x00bfff, // L2: Deep Sky Blue
            0xffd700, // L3: Gold
            0xdda0dd, // L4: Plum
            0xff6347  // L5: Tomato
        ];

        const idx = (levelNum - 1) % floorColors.length;
        if (this.floorMat.color) this.floorMat.color.setHex(floorColors[idx]);
        if (this.wallMat.color) this.wallMat.color.setHex(wallColors[idx]);
    }

    buildFromMap(map, scale) {
        let startPos = { x: 0, y: 5, z: 0 };
        const rows = map.length;
        const cols = map[0].length;
        
        const halfW = cols * scale / 2;
        const halfH = rows * scale / 2;

        // Floor Body (Static plane isn't enough for holes, using boxes)
        // We will build the floor out of box blocks for simplicity
        
        const boxGeo = new THREE.BoxGeometry(scale, 1, scale);
        const wallGeo = new THREE.BoxGeometry(scale, 2, scale); // Taller walls
        
        // Create a single geometry for floor to optimize? 
        // For simplicity, individual meshes.
        
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < map[r].length; c++) {
                const char = map[r][c];
                const x = (c * scale) - halfW;
                const z = (r * scale) - halfH;
                
                if (char === ' ') continue; // Void
                
                // Floor block for everyone except void
                if (char !== 'O') { // O is hole
                    // Create deep floor to prevent clipping/viewing issues
                    this.createBlock(x, -2.5, z, scale, 5, scale, this.floorMat, false);
                }

                if (char === 'W') {
                    // Wall
                    this.createBlock(x, 1, z, scale, 2, scale, this.wallMat, false);
                } else if (char === 'S') {
                    startPos = { x, y: 2, z };
                } else if (char === 'G') {
                    this.createGoal(x, 0.1, z);
                }
            }
        }
        
        // Add a giant plane way below to catch shadows if we want, but not needed.
        return startPos;
    }

    createBlock(x, y, z, w, h, d, mat, isGhost) {
        // Visual
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.levelGroup.add(mesh);
        
        if (!isGhost) {
            // Physics
            const shape = new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2));
            const body = new CANNON.Body({
                mass: 0, // Static
                position: new CANNON.Vec3(x, y, z)
            });
            body.addShape(shape);
            this.world.addBody(body);
            this.bodies.push(body);
        }
    }

    createGoal(x, y, z) {
        this.goalPos = new THREE.Vector3(x, y, z);
        
        // Visual Goal
        const geometry = new THREE.PlaneGeometry(3, 3);
        const mesh = new THREE.Mesh(geometry, this.goalMat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(x, y + 0.05, z);
        this.levelGroup.add(mesh);
        this.goalMesh = mesh;
    }

    checkGoal(ballPos) {
        if (!this.goalPos) return false;
        const dist = Math.sqrt(
            Math.pow(ballPos.x - this.goalPos.x, 2) + 
            Math.pow(ballPos.z - this.goalPos.z, 2)
        );
        return dist < 1.5;
    }

    captureInitialStates() {
        this.initialStates = [];
        this.bodies.forEach(body => {
            this.initialStates.push({
                body: body,
                initialPos: new THREE.Vector3(body.position.x, body.position.y, body.position.z),
                initialQuat: new THREE.Quaternion(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w)
            });
        });
        if (this.goalPos) {
            this.initialGoalPos = this.goalPos.clone();
        }
    }
}

