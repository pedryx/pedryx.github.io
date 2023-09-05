const lygiaLib = `
    // This shader uses functions from lygia library (https://github.com/patriciogonzalezvivo/lygia)

    // Original source: https://github.com/patriciogonzalezvivo/lygia/blob/main/math/mod289.glsl
    vec2 mod289(const in vec2 x) { return x - floor(x * (1. / 289.)) * 289.; }
    // Original source: https://github.com/patriciogonzalezvivo/lygia/blob/main/math/mod289.glsl
    vec3 mod289(const in vec3 x) { return x - floor(x * (1. / 289.)) * 289.; }
    // Original source: https://github.com/patriciogonzalezvivo/lygia/blob/main/math/permute.glsl
    vec3 permute(const in vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

    // Original source: https://github.com/patriciogonzalezvivo/lygia/blob/main/generative/snoise.glsl
    float snoise(in vec2 v) {
        const vec4 C = vec4(0.211324865405187,  // (3.0-sqrt(3.0))/6.0
                            0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)
                            -0.577350269189626,  // -1.0 + 2.0 * C.x
                            0.024390243902439); // 1.0 / 41.0
        // First corner
        vec2 i  = floor(v + dot(v, C.yy) );
        vec2 x0 = v -   i + dot(i, C.xx);
    
        // Other corners
        vec2 i1;
        //i1.x = step( x0.y, x0.x ); // x0.x > x0.y ? 1.0 : 0.0
        //i1.y = 1.0 - i1.x;
        i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        // x0 = x0 - 0.0 + 0.0 * C.xx ;
        // x1 = x0 - i1 + 1.0 * C.xx ;
        // x2 = x0 - 1.0 + 2.0 * C.xx ;
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
    
        // Permutations
        i = mod289(i); // Avoid truncation effects in permutation
        vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
        + i.x + vec3(0.0, i1.x, 1.0 ));
    
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
        m = m*m ;
        m = m*m ;
    
        // Gradients: 41 points uniformly over a line, mapped onto a diamond.
        // The ring size 17*17 = 289 is close to a multiple of 41 (41*7 = 287)
    
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
    
        // Normalise gradients implicitly by scaling m
        // Approximation of: m *= inversesqrt( a0*a0 + h*h );
        m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    
        // Compute final noise value at P
        vec3 g;
        g.x  = a0.x  * x0.x  + h.x  * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
    }
`;

const vertexShaderSource = `#version 300 es
    in vec2 position;

    void main() {
        gl_Position = vec4(position, 0.0, 1.0);
    }
`;

const fragmentShaderSource =  `#version 300 es
    precision lowp float;
` + lygiaLib + `
    out vec4 fragColor;

    struct Octave {
        float frequency;
        float weight;
    };

    struct Terrain {
        float height;
        vec3 color;
    };

    const float speed = 0.03;
    const float scale = 180.0;

    const Octave octaves[5] = Octave[](
        Octave( 1.0, 0.50),
        Octave( 2.0, 0.30),
        Octave( 4.0, 0.20),
        Octave( 8.0, 0.10),
        Octave(16.0, 0.05)
    );

    const Terrain terrains[6] = Terrain[](
        Terrain(0.34, vec3(0.235, 0.482, 0.619)),
        Terrain(0.36, vec3(0.882, 0.788, 0.549)),
        Terrain(0.47, vec3(0.376, 0.675, 0.314)),
        Terrain(0.66, vec3(0.188, 0.431, 0.098)),
        Terrain(0.76, vec3(0.455, 0.455, 0.455)),
        Terrain(1.00, vec3(0.878, 0.878, 0.878))
    );

    uniform vec2 resolution;
    uniform float time;

    float calcNoise(vec2 pos) {
        float value = 0.0;
        float sum = 0.0;

        for (int i = 0; i < octaves.length(); i++) {
            Octave octave = octaves[i];

            value += octave.weight * snoise((pos / scale) * octave.frequency);
            sum += octave.weight;
        }

        return (value + sum) / (2.0 * sum);
    }

    vec3 getTerrainColor(float height) {
        for (int i = 0; i < terrains.length() - 1; i++) {
            Terrain terrain = terrains[i];

            if (height < terrain.height) {
                return terrain.color;
            }
        }

        Terrain terrain = terrains[terrains.length() - 1];
        return terrain.color;
    }

    void main() {
        vec2 pos = gl_FragCoord.xy;

        pos.x += time * speed;
        pos *= normalize(resolution);

        float height = calcNoise(pos);
        vec3 color = getTerrainColor(height);

        fragColor = vec4(color * 0.3, 1.0);
    }
`;

let targetFPS = 30;
let lastFrameTime = 0;

let gl;
let time;
let resolution;
let canvas;

window.onload = function() {
    canvas = document.getElementById("glCanvas");
    gl = canvas.getContext("webgl2");

    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) && (window.innerWidth < window.innerHeight) ){
        targetFPS = 15;
        canvas.width = 512;
        canvas.height = 512;
    }

    const shaderProgram = createProgram(gl, vertexShaderSource, fragmentShaderSource);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.useProgram(shaderProgram);

    const position = gl.getAttribLocation(shaderProgram, "position");
    resolution = gl.getUniformLocation(shaderProgram, "resolution");
    time = gl.getUniformLocation(shaderProgram, "time");

    const vertices = [-1.0, 1.0, -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0, 1.0, -1.0];
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(position);

    requestAnimationFrame(render);
};

function render(elapsedTime) {
    gl.clear(gl.COLOR_BUFFER_BIT);

    const bounds = canvas.getBoundingClientRect();
    gl.uniform2f(resolution, bounds.width, bounds.height);

    const totalMiliseconds = getTodayMiliseconds();
    gl.uniform1f(time, totalMiliseconds);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    const deltaTime = elapsedTime - lastFrameTime;
    lastFrameTime = elapsedTime;

    const sleepTime = Math.max((1000 / targetFPS) - deltaTime, 0);
    setTimeout(() => requestAnimationFrame(render), sleepTime);
}

function getTodayMiliseconds() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const miliseconds = now.getMilliseconds();

    return hours * 60 * 60 * 1000 + minutes * 60 * 1000 + seconds * 1000 + miliseconds;
}

function createShader(gl, type, source) {
    const shader = gl.createShader(type);

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert("Shader compilation error: " + gl.getShaderInfoLog(shader));
        return;
    }

    return shader;
}

function createProgram(gl, vertexSource, shaderSource) {
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    
    const program = gl.createProgram();

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        alert("Shader linking error: " + gl.getProgramInfoLog(program));
        return;
    }

    return program;
}