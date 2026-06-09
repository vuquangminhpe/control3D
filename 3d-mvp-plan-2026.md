# 3D Object Management MVP — Complete Technical Plan (2026)

> **Stack**: Three.js r184 · WebGPU Production · Next.js 15 · React 19 · Mongo local + lưu ảnh, file,... tại local · Vercel
> **Timeline**: 4 pages · 4-week sprint · No login required

---

## 1. Context & Key Decisions

### Why Three.js r184 (April 16, 2026)

- **Very high npm adoption**: consistently among top 3D web engines by weekly downloads, broad ecosystem and hiring familiarity
- **WebGPU is production-ready across modern browsers** with robust fallback strategy for older devices
- **r171+ zero-config WebGPU**: `import { WebGPURenderer } from 'three/webgpu'` — auto fallback to WebGL 2 on older devices. Zero bundler config, zero risk
- **Performance**: 2–10× improvement over WebGL for complex scenes; 100× on compute-heavy tasks (proven at Segments.ai)
- **AI-native**: All major AI coding tools (Claude, Cursor, Copilot) default to Three.js when generating 3D code
- **Element taxonomy is extensible**: number of element types is unlimited and admin-defined

---

## 2. Full Technology Stack

### 3D Engine (core)

| Package                       | Version               | Role                                                              |
| ----------------------------- | --------------------- | ----------------------------------------------------------------- |
| `three`                       | 0.184.0 (Apr 16 2026) | Core 3D engine                                                    |
| `three/webgpu`                | included              | WebGPURenderer + auto WebGL fallback                              |
| `@react-three/fiber`          | v9 (React 19)         | React renderer for Three.js                                       |
| `@react-three/drei`           | latest                | OrbitControls, TransformControls, Environment, useGLTF, BVH, Html |
| `@react-three/postprocessing` | latest                | Bloom, SSAO, Vignette, ChromaticAberration                        |
| `draco3d`                     | latest                | DRACO mesh compression (70–90% file size reduction)               |
| `ktx2-parse`                  | latest                | KTX2 compressed texture support                                   |
| `gltfjsx`                     | v7+                   | CLI: GLTF → declarative R3F JSX components                        |

### Frontend

| Package                 | Version | Role                                             |
| ----------------------- | ------- | ------------------------------------------------ |
| `next`                  | 15.x    | App Router, Server Components, Route Handlers    |
| `react`                 | 19.x    | Concurrent features, Suspense                    |
| `typescript`            | 5.x     | End-to-end type safety                           |
| `tailwindcss`           | v4      | Utility CSS (CSS-first config in v4)             |
| `@shadcn/ui`            | latest  | Pre-built accessible UI components               |
| `zustand`               | 5.x     | Lightweight state management for 3D editor state |
| `@tanstack/react-query` | v5      | Server state, caching, optimistic updates        |
| `zod`                   | v3      | Schema validation (API + forms)                  |
| `react-dropzone`        | latest  | File upload drag & drop                          |

### Backend

| Package                                                | Role                                            |
| ------------------------------------------------------ | ----------------------------------------------- |
| Next.js Route Handlers                                 | `/api/*` endpoints (replaces separate backend)  |
| Mongo local + lưu ảnh, file,... tại local (PostgreSQL) | Primary database, RLS-ready for auth later      |
| Mongo local + lưu ảnh, file,... tại local Storage      | GLB/GLTF/OBJ file hosting (50MB free per file)  |
| Prisma ORM                                             | Type-safe DB access + migrations                |
| Sharp                                                  | Server-side thumbnail generation (WebP 512×512) |

### Infra & DevOps

| Tool           | Role                                                         |
| -------------- | ------------------------------------------------------------ |
| Vercel         | Next.js native hosting, edge functions, auto preview deploys |
| GitHub Actions | CI: lint → type check → build → deploy                       |
| pnpm           | Package manager (faster installs, workspace support)         |
| Sentry         | Error tracking in production                                 |

---

