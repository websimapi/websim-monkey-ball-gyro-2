export class InputManager {
    constructor() {
        this.tilt = { x: 0, y: 0 };
        this.raw = { x: 0, y: 0 };
        this.offset = { x: 0, y: 0 };
        this.keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, w: false, a: false, s: false, d: false };
        
        // Gyro
        window.addEventListener('deviceorientation', (e) => this.handleOrientation(e));
        
        // Keyboard fallback
        window.addEventListener('keydown', (e) => this.keys[e.key] = true);
        window.addEventListener('keyup', (e) => this.keys[e.key] = false);
    }

    handleOrientation(event) {
        // beta: x-axis (-180 to 180) - Forward/Back
        // gamma: y-axis (-90 to 90) - Left/Right
        
        // Store raw values
        if (event.gamma !== null) this.raw.x = event.gamma;
        if (event.beta !== null) this.raw.y = event.beta;
        
        this.updateTilt();
    }

    calibrate() {
        // Set current raw values as zero offset
        this.offset.x = this.raw.x;
        this.offset.y = this.raw.y;
        this.updateTilt();
    }

    updateTilt() {
        const maxTilt = 25; // Degrees for max speed
        
        // Apply calibration offset
        let x = this.raw.x - this.offset.x;
        let y = this.raw.y - this.offset.y;
        
        // Normalize to -1...1
        this.tilt.x = Math.max(-1, Math.min(1, x / maxTilt));
        this.tilt.y = Math.max(-1, Math.min(1, y / maxTilt));
    }

    getInput() {
        // Combine gyro and keyboard
        let x = this.tilt.x;
        let y = this.tilt.y;
        
        // Keyboard overrides if present
        if (this.keys.ArrowRight || this.keys.d) x = 1.0;
        if (this.keys.ArrowLeft || this.keys.a) x = -1.0;
        if (this.keys.ArrowUp || this.keys.w) y = -1.0;
        if (this.keys.ArrowDown || this.keys.s) y = 1.0;
        
        return { x, y };
    }
}

