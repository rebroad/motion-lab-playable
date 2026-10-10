// Touch activation must work even when another finger is holding a game control.
// Mouse and keyboard activation continue through the native click event.
export function bindButtonActivation(button, activate) {
    const touches = new Map();
    let lastTouchRelease = -Infinity;
    button.addEventListener('pointerdown', (event) => {
        if (event.pointerType !== 'touch' || button.disabled) return;
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY, dragged: false });
        button.setPointerCapture(event.pointerId);
    });
    button.addEventListener('pointermove', (event) => {
        const touch = touches.get(event.pointerId);
        if (touch && Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > 10)
            touch.dragged = true;
    });
    button.addEventListener('pointerup', (event) => {
        const touch = touches.get(event.pointerId);
        if (!touch) return;
        touches.delete(event.pointerId);
        lastTouchRelease = Date.now();
        const rect = button.getBoundingClientRect();
        if (
            !button.disabled &&
            !touch.dragged &&
            Math.hypot(event.clientX - touch.x, event.clientY - touch.y) <= 10 &&
            event.clientX >= rect.left &&
            event.clientX < rect.right &&
            event.clientY >= rect.top &&
            event.clientY < rect.bottom
        )
            activate(event);
    });
    const cancel = (event) => touches.delete(event.pointerId);
    button.addEventListener('pointercancel', cancel);
    button.addEventListener('lostpointercapture', cancel);
    button.addEventListener('click', (event) => {
        // Modern clicks identify touch explicitly; older browsers emit MouseEvent.
        // Keep keyboard/programmatic clicks (detail 0) and real mouse clicks.
        if (
            event.pointerType === 'touch' ||
            (!event.pointerType && event.detail > 0 && Date.now() - lastTouchRelease < 800)
        ) {
            event.preventDefault();
            return;
        }
        if (!button.disabled) activate(event);
    });
}
