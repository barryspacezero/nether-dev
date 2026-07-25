import http from 'http';
import httpProxy from 'http-proxy';
import qrcode from 'qrcode-terminal';
import pc from 'picocolors';
import { getLocalIpAddress } from './ipUtils.js';

export function startServer(options) {
  const { frontend, backend, port, apiRoute, global } = options;
  let globalUrl = null;

  const proxy = httpProxy.createProxyServer({ changeOrigin: true, ws: true });

  proxy.on('error', (err, req, resOrSocket) => {
    if (err.message.includes('Parse Error')) return;
    
    console.error(pc.red(`Proxy error: ${err.message}`));
    if (resOrSocket.writeHead) {
      if (!resOrSocket.headersSent) {
        resOrSocket.writeHead(502, { 'Content-Type': 'text/plain' });
      }
      resOrSocket.end('Bad Gateway');
    } else if (resOrSocket.end) {
      resOrSocket.end();
    }
  });

  proxy.on('proxyReq', (proxyReq, req, res, options) => {
    // Disable compression so we can safely modify the HTML response body
    proxyReq.removeHeader('accept-encoding');
  });

  proxy.on('proxyRes', (proxyRes, req, res) => {
    const isHtml = proxyRes.headers['content-type'] && proxyRes.headers['content-type'].includes('text/html');
    
    // Only intercept and inject the rewriter if backend is present
    if (backend && isHtml) {
      // Disable caching and compression so we can safely modify the HTML
      delete proxyRes.headers['content-length'];
      delete proxyRes.headers['content-encoding'];
      proxyRes.headers['cache-control'] = 'no-cache, no-store, must-revalidate';
      proxyRes.headers['pragma'] = 'no-cache';
      proxyRes.headers['expires'] = '0';

      const _write = res.write;
      const _end = res.end;
      let body = '';
      
      res.write = function (chunk) {
        body += chunk.toString('utf8');
      };

      res.end = function (chunk, encoding, callback) {
        if (chunk && typeof chunk !== 'function') {
           body += chunk.toString('utf8');
        } else {
           callback = chunk;
        }

        const localIp = getLocalIpAddress();
        const actualPort = server.address().port;
        
        // The magic interceptor script
        const injectedScript = `
        <script>
          (function() {
            console.log('⚡ Nether Runtime Request Rewriter active: Intercepting API requests to localhost:${backend}');
            
            const PROXY_URL = '${globalUrl ? globalUrl : `http://${localIp}:${actualPort}`}/__nether__';
            const BACKEND_REGEX = new RegExp('(http|ws):\\\\/\\\\/[^:/]+:' + ${backend}, 'g');

            // Monkey-patch fetch
            const originalFetch = window.fetch;
            window.fetch = async function(...args) {
              let originalUrl = args[0] instanceof Request ? args[0].url : args[0];
              let isRewritten = false;
              
              if (typeof args[0] === 'string') {
                const newUrl = args[0].replace(BACKEND_REGEX, PROXY_URL);
                if (newUrl !== args[0]) {
                  args[0] = newUrl;
                  isRewritten = true;
                }
              } else if (args[0] instanceof Request) {
                const newUrl = args[0].url.replace(BACKEND_REGEX, PROXY_URL);
                if (newUrl !== args[0].url) {
                  args[0] = new Request(newUrl, args[0]);
                  isRewritten = true;
                }
              }
              
              let finalUrl = args[0] instanceof Request ? args[0].url : args[0];
              if (isRewritten) {
                console.log('⚡ [Nether] Rewrote fetch:', originalUrl, '->', finalUrl);
              }
              
              try {
                return await originalFetch.apply(this, args);
              } catch (err) {
                // Automated Proxy Rerouting: If the fetch failed with a network error (like CORS or Connection Refused)
                // and we haven't already rewritten it, it indicates a hardcoded production URL or LAN IP.
                // We intercept the network failure and tunnel it through the Nether proxy as a fallback mechanism.
                if (!isRewritten && err.name === 'TypeError' && err.message === 'Failed to fetch') {
                  try {
                    const urlObj = new URL(originalUrl, window.location.origin);
                    const fallbackUrl = PROXY_URL + urlObj.pathname + urlObj.search;
                    
                    console.warn('⚡ [Nether] Fetch failed (CORS/Network policy):', originalUrl);
                    console.log('⚡ [Nether] Automated Proxy Rerouting ->', fallbackUrl);
                    
                    if (args[0] instanceof Request) {
                      args[0] = new Request(fallbackUrl, args[0]);
                    } else {
                      args[0] = fallbackUrl;
                    }
                    
                    return await originalFetch.apply(this, args);
                  } catch (fallbackErr) {
                    throw err; // throw original if fallback fails
                  }
                }
                throw err;
              }
            };

            // Monkey-patch XMLHttpRequest
            const originalOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url, ...rest) {
              if (typeof url === 'string') {
                url = url.replace(BACKEND_REGEX, PROXY_URL);
              }
              return originalOpen.call(this, method, url, ...rest);
            };

            // Monkey-patch WebSocket
            if (window.WebSocket) {
              const OriginalWebSocket = window.WebSocket;
              window.WebSocket = function(url, protocols) {
                if (typeof url === 'string') {
                  const WS_PROXY_URL = PROXY_URL.replace(/^http/, 'ws');
                  url = url.replace(BACKEND_REGEX, WS_PROXY_URL);
                }
                return new OriginalWebSocket(url, protocols);
              };
              window.WebSocket.prototype = OriginalWebSocket.prototype;
            }

            // Monkey-patch EventSource
            if (window.EventSource) {
              const OriginalEventSource = window.EventSource;
              window.EventSource = function(url, configuration) {
                if (typeof url === 'string') {
                  url = url.replace(BACKEND_REGEX, PROXY_URL);
                }
                return new OriginalEventSource(url, configuration);
              };
              window.EventSource.prototype = OriginalEventSource.prototype;
            }

            // Monkey-patch DOM Attributes (catches React/Vue dynamic src/href injections)
            const originalSetAttribute = Element.prototype.setAttribute;
            Element.prototype.setAttribute = function(name, value) {
              if (name && (name.toLowerCase() === 'src' || name.toLowerCase() === 'href') && typeof value === 'string') {
                value = value.replace(BACKEND_REGEX, PROXY_URL);
              }
              return originalSetAttribute.call(this, name, value);
            };

            // Monkey-patch Image constructor via prototype (catches img.src = "...")
            if (window.HTMLImageElement) {
              const originalSrcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
              if (originalSrcDesc && originalSrcDesc.set) {
                Object.defineProperty(HTMLImageElement.prototype, 'src', {
                  get: originalSrcDesc.get,
                  set: function(val) {
                    if (typeof val === 'string') {
                      val = val.replace(BACKEND_REGEX, PROXY_URL);
                    }
                    return originalSrcDesc.set.call(this, val);
                  }
                });
              }
            }

            // Monkey-patch Web Workers
            if (window.Worker) {
              const OriginalWorker = window.Worker;
              window.Worker = function(url, options) {
                if (typeof url === 'string') {
                  url = url.replace(BACKEND_REGEX, PROXY_URL);
                }
                return new OriginalWorker(url, options);
              };
              window.Worker.prototype = OriginalWorker.prototype;
            }
          })();
        </script>`;

        if (/<head[^>]*>/i.test(body)) {
          body = body.replace(/(<head[^>]*>)/i, '$1' + injectedScript);
        } else if (/<body[^>]*>/i.test(body)) {
          body = body.replace(/(<body[^>]*>)/i, '$1' + injectedScript);
        } else {
          body = injectedScript + body;
        }

        _write.call(res, body, 'utf8');
        _end.call(res, callback);
      };
    }
  });

  const server = http.createServer((req, res) => {
    let targetPort = frontend;
    
    // If the request was intercepted by the rewriter, it will have the __nether__ prefix
    if (backend && req.url.startsWith('/__nether__/')) {
      targetPort = backend;
      req.url = req.url.replace('/__nether__', ''); // Strip prefix before forwarding
    }
    
    console.log(pc.yellow(`[PROXY] ${req.method} ${req.url} -> port ${targetPort}`));
    
    // Strip headers that Cloudflare injects to prevent Next.js CSRF errors
    delete req.headers['x-forwarded-host'];
    delete req.headers['x-forwarded-proto'];
    delete req.headers['x-forwarded-for'];
    delete req.headers['cf-connecting-ip'];
    delete req.headers['cf-ray'];
    delete req.headers['cf-visitor'];

    // Trick Next.js/Vite into thinking the request is coming from localhost
    req.headers.host = `localhost:${targetPort}`;
    req.headers.origin = `http://localhost:${targetPort}`;

    proxy.web(req, res, { target: `http://localhost:${targetPort}` });
  });

  server.on('upgrade', (req, socket, head) => {
    let targetPort = frontend;
    
    if (backend && req.url.startsWith('/__nether__/')) {
      targetPort = backend;
      req.url = req.url.replace('/__nether__', '');
    }

    req.headers.host = `localhost:${targetPort}`;
    req.headers.origin = `http://localhost:${targetPort}`;

    proxy.ws(req, socket, head, { target: `http://localhost:${targetPort}` });
  });

  function listenAuto(currentPort) {
    server.once('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        console.log(pc.yellow(`Port ${currentPort} is in use, trying ${currentPort + 1}...`));
        // Remove the previous listening callback that was attached by server.listen
        server.removeAllListeners('listening');
        server.close();
        
        if (currentPort >= port + 10) {
          console.error(pc.red('Could not find an available port.'));
          process.exit(1);
        }
        
        listenAuto(currentPort + 1);
      }
    });

    server.listen(currentPort, '0.0.0.0', async () => {
      const actualPort = server.address().port;
      const localIp = getLocalIpAddress();
      let proxyUrl = `http://${localIp}:${actualPort}`;

      if (global) {
        console.log(pc.cyan('Spinning up global Cloudflare tunnel...'));
        const { startTunnel } = await import('untun');
        const tunnel = await startTunnel({ port: actualPort });
        globalUrl = await tunnel.getURL();
        proxyUrl = globalUrl;
        console.log(pc.green(`✓ Global tunnel established`));
      }

      console.clear();
      console.log(pc.magenta(pc.bold('\n    _   ________________  ____________ ')));
      console.log(pc.magenta(pc.bold('   / | / / ____/_  __/ / / / ____/ __ \\')));
      console.log(pc.magenta(pc.bold('  /  |/ / __/   / / / /_/ / __/ / /_/ /')));
      console.log(pc.magenta(pc.bold(' / /|  / /___  / / / __  / /___/ _, _/ ')));
      console.log(pc.magenta(pc.bold('/_/ |_/_____/ /_/ /_/ /_/_____/_/ |_|  \n')));
      console.log(pc.cyan('      Frictionless Dev Proxy\n'));
      console.log(`Frontend Route:  * -> http://localhost:${frontend}`);
      if (backend) {
        console.log(`Backend Route:   /__nether__* -> http://localhost:${backend}\n`);
      } else {
        console.log();
      }
      console.log(`🚀 Proxy running at: ${pc.green(proxyUrl)}`);
      
      if (backend) {
        console.log(pc.green('✓ Runtime URL rewriting enabled\n'));
      } else {
        console.log(pc.gray('Running in Frontend-Only mode.\n'));
      }

      console.log('Scan the QR code below to open on your phone:\n');
      qrcode.generate(proxyUrl, { small: true });

      console.log('\nPress Ctrl+C to stop');
    });
  }

  listenAuto(port);
}
