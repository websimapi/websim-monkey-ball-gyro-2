export class AudioManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.buffers = {};
        this.musicNode = null;
        this.loadAssets();
    }

    async loadAssets() {
        const sounds = {
            'win': 'win.mp3',
            'fall': 'fall.mp3',
            'bg_music': 'bg_music.mp3'
        };

        for (const [name, url] of Object.entries(sounds)) {
            try {
                const response = await fetch(url);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
                this.buffers[name] = audioBuffer;
            } catch (e) {
                console.warn(`Failed to load sound: ${name}`, e);
            }
        }
    }

    playSound(name) {
        if (!this.buffers[name]) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const source = this.ctx.createBufferSource();
        source.buffer = this.buffers[name];
        source.connect(this.ctx.destination);
        source.start(0);
    }

    playMusic() {
        if (!this.buffers['bg_music']) {
            // Retry if not loaded
            setTimeout(() => this.playMusic(), 500);
            return;
        }
        if (this.musicNode) return; // Already playing

        if (this.ctx.state === 'suspended') this.ctx.resume();

        const source = this.ctx.createBufferSource();
        source.buffer = this.buffers['bg_music'];
        source.loop = true;
        
        // Lower volume for music
        const gainNode = this.ctx.createGain();
        gainNode.gain.value = 0.5;
        
        source.connect(gainNode);
        gainNode.connect(this.ctx.destination);
        source.start(0);
        this.musicNode = source;
    }
}

