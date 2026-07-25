import os from 'os';

export function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const name of Object.keys(interfaces)) {
    const nameLower = name.toLowerCase();
    
    // Determine interface score
    let score = 1; // Default/unknown type
    
    if (/wi-fi|wifi|wlan|wireless/i.test(nameLower)) {
      score = 3; // Wireless connections (best for mobile previewing)
    } else if (/ethernet|eth|en/i.test(nameLower)) {
      score = 2; // Physical wired connections
    }
    
    // Deprioritize known virtual / VPN / loopback adapters
    if (/virtual|box|vmware|docker|vbox|wsl|vpn|adapter/i.test(nameLower)) {
      score = 0;
    }
    
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        candidates.push({
          address: iface.address,
          name: name,
          score: score
        });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.length > 0 ? candidates[0].address : 'localhost';
}
