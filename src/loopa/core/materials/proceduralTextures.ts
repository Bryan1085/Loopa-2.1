export type ProceduralDimensions = "1D" | "2D" | "3D" | "4D";
export type VoronoiFeature =
  | "f1"
  | "f2"
  | "smooth_f1"
  | "distance_to_edge"
  | "n_sphere_radius";
export type VoronoiDistanceMetric =
  | "euclidean"
  | "manhattan"
  | "chebychev"
  | "minkowski";

export interface NoiseTextureParams {
  dimensions: ProceduralDimensions;
  w: number;
  scale: number;
  detail: number;
  roughness: number;
  lacunarity: number;
  offset: number;
  distortion: number;
  normalize: boolean;
}

export interface VoronoiTextureParams {
  dimensions: ProceduralDimensions;
  feature: VoronoiFeature;
  distanceMetric: VoronoiDistanceMetric;
  w: number;
  scale: number;
  detail: number;
  roughness: number;
  lacunarity: number;
  smoothness: number;
  exponent: number;
  randomness: number;
  normalize: boolean;
}

export interface NoiseSampleResult {
  factor: number;
  color: [number, number, number];
}

export interface VoronoiSampleResult {
  distance: number;
  color: [number, number, number];
  position: [number, number, number];
  w: number;
  radius: number;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hashUint32(x: number, y: number, z: number, w: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) +
    Math.imul(y | 0, 668265263) +
    Math.imul(z | 0, 2147483647) +
    Math.imul(w | 0, 1274126177) +
    Math.imul(seed | 0, 1597334677)) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

function hashFloat(x: number, y: number, z: number, w: number, seed: number): number {
  return hashUint32(x, y, z, w, seed) / 4294967296;
}

function grad1(hash: number, x: number): number {
  return (hash & 1) === 0 ? x : -x;
}

function grad2(hash: number, x: number, y: number): number {
  switch (hash & 7) {
    case 0:
      return x + y;
    case 1:
      return -x + y;
    case 2:
      return x - y;
    case 3:
      return -x - y;
    case 4:
      return x;
    case 5:
      return -x;
    case 6:
      return y;
    default:
      return -y;
  }
}

