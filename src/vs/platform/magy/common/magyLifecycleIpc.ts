/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aeowun. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { Event } from '../../../base/common/event.js';
import { IMagyLifecycleMainService } from './magyLifecycleMainService.js';

export class MagyLifecycleChannel implements IServerChannel {
	constructor(private service: IMagyLifecycleMainService) { }

	listen(_: unknown, event: string): Event<any> {
		throw new Error(`Event not found: ${event}`);
	}

	call(_: unknown, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'startMagy': return this.service.startMagy();
			case 'getSessionToken': return this.service.getSessionToken();
		}

		throw new Error(`Command not found: ${command}`);
	}
}

export class MagyLifecycleChannelClient implements IMagyLifecycleMainService {
	declare readonly _serviceBrand: undefined;

	constructor(private channel: IChannel) { }

	startMagy(): Promise<void> {
		return this.channel.call('startMagy');
	}

	getSessionToken(): Promise<string> {
		return this.channel.call('getSessionToken');
	}
}
