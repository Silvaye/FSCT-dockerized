/**
 * Parse a LAS 1.4 ArrayBuffer in the browser, extracting only XYZ and RGB.
 * @param {ArrayBuffer} buffer
 * @returns {{
*   header: {
*     versionMajor: number,
*     versionMinor: number,
*     pointDataFormat: number,
*     pointDataRecordLength: number,
*     numberOfPoints: number
*   },
*   points: Array<{x: number, y: number, z: number, r: number|null, g: number|null, b: number|null}>
* }}
*/
export function parseLAS(buffer) {
 const view = new DataView(buffer);
 const le = true; // LAS is little-endian

 // 1. Quick signature check
 const sig = String.fromCharCode(
   ...new Uint8Array(buffer, 0, 4)
 );
 if (sig !== 'LASF') {
   throw new Error('Not a LAS file (invalid signature)');
 }

 // 2. Read header fields
 const versionMajor            = view.getUint8(24);
 const versionMinor            = view.getUint8(25);
 const headerSize              = view.getUint16(94, le);
 const offsetToPointData       = view.getUint32(96, le);         // :contentReference[oaicite:0]{index=0}:contentReference[oaicite:1]{index=1}
 const pointDataFormat         = view.getUint8(104);             // :contentReference[oaicite:2]{index=2}:contentReference[oaicite:3]{index=3}
 const pointDataRecordLength   = view.getUint16(105, le);        // :contentReference[oaicite:4]{index=4}:contentReference[oaicite:5]{index=5}
 const legacyPointCount        = view.getUint32(107, le);
 // For LAS 1.4, if format<6 use legacy count; otherwise 64-bit count at offset 247
 const numberOfPoints = (
   legacyPointCount > 0 && pointDataFormat < 6
     ? legacyPointCount
     : Number(view.getBigUint64(247, le))
 );

 // 3. Grab scaling/offsets for XYZ
 const xScale = view.getFloat64(131, le),
       yScale = view.getFloat64(139, le),
       zScale = view.getFloat64(147, le);
 const xOff   = view.getFloat64(155, le),
       yOff   = view.getFloat64(163, le),
       zOff   = view.getFloat64(171, le);

 // 4. Precompute where color lives in each point record
 const colorMap = {
   2: { r:20, g:22, b:24 },   // PDRF2 :contentReference[oaicite:6]{index=6}:contentReference[oaicite:7]{index=7}
   3: { r:28, g:30, b:32 },   // PDRF3 :contentReference[oaicite:8]{index=8}:contentReference[oaicite:9]{index=9}
   5: { r:28, g:30, b:32 },   // PDRF5 :contentReference[oaicite:10]{index=10}:contentReference[oaicite:11]{index=11}
   7: { r:30, g:32, b:34 },   // PDRF7 :contentReference[oaicite:12]{index=12}:contentReference[oaicite:13]{index=13}
   8: { r:30, g:32, b:34 },   // PDRF8 :contentReference[oaicite:14]{index=14}:contentReference[oaicite:15]{index=15}
   10:{ r:30, g:32, b:34 }    // PDRF10 analogous to 8
 };
 const hasColor = colorMap.hasOwnProperty(pointDataFormat);
 const co = hasColor ? colorMap[pointDataFormat] : {};

 // 5. Walk all points
 const pts = new Array(numberOfPoints);
 for (let i = 0; i < numberOfPoints; i++) {
   const base = offsetToPointData + i * pointDataRecordLength;

   // raw integer coords
   const xr = view.getInt32(base +   0, le);
   const yr = view.getInt32(base +   4, le);
   const zr = view.getInt32(base +   8, le);

   // apply scale & offset
   const x = xr * xScale + xOff;
   const y = yr * yScale + yOff;
   const z = zr * zScale + zOff;

   // read color or default to null
   let r = null, g = null, b = null;
   if (hasColor) {
     r = view.getUint16(base + co.r, le);
     g = view.getUint16(base + co.g, le);
     b = view.getUint16(base + co.b, le);
   }

   pts[i] = { x, y, z, r, g, b };
 }

 return {
   header: {
     versionMajor,
     versionMinor,
     pointDataFormat,
     pointDataRecordLength,
     numberOfPoints
   },
   points: pts
 };
}