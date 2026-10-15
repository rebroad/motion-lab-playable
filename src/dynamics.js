import { vec, add, rotate, scale, dot, resolve, clamp } from './math.js';

export const ORIGINAL_ENGINE_FORCE = 6500;
const REVERSE_THROTTLE_SCALE = 0.75;
const BRAKE_TO_REVERSE_SPEED = 0.65;
const REVERSE_TO_BRAKE_SPEED = 0.9;
const TYRE_STEERING_ANGLE = 0.55;
const SKID_SPEED_SCALE = 0.7;
const SKID_START_THRESHOLD = 1.5;
const SKID_STOP_THRESHOLD = 0.8;
const SKID_FULL_THRESHOLD = 5.5;
const SHIP_THRUST = 5000;
const SHIP_SIDE_THRUST = 2600;

export class CarDynamics {
    constructor({
        engineForce = ORIGINAL_ENGINE_FORCE * 1.5,
        rollingResistance = 32.5,
        lateralResistance = 1100,
        maxBrakeForce = lateralResistance * 4,
        handbrakeGrip = 0.15,
        handbrakeRollingMultiplier = 8,
        gripRecoveryTime = 0.15,
        handbrakeStrength = 0.75,
    } = {}) {
        this.engineForce = engineForce;
        // Per-tyre damping coefficients in N per (m/s), not Coulomb friction.
        this.rollingResistance = rollingResistance;
        this.lateralResistance = lateralResistance;
        // Simple total tire-grip ceiling for service braking (one share per tire).
        this.maxBrakeForce = maxBrakeForce;
        this.handbrakeGrip = handbrakeGrip;
        this.handbrakeStrength = handbrakeStrength;
        this.handbrakeRollingMultiplier = handbrakeRollingMultiplier;
        this.gripRecoveryTime = gripRecoveryTime;
        this.driveMode = 'reverse';
        this.reset();
        // Inset 0.3 m from the shell sides; drawing and forces share these points.
        this.tyres = [-1.35, 1.35].flatMap((x) =>
            [-0.7, 0.7].map((y) => ({
                position: vec(x, y),
                steered: x > 0,
                angle: 0,
                skidding: false,
                skidAmount: 0,
                lateralSpeed: 0,
            })),
        );
    }
    reset() {
        this.rearGripLoss = 0;
        this.skidding = false;
        this.driveMode = 'reverse';
        for (const tyre of this.tyres ?? []) {
            tyre.skidding = false;
            tyre.skidAmount = 0;
            tyre.lateralSpeed = 0;
        }
    }
    applyForces(body, controls, dt = 0) {
        // Engage immediately; restore rear grip over simulation time on release.
        this.rearGripLoss = controls.handbrake
            ? 1
            : Math.max(
                  0,
                  this.rearGripLoss - (this.gripRecoveryTime > 0 ? dt / this.gripRecoveryTime : 1),
              );
        const forward = rotate(vec(1, 0), body.angle);
        const forwardSpeed = dot(body.velocity, forward);
        if (this.driveMode === 'brake' && forwardSpeed <= BRAKE_TO_REVERSE_SPEED) {
            this.driveMode = 'reverse';
        } else if (this.driveMode === 'reverse' && forwardSpeed >= REVERSE_TO_BRAKE_SPEED) {
            this.driveMode = 'brake';
        }
        if (controls.throttle > 0) {
            body.addForce(scale(forward, controls.throttle * this.engineForce));
        } else if (controls.throttle < 0) {
            const braking = this.driveMode === 'brake' && forwardSpeed > 0;
            const force = braking
                ? -Math.min(
                      this.maxBrakeForce,
                      (forwardSpeed * body.mass) / Math.max(dt, 1e-6),
                  )
                : -this.engineForce * REVERSE_THROTTLE_SCALE;
            body.addForce(scale(forward, force * -controls.throttle));
        }
        this.skidding = false;
        for (const tyre of this.tyres) {
            tyre.angle = tyre.steered ? controls.turn * TYRE_STEERING_ANGLE : 0;
            const point = body.toWorld(tyre.position);
            // Includes the tangential velocity from the body's rotation.
            const velocity = body.velocityAt(point);
            // Rolling follows the wheel heading; lateral is its anticlockwise perpendicular.
            const wheelHeading = body.angle + tyre.angle;
            const rolling = vec(Math.cos(wheelHeading), Math.sin(wheelHeading));
            const lateral = vec(-rolling.y, rolling.x);
            const { x: rollingSpeed, y: lateralSpeed } = resolve(velocity, rolling);
            const rear = !tyre.steered;
            tyre.lateralSpeed = Math.abs(lateralSpeed);
            // Hysteresis keeps marks from flickering near the onset threshold.
            // Detect actual sideways motion, not merely a held handbrake.
            const skidThreshold = tyre.skidding ? SKID_STOP_THRESHOLD : SKID_START_THRESHOLD;
            const scaledLateralSpeed = tyre.lateralSpeed * SKID_SPEED_SCALE;
            tyre.skidding = rear && scaledLateralSpeed > skidThreshold;
            tyre.skidAmount = tyre.skidding
                ? clamp(
                      (scaledLateralSpeed - SKID_STOP_THRESHOLD) /
                          (SKID_FULL_THRESHOLD - SKID_STOP_THRESHOLD),
                      0,
                      1,
                  )
                : 0;
            this.skidding ||= tyre.skidding;
            const rollingResistance =
                this.rollingResistance *
                (rear && controls.handbrake
                    ? 1 + this.handbrakeStrength * (this.handbrakeRollingMultiplier - 1)
                    : 1);
            const lateralResistance =
                this.lateralResistance *
                (rear
                    ? 1 - this.rearGripLoss * this.handbrakeStrength * (1 - this.handbrakeGrip)
                    : 1);
            const rollingForce = scale(rolling, -rollingResistance * rollingSpeed);
            const lateralForce = scale(lateral, -lateralResistance * lateralSpeed);
            // No force cap: both components remain proportional to velocity.
            body.addForce(add(rollingForce, lateralForce), point);
        }
    }
}
export class ShipDynamics {
    constructor(thrustPoint) {
        if (!thrustPoint) throw new TypeError('ShipDynamics requires a thrust point');
        this.thrustPoint = thrustPoint;
        this.controlMode = 'classic';
        this.turnRate = 2.5;
        // Arcade drag rates (per second): gentle translation, stronger spin decay.
        this.linearDrag = 0.12;
        this.angularDrag = 0.35;
        this.reset();
    }
    reset() {
        this.appliedForce = vec();
        this.headAngle = 0;
    }
    setControlMode(mode) {
        this.controlMode = mode;
        this.reset();
    }
    applyForces(body, controls, dt = 0) {
        const boostMultiplier = controls.boost ? 2 : 1;
        const sideThrust = this.controlMode === 'physical' && controls.turn !== 0;
        const throttle = controls.throttle || (controls.boost && !sideThrust ? 1 : 0);
        const thrust = throttle * SHIP_THRUST * boostMultiplier;
        if (this.controlMode === 'classic') {
            // headAngle is stored relative to the rod for geometry, but Classic
            // aiming is world-relative. Vehicle.update compensates for body spin.
            // Turning the head applies no reaction force or torque.
            this.headAngle = (this.headAngle + controls.turn * this.turnRate * dt) % (2 * Math.PI);
            this.appliedForce = rotate(vec(thrust, 0), this.headAngle);
        } else {
            this.appliedForce = vec(thrust, controls.turn * SHIP_SIDE_THRUST * boostMultiplier);
        }
        body.addForce(rotate(this.appliedForce, body.angle), body.toWorld(this.thrustPoint));
        body.addForce(scale(body.velocity, -body.mass * this.linearDrag));
        body.torque -= body.inertia * this.angularDrag * body.angularVelocity;
    }
}
export class ManualForceDynamics {
    applyForces(body, controls) {
        if (controls.force)
            body.addForce(controls.force.vector, body.toWorld(controls.force.local));
    }
}
