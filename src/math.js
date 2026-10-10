// All lengths are metres, time is seconds, and angles are radians.
export const vec = (x = 0, y = 0) => ({ x, y });
export const add = (a, b) => vec(a.x + b.x, a.y + b.y);
export const sub = (a, b) => vec(a.x - b.x, a.y - b.y);
export const scale = (v, s) => vec(v.x * s, v.y * s);
export const dot = (a, b) => a.x * b.x + a.y * b.y;
// Signed components along a unit axis and its anticlockwise perpendicular.
export const resolve = (vector, unitX) => {
    const unitY = vec(-unitX.y, unitX.x);
    return vec(dot(vector, unitX), dot(vector, unitY));
};
export const cross = (a, b) => a.x * b.y - a.y * b.x;
export const length = (v) => Math.hypot(v.x, v.y);
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export function rotate(v, angle) {
    const c = Math.cos(angle),
        s = Math.sin(angle);
    return vec(c * v.x - s * v.y, s * v.x + c * v.y);
}
