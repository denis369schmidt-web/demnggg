// Bündelt die benötigten Teile von Three.js in eine einzige Datei
// (zombie/vendor/three.min.js), die als normales <script> geladen wird und
// window.THREE bereitstellt. So braucht das Spiel selbst keinen Build-Schritt.
// Neu erzeugen nach einem Three.js-Update: node scripts/build-three.mjs
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const version = JSON.parse(readFileSync(join(root, "node_modules/three/package.json"), "utf8")).version;
const names = [
  "WebGLRenderer", "Scene", "PerspectiveCamera", "Group", "Mesh", "InstancedMesh", "Object3D", "Vector3", "Matrix3", "Matrix4", "Sphere", "Color", "Fog",
  "HemisphereLight", "DirectionalLight", "SpotLight", "PointLight", "MeshLambertMaterial", "MeshBasicMaterial", "MeshPhongMaterial", "MeshDepthMaterial", "Vector2",
  "BoxGeometry", "CylinderGeometry", "IcosahedronGeometry", "CapsuleGeometry", "ConeGeometry", "TorusGeometry",
  "PlaneGeometry", "BufferGeometry", "BufferAttribute", "CanvasTexture", "SRGBColorSpace", "RepeatWrapping", "ClampToEdgeWrapping",
  "ShaderMaterial", "WebGLRenderTarget", "Camera", "LinearMipmapLinearFilter",
  "AdditiveBlending", "NormalBlending", "DoubleSide", "BackSide", "PCFShadowMap", "ACESFilmicToneMapping", "DynamicDrawUsage",
];
await build({
  stdin: {
    contents: `import { ${names.join(", ")} } from "three";\nwindow.THREE = { ${names.join(", ")}, REVISION: "${version}" };\n`,
    resolveDir: root,
  },
  bundle: true,
  minify: true,
  format: "iife",
  target: ["chrome90"],
  legalComments: "eof",
  outfile: join(root, "..", "zombie", "vendor", "three.min.js"),
  logLevel: "warning",
});
console.log(`three ${version} gebündelt`);
