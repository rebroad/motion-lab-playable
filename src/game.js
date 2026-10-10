import { bounceInside } from './physics.js';
import { vec } from './math.js';

export class FixedClock {
    constructor(step = 1 / 120, maxSteps = 12) {
        this.step = step;
        this.maxSteps = maxSteps;
        this.reset();
    }
    reset() {
        this.last = null;
        this.accumulator = 0;
        this.dropped = 0;
    }
    advance(timestamp, update) {
        if (this.last === null) {
            this.last = timestamp;
            return 0;
        }
        const elapsed = Math.max(0, (timestamp - this.last) / 1000);
        this.last = timestamp;
        const accepted = Math.min(elapsed, this.step * this.maxSteps);
        this.dropped += elapsed - accepted;
        this.accumulator += accepted;
        let steps = 0;
        while (this.accumulator + 1e-12 >= this.step && steps < this.maxSteps) {
            update(this.step);
            this.accumulator = Math.max(0, this.accumulator - this.step);
            steps++;
        }
        return steps;
    }
}

export class Game {
    constructor(vehicle, input, renderer, report) {
        Object.assign(this, { vehicle, input, renderer, report });
        this.clock = new FixedClock();
        this.paused = false;
        this.running = false;
        this.resetFps();
        this.gravity = false;
        this.barrier = false;
        this.gravityAcceleration = 3; // Gentle enough for the 5 m/s² ship thrust to lift.
        this.terminalSpeed = 30; // m/s for an unpowered body with no other drag.
        document.addEventListener('visibilitychange', () => {
            this.clock.reset();
            this.resetFps();
            input.clear();
        });
        window.addEventListener('blur', () => this.clock.reset());
    }
    resetFps() {
        this.fps = null;
        this.fpsStart = null;
        this.fpsFrames = 0;
    }
    updateFps(timestamp) {
        if (this.fpsStart === null) {
            this.fpsStart = timestamp;
            return;
        }
        this.fpsFrames++;
        const elapsed = timestamp - this.fpsStart;
        if (elapsed >= 500) {
            this.fps = (this.fpsFrames * 1000) / elapsed;
            this.fpsFrames = 0;
            this.fpsStart = timestamp;
        }
    }
    setPaused(value) {
        this.paused = value;
        this.input.enabled = !value;
        this.input.clear();
        this.clock.reset();
    }
    setGravity(value) {
        this.gravity = value;
        this.input.clear();
    }
    setBarrier(value) {
        this.barrier = value;
        this.renderer.fixedCamera = value;
    }
    step(dt) {
        const body = this.vehicle.body;
        for (const impulse of this.input.impulses.splice(0)) {
            body.applyImpulse(impulse.vector, body.toWorld(impulse.local));
        }
        if (this.gravity) {
            // Linear atmospheric drag opposes translation in both directions.
            // Gravity and drag balance at terminalSpeed in an unpowered fall.
            const drag = (body.mass * this.gravityAcceleration) / this.terminalSpeed;
            body.addForce(
                vec(
                    -drag * body.velocity.x,
                    -body.mass * this.gravityAcceleration - drag * body.velocity.y,
                ),
            );
        }
        this.vehicle.update(this.input.sample(), dt);
        if (this.barrier) {
            bounceInside(body, this.renderer.bounds(), (n) => this.vehicle.supportPoint(n));
        }
        this.renderer.updateTrail(this.vehicle, dt);
        this.renderer.updateSkids(this.vehicle, dt);
    }
    start() {
        if (this.running) return;
        this.running = true;
        this.resetFps();
        let lastReport = -Infinity;
        const frame = (timestamp) => {
            if (!this.running) return;
            if (!document.hidden) this.updateFps(timestamp);
            if (!this.paused && !document.hidden)
                this.clock.advance(timestamp, (dt) => this.step(dt));
            this.renderer.render(this.vehicle, this.input);
            if (timestamp - lastReport >= 100) {
                this.report();
                lastReport = timestamp;
            }
            this.frameId = requestAnimationFrame(frame);
        };
        this.frameId = requestAnimationFrame(frame);
    }
    stop() {
        this.running = false;
        cancelAnimationFrame(this.frameId);
        this.clock.reset();
    }
}
