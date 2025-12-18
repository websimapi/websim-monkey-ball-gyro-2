import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class PlayerManager {
    constructor(world, camera, domElement) {
        this.world = world;
        this.camera = camera;
        this.domElement = domElement;
        
        this.ballBody = null;
        this.ballMesh = null;
        this.dashArrow = null;
        
        this.isPlaying = false;

        // Dash State
        this.dashState = {
            charging: false,
            startX: 0, startY: 0,
            currentX: 0, currentY: 0,
            startTime: 0,
            dirX: 0, dirZ: 0,
            lastDashTime: -10000,
            cooldown: 4000
        };

        // Reusable vectors for dash calculation
        this._tmpForward = new THREE.Vector3();
        this._tmpRight = new THREE.Vector3();
        this._tmpDir = new THREE.Vector3();
    }

    init(visualParent) {
        this.createPlayer(visualParent);
        this.initDashArrow(visualParent);
        this.setupDashControls();
    }

    reset(position) {
        if (this.ballBody) {
            this.ballBody.position.set(position.x, position.y, position.z);
            this.ballBody.velocity.set(0, 0, 0);
            this.ballBody.angularVelocity.set(0, 0, 0);
        }
        this.isPlaying = true;
    }

    update() {
        if (!this.isPlaying || !this.ballMesh || !this.ballBody) return;

        // Sync Mesh Visuals
        this.ballMesh.position.copy(this.ballBody.position);
        this.ballMesh.quaternion.copy(this.ballBody.quaternion);

        // Update Dash Visuals
        if (this.dashState.charging) {
            this.updateDashArrow();
        } else {
            this.setDashArrowVisible(false);
        }
    }

    createPlayer(parent) {
        const radius = 0.5;
        
        // Group to hold the glass ball and the inner sprite
        this.ballMesh = new THREE.Group();
        parent.add(this.ballMesh);

        // 1. Inner Baboon
        const textureLoader = new THREE.TextureLoader();
        const baboonTexture = textureLoader.load('baboon.png');
        const innerMat = new THREE.MeshBasicMaterial({ 
            map: baboonTexture,
            transparent: true,
            side: THREE.DoubleSide
        });
        
        const innerSize = radius * 1.6;
        const plane1 = new THREE.Mesh(new THREE.PlaneGeometry(innerSize, innerSize), innerMat);
        const plane2 = new THREE.Mesh(new THREE.PlaneGeometry(innerSize, innerSize), innerMat);
        plane2.rotation.y = Math.PI / 2;
        
        plane1.castShadow = true;
        plane2.castShadow = true;
        
        this.ballMesh.add(plane1);
        this.ballMesh.add(plane2);

        // 2. Outer Glass Sphere
        const glassGeo = new THREE.SphereGeometry(radius, 32, 32);
        const glassMat = new THREE.MeshStandardMaterial({
            color: 0xaaccff,
            roughness: 0.1,
            metalness: 0.1,
            transparent: true,
            opacity: 0.3,
            side: THREE.FrontSide
        });
        const glassSphere = new THREE.Mesh(glassGeo, glassMat);
        this.ballMesh.add(glassSphere);
        
        // Physics Body
        const shape = new CANNON.Sphere(radius);
        this.ballBody = new CANNON.Body({
            mass: 1,
            shape: shape,
            linearDamping: 0.3,
            angularDamping: 0.3,
            ccdSpeedThreshold: 1,
            ccdIterations: 10
        });
        this.world.addBody(this.ballBody);
    }

    initDashArrow(parent) {
        const group = new THREE.Group();
        const shaftGeom = new THREE.CylinderGeometry(0.05, 0.05, 1, 8);
        const tipGeom = new THREE.ConeGeometry(0.12, 0.35, 12);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff4444 });

        const shaft = new THREE.Mesh(shaftGeom, mat);
        const tip = new THREE.Mesh(tipGeom, mat);

        shaft.rotation.x = Math.PI / 2;
        tip.rotation.x = Math.PI / 2;
        shaft.position.z = 0.5;
        tip.position.z = 1.0;

        group.add(shaft);
        group.add(tip);

        group.visible = false;
        parent.add(group);
        this.dashArrow = group;
    }

    setDashArrowVisible(visible) {
        if (this.dashArrow) this.dashArrow.visible = visible;
    }

    updateDashArrow() {
        if (!this.dashArrow || !this.ballMesh || !this.dashState.charging) return;

        const { dirX, dirZ, startTime } = this.dashState;
        const len = Math.hypot(dirX, dirZ);
        
        if (len < 0.01) {
            this.setDashArrowVisible(false);
            return;
        }

        // Charge amount
        const now = performance.now();
        const holdMs = now - startTime;
        const maxChargeMs = 1200;
        const charge = Math.min(holdMs / maxChargeMs, 1);

        const baseLen = 0.8;
        const extraLen = 1.5;
        const arrowLen = baseLen + extraLen * charge;

        // Position arrow
        this.dashArrow.position.copy(this.ballMesh.position);
        this.dashArrow.position.y += 0.8;

        const dir = new THREE.Vector3(dirX, 0, dirZ).normalize();
        const target = new THREE.Vector3().copy(this.dashArrow.position).add(dir);
        this.dashArrow.lookAt(target);

        const modelLen = 1.35;
        const scale = arrowLen / modelLen;
        this.dashArrow.scale.set(scale, scale, scale);

        this.setDashArrowVisible(true);
    }

    screenDragToWorldDir(dx, dy) {
        const len2 = dx * dx + dy * dy;
        if (len2 < 1) return { x: 0, z: 0, length: 0 };

        // Camera Forward (XZ plane)
        this.camera.getWorldDirection(this._tmpForward);
        this._tmpForward.y = 0;
        if (this._tmpForward.lengthSq() < 1e-4) this._tmpForward.set(0, 0, -1);
        this._tmpForward.normalize();

        // Camera Right
        this._tmpRight.crossVectors(this._tmpForward, new THREE.Vector3(0, 1, 0));
        if (this._tmpRight.lengthSq() < 1e-4) this._tmpRight.set(1, 0, 0);
        this._tmpRight.normalize();

        // Map drag
        this._tmpDir.set(0, 0, 0);
        this._tmpDir.addScaledVector(this._tmpRight, dx);
        this._tmpDir.addScaledVector(this._tmpForward, -dy);
        this._tmpDir.y = 0;

        const length = this._tmpDir.length();
        if (length < 1e-3) return { x: 0, z: 0, length: 0 };
        
        this._tmpDir.multiplyScalar(1 / length);
        return { x: this._tmpDir.x, z: this._tmpDir.z, length };
    }

    setupDashControls() {
        const target = this.domElement;
        if (!target) return;

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
            
            const now = performance.now();
            if (now - this.dashState.lastDashTime < this.dashState.cooldown) return;
            if (e.touches.length > 1) return;

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
            if (!this.isPlaying || !this.dashState.charging) return;

            const t = e.touches[0];
            this.dashState.currentX = t.clientX;
            this.dashState.currentY = t.clientY;

            const dx = this.dashState.currentX - this.dashState.startX;
            const dy = this.dashState.currentY - this.dashState.startY;

            const dir = this.screenDragToWorldDir(dx, dy);

            if (dir.length > 10 || (dir.length > 0 && dir.length <= 10)) { // Logic kept from original
                 // Note: Original logic seemed to check length > 10 for update, but update regardless if > 0
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
            if (!this.isPlaying || !this.dashState.charging) return;
            this.dashState.charging = false;
            this.setDashArrowVisible(false);

            const dx = clientX - this.dashState.startX;
            const dy = clientY - this.dashState.startY;
            const dir = this.screenDragToWorldDir(dx, dy);

            if (!this.ballBody || dir.length < 10) return;

            const now = performance.now();
            const holdMs = now - this.dashState.startTime;
            const maxChargeMs = 1200;
            const charge = Math.min(holdMs / maxChargeMs, 1);
            const baseStrength = 1.0;
            const extraStrength = 4.0;
            const strength = baseStrength + extraStrength * charge;

            const impulse = new CANNON.Vec3(dir.x * strength, strength * 0.5, dir.z * strength);
            this.ballBody.applyImpulse(impulse, this.ballBody.position);
            this.dashState.lastDashTime = performance.now();
        };

        target.addEventListener('touchend', (e) => {
            if (!this.dashState.charging) return;
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
}

