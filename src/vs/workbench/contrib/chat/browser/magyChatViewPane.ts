/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aeowun. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IChatService } from '../common/chatService/chatService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ILanguageModelsService } from '../common/languageModels.js';
import { WebviewViewPane } from '../../webviewView/browser/webviewViewPane.js';
import { IViewletViewOptions } from '../../../browser/parts/views/viewsViewlet.js';
import { IActivityService } from '../../../services/activity/common/activity.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IWebviewService, IWebview } from '../../webview/browser/webview.js';
import { IWebviewViewService } from '../../webviewView/browser/webviewViewService.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { MagyLifecycleChannelClient } from '../../../../platform/magy/common/magyLifecycleIpc.js';
import { asWebviewUri, webviewGenericCspSource } from '../../webview/common/webview.js';
import { FileAccess } from '../../../../base/common/network.js';

export class MagyChatViewPane extends WebviewViewPane {

	static readonly ID = 'workbench.views.magyChat';

	constructor(
		options: IViewletViewOptions,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IOpenerService openerService: IOpenerService,
		@IHoverService hoverService: IHoverService,
		@IThemeService themeService: IThemeService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IActivityService activityService: IActivityService,
		@IExtensionService extensionService: IExtensionService,
		@IProgressService progressService: IProgressService,
		@IStorageService storageService: IStorageService,
		@IViewsService viewService: IViewsService,
		@IWebviewService webviewService: IWebviewService,
		@IWebviewViewService webviewViewService: IWebviewViewService,
		@IChatService private readonly chatService: IChatService,
		@ILogService private readonly logService: ILogService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IMainProcessService private readonly mainProcessService: IMainProcessService,
	) {
		super(options, configurationService, contextKeyService, contextMenuService, instantiationService, keybindingService, openerService, hoverService, themeService, viewDescriptorService, activityService, extensionService, progressService, storageService, viewService, webviewService, webviewViewService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this._register(this.onDidChangeBodyVisibility(visible => {
			if (visible) {
				this._setupWebview();
			}
		}));
	}

	private async _setupWebview(): Promise<void> {
		const webview = (this as any)._webview.value as IWebview;
		if (!webview) { return; }

		// Configure webview content options
		webview.contentOptions = {
			allowScripts: true,
			localResourceRoots: [
				FileAccess.asFileUri('vs/workbench/contrib/chat/browser/media/magy')
			]
		};

		const client = new MagyLifecycleChannelClient(this.mainProcessService.getChannel('magy'));

		let token = '';
		try {
			token = await client.getSessionToken();
		} catch (e) {
			this.logService.error('[Magy] Failed to get session token:', e);
		}

		webview.setHtml(this._getHtml(token, webviewGenericCspSource));

		this._register(webview.onMessage(async (e: any) => {
			if (e.message.command === 'chat') {
				const text = e.message.text;
				this.logService.info('[MAGY] UI Request:', text);

				// Show user bubble immediately
				webview.postMessage({ type: 'ChatUpdate', data: { role: 'user', content: text } });

				try {
					const response = await client.sendToRelay(text);
					webview.postMessage({ type: 'ChatUpdate', data: { role: 'magy', content: response } });
				} catch (err: any) {
					this.logService.error('[MAGY] Relay error:', err);
					webview.postMessage({ type: 'Error', data: err.message });
				}
			} else if (e.message.command === 'ui-ready') {
				const greeting = await client.getInitialGreeting();
				if (greeting) {
					webview.postMessage({ type: 'ChatUpdate', data: { role: 'magy', content: greeting } });
				}
			}
		}));
	}

	private _getHtml(sessionToken: string, cspSource: string): string {
		const styleUri = asWebviewUri(FileAccess.asFileUri('vs/workbench/contrib/chat/browser/media/magy/style.css'));
		const scriptUri = asWebviewUri(FileAccess.asFileUri('vs/workbench/contrib/chat/browser/media/magy/app.js'));

		return `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https:; script-src ${cspSource} 'unsafe-inline'; style-src ${cspSource} 'unsafe-inline';">
				<title>Magy</title>
				<link rel="stylesheet" href="${styleUri}">
				<script>
					window.MAGY_SESSION_TOKEN = "${sessionToken}";
				</script>
				<style>
					body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: var(--vscode-sideBar-background); }
				</style>
			</head>
			<body>
				<div id="loading-overlay" class="loading-overlay">
					<div class="loader-m">M</div>
				</div>
				<div id="app" style="display: none;">
					<section id="chat-panel" class="chat-panel">
						<div class="panel-heading">
							<div>
								<p class="eyebrow">MAGY V2</p>
								<h1 id="chat-title">Chat</h1>
							</div>
							<div id="relay-status"><span id="relay-dot" class="status-dot"></span> <span>Relay Ready</span></div>
						</div>
						<div id="chat-feed" class="chat-feed">
							<div class="empty-state">
								<span class="empty-glyph">◌</span>
								<h2>Direct Line Active</h2>
								<p>Type a message below to interact with the relay.</p>
							</div>
						</div>
						<form id="chat-form" class="chat-composer">
							<textarea id="chat-input" rows="1" autocomplete="off" placeholder="Message Magy..."></textarea>
							<button class="button primary" type="submit">Send</button>
						</form>
						<div class="model-badge">GPT-5.6 Luna</div>
					</section>
					<div id="toast-region" class="toast-region"></div>
				</div>
				<script src="${scriptUri}"></script>
			</body>
			</html>
		`;
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}