## 3. Three.js r184 — Key Features Used

### Renderer (r171–r184)

```typescript
// Zero-config WebGPU with automatic WebGL 2 fallback
import { WebGPURenderer } from 'three/webgpu'

// In R3F (react-three/fiber v9):
<Canvas gl={(canvas) => new WebGPURenderer({ canvas, antialias: true })}>
```

### New in r183–r184 (used in this MVP)

| Feature                                  | Where Used                                   |
| ---------------------------------------- | -------------------------------------------- |
| `Object3D.pivot` support                 | Editor page: pivot point for transform gizmo |
| TRAA (Temporal Rendering Anti-Aliasing)  | Detail + Edit page viewer quality            |
| Volumetric Lighting                      | Detail page environment (optional toggle)    |
| Improved `MapControls`                   | Gallery page mini-previews                   |
| WebGPU Contact Shadows                   | Detail page shadow realism                   |
| SSGI (Screen Space Global Illumination)  | Optional quality mode in detail viewer       |
| `GLTFExporter` with `WebGPUTextureUtils` | Edit page: save modified models              |
| `UltraHDRLoader`                         | Detail page: premium HDRI environments       |

### Controls (via @react-three/drei)

```typescript
import { OrbitControls, TransformControls, BVH } from '@react-three/drei'

// Viewer pages
<OrbitControls makeDefault enableDamping dampingFactor={0.05} />

// Editor page — gizmo with mode switch
<TransformControls mode="translate" | "rotate" | "scale" />

// Click-to-select in editor
<BVH> {/* wraps scene, enables fast raycasting */ } </BVH>
```

### Loaders

```typescript
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

// Setup (done once at app level)
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("/libs/draco/");

const ktx2Loader = new KTX2Loader();
ktx2Loader.setTranscoderPath("/libs/basis/");

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);
loader.setKTX2Loader(ktx2Loader);
```

---

## 4. Supported 3D Formats

| Format                          | Ext     | Loader     | Priority       |
| ------------------------------- | ------- | ---------- | -------------- |
| GL Transmission Format (binary) | `.glb`  | GLTFLoader | ⭐ Primary     |
| GL Transmission Format (JSON)   | `.gltf` | GLTFLoader | ⭐ Primary     |
| Wavefront OBJ                   | `.obj`  | OBJLoader  | Secondary      |
| Autodesk FBX                    | `.fbx`  | FBXLoader  | Secondary      |
| Stereolithography               | `.stl`  | STLLoader  | Secondary      |
| Stanford PLY                    | `.ply`  | PLYLoader  | Secondary      |
| Apple USDZ                      | `.usdz` | USDZLoader | Secondary (AR) |

**Strategy**: Accept all formats, auto-convert to GLB + DRACO on server for consistent delivery.

---

## 4A. Element Types (Unlimited, Config-Driven)

Element types are dynamic configuration data, not fixed constants.

Example keys for initial setup:

- `structural`
- `display`
- `signage`
- `furniture`
- `decoration`
- `avatar`
- `interactive`
- `npc`
- `portal`

Implementation rule: element types live in DB + admin config. Add/remove/reorder anytime without changing core app logic.

---

## 5. Four Pages — Detailed Spec

### Page 1 — Upload / Registration (`/upload`)

**Purpose**: Register a new 3D object into the system.

**Flow**:

1. User drags & drops or selects file (max 100MB)
2. File loaded in-browser via `GLTFLoader` → live 3D preview renders immediately
3. Auto-extract metadata: polygon count, vertex count, material count, bounding box, has_animations
4. Canvas snapshot taken → saved as thumbnail (512×512 WebP)
5. User fills form: Name, Description, Tags (multi-select), Category, License
6. Submit → file uploaded to Mongo local + lưu ảnh, file,... tại local Storage → DRACO compression → metadata saved to DB

**UI Components**:

