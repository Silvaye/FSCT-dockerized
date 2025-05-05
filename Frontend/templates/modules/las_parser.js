/**
 * Fully-generic LAS 1.4 parser: reads Public Header, VLRs/EVLRs,
 * then extracts all standard PDRF 0–10 fields (coords, returns, flags,
 * classification, intensity, color, GPS-time, waveform, NIR, etc.).
 * Also parses any “Extra Bytes” VLRs and appends user-defined fields.
 *
 * @param {ArrayBuffer} buffer
 * @returns {{
*   header: {
*     versionMajor: number,
*     versionMinor: number,
*     pointDataFormat: number,
*     pointDataRecordLength: number,
*     numberOfPoints: number,
*     vlrs: Array<{userId:string, recordId:number, data:Uint8Array}>,
*     evlrs: Array<{userId:string, recordId:number, data:Uint8Array}>
*   },
*   points: Array<object>
* }}
*/
export function parseLAS(buffer) {
  const view = new DataView(buffer), le = true;

  // --- 1) Public Header Block ---
  const sig = String.fromCharCode(...new Uint8Array(buffer, 0, 4));
  if (sig !== 'LASF') throw new Error('Invalid LAS signature');
  const versionMajor = view.getUint8(24);
  const versionMinor = view.getUint8(25);
  const headerSize = view.getUint16(94, le);
  const offsetToPointData = view.getUint32(96, le);
  const pointDataFormat = view.getUint8(104);
  const pointDataRecordLength = view.getUint16(105, le);
  const legacyCount = view.getUint32(107, le);
  const numberOfPoints = (
    legacyCount > 0 && pointDataFormat < 6
      ? legacyCount
      : Number(view.getBigUint64(247, le))
  );
  // scales & offsets for X/Y/Z
  const xScale = view.getFloat64(131, le), yScale = view.getFloat64(139, le), zScale = view.getFloat64(147, le);
  const xOff = view.getFloat64(155, le), yOff = view.getFloat64(163, le), zOff = view.getFloat64(171, le);

  // --- 2) Read VLRs/EVLRs (briefly) ---
  const vlrCount = view.getUint32(100, le);
  const vlrs = [];
  let cursor = headerSize;
  for (let i = 0; i < vlrCount; i++) {
    const userIdBytes = new Uint8Array(buffer, cursor + 2, 16);
    const userId = new TextDecoder().decode(userIdBytes).replace(/\0+$/, '');
    const recordId = view.getUint16(cursor + 18, le);
    const recLen = view.getUint16(cursor + 20, le);
    const data = new Uint8Array(buffer, cursor + 54, recLen);
    vlrs.push({ userId, recordId, data });
    cursor += 54 + recLen;
  }
  // EVLRs
  const evlrOffset = Number(view.getBigUint64(233, le));
  const evlrCount = view.getUint32(241, le);
  const evlrs = [];
  cursor = evlrOffset;
  for (let i = 0; i < evlrCount; i++) {
    const userIdBytes = new Uint8Array(buffer, cursor + 2, 16);
    const userId = new TextDecoder().decode(userIdBytes).replace(/\0+$/, '');
    const recordId = view.getUint16(cursor + 18, le);
    const recLen = Number(view.getBigUint64(cursor + 20, le));
    const data = new Uint8Array(buffer, cursor + 60, recLen);
    evlrs.push({ userId, recordId, data });
    cursor += 60 + recLen;
  }

  // --- 3) Point-format metadata from LAS spec ---
  // Core 0-5 formats share a 20-byte header :contentReference[oaicite:0]{index=0}:contentReference[oaicite:1]{index=1}
  const core0 = [
    { name: 'X', type: 'int32', offset: 0, apply: { scale: xScale, off: xOff } },
    { name: 'Y', type: 'int32', offset: 4, apply: { scale: yScale, off: yOff } },
    { name: 'Z', type: 'int32', offset: 8, apply: { scale: zScale, off: zOff } },
    { name: 'intensity', type: 'uint16', offset: 12 },
    { // returns & flags, 1 byte :contentReference[oaicite:2]{index=2}:contentReference[oaicite:3]{index=3}
      type: 'bitfield', offset: 14,
      bits: [
        { name: 'returnNumber', bit: 0, len: 3 },
        { name: 'numberOfReturns', bit: 3, len: 3 },
        { name: 'scanDirectionFlag', bit: 6, len: 1 },
        { name: 'edgeOfFlightLine', bit: 7, len: 1 }
      ]
    },
    { name: 'classification', type: 'uint8', offset: 15 },
    { name: 'scanAngleRank', type: 'int8', offset: 16 },
    { name: 'userData', type: 'uint8', offset: 17 },
    { name: 'pointSourceId', type: 'uint16', offset: 18 },
  ];

  const core6 = [
    { name: 'X', type: 'int32', offset: 0, apply: { scale: xScale, off: xOff } },
    { name: 'Y', type: 'int32', offset: 4, apply: { scale: yScale, off: yOff } },
    { name: 'Z', type: 'int32', offset: 8, apply: { scale: zScale, off: zOff } },
    { name: 'intensity', type: 'uint16', offset: 12 },
    {
      type: 'bitfield', offset: 14, bits: [
        { name: 'returnNumber', bit: 0, len: 4 },
        { name: 'numberOfReturns', bit: 4, len: 4 }
      ]
    },
    {
      type: 'bitfield', offset: 15, bits: [
        { name: 'classificationFlags', bit: 0, len: 4 },
        { name: 'scannerChannel', bit: 4, len: 2 },
        { name: 'scanDirectionFlag', bit: 6, len: 1 },
        { name: 'edgeOfFlightLine', bit: 7, len: 1 }
      ]
    },
    { name: 'classification', type: 'uint8', offset: 16 },
    { name: 'userData', type: 'uint8', offset: 17 },
    { name: 'scanAngle', type: 'int16', offset: 18 },
    { name: 'pointSourceId', type: 'uint16', offset: 20 },
    { name: 'gpsTime', type: 'float64', offset: 22 }
  ];


  // Build each format by extending/overriding core0
  const FORMATS = {
    0: core0,
    1: core0.concat([{ name: 'gpsTime', type: 'float64', offset: 20 }]),                                      // :contentReference[oaicite:4]{index=4}:contentReference[oaicite:5]{index=5}
    2: core0.concat([                                                                                   // :contentReference[oaicite:6]{index=6}:contentReference[oaicite:7]{index=7}
      { name: 'red', type: 'uint16', offset: 20 },
      { name: 'green', type: 'uint16', offset: 22 },
      { name: 'blue', type: 'uint16', offset: 24 }
    ]),
    3: core0.concat([{ name: 'gpsTime', type: 'float64', offset: 20 }]).concat([                             // :contentReference[oaicite:8]{index=8}:contentReference[oaicite:9]{index=9}
      { name: 'red', type: 'uint16', offset: 28 },
      { name: 'green', type: 'uint16', offset: 30 },
      { name: 'blue', type: 'uint16', offset: 32 }
    ]),
    4: core0.concat([{ name: 'gpsTime', type: 'float64', offset: 20 }]).concat([                             // :contentReference[oaicite:10]{index=10}:contentReference[oaicite:11]{index=11}
      { name: 'wavePacketDescriptorIndex', type: 'uint8', offset: 28 },
      { name: 'byteOffsetToWaveformData', type: 'uint64', offset: 29 },
      { name: 'waveformPacketSize', type: 'uint32', offset: 37 },
      { name: 'returnPointWaveformLocation', type: 'float32', offset: 41 },
      { name: 'parametricDx', type: 'float32', offset: 45 },
      { name: 'parametricDy', type: 'float32', offset: 49 },
      { name: 'parametricDz', type: 'float32', offset: 53 }
    ]),
    5: core0.concat([{ name: 'gpsTime', type: 'float64', offset: 20 }]).concat([                             // :contentReference[oaicite:12]{index=12}:contentReference[oaicite:13]{index=13}
      { name: 'red', type: 'uint16', offset: 28 }, { name: 'green', type: 'uint16', offset: 30 }, { name: 'blue', type: 'uint16', offset: 32 },
      { name: 'wavePacketDescriptorIndex', type: 'uint8', offset: 34 },
      { name: 'byteOffsetToWaveformData', type: 'uint64', offset: 35 },
      { name: 'waveformPacketSize', type: 'uint32', offset: 43 },
      { name: 'returnPointWaveformLocation', type: 'float32', offset: 47 },
      { name: 'parametricDx', type: 'float32', offset: 51 },
      { name: 'parametricDy', type: 'float32', offset: 55 },
      { name: 'parametricDz', type: 'float32', offset: 59 }
    ]),
    // Formats 6–10 share a 30-byte core :contentReference[oaicite:14]{index=14}:contentReference[oaicite:15]{index=15}
    6: core6,
    7: core6.concat([
      { name: 'red', type: 'uint16', offset: 30 },
      { name: 'green', type: 'uint16', offset: 32 },
      { name: 'blue', type: 'uint16', offset: 34 }
    ]),
    8: core6.concat([
      { name: 'red', type: 'uint16', offset: 30 },
      { name: 'green', type: 'uint16', offset: 32 },
      { name: 'blue', type: 'uint16', offset: 34 },
      { name: 'nir', type: 'uint16', offset: 36 }
    ]), 9: core6.concat([
      { name: 'wavePacketDescriptorIndex', type: 'uint8', offset: 30 },
      { name: 'byteOffsetToWaveformData', type: 'uint64', offset: 31 },
      { name: 'waveformPacketSize', type: 'uint32', offset: 39 },
      { name: 'returnPointWaveformLocation', type: 'float32', offset: 43 },
      { name: 'parametricDx', type: 'float32', offset: 47 },
      { name: 'parametricDy', type: 'float32', offset: 51 },
      { name: 'parametricDz', type: 'float32', offset: 55 }
    ]), 10: null
  };
  // Format 10 = 9 + RGB + NIR (offsets 58–65)
  FORMATS[10] = FORMATS[9].concat([
    { name: 'red', type: 'uint16', offset: 58 },
    { name: 'green', type: 'uint16', offset: 60 },
    { name: 'blue', type: 'uint16', offset: 62 },
    { name: 'nir', type: 'uint16', offset: 64 }
  ]);


  const fields = FORMATS[pointDataFormat];
  // 1. Dynamically parse Extra Bytes VLR if present
  const extraBytesVLR = vlrs.find(vlr =>
    vlr.userId.trim() === 'LASF_Spec' && vlr.recordId === 4
  );

  const extraFields = [];

  let currentOffset = Math.max(...fields.map(f => f.offset + (f.type?.startsWith('float') ? 4 : 2)));

  if (extraBytesVLR) {
    const recordLen = 192;
    for (let i = 0; i < extraBytesVLR.data.byteLength; i += recordLen) {
      const slice = new DataView(extraBytesVLR.data.buffer, extraBytesVLR.data.byteOffset + i, recordLen);

      const nameBytes = new Uint8Array(extraBytesVLR.data.buffer, extraBytesVLR.data.byteOffset + i + 4, 32);  // start at byte 4
      const name = new TextDecoder().decode(nameBytes).replace(/\0+$/, '');

      const dataType = slice.getUint8(2);  // correct offset for data type

      const typeMap = {
        1: 'uint8', 2: 'int8', 3: 'uint16', 4: 'int16',
        5: 'uint32', 6: 'int32', 9: 'float32', 10: 'float64'
      };
      const type = typeMap[dataType];
      const sizeMap = {
        'uint8': 1, 'int8': 1, 'uint16': 2, 'int16': 2,
        'uint32': 4, 'int32': 4, 'float32': 4, 'float64': 8
      };
      const size = sizeMap[type];
      if (type && name && name.trim().length > 0) {
        extraFields.push({ name, type, offset: currentOffset });
        currentOffset += size;
      }
    }
  }


  if (!fields) throw new Error(`Unsupported PDRF ${pointDataFormat}`);

  // --- 4) Generic type-reader map ---
  const read = {
    int8: (o) => view.getInt8(o, le),
    uint8: (o) => view.getUint8(o, le),
    int16: (o) => view.getInt16(o, le),
    uint16: (o) => view.getUint16(o, le),
    int32: (o) => view.getInt32(o, le),
    uint32: (o) => view.getUint32(o, le),
    float32: (o) => view.getFloat32(o, le),
    float64: (o) => view.getFloat64(o, le),
    uint64: (o) => Number(view.getBigUint64(o, le))
  };

  // --- 5) Walk points ---
  const fieldsUsed = fields.concat(extraFields);
  const output = {};

  // 1. Pre-allocate typed arrays for each field
  for (const f of fieldsUsed) {
    if (f.type === 'bitfield') continue; // bitfields handled separately
    const dtype = f.apply ? Float64Array : {
      int8: Int8Array,
      uint8: Uint8Array,
      int16: Int16Array,
      uint16: Uint16Array,
      int32: Int32Array,
      uint32: Uint32Array,
      float32: Float32Array,
      float64: Float64Array
    }[f.type];

    if (!dtype) {
      throw new Error(`Unsupported field type: ${f.type}`);
    }

    output[f.name] = new dtype(numberOfPoints);
  }


  // 2. Fill each typed array
  for (let i = 0; i < numberOfPoints; i++) {
    const base = offsetToPointData + i * pointDataRecordLength;
    for (const f of fieldsUsed) {
      const off = base + f.offset;
      if (f.type === 'bitfield') {
        const byte = view.getUint8(off);
        for (const b of f.bits) {
          if (!output[b.name]) output[b.name] = new Uint8Array(numberOfPoints);
          output[b.name][i] = (byte >> b.bit) & ((1 << b.len) - 1);
        }
      } else {
        let v = read[f.type](off);
        if (f.apply) v = v * f.apply.scale + f.apply.off;
        output[f.name][i] = v;
      }
    }
  }


  // --- 6) Return everything ---
  return {
    header: {
      versionMajor, versionMinor,
      pointDataFormat, pointDataRecordLength, numberOfPoints,
      vlrs, evlrs,
      extraFields: extraFields.map(f => ({
        name: f.name, type: f.type, offset: f.offset
      }))
    },
    points: output
  };
}
