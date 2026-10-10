import { vec, add, rotate, scale, dot } from './math.js';
import { RectangleShell, BarbellShell } from './shells.js';
import { CarDynamics, ShipDynamics, ManualForceDynamics } from './dynamics.js';

export { Shell, RectangleShell, BarbellShell } from './shells.js';
export {
    CarDynamics,
    ShipDynamics,
    ManualForceDynamics,
    ORIGINAL_ENGINE_FORCE,
} from './dynamics.js';

// Factories give each installation fresh mutable components.
export const configurations = {
    car: () => ({ shell: new RectangleShell('car', '#8ce6c5'), dynamics: new CarDynamics() }),
    ship: () => {
        const shell = new BarbellShell();
        return { shell, dynamics: new ShipDynamics(shell.craft) };
    },
    brick: () => ({
        shell: new RectangleShell('brick', '#f6bd79'),
        dynamics: new ManualForceDynamics(),
    }),
};
export class Vehicle {
    constructor(body) {
        this.body = body;
        this.baseInertia = body.inertia;
        this.install('car');
    }
    install(mode) {
        const components = configurations[mode]();
        Object.assign(this, components, { mode });
        this.body.inertia =
            this.shell.inertiaPerMass === undefined
                ? this.baseInertia
                : this.body.mass * this.shell.inertiaPerMass;
        this.body.clearForces();
    }
    update(controls, dt) {
        this.dynamics.applyForces(this.body, controls, dt);
        const previousAngle = this.body.angle;
        this.body.integrate(dt);
        if (this.mode === 'ship' && this.dynamics.controlMode === 'classic') {
            // Preserve the aimed world heading through the actual integration,
            // including angular acceleration from this step's off-centre thrust.
            this.dynamics.headAngle =
                (this.dynamics.headAngle - (this.body.angle - previousAngle)) % (2 * Math.PI);
        }
    }
    worldPoints() {
        return this.shell.points.map((p) => {
            if (this.mode === 'ship')
                p = add(
                    this.shell.craft,
                    rotate(
                        vec(p.x - this.shell.craft.x, p.y - this.shell.craft.y),
                        this.dynamics.headAngle,
                    ),
                );
            return this.body.toWorld(p);
        });
    }
    supportPoint(normal) {
        // Return the vehicle's furthest point opposite normal (minimum projection).
        // Boundary collision normals point inward, so this selects the boundary-facing surface.
        const points = this.worldPoints();
        if (this.mode === 'ship') {
            points.push(
                add(this.body.toWorld(this.shell.counterweight), scale(normal, -this.shell.radius)),
            );
        }
        const minimum = Math.min(...points.map((p) => dot(p, normal)));
        const contacts = points.filter((p) => Math.abs(dot(p, normal) - minimum) < 1e-8);
        // A flat face contacts at its midpoint, avoiding artificial corner spin.
        return scale(
            contacts.reduce((sum, p) => add(sum, p), vec()),
            1 / contacts.length,
        );
    }
}