- `react-dropzone` drag zone with format badges
- Three.js canvas (WebGPURenderer, OrbitControls) for live preview
- `<Progress>` bar for upload (shadcn/ui)
- Tag input with autocomplete
- License picker (CC0, CC-BY, MIT, Proprietary)
- Optional element type selector (loaded from `/api/element-types`)

**3D Preview Config**:

```typescript
// Minimal viewer for upload preview
const renderer = new WebGPURenderer({ antialias: true });
const controls = new OrbitControls(camera, renderer.domElement);
controls.autoRotate = true;
controls.autoRotateSpeed = 1.5;

// Auto-fit camera to model bounding box
const box = new THREE.Box3().setFromObject(model);
const size = box.getSize(new THREE.Vector3()).length();
camera.near = size / 100;
camera.far = size * 100;
camera.position.set(size * 0.5, size * 0.5, size * 1.5);
```

---

### Page 2 — List / Gallery (`/`)

**Purpose**: Browse all registered 3D models.

**Layout**: Masonry grid (3 cols desktop, 2 tablet, 1 mobile)

**Card contents**:

- Auto-generated thumbnail (WebP 512×512)
- Model name + category badge
- Format badge (GLB/OBJ/etc.)
- File size · Polygon count
- Download count
- Upload date (relative: "3 days ago")

**Hover effect**: Mini 3D viewer with autorotate (spawned lazily, shared WebGPU context)

**Filters & Controls**:

- Full-text search (Mongo local + lưu ảnh, file,... tại local `ilike`)
- Format filter (multi-select pills)
- Category filter (dropdown)
- Date range picker
- Sort: Newest · Most Downloaded · Name A–Z

**Pagination**: Cursor-based (Mongo local + lưu ảnh, file,... tại local `cursor`) — infinite scroll with TanStack Query `useInfiniteQuery`

---

### Page 3 — Detail (`/models/[id]`)

**Purpose**: Full 3D viewer + model information + download.

**Layout**: Split — 70% 3D viewport | 30% info panel (collapsible on mobile)

**3D Viewer Features**:

- `WebGPURenderer` with TRAA anti-aliasing
- `OrbitControls` (mouse: orbit/zoom/pan; touch: two-finger)
- `Environment` from drei (10 HDRI presets: apartment, city, dawn, forest, lobby, night, park, studio, sunset, warehouse)
- `ContactShadows` (WebGPU, r182+)
- Grid helper + axes helper (toggleable)
- Wireframe overlay toggle
- Canvas screenshot button (PNG download)

**Post-processing** (opt-in quality mode):

```typescript
import { EffectComposer, Bloom, SSAO, Vignette } from '@react-three/postprocessing'

<EffectComposer>
  <Bloom luminanceThreshold={0.9} intensity={0.3} />
  <SSAO radius={0.05} intensity={150} luminanceInfluence={0.9} />
  <Vignette offset={0.3} darkness={0.5} />
</EffectComposer>
```

**Info Panel**:

- Name, description, tags
- Category, License
- Format · File size · Uploaded date
- Polygon count · Vertex count · Material count
- Bounding box dimensions (W × H × D in meters)
- Has animations badge (if true)

**Actions**:

- Download (increments count, signed URL from Mongo local + lưu ảnh, file,... tại local Storage)
- Copy share link
- Edit (→ `/models/[id]/edit`)
- Delete (with confirmation)

---

### Page 4 — Edit (`/models/[id]/edit`)

**Purpose**: Transform, material editing, and metadata update for a 3D object.

**Layout**: 65% 3D viewport | 35% properties panel

**3D Editor Features**:

**Transform Controls**:

```typescript
import { TransformControls } from '@react-three/drei'

// Mode switch: T = translate, R = rotate, S = scale
const [mode, setMode] = useState<'translate' | 'rotate' | 'scale'>('translate')

<TransformControls
  mode={mode}
  onObjectChange={() => syncNumericsFromObject()}
/>
```

**Precision numeric inputs** (synced both ways with gizmo):

