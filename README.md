# Dev Ouch

Dev Ouch plays a sound when terminal commands fail.

## Features

- Detects terminal command failures.
- Plays your selected sound.
- 2-second debounce to avoid repeated spam.
- Manual commands to test/change sound quickly.

## Sounds

- Angry Aaah (`media/angry-aaah.mp3`)
- Faah (`media/faah.mp3`)
- Thud (`media/thud.mp3`)

## First-Time Setup (Important)

Because browsers/webviews block autoplay, users must unlock audio once:

1. Open Command Palette (`Ctrl+Shift+P`).
2. Run `Dev Ouch: Enable Audio`.
3. Click the **Enable Audio** button in the Dev Ouch Audio panel.

After that, Dev Ouch can play sounds on terminal failures in that session.

## Usage

1. Open the integrated terminal.
2. Run a command.
3. If command fails (non-zero exit), Dev Ouch plays the active sound.

## Commands

- `Dev Ouch: Enable Audio`
- `Dev Ouch: Select Sound`
- `Dev Ouch: Play Active Sound`
- `Dev Ouch: Activate Angry Aaah`
- `Dev Ouch: Activate Faah`
- `Dev Ouch: Activate Thud`

## Notes

- Dev Ouch listens to stable terminal shell execution events.
- It is Marketplace-safe (no proposed API dependency).
