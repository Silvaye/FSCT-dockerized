export function setupSocket(stdoutHandler, stderrHandler) {
    const socket = io();
  
    socket.on('connect', () => console.log("[Socket.IO] Connected!"));
    socket.on('connect_error', (err) => console.error("[Socket.IO] Error:", err));
  
    socket.on("stdout", (msg) => stdoutHandler(msg.data));
    socket.on("stderr", (msg) => stderrHandler(msg.data));
  
    return socket;
  }
  