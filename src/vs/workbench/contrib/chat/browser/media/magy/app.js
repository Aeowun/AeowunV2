const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

const UI = {
    state: { hasLoaded: false, isBusy: false },

    init() {
        this.cacheElements();
        this.bindEvents();

        if (vscode) {
            this.initVsCodeBridge();
        }

        // 4-second emergency timeout for the "M" loader
        setTimeout(() => {
            if (!this.state.hasLoaded) {
                this.log("Emergency loader dismissal.");
                this.dismissLoading();
            }
        }, 4000);

        this.log("Initialized.");
    },

    ensureThinkingBubble() {
        if (document.getElementById('thinking-bubble')) return;
        this.appendChatBubble('thinking', 'MAGY is thinking...');
    },

    removeThinkingBubble() {
        const bubble = document.getElementById('thinking-bubble');
        if (bubble) bubble.remove();
    },

    log(msg) { console.log(`[MAGY] ${msg}`); },

    cacheElements() {
        this.chatFeed = document.getElementById('chat-feed');
        this.chatInput = document.getElementById('chat-input');
        this.chatForm = document.getElementById('chat-form');
        this.chatButton = this.chatForm ? this.chatForm.querySelector('button') : null;
        this.toastRegion = document.getElementById('toast-region');
        this.relayDot = document.getElementById('relay-dot');
        this.loadingOverlay = document.getElementById('loading-overlay');
        this.appContainer = document.getElementById('app');
    },

    setBusy(busy) {
        this.state.isBusy = busy;
        if (this.chatInput) this.chatInput.disabled = busy;
        if (this.chatButton) {
            this.chatButton.disabled = busy;
            this.chatButton.textContent = busy ? 'Wait...' : 'Send';
        }
        if (!busy && this.chatInput) {
            this.chatInput.focus();
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
            }, 500);
        }
    },

    initVsCodeBridge() {
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'ChatUpdate') {
                this.removeThinkingBubble();
                this.appendChatBubble(message.data.role, message.data.content);
                if (message.data.role === 'magy') {
                    this.setBusy(false);
                }
            } else if (message.type === 'Error') {
                this.removeThinkingBubble();
                this.appendChatBubble('magy', `⚠️ ${message.data}`);
                this.setBusy(false);
            } else if (message.type === 'RelayEvent') {
                const relayMsg = message.data;
                if (relayMsg.type === 'status' && relayMsg.status === 'working') {
                    this.ensureThinkingBubble();
                } else if (relayMsg.type === 'text' || relayMsg.type === 'error' || relayMsg.type === 'response_end') {
                    this.removeThinkingBubble();
                }
            }
        });

        // Signal ready and let the host send the initial greeting
        this.relayDot.className = 'status-dot success';
        vscode.postMessage({ command: 'ui-ready' });
    },

    bindEvents() {
        if (this.chatForm) this.chatForm.addEventListener('submit', (e) => this.handleChatSubmit(e));
        if (this.chatInput) {
            this.chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey && !this.state.isBusy) {
                    e.preventDefault();
                    if (this.chatForm) this.chatForm.requestSubmit();
                }
            });
        }
    },

    appendChatBubble(role, text) {
        if (!this.chatFeed) return;
        if (role === 'magy') this.dismissLoading();

        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${role === 'user' ? 'user' : (role === 'thinking' ? 'thinking' : 'magy')}`;
        if (role === 'thinking') {
            bubble.id = 'thinking-bubble';
        }
        bubble.textContent = text;

        const empty = this.chatFeed.querySelector('.empty-state');
        if (empty) empty.remove();

        this.chatFeed.appendChild(bubble);
        this.chatFeed.scrollTop = this.chatFeed.scrollHeight;
        this.playPopSound();
    },

    async handleChatSubmit(e) {
        e.preventDefault();
        if (this.state.isBusy) return;

        const text = this.chatInput.value.trim();
        if (!text) return;

        this.chatInput.value = '';
        this.setBusy(true);
        this.ensureThinkingBubble();

        if (vscode) {
            vscode.postMessage({ command: 'chat', text: text });
        }
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
    }
};

document.addEventListener('DOMContentLoaded', () => UI.init());