function grad3(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

function grad4(hash: number, x: number, y: number, z: number, w: number): number {
  const h = hash & 31;
  const u = h < 24 ? x : y;
  const v = h < 16 ? y : z;
  const t = h < 8 ? z : w;
  return (
    ((h & 1) === 0 ? u : -u) +
    ((h & 2) === 0 ? v : -v) +
    ((h & 4) === 0 ? t : -t)
  );
}

function perlin1D(x: number, seed: number): number {
  const xi = Math.floor(x);
  const xf = x - xi;
  const u = fade(xf);
  const a = grad1(hashUint32(xi, 0, 0, 0, seed), xf);
  const b = grad1(hashUint32(xi + 1, 0, 0, 0, seed), xf - 1);
  return lerp(a, b, u) * 0.9;
}

function perlin2D(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = fade(xf);
  const v = fade(yf);
  const aa = grad2(hashUint32(xi, yi, 0, 0, seed), xf, yf);
  const ba = grad2(hashUint32(xi + 1, yi, 0, 0, seed), xf - 1, yf);
  const ab = grad2(hashUint32(xi, yi + 1, 0, 0, seed), xf, yf - 1);
  const bb = grad2(hashUint32(xi + 1, yi + 1, 0, 0, seed), xf - 1, yf - 1);
  return lerp(lerp(aa, ba, u), lerp(ab, bb, u), v) * 0.7071;
}

function perlin3D(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = fade(xf);
  const v = fade(yf);
  const w = fade(zf);

  const c000 = grad3(hashUint32(xi, yi, zi, 0, seed), xf, yf, zf);
  const c100 = grad3(hashUint32(xi + 1, yi, zi, 0, seed), xf - 1, yf, zf);
  const c010 = grad3(hashUint32(xi, yi + 1, zi, 0, seed), xf, yf - 1, zf);
  const c110 = grad3(hashUint32(xi + 1, yi + 1, zi, 0, seed), xf - 1, yf - 1, zf);
  const c001 = grad3(hashUint32(xi, yi, zi + 1, 0, seed), xf, yf, zf - 1);
  const c101 = grad3(hashUint32(xi + 1, yi, zi + 1, 0, seed), xf - 1, yf, zf - 1);
  const c011 = grad3(hashUint32(xi, yi + 1, zi + 1, 0, seed), xf, yf - 1, zf - 1);
  const c111 = grad3(hashUint32(xi + 1, yi + 1, zi + 1, 0, seed), xf - 1, yf - 1, zf - 1);

  const x00 = lerp(c000, c100, u);
  const x10 = lerp(c010, c110, u);
  const x01 = lerp(c001, c101, u);
  const x11 = lerp(c011, c111, u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w) * 0.577;
}

function perlin4D(x: number, y: number, z: number, wCoord: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const wi = Math.floor(wCoord);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const wf = wCoord - wi;
  const u = fade(xf);
  const v = fade(yf);
  const s = fade(zf);
  const t = fade(wf);

  let sumW0 = 0;
  let sumW1 = 0;
  for (let dw = 0; dw <= 1; dw += 1) {
    const ww = dw === 0 ? wf : wf - 1;
    let sumZ0 = 0;
    let sumZ1 = 0;
    for (let dz = 0; dz <= 1; dz += 1) {
      const zz = dz === 0 ? zf : zf - 1;
      const y0x0 = grad4(hashUint32(xi, yi, zi + dz, wi + dw, seed), xf, yf, zz, ww);
      const y0x1 = grad4(hashUint32(xi + 1, yi, zi + dz, wi + dw, seed), xf - 1, yf, zz, ww);
      const y1x0 = grad4(hashUint32(xi, yi + 1, zi + dz, wi + dw, seed), xf, yf - 1, zz, ww);
      const y1x1 = grad4(hashUint32(xi + 1, yi + 1, zi + dz, wi + dw, seed), xf - 1, yf - 1, zz, ww);
      const zVal = lerp(lerp(y0x0, y0x1, u), lerp(y1x0, y1x1, u), v);
      if (dz === 0) sumZ0 = zVal;
      else sumZ1 = zVal;
    }
    const wVal = lerp(sumZ0, sumZ1, s);
    if (dw === 0) sumW0 = wVal;
    else sumW1 = wVal;
  }
  return lerp(sumW0, sumW1, t) * 0.5;
}

function sampleRawNoise(
  dimensions: ProceduralDimensions,
  x: number,
  y: number,
  z: number,
  w: number,
  seed: number,
): number {
  switch (dimensions) {
    case "1D":
      return perlin1D(w + x, seed);
    case "2D":
      return perlin2D(x, y, seed);
    case "4D":
      return perlin4D(x, y, z, w, seed);
    default:
      return perlin3D(x, y, z, seed);
  }
}

function evalFbmNoise(
  dimensions: ProceduralDimensions,
  x: number,
  y: number,
  z: number,
  w: number,
  detail: number,
  roughness: number,
  lacunarity: number,
  offset: number,
  normalize: boolean,
  seed: number,
): number {
  const clampedDetail = Math.max(0, Math.min(15, detail));
  const octaves = Math.floor(clampedDetail);
  const remainder = clampedDetail - octaves;
  const clampedRoughness = Math.max(0, Math.min(1, roughness));
  const safeLacunarity = Math.max(0.01, lacunarity);

  let frequency = 1;
  let amplitude = 1;
  let sum = 0;
  let maxAmplitude = 0;

  for (let i = 0; i <= octaves; i += 1) {
    const n = sampleRawNoise(
      dimensions,
      x * frequency,
      y * frequency,
      z * frequency,
      w * frequency,
      seed + i * 31,
    );
    sum += (n + offset) * amplitude;
    maxAmplitude += amplitude;
    frequency *= safeLacunarity;
    amplitude *= clampedRoughness;
  }

  if (remainder > 1e-4 && octaves < 15) {
    const n = sampleRawNoise(
      dimensions,
      x * frequency,
      y * frequency,
      z * frequency,
      w * frequency,
      seed + (octaves + 1) * 31,
    );
    const remAmp = amplitude * remainder;
    sum += (n + offset) * remAmp;
    maxAmplitude += remAmp;
  }

  if (normalize && maxAmplitude > 0) {
    return clamp01(0.5 + (sum / maxAmplitude) * 0.72);
  }
  return clamp01(0.5 + sum * 0.5);
}

export function evaluateNoiseSample(
  params: NoiseTextureParams,
  coord: [number, number, number],
): NoiseSampleResult {
  const scale = params.scale;
  let x = coord[0] * scale;
  let y = coord[1] * scale;
  let z = coord[2] * scale;
  let w = params.w * scale;

  if (Math.abs(params.distortion) > 1e-6) {
    const d = params.distortion;
    const dx = sampleRawNoise(params.dimensions, x + 13.7, y + 7.1, z + 3.3, w + 1.9, 101) * d;
    const dy = sampleRawNoise(params.dimensions, x + 5.9, y + 19.3, z + 11.1, w + 4.7, 202) * d;
    const dz = sampleRawNoise(params.dimensions, x + 23.1, y + 2.7, z + 17.9, w + 8.3, 303) * d;
    const dw = sampleRawNoise(params.dimensions, x + 9.4, y + 14.2, z + 29.5, w + 6.1, 404) * d;
    x += dx;
    y += dy;
    z += dz;
    w += dw;
  }

  const factor = evalFbmNoise(
    params.dimensions,
    x,
    y,
    z,
    w,
    params.detail,
    params.roughness,
    params.lacunarity,
    params.offset,
    params.normalize,
    17,
  );
  const g = evalFbmNoise(
    params.dimensions,
    x + 31.4,
    y + 17.8,
    z + 9.2,
    w + 5.1,
    params.detail,
    params.roughness,
    params.lacunarity,
    params.offset,
    params.normalize,
    53,
  );
  const b = evalFbmNoise(
    params.dimensions,
    x + 11.3,
    y + 43.6,
    z + 27.4,
    w + 13.7,
    params.detail,
    params.roughness,
    params.lacunarity,
    params.offset,
    params.normalize,
    89,
  );

  return { factor, color: [factor, g, b] };
}

function measureVoronoiDistance(
  dx: number,
  dy: number,
  dz: number,
  dw: number,
  metric: VoronoiDistanceMetric,
  exponent: number,
): number {
  switch (metric) {
    case "manhattan":
      return Math.abs(dx) + Math.abs(dy) + Math.abs(dz) + Math.abs(dw);
    case "chebychev":
      return Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz), Math.abs(dw));
    case "minkowski": {
      const p = Math.max(0.05, exponent);
      const sum =
        Math.pow(Math.abs(dx), p) +
        Math.pow(Math.abs(dy), p) +
        Math.pow(Math.abs(dz), p) +
        Math.pow(Math.abs(dw), p);
      return Math.pow(sum, 1 / p);
    }
    default:
      return Math.sqrt(dx * dx + dy * dy + dz * dz + dw * dw);
  }
}

