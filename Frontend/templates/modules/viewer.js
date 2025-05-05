// las_viewer.js
import { parseLAS } from './las_parser.js';
import { mat4, vec3 } from 'https://cdn.skypack.dev/gl-matrix';

function sphericalToCartesian(r, azimuth, elevation, pivot, out = vec3.create()) {
  const cosE = Math.cos(elevation);
  const sinE = Math.sin(elevation);

  // local coordinates relative to the pivot
  const x = r * cosE * Math.sin(azimuth);
  const y = r * sinE;
  const z = r * cosE * Math.cos(azimuth);

  // eye = pivot + local
  vec3.set(out,
    pivot[0] + x,
    pivot[1] + y,
    pivot[2] + z
  );

  return out;
}

export function setupViewer({ dropdownId, refreshBtnId, renderBtnId, canvasId }) {
  const dropdown = document.getElementById(dropdownId);
  const refreshBtn = document.getElementById(refreshBtnId);
  const renderBtn = document.getElementById(renderBtnId);
  const resetBtn = document.getElementById('resetBtn');
  const canvas = document.getElementById(canvasId);
  const gl = canvas.getContext('webgl');
  if (!gl) return alert("WebGL not supported");

  // ——— 1) compile and link our point-cloud shader ———
  const vsSrc = `
   attribute vec3 a_position;
   attribute vec3 a_color;
   uniform mat4 u_mvp;
   varying vec3 v_color;
   void main() {
     gl_Position = u_mvp * vec4(a_position, 1.0);
     gl_PointSize = 2.0;
     v_color = a_color;
   }
 `;
  const fsSrc = `
   precision mediump float;
   varying vec3 v_color;
   void main() {
     gl_FragColor = vec4(v_color, 1.0);
   }
 `;
  function compileShader(src, type) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(s));
    }
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, compileShader(vsSrc, gl.VERTEX_SHADER));
  gl.attachShader(prog, compileShader(fsSrc, gl.FRAGMENT_SHADER));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(prog));
  }

  const aPosLoc = gl.getAttribLocation(prog, 'a_position');
  const aColLoc = gl.getAttribLocation(prog, 'a_color');
  const uMvpLoc = gl.getUniformLocation(prog, 'u_mvp');
  const posBuf = gl.createBuffer();
  const colBuf = gl.createBuffer();

  let pointCount = 0;

  // ——— Camera / orbit state ———
  let azimuth = 0.5;          // horizontal angle (yaw)
  let elevation = -1;         // vertical angle   (pitch)
  let radius = 50;            // distance eye‑to‑pivot
  let roll = 0;               // around forward axis

  let pivot = vec3.fromValues(0, 0, 0);      // rotation / zoom centre

  let objectCentred = true;  // CC “object‑centred” vs “viewer‑centred”
  let vertAxisLocked = false; // ‘L’ locks elevation
  let ortho = false; // ‘F2’ toggles ortho projection

  let initialPivot = vec3.fromValues(0, 0, 0);


  const up = vec3.fromValues(0, 1, 0);

  const model = mat4.create();
  let modelOffset = vec3.fromValues(0, 0, 0);  // translation in view plane



  let isDragging = false;
  let isPanning = false;
  let lastX = 0, lastY = 0;

  // Start drag on canvas
  canvas.addEventListener('mousedown', e => {
    if (e.button === 0) {
      isDragging = true;
      lastX = e.clientX; lastY = e.clientY;
    }
    else if (e.button === 2) {
      e.preventDefault(); // prevent context menu lmao
      isPanning = true;
      lastX = e.clientX; lastY = e.clientY;
    }
  });

  // End drag anywhere on window
  window.addEventListener('mouseup', event => {
    //console.log({"azimuth": azimuth, "elevation": elevation, "radius": radius});
    event.preventDefault();
    isDragging = false;
    isPanning = false;
  });

  canvas.addEventListener('contextmenu', e => {
    e.preventDefault(); // suppress browser's right-click menu
  });

  // View reset logic
  resetBtn.addEventListener('click', () => {
    azimuth = 0.5;
    elevation = -1;
    radius = 50;
    vec3.set(pivot, 0, 0, 0);
  });

  window.addEventListener('keydown', e => {
    // Avoid interfering with input fields
    if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

    switch (e.key) {
      case 'q': roll -= Math.PI / 90; break;   // CCW
      case 'e': roll += Math.PI / 90; break;   // CW
      case 'F3':
        e.preventDefault(); e.stopPropagation();
        objectCentred = true;
        vec3.copy(pivot, initialPivot);
        break;  // object‑centred
      case 'F4':
        e.preventDefault(); e.stopPropagation();
        objectCentred = false;
        break;  // viewer‑centred
      case 'F2':
        e.preventDefault(); e.stopPropagation();
        ortho = !ortho;
        break;  // perspective ↔ ortho
      case 'l': case 'L': vertAxisLocked = !vertAxisLocked; break; // lock pitch

    }
  });


  // handle orbit
  function handleRotate(e) {
    if (!isDragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    azimuth += dx * 0.005;
    if (!vertAxisLocked) elevation += dy * 0.005;
    elevation = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, elevation));
  }

  function handlePan(e) {
    if (!isPanning) return;

    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    const fov = 45 * Math.PI / 180;
    const viewHeight = 2 * radius * Math.tan(fov / 2);
    const viewWidth = viewHeight * (canvas.width / canvas.height);

    const moveX = dx / canvas.width * viewWidth;
    const moveY = -dy / canvas.height * viewHeight;

    // get camera vectors
    const eye = vec3.fromValues(
      radius * Math.cos(elevation) * Math.sin(azimuth),
      radius * Math.sin(elevation),
      radius * Math.cos(elevation) * Math.cos(azimuth)
    );

    const forward = vec3.create();
    vec3.normalize(forward, vec3.negate(forward, eye));  // toward center

    const right = vec3.create();
    vec3.cross(right, forward, up);
    vec3.normalize(right, right);

    const camUp = vec3.create();
    vec3.cross(camUp, right, forward);
    vec3.normalize(camUp, camUp);

    // Move the center
    vec3.scaleAndAdd(pivot, pivot, right, moveX);
    vec3.scaleAndAdd(pivot, pivot, camUp, moveY);
  }

  // listen to moves
  canvas.addEventListener('mousemove', e => {
    handleRotate(e);
    handlePan(e);
  });
  window.addEventListener('mousemove', e => {
    handleRotate(e);
    handlePan(e);
  });

  // Zoom with wheel
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    // increase radius on wheel down, decrease on wheel up
    radius += e.deltaY * 0.05;
    radius = Math.max(1, Math.min(1000, radius));
  });

  // ——— Matrices ———
  const proj = mat4.create();
  const view = mat4.create();
  const mvp = mat4.create();

  // ——— Resize + render loop ———
  function resizeCanvas() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  // TBD: zoom to fit the bounding box of the point cloud
  // ——— Alter Zoom to fit bounding box ———
  function zoomToFit(boundingBox) {
    const diag = vec3.distance(boundingBox.min, boundingBox.max);
    radius = diag * 1.2;  // leave a margin
    vec3.lerp(cameraCenter, boundingBox.min, boundingBox.max, 0.5);
  }


  function renderLoop() {
    resizeCanvas();

    // 1. Camera position ------------------------------------------------------
    let eye = sphericalToCartesian(radius, azimuth, elevation, pivot);

    if (!objectCentred) {
      // viewer-centered: move pivot forward along the camera's look direction, instead of copying eye
      const forward = vec3.create();
      vec3.sub(forward, pivot, eye);
      vec3.normalize(forward, forward);
      vec3.scaleAndAdd(pivot, eye, forward, radius);
    }


    // 2. Matrices -------------------------------------------------------------
    mat4.identity(model);

    if (ortho) {
      const r = radius * 0.6;                 // your choice of ortho width
      const aspect = canvas.width / canvas.height;
      mat4.ortho(proj, -r, r, -r / aspect, r / aspect, 0.1, 1000);
    } else {
      mat4.perspective(
        proj,
        45 * Math.PI / 180,
        canvas.width / canvas.height,
        0.1, 1000
      );
    }

    mat4.lookAt(view, eye, pivot, up);

    if (Math.abs(roll) > 1e-6) {
      const R = mat4.create();
      mat4.fromRotation(R, roll, [0, 0, 1]);
      mat4.mul(view, R, view);  // apply roll
    }

    // MVP = proj * view * model
    mat4.multiply(mvp, proj, view);
    mat4.multiply(mvp, mvp, model);

    // 3. Render ---------------------------------------------------------------
    gl.clearColor(0.1, 0.1, 0.1, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    if (pointCount > 0) {
      gl.useProgram(prog);

      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.enableVertexAttribArray(aPosLoc);
      gl.vertexAttribPointer(aPosLoc, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
      gl.enableVertexAttribArray(aColLoc);
      gl.vertexAttribPointer(aColLoc, 3, gl.FLOAT, false, 0, 0);

      gl.uniformMatrix4fv(uMvpLoc, false, mvp);
      gl.drawArrays(gl.POINTS, 0, pointCount);
    }

    requestAnimationFrame(renderLoop);
  }


  renderLoop();

  // ——— renderPointCloud stays the same ———
  function renderPointCloud(points) {
    const n = points.X.length;
    pointCount = n;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);

    // check for existence of colors, if not, set to white
    const hasColor = points.red && points.green && points.blue;

    for (let i = 0; i < n; i++) {
      positions[3 * i] = points.X[i];
      positions[3 * i + 1] = points.Y[i];
      positions[3 * i + 2] = points.Z[i];

      if (hasColor) {
        colors[3 * i] = points.red[i] / 65535;
        colors[3 * i + 1] = points.green[i] / 65535;
        colors[3 * i + 2] = points.blue[i] / 65535;
      } else {
        colors[3 * i] = 1.0; // R
        colors[3 * i + 1] = 1.0; // G
        colors[3 * i + 2] = 1.0; // B
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
  }

  // ——— UI hooks ———
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "Loading...";
    const res = await fetch('/list_uploads');
    const data = await res.json();
    dropdown.innerHTML = '<option value="">(Select a file)</option>';
    for (const e of data.uploads || []) {
      for (const f of e.files) {
        if (f.endsWith('.las')) {
          const path = `${e.path}/${f}`;
          const opt = document.createElement('option');
          opt.value = path;
          opt.textContent = path;
          dropdown.appendChild(opt);
        }
      }
    }
    refreshBtn.disabled = false;
    refreshBtn.innerHTML = "&#x21bb;"; // refresh icon
  });

  renderBtn.addEventListener('click', async () => {
    const path = dropdown.value;
    if (!path) return alert("Select a file first.");
    try {
      const resp = await fetch(`/${path}`);
      const buffer = await resp.arrayBuffer();
      const { points } = parseLAS(buffer);
      console.log(`Parsed ${points.X.length} points`);
      renderPointCloud(points);
    } catch (err) {
      alert("Render error: " + err.message);
    }
  });
}
