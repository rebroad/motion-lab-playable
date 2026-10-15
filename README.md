# Motion Lab Playable

A self-contained GitHub Pages copy of Pat Kerr's interactive 2D vehicle-physics playground. The HTML, CSS, and JavaScript modules are served by this repository; the app does not need the original website or third-party runtime assets to load and play.

## Attribution

Motion Lab was created by Pat Kerr. The source is republished here with the rights holder's authorization. The in-app **Site** link is only outbound navigation to Pat Kerr's homepage; it is not required by the game.

View Pat Kerr's original online demo: <https://patkerr.co.uk/motion-lab/>.

## Run locally

With Python 3 installed, run:

```sh
./serve-local.sh
```

Then open <http://127.0.0.1:8000/>. The server binds to loopback only. To choose another port, pass it as an argument (`./serve-local.sh 8080`) or set `PORT`. Stop it with Ctrl+C. No build step or external runtime assets are needed.
