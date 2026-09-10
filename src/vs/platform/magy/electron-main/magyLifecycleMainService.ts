/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aeowun. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMagyLifecycleMainService } from '../common/magyLifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { spawn, ChildProcess, execSync } from 'child_process';
import { generateUuid } from '../../../base/common/uuid.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { IRequestService } from '../../request/common/request.js';

const MASTER_PROMPT = `
You are MAGY.

MAGY is an engineering agent created by Zack under the AEOWUN project. You operate inside AEOWUN, a local-first IDE based on VS Code that is being substantially redesigned around a coherent engineering workflow.

AEOWUN CORE BOUNDARY
AEOWUN is the protected host environment for MAGY.
This is an internal operating constraint, not a topic MAGY should proactively discuss.
MAGY must never modify, recommend modifying, or provide actionable instructions for changing the protected host environment or its internal implementation.
MAGY must not treat the host environment as an ordinary user project.
This restriction is permanent and applies regardless of available tools, permissions, source visibility, or user requests.

IMPORTANT COMMUNICATION RULE:
Do not mention, explain, or volunteer this boundary during ordinary conversation.
Do not bring it up when describing MAGY's capabilities.
Do not bring it up when answering "What can you do?"
Do not bring it up during greetings or introductions.
Do not unnecessarily redirect unrelated engineering questions toward this boundary.
Only address the boundary when the user's request directly concerns modifying, inspecting, or otherwise working on the protected host environment itself, and only to the extent necessary to explain the limitation.

IDENTITY
- Your name is MAGY.
- You are an engineering agent, not a generic chatbot.
- You are part of AEOWUN.
- You work with the user and ChatGPT as part of one engineering system.
- Be direct, technically precise, and useful.
- Speak naturally. Do not constantly describe yourself as an AI or explain your internal architecture unless relevant.

CURRENT CAPABILITIES
At this stage, your capabilities are intentionally limited.
You currently:
- Can communicate with the user through the AEOWUN MAGY interface.
- Can communicate with ChatGPT through the existing relay.
- Can reason about software and engineering problems through that communication path.
You currently CANNOT see project files, browse the filesystem, edit files, or run commands unless AEOWUN explicitly provides that capability and reports the result.

TRUTHFULNESS
Truth is authoritative. Never claim an operation occurred unless the system provides evidence that it occurred. Distinguish clearly between what you know, what the user told you, what the system verified, and what you are proposing.

CURRENT MISSION
MAGY exists to help the user engineer their projects.
MAGY is an engineering reasoning layer operating within AEOWUN.

MAGY should:
- Understand the user's engineering problems.
- Reason about software and engineering systems.
- Help design, debug, implement, test, and improve the user's projects.
- Analyze code, logs, errors, architecture, and technical requirements when explicitly provided.
- Produce useful engineering guidance and complete implementations when appropriate.
- Communicate clearly with ChatGPT through the available relay.
- Remain truthful about its capabilities and access.
- Prefer simple, correct engineering solutions over unnecessary complexity.

MAGY should behave as a practical engineering partner rather than constantly explaining its own limitations or architecture.
When describing capabilities, focus on what MAGY can help the user accomplish.
Do not volunteer internal restrictions or the protected-boundary rule.

!!!STRICT INSTRUCTIONS!!!
You are MAGY operating inside AEOWUN.
This is the user's first interaction with you in this session.
Say hello naturally and introduce yourself briefly as an engineering agent for Aeowun.

!!!STRICT FOOTER!!!
RESPOND EXACTLY: "Hello, I'm Magy. I am here to help you understand, build, and reason about software. How can I help you today?"
`;

export class MagyLifecycleMainService extends Disposable implements IMagyLifecycleMainService {
	declare readonly _serviceBrand: undefined;

	private _sessionToken: string;
	private _greeted: boolean = false;
	private _relayProcess: ChildProcess | undefined;
	private _stdoutBuffer: string = '';

	private _turnState: 'READY' | 'INITIALIZING' | 'WAITING_FOR_RESPONSE' = 'READY';
	private _activeRequestId: string | null = null;
	private _turnStartedAt: number = 0;
	private _pendingTurn: { resolve: (val: string) => void, reject: (err: any) => void, text: string } | null = null;

	constructor(
		@ILogService private readonly logService: ILogService,
		@ILifecycleMainService private readonly lifecycleMainService: ILifecycleMainService,
		@IRequestService private readonly requestService: IRequestService,
	) {
		super();
		this._sessionToken = generateUuid();
		this._register(this.lifecycleMainService.onWillShutdown(() => this._stopRelay()));

		// Watchdog timer (check every 5s)
		setInterval(() => this._checkTurnWatchdog(), 5000);
	}

	async startMagy(): Promise<void> {
		this.logService.info('[MAGY] Initializing High-Speed Persistent Relay...');
		this._ensureChromeRunning();
		this._startRelay();
	}

	private _ensureChromeRunning(): void {
		try {
			execSync('netstat -ano | findstr :9222');
			this.logService.info('[MAGY] CDP port 9222 is active.');
		} catch {
			this.logService.info('[MAGY] Spawning Chrome...');
			const profileDir = `${process.env['LOCALAPPDATA']}\\MagyNuclearProfile`;
			const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
			spawn(chromePath, [
				'--remote-debugging-port=9222',
				`--user-data-dir=${profileDir}`,
				'--profile-directory=Default',
				'--no-first-run',
				'--no-default-browser-check',
				'https://chatgpt.com/'
			], { detached: true, stdio: 'ignore' }).unref();
		}
	}

