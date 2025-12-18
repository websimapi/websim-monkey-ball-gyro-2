export class InputManager {
    constructor() {
        this.tilt = { x: 0, y: 0 };
        this.raw = { x: 0, y: 0 };
        this.offset = { x: 0, y: 0 };
        this.keys = { ... };
        ...
    }
    
    handleOrientation(e) {
        this.raw.x = e.gamma || 0;
        this.raw.y = e.beta || 0;
    }
    
    calibrate() {
        this.offset.x = this.raw.x;
        this.offset.y = this.raw.y;
    }
    
    getInput() {
        // use raw - offset
        let x = this.raw.x - this.offset.x;
        let y = this.raw.y - this.offset.y;
        
        // Clamp and normalize
        // ...
    }
}