```
Position:   X [ 0.000 ]  Y [ 0.000 ]  Z [ 0.000 ]
Rotation:   X [ 0.000 ]  Y [ 0.000 ]  Z [ 0.000 ]  (degrees)
Scale:      X [ 1.000 ]  Y [ 1.000 ]  Z [ 1.000 ]
```

**Material Editor** (per-mesh, via BVH click-select):

- Color picker (hex input + color swatch)
- Metalness slider (0.0 → 1.0)
- Roughness slider (0.0 → 1.0)
- Wireframe toggle (per material)
- Double-sided toggle

**BVH Click-Select** (three-mesh-bvh via drei):

```typescript
import { BVH, useBVH } from "@react-three/drei";

// Click mesh → select → apply material edits to that mesh only
const handleClick = (e) => {
  e.stopPropagation();
  setSelectedMesh(e.object);
};
```

**Undo / Redo**: Zustand history stack (max 50 states)

**Save Flow**:

```typescript
// 1. Export modified scene to GLB
const exporter = new GLTFExporter();
const blob = await exporter.parseAsync(scene, { binary: true });

// 2. Upload new version to Mongo local + lưu ảnh, file,... tại local Storage
await Mongo local + lưu ảnh, file,... tại local.storage.from("models").upload(`${id}/v${version}.glb`, blob);

// 3. Update DB record
await fetch(`/api/models/${id}`, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ file_url: newUrl, position, rotation, scale }),
});
```

**Metadata Edit Form** (in properties panel below transform):

- Name (required)
- Description (textarea)
- Tags (multi-input)
- Category, License

---

## 6. Database Schema (Mongo local + lưu ảnh, file,... tại local PostgreSQL + Prisma)

```prisma
// schema.prisma

model Model {
  id             String   @id @default(uuid())

  // Content
  name           String
  description    String?  @db.Text
  tags           String[]
  category       Category @default(other)
  elementTypeId  String?
  elementType    ElementType? @relation(fields: [elementTypeId], references: [id], onDelete: SetNull)
  license        License  @default(CC0)

  // Files
  originalFilename String
  format           Format
  fileUrl          String
  thumbnailUrl     String?
  fileSize         BigInt   // bytes

  // 3D Metadata (auto-extracted on upload)
  polygonCount   Int?
  vertexCount    Int?
  materialCount  Int?
  hasAnimations  Boolean  @default(false)
  hasTextures    Boolean  @default(false)
  customProps    Json?    // flexible data for per-type configuration
  boundingBox    Json?    // { min: [x,y,z], max: [x,y,z], size: [w,h,d] }

  // Transform defaults
  position       Float[]  @default([0, 0, 0])
  rotation       Float[]  @default([0, 0, 0])
  scale          Float[]  @default([1, 1, 1])

  // Stats
  downloadCount  Int      @default(0)
  viewCount      Int      @default(0)

  // Relations
  versions       ModelVersion[]

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

model ElementType {
  id          String   @id @default(uuid())
  key         String   @unique // structural, display, signage, ...
  name        String
  description String?
  icon        String?
  color       String?
  sortOrder   Int      @default(0)
  isActive    Boolean  @default(true)
  schema      Json?    // JSON schema for customProps validation
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  models      Model[]
}

model ModelVersion {
  id            String   @id @default(uuid())
  modelId       String
  model         Model    @relation(fields: [modelId], references: [id], onDelete: Cascade)
  versionNumber Int
  fileUrl       String
  changeNote    String?
  createdAt     DateTime @default(now())
}

enum Category { architecture character vehicle environment prop furniture electronics other }
enum License  { CC0 CC_BY MIT proprietary }
enum Format   { glb gltf obj fbx stl ply usdz }

// Example starter keys for ElementType.key:
// structural, display, signage, furniture, decoration, avatar, interactive, npc, portal
```

---

## 7. API Routes

