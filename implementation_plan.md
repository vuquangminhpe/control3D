# 3D Action Game Editor & Level Builder — Implementation Plan

We propose extending the 3D Action Game with a multi-tab system: **Play Game**, **All Maps**, **Map Editor (Level Builder)**, and **Asset Manager (uploader supporting GLBs and FBX ZIP packages)**.

---

## User Review Required

> [!IMPORTANT]
> **Draco & Zip Dependencies**: We will install `adm-zip` on the server to handle unzipping character packages. FBX models and animations will be extracted directly to the public directory so the client can load them dynamically via Drei's `useFBX`.
>
> **Dynamic Assets**: The player character, zombies, and patrol robot NPCs will no longer be hardcoded. The game engine will load them based on the selected asset package and level configuration.

---

## Proposed Changes

We will organize the changes across the following components:

### 1. Database Schema Extensions

#### [MODIFY] [sqlite-store.ts](file:///d:/control3D/apps/web/lib/sqlite-store.ts)
*   **Table Creation**: Add a `levels` table in `initializeDb`:
    ```sql
    CREATE TABLE IF NOT EXISTS levels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      map_model_id TEXT NOT NULL,
      spawns_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    ```
*   **Database Methods**: Implement:
    *   `listLevels()`: Returns all saved custom levels.
    *   `getLevelById(id)`: Returns level details.
    *   `createLevel(name, mapModelId, spawns)`: Inserts a new level config.
    *   `deleteLevel(id)`: Deletes a level.
*   **Model Extensions**: Support mapping characters and listing custom packages.

---

### 2. API Routes

#### [NEW] [route.ts (api/levels)](file:///d:/control3D/apps/web/app/api/levels/route.ts)
*   `GET`: Fetch all saved levels.
*   `POST`: Save a new level configuration (mapModelId, spawn points, name).

#### [NEW] [route.ts (api/levels/[id])](file:///d:/control3D/apps/web/app/api/levels/[id]/route.ts)
*   `DELETE`: Delete a level configuration by ID.

#### [NEW] [route.ts (api/models/upload-zip)](file:///d:/control3D/apps/web/app/api/models/upload-zip/route.ts)
*   `POST`: Receives a `.zip` file of FBX assets, extracts it to `public/uploads/characters/[id]`, searches the extracted files for `.fbx` paths, and registers it in the models database, returning the list of FBX files to let the user choose the main character mesh.

---

### 3. Editor & Level Builder Components

#### [NEW] [MapEditor.tsx](file:///d:/control3D/apps/web/components/game/MapEditor.tsx)
*   An interactive 3D level editor scene using `@react-three/fiber` and `@react-three/rapier`.
*   Displays the selected base map model (Draco-compressed GLB).
*   Allows placing:
    *   Player spawn point.
    *   Robot NPC spawn point.
    *   Multiple zombie spawn points (adds markers when clicking on the terrain).
*   **Marker Manipulation**: Drag and position markers along the 3D terrain grid.
*   **Save Controls**: Input level name and save to the backend.

#### [NEW] [AssetManager.tsx](file:///d:/control3D/apps/web/components/game/AssetManager.tsx)
*   An interface showing:
    *   **Case A (Single GLB)**: Draco-compressed upload form.
    *   **Case B (Zip Package)**: Upload form for multiple FBX animations zipped together. Prompts the user to specify which FBX is the character model (e.g. `Paladin J Nordstrom.fbx`), processes the files on the server, and lists them.
*   List of all uploaded base maps and characters.

#### [NEW] [AllMaps.tsx](file:///d:/control3D/apps/web/components/game/AllMaps.tsx)
*   Lists all levels (default pre-set level and custom user-saved levels).
*   Allows selecting a level to play, showing spawn statistics (e.g., number of zombies, map size), and deleting custom levels.

---

### 4. Game Engine Refactoring

#### [MODIFY] [gameStore.ts](file:///d:/control3D/apps/web/store/gameStore.ts)
*   Add state variables:
    *   `activeLevelId`: current level selected.
    *   `selectedMapModelUrl`: URL of the GLB map file for the active level.
    *   `playerSpawn`: `[x, y, z]` coordinates.
    *   `robotSpawn`: `[x, y, z]` coordinates.
    *   `zombieSpawns`: list of zombie spawn coordinates and types.
    *   `selectedCharacterPackage`: metadata of the active character (main FBX path and action FBX mappings).
*   Add store actions to set active level, update editor spawn positions, and configure custom character skins.

#### [MODIFY] [Player.tsx](file:///d:/control3D/apps/web/components/game/Player.tsx)
*   Spawn at the level's `playerSpawn` coordinate.
*   Dynamically pass the selected character package paths (FBX paths) to the character loader.

#### [MODIFY] [PatrolRobot.tsx](file:///d:/control3D/apps/web/components/game/PatrolRobot.tsx)
*   Spawn at the level's `robotSpawn` coordinate.

#### [MODIFY] [GameCanvas.tsx](file:///d:/control3D/apps/web/components/game/GameCanvas.tsx)
*   Load the active level's map GLB and spawn zombies dynamically at the level's custom zombie spawn coordinates.

#### [MODIFY] [page.tsx](file:///d:/control3D/apps/web/app/page.tsx)
*   Add a multi-tab header: `Play Game`, `All Maps`, `Map Editor`, `Asset Manager`.
*   Render the corresponding interface based on the active tab.

---

## Verification Plan

### Automated Tests
*   Run `yarn workspace web typecheck` to verify TypeScript compilation.
*   Run `yarn workspace web build` to verify Next.js build compilation.

### Manual Verification
1.  **Asset Manager**: Upload a `.glb` map and a `.zip` file of FBX animations. Select the main FBX in the ZIP.
2.  **Map Editor**: Select the uploaded GLB map, place spawn points, duplicate/place zombies, and click "Save".
3.  **All Maps**: Select the saved level and load it.
4.  **Play Game**: Verify the character spawns at the custom coordinates, zombies are placed correctly, and combat operates correctly.
