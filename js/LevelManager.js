import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class LevelManager {
    constructor(scene, world) {
        this.currentMaxTilt = 0.5;
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
        
        const floorTex = loader.load('checkered_floor.png');
        floorTex.wrapS = THREE.RepeatWrapping;
        floorTex.wrapT = THREE.RepeatWrapping;
        floorTex.repeat.set(0.5, 0.5); 
        this.floorMat = new THREE.MeshStandardMaterial({ map: floorTex });
        
        const wallTex = loader.load('wood_texture.png');
        wallTex.wrapS = THREE.RepeatWrapping;
        wallTex.wrapT = THREE.RepeatWrapping;
        this.wallMat = new THREE.MeshStandardMaterial({ map: wallTex });
        
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
        // Physics bodies are now static (flat). 
        // Visual tilt and Gravity rotation are handled in Game.js via worldPivot.
        // This method is deprecated but kept for signature compatibility.
    }

    loadLevel(levelNum) {
        this.currentLevelIndex = levelNum;
        const levels = [
            // Level 1: Grass Plains
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
            // Level 2: The Serpentine (Procedural 3D Track)
            {
                type: 'procedural_track',
                maxTilt: 1.0
            },
            // Level 3: Golden Zig-Zag
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
            // Level 4: Sky Plains
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
        this.currentMaxTilt = data.maxTilt || 0.5;
        this.applyTheme(levelNum);
        
        let startPos;
        if (data.type === 'procedural_track') {
            startPos = this.buildSmoothTrack();
        } else {
            startPos = this.buildFromMap(data.map, data.scale);
        }
        
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
        // No-op
    }

    buildSmoothTrack() {
        // 1. Generate Curve Points
        const points = [];
        const segments = 200; 
        
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            // Wider, smoother curves and longer track
            const x = Math.sin(t * Math.PI * 4.0) * 50; 
            const z = -t * 300; 
            const y = 30 - (t * 60); 
            points.push(new THREE.Vector3(x, y, z));
        }
        
        // 2. Build Ribbon Geometry manually to ensure flat cross-section (No banking)
        // This solves the issue of ExtrudeGeometry rotating the shape sideways
        const width = 20;
        const geometryVerts = [];
        const geometryIndices = [];
        
        const ribbonVerts = []; // Temp storage for L/R pairs
        
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            
            // Tangent
            const forward = new THREE.Vector3();
            if (i < points.length - 1) {
                forward.subVectors(points[i+1], p);
            } else if (i > 0) {
                forward.subVectors(p, points[i-1]);
            } else {
                forward.set(0, 0, -1);
            }
            forward.normalize();
            
            // Right Vector (Force Horizontal to prevent sideways tilt)
            const up = new THREE.Vector3(0, 1, 0);
            const right = new THREE.Vector3().crossVectors(forward, up).normalize();
            
            // Fallback for strictly vertical segments
            if (right.lengthSq() < 0.001) right.set(1, 0, 0);
            
            const leftV = new THREE.Vector3().copy(p).addScaledVector(right, -width/2);
            const rightV = new THREE.Vector3().copy(p).addScaledVector(right, width/2);
            
            ribbonVerts.push(leftV, rightV);
        }
        
        // Flatten into buffer
        for (const v of ribbonVerts) {
            geometryVerts.push(v.x, v.y, v.z);
        }
        
        // Generate Triangles
        for (let i = 0; i < segments; i++) {
            const base = i * 2;
            const l1 = base;
            const r1 = base + 1;
            const l2 = base + 2;
            const r2 = base + 3;
            
            // Two triangles per segment
            geometryIndices.push(l1, l2, r1);
            geometryIndices.push(r1, l2, r2);
        }
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(geometryVerts, 3));
        geometry.setIndex(geometryIndices);
        geometry.computeVertexNormals();
        
        // Visual Mesh
        const mat = this.floorMat.clone();
        mat.side = THREE.DoubleSide; // Visible from below just in case
        const mesh = new THREE.Mesh(geometry, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.levelGroup.add(mesh);
        
        // Physics Body (Trimesh)
        const trimesh = new CANNON.Trimesh(geometryVerts, geometryIndices);
        const body = new CANNON.Body({ mass: 0 });
        body.addShape(trimesh);
        
        this.world.addBody(body);
        this.bodies.push(body);
        
        // Start & Goal
        const startPoint = points[0];
        const goalPoint = points[points.length - 1];
        
        this.createGoal(goalPoint.x, goalPoint.y + 0.5, goalPoint.z);
        
        return { x: startPoint.x, y: startPoint.y + 5, z: startPoint.z };
    }
}