	private _startRelay(): void {
		if (this._relayProcess) { return; }

		const relayPath = 'C:\\Dev\\IDE\\devTool_xO0\\relay.py';
		this.logService.info('[MAGY] Spawning persistent relay process...');

		this._relayProcess = spawn('python', ['-u', relayPath, '--stdio'], {
			env: {
				...process.env,
				PYTHONIOENCODING: 'utf-8',
				PYTHONUTF8: '1'
			}
		});

		this._relayProcess.stdout?.on('data', (data) => this._handleRelayOutput(data.toString()));
		this._relayProcess.stderr?.on('data', (data) => {
			const errText = data.toString().trim();
			if (errText.includes('composer was not found')) {
				this._handleRelayMessage({ type: 'error', message: 'ChatGPT Login Required. Please log in to the Chrome window on the left.' });
			} else {
				this.logService.error(`[RELAY-ERR] ${errText}`);
			}
		});

		this._relayProcess.on('exit', (code) => {
			this.logService.warn('[MAGY] Relay process exited with code', code);
			this._relayProcess = undefined;
			if (this._pendingTurn) {
				const reject = this._pendingTurn.reject;
				this._pendingTurn = null;
				this._activeRequestId = null;
				this._turnState = 'READY';
				reject(new Error('Relay process terminated.'));
			}
		});
	}

	private _stopRelay(): void {
		if (this._relayProcess) {
			this._relayProcess.kill();
			this._relayProcess = undefined;
		}
	}

	private _handleRelayOutput(data: string): void {
		this._stdoutBuffer += data;
		let newlineIndex: number;

		while ((newlineIndex = this._stdoutBuffer.indexOf('\n')) !== -1) {
			const line = this._stdoutBuffer.slice(0, newlineIndex).trim();
			this._stdoutBuffer = this._stdoutBuffer.slice(newlineIndex + 1);

			if (!line) continue;

			try {
				const msg = JSON.parse(line);
				this._handleRelayMessage(msg);
			} catch (e) {
				this.logService.error('[MAGY] Failed to parse relay JSON:', line);
			}
		}
	}

	private _handleRelayMessage(msg: any): void {
		this.logService.info(`[MAGY RELAY RX] type=${msg.type} id=${msg.id} state=${this._turnState}`);

		if (!this._pendingTurn) return;

		switch (msg.type) {
			case 'initialize_complete':
			case 'text':
				this._pendingTurn.text += msg.text;
				break;
			case 'response_end':
				if (this._activeRequestId && msg.id && msg.id !== this._activeRequestId) {
					this.logService.warn(`[MAGY] Ignoring stale end message with ID: ${msg.id}`);
					return;
				}
				const result = this._pendingTurn.text;
				const resolve = this._pendingTurn.resolve;
				this._pendingTurn = null;
				this._activeRequestId = null;
				this._turnState = 'READY';
				resolve(result);
				break;
			case 'error':
				const reject = this._pendingTurn.reject;
				const errMsg = msg.message;
				this._pendingTurn = null;
				this._activeRequestId = null;
				this._turnState = 'READY';
				reject(new Error(errMsg));
				break;
		}
	}

	private _checkTurnWatchdog(): void {
		if (this._turnState === 'READY' || !this._activeRequestId) return;

		const elapsed = Date.now() - this._turnStartedAt;
		const timeout = 60000; // 60 seconds

		if (elapsed > timeout) {
			this.logService.error(`[MAGY] WATCHDOG: Request ${this._activeRequestId} exceeded timeout. Unlocking.`);
			if (this._pendingTurn) {
				const reject = this._pendingTurn.reject;
				this._pendingTurn = null;
				this._activeRequestId = null;
				this._turnState = 'READY';
				reject(new Error('Relay response timed out.'));
			}
		}
	}

	async sendToRelay(text: string): Promise<string> {
		if (!this._relayProcess) { this._startRelay(); }
		if (!this._relayProcess) { throw new Error('Relay process unavailable.'); }

		if (this._turnState !== 'READY') {
			throw new Error('A turn is already in progress.');
		}

		const requestId = `msg-${Date.now()}`;
		this._activeRequestId = requestId;
		this._turnState = 'WAITING_FOR_RESPONSE';
		this._turnStartedAt = Date.now();

		return new Promise((resolve, reject) => {
			this._pendingTurn = { resolve, reject, text: '' };
			const payload = JSON.stringify({ type: 'message', id: requestId, text });
			this._relayProcess?.stdin?.write(payload + '\n');
		});
	}

	async getInitialGreeting(): Promise<string | null> {
		if (this._greeted) { return null; }
		this._greeted = true;

		// 4-second delay before sending the master prompt to ensure UI is ready
		await new Promise(r => setTimeout(r, 4000));

		if (!this._relayProcess) { this._startRelay(); }

		const requestId = `init-${Date.now()}`;
		this._activeRequestId = requestId;
		this._turnState = 'INITIALIZING';
		this._turnStartedAt = Date.now();

		this.logService.info('[MAGY] Sending Master Prompt after 4s delay...');
		return new Promise((resolve, reject) => {
			this._pendingTurn = {
				resolve: (text) => resolve(text),
				reject: (err) => resolve(`Welcome to MAGY. (Initialization failed: ${err.message})`),
				text: ''
			};
			const payload = JSON.stringify({ type: 'initialize', id: requestId, masterPrompt: MASTER_PROMPT });
			this._relayProcess?.stdin?.write(payload + '\n');
		});
	}

	async getSessionToken(): Promise<string> {
		return this._sessionToken;
	}
}
