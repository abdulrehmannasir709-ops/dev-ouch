const vscode = require('vscode');

const ACTIVE_SOUND_KEY = 'devOuch.activeSound';
const AUDIO_ENABLED_KEY = 'devOuch.audioEnabled';
const DEFAULT_SOUND = 'angry-aaah.mp3';
const ERROR_DEBOUNCE_MS = 2000;

const COMMAND_IDS = [
  'devOuch.selectSound',
  'devOuch.playSound',
  'devOuch.enableAudio',
  'devOuch.angryAaah',
  'devOuch.faah',
  'devOuch.thud'
];

const ERROR_PATTERNS = [
  'command not found',
  'not recognized',
  'no such file or directory',
  'npm err!',
  'permission denied',
  'fatal',
  'failed',
  'error:'
];

const SOUNDS = [
  { label: 'Angry Aaah', filename: 'angry-aaah.mp3' },
  { label: 'Faah', filename: 'faah.mp3' },
  { label: 'Thud', filename: 'thud.mp3' }
];

let lastErrorPlayAt = 0;
let soundPanel;
let audioEnabled = false;

function getActiveSound(context) {
  return context.globalState.get(ACTIVE_SOUND_KEY, DEFAULT_SOUND);
}

async function setActiveSound(context, filename) {
  await context.globalState.update(ACTIVE_SOUND_KEY, filename);
}

