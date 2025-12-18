import * as THREE from 'three';

export class SceneManager {
    constructor(container) {
        this.container = container;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        
        // The pivot that tilts the entire visual world
        this.worldPivot = new THREE.Group();
        
        // Camera settings
        this.cameraOffset = new THREE.Vector3(0, 26, 15);
        this.cameraLerpFactor = 0.12;
        this.currentLookAt = null;

        // Transparency Raycaster
        this.raycaster = new THREE.Raycaster();
        this.obscuredObjects = [];
    }

    init() {
        // Init Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);
        this.scene.add(this.worldPivot);
        
        // Init Camera
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        
        // Init Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.container.appendChild(this.renderer.domElement);
        
        // Lights
        this.setupLights();
        
        // Events
        window.addEventListener('resize', () => this.onResize());
    }

    setupLights() {
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
    }

    updateCamera(targetObject, terrainGroup) {
        if (!targetObject) return;
        
        // Use World Position because target might be inside rotated pivot
        const targetWorldPos = new THREE.Vector3();
        targetObject.getWorldPosition(targetWorldPos);

        if (!this.currentLookAt) {
            this.currentLookAt = targetWorldPos.clone();
        } else {
            // Smoothly interpolate the focus point to reduce jitter
            this.currentLookAt.lerp(targetWorldPos, 0.2);
        }

        const desiredPos = this.currentLookAt.clone().add(this.cameraOffset);
        
        // Smooth follow
        this.camera.position.lerp(desiredPos, this.cameraLerpFactor);
        this.camera.lookAt(this.currentLookAt);

        // Handle Terrain Transparency
        if (terrainGroup) {
            this.checkObstructions(targetWorldPos, terrainGroup);
        }
    }

    checkObstructions(targetPos, terrainGroup) {
        // Raycast from camera to target
        const direction = new THREE.Vector3().subVectors(targetPos, this.camera.position);
        const distance = direction.length();
        direction.normalize();

        this.raycaster.set(this.camera.position, direction);
        
        // We only care about intersections closer than the player
        const intersects = this.raycaster.intersectObject(terrainGroup, true);
        
        const newObscured = [];
        const foundUuids = new Set();

        for (const hit of intersects) {
            // Check if hit is substantially closer than the target (avoid self-collision with target area)
            if (hit.distance < distance - 1.5) {
                const mesh = hit.object;
                if (!mesh.isMesh) continue;
                
                // Avoid processing same object multiple times in one frame
                if (foundUuids.has(mesh.uuid)) continue;

                // Track this mesh as currently obscuring
                foundUuids.add(mesh.uuid);
                newObscured.push(mesh);

                // If not already faded, fade it
                if (!mesh.userData.isFaded) {
                    if (!mesh.userData.originalMaterial) {
                        mesh.userData.originalMaterial = mesh.material;
                    }
                    // Clone to make unique instance with transparency
                    const newMat = mesh.userData.originalMaterial.clone();
                    newMat.transparent = true;
                    newMat.opacity = 0.25;
                    mesh.material = newMat;
                    mesh.userData.isFaded = true;
                }
            }
        }

        // Restore objects that are no longer obscuring
        for (const obj of this.obscuredObjects) {
            if (!foundUuids.has(obj.uuid)) {
                if (obj.userData.originalMaterial) {
                    obj.material.dispose();
                    obj.material = obj.userData.originalMaterial;
                }
                obj.userData.isFaded = false;
            }
        }

        this.obscuredObjects = newObscured;
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }
}

