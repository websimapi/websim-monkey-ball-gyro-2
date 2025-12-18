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
        this.cameraOffset = new THREE.Vector3(0, 12, 12);
        this.cameraLerpFactor = 0.12;
    }

    init() {
        // Init Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);
        this.scene.add(this.worldPivot);
        
        // Init Camera
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        
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

    updateCamera(targetObject) {
        if (!targetObject) return;
        
        // Use World Position because target might be inside rotated pivot
        const targetWorldPos = new THREE.Vector3();
        targetObject.getWorldPosition(targetWorldPos);

        const desiredPos = targetWorldPos.clone().add(this.cameraOffset);
        
        // Smooth follow
        this.camera.position.lerp(desiredPos, this.cameraLerpFactor);
        this.camera.lookAt(targetWorldPos);
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