function getAudioHtml(webview) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src ${webview.cspSource}; script-src 'unsafe-inline'; style-src 'unsafe-inline';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Dev Ouch Audio</title>
  <style>
    body { font-family: sans-serif; padding: 12px; color: #ddd; background: #1e1e1e; }
    button { padding: 8px 12px; border: 0; border-radius: 6px; cursor: pointer; }
    p { font-size: 12px; opacity: 0.9; }
  </style>
</head>
<body>
  <button id="enable">Enable Audio</button>
  <p>Click once so Dev Ouch can play sounds on errors.</p>
  <audio id="player" preload="auto"></audio>
  <script>
    const vscode = acquireVsCodeApi();
    const audio = document.getElementById('player');
    let unlocked = false;

    document.getElementById('enable').addEventListener('click', async () => {
      try {
        audio.src = '';
        await audio.play().catch(() => {});
      } catch (_e) {}
      unlocked = true;
      vscode.postMessage({ type: 'audio-enabled' });
    });

    window.addEventListener('message', async (event) => {
      const msg = event && event.data;
      if (!msg || msg.type !== 'play' || !msg.src) {
        return;
      }

      if (!unlocked) {
        vscode.postMessage({ type: 'playback-error', error: 'audio not enabled yet' });
        return;
      }

      audio.src = msg.src;
      audio.load();
      try {
        await audio.play();
        vscode.postMessage({ type: 'playback-ok' });
      } catch (error) {
        vscode.postMessage({
          type: 'playback-error',
          error: String(error && error.message ? error.message : error)
        });
      }
    });
  </script>
</body>
</html>`;
}

function ensureSoundPanel(context, output) {
  if (soundPanel) {
    return soundPanel;
  }

  soundPanel = vscode.window.createWebviewPanel(
    'devOuchSoundPlayer',
    'Dev Ouch Audio',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: true }
  );

  soundPanel.webview.html = getAudioHtml(soundPanel.webview);
  soundPanel.onDidDispose(() => {
    soundPanel = undefined;
    audioEnabled = false;
    context.globalState.update(AUDIO_ENABLED_KEY, false);
    output.appendLine('[dev-ouch] audio panel closed; audio requires enable again');
  });

  soundPanel.webview.onDidReceiveMessage(async (message) => {
    if (!message) {
      return;
    }

    if (message.type === 'audio-enabled') {
      audioEnabled = true;
      await context.globalState.update(AUDIO_ENABLED_KEY, true);
      output.appendLine('[dev-ouch] audio enabled by user gesture');
      vscode.window.showInformationMessage('Dev Ouch audio is enabled.');
      return;
    }

    if (message.type === 'playback-ok') {
      output.appendLine('[dev-ouch] playback ok');
      return;
    }

    if (message.type === 'playback-error') {
      output.appendLine(`[dev-ouch] playback failed: ${message.error}`);
    }
  });

  return soundPanel;
}

function showEnableAudioPrompt(context, output) {
  output.appendLine('[dev-ouch] audio is not enabled; prompting user');
  vscode.window
    .showWarningMessage('Dev Ouch needs one click to enable audio playback.', 'Enable Audio')
    .then((picked) => {
      if (picked === 'Enable Audio') {
        const panel = ensureSoundPanel(context, output);
        panel.reveal(vscode.ViewColumn.Beside, true);
      }
    });
}

function playSoundFile(context, filename, output, source) {
  if (!audioEnabled) {
    showEnableAudioPrompt(context, output);
    return;
  }

  const panel = ensureSoundPanel(context, output);
  const audioUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', filename));

  output.appendLine(`[dev-ouch] ${source} play: ${filename}`);
  panel.webview.postMessage({ type: 'play', src: audioUri.toString() });
}

function shouldTreatAsError(commandLine, exitCode) {
  if (typeof exitCode === 'number' && exitCode !== 0) {
    return true;
  }

  if (!commandLine) {
    return false;
  }

  const lower = String(commandLine).toLowerCase();
  return ERROR_PATTERNS.some((pattern) => lower.includes(pattern));
}

function tryPlayOnTerminalError(context, output, commandLine, exitCode) {
  if (!shouldTreatAsError(commandLine, exitCode)) {
    return;
  }

  const now = Date.now();
  if (now - lastErrorPlayAt < ERROR_DEBOUNCE_MS) {
    output.appendLine('[dev-ouch] skipped by 2s debounce');
    return;
  }

  lastErrorPlayAt = now;
  output.appendLine('[dev-ouch] terminal error detected');
  playSoundFile(context, getActiveSound(context), output, 'terminal-trigger');
}

async function verifyCommandsRegistered(output) {
  const registered = await vscode.commands.getCommands(true);
  const missing = COMMAND_IDS.filter((id) => !registered.includes(id));
  if (missing.length > 0) {
    output.appendLine(`[dev-ouch] missing command registrations: ${missing.join(', ')}`);
    throw new Error(`Dev Ouch commands missing: ${missing.join(', ')}`);
  }
  output.appendLine('[dev-ouch] command registration verified');
}

function registerTerminalMonitoring(context, output) {
  const onDidEnd = vscode.window.onDidEndTerminalShellExecution;
  if (typeof onDidEnd !== 'function') {
    output.appendLine('[dev-ouch] warning: terminal shell execution API unavailable');
    output.appendLine('[dev-ouch] continuing without terminal monitoring');
    return;
  }

  const disposable = onDidEnd((event) => {
    const exitCode = typeof event.exitCode === 'number' ? event.exitCode : undefined;
    const commandLine =
      event &&
      event.execution &&
      event.execution.commandLine &&
      typeof event.execution.commandLine.value === 'string'
        ? event.execution.commandLine.value
        : '';

    tryPlayOnTerminalError(context, output, commandLine, exitCode);
  });

  context.subscriptions.push(disposable);
  output.appendLine('[dev-ouch] terminal listener registration complete');
}

async function activate(context) {
  const output = vscode.window.createOutputChannel('Dev Ouch');
  context.subscriptions.push(output);
  output.appendLine('[dev-ouch] activation start');

  try {
    if (!context.globalState.get(ACTIVE_SOUND_KEY)) {
      await setActiveSound(context, DEFAULT_SOUND);
      output.appendLine(`[dev-ouch] initialized active sound: ${DEFAULT_SOUND}`);
    }

    audioEnabled = context.globalState.get(AUDIO_ENABLED_KEY, false);
    output.appendLine(`[dev-ouch] audio enabled state: ${audioEnabled}`);

    const selectSoundCommand = vscode.commands.registerCommand('devOuch.selectSound', async () => {
      const items = SOUNDS.map((sound) => ({
        label: sound.label,
        description: sound.filename,
        filename: sound.filename
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a Dev Ouch sound'
      });
      if (!selected) {
        return;
      }

      await setActiveSound(context, selected.filename);
      vscode.window.showInformationMessage(`Dev Ouch active sound set to ${selected.label}.`);
      output.appendLine(`[dev-ouch] active sound set: ${selected.filename}`);
    });

    const enableAudioCommand = vscode.commands.registerCommand('devOuch.enableAudio', () => {
      const panel = ensureSoundPanel(context, output);
      panel.reveal(vscode.ViewColumn.Beside, true);
      output.appendLine('[dev-ouch] opened enable-audio panel');
    });

    const playSoundCommand = vscode.commands.registerCommand('devOuch.playSound', () => {
      playSoundFile(context, getActiveSound(context), output, 'manual');
    });

    const angryAaahCommand = vscode.commands.registerCommand('devOuch.angryAaah', async () => {
      await setActiveSound(context, 'angry-aaah.mp3');
      playSoundFile(context, 'angry-aaah.mp3', output, 'preset-angryAaah');
    });

    const faahCommand = vscode.commands.registerCommand('devOuch.faah', async () => {
      await setActiveSound(context, 'faah.mp3');
      playSoundFile(context, 'faah.mp3', output, 'preset-faah');
    });

    const thudCommand = vscode.commands.registerCommand('devOuch.thud', async () => {
      await setActiveSound(context, 'thud.mp3');
      playSoundFile(context, 'thud.mp3', output, 'preset-thud');
    });

    context.subscriptions.push(
      selectSoundCommand,
      enableAudioCommand,
      playSoundCommand,
      angryAaahCommand,
      faahCommand,
      thudCommand
    );

    output.appendLine('[dev-ouch] command registration complete');
    await verifyCommandsRegistered(output);
    registerTerminalMonitoring(context, output);
    output.appendLine('[dev-ouch] activation success');
  } catch (error) {
    const message = String(error && error.message ? error.message : error);
    output.appendLine(`[dev-ouch] activation failure: ${message}`);
    vscode.window.showErrorMessage('Dev Ouch failed to activate. Open Output -> Dev Ouch for details.');
  }
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