```
GET  /api/models                  List models (params: q, category, format, sort, cursor, limit)
POST /api/models                  Create model entry (after file upload)
GET  /api/models/[id]             Get single model + increment view_count
PUT  /api/models/[id]             Update metadata or transform defaults
DELETE /api/models/[id]           Delete model + all storage files + versions

POST /api/models/upload           Generate Mongo local + lưu ảnh, file,... tại local signed upload URL
POST /api/models/[id]/thumbnail   Receive canvas PNG → resize → store as WebP
GET  /api/models/[id]/download    Increment download_count → return signed download URL
POST /api/models/[id]/version     Save a new edited version (from editor)

GET  /api/models/stats            Global stats (total models, total downloads, formats breakdown)

GET  /api/element-types           List element types for UI forms/filters
POST /api/element-types           Create element type (admin)
PUT  /api/element-types/[id]      Update name/icon/schema/sort/is_active
```

---

## 8. File Storage Strategy

### Mongo local + lưu ảnh, file,... tại local Storage Buckets

```
models/
  {id}/
    original.{ext}        ← uploaded file (original extension)
    optimized.glb         ← DRACO compressed GLB (delivery format)
    thumbnail.webp        ← 512×512 preview
    v1.glb                ← edited versions (from editor save)
    v2.glb
```

### Mongo local + lưu ảnh, file,... tại local Storage Config

- Max upload size: 100MB
- Public bucket (no auth for read, for MVP speed)
- CDN: Mongo local + lưu ảnh, file,... tại local Storage automatically serves via global CDN
- Free tier: 1GB storage, 2GB bandwidth/month (sufficient for MVP)

### DRACO Compression (server-side, on upload)

```typescript
// Server: /api/models/upload handler
import * as draco3d from "draco3d";
// Node.js side: use gltf-pipeline for server-side DRACO compression
import { processGltf } from "gltf-pipeline";

const result = await processGltf(gltfJson, {
  dracoOptions: { compressionLevel: 7 },
});
// Reduces file size 70–90% with minimal visual loss
```

---

## 9. 3D Capabilities Checklist

### Viewer (Pages 2, 3)

- [x] GLB/GLTF load via `GLTFLoader` + `DRACOLoader`
- [x] `WebGPURenderer` with auto WebGL 2 fallback
- [x] `OrbitControls` (orbit, zoom, pan, damping)
- [x] HDRI environment lighting (10 presets via drei `Environment`)
- [x] `ContactShadows` (r182+, WebGPU)
- [x] TRAA anti-aliasing (r183+)
- [x] Wireframe toggle
- [x] Grid helper + axes helper
- [x] Responsive canvas (resize observer)
- [x] Canvas screenshot (PNG download)

### Editor (Page 4)

- [x] `TransformControls` gizmo (Translate / Rotate / Scale)
- [x] `Object3D.pivot` for pivot point control (r183+)
- [x] Numeric precision inputs (bidirectional sync with gizmo)
- [x] BVH raycasting (click-to-select mesh part)
- [x] Material editor (color, metalness, roughness, wireframe, double-sided)
- [x] Undo/redo (Zustand history, max 50 states)
- [x] Reset to original transform
- [x] `GLTFExporter` with `WebGPUTextureUtils` (save modified model)
- [x] Metadata edit form (name, description, tags, category, license)

### Post-processing (opt-in)

- [x] Bloom (`@react-three/postprocessing`)
- [x] SSAO (Screen Space Ambient Occlusion)
- [x] Vignette
- [x] SSGI (r184, Ball Pool demo pattern)

---

## 10. Project Structure