function smin(a: number, b: number, k: number): number {
  if (k <= 1e-5) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

function evalSingleVoronoi(
  dimensions: ProceduralDimensions,
  feature: VoronoiFeature,
  distanceMetric: VoronoiDistanceMetric,
  x: number,
  y: number,
  z: number,
  w: number,
  smoothness: number,
  exponent: number,
  randomness: number,
  seed: number,
): VoronoiSampleResult {
  const rand = Math.max(0, Math.min(1, randomness));
  const ix = Math.floor(x);
  const iy = dimensions === "1D" ? 0 : Math.floor(y);
  const iz = dimensions === "1D" || dimensions === "2D" ? 0 : Math.floor(z);
  const iw = dimensions === "4D" ? Math.floor(w) : 0;

  const yMin = dimensions === "1D" ? 0 : -1;
  const yMax = dimensions === "1D" ? 0 : 1;
  const zMin = dimensions === "1D" || dimensions === "2D" ? 0 : -1;
  const zMax = dimensions === "1D" || dimensions === "2D" ? 0 : 1;
  const wMin = dimensions === "4D" ? -1 : 0;
  const wMax = dimensions === "4D" ? 1 : 0;

  let minDist1 = 1e9;
  let minDist2 = 1e9;
  let smoothDist = 8.0;
  let nearestCell = [ix, iy, iz, iw];
  let nearestPoint = [x, y, z, w];
  let secondPoint = [x, y, z, w];
  const smoothH = Math.max(0, Math.min(1, smoothness));
  let smoothColor: [number, number, number] = [0, 0, 0];
  let smoothColorWeight = 0;

  for (let dw = wMin; dw <= wMax; dw += 1) {
    for (let dz = zMin; dz <= zMax; dz += 1) {
      for (let dy = yMin; dy <= yMax; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const cx = ix + dx;
          const cy = iy + dy;
          const cz = iz + dz;
          const cw = iw + dw;

          const ox = hashFloat(cx, cy, cz, cw, seed + 11) * rand;
          const oy = dimensions === "1D" ? 0 : hashFloat(cx, cy, cz, cw, seed + 23) * rand;
          const oz =
            dimensions === "1D" || dimensions === "2D"
              ? 0
              : hashFloat(cx, cy, cz, cw, seed + 37) * rand;
          const ow = dimensions === "4D" ? hashFloat(cx, cy, cz, cw, seed + 53) * rand : 0;

          const px = cx + ox;
          const py = cy + oy;
          const pz = cz + oz;
          const pw = cw + ow;

          const distX = px - x;
          const distY = dimensions === "1D" ? 0 : py - y;
          const distZ = dimensions === "1D" || dimensions === "2D" ? 0 : pz - z;
          const distW = dimensions === "4D" ? pw - w : 0;

          const dist = measureVoronoiDistance(
            distX,
            distY,
            distZ,
            distW,
            distanceMetric,
            exponent,
          );

          if (feature === "smooth_f1") {
            smoothDist = smin(smoothDist, dist, smoothH);
            const weight = Math.exp(-dist * (8 - smoothH * 5));
            smoothColor[0] += hashFloat(cx, cy, cz, cw, seed + 101) * weight;
            smoothColor[1] += hashFloat(cx, cy, cz, cw, seed + 211) * weight;
            smoothColor[2] += hashFloat(cx, cy, cz, cw, seed + 307) * weight;
            smoothColorWeight += weight;
          }

          if (dist < minDist1) {
            minDist2 = minDist1;
            secondPoint = nearestPoint;
            minDist1 = dist;
            nearestCell = [cx, cy, cz, cw];
            nearestPoint = [px, py, pz, pw];
          } else if (dist < minDist2) {
            minDist2 = dist;
            secondPoint = [px, py, pz, pw];
          }
        }
      }
    }
  }

  let color: [number, number, number] = [
    hashFloat(nearestCell[0], nearestCell[1], nearestCell[2], nearestCell[3], seed + 101),
    hashFloat(nearestCell[0], nearestCell[1], nearestCell[2], nearestCell[3], seed + 211),
    hashFloat(nearestCell[0], nearestCell[1], nearestCell[2], nearestCell[3], seed + 307),
  ];

  let outDist = minDist1;
  let radius = 0;

  if (feature === "f2") {
    outDist = minDist2;
  } else if (feature === "smooth_f1") {
    outDist = smoothDist;
    if (smoothColorWeight > 1e-6) {
      color = [
        smoothColor[0] / smoothColorWeight,
        smoothColor[1] / smoothColorWeight,
        smoothColor[2] / smoothColorWeight,
      ];
    }
  } else if (feature === "distance_to_edge") {
    const mx = 0.5 * (nearestPoint[0] + secondPoint[0]);
    const my = 0.5 * (nearestPoint[1] + secondPoint[1]);
    const mz = 0.5 * (nearestPoint[2] + secondPoint[2]);
    const mw = 0.5 * (nearestPoint[3] + secondPoint[3]);
    const vx = secondPoint[0] - nearestPoint[0];
    const vy = secondPoint[1] - nearestPoint[1];
    const vz = secondPoint[2] - nearestPoint[2];
    const vw = secondPoint[3] - nearestPoint[3];
    const len = Math.sqrt(vx * vx + vy * vy + vz * vz + vw * vw);
    if (len > 1e-6) {
      const px = mx - x;
      const py = dimensions === "1D" ? 0 : my - y;
      const pz = dimensions === "1D" || dimensions === "2D" ? 0 : mz - z;
      const pw = dimensions === "4D" ? mw - w : 0;
      outDist = Math.abs((px * vx + py * vy + pz * vz + pw * vw) / len);
    } else {
      outDist = 0;
    }
  } else if (feature === "n_sphere_radius") {
    const vx = secondPoint[0] - nearestPoint[0];
    const vy = secondPoint[1] - nearestPoint[1];
    const vz = secondPoint[2] - nearestPoint[2];
    const vw = secondPoint[3] - nearestPoint[3];
    radius = 0.5 * Math.sqrt(vx * vx + vy * vy + vz * vz + vw * vw);
    outDist = radius;
  }

  return {
    distance: clamp01(outDist),
    color,
    position: [nearestPoint[0], nearestPoint[1], nearestPoint[2]],
    w: nearestPoint[3],
    radius: clamp01(radius),
  };
}

