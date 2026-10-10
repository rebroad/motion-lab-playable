import { bindButtonActivation } from './button-activation.js';
import { RigidBody } from './physics.js?v=0.8.2';
import { Vehicle, ORIGINAL_ENGINE_FORCE } from './vehicles.js?v=0.8.2';
import { Input } from './input.js?v=0.8.2';
import { CanvasRenderer } from './renderer.js?v=0.8.2';
import { Game } from './game.js?v=0.8.2';
import { length } from './math.js';
import { InputPresentation } from './presentation.js?v=0.8.2';

const $ = (selector) => document.querySelector(selector);
let presentation;
const vehicle = new Vehicle(new RigidBody());
const renderer = new CanvasRenderer($('#game'));
const input = new Input($('#game'), renderer, vehicle, command);
const stats = $('#stats');
const game = new Game(vehicle, input, renderer, () => {
    const b = vehicle.body;
    const speed = length(b.velocity);
    stats.textContent = `speed   ${speed.toFixed(2)} m/s (${(speed / 0.44704).toFixed(1)} mph)\nspin    ${b.angularVelocity.toFixed(2)} rad/s\nstep    ${(game.clock.step * 1000).toFixed(3)} ms\ndropped ${game.clock.dropped.toFixed(3)} s\nfps     ${game.fps === null ? '—' : game.fps.toFixed(1)}`;
});

function updateAcceleration() {
    const multiplier = Number($('#acceleration').value);
    $('#acceleration-value').textContent = `${multiplier.toFixed(1)}× original`;
    if (vehicle.mode === 'car') vehicle.dynamics.engineForce = ORIGINAL_ENGINE_FORCE * multiplier;
}

function updateHandbrake() {
    const percent = Number($('#handbrake-strength').value);
    $('#handbrake-value').textContent = `${percent}%`;
    if (vehicle.mode === 'car') vehicle.dynamics.handbrakeStrength = percent / 100;
}

function updateShipControls() {
    $('#ship-settings').hidden = vehicle.mode !== 'ship';
    if (vehicle.mode !== 'ship') return;
    $('#help').textContent =
        vehicle.dynamics.controlMode === 'classic'
            ? 'A/D or ←/→: aim the head independently of barbell spin. W/S or ↑/↓: thrust forward/back in the head’s direction. Angled thrust swings the barbell. Hold Space to double thrust; Space alone adds forward thrust.'
            : 'W/S or ↑/↓: thrust along the rod. A/D or ←/→: side thrusters at the craft end, turning and pushing the assembly. Counter-steer to stop spinning. Hold Space to double thrust; Space alone adds forward thrust.';
}

function applyShipControlMode() {
    if (vehicle.mode === 'ship') {
        vehicle.dynamics.setControlMode($('#ship-control-mode').value);
    }
    updateShipControls();
}

function updateToggleButtons(selectors, label, enabled, shortcut) {
    const state = enabled ? 'on' : 'off';
    for (const selector of selectors) {
        const element = $(selector);
        element
            .querySelector('.environment-state')
            ?.replaceChildren(document.createTextNode(state));
        element.setAttribute('aria-label', `${label} ${state} · ${shortcut}`);
        element.setAttribute('aria-pressed', String(enabled));
    }
}

function updateEnvironmentControls() {
    updateToggleButtons(['#barrier', '#barrier-settings'], 'Barrier', game.barrier, 'B');
    updateToggleButtons(['#gravity', '#gravity-settings'], 'Gravity', game.gravity, 'G');
    updateToggleButtons(
        ['#dead-zone', '#dead-zone-mini'],
        'Dead Zone',
        renderer.deadZoneEnabled,
        'Z',
    );
    updateToggleButtons(
        ['#speed-zoom', '#speed-zoom-mini'],
        'Speed Zoom',
        renderer.speedZoomEnabled,
        'X',
    );
    $('#camera-caption').textContent = [
        game.barrier ? 'Barrier on · camera locked' : 'Barrier off',
        game.gravity ? 'Gravity on' : 'Gravity off',
        `Dead Zone ${renderer.deadZoneEnabled ? 'on' : 'off'}`,
        `Speed Zoom ${renderer.speedZoomEnabled ? 'on' : 'off'}`,
    ].join(' · ');
}

