import http from 'http';
import httpProxy from 'http-proxy';
import qrcode from 'qrcode-terminal';
import pc from 'picocolors';
import { getLocalIpAddress } from './ipUtils.js';

export function startServer(options) {
  const { frontend, backend, port, apiRoute } = options;

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
            
            const PROXY_URL = 'http://${localIp}:${actualPort}/__nether__';
            const BACKEND_REGEX = /(http|ws):\\/\\/(localhost|127\\.0\\.0\\.1):${backend}/g;

            // Monkey-patch fetch
            const originalFetch = window.fetch;
            window.fetch = async function(...args) {
              if (typeof args[0] === 'string') {
                args[0] = args[0].replace(BACKEND_REGEX, PROXY_URL);
              } else if (args[0] instanceof Request) {
                const newUrl = args[0].url.replace(BACKEND_REGEX, PROXY_URL);
                if (newUrl !== args[0].url) {
                  args[0] = new Request(newUrl, args[0]);
                }
              }
              return originalFetch.apply(this, args);
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

    server.listen(currentPort, '0.0.0.0', () => {
      const actualPort = server.address().port;
      const localIp = getLocalIpAddress();
      const proxyUrl = `http://${localIp}:${actualPort}`;

      console.log(pc.cyan('\n ⚡ NETHER - Frictionless Dev Proxy \n'));
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