export function evaluateVoronoiSample(
  params: VoronoiTextureParams,
  coord: [number, number, number],
): VoronoiSampleResult {
  const safeScale = Math.abs(params.scale) < 1e-5 ? 1e-5 : params.scale;
  const x = coord[0] * safeScale;
  const y = coord[1] * safeScale;
  const z = coord[2] * safeScale;
  const w = params.w * safeScale;

  const detail = Math.max(0, Math.min(15, params.detail));
  if (detail <= 1e-4 || params.feature === "n_sphere_radius") {
    const res = evalSingleVoronoi(
      params.dimensions,
      params.feature,
      params.distanceMetric,
      x,
      y,
      z,
      w,
      params.smoothness,
      params.exponent,
      params.randomness,
      19,
    );
    return {
      ...res,
      position: [
        res.position[0] / safeScale,
        res.position[1] / safeScale,
        res.position[2] / safeScale,
      ],
      w: res.w / safeScale,
    };
  }

  const octaves = Math.floor(detail);
  const remainder = detail - octaves;
  const roughness = Math.max(0, Math.min(1, params.roughness));
  const lacunarity = Math.max(0.01, params.lacunarity);

  let freq = 1;
  let amp = 1;
  let maxAmp = 0;
  let distSum = 0;
  let colorSum: [number, number, number] = [0, 0, 0];
  let baseRes: VoronoiSampleResult | null = null;

  for (let i = 0; i <= octaves; i += 1) {
    const sample = evalSingleVoronoi(
      params.dimensions,
      params.feature,
      params.distanceMetric,
      x * freq,
      y * freq,
      z * freq,
      w * freq,
      params.smoothness,
      params.exponent,
      params.randomness,
      19 + i * 47,
    );
    if (i === 0) baseRes = sample;
    distSum += sample.distance * amp;
    colorSum[0] += sample.color[0] * amp;
    colorSum[1] += sample.color[1] * amp;
    colorSum[2] += sample.color[2] * amp;
    maxAmp += amp;
    freq *= lacunarity;
    amp *= roughness;
  }

  if (remainder > 1e-4 && octaves < 15) {
    const sample = evalSingleVoronoi(
      params.dimensions,
      params.feature,
      params.distanceMetric,
      x * freq,
      y * freq,
      z * freq,
      w * freq,
      params.smoothness,
      params.exponent,
      params.randomness,
      19 + (octaves + 1) * 47,
    );
    const remAmp = amp * remainder;
    distSum += sample.distance * remAmp;
    colorSum[0] += sample.color[0] * remAmp;
    colorSum[1] += sample.color[1] * remAmp;
    colorSum[2] += sample.color[2] * remAmp;
    maxAmp += remAmp;
  }

  const denom = maxAmp > 0 ? maxAmp : 1;
  return {
    distance: clamp01(params.normalize ? distSum / denom : distSum),
    color: [
      clamp01(colorSum[0] / denom),
      clamp01(colorSum[1] / denom),
      clamp01(colorSum[2] / denom),
    ],
    position: baseRes
      ? [
          baseRes.position[0] / safeScale,
          baseRes.position[1] / safeScale,
          baseRes.position[2] / safeScale,
        ]
      : [0, 0, 0],
    w: baseRes ? baseRes.w / safeScale : 0,
    radius: baseRes?.radius ?? 0,
  };
}

