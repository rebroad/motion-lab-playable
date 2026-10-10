import { vec, add } from './math.js';

export class Shell {
    constructor(kind, color, points) {
        Object.assign(this, { kind, color, points });
    }
}

export class RectangleShell extends Shell {
    constructor(kind, color, length = 4, width = 2) {
        const x = length / 2,
            y = width / 2;
        super(kind, color, [vec(-x, -y), vec(x, -y), vec(x, y), vec(-x, y)]);
        this.halfLength = x;
        this.halfWidth = y;
    }
    contains(p) {
        return Math.abs(p.x) <= this.halfLength && Math.abs(p.y) <= this.halfWidth;
    }
}

export class BarbellShell extends Shell {
    constructor({ payloadMassRatio = 2 } = {}) {
        if (!Number.isFinite(payloadMassRatio) || payloadMassRatio <= 0) {
            throw new RangeError('Payload/head mass ratio must be positive and finite');
        }
        const headMassFraction = 1 / (1 + payloadMassRatio);
        const payloadMassFraction = payloadMassRatio / (1 + payloadMassRatio);
        const separation = 6;
        const headLength = 1.8;
        const headHalfWidth = 0.8;
        // Body-local origin is the mass-weighted centre, not the rod midpoint.
        const craft = vec(separation * payloadMassFraction, 0);
        super(
            'ship',
            '#ff6262',
            [
                vec((2 * headLength) / 3, 0),
                vec(-headLength / 3, -headHalfWidth),
                vec(-headLength / 3, headHalfWidth),
            ].map((p) => add(craft, p)),
        );
        this.rodHeadAnchor = add(craft, vec(-headLength / 3, 0));
        this.trailColor = '#9bbcff';
        this.craft = craft;
        this.counterweight = vec(-separation * headMassFraction, 0);
        this.headMassFraction = headMassFraction;
        this.payloadMassFraction = payloadMassFraction;
        this.radius = 0.9;
        // Massless rod. Each end contributes its centroidal inertia plus m*r².
        const headInertiaPerMass = headLength ** 2 / 18 + headHalfWidth ** 2 / 6;
        const payloadInertiaPerMass = this.radius ** 2 / 2;
        this.inertiaPerMass =
            headMassFraction * (headInertiaPerMass + craft.x ** 2) +
            payloadMassFraction * (payloadInertiaPerMass + this.counterweight.x ** 2);
    }
}
