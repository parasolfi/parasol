<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    intensity?: number
    scale?: number
    speed?: number
  }>(),
  { intensity: 1, scale: 1, speed: 1 },
)

const PALETTE = ['#0d2447', '#1d4f7a', '#3aa9b6', '#7bd9b8', '#c6f4cf']
const RING_RADIUS = 0.32
const NOISE_SCALE = 0.8
const WARP = 0.24
const FALLOFF = 1.75
const SATURATION = 1.22
const GRAIN = 0.068
const FLOW_SPEED = 0.06
const MAX_PIXEL_RATIO = 1.6

const canvas = ref<HTMLCanvasElement | null>(null)
const live = ref(false)

const VERTEX_SHADER = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

const FRAGMENT_SHADER = `
precision highp float;

#define POINTS 5

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_scale;
uniform float u_intensity;
uniform vec3 u_colors[POINTS];
uniform vec2 u_points[POINTS];

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float grain(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  uv /= u_scale;

  float flow = u_time * ${FLOW_SPEED};
  vec2 warped = uv + ${WARP} * vec2(
    snoise(uv * ${NOISE_SCALE} + vec2(0.0, flow)),
    snoise(uv * ${NOISE_SCALE} * 1.7 + vec2(4.2, -flow * 0.8))
  );

  vec3 accumulated = vec3(0.0);
  float weightSum = 0.0;
  for (int i = 0; i < POINTS; i++) {
    vec2 delta = warped - u_points[i];
    float squaredDistance = dot(delta, delta) + 0.0025;
    float weight = 1.0 / pow(squaredDistance, ${FALLOFF});
    accumulated += u_colors[i] * weight;
    weightSum += weight;
  }
  vec3 color = accumulated / weightSum;

  float falloff = smoothstep(1.05, 0.12, length(uv));
  color = pow(max(color, 0.0), vec3(1.0 / 2.2));
  color = mix(vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))), color, ${SATURATION});
  color += (grain(gl_FragCoord.xy + u_time) - 0.5) * ${GRAIN};

  gl_FragColor = vec4(color, falloff * u_intensity);
}
`

function toLinearRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) =>
    Math.pow(channel / 255, 2.2),
  ) as [number, number, number]
}

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

onMounted(() => {
  const element = canvas.value
  if (!element) return

  const gl = element.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
    depth: false,
    powerPreference: 'low-power',
  })
  if (!gl) return

  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  if (!vertex || !fragment) return

  const program = gl.createProgram()!
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return
  gl.useProgram(program)

  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, 'a_position')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

  const uniforms = {
    resolution: gl.getUniformLocation(program, 'u_resolution'),
    time: gl.getUniformLocation(program, 'u_time'),
    scale: gl.getUniformLocation(program, 'u_scale'),
    intensity: gl.getUniformLocation(program, 'u_intensity'),
    points: gl.getUniformLocation(program, 'u_points'),
  }

  gl.uniform3fv(
    gl.getUniformLocation(program, 'u_colors'),
    new Float32Array(PALETTE.flatMap(toLinearRgb)),
  )
  gl.uniform1f(uniforms.scale, props.scale)
  gl.uniform1f(uniforms.intensity, props.intensity)

  const orbits = new Float32Array(PALETTE.length * 2)
  const writeOrbits = (seconds: number) => {
    for (let i = 0; i < PALETTE.length; i++) {
      const base = (i / PALETTE.length) * Math.PI * 2
      const angle = base + seconds * 0.11 + 0.28 * Math.sin(seconds * 0.6 + i * 1.7)
      const radius = RING_RADIUS * (1 + 0.2 * Math.sin(seconds * 0.83 + i * 2.3))
      orbits[i * 2] = Math.cos(angle) * radius
      orbits[i * 2 + 1] = Math.sin(angle) * radius
    }
    gl.uniform2fv(uniforms.points, orbits)
  }

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
    const width = Math.round(element.clientWidth * ratio)
    const height = Math.round(element.clientHeight * ratio)
    if (element.width === width && element.height === height) return
    element.width = width
    element.height = height
    gl.viewport(0, 0, width, height)
    gl.uniform2f(uniforms.resolution, width, height)
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  let frame = 0
  let visible = true
  let elapsed = 0
  let lastFrame = 0

  const draw = (seconds: number) => {
    resize()
    writeOrbits(seconds)
    gl.uniform1f(uniforms.time, seconds)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  const loop = (now: number) => {
    elapsed += Math.min((now - lastFrame) / 1000, 0.05) * props.speed
    lastFrame = now
    draw(elapsed)
    frame = requestAnimationFrame(loop)
  }

  const play = () => {
    if (frame || reducedMotion.matches) return
    lastFrame = performance.now()
    frame = requestAnimationFrame(loop)
  }
  const pause = () => {
    cancelAnimationFrame(frame)
    frame = 0
  }

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true
    visible && !document.hidden ? play() : pause()
  })
  observer.observe(element)

  const onVisibility = () => (document.hidden || !visible ? pause() : play())
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('resize', resize)

  draw(0)
  live.value = true
  if (!reducedMotion.matches) play()

  onBeforeUnmount(() => {
    pause()
    observer.disconnect()
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('resize', resize)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  })
})
</script>

<template>
  <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
    <div
      class="absolute inset-0 transition-opacity duration-1000"
      :class="live ? 'opacity-0' : 'opacity-100'"
      :style="{
        background:
          'radial-gradient(60% 55% at 50% 45%, #c6f4cf 0%, #7bd9b8 18%, #3aa9b6 36%, #1d4f7a 58%, #0d2447 76%, transparent 100%)',
      }"
    />
    <canvas
      ref="canvas"
      class="size-full transition-opacity duration-1000"
      :class="live ? 'opacity-100' : 'opacity-0'"
    />
  </div>
</template>