// Pure-TypeScript CRC32 + Adler32 + uncompressed PNG fallback so procedural textures
// produce real image/png data URLs both in browser and headless test environments.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i += 1) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  const MOD = 65521;
  for (let i = 0; i < bytes.length; i += 1) {
    a = (a + bytes[i]) % MOD;
    b = (b + a) % MOD;
  }
  return ((b << 16) | a) >>> 0;
}

function writeUint32BE(buf: Uint8Array, offset: number, val: number): void {
  buf[offset] = (val >>> 24) & 0xff;
  buf[offset + 1] = (val >>> 16) & 0xff;
  buf[offset + 2] = (val >>> 8) & 0xff;
  buf[offset + 3] = val & 0xff;
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  writeUint32BE(chunk, 0, data.length);
  chunk[4] = type.charCodeAt(0);
  chunk[5] = type.charCodeAt(1);
  chunk[6] = type.charCodeAt(2);
  chunk[7] = type.charCodeAt(3);
  chunk.set(data, 8);
  const crc = crc32(chunk, 4, 8 + data.length);
  writeUint32BE(chunk, 8 + data.length, crc);
  return chunk;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  if (typeof btoa === "function") {
    return btoa(binary);
  }
  return Buffer.from(bytes).toString("base64");
}

export function rgbaToPngDataUrl(
  width: number,
  height: number,
  rgba: Uint8ClampedArray,
): string {
  if (typeof document !== "undefined") {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const imageData = ctx.createImageData(width, height);
        imageData.data.set(rgba);
        ctx.putImageData(imageData, 0, 0);
        const url = canvas.toDataURL("image/png");
        if (url.startsWith("data:image/png;base64,")) {
          return url;
        }
      }
    } catch {
      // Fallback to pure-TS PNG encoder below
    }
  }

  const rowStride = width * 4 + 1;
  const raw = new Uint8Array(rowStride * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * rowStride;
    raw[rowStart] = 0; // filter: None
    const srcStart = y * width * 4;
    raw.set(rgba.subarray(srcStart, srcStart + width * 4), rowStart + 1);
  }

  const maxBlock = 65535;
  const blockCount = Math.max(1, Math.ceil(raw.length / maxBlock));
  const zlib = new Uint8Array(2 + blockCount * 5 + raw.length + 4);
  zlib[0] = 0x78;
  zlib[1] = 0x01;
  let zOffset = 2;
  for (let i = 0; i < blockCount; i += 1) {
    const start = i * maxBlock;
    const end = Math.min(raw.length, start + maxBlock);
    const len = end - start;
    const isFinal = i === blockCount - 1 ? 1 : 0;
    zlib[zOffset++] = isFinal;
    zlib[zOffset++] = len & 0xff;
    zlib[zOffset++] = (len >>> 8) & 0xff;
    const nlen = (~len) & 0xffff;
    zlib[zOffset++] = nlen & 0xff;
    zlib[zOffset++] = (nlen >>> 8) & 0xff;
    zlib.set(raw.subarray(start, end), zOffset);
    zOffset += len;
  }
  writeUint32BE(zlib, zOffset, adler32(raw));

  const ihdr = new Uint8Array(13);
  writeUint32BE(ihdr, 0, width);
  writeUint32BE(ihdr, 4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrChunk = makeChunk("IHDR", ihdr);
  const idatChunk = makeChunk("IDAT", zlib);
  const iendChunk = makeChunk("IEND", new Uint8Array(0));

  const png = new Uint8Array(
    sig.length + ihdrChunk.length + idatChunk.length + iendChunk.length,
  );
  let offset = 0;
  png.set(sig, offset);
  offset += sig.length;
  png.set(ihdrChunk, offset);
  offset += ihdrChunk.length;
  png.set(idatChunk, offset);
  offset += idatChunk.length;
  png.set(iendChunk, offset);

  return `data:image/png;base64,${uint8ToBase64(png)}`;
}
