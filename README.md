# Nether
<!-- > ![Nether Demo](https://via.placeholder.com/800x400.png?text=10-Second+Demo+GIF+Goes+Here) -->

**Run your existing full-stack app on any device without changing a single line of code.**

Your frontend already works on your phone.
Your backend usually doesn't.
Nether makes both work exactly as they do on `localhost`.

**Nether preserves your existing development workflow. Your application keeps talking to `localhost`; Nether makes that work from other devices.**

Test your local development server on any mobile device on your network with just one command.

```bash
nether
```

```
✓ Found frontend on port 5173
✓ Found backend on port 8000

 ⚡ NETHER - Frictionless Dev Proxy 

Frontend Route:  * -> http://localhost:5173
Backend Route:   /__nether__* -> http://localhost:8000

🚀 Proxy running at: http://192.168.1.100:8081
✓ Runtime URL rewriting enabled

Scan the QR code below to open on your phone:
[ QR Code ]
```

## Your phone now behaves exactly like `localhost`.

- ✅ Zero configuration
- ✅ No `.env` changes
- ✅ No CORS headaches
- ✅ No IP swapping
- ✅ No tunnel services

---

## Why Nether?

Without Nether:
- edit `.env`
- replace `localhost` with your LAN IP
- restart the app
- configure CORS
- undo the changes later

With Nether:
- run `nether`
- scan QR
- done.

Getting a backend working on a phone usually means changing environment variables, configuring CORS, exposing additional ports, or rewriting API URLs. **Nether doesn't modify your project—it adapts the browser at runtime so your existing application works unchanged on other devices.**

---

## How It Works (Architecture)

```text
Phone
    │
    ▼
Nether Proxy (The Portal)
    │
    ├── Frontend requests ─────────► localhost:5173
    │
    └── localhost API requests ───► localhost:8000
```

**Nether only rewrites requests that target `localhost`. Everything else behaves exactly as your application intended.**

When Nether proxies your frontend to your phone, it transparently injects a tiny script into the HTML. This script monkey-patches `fetch`, `XMLHttpRequest`, `WebSocket`, and `EventSource` on the fly. 

Any time your frontend tries to make an API call to `localhost`, Nether seamlessly intercepts it and routes it through the portal to the correct backend port on your laptop.

---

## Works with

- Next.js
- React + Vite
- Express
- FastAPI
- Django
- Laravel
- NestJS
- Any frontend and backend served over HTTP

## Supports

- ✅ fetch
- ✅ XMLHttpRequest
- ✅ Axios
- ✅ React Query
- ✅ SWR
- ✅ WebSockets
- ✅ Server-Sent Events

---

## Why not ngrok?

Ngrok exposes your app to the internet.

Nether recreates your `localhost` development environment on devices connected to your local network.

- No account.
- No tunnels.
- No application changes.

---

## Installation & Usage

You can run Nether instantly using `npx` (no installation required) as long as your dev servers are already running:

```bash
npx nether-dev
```

### Auto-Detection

By default, Nether automatically detects the ports your frontend and backend are running on by pinging common development ports (e.g., 3000, 5173, 5000, 8000).

### Manual Configuration

If you have a complex setup with multiple ports, you can specify them manually:

```bash
nether --frontend 5173 --backend 9000
```

You can also change the port the proxy itself runs on (default is 8081):

```bash
nether --port 8080
```

## License

MIT
