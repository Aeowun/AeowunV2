/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aeowun. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMagyLifecycleMainService } from '../common/magyLifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { spawn, ChildProcess } from 'child_process';
import { generateUuid } from '../../../base/common/uuid.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { IRequestService } from '../../request/common/request.js';
import { CancellationToken } from '../../../base/common/cancellation.js';

export class MagyLifecycleMainService extends Disposable implements IMagyLifecycleMainService {
	declare readonly _serviceBrand: undefined;

	private _magyProcess: ChildProcess | undefined;
	private _sessionToken: string;
	private _ownedProcess: boolean = false;

	constructor(
		@ILogService private readonly logService: ILogService,
		@ILifecycleMainService private readonly lifecycleMainService: ILifecycleMainService,
		@IRequestService private readonly requestService: IRequestService,
	) {
		super();
		this._sessionToken = generateUuid();

		this._register(this.lifecycleMainService.onWillShutdown(() => {
			if (this._ownedProcess && this._magyProcess) {
				this.logService.info('[MAGY] Stopping managed backend...');
				this._magyProcess.kill();
			}
		}));
	}

	async startMagy(): Promise<void> {
		if (this._magyProcess) {
			return;
		}

		const isRunning = await this._isMagyHealthy();
		if (isRunning) {
			this.logService.info('[MAGY] Backend already running and healthy. Reusing instance.');
			return;
		}

		const magyExe = "C:\\Dev\\IDE\\Magy\\target\\debug\\magy-app.exe";
		this.logService.info('[MAGY] Spawning headless backend:', magyExe);

		this._magyProcess = spawn(magyExe, [], {
			env: { ...process.env, MAGY_TOKEN: this._sessionToken },
			detached: false,
			stdio: ['ignore', 'pipe', 'pipe']
		});

		this._ownedProcess = true;

		this._magyProcess.stdout?.on('data', (data) => {
			this.logService.info(`[MAGY-BACKEND] ${data.toString().trim()}`);
		});

		this._magyProcess.stderr?.on('data', (data) => {
			this.logService.error(`[MAGY-BACKEND-ERR] ${data.toString().trim()}`);
		});

		this._magyProcess.on('exit', (code) => {
			this.logService.info('[MAGY] Backend exited with code', code);
			this._magyProcess = undefined;
			this._ownedProcess = false;
		});

		await this._waitForReady();
	}

	async getSessionToken(): Promise<string> {
		return this._sessionToken;
	}

	private async _isMagyHealthy(): Promise<boolean> {
		try {
			const context = await this.requestService.request({
				url: `http://127.0.0.1:3000/api/health`,
				type: 'GET',
				headers: { 'Authorization': `Bearer ${this._sessionToken}` },
				// Explicitly provide callSite to satisfy interface
				user: 'aeowun-lifecycle'
			} as any, CancellationToken.None);
			return context.res.statusCode === 200;
		} catch {
			return false;
		}
	}

	private async _waitForReady(): Promise<void> {
		this.logService.info('[MAGY] Waiting for readiness on port 3000...');
		for (let i = 0; i < 30; i++) {
			if (await this._isMagyHealthy()) {
				this.logService.info('[MAGY] Backend is ready and authenticated.');
				return;
			}
			await new Promise(r => setTimeout(r, 1000));
		}
		this.logService.error('[MAGY] Backend failed to become ready after 30s.');
	}
}
