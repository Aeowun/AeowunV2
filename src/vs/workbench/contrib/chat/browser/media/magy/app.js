const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

const UI = {
    state: { lastSeq: 0, hasLoaded: false },

    init() {
        console.log("MAGY: Initializing Native UI...");

        // Ensure DOM is ready before caching
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.start());
        } else {
            this.start();
        }
    },

    start() {
        this.cacheElements();
        this.bindEvents();

        if (vscode) {
            this.log("Bridge active.");
            this.initVsCodeBridge();
            this.waitForBackend();
        } else {
            this.log("Standalone mode.");
            this.connectSSE();
        }

        // Emergency timeout: Dismiss loader after 4 seconds if still visible
        setTimeout(() => {
            if (!this.state.hasLoaded) {
                console.warn("MAGY: Health check taking too long. Emergency UI reveal.");
                this.dismissLoading();
            }
        }, 4000);
    },

    log(msg) { console.log(`[MAGY] ${msg}`); },

    cacheElements() {
        this.chatFeed = document.getElementById('chat-feed');
        this.chatInput = document.getElementById('chat-input');
        this.toastRegion = document.getElementById('toast-region');
        this.relayDot = document.getElementById('relay-dot');
        this.loadingOverlay = document.getElementById('loading-overlay');
        this.appContainer = document.getElementById('app');
    },

    async waitForBackend() {
        const token = window.MAGY_SESSION_TOKEN || '';
        let attempts = 0;

        while (!this.state.hasLoaded) {
            try {
                const res = await fetch('http://127.0.0.1:3000/api/health', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (res.ok) {
                    console.log("MAGY: Connected.");
                    this.dismissLoading();
                    this.connectSSE();
                    break;
                }
            } catch (e) {
                attempts++;
                if (attempts % 10 === 0) console.log("MAGY: Reconnect loop running...");
            }
            await new Promise(r => setTimeout(r, 1000));
        }
    },

    dismissLoading() {
        if (this.state.hasLoaded) return;
        this.state.hasLoaded = true;

        if (this.appContainer) this.appContainer.style.display = 'flex';

        if (this.loadingOverlay) {
            this.loadingOverlay.classList.add('fade-out');
            setTimeout(() => {
                if (this.loadingOverlay) this.loadingOverlay.style.display = 'none';
            }, 600);
        }
    },

    initVsCodeBridge() {
        window.addEventListener('message', event => {
            const message = event.data;
            if (!message) return;

            switch (message.type) {
                case 'ChatUpdate':
                    this.appendChatBubble(message.data.role, message.data.content);
                    break;
                case 'Error':
                    this.showToast(message.data, true);
                    break;
            }
        });
    },

    bindEvents() {
        const form = document.getElementById('chat-form');
        if (form) form.addEventListener('submit', (e) => this.handleChatSubmit(e));

        if (this.chatInput) {
            this.chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (form) form.requestSubmit();
                }
            });
        }
    },

    connectSSE() {
        const token = window.MAGY_SESSION_TOKEN || '';
        const events = new EventSource(`http://127.0.0.1:3000/api/events?token=${token}`);

        events.onmessage = (e) => {
            try {
                const envelope = JSON.parse(e.data);
                if (envelope.seq <= this.state.lastSeq) return;
                this.state.lastSeq = envelope.seq;

                const { type, data } = envelope;
                if (type === 'ChatUpdate') {
                    this.appendChatBubble(data.role, data.content);
                }
            } catch (err) {}
        };

        events.onopen = () => {
            if (this.relayDot) this.relayDot.className = 'status-dot success';
            this.dismissLoading();
        };

        events.onerror = () => {
            if (this.relayDot) this.relayDot.className = 'status-dot error';
        };
    },

    appendChatBubble(role, text) {
        if (!this.chatFeed) return;

        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${role === 'user' ? 'user' : 'magy'}`;
        bubble.textContent = text;

        const empty = this.chatFeed.querySelector('.empty-state');
        if (empty) empty.remove();

        this.chatFeed.appendChild(bubble);
        this.chatFeed.scrollTop = this.chatFeed.scrollHeight;
        this.playPopSound();
    },

    async handleChatSubmit(e) {
        e.preventDefault();
        if (!this.chatInput) return;

        const text = this.chatInput.value.trim();
        if (!text) return;

        this.chatInput.value = '';
        const token = window.MAGY_SESSION_TOKEN || '';

        try {
            const res = await fetch('http://127.0.0.1:3000/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ messages: [{ role: 'user', content: text }] })
            });
            if (!res.ok) throw new Error("MAGY: Send failed");
        } catch (e) { this.showToast(e.message, true); }
    },

    playPopSound() {
        try {
            if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, this.audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(100, this.audioCtx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.1, this.audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.1);
            osc.connect(gain); gain.connect(this.audioCtx.destination);
            osc.start(); osc.stop(this.audioCtx.currentTime + 0.1);
        } catch (e) {}
    },

    showToast(msg, error = false) {
        if (!this.toastRegion) return;
        const t = document.createElement('div');
        t.className = `toast ${error ? 'error' : ''}`;
        t.textContent = msg;
        this.toastRegion.appendChild(t);
        setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 4000);
    }
};

UI.init();
