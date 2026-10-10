import { vec, scale, length } from './math.js';

export class Input {
    constructor(canvas, renderer, vehicle, command) {
        this.keys = new Set();
        this.pointers = new Map();
        this.tool = 'force';
        this.gain = 1.625; // Midpoint of the former 0.25–3 sensitivity range.
        this.drag = null;
        this.impulses = [];
        this.enabled = true;
        const shortcuts = {
            Digit1: 'car',
            Digit2: 'ship',
            Digit3: 'brick',
            KeyR: 'reset',
            KeyP: 'pause',
            KeyG: 'gravity',
            KeyB: 'barrier',
            KeyZ: 'dead-zone',
            KeyX: 'speed-zoom',
            KeyF: 'fullscreen',
            KeyT: 'force',
            KeyI: 'impulse',
            KeyH: 'inputs',
        };
        const movement = [
            'KeyW',
            'KeyA',
            'KeyS',
            'KeyD',
            'ArrowUp',
            'ArrowDown',
            'ArrowLeft',
            'ArrowRight',
            'Space',
        ];
        window.addEventListener('keydown', (e) => {
            if (
                e.target.matches('input,select,textarea,[contenteditable]') ||
                (e.target.matches('button') && e.code === 'Space') ||
                e.ctrlKey ||
                e.metaKey ||
                e.altKey
            )
                return;
            if (movement.includes(e.code) || shortcuts[e.code]) e.preventDefault();
            this.keys.add(e.code);
            if (!e.repeat && shortcuts[e.code]) command(shortcuts[e.code]);
            this.onChange?.();
        });
        window.addEventListener('keyup', (e) => {
            this.keys.delete(e.code);
            this.onChange?.();
        });
        window.addEventListener('blur', () => this.clear());
        const pointer = (e) => {
            const r = canvas.getBoundingClientRect();
            return vec(e.clientX - r.left, e.clientY - r.top);
        };
        const update = (e) => {
            if (!this.drag || this.drag.id !== e.pointerId) return;
            const p = pointer(e),
                start = this.drag.start;
            let delta = vec(p.x - start.x, -(p.y - start.y));
            if (length(delta) > 250) delta = scale(delta, 250 / length(delta));
            this.drag.delta = delta;
        };
        canvas.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            canvas.focus();
            if (this.drag || !this.enabled || vehicle.mode !== 'brick') return;
            const start = pointer(e);
            const local = vehicle.body.toLocal(renderer.screenToWorld(start));
            if (!vehicle.shell.contains(local)) return;
            canvas.setPointerCapture(e.pointerId);
            this.drag = { id: e.pointerId, start, local, delta: vec() };
        });
        canvas.addEventListener('pointermove', update);
        canvas.addEventListener('pointerup', (e) => {
            if (!this.drag || this.drag.id !== e.pointerId) return;
            update(e);
            if (this.tool === 'impulse') this.impulses.push(this.arrow());
            this.drag = null;
        });
        canvas.addEventListener('pointercancel', () => {
            this.drag = null;
        });
        canvas.addEventListener('lostpointercapture', () => {
            this.drag = null;
        });
    }
    clear() {
        this.keys.clear();
        this.pointers.clear();
        this.drag = null;
        this.impulses.length = 0;
        this.onChange?.();
    }
    bindControls(container, canvas) {
        const buttons = [...container.querySelectorAll('[data-control]')];
        const update = (e) => {
            if (!this.enabled || !this.pointers.has(e.pointerId)) return;
            const hit = buttons.find((button) => {
                const r = button.getBoundingClientRect();
                return (
                    e.clientX >= r.left &&
                    e.clientX < r.right &&
                    e.clientY >= r.top &&
                    e.clientY < r.bottom
                );
            });
            // Gaps clear the active action, but retain the pointer so it can slide back
            // onto a control or move directly to another one before release.
            const action = hit?.dataset.control ?? null;
            if (this.pointers.get(e.pointerId) !== action) {
                this.pointers.set(e.pointerId, action);
                this.onChange?.();
            }
        };
        for (const button of buttons) {
            button.addEventListener('pointerdown', (e) => {
                if (e.button !== 0 || !this.enabled) return;
                e.preventDefault();
                canvas.focus({ preventScroll: true });
                button.setPointerCapture(e.pointerId);
                this.pointers.set(e.pointerId, button.dataset.control);
                this.onChange?.();
            });
            const release = (e) => {
                this.pointers.delete(e.pointerId);
                this.onChange?.();
            };
            button.addEventListener('pointermove', update);
            button.addEventListener('pointerup', release);
            button.addEventListener('pointercancel', release);
            button.addEventListener('lostpointercapture', release);
            button.addEventListener('contextmenu', (e) => e.preventDefault());
        }
    }
    controlState() {
        const pressed = (action, ...keys) =>
            this.enabled &&
            (keys.some((key) => this.keys.has(key)) ||
                [...this.pointers.values()].includes(action));
        return {
            left: pressed('left', 'KeyA', 'ArrowLeft'),
            right: pressed('right', 'KeyD', 'ArrowRight'),
            accel: pressed('accel', 'KeyW', 'ArrowUp'),
            decel: pressed('decel', 'KeyS', 'ArrowDown'),
            action: pressed('action', 'Space'),
        };
    }
    arrow() {
        return this.drag
            ? { local: this.drag.local, vector: scale(this.drag.delta, 40 * this.gain) }
            : null;
    }
    sample() {
        const state = this.controlState();
        return {
            throttle: Number(state.accel) - Number(state.decel),
            turn: Number(state.left) - Number(state.right),
            handbrake: state.action,
            boost: state.action,
            force: this.tool === 'force' ? this.arrow() : null,
        };
    }
}