```
apps/
  web/                           ← Next.js 15 app
    app/
      page.tsx                   ← / Gallery list
      upload/page.tsx            ← /upload Registration
      models/
        [id]/
          page.tsx               ← /models/[id] Detail
          edit/page.tsx          ← /models/[id]/edit Editor
      api/
        models/
          route.ts               ← GET list, POST create
          [id]/
            route.ts             ← GET detail, PUT update, DELETE delete
            download/route.ts
            thumbnail/route.ts
            version/route.ts
          upload/route.ts
          stats/route.ts
    components/
      3d/
        Viewer.tsx               ← Shared full 3D viewer canvas
        MiniPreview.tsx          ← Lightweight card hover preview
        Editor.tsx               ← Editor with TransformControls
        ModelLoader.tsx          ← GLTFLoader + DRACOLoader setup
        EnvironmentPicker.tsx    ← HDRI preset switcher
        MaterialEditor.tsx       ← Per-mesh material controls
        PostProcessing.tsx       ← Bloom/SSAO/Vignette wrapper
      ui/                        ← shadcn/ui components
      layout/
    hooks/
      use3DModel.ts              ← Load + cache GLTF
      useEditor.ts               ← Editor state (Zustand)
      useUpload.ts               ← Upload flow + progress
    lib/
      three-setup.ts             ← WebGPURenderer factory, loaders
      Mongo local + lưu ảnh, file,... tại local.ts
      prisma.ts
    store/
      editorStore.ts             ← Zustand: transform, history, selected mesh

packages/
  db/                            ← Prisma schema + migrations
  types/                         ← Shared TypeScript types
```

---

## 11. Key Code Patterns

### WebGPURenderer in R3F

```typescript
// lib/three-setup.ts
import { WebGPURenderer } from 'three/webgpu'

export function createRenderer(canvas: HTMLCanvasElement) {
  const renderer = new WebGPURenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance'
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  return renderer
}

// In component (R3F v9):
<Canvas
  gl={createRenderer}
  camera={{ fov: 45, near: 0.01, far: 1000, position: [2, 2, 5] }}
  shadows
>
```

### Auto-fit Camera to Model

```typescript
export function fitCameraToModel(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControlsImpl,
  model: THREE.Object3D,
) {
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI / 180);
  const distance = (maxDim / (2 * Math.tan(fov / 2))) * 1.5;

  camera.near = maxDim / 100;
  camera.far = maxDim * 100;
  camera.position
    .copy(center)
    .add(new THREE.Vector3(distance, distance * 0.5, distance));
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
}
```

### Auto-extract 3D Metadata on Upload

```typescript
export function extract3DMetadata(gltf: GLTF) {
  let polygonCount = 0;
  let vertexCount = 0;
  let materialCount = 0;
  let hasAnimations = false;
  let hasTextures = false;

  gltf.scene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const geo = child.geometry;
      polygonCount +=
        (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
      vertexCount += geo.attributes.position.count;

      if (child.material instanceof THREE.Material) {
        materialCount++;
        if ((child.material as THREE.MeshStandardMaterial).map)
          hasTextures = true;
      }
    }
  });

  hasAnimations = gltf.animations.length > 0;
  const box = new THREE.Box3().setFromObject(gltf.scene);

  return {
    polygonCount: Math.round(polygonCount),
    vertexCount,
    materialCount,
    hasAnimations,
    hasTextures,
    boundingBox: {
      min: box.min.toArray(),
      max: box.max.toArray(),
      size: box.getSize(new THREE.Vector3()).toArray(),
    },
  };
}
```

### Editor State with Zustand

```typescript
// store/editorStore.ts
interface EditorState {
  selectedMesh: THREE.Mesh | null;
  history: TransformState[];
  historyIndex: number;
  mode: "translate" | "rotate" | "scale";

  setSelectedMesh: (mesh: THREE.Mesh | null) => void;
  setMode: (mode: EditorState["mode"]) => void;
  pushHistory: (state: TransformState) => void;
  undo: () => void;
  redo: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  selectedMesh: null,
  history: [],
  historyIndex: -1,
  mode: "translate",

  pushHistory: (state) =>
    set((prev) => {
      const history = prev.history.slice(0, prev.historyIndex + 1);
      return {
        history: [...history, state].slice(-50), // max 50
        historyIndex: Math.min(history.length, 49),
      };
    }),

  undo: () =>
    set((prev) => ({
      historyIndex: Math.max(0, prev.historyIndex - 1),
    })),

  redo: () =>
    set((prev) => ({
      historyIndex: Math.min(prev.history.length - 1, prev.historyIndex + 1),
    })),
}));
```

