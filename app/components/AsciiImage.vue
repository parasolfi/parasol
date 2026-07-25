<script setup lang="ts">
type PostFx = {
  scanlineIntensity: number
  scanlineCount: number
  vignetteIntensity: number
  vignetteRadius: number
  colorPalette: number
  curvature: number
  aberrationStrength: number
  brightnessAdjust: number
  contrastAdjust: number
}

const props = withDefaults(
  defineProps<{
    src: string
    cellSize?: number
    invert?: boolean
    color?: boolean
    background?: [number, number, number]
    postfx?: Partial<PostFx>
  }>(),
  { cellSize: 15, invert: false, color: true, background: () => [1, 1, 1] },
)

const DEFAULT_POSTFX: PostFx = {
  scanlineIntensity: 0,
  scanlineCount: 200,
  vignetteIntensity: 0,
  vignetteRadius: 0.8,
  colorPalette: 0,
  curvature: 0,
  aberrationStrength: 0,
  brightnessAdjust: 0,
  contrastAdjust: 1,
}

const MAX_PIXEL_RATIO = 1.5

const canvas = ref<HTMLCanvasElement | null>(null)
const live = ref(false)

const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

const FRAGMENT_SHADER = `
precision highp float;

varying vec2 v_uv;

uniform sampler2D inputBuffer;
uniform float cellSize;
uniform bool invert;
uniform bool colorMode;
uniform vec3 backgroundColor;
uniform vec2 resolution;
uniform vec2 coverRatio;
uniform float scanlineIntensity;
uniform float scanlineCount;
uniform float vignetteIntensity;
uniform float vignetteRadius;
uniform int colorPalette;
uniform float curvature;
uniform float aberrationStrength;
uniform float brightnessAdjust;
uniform float contrastAdjust;

vec3 applyColorPalette(vec3 color, int palette) {
  float lum = dot(color, vec3(0.299, 0.587, 0.114));
  if (palette == 1) return vec3(0.1, lum * 0.9, 0.1);
  if (palette == 2) return vec3(lum, lum * 0.6, lum * 0.2);
  if (palette == 3) return vec3(0.0, lum * 0.8, lum);
  if (palette == 4) return vec3(0.1, 0.2, lum);
  return color;
}

vec3 parasolRamp(float t) {
  vec3 deep = vec3(0.051, 0.141, 0.278);
  vec3 ocean = vec3(0.114, 0.310, 0.478);
  vec3 teal = vec3(0.229, 0.663, 0.714);
  vec3 mint = vec3(0.482, 0.851, 0.722);
  vec3 pale = vec3(0.776, 0.957, 0.812);
  if (t < 0.35) return mix(deep, ocean, t / 0.35);
  if (t < 0.6) return mix(ocean, teal, (t - 0.35) / 0.25);
  if (t < 0.8) return mix(teal, mint, (t - 0.6) / 0.2);
  return mix(mint, pale, (t - 0.8) / 0.2);
}

float bar(vec2 p, vec2 axis, float weight, float span) {
  float along = dot(p, axis);
  float across = dot(p, vec2(-axis.y, axis.x));
  return step(abs(across), weight) * step(abs(along), span);
}

float getChar(float brightness, vec2 cell) {
  vec2 p = cell - 0.5;
  float weight = 0.085;
  float span = 0.32;
  float dotRadius = 0.075;

  if (brightness < 0.16) return 0.0;

  if (brightness < 0.32) return step(length(p), dotRadius);

  if (brightness < 0.46) {
    return max(
      step(length(p - vec2(0.0, 0.15)), dotRadius),
      step(length(p + vec2(0.0, 0.15)), dotRadius)
    );
  }

  if (brightness < 0.6) return bar(p, vec2(1.0, 0.0), weight, span);

  float vertical = bar(p, vec2(0.0, 1.0), weight, span);
  float horizontal = bar(p, vec2(1.0, 0.0), weight, span);

  if (brightness < 0.74) return max(vertical, horizontal);

  if (brightness < 0.87) {
    float diagonal = bar(p, vec2(0.7071, 0.7071), weight, span);
    float antidiagonal = bar(p, vec2(0.7071, -0.7071), weight, span);
    return max(max(vertical, horizontal), max(diagonal, antidiagonal));
  }

  float doubleVertical = step(abs(abs(p.x) - 0.13), weight * 0.85) * step(abs(p.y), span);
  float doubleHorizontal = step(abs(abs(p.y) - 0.13), weight * 0.85) * step(abs(p.x), span);
  return max(doubleVertical, doubleHorizontal);
}

vec2 toCover(vec2 uv) {
  return (uv - 0.5) * coverRatio + 0.5;
}

void main() {
  vec2 uv = v_uv;
  vec2 workUV = uv;

  if (curvature > 0.0) {
    vec2 centered = workUV * 2.0 - 1.0;
    centered *= 1.0 + curvature * dot(centered, centered);
    workUV = centered * 0.5 + 0.5;
    if (workUV.x < 0.0 || workUV.x > 1.0 || workUV.y < 0.0 || workUV.y > 1.0) {
      gl_FragColor = vec4(backgroundColor, 1.0);
      return;
    }
  }

  vec2 cellCount = resolution / cellSize;
  vec2 cellUV = (floor(workUV * cellCount) + 0.5) / cellCount;
  vec2 sampleUV = toCover(cellUV);

  vec4 cellColor;
  if (aberrationStrength > 0.0) {
    float r = texture2D(inputBuffer, sampleUV + vec2(aberrationStrength, 0.0)).r;
    float g = texture2D(inputBuffer, sampleUV).g;
    float b = texture2D(inputBuffer, sampleUV - vec2(aberrationStrength, 0.0)).b;
    cellColor = vec4(r, g, b, 1.0);
  } else {
    cellColor = texture2D(inputBuffer, sampleUV);
  }

  cellColor.rgb = (cellColor.rgb - 0.5) * contrastAdjust + 0.5 + brightnessAdjust;

  float brightness = dot(clamp(cellColor.rgb, 0.0, 1.0), vec3(0.299, 0.587, 0.114));
  if (invert) brightness = 1.0 - brightness;

  float charValue = getChar(brightness, fract(workUV * cellCount));

  vec3 glyphColor = colorPalette == 5
    ? parasolRamp(1.0 - brightness)
    : applyColorPalette(colorMode ? cellColor.rgb : vec3(brightness), colorPalette);

  vec3 finalColor = mix(backgroundColor, glyphColor, charValue);

  if (scanlineIntensity > 0.0) {
    float scanline = sin(uv.y * scanlineCount * 3.14159) * 0.5 + 0.5;
    finalColor *= 1.0 - (scanline * scanlineIntensity);
  }

  if (vignetteIntensity > 0.0) {
    vec2 centered = uv * 2.0 - 1.0;
    float vignette = 1.0 - dot(centered, centered) / vignetteRadius;
    finalColor = mix(finalColor, backgroundColor, (1.0 - clamp(vignette, 0.0, 1.0)) * vignetteIntensity);
  }

  gl_FragColor = vec4(max(finalColor, 0.0), 1.0);
}
`

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

  const gl = element.getContext('webgl', { alpha: false, antialias: false, depth: false })
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

  const uniform = (name: string) => gl.getUniformLocation(program, name)
  const resolutionUniform = uniform('resolution')
  const coverUniform = uniform('coverRatio')

  gl.uniform1i(uniform('inputBuffer'), 0)
  gl.uniform1f(uniform('cellSize'), props.cellSize)
  gl.uniform1i(uniform('invert'), props.invert ? 1 : 0)
  gl.uniform1i(uniform('colorMode'), props.color ? 1 : 0)
  gl.uniform3fv(uniform('backgroundColor'), props.background)

  const postfx = { ...DEFAULT_POSTFX, ...props.postfx }
  for (const [name, value] of Object.entries(postfx)) {
    const location = uniform(name)
    if (!location) continue
    name === 'colorPalette' ? gl.uniform1i(location, value) : gl.uniform1f(location, value)
  }

  const image = new Image()
  let imageAspect = 1

  const draw = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
    const width = Math.round(element.clientWidth * ratio)
    const height = Math.round(element.clientHeight * ratio)
    if (!width || !height) return

    element.width = width
    element.height = height
    gl.viewport(0, 0, width, height)
    gl.uniform2f(resolutionUniform, element.clientWidth, element.clientHeight)

    const canvasAspect = element.clientWidth / element.clientHeight
    gl.uniform2f(
      coverUniform,
      Math.min(canvasAspect / imageAspect, 1),
      Math.min(imageAspect / canvasAspect, 1),
    )

    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  image.onload = () => {
    imageAspect = image.naturalWidth / image.naturalHeight
    const texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image)
    draw()
    live.value = true
  }
  image.src = props.src

  let resizeFrame = 0
  const onResize = () => {
    cancelAnimationFrame(resizeFrame)
    resizeFrame = requestAnimationFrame(draw)
  }
  window.addEventListener('resize', onResize)

  onBeforeUnmount(() => {
    cancelAnimationFrame(resizeFrame)
    window.removeEventListener('resize', onResize)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  })
})
</script>

<template>
  <div class="pointer-events-none absolute inset-0 overflow-hidden bg-canvas" aria-hidden="true">
    <canvas
      ref="canvas"
      class="size-full transition-opacity duration-1000"
      :class="live ? 'opacity-100' : 'opacity-0'"
    />
  </div>
</template>
