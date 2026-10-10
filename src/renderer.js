import { vec, add, sub, rotate, scale, length } from './math.js';
import { BARRIER_INSET_PX } from './constants.js';

const MIN_BASE_ZOOM = 1;
const COMPACT_VIEWPORT_BREAKPOINT_PX = 600;
const COMPACT_VIEWPORT_MAX_ZOOM = 32;
const REGULAR_VIEWPORT_MAX_ZOOM = 28;
const RESIZE_MARGIN_PX = 32;
const RESIZE_REFERENCE_SPAN_M = 10;
const GRID_CELL_SIZE_M = 5;
const MIN_VISIBLE_GRID_CELLS = 5;

export class CanvasRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.zoom = 28;
        this.baseZoom = 28;
        this.velocityZoomFactor = 1;
        this.maxVelocityZoomOut = 0.5;
        this.velocityZoomStartSpeed = 3;
        this.velocityZoomFullSpeed = 20;
        this.zoomRate = 4;
        this.speedHistoryWindow = 1000;
        this.speedHistory = [];
        this.camera = vec();
        this.cameraDeadZone = 0.18;
        this.deadZoneEnabled = true;
        this.speedZoomEnabled = true;
        this.cameraFollowRate = 16;
        this.cameraTimestamp = null;
        this.width = 0;
        this.height = 0;
        this.fixedCamera = false;
        this.resize();
        if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(() => this.resize());
            this.resizeObserver.observe(canvas);
        }
        this.trailLifetime = 12;
        this.clearTrail();
        this.skidLifetime = 10;
        this.clearSkids();
    }
    clearSkids() {
        this.skidMarks = [];
        this.skidPrevious = new Map();
        this.skidOwner = null;
    }
    updateSkids(vehicle, dt) {
        for (const mark of this.skidMarks) mark.age += dt;
        this.skidMarks = this.skidMarks.filter((mark) => mark.age < this.skidLifetime);
        if (vehicle.mode !== 'car' || this.skidOwner !== vehicle.dynamics) {
            this.skidPrevious.clear();
            this.skidOwner = vehicle.mode === 'car' ? vehicle.dynamics : null;
        }
        if (vehicle.mode !== 'car') return;
        for (const tyre of vehicle.dynamics.tyres.filter((t) => !t.steered)) {
            const position = vehicle.body.toWorld(tyre.position);
            const previous = this.skidPrevious.get(tyre);
            if (
                tyre.skidding &&
                previous?.skidding &&
                length(sub(position, previous.position)) > 0.001
            ) {
                this.skidMarks.push({ from: previous.position, to: position, age: 0 });
            }
            this.skidPrevious.set(tyre, { position, skidding: tyre.skidding });
        }
        if (this.skidMarks.length > 2600) this.skidMarks.splice(0, this.skidMarks.length - 2600);
    }
    drawSkids() {
        const c = this.ctx;
        c.save();
        c.lineWidth = 3;
        c.lineCap = 'round';
        for (const mark of this.skidMarks) {
            c.globalAlpha = 0.8 * (1 - mark.age / this.skidLifetime);
            this.line(mark.from, mark.to, '#f28a72');
        }
        c.restore();
    }
    clearTrail() {
        this.trail = [];
        this.trailClock = 0;
        this.lastTrailPosition = null;
    }
    setTrailLifetime(seconds) {
        this.trailLifetime = seconds;
        if (seconds <= 0) this.clearTrail();
        else this.trail = this.trail.filter((p) => p.age < seconds);
    }
    updateTrail(vehicle, dt) {
        if (this.trailLifetime <= 0) return;
        // Simulation time keeps emission/fading independent of display refresh
        // and freezes the trail when paused. Copy positions into world space.
        for (const particle of this.trail) particle.age += dt;
        this.trail = this.trail.filter((p) => p.age < this.trailLifetime);
        this.trailClock += dt;
        if (this.trailClock + 1e-10 < 1 / 30) return;
        this.trailClock %= 1 / 30;
        const position = vehicle.body.position;
        if (this.lastTrailPosition && length(sub(position, this.lastTrailPosition)) < 0.04) return;
        this.lastTrailPosition = { ...position };
        this.trail.push({
            position: { ...position },
            color: vehicle.shell.trailColor ?? vehicle.shell.color,
            age: 0,
        });
        if (this.trail.length > 800) this.trail.shift();
    }
    drawTrail() {
        if (this.trailLifetime <= 0) return;
        const c = this.ctx;
        c.save();
        for (const particle of this.trail) {
            const p = this.screen(particle.position);
            if (p.x < -4 || p.x > this.width + 4 || p.y < -4 || p.y > this.height + 4) continue;
            const remaining = 1 - particle.age / this.trailLifetime;
            c.globalAlpha = 0.6 * remaining * remaining;
            c.fillStyle = particle.color;
            c.beginPath();
            c.arc(p.x, p.y, 0.8 + 1.4 * remaining, 0, Math.PI * 2);
            c.fill();
        }
        c.restore();
    }
    resize() {
        const changed =
            this.width !== this.canvas.clientWidth || this.height !== this.canvas.clientHeight;
        this.width = this.canvas.clientWidth;
        this.height = this.canvas.clientHeight;
        const shortSide = Math.min(this.width, this.height);
        const viewportMaxZoom =
            shortSide < COMPACT_VIEWPORT_BREAKPOINT_PX
                ? COMPACT_VIEWPORT_MAX_ZOOM
                : REGULAR_VIEWPORT_MAX_ZOOM;
        // Fit a nominal 10 m span inside the viewport, leaving a 32 px margin.
        const fitZoom = (shortSide - RESIZE_MARGIN_PX) / RESIZE_REFERENCE_SPAN_M;
        this.baseZoom = Math.max(MIN_BASE_ZOOM, Math.min(viewportMaxZoom, fitZoom));

        // Keep at least five grid cells visible across the short axis, including in barrier mode.
        const gridVisibilityZoom = shortSide / (MIN_VISIBLE_GRID_CELLS * GRID_CELL_SIZE_M);
        if (shortSide > 0) this.baseZoom = Math.min(this.baseZoom, gridVisibilityZoom);
        this.zoom = this.baseZoom * this.velocityZoomFactor;
        if (changed) this.onResize?.();
    }
    bounds() {
        // Arena edges share the camera's world-space centre, not the body's.
        const inset = BARRIER_INSET_PX / this.zoom;
        const halfWidth = this.width / (2 * this.zoom) - inset;
        const halfHeight = this.height / (2 * this.zoom) - inset;
        return {
            left: this.camera.x - halfWidth,
            right: this.camera.x + halfWidth,
            bottom: this.camera.y - halfHeight,
            top: this.camera.y + halfHeight,
        };
    }
    screenToWorld(p) {
        return vec(
            this.camera.x + (p.x - this.width / 2) / this.zoom,
            this.camera.y - (p.y - this.height / 2) / this.zoom,
        );
    }
    screen(p) {
        return vec(
            this.width / 2 + (p.x - this.camera.x) * this.zoom,
            this.height / 2 - (p.y - this.camera.y) * this.zoom,
        );
    }
    frameDelta(timestamp) {
        const dt =
            this.cameraTimestamp === null
                ? 1 / 60
                : Math.max(0, Math.min(0.1, (timestamp - this.cameraTimestamp) / 1000));
        this.cameraTimestamp = timestamp;
        return dt;
    }
    updateCamera(position, dt) {
        if (this.fixedCamera) return;
        if (!this.deadZoneEnabled) {
            this.camera = vec(position.x, position.y);
            return;
        }
        const halfWidth = (this.width * this.cameraDeadZone) / this.zoom;
        const halfHeight = (this.height * this.cameraDeadZone) / this.zoom;
        const offsetX = Math.max(-halfWidth, Math.min(halfWidth, position.x - this.camera.x));
        const offsetY = Math.max(-halfHeight, Math.min(halfHeight, position.y - this.camera.y));
        const targetX = position.x - offsetX;
        const targetY = position.y - offsetY;
        const follow = 1 - Math.exp(-this.cameraFollowRate * dt);
        this.camera = vec(
            this.camera.x + (targetX - this.camera.x) * follow,
            this.camera.y + (targetY - this.camera.y) * follow,
        );
    }
    // Time-weight samples over the trailing window to smooth speed-driven zoom.
    averageSpeed(speed, timestamp) {
        const last = this.speedHistory.at(-1);
        if (last && timestamp - last.timestamp > this.speedHistoryWindow) this.speedHistory = [];
        this.speedHistory.push({ timestamp, speed });
        const cutoff = timestamp - this.speedHistoryWindow;
        while (this.speedHistory.length > 2 && this.speedHistory[1].timestamp <= cutoff)
            this.speedHistory.shift();

        let weightedSpeed = 0;
        let elapsed = 0;
        for (let i = 0; i < this.speedHistory.length - 1; i++) {
            const start = Math.max(cutoff, this.speedHistory[i].timestamp);
            const end = Math.min(timestamp, this.speedHistory[i + 1].timestamp);
            if (end <= start) continue;
            const duration = end - start;
            weightedSpeed += this.speedHistory[i].speed * duration;
            elapsed += duration;
        }
        return elapsed > 0 ? weightedSpeed / elapsed : speed;
    }
    updateZoom(position, velocity, dt, timestamp) {
        const speed = this.averageSpeed(length(velocity), timestamp);
        if (this.fixedCamera) return;
        const speedFactor = this.speedZoomEnabled
            ? Math.max(
                  0,
                  Math.min(
                      (speed - this.velocityZoomStartSpeed) /
                          (this.velocityZoomFullSpeed - this.velocityZoomStartSpeed),
                      1,
                  ),
              )
            : 0;
        const targetFactor = 1 - this.maxVelocityZoomOut * speedFactor;
        const blend = 1 - Math.exp(-this.zoomRate * dt);
        this.velocityZoomFactor += (targetFactor - this.velocityZoomFactor) * blend;
        const previousZoom = this.zoom;
        this.zoom = this.baseZoom * this.velocityZoomFactor;
        // Zoom around the body so scale changes do not pull it back on screen.
        const anchor = previousZoom / this.zoom;
        this.camera = vec(
            position.x - (position.x - this.camera.x) * anchor,
            position.y - (position.y - this.camera.y) * anchor,
        );
    }
    line(a, b, color = '#293c46') {
        const c = this.ctx,
            p = this.screen(a),
            q = this.screen(b);
        c.strokeStyle = color;
        c.beginPath();
        c.moveTo(p.x, p.y);
        c.lineTo(q.x, q.y);
        c.stroke();
    }
    arrow(a, b, color) {
        this.line(a, b, color);
        const p = this.screen(a),
            q = this.screen(b),
            angle = Math.atan2(q.y - p.y, q.x - p.x),
            c = this.ctx;
        c.beginPath();
        c.moveTo(q.x - 10 * Math.cos(angle - 0.4), q.y - 10 * Math.sin(angle - 0.4));
        c.lineTo(q.x, q.y);
        c.lineTo(q.x - 10 * Math.cos(angle + 0.4), q.y - 10 * Math.sin(angle + 0.4));
        c.stroke();
    }
    render(vehicle, input, timestamp = performance.now()) {
        const c = this.ctx,
            body = vehicle.body,
            canvas = this.canvas;
        this.resize();
        const dt = this.frameDelta(timestamp);
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = Math.round(this.width * dpr),
            h = Math.round(this.height * dpr);
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
        }
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.clearRect(0, 0, this.width, this.height);
        this.updateCamera(body.position, dt);
        this.updateZoom(body.position, body.velocity, dt, timestamp);
        const left = this.camera.x - this.width / (2 * this.zoom),
            right = this.camera.x + this.width / (2 * this.zoom);
        const bottom = this.camera.y - this.height / (2 * this.zoom),
            top = this.camera.y + this.height / (2 * this.zoom);
        c.lineWidth = 1;
        for (let x = Math.floor(left / 5) * 5; x <= right; x += 5)
            this.line(vec(x, bottom), vec(x, top));
        for (let y = Math.floor(bottom / 5) * 5; y <= top; y += 5)
            this.line(vec(left, y), vec(right, y));
        this.drawTrail();
        this.drawSkids();
        if (this.fixedCamera) {
            c.strokeStyle = '#d4ab71';
            c.lineWidth = 2;
            const bounds = this.bounds();
            const corner = this.screen(vec(bounds.left, bounds.top));
            const opposite = this.screen(vec(bounds.right, bounds.bottom));
            // Draw the barrier centerline on the same bounds used by collisions.
            c.strokeRect(corner.x, corner.y, opposite.x - corner.x, opposite.y - corner.y);
        }
        if (vehicle.mode === 'ship') {
            const shell = vehicle.shell;
            c.lineWidth = 2;
            this.line(
                body.toWorld(add(shell.counterweight, vec(shell.radius, 0))),
                body.toWorld(shell.rodHeadAnchor),
                shell.color,
            );
            const weight = this.screen(body.toWorld(shell.counterweight));
            c.beginPath();
            c.arc(weight.x, weight.y, shell.radius * this.zoom, 0, Math.PI * 2);
            c.fillStyle = shell.color + '15';
            c.fill();
            c.strokeStyle = shell.color;
            c.stroke();
            // Exhaust points opposite to the actual craft-local force.
            const force = vehicle.dynamics.appliedForce;
            if (length(force) > 0) {
                const exhaust = scale(force, -1 / 3000);
                this.line(
                    body.toWorld(shell.craft),
                    body.toWorld(add(shell.craft, exhaust)),
                    '#ffdf93',
                );
            }
        }
        const points = vehicle.worldPoints().map((p) => this.screen(p));
        c.beginPath();
        points.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
        c.closePath();
        c.fillStyle = vehicle.shell.color + '15';
        c.fill();
        c.strokeStyle = vehicle.shell.color;
        c.lineWidth = 2;
        c.stroke();
        if (vehicle.mode === 'car') {
            for (const tyre of vehicle.dynamics.tyres) {
                const half = rotate(vec(0.35, 0), tyre.angle);
                this.line(
                    body.toWorld(add(tyre.position, scale(half, -1))),
                    body.toWorld(add(tyre.position, half)),
                    !tyre.steered &&
                        vehicle.dynamics.rearGripLoss * vehicle.dynamics.handbrakeStrength > 0
                        ? '#ffdf93'
                        : vehicle.shell.color,
                );
            }
            this.line(
                body.toWorld(vec(0.7, -0.7)),
                body.toWorld(vec(0.7, 0.7)),
                vehicle.shell.color,
            );
        }
        const center = this.screen(body.position);
        c.fillStyle = vehicle.shell.color;
        c.beginPath();
        c.arc(center.x, center.y, 3, 0, Math.PI * 2);
        c.fill();
        if (length(body.velocity) > 0.1)
            this.arrow(body.position, add(body.position, scale(body.velocity, 0.35)), '#658da0');
        const arrow = input.arrow();
        if (arrow && length(arrow.vector) > 0) {
            const origin = body.toWorld(arrow.local);
            this.arrow(
                origin,
                add(origin, scale(arrow.vector, 1 / (40 * input.gain * this.zoom))),
                '#ffdf93',
            );
            c.font = '12px ui-monospace,monospace';
            c.fillStyle = '#ffdf93';
            c.fillText(
                `${length(arrow.vector).toFixed(0)} ${input.tool === 'force' ? 'N' : 'N·s'}`,
                center.x + 75,
                center.y - 50,
            );
        }
    }
}