function selectVehicleMode(mode) {
    input.clear();
    vehicle.install(mode);
    updateAcceleration();
    updateHandbrake();
    $('#brick-controls').hidden = vehicle.mode !== 'brick';
    $('#brick-settings').hidden = vehicle.mode !== 'brick';
    $('#car-settings').hidden = vehicle.mode !== 'car';
    document
        .querySelectorAll('[data-mode]')
        .forEach((button) => button.classList.toggle('active', button.dataset.mode === mode));
    $('#help').textContent = {
        car: 'W/S or ↑/↓: drive and reverse. A/D or ←/→: steer. Hold Space while steering to slide the rear; release to regain grip. P: pause.',
        brick: 'Press on the brick and drag in the desired direction. Longer arrows are stronger. Off-centre arrows create spin.',
    }[mode];
    applyShipControlMode();
    presentation?.setMode(mode);
}

function resetSimulation() {
    vehicle.body.reset();
    vehicle.dynamics.reset?.();
    input.clear();
    game.clock.reset();
    renderer.clearTrail();
    renderer.clearSkids();
    renderer.camera = { ...vehicle.body.position };
}

function selectTool(tool) {
    input.clear();
    input.tool = tool;
    $('#tool').value = tool;
}

const commandHandlers = new Map([
    ['car', () => selectVehicleMode('car')],
    ['ship', () => selectVehicleMode('ship')],
    ['brick', () => selectVehicleMode('brick')],
    ['reset', resetSimulation],
    [
        'gravity',
        () => {
            game.setGravity(!game.gravity);
            updateEnvironmentControls();
        },
    ],
    [
        'barrier',
        () => {
            game.setBarrier(!game.barrier);
            updateEnvironmentControls();
        },
    ],
    [
        'dead-zone',
        () => {
            renderer.deadZoneEnabled = !renderer.deadZoneEnabled;
            updateEnvironmentControls();
        },
    ],
    [
        'speed-zoom',
        () => {
            renderer.speedZoomEnabled = !renderer.speedZoomEnabled;
            updateEnvironmentControls();
        },
    ],
    [
        'pause',
        () => {
            game.setPaused(!game.paused);
            presentation?.render();
        },
    ],
    ['inputs', () => presentation?.toggleHud()],
    ['fullscreen', () => presentation?.toggleFullscreen()],
    ['force', () => selectTool('force')],
    ['impulse', () => selectTool('impulse')],
]);

function command(action) {
    const handler = commandHandlers.get(action);
    if (!handler) throw new Error(`Unknown command: ${action}`);
    handler();
}
document.querySelectorAll('[data-mode]').forEach((b) =>
    bindButtonActivation(b, () => {
        command(b.dataset.mode);
    }),
);
bindButtonActivation($('#reset'), () => {
    command('reset');
    $('#game').focus();
});
bindButtonActivation($('#gravity'), () => {
    command('gravity');
    $('#game').focus();
});
bindButtonActivation($('#barrier'), () => {
    command('barrier');
    $('#game').focus();
});
bindButtonActivation($('#gravity-settings'), () => command('gravity'));
bindButtonActivation($('#barrier-settings'), () => command('barrier'));
bindButtonActivation($('#dead-zone-mini'), () => {
    command('dead-zone');
    $('#game').focus();
});
bindButtonActivation($('#speed-zoom-mini'), () => {
    command('speed-zoom');
    $('#game').focus();
});
bindButtonActivation($('#dead-zone'), () => command('dead-zone'));
bindButtonActivation($('#speed-zoom'), () => command('speed-zoom'));
$('#tool').addEventListener('change', (e) => command(e.target.value));
$('#acceleration').addEventListener('input', updateAcceleration);
$('#handbrake-strength').addEventListener('input', updateHandbrake);
$('#trail-lifetime').addEventListener('input', (e) => {
    const percent = Number(e.target.value);
    const seconds = (percent * 24) / 100;
    renderer.setTrailLifetime(seconds);
    $('#trail-value').textContent =
        percent === 0 ? 'Off' : `${percent}% · ${Number(seconds.toFixed(2))} s`;
});
$('#ship-control-mode').addEventListener('change', () => {
    input.clear();
    applyShipControlMode();
});
presentation = new InputPresentation(input, game, command);
renderer.onResize = () => input.clear();
command('car');
updateEnvironmentControls();
game.start();
