import { vec, add, sub, scale, cross, rotate, dot } from './math.js';

// Frictionless infinite-mass barrier edges. support(normal) returns the body's
// furthest surface point opposite the inward-facing boundary normal.
export function bounceInside(body, bounds, support, restitution = 0.55) {
    const barrierEdges = [
        [vec(1, 0), bounds.left],
        [vec(-1, 0), -bounds.right],
        [vec(0, 1), bounds.bottom],
        [vec(0, -1), -bounds.top],
    ];
    // A few passes handle simultaneous corner contacts; this is a small demo
    // solver, not continuous collision detection or a general contact solver.
    for (let pass = 0; pass < 4; pass++)
        for (const [normal, plane] of barrierEdges) {
            // Find the vehicle's outermost point along this edge's inward normal.
            let point = support(normal);
            const penetration = plane - dot(point, normal);
            if (penetration < -1e-8) continue;

            // Move the body just far enough to bring the contact point back inside.
            const correction = scale(normal, Math.max(0, penetration));
            body.position = add(body.position, correction);
            point = add(point, correction);

            // Only resolve velocity when the contact point is moving into the edge.
            const normalSpeed = dot(body.velocityAt(point), normal);
            if (normalSpeed >= 0) continue;

            // Effective rotational lever arm for the impulse at this contact point.
            const arm = cross(sub(point, body.position), normal);
            // Suppress tiny bounces so a body can settle under continuous gravity.
            const bounce = normalSpeed < -0.5 ? restitution : 0;

            // Apply a normal impulse accounting for both linear and rotational mass.
            // The numerator is the normal velocity change needed to stop or rebound.
            const velocityChange = -(1 + bounce) * normalSpeed;
            // The denominator is the contact point's effective inverse mass.
            const effectiveInverseMass = 1 / body.mass + (arm * arm) / body.inertia;
            const impulse = velocityChange / effectiveInverseMass;
            body.applyImpulse(scale(normal, impulse), point);
        }
}

export class RigidBody {
    constructor(mass = 1000, inertia = (1000 * (4 ** 2 + 2 ** 2)) / 12) {
        if (!(mass > 0) || !(inertia > 0)) throw new Error('Mass and inertia must be positive.');
        this.mass = mass;
        this.inertia = inertia;
        this.reset();
    }
    reset() {
        this.position = vec();
        this.velocity = vec();
        this.angle = 0;
        this.angularVelocity = 0;
        this.clearForces();
    }
    clearForces() {
        this.force = vec();
        this.torque = 0;
    }
    toWorld(local) {
        return add(this.position, rotate(local, this.angle));
    }
    toLocal(world) {
        return rotate(sub(world, this.position), -this.angle);
    }
    velocityAt(world) {
        const r = sub(world, this.position);
        return add(this.velocity, vec(-this.angularVelocity * r.y, this.angularVelocity * r.x));
    }
    addForce(force, worldPoint = this.position) {
        this.force = add(this.force, force);
        this.torque += cross(sub(worldPoint, this.position), force);
    }
    applyImpulse(impulse, worldPoint = this.position) {
        this.velocity = add(this.velocity, scale(impulse, 1 / this.mass));
        this.angularVelocity += cross(sub(worldPoint, this.position), impulse) / this.inertia;
    }
    integrate(dt) {
        // Semi-implicit Euler: velocity first, then position.
        this.velocity = add(this.velocity, scale(this.force, dt / this.mass));
        this.angularVelocity += (this.torque * dt) / this.inertia;
        this.position = add(this.position, scale(this.velocity, dt));
        this.angle += this.angularVelocity * dt;
        this.clearForces();
    }
}
