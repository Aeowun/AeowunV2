/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aeowun. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';
import { Event } from '../../../base/common/event.js';

export const IMagyLifecycleMainService = createDecorator<IMagyLifecycleMainService>('magyLifecycleMainService');

export interface IMagyLifecycleMainService {
	readonly _serviceBrand: undefined;
	startMagy(): Promise<void>;
	getSessionToken(): Promise<string>;
	sendToRelay(text: string, context?: any): Promise<string>;
	getInitialGreeting(): Promise<string | null>;
	readonly onDidRelayMessage: Event<any>;
}
