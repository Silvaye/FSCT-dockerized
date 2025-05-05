export function startGpuStatsSocket(updateCallback) {
  const socket = io(); // Assumes same origin server

  socket.on('connect', () => {
    console.log('Connected to GPU stats server');
    socket.emit('start_gpu_stats'); // Optional: ask server to start sending
  });

  socket.on('gpu_stats', data => {
    updateCallback(data);
  });

  socket.on('connect_error', err => {
    updateCallback(null, err);
  });

  socket.on('disconnect', () => {
    console.log('Disconnected from GPU stats server');
  });

  return () => socket.disconnect(); // Return a cleanup function
}

  