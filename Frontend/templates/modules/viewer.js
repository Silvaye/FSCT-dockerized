import { parseLAS } from './las_parser.js';

export function setupViewer({ dropdownId, refreshBtnId, renderBtnId, canvasId }) {
  const dropdown = document.getElementById(dropdownId);
  const refreshBtn = document.getElementById(refreshBtnId);
  const renderBtn = document.getElementById(renderBtnId);
  const canvas = document.getElementById(canvasId);
  const gl = canvas.getContext('webgl');

  if (!gl) return alert("WebGL not supported");

  function resizeCanvas() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  }

  function renderLoop() {
    resizeCanvas();
    gl.clearColor(0.1, 0.1, 0.1, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    requestAnimationFrame(renderLoop);
  }

  renderLoop();

  refreshBtn.addEventListener('click', async () => {
    const res = await fetch('/list_uploads');
    const data = await res.json();

    dropdown.innerHTML = '<option value="">(Select a file)</option>';
    for (const entry of data.uploads || []) {
      for (const file of entry.files) {
        if (file.endsWith('.las')) {
          const path = `${entry.path}/${file}`;
          const opt = document.createElement('option');
          opt.value = path;
          opt.textContent = path;
          dropdown.appendChild(opt);
        }
      }
    }
  });

  renderBtn.addEventListener('click', async () => {
    const path = dropdown.value;
    if (!path) return alert("Select a file first.");

    try {
      const resp = await fetch(`/${path}`);
      const buffer = await resp.arrayBuffer();
      const { header, points } = parseLAS(buffer);
      console.log(`Parsed ${points.length} points`);
      renderPointCloud(points);
    } catch (err) {
      alert("Render error: " + err.message);
    }
  });
}
