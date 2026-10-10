import { bindButtonActivation } from './button-activation.js';
// Capability-based controls and HUD. Physics consumes only Input.sample().
export class InputPresentation {
    constructor(input, game, command) {
        this.input = input;
        this.game = game;
        this.mode = 'car';
        this.touchSeen = false;
        this.coarsePointer = matchMedia('(any-pointer: coarse)');
        this.canvas = document.querySelector('#game');
        this.controls = document.querySelector('#touch-controls');
        this.hud = document.querySelector('#input-hud');
        this.hudEnabled = new URLSearchParams(location.search).get('inputs') === '1';
        this.choice = document.querySelector('#touch-layout');
        input.bindControls(this.controls, this.canvas);
        input.onChange = () => this.render();
        // Blur pointer-activated settings after release so game keys work again.
        let pointerFocusedSetting = null;
        document.addEventListener(
            'pointerdown',
            (event) => {
                pointerFocusedSetting =
                    event.target instanceof Element
                        ? event.target.closest('#settings button, #settings input')
                        : null;
            },
            { capture: true },
        );
        const releaseSettingFocus = () => {
            const control = pointerFocusedSetting;
            pointerFocusedSetting = null;
            if (control) {
                requestAnimationFrame(() => {
                    if (document.activeElement === control) control.blur();
                });
            }
        };
        window.addEventListener('pointerup', releaseSettingFocus, { capture: true });
        window.addEventListener('pointercancel', releaseSettingFocus, { capture: true });
        this.coarsePointer.addEventListener('change', () => this.updateCapabilities());
        window.addEventListener(
            'pointerdown',
            (e) => {
                if (e.pointerType === 'touch' && !this.touchSeen) {
                    this.touchSeen = true;
                    this.updateCapabilities();
                }
            },
            { capture: true },
        );
        this.choice.addEventListener('change', () => {
            input.clear();
            this.updateCapabilities();
        });
        bindButtonActivation(document.querySelector('#inputs-toggle'), () => {
            command('inputs');
            this.canvas.focus({ preventScroll: true });
        });
        bindButtonActivation(document.querySelector('#settings-toggle'), () => {
            const open = document.body.classList.toggle('settings-open');
            document.querySelector('#settings-toggle').setAttribute('aria-expanded', String(open));
            input.clear();
        });
        document.addEventListener(
            'pointerdown',
            (event) => {
                const settings = document.querySelector('#settings');
                const settingsToggle = document.querySelector('#settings-toggle');
                if (
                    !matchMedia('(max-width: 1000px), (max-height: 600px)').matches ||
                    !document.body.classList.contains('settings-open') ||
                    settings.contains(event.target) ||
                    settingsToggle.contains(event.target)
                )
                    return;
                document.body.classList.remove('settings-open');
                settingsToggle.setAttribute('aria-expanded', 'false');
                input.clear();
            },
            { capture: true },
        );
        bindButtonActivation(document.querySelector('#resume'), () => {
            if (game.paused) command('pause');
            this.canvas.focus({ preventScroll: true });
        });
        const fullscreenToggle = document.querySelector('#fullscreen-toggle');
        const fullscreenStatus = document.querySelector('#fullscreen-status');
        const syncFullscreen = () => {
            const supported =
                document.fullscreenEnabled &&
                document.documentElement.requestFullscreen &&
                document.exitFullscreen;
            const active = Boolean(document.fullscreenElement);
            fullscreenToggle.disabled = !supported;
            fullscreenToggle.querySelector('span').textContent = 'Fullscreen';
            fullscreenToggle.setAttribute('aria-pressed', String(active));
            fullscreenToggle.setAttribute('aria-label', 'Fullscreen · F');
            fullscreenToggle.title = supported
                ? ''
                : 'This browser or connection does not allow fullscreen for this page.';
        };
        this.toggleFullscreen = async () => {
            try {
                if (document.fullscreenElement) {
                    await document.exitFullscreen();
                } else {
                    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
                    if (matchMedia('(max-width: 1000px), (max-height: 600px)').matches) {
                        document.body.classList.remove('settings-open');
                        document
                            .querySelector('#settings-toggle')
                            .setAttribute('aria-expanded', 'false');
                        input.clear();
                    }
                }
                fullscreenStatus.textContent = '';
            } catch {
                fullscreenStatus.textContent =
                    'Fullscreen could not be started. Your browser may not allow it for this page.';
            }
        };
        bindButtonActivation(fullscreenToggle, this.toggleFullscreen);
        document.addEventListener('fullscreenchange', syncFullscreen);
        syncFullscreen();
        this.updateCapabilities();
    }
    updateCapabilities() {
        const detected =
            this.coarsePointer.matches || navigator.maxTouchPoints > 0 || this.touchSeen;
        const enabled = this.choice.value === 'on' || (this.choice.value === 'auto' && detected);
        document.body.classList.toggle('touch-enabled', enabled);
        this.touchEnabled = enabled;
        this.render();
    }
    toggleHud() {
        this.hudEnabled = !this.hudEnabled;
        this.render();
    }
    setMode(mode) {
        this.mode = mode;
        const action = mode === 'ship' ? 'Boost' : 'Handbrake';
        this.controls.querySelector('[data-control="action"]').textContent = action;
        this.hud.querySelector('[data-indicator="action"]').textContent = action;
        this.render();
    }
    render() {
        const state = this.input.controlState();
        for (const button of this.controls.querySelectorAll('[data-control]')) {
            button.classList.toggle('active', state[button.dataset.control]);
            button.setAttribute('aria-pressed', String(state[button.dataset.control]));
        }
        for (const indicator of this.hud.querySelectorAll('[data-indicator]')) {
            indicator.classList.toggle('active', state[indicator.dataset.indicator]);
        }
        this.controls.hidden = this.mode === 'brick';
        this.hud.hidden = !this.hudEnabled || this.mode === 'brick';
        const toggle = document.querySelector('#inputs-toggle');
        toggle.setAttribute('aria-pressed', String(this.hudEnabled));
        document.querySelector('#pause-overlay').hidden = !this.game.paused;
    }
}
