import * as THREE from 'three';

export class SceneManager {
    constructor(container) {
        this.container = container;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        
        // The pivot that tilts the entire visual world
        this.worldPivot = new THREE.Group();
        
        // Camera settings - Intelligent Top-Down
        this.cameraOffset = new THREE.Vector3(0, 70, 5);
        this.cameraLerpFactor = 0.08;
        this.currentLookAt = null;
    }

    init() {
        // Init Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);
        this.scene.add(this.worldPivot);
        
        // Init Camera
        this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
        
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
        
        this.dirLight = new THREE.DirectionalLight(0xffffff, 1);
        this.dirLight.position.set(20, 50, 20);
        this.dirLight.castShadow = true;
        
        // Optimize shadow frustum for top-down view
        const d = 40;
        this.dirLight.shadow.camera.top = d;
        this.dirLight.shadow.camera.bottom = -d;
        this.dirLight.shadow.camera.left = -d;
        this.dirLight.shadow.camera.right = d;
        this.dirLight.shadow.mapSize.width = 2048;
        this.dirLight.shadow.mapSize.height = 2048;
        this.dirLight.shadow.bias = -0.0005;
        this.scene.add(this.dirLight);
        this.scene.add(this.dirLight.target);
    }

    updateCamera(targetObject, velocity = null) {
        if (!targetObject) return;
        
        // Use World Position because target might be inside rotated pivot
        const targetWorldPos = new THREE.Vector3();
        targetObject.getWorldPosition(targetWorldPos);

        // Smart Camera: Look ahead based on velocity
        const focusPoint = targetWorldPos.clone();
        if (velocity) {
            const lookAheadFactor = 0.5;
            const maxLookAhead = 12;
            const vx = Math.max(-20, Math.min(20, velocity.x));
            const vz = Math.max(-20, Math.min(20, velocity.z));
            
            focusPoint.x += Math.max(-maxLookAhead, Math.min(maxLookAhead, vx * lookAheadFactor));
            focusPoint.z += Math.max(-maxLookAhead, Math.min(maxLookAhead, vz * lookAheadFactor));
        }

        if (!this.currentLookAt) {
            this.currentLookAt = focusPoint;
        } else {
            // Smoothly interpolate the focus point to reduce jitter
            this.currentLookAt.lerp(focusPoint, 0.12);
        }

        const desiredPos = this.currentLookAt.clone().add(this.cameraOffset);
        
        // Smooth follow
        this.camera.position.lerp(desiredPos, this.cameraLerpFactor);
        this.camera.lookAt(this.currentLookAt);

        // Update light to follow camera focus
        if (this.dirLight && this.currentLookAt) {
            this.dirLight.position.set(
                this.currentLookAt.x + 20,
                this.currentLookAt.y + 50,
                this.currentLookAt.z + 20
            );
            this.dirLight.target.position.copy(this.currentLookAt);
        }
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

