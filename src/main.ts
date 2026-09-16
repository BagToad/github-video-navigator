import './styles.css';
import { demoSource, exampleMarkdown } from './demo';
import { copyText, element, showMessage } from './dom';
import { errorMessage, NavigatorError } from './errors';
import { loadSource } from './github';
import { paintIcon, paintIcons } from './icons';
import { Player } from './player';
import {
  parseSourceUrl,
  readLocation,
  removeUrlCredentials,
  type SourceReference,
} from './urls';

paintIcons();

const player = new Player();
const sourceInput = element<HTMLInputElement>('source-url');
const tokenInput = element<HTMLInputElement>('github-token');
const errorPanel = element('error-panel');
let token = '';
let controller: AbortController | undefined;
let requestId = 0;

function setLoading(loading: boolean): void {
  document.documentElement.classList.toggle(
    'has-recording',
    player.loaded || loading,
  );
  element<HTMLButtonElement>('open-video').disabled = loading;
  element('cancel-load').hidden = !loading;
  element('loading-state').hidden = !loading;
  element('source-form').setAttribute('aria-busy', String(loading));
  element('landing-view').hidden = player.loaded || loading;
  element('workspace').hidden = !player.loaded || loading;
}

function focusRecording(): void {
  element('recording-title').focus({ preventScroll: true });
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
}

function cancelRequest(): void {
  requestId++;
  controller?.abort();
  controller = undefined;
  setLoading(false);
}

async function openSource(
  reference: SourceReference,
  selection = 1,
  time = 0,
  push = true,
): Promise<void> {
  cancelRequest();
  const id = requestId;
  controller = new AbortController();
  const signal = controller.signal;
  player.reset();
  sourceInput.value = reference.url;
  showMessage(errorPanel, '');
  setLoading(true);
  try {
    const source = await loadSource(reference, {
      token,
      signal,
      progress: (message) => {
        if (id === requestId) element('load-status').textContent = message;
      },
    });
    if (id !== requestId || signal.aborted) return;
    player.open(source, false, selection, time);
    element('load-status').textContent = '';
    if (push) history.pushState(null, '', player.link(time));
    else history.replaceState(null, '', player.link(time));
  } catch (error) {
    if (id !== requestId || signal.aborted) return;
    showMessage(errorPanel, errorMessage(error));
    element('load-status').textContent = '';
  } finally {
    if (id === requestId) {
      controller = undefined;
      setLoading(false);
      if (player.loaded) focusRecording();
    }
  }
}

function openDemo(selection = 1, time = 0, push = true): void {
  cancelRequest();
  showMessage(errorPanel, '');
  element('load-status').textContent = '';
  player.open(demoSource(), true, selection, time);
  setLoading(false);
  if (push) history.pushState(null, '', player.link(time));
  else history.replaceState(null, '', player.link(time));
  focusRecording();
}

function restoreLocation(): void {
  cancelRequest();
  player.reset();
  setLoading(false);
  showMessage(errorPanel, '');
  document.title = 'Video navigator';
  const url = new URL(window.location.href);
  if (removeUrlCredentials(url)) {
    history.replaceState(null, '', url.href);
    showMessage(
      errorPanel,
      'Tokens in URLs are not supported and have been removed. Revoke any token that was placed in a URL, then use GitHub access to enter a replacement securely.',
    );
    return;
  }
  try {
    const state = readLocation(url);
    if (state.source) {
      void openSource(state.source, state.video, state.time, false);
    } else if (state.demo) {
      openDemo(state.video, state.time, false);
    } else {
      sourceInput.value = '';
      element('load-status').textContent = '';
    }
  } catch (error) {
    showMessage(errorPanel, errorMessage(error));
  }
}

element('source-form').addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    void openSource(parseSourceUrl(sourceInput.value));
  } catch (error) {
    showMessage(errorPanel, errorMessage(error));
    sourceInput.focus();
  }
});

element('cancel-load').addEventListener('click', () => {
  cancelRequest();
  element('load-status').textContent = 'Loading cancelled.';
});

element('load-demo').addEventListener('click', () => openDemo());

function updateTokenState(): void {
  const state = element('access-state');
  state.textContent = token ? 'Active in this tab' : 'Optional';
  state.classList.toggle('active', Boolean(token));
  element<HTMLButtonElement>('clear-token').disabled = !token;
}

element('token-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const value = tokenInput.value.trim();
  if (
    value.length < 8 ||
    value.length > 4096 ||
    /[\u0000-\u0020\u007f]/.test(value)
  ) {
    element('token-status').textContent =
      'Enter a valid token without spaces or control characters.';
    tokenInput.focus();
    return;
  }
  cancelRequest();
  token = value;
  tokenInput.value = '';
  updateTokenState();
  element('token-status').textContent =
    'Token set for this tab. Open a GitHub link to use it. Clear it here or reload the page to remove it.';
  element('load-status').textContent = '';
});

element('clear-token').addEventListener('click', () => {
  cancelRequest();
  token = '';
  tokenInput.value = '';
  updateTokenState();
  element('token-status').textContent =
    'Token cleared. Further API requests will be unauthenticated.';
  element('load-status').textContent = '';
});

const themeModes = ['auto', 'light', 'dark'] as const;
const themeNames = { auto: 'system', light: 'light', dark: 'dark' };
const themeIcons = { auto: 'device-desktop', light: 'sun', dark: 'moon' };
let themeIndex = 0;
element('theme-toggle').addEventListener('click', () => {
  themeIndex = (themeIndex + 1) % themeModes.length;
  const mode = themeModes[themeIndex] ?? 'auto';
  const next = themeModes[(themeIndex + 1) % themeModes.length] ?? 'auto';
  document.documentElement.dataset.colorMode = mode;
  const button = element('theme-toggle');
  button.setAttribute(
    'aria-label',
    `Theme: ${themeNames[mode]}. Switch to ${themeNames[next]} theme`,
  );
  button.title = `Theme: ${themeNames[mode]}`;
  const icon = button.querySelector<HTMLElement>('.icon-slot');
  if (icon) paintIcon(icon, themeIcons[mode]);
});

element('metadata-example').textContent = exampleMarkdown;
element('open-guide').addEventListener('click', () => {
  element<HTMLDialogElement>('guide-dialog').showModal();
});
element('copy-example').addEventListener('click', () => {
  void copyText(exampleMarkdown).then((copied) => {
    element('example-status').textContent = copied
      ? 'Example copied. Replace the video URL and timestamps with your recording.'
      : 'Automatic copy is unavailable. Select the example text and copy it manually.';
  });
});
element('copy-skill-command').addEventListener('click', () => {
  const command = element('skill-install-command').textContent?.trim();
  const status = element('skill-install-status');
  if (!command) {
    status.textContent =
      'The install command is unavailable. Open the skill instructions instead.';
    return;
  }
  void copyText(command).then((copied) => {
    status.textContent = copied
      ? 'Command copied.'
      : 'Automatic copy is unavailable. Select the command and copy it manually.';
  });
});
for (const button of document.querySelectorAll<HTMLButtonElement>(
  '[data-close-dialog]',
)) {
  button.addEventListener('click', () => button.closest('dialog')?.close());
}

window.addEventListener('popstate', restoreLocation);
window.addEventListener('pagehide', () => {
  token = '';
  tokenInput.value = '';
  updateTokenState();
  cancelRequest();
  player.reset();
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) restoreLocation();
});
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason instanceof NavigatorError) {
    event.preventDefault();
    showMessage(errorPanel, event.reason.message);
  }
});

restoreLocation();
