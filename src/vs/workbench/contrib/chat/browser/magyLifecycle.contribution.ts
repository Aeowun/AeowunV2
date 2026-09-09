/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aeowun. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { MagyLifecycleChannelClient } from '../../../../platform/magy/common/magyLifecycleIpc.js';
import { ILogService } from '../../../../platform/log/common/log.js';

export class MagyLifecycleContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.magyLifecycle';

	constructor(
		@IMainProcessService private readonly mainProcessService: IMainProcessService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.startMagy();
	}

	private async startMagy(): Promise<void> {
		this.logService.info('[MAGY] Workbench ready. Triggering backend startup...');
		const client = new MagyLifecycleChannelClient(this.mainProcessService.getChannel('magy'));
		try {
			await client.startMagy();
		} catch (error) {
			this.logService.error('[MAGY] Failed to start backend:', error);
		}
	}
}

registerWorkbenchContribution2(MagyLifecycleContribution.ID, MagyLifecycleContribution, WorkbenchPhase.AfterRestored);
