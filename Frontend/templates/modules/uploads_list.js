// modules/uploads_list.js
export function setupUploadsSocket(socket, renderCallback) {
  socket.on('uploads_list', data => {
    renderCallback(data);
  });

  // Trigger the initial listing
  socket.emit('request_uploads_list');

  // Optional: refresh every N seconds
  setInterval(() => {
    socket.emit('request_uploads_list');
  }, 5000);
}