---

## 12. Performance Considerations

### Shared WebGPU Context (Gallery)

Use a single `WebGPURenderer` shared across all mini-preview cards. Render one at a time on hover using a single canvas that moves position:

```typescript
// One renderer, one canvas — move over the card being hovered
const sharedRenderer = createRenderer(sharedCanvas);
const renderQueue = useRef<HTMLElement | null>(null);
```

### GLTF Caching

```typescript
// @react-three/drei useGLTF caches by URL automatically
// Preload on hover intent (150ms delay)
const handleHoverIntent = debounce((url) => {
  useGLTF.preload(url);
}, 150);
```

### Lazy Loading

```typescript
// Route-split the editor (heaviest page)
const EditorPage = dynamic(() => import('./edit/page'), {
  loading: () => <ModelSkeleton />,
  ssr: false // Three.js requires browser environment
})
```

### Mobile Performance

- Detect mobile: `navigator.hardwareConcurrency <= 4 || /Mobi/i.test(navigator.userAgent)`
- Mobile: use `WebGLRenderer` instead of `WebGPURenderer`
- Mobile: reduce pixel ratio to 1.0
- Mobile: disable post-processing effects
- Mobile: use `InstancedMesh` for gallery previews

---

## 13. 4-Week Sprint Plan

| Week       | Focus           | Deliverables                                                                                                                                                                                                     |
| ---------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Week 1** | Foundation      | Next.js + Mongo local + lưu ảnh, file,... tại local setup, DB schema + Prisma, WebGPURenderer base, GLTFLoader + DRACOLoader integration, basic file upload to Mongo local + lưu ảnh, file,... tại local Storage |
| **Week 2** | Upload + List   | Drag & drop upload flow, auto thumbnail generation, 3D metadata extraction, gallery grid with filters & search, infinite scroll                                                                                  |
| **Week 3** | Detail + Editor | Full 3D viewer with HDRI, OrbitControls, wireframe toggle, TransformControls gizmo, material editor, BVH click-select, GLTFExporter save                                                                         |
| **Week 4** | Polish + Deploy | Post-processing FX, mobile responsive, undo/redo, version history, Vercel deploy, GitHub Actions CI, Sentry error tracking                                                                                       |

---

## 14. Future Extensions (Post-MVP)

- **Auth**: (email magic link) → user ownership of models
- **Versioning UI**: Show version history timeline in detail page
- **AR View**: USDZ export + iOS Quick Look / Android Scene Viewer
- **WebXR**: VR viewer using Three.js WebXR (`renderer.xr.enabled = true`)
- **AI Model Info**: Use compute shaders (WebGPU) to analyze mesh complexity
- **Collaboration**: Mongo local + lưu ảnh, file,... tại local Realtime → live cursor sharing in editor
- **3D Configurator**: Material/color variant system for product use cases
- **CDN Optimization**: Migrate storage to Cloudflare R2 (zero egress fees) at scale

---

## 15. References

- Three.js r184 Release: https://github.com/mrdoob/three.js/releases/tag/r184
- Three.js in 2026 — WebGPU Production: https://www.utsubo.com/blog/threejs-2026-what-changed
- @react-three/fiber v9 docs: https://r3f.docs.pmnd.rs/
- @react-three/drei: https://github.com/pmndrs/drei
- WebGPU Safari 26 support: https://webkit.org/blog/16569/webkit-features-in-safari-26-beta/
- Next.js 15 App Router: https://nextjs.org/docs
- Mongo local + lưu ảnh, file,... tại local Storage: https://Mongo local + lưu ảnh, file,... tại local.com/docs/guides/storage
- Three.js Migration Guide r183→r184: https://github.com/mrdoob/three.js/wiki/Migration-Guide#183--184
- gltfjsx CLI: https://github.com/pmndrs/gltfjsx
